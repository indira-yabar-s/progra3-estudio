import type { BinaryOp, Expr, Ident, Program, Stmt, Value, ValueType } from './ast';
import { TelarCError, type Bilingual, type SourceLoc } from './diagnostics';

/**
 * El compilador "baja" el AST a una lista plana de microinstrucciones por hilo.
 *
 * Cada lectura o escritura de memoria compartida se convierte en su propia
 * instrucción, porque entre dos accesos compartidos otro hilo puede ejecutarse.
 * Así `counter = counter + 1` se vuelve dos pasos atómicos: LOAD y STORE,
 * que es justo lo que permite que aparezca la condición de carrera.
 */

// ───────────────────────────── Expresiones compiladas ─────────────────────────────

export type CExpr =
  | { k: 'const'; v: Value }
  | { k: 'local'; slot: number }
  | { k: 'reg'; r: number }
  /** Solo en asserts finales: lee la global directamente (todos los hilos ya terminaron). */
  | { k: 'global'; g: number }
  | { k: 'un'; op: '!' | '-'; e: CExpr }
  | { k: 'bin'; op: BinaryOp; l: CExpr; r: CExpr };

// ───────────────────────────── Instrucciones ─────────────────────────────

export type Instr =
  /** Lee la global `g` y la guarda en el registro temporal `reg`. Paso visible. */
  | { op: 'load'; g: number; reg: number; loc: SourceLoc }
  /** Escribe en la global `g`. Paso visible. */
  | { op: 'store'; g: number; expr: CExpr; loc: SourceLoc }
  /** Asigna una variable local. Invisible: no toca memoria compartida. */
  | { op: 'setLocal'; slot: number; expr: CExpr; loc: SourceLoc }
  /** Salta a `target` si la condición es falsa. Invisible. */
  | { op: 'branchFalse'; cond: CExpr; target: number; loc: SourceLoc }
  /** Salto incondicional. Invisible. */
  | { op: 'jump'; target: number; loc: SourceLoc }
  | { op: 'assert'; cond: CExpr; text: string; loc: SourceLoc }
  /** `reacquire` indica que es la re-adquisición después de un wait(). */
  | { op: 'lock'; m: number; reacquire: boolean; loc: SourceLoc }
  | { op: 'unlock'; m: number; loc: SourceLoc }
  /** scoped_lock: toma todos los mutex a la vez (sin deadlock) o ninguno. */
  | { op: 'lockAll'; ms: number[]; loc: SourceLoc }
  /** Fin del bloque de un guard RAII: suelta los mutex que el hilo todavía tenga. */
  | { op: 'release'; ms: number[]; guard: string; loc: SourceLoc }
  | { op: 'wait'; cv: number; m: number; loc: SourceLoc }
  | { op: 'notify'; cv: number; all: boolean; loc: SourceLoc }
  | { op: 'setValue'; p: number; expr: CExpr; loc: SourceLoc }
  /** future.get(): se bloquea hasta que la promise tenga valor. */
  | { op: 'get'; p: number; reg: number; loc: SourceLoc }
  | { op: 'end'; loc: SourceLoc };

export const INVISIBLE_OPS = new Set<Instr['op']>(['setLocal', 'branchFalse', 'jump']);

// ───────────────────────────── Programa compilado ─────────────────────────────

export interface GlobalInfo {
  name: string;
  type: ValueType;
  init: Value;
  loc: SourceLoc;
}

export interface CompiledThread {
  name: string;
  code: Instr[];
  locals: { name: string; type: ValueType }[];
  loc: SourceLoc;
}

export interface CompiledProgram {
  globals: GlobalInfo[];
  mutexes: { name: string; loc: SourceLoc }[];
  cvs: { name: string; loc: SourceLoc }[];
  promises: { name: string; type: ValueType; future: string | null; loc: SourceLoc }[];
  threads: CompiledThread[];
  finalAsserts: { cond: CExpr; text: string; loc: SourceLoc }[];
}

