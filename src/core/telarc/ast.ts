import type { SourceLoc } from './diagnostics';

/** Tipos de valor que maneja TelarC. */
export type ValueType = 'int' | 'bool';
export type Value = number | boolean;

export interface Ident {
  name: string;
  loc: SourceLoc;
}

// ───────────────────────────── Expresiones ─────────────────────────────

export type BinaryOp =
  '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||';

export type Expr =
  | { kind: 'int'; value: number; loc: SourceLoc }
  | { kind: 'bool'; value: boolean; loc: SourceLoc }
  | { kind: 'name'; name: string; loc: SourceLoc }
  | { kind: 'unary'; op: '!' | '-'; operand: Expr; loc: SourceLoc }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; loc: SourceLoc }
  /** Llamada a método usada como expresión: solo `f.get()` es válida. */
  | { kind: 'call'; object: Ident; method: Ident; args: Expr[]; loc: SourceLoc };

// ───────────────────────────── Sentencias ─────────────────────────────

export type GuardKind = 'lock_guard' | 'unique_lock' | 'scoped_lock';

export type Stmt =
  | { kind: 'block'; body: Stmt[]; loc: SourceLoc }
  | { kind: 'local'; type: ValueType; name: Ident; init: Expr | null; loc: SourceLoc }
  | {
      kind: 'assign';
      target: Ident;
      op: '=' | '+=' | '-=';
      value: Expr;
      /** Si se escribió como x++ / ++x / x-- / --x (para regenerar C++ fiel). */
      sugar?: '++' | '--';
      loc: SourceLoc;
    }
  | { kind: 'if'; cond: Expr; then: Stmt; else: Stmt | null; loc: SourceLoc }
  | { kind: 'while'; cond: Expr; body: Stmt; loc: SourceLoc }
  | { kind: 'assert'; cond: Expr; loc: SourceLoc }
  /** RAII: toma los mutex ahora y los suelta al salir del bloque que lo contiene. */
  | { kind: 'guard'; guard: GuardKind; name: Ident | null; mutexes: Ident[]; loc: SourceLoc }
  /** `obj.metodo(args);` — lock, unlock, wait, notify_one, notify_all, set_value. */
  | { kind: 'call'; object: Ident; method: Ident; args: Expr[]; loc: SourceLoc };

// ───────────────────────────── Declaraciones globales ─────────────────────────────

export type GlobalDecl =
  | { kind: 'var'; type: ValueType; name: Ident; init: Expr | null; loc: SourceLoc }
  | { kind: 'mutex'; name: Ident; loc: SourceLoc }
  | { kind: 'cv'; name: Ident; loc: SourceLoc }
  | { kind: 'promise'; valueType: ValueType; name: Ident; loc: SourceLoc }
  | { kind: 'future'; valueType: ValueType; name: Ident; promise: Ident; loc: SourceLoc };

export interface ThreadDecl {
  name: Ident;
  body: Extract<Stmt, { kind: 'block' }>;
  loc: SourceLoc;
}

export interface FinalAssert {
  cond: Expr;
  loc: SourceLoc;
}

/** Un elemento del programa en el orden en que aparece (lo usa el generador de C++). */
export type TopLevel =
  | { kind: 'global'; decl: GlobalDecl }
  | { kind: 'thread'; decl: ThreadDecl }
  | { kind: 'finalAssert'; decl: FinalAssert };

export interface Program {
  items: TopLevel[];
  globals: GlobalDecl[];
  threads: ThreadDecl[];
  finalAsserts: FinalAssert[];
}
