import type { BinaryOp, Expr, GlobalDecl, Program, Stmt } from './ast';
import { parse } from './parser';

/**
 * Traduce un programa TelarC a C++17 real (std::thread, std::mutex, ...).
 * El resultado compila con: g++ -std=c++17 -pthread programa.cpp
 */

const PREC: Record<BinaryOp, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

const IND = '    ';

export function toCpp(source: string): string {
  return generateCpp(parse(source));
}

export function generateCpp(program: Program): string {
  const cvNeedsAny = usesWaitOnPlainMutex(program);
  const has = (k: GlobalDecl['kind']) => program.globals.some((g) => g.kind === k);
  const usesGuards = program.threads.some((t) => containsStmt(t.body, (s) => s.kind === 'guard'));

  const includes = new Set(['<cassert>', '<iostream>', '<thread>']);
  if (has('mutex') || usesGuards) includes.add('<mutex>');
  if (has('cv')) includes.add('<condition_variable>');
  if (has('promise') || has('future')) includes.add('<future>');

  const lines: string[] = [];
  lines.push('// Generado por Telar a partir de TelarC.');
  lines.push('// Compilar: g++ -std=c++17 -pthread programa.cpp -o programa');
  for (const inc of [...includes].sort()) lines.push(`#include ${inc}`);
  lines.push('');

  for (const g of program.globals) {
    switch (g.kind) {
      case 'var':
        lines.push(
          `${g.type} ${g.name.name} = ${g.init ? expr(g.init) : g.type === 'int' ? '0' : 'false'};`,
        );
        break;
      case 'mutex':
        lines.push(`std::mutex ${g.name.name};`);
        break;
      case 'cv':
        lines.push(
          cvNeedsAny
            ? `std::condition_variable_any ${g.name.name};  // _any: permite wait() directo sobre un std::mutex`
            : `std::condition_variable ${g.name.name};`,
        );
        break;
      case 'promise':
        lines.push(`std::promise<${g.valueType}> ${g.name.name};`);
        break;
      case 'future':
        lines.push(`std::future<${g.valueType}> ${g.name.name} = ${g.promise.name}.get_future();`);
        break;
    }
  }
  if (program.globals.length > 0) lines.push('');

  lines.push('int main() {');
  for (const t of program.threads) {
    lines.push(`${IND}std::thread ${t.name.name}([] {`);
    for (const s of t.body.body) stmt(s, 2, lines);
    lines.push(`${IND}});`);
  }
  lines.push('');
  for (const t of program.threads) lines.push(`${IND}${t.name.name}.join();`);

  const vars = program.globals.filter(
    (g): g is Extract<GlobalDecl, { kind: 'var' }> => g.kind === 'var',
  );
  if (program.finalAsserts.length > 0 || vars.length > 0) lines.push('');
  for (const fa of program.finalAsserts) lines.push(`${IND}assert(${expr(fa.cond)});`);
  for (const v of vars) {
    const val = v.type === 'bool' ? `std::boolalpha << ${v.name.name}` : v.name.name;
    lines.push(`${IND}std::cout << "${v.name.name} = " << ${val} << '\\n';`);
  }
  lines.push(`${IND}return 0;`);
  lines.push('}');
  return lines.join('\n') + '\n';
}

function stmt(s: Stmt, depth: number, out: string[]): void {
  const pad = IND.repeat(depth);
  switch (s.kind) {
    case 'block':
      out.push(`${pad}{`);
      for (const b of s.body) stmt(b, depth + 1, out);
      out.push(`${pad}}`);
      break;
    case 'local':
      out.push(
        `${pad}${s.type} ${s.name.name} = ${s.init ? expr(s.init) : s.type === 'int' ? '0' : 'false'};`,
      );
      break;
    case 'assign':
      if (s.sugar) out.push(`${pad}${s.target.name}${s.sugar};`);
      else out.push(`${pad}${s.target.name} ${s.op} ${expr(s.value)};`);
      break;
    case 'if':
      out.push(`${pad}if (${expr(s.cond)}) {`);
      body(s.then, depth, out);
      if (s.else) {
        out.push(`${pad}} else {`);
        body(s.else, depth, out);
      }
      out.push(`${pad}}`);
      break;
    case 'while':
      out.push(`${pad}while (${expr(s.cond)}) {`);
      body(s.body, depth, out);
      out.push(`${pad}}`);
      break;
    case 'assert':
      out.push(`${pad}assert(${expr(s.cond)});`);
      break;
    case 'guard': {
      const name = s.name?.name ?? 'guard';
      const ms = s.mutexes.map((m) => m.name).join(', ');
      if (s.guard === 'scoped_lock') out.push(`${pad}std::scoped_lock ${name}(${ms});`);
      else out.push(`${pad}std::${s.guard}<std::mutex> ${name}(${ms});`);
      break;
    }
    case 'call':
      out.push(`${pad}${s.object.name}.${s.method.name}(${s.args.map(expr).join(', ')});`);
      break;
  }
}

function body(s: Stmt, depth: number, out: string[]): void {
  if (s.kind === 'block') for (const b of s.body) stmt(b, depth + 1, out);
  else stmt(s, depth + 1, out);
}

export function expr(e: Expr, parentPrec = 0): string {
  switch (e.kind) {
    case 'int':
      return String(e.value);
    case 'bool':
      return e.value ? 'true' : 'false';
    case 'name':
      return e.name;
    case 'unary':
      return `${e.op}${expr(e.operand, 7)}`;
    case 'call':
      return `${e.object.name}.${e.method.name}(${e.args.map((a) => expr(a)).join(', ')})`;
    case 'binary': {
      const p = PREC[e.op];
      // El operando derecho usa p+1 porque los operadores son asociativos por la izquierda.
      const s = `${expr(e.left, p)} ${e.op} ${expr(e.right, p + 1)}`;
      return p < parentPrec ? `(${s})` : s;
    }
  }
}

function containsStmt(s: Stmt, pred: (s: Stmt) => boolean): boolean {
  if (pred(s)) return true;
  switch (s.kind) {
    case 'block':
      return s.body.some((b) => containsStmt(b, pred));
    case 'if':
      return containsStmt(s.then, pred) || (s.else !== null && containsStmt(s.else, pred));
    case 'while':
      return containsStmt(s.body, pred);
    default:
      return false;
  }
}

/** ¿Algún cv.wait(x) recibe un mutex directamente (en vez de un unique_lock)? */
function usesWaitOnPlainMutex(program: Program): boolean {
  const mutexes = new Set(
    program.globals.filter((g) => g.kind === 'mutex').map((g) => g.name.name),
  );
  return program.threads.some((t) =>
    containsStmt(
      t.body,
      (s) =>
        s.kind === 'call' &&
        s.method.name === 'wait' &&
        s.args[0]?.kind === 'name' &&
        mutexes.has(s.args[0].name),
    ),
  );
}