type Symbol =
  | { kind: 'global'; index: number; type: ValueType }
  | { kind: 'mutex'; index: number }
  | { kind: 'cv'; index: number }
  | { kind: 'promise'; index: number; type: ValueType }
  | { kind: 'future'; index: number; type: ValueType }
  | { kind: 'local'; slot: number; type: ValueType }
  | { kind: 'guard'; guard: 'lock_guard' | 'unique_lock' | 'scoped_lock'; mutexes: number[] };

const err = (es: string, en: string, loc: SourceLoc): never => {
  throw new TelarCError({ es, en }, loc);
};

export function compile(program: Program, source: string): CompiledProgram {
  const out: CompiledProgram = {
    globals: [],
    mutexes: [],
    cvs: [],
    promises: [],
    threads: [],
    finalAsserts: [],
  };
  const globalScope = new Map<string, Symbol>();
  const textOf = (loc: SourceLoc) => sliceSource(source, loc);

  const declare = (id: Ident, sym: Symbol) => {
    if (globalScope.has(id.name)) {
      err(`"${id.name}" ya fue declarado antes`, `"${id.name}" was already declared`, id.loc);
    }
    globalScope.set(id.name, sym);
  };

  for (const decl of program.globals) {
    switch (decl.kind) {
      case 'var': {
        let init: Value = decl.type === 'int' ? 0 : false;
        if (decl.init) {
          const { expr, type } = compileExpr(decl.init, {
            lookup: (id) => globalScope.get(id.name),
            mode: 'const',
          });
          expectType(type, decl.type, decl.init.loc);
          init = evalExpr(expr, { globals: out.globals.map((g) => g.init), locals: [], regs: [] });
        }
        declare(decl.name, { kind: 'global', index: out.globals.length, type: decl.type });
        out.globals.push({ name: decl.name.name, type: decl.type, init, loc: decl.loc });
        break;
      }
      case 'mutex':
        declare(decl.name, { kind: 'mutex', index: out.mutexes.length });
        out.mutexes.push({ name: decl.name.name, loc: decl.loc });
        break;
      case 'cv':
        declare(decl.name, { kind: 'cv', index: out.cvs.length });
        out.cvs.push({ name: decl.name.name, loc: decl.loc });
        break;
      case 'promise':
        declare(decl.name, { kind: 'promise', index: out.promises.length, type: decl.valueType });
        out.promises.push({
          name: decl.name.name,
          type: decl.valueType,
          future: null,
          loc: decl.loc,
        });
        break;
      case 'future': {
        const p = globalScope.get(decl.promise.name);
        if (!p || p.kind !== 'promise') {
          return err(
            `"${decl.promise.name}" no es una promise declarada`,
            `"${decl.promise.name}" is not a declared promise`,
            decl.promise.loc,
          );
        }
        if (p.type !== decl.valueType) {
          err(
            `El future es <${decl.valueType}> pero la promise es <${p.type}>`,
            `The future is <${decl.valueType}> but the promise is <${p.type}>`,
            decl.loc,
          );
        }
        const info = out.promises[p.index]!;
        if (info.future) {
          err(
            `get_future() ya se llamó para "${info.name}"; solo puede llamarse una vez`,
            `get_future() was already called for "${info.name}"; it can only be called once`,
            decl.loc,
          );
        }
        info.future = decl.name.name;
        declare(decl.name, { kind: 'future', index: p.index, type: decl.valueType });
        break;
      }
    }
  }

  const threadNames = new Set<string>();
  for (const t of program.threads) {
    if (threadNames.has(t.name.name) || globalScope.has(t.name.name)) {
      err(
        `Ya existe algo llamado "${t.name.name}"`,
        `Something named "${t.name.name}" already exists`,
        t.name.loc,
      );
    }
    threadNames.add(t.name.name);
    out.threads.push(new ThreadCompiler(t.name.name, globalScope, textOf).compileThread(t));
  }

  for (const fa of program.finalAsserts) {
    const { expr, type } = compileExpr(fa.cond, {
      lookup: (id) => globalScope.get(id.name),
      mode: 'final',
    });
    expectType(type, 'bool', fa.cond.loc);
    out.finalAsserts.push({ cond: expr, text: textOf(fa.cond.loc), loc: fa.loc });
  }

  return out;
}

