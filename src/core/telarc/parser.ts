import type {
  BinaryOp,
  Expr,
  FinalAssert,
  GlobalDecl,
  GuardKind,
  Ident,
  Program,
  Stmt,
  ThreadDecl,
  TopLevel,
  ValueType,
} from './ast';
import { TelarCError, locSpan, type SourceLoc } from './diagnostics';
import { tokenize } from './lexer';
import type { Token } from './tokens';

/** Precedencia de operadores binarios (mayor = se agrupa primero), como en C++. */
const PRECEDENCE: Record<BinaryOp, number> = {
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

/** Analiza el código TelarC y produce el AST. Lanza TelarCError con línea y columna. */
export function parse(source: string): Program {
  return new Parser(tokenize(source)).parseProgram();
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  // ───────────────────────── utilidades ─────────────────────────

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== 'eof') this.pos++;
    return t;
  }

  private is(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return (t.kind === 'punct' || t.kind === 'keyword') && t.value === value;
  }

  private accept(value: string): Token | null {
    if (this.is(value)) return this.next();
    return null;
  }

  private expect(value: string, what?: { es: string; en: string }): Token {
    const t = this.peek();
    if (this.is(value)) return this.next();
    const found = describe(t);
    throw new TelarCError(
      what ?? {
        es: `Se esperaba "${value}" pero se encontró ${found.es}`,
        en: `Expected "${value}" but found ${found.en}`,
      },
      t.loc,
    );
  }

  private expectIdent(role: { es: string; en: string }): Ident {
    const t = this.peek();
    if (t.kind === 'ident') {
      this.next();
      return { name: t.value, loc: t.loc };
    }
    const found = describe(t);
    throw new TelarCError(
      {
        es: `Se esperaba ${role.es} pero se encontró ${found.es}`,
        en: `Expected ${role.en} but found ${found.en}`,
      },
      t.loc,
    );
  }

  /** Acepta un prefijo opcional `std::`. */
  private skipStd(): void {
    if (this.is('std') && this.is('::', 1)) {
      this.next();
      this.next();
    }
  }

  /** Mira, sin consumir, la palabra que sigue a un `std::` opcional. */
  private peekAfterStd(): Token {
    return this.is('std') && this.is('::', 1) ? this.peek(2) : this.peek();
  }

  // ───────────────────────── programa ─────────────────────────

  parseProgram(): Program {
    const items: TopLevel[] = [];
    const globals: GlobalDecl[] = [];
    const threads: ThreadDecl[] = [];
    const finalAsserts: FinalAssert[] = [];

    while (this.peek().kind !== 'eof') {
      if (this.is('thread')) {
        const decl = this.parseThread();
        threads.push(decl);
        items.push({ kind: 'thread', decl });
      } else if (this.is('assert')) {
        const start = this.next();
        this.expect('(');
        const cond = this.parseExpr();
        this.expect(')');
        const end = this.expect(';');
        const decl = { cond, loc: locSpan(start.loc, end.loc) };
        finalAsserts.push(decl);
        items.push({ kind: 'finalAssert', decl });
      } else {
        for (const decl of this.parseGlobalDecl()) {
          globals.push(decl);
          items.push({ kind: 'global', decl });
        }
      }
    }

    if (threads.length === 0) {
      const eof = this.peek();
      throw new TelarCError(
        {
          es: 'El programa no define ningún hilo. Escribe al menos uno: thread t1 { ... }',
          en: 'The program defines no threads. Write at least one: thread t1 { ... }',
        },
        eof.loc,
      );
    }
    return { items, globals, threads, finalAsserts };
  }

  private parseThread(): ThreadDecl {
    const start = this.expect('thread');
    const name = this.expectIdent({ es: 'el nombre del hilo', en: 'the thread name' });
    const body = this.parseBlock();
    return { name, body, loc: locSpan(start.loc, body.loc) };
  }

  private parseGlobalDecl(): GlobalDecl[] {
    const startTok = this.peek();
    this.skipStd();
    const t = this.peek();

    if (this.is('int') || this.is('bool')) {
      const type = this.next().value as ValueType;
      const decls: GlobalDecl[] = [];
      do {
        const name = this.expectIdent({ es: 'el nombre de la variable', en: 'a variable name' });
        const init = this.accept('=') ? this.parseExpr() : null;
        decls.push({ kind: 'var', type, name, init, loc: locSpan(startTok.loc, name.loc) });
      } while (this.accept(','));
      this.expect(';');
      return decls;
    }

    if (this.is('mutex') || this.is('condition_variable') || this.is('condition_variable_any')) {
      const kind = t.value === 'mutex' ? 'mutex' : 'cv';
      this.next();
      const decls: GlobalDecl[] = [];
      do {
        const name = this.expectIdent({ es: `el nombre del ${t.value}`, en: `a ${t.value} name` });
        decls.push({ kind, name, loc: locSpan(startTok.loc, name.loc) });
      } while (this.accept(','));
      this.expect(';');
      return decls;
    }

    if (this.is('promise') || this.is('future')) {
      const isPromise = this.next().value === 'promise';
      const valueType = this.parseTemplateValueType();
      const name = this.expectIdent({
        es: isPromise ? 'el nombre de la promise' : 'el nombre del future',
        en: isPromise ? 'a promise name' : 'a future name',
      });
      if (isPromise) {
        const end = this.expect(';');
        return [{ kind: 'promise', valueType, name, loc: locSpan(startTok.loc, end.loc) }];
      }
      this.expect('=', {
        es: 'Un future debe inicializarse así: future<int> f = p.get_future();',
        en: 'A future must be initialized like: future<int> f = p.get_future();',
      });
      const promise = this.expectIdent({ es: 'el nombre de una promise', en: 'a promise name' });
      this.expect('.');
      const method = this.expectIdent({ es: 'get_future', en: 'get_future' });
      if (method.name !== 'get_future') {
        throw new TelarCError(
          {
            es: `Se esperaba get_future() pero se encontró "${method.name}"`,
            en: `Expected get_future() but found "${method.name}"`,
          },
          method.loc,
        );
      }
      this.expect('(');
      this.expect(')');
      const end = this.expect(';');
      return [{ kind: 'future', valueType, name, promise, loc: locSpan(startTok.loc, end.loc) }];
    }

    const found = describe(t);
    throw new TelarCError(
      {
        es: `Declaración global inesperada: ${found.es}. Se esperaba int, bool, mutex, condition_variable, promise, future, thread o assert`,
        en: `Unexpected global declaration: ${found.en}. Expected int, bool, mutex, condition_variable, promise, future, thread or assert`,
      },
      t.loc,
    );
  }

  /** `<int>` o `<bool>` */
  private parseTemplateValueType(): ValueType {
    this.expect('<');
    const t = this.peek();
    if (!this.is('int') && !this.is('bool')) {
      throw new TelarCError(
        {
          es: 'promise/future solo admiten <int> o <bool>',
          en: 'promise/future only support <int> or <bool>',
        },
        t.loc,
      );
    }
    this.next();
    this.expect('>');
    return t.value as ValueType;
  }

  // ───────────────────────── sentencias ─────────────────────────

  private parseBlock(): Extract<Stmt, { kind: 'block' }> {
    const start = this.expect('{');
    const body: Stmt[] = [];
    while (!this.is('}')) {
      if (this.peek().kind === 'eof') {
        throw new TelarCError(
          {
            es: `Falta "}" para cerrar el bloque abierto en la línea ${start.loc.line}`,
            en: `Missing "}" to close the block opened on line ${start.loc.line}`,
          },
          this.peek().loc,
        );
      }
      body.push(this.parseStmt());
    }
    const end = this.next();
    return { kind: 'block', body, loc: locSpan(start.loc, end.loc) };
  }

  private parseStmt(): Stmt {
    const t = this.peek();

    if (this.is('{')) return this.parseBlock();

    if (this.is('if')) {
      this.next();
      this.expect('(');
      const cond = this.parseExpr();
      this.expect(')');
      const then = this.parseStmt();
      const elseStmt = this.accept('else') ? this.parseStmt() : null;
      return { kind: 'if', cond, then, else: elseStmt, loc: locSpan(t.loc, then.loc) };
    }

    if (this.is('while')) {
      this.next();
      this.expect('(');
      const cond = this.parseExpr();
      this.expect(')');
      const body = this.parseStmt();
      return { kind: 'while', cond, body, loc: locSpan(t.loc, body.loc) };
    }

    if (this.is('assert')) {
      this.next();
      this.expect('(');
      const cond = this.parseExpr();
      this.expect(')');
      const end = this.expectSemicolon();
      return { kind: 'assert', cond, loc: locSpan(t.loc, end.loc) };
    }

    if (this.is('int') || this.is('bool')) {
      const type = this.next().value as ValueType;
      const name = this.expectIdent({ es: 'el nombre de la variable', en: 'a variable name' });
      const init = this.accept('=') ? this.parseExpr() : null;
      const end = this.expectSemicolon();
      return { kind: 'local', type, name, init, loc: locSpan(t.loc, end.loc) };
    }

    const head = this.peekAfterStd();
    if (
      head.kind === 'keyword' &&
      (head.value === 'lock_guard' || head.value === 'unique_lock' || head.value === 'scoped_lock')
    ) {
      return this.parseGuard();
    }
    if (
      head.kind === 'keyword' &&
      ['mutex', 'condition_variable', 'promise', 'future'].includes(head.value)
    ) {
      throw new TelarCError(
        {
          es: `"${head.value}" debe declararse como variable global, fuera de los hilos`,
          en: `"${head.value}" must be declared as a global, outside of threads`,
        },
        head.loc,
      );
    }

    // ++x; --x;
    if (this.is('++') || this.is('--')) {
      const op = this.next().value;
      const target = this.expectIdent({ es: 'una variable', en: 'a variable' });
      const end = this.expectSemicolon();
      return {
        kind: 'assign',
        target,
        op: op === '++' ? '+=' : '-=',
        value: { kind: 'int', value: 1, loc: t.loc },
        sugar: op as '++' | '--',
        loc: locSpan(t.loc, end.loc),
      };
    }

    if (t.kind === 'ident') {
      const target = this.expectIdent({ es: 'una variable', en: 'a variable' });

      if (this.accept('.')) {
        const method = this.expectIdent({ es: 'el nombre de un método', en: 'a method name' });
        const args = this.parseArgs();
        const end = this.expectSemicolon();
        return { kind: 'call', object: target, method, args, loc: locSpan(t.loc, end.loc) };
      }

      if (this.is('++') || this.is('--')) {
        const op = this.next().value;
        const end = this.expectSemicolon();
        return {
          kind: 'assign',
          target,
          op: op === '++' ? '+=' : '-=',
          value: { kind: 'int', value: 1, loc: target.loc },
          sugar: op as '++' | '--',
          loc: locSpan(t.loc, end.loc),
        };
      }

      const opTok = this.peek();
      if (this.is('=') || this.is('+=') || this.is('-=')) {
        this.next();
        const value = this.parseExpr();
        const end = this.expectSemicolon();
        return {
          kind: 'assign',
          target,
          op: opTok.value as '=' | '+=' | '-=',
          value,
          loc: locSpan(t.loc, end.loc),
        };
      }

      const found = describe(opTok);
      throw new TelarCError(
        {
          es: `Después de "${target.name}" se esperaba "=", "++", "+=" o ".metodo()" pero se encontró ${found.es}`,
          en: `After "${target.name}" expected "=", "++", "+=" or ".method()" but found ${found.en}`,
        },
        opTok.loc,
      );
    }

    const found = describe(t);
    throw new TelarCError(
      {
        es: `Sentencia inesperada: ${found.es}`,
        en: `Unexpected statement: ${found.en}`,
      },
      t.loc,
    );
  }

  /** lock_guard<mutex> g(m);  unique_lock<mutex> lk(m);  scoped_lock lk(a, b); */
  private parseGuard(): Stmt {
    const start = this.peek();
    this.skipStd();
    const guard = this.next().value as GuardKind;
    // Argumentos de plantilla opcionales: <std::mutex> o <mutex, mutex>
    if (this.accept('<')) {
      do {
        this.skipStd();
        this.expect('mutex', {
          es: `${guard} solo puede usarse con mutex: ${guard}<mutex>`,
          en: `${guard} can only be used with mutex: ${guard}<mutex>`,
        });
      } while (this.accept(','));
      this.expect('>');
    }
    const name = this.expectIdent({ es: `el nombre del ${guard}`, en: `a ${guard} name` });
    this.expect('(');
    const mutexes: Ident[] = [];
    if (!this.is(')')) {
      do {
        mutexes.push(this.expectIdent({ es: 'el nombre de un mutex', en: 'a mutex name' }));
      } while (this.accept(','));
    }
    const close = this.expect(')');
    if (mutexes.length === 0) {
      throw new TelarCError(
        { es: `${guard} necesita al menos un mutex`, en: `${guard} needs at least one mutex` },
        close.loc,
      );
    }
    if (guard !== 'scoped_lock' && mutexes.length > 1) {
      throw new TelarCError(
        {
          es: `${guard} recibe un solo mutex. Para tomar varios a la vez usa scoped_lock`,
          en: `${guard} takes a single mutex. Use scoped_lock to take several at once`,
        },
        mutexes[1]!.loc,
      );
    }
    const end = this.expectSemicolon();
    return { kind: 'guard', guard, name, mutexes, loc: locSpan(start.loc, end.loc) };
  }

  private parseArgs(): Expr[] {
    this.expect('(');
    const args: Expr[] = [];
    if (!this.is(')')) {
      do {
        args.push(this.parseExpr());
      } while (this.accept(','));
    }
    this.expect(')');
    return args;
  }

  private expectSemicolon(): Token {
    const t = this.peek();
    if (this.is(';')) return this.next();
    // El error se marca al final del token anterior, que es donde falta el ';'.
    const prev = this.tokens[this.pos - 1];
    const loc: SourceLoc = prev
      ? {
          line: prev.loc.endLine,
          col: prev.loc.endCol,
          endLine: prev.loc.endLine,
          endCol: prev.loc.endCol + 1,
        }
      : t.loc;
    throw new TelarCError(
      { es: 'Falta ";" al final de la sentencia', en: 'Missing ";" at end of statement' },
      loc,
    );
  }

  // ───────────────────────── expresiones ─────────────────────────

  parseExpr(minPrec = 1): Expr {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const prec = t.kind === 'punct' ? PRECEDENCE[t.value as BinaryOp] : undefined;
      if (prec === undefined || prec < minPrec) break;
      this.next();
      const right = this.parseExpr(prec + 1);
      left = {
        kind: 'binary',
        op: t.value as BinaryOp,
        left,
        right,
        loc: locSpan(left.loc, right.loc),
      };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (this.is('!') || this.is('-')) {
      this.next();
      const operand = this.parseUnary();
      return { kind: 'unary', op: t.value as '!' | '-', operand, loc: locSpan(t.loc, operand.loc) };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.kind === 'number') {
      this.next();
      return { kind: 'int', value: Number(t.value), loc: t.loc };
    }
    if (this.is('true') || this.is('false')) {
      this.next();
      return { kind: 'bool', value: t.value === 'true', loc: t.loc };
    }
    if (this.is('(')) {
      this.next();
      const e = this.parseExpr();
      this.expect(')', {
        es: 'Falta ")" para cerrar el paréntesis',
        en: 'Missing ")" to close the parenthesis',
      });
      return e;
    }
    if (t.kind === 'ident') {
      this.next();
      const object = { name: t.value, loc: t.loc };
      if (this.accept('.')) {
        const method = this.expectIdent({ es: 'el nombre de un método', en: 'a method name' });
        const args = this.parseArgs();
        const last = this.tokens[this.pos - 1]!;
        return { kind: 'call', object, method, args, loc: locSpan(t.loc, last.loc) };
      }
      return { kind: 'name', name: t.value, loc: t.loc };
    }
    const found = describe(t);
    throw new TelarCError(
      {
        es: `Se esperaba una expresión pero se encontró ${found.es}`,
        en: `Expected an expression but found ${found.en}`,
      },
      t.loc,
    );
  }
}

function describe(t: Token): { es: string; en: string } {
  if (t.kind === 'eof') return { es: 'el final del archivo', en: 'the end of the file' };
  return { es: `"${t.value}"`, en: `"${t.value}"` };
}