// ───────────────────────────── Compilador de un hilo ─────────────────────────────

class ThreadCompiler {
  private code: Instr[] = [];
  private locals: { name: string; type: ValueType }[] = [];
  private scopes: Map<string, Symbol>[] = [];

  constructor(
    private readonly name: string,
    private readonly globals: Map<string, Symbol>,
    private readonly textOf: (loc: SourceLoc) => string,
  ) {}

  compileThread(t: Program['threads'][number]): CompiledThread {
    this.block(t.body.body);
    this.code.push({
      op: 'end',
      loc: { ...t.body.loc, line: t.body.loc.endLine, col: t.body.loc.endCol - 1 },
    });
    return { name: this.name, code: this.code, locals: this.locals, loc: t.loc };
  }

  private lookup(id: Ident): Symbol | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i]!.get(id.name);
      if (s) return s;
    }
    return this.globals.get(id.name);
  }

  private block(body: Stmt[]): void {
    const scope = new Map<string, Symbol>();
    this.scopes.push(scope);
    const guards: { mutexes: number[]; guard: string; loc: SourceLoc }[] = [];
    for (const s of body) {
      const g = this.stmt(s, scope);
      if (g) guards.push(g);
    }
    // RAII: al salir del bloque los guards se destruyen en orden inverso.
    for (let i = guards.length - 1; i >= 0; i--) {
      const g = guards[i]!;
      this.code.push({ op: 'release', ms: g.mutexes, guard: g.guard, loc: g.loc });
    }
    this.scopes.pop();
  }

  /** Compila una sentencia. Si es un guard RAII, lo devuelve para soltarlo al final del bloque. */
  private stmt(
    s: Stmt,
    scope: Map<string, Symbol>,
  ): { mutexes: number[]; guard: string; loc: SourceLoc } | null {
    switch (s.kind) {
      case 'block':
        this.block(s.body);
        return null;

      case 'local': {
        if (scope.has(s.name.name)) {
          err(
            `"${s.name.name}" ya fue declarada en este bloque`,
            `"${s.name.name}" was already declared in this block`,
            s.name.loc,
          );
        }
        const slot = this.locals.length;
        this.locals.push({ name: s.name.name, type: s.type });
        if (s.init) {
          this.assignTo({ kind: 'local', slot, type: s.type }, s.init, s.loc, s.name);
        } else {
          this.code.push({
            op: 'setLocal',
            slot,
            expr: { k: 'const', v: s.type === 'int' ? 0 : false },
            loc: s.loc,
          });
        }
        // Se declara después de compilar el inicializador: `int x = x;` no es válido.
        scope.set(s.name.name, { kind: 'local', slot, type: s.type });
        return null;
      }

      case 'assign': {
        const sym = this.lookup(s.target);
        if (!sym) {
          return err(
            `La variable "${s.target.name}" no está declarada`,
            `Variable "${s.target.name}" is not declared`,
            s.target.loc,
          );
        }
        if (sym.kind !== 'global' && sym.kind !== 'local') {
          return err(
            `No se puede asignar a "${s.target.name}" porque no es una variable int/bool`,
            `Cannot assign to "${s.target.name}" because it is not an int/bool variable`,
            s.target.loc,
          );
        }
        let value: Expr = s.value;
        if (s.op !== '=') {
          if (sym.type !== 'int') {
            err(`"${s.op}" solo funciona con int`, `"${s.op}" only works with int`, s.loc);
          }
          value = {
            kind: 'binary',
            op: s.op === '+=' ? '+' : '-',
            left: { kind: 'name', name: s.target.name, loc: s.target.loc },
            right: s.value,
            loc: s.loc,
          };
        }
        this.assignTo(sym, value, s.loc, s.target);
        return null;
      }

      case 'if': {
        const cond = this.condition(s.cond);
        const jf: Instr = { op: 'branchFalse', cond, target: -1, loc: s.cond.loc };
        this.code.push(jf);
        this.block(s.then.kind === 'block' ? s.then.body : [s.then]);
        if (s.else) {
          const jEnd: Instr = { op: 'jump', target: -1, loc: s.loc };
          this.code.push(jEnd);
          jf.target = this.code.length;
          this.block(s.else.kind === 'block' ? s.else.body : [s.else]);
          jEnd.target = this.code.length;
        } else {
          jf.target = this.code.length;
        }
        return null;
      }

      case 'while': {
        const top = this.code.length;
        const cond = this.condition(s.cond);
        const jf: Instr = { op: 'branchFalse', cond, target: -1, loc: s.cond.loc };
        this.code.push(jf);
        this.block(s.body.kind === 'block' ? s.body.body : [s.body]);
        this.code.push({ op: 'jump', target: top, loc: s.loc });
        jf.target = this.code.length;
        return null;
      }

      case 'assert': {
        const cond = this.condition(s.cond);
        this.code.push({ op: 'assert', cond, text: this.textOf(s.cond.loc), loc: s.loc });
        return null;
      }

      case 'guard': {
        const mutexes = s.mutexes.map((id) => this.mutexIndex(id));
        if (new Set(mutexes).size !== mutexes.length) {
          err(
            'scoped_lock recibió el mismo mutex dos veces',
            'scoped_lock received the same mutex twice',
            s.loc,
          );
        }
        if (s.guard === 'scoped_lock') {
          this.code.push({ op: 'lockAll', ms: mutexes, loc: s.loc });
        } else {
          this.code.push({ op: 'lock', m: mutexes[0]!, reacquire: false, loc: s.loc });
        }
        if (s.name) {
          if (scope.has(s.name.name)) {
            err(
              `"${s.name.name}" ya fue declarada en este bloque`,
              `"${s.name.name}" was already declared in this block`,
              s.name.loc,
            );
          }
          scope.set(s.name.name, { kind: 'guard', guard: s.guard, mutexes });
        }
        return { mutexes, guard: s.guard, loc: s.loc };
      }

      case 'call':
        this.callStmt(s);
        return null;
    }
  }

  private callStmt(s: Extract<Stmt, { kind: 'call' }>): void {
    const sym = this.lookup(s.object);
    const m = s.method.name;
    const noArgs = () => {
      if (s.args.length > 0) {
        err(`${m}() no recibe argumentos`, `${m}() takes no arguments`, s.args[0]!.loc);
      }
    };
    if (!sym) {
      err(
        `"${s.object.name}" no está declarado`,
        `"${s.object.name}" is not declared`,
        s.object.loc,
      );
      return;
    }

    if (sym.kind === 'mutex' || (sym.kind === 'guard' && sym.guard === 'unique_lock')) {
      const mutex = sym.kind === 'mutex' ? sym.index : sym.mutexes[0]!;
      if (m === 'lock') {
        noArgs();
        this.code.push({ op: 'lock', m: mutex, reacquire: false, loc: s.loc });
        return;
      }
      if (m === 'unlock') {
        noArgs();
        this.code.push({ op: 'unlock', m: mutex, loc: s.loc });
        return;
      }
      err(
        `${sym.kind === 'mutex' ? 'mutex' : 'unique_lock'} no tiene el método "${m}". Usa lock() o unlock()`,
        `${sym.kind === 'mutex' ? 'mutex' : 'unique_lock'} has no method "${m}". Use lock() or unlock()`,
        s.method.loc,
      );
    }

    if (sym.kind === 'guard') {
      err(
        `${sym.guard} no tiene métodos: el mutex se suelta solo al terminar el bloque`,
        `${sym.guard} has no methods: the mutex is released when the block ends`,
        s.method.loc,
      );
    }

    if (sym.kind === 'cv') {
      if (m === 'notify_one' || m === 'notify_all') {
        noArgs();
        this.code.push({ op: 'notify', cv: sym.index, all: m === 'notify_all', loc: s.loc });
        return;
      }
      if (m === 'wait') {
        if (s.args.length !== 1 || s.args[0]!.kind !== 'name') {
          err(
            'wait necesita exactamente un argumento: el mutex o el unique_lock. Ej: cv.wait(lk);',
            'wait needs exactly one argument: the mutex or the unique_lock. E.g. cv.wait(lk);',
            s.loc,
          );
        }
        const arg = s.args[0] as Extract<Expr, { kind: 'name' }>;
        const lockSym = this.lookup({ name: arg.name, loc: arg.loc });
        let mutex: number;
        if (lockSym?.kind === 'mutex') mutex = lockSym.index;
        else if (lockSym?.kind === 'guard' && lockSym.guard === 'unique_lock')
          mutex = lockSym.mutexes[0]!;
        else if (lockSym?.kind === 'guard') {
          return err(
            `No se puede esperar con ${lockSym.guard}: wait necesita soltar el mutex. Usa unique_lock`,
            `You cannot wait with ${lockSym.guard}: wait must release the mutex. Use unique_lock`,
            arg.loc,
          );
        } else {
          return err(
            `"${arg.name}" no es un mutex ni un unique_lock`,
            `"${arg.name}" is not a mutex nor a unique_lock`,
            arg.loc,
          );
        }
        // wait = soltar el mutex y dormir (atómico) + volver a tomarlo al despertar.
        this.code.push({ op: 'wait', cv: sym.index, m: mutex, loc: s.loc });
        this.code.push({ op: 'lock', m: mutex, reacquire: true, loc: s.loc });
        return;
      }
      err(
        `condition_variable no tiene el método "${m}". Usa wait, notify_one o notify_all`,
        `condition_variable has no method "${m}". Use wait, notify_one or notify_all`,
        s.method.loc,
      );
    }

    if (sym.kind === 'promise') {
      if (m !== 'set_value') {
        err(
          `promise solo admite set_value(valor) en TelarC`,
          `promise only supports set_value(value) in TelarC`,
          s.method.loc,
        );
      }
      if (s.args.length !== 1) {
        err('set_value necesita un argumento', 'set_value needs one argument', s.loc);
      }
      const { expr, type } = this.expr(s.args[0]!);
      expectType(type, sym.type, s.args[0]!.loc);
      this.code.push({ op: 'setValue', p: sym.index, expr, loc: s.loc });
      return;
    }

    if (sym.kind === 'future') {
      err(
        'f.get() devuelve un valor: guárdalo en una variable, por ejemplo int x = f.get();',
        'f.get() returns a value: store it in a variable, e.g. int x = f.get();',
        s.loc,
      );
    }

    err(
      `"${s.object.name}" no tiene métodos (es una variable ${sym.kind === 'global' || sym.kind === 'local' ? sym.type : ''})`,
      `"${s.object.name}" has no methods (it is a ${sym.kind === 'global' || sym.kind === 'local' ? sym.type : ''} variable)`,
      s.object.loc,
    );
  }

  private mutexIndex(id: Ident): number {
    const sym = this.lookup(id);
    if (!sym || sym.kind !== 'mutex') {
      return err(`"${id.name}" no es un mutex`, `"${id.name}" is not a mutex`, id.loc);
    }
    return sym.index;
  }

  /** Compila `destino = valor`, incluyendo el caso especial `x = f.get();`. */
  private assignTo(
    target: Extract<Symbol, { kind: 'global' | 'local' }>,
    value: Expr,
    loc: SourceLoc,
    targetId: Ident,
  ): void {
    let expr: CExpr;
    if (value.kind === 'call') {
      const sym = this.lookup(value.object);
      if (sym?.kind !== 'future' || value.method.name !== 'get' || value.args.length > 0) {
        return err(
          `Solo se puede llamar f.get() dentro de una expresión (aquí: ${value.object.name}.${value.method.name}())`,
          `Only f.get() can be called inside an expression (here: ${value.object.name}.${value.method.name}())`,
          value.loc,
        );
      }
      expectType(sym.type, target.type, value.loc);
      this.code.push({ op: 'get', p: sym.index, reg: 0, loc });
      expr = { k: 'reg', r: 0 };
    } else {
      const compiled = this.expr(value);
      if (compiled.type !== target.type) {
        err(
          `No se puede guardar un ${compiled.type} en "${targetId.name}", que es ${target.type}`,
          `Cannot store a ${compiled.type} in "${targetId.name}", which is ${target.type}`,
          value.loc,
        );
      }
      expr = compiled.expr;
    }
    if (target.kind === 'global') this.code.push({ op: 'store', g: target.index, expr, loc });
    else this.code.push({ op: 'setLocal', slot: target.slot, expr, loc });
  }

  private condition(e: Expr): CExpr {
    const { expr, type } = this.expr(e);
    if (type !== 'bool') {
      err(
        'La condición debe ser bool. Por ejemplo, usa x != 0 en lugar de x',
        'The condition must be bool. For example, use x != 0 instead of x',
        e.loc,
      );
    }
    return expr;
  }

  /** Compila una expresión emitiendo un LOAD por cada lectura de una global. */
  private expr(e: Expr): { expr: CExpr; type: ValueType } {
    let nextReg = 0;
    return compileExpr(e, {
      lookup: (id) => this.lookup(id),
      mode: 'thread',
      onGlobalRead: (g, loc) => {
        const reg = nextReg++;
        this.code.push({ op: 'load', g, reg, loc });
        return reg;
      },
    });
  }
}

// ───────────────────────────── Expresiones ─────────────────────────────

interface ExprCtx {
  lookup: (id: Ident) => Symbol | undefined;
  mode: 'const' | 'thread' | 'final';
  onGlobalRead?: (g: number, loc: SourceLoc) => number;
}

function compileExpr(e: Expr, ctx: ExprCtx): { expr: CExpr; type: ValueType } {
  switch (e.kind) {
    case 'int':
      return { expr: { k: 'const', v: e.value | 0 }, type: 'int' };
    case 'bool':
      return { expr: { k: 'const', v: e.value }, type: 'bool' };
    case 'name': {
      const sym = ctx.lookup({ name: e.name, loc: e.loc });
      if (!sym) {
        return err(`"${e.name}" no está declarado`, `"${e.name}" is not declared`, e.loc);
      }
      if (sym.kind === 'local') return { expr: { k: 'local', slot: sym.slot }, type: sym.type };
      if (sym.kind === 'global') {
        if (ctx.mode === 'thread') {
          return { expr: { k: 'reg', r: ctx.onGlobalRead!(sym.index, e.loc) }, type: sym.type };
        }
        return { expr: { k: 'global', g: sym.index }, type: sym.type };
      }
      return err(
        `"${e.name}" no es una variable int/bool y no puede usarse en una expresión`,
        `"${e.name}" is not an int/bool variable and cannot be used in an expression`,
        e.loc,
      );
    }
    case 'unary': {
      const inner = compileExpr(e.operand, ctx);
      const want: ValueType = e.op === '!' ? 'bool' : 'int';
      expectType(inner.type, want, e.operand.loc, e.op);
      return { expr: { k: 'un', op: e.op, e: inner.expr }, type: want };
    }
    case 'binary': {
      const l = compileExpr(e.left, ctx);
      const r = compileExpr(e.right, ctx);
      const op = e.op;
      if (op === '&&' || op === '||') {
        expectType(l.type, 'bool', e.left.loc, op);
        expectType(r.type, 'bool', e.right.loc, op);
        return { expr: { k: 'bin', op, l: l.expr, r: r.expr }, type: 'bool' };
      }
      if (op === '==' || op === '!=') {
        if (l.type !== r.type) {
          err(
            `No se puede comparar ${l.type} con ${r.type}`,
            `Cannot compare ${l.type} with ${r.type}`,
            e.loc,
          );
        }
        return { expr: { k: 'bin', op, l: l.expr, r: r.expr }, type: 'bool' };
      }
      expectType(l.type, 'int', e.left.loc, op);
      expectType(r.type, 'int', e.right.loc, op);
      const isCmp = op === '<' || op === '<=' || op === '>' || op === '>=';
      return { expr: { k: 'bin', op, l: l.expr, r: r.expr }, type: isCmp ? 'bool' : 'int' };
    }
    case 'call':
      return err(
        `Solo se puede usar ${e.object.name}.${e.method.name}() como valor completo de una asignación, por ejemplo: int x = f.get();`,
        `${e.object.name}.${e.method.name}() can only be used as the whole value of an assignment, e.g. int x = f.get();`,
        e.loc,
      );
  }
}

function expectType(got: ValueType, want: ValueType, loc: SourceLoc, op?: string): void {
  if (got !== want) {
    const where = op ? ` con "${op}"` : '';
    const whereEn = op ? ` with "${op}"` : '';
    err(
      `Se esperaba un valor ${want} pero es ${got}${where}`,
      `Expected a ${want} value but got ${got}${whereEn}`,
      loc,
    );
  }
}

// ───────────────────────────── Evaluación ─────────────────────────────

export interface EvalEnv {
  globals: Value[];
  locals: Value[];
  regs: Value[];
}

export class EvalError extends Error {
  constructor(readonly bilingual: Bilingual) {
    super(bilingual.es);
  }
}

/** Evalúa una expresión compilada. La aritmética es entera de 32 bits, como `int` en C++. */
export function evalExpr(e: CExpr, env: EvalEnv): Value {
  switch (e.k) {
    case 'const':
      return e.v;
    case 'local':
      return env.locals[e.slot]!;
    case 'reg':
      return env.regs[e.r]!;
    case 'global':
      return env.globals[e.g]!;
    case 'un': {
      const v = evalExpr(e.e, env);
      return e.op === '!' ? !v : -(v as number) | 0;
    }
    case 'bin': {
      const a = evalExpr(e.l, env);
      // && y || cortocircuitan como en C++ (los valores ya fueron leídos por los LOAD).
      if (e.op === '&&') return (a as boolean) && (evalExpr(e.r, env) as boolean);
      if (e.op === '||') return (a as boolean) || (evalExpr(e.r, env) as boolean);
      const b = evalExpr(e.r, env);
      switch (e.op) {
        case '+':
          return ((a as number) + (b as number)) | 0;
        case '-':
          return ((a as number) - (b as number)) | 0;
        case '*':
          return Math.imul(a as number, b as number);
        case '/':
          if (b === 0) throw new EvalError({ es: 'División entre cero', en: 'Division by zero' });
          return ((a as number) / (b as number)) | 0;
        case '%':
          if (b === 0) throw new EvalError({ es: 'Módulo entre cero', en: 'Modulo by zero' });
          return ((a as number) % (b as number)) | 0;
        case '==':
          return a === b;
        case '!=':
          return a !== b;
        case '<':
          return (a as number) < (b as number);
        case '<=':
          return (a as number) <= (b as number);
        case '>':
          return (a as number) > (b as number);
        case '>=':
          return (a as number) >= (b as number);
      }
    }
  }
}

/** Extrae el texto fuente cubierto por `loc` (para mostrar el assert original). */
export function sliceSource(source: string, loc: SourceLoc): string {
  const lines = source.split('\n');
  if (loc.line === loc.endLine) {
    return (lines[loc.line - 1] ?? '').slice(loc.col - 1, loc.endCol - 1);
  }
  const parts = [(lines[loc.line - 1] ?? '').slice(loc.col - 1)];
  for (let l = loc.line; l < loc.endLine - 1; l++) parts.push(lines[l] ?? '');
  parts.push((lines[loc.endLine - 1] ?? '').slice(0, loc.endCol - 1));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
