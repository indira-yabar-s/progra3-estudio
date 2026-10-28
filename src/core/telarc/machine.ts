import type { Value } from './ast';
import { EvalError, INVISIBLE_OPS, evalExpr, type CompiledProgram, type Instr } from './compiler';
import type { Bilingual, SourceLoc } from './diagnostics';

/**
 * Máquina de estados de TelarC.
 *
 * Un estado es una "foto" completa del programa: memoria global, el contador de
 * programa y las variables locales de cada hilo, quién tiene cada mutex, quién
 * duerme en cada condition_variable y qué promises tienen valor.
 * Una transición es "el hilo T ejecuta su siguiente paso atómico".
 */

export type ThreadStatus = 'run' | 'cv' | 'done';

export interface ThreadState {
  pc: number;
  status: ThreadStatus;
  locals: Value[];
  regs: Value[];
}

export interface RuntimeFailure {
  kind: 'assert' | 'runtime';
  thread: number;
  loc: SourceLoc;
  message: Bilingual;
}

export interface MachineState {
  globals: Value[];
  threads: ThreadState[];
  /** Hilo dueño de cada mutex, o -1 si está libre. */
  owner: number[];
  /** Hilos dormidos en cada condition_variable (ordenados). */
  cvWaiters: number[][];
  /** Valor de cada promise, o null si todavía no se llamó set_value. */
  promise: (Value | null)[];
  failure: RuntimeFailure | null;
}

/** "El hilo `thread` da su siguiente paso". `choice` elige a quién despierta un notify_one. */
export interface Transition {
  thread: number;
  choice: number;
}

/** Qué ocurrió en un paso: lo usan los relojes vectoriales y la visualización. */
export type StepEvent =
  | { kind: 'read'; g: number; value: Value }
  | { kind: 'write'; g: number; value: Value; old: Value }
  | { kind: 'assert'; ok: boolean; text: string }
  | { kind: 'lock'; m: number; reacquire: boolean }
  | { kind: 'unlock'; m: number }
  | { kind: 'lockAll'; ms: number[] }
  | { kind: 'release'; ms: number[]; guard: string }
  | { kind: 'wait'; cv: number; m: number }
  | { kind: 'notify'; cv: number; all: boolean; woken: number[] }
  | { kind: 'setValue'; p: number; value: Value }
  | { kind: 'get'; p: number; value: Value }
  | { kind: 'runtimeError' };

export interface StepResult {
  state: MachineState;
  event: StepEvent;
  loc: SourceLoc;
}

/** Huella de un paso: qué memoria y qué objetos de sincronización toca. */
export interface Footprint {
  reads: number[];
  writes: number[];
  /** Ids de objetos de sincronización (mutex, cv, promise) en un espacio común. */
  objects: number[];
}

/** Máximo de instrucciones locales seguidas antes de declarar un bucle infinito. */
const MAX_LOCAL_STEPS = 10_000;

export class Machine {
  constructor(readonly program: CompiledProgram) {}

  get threadCount(): number {
    return this.program.threads.length;
  }

  // ───────────────────────── estado inicial ─────────────────────────

  initialState(): MachineState {
    const p = this.program;
    const state: MachineState = {
      globals: p.globals.map((g) => g.init),
      threads: p.threads.map((t) => ({
        pc: 0,
        status: 'run',
        locals: t.locals.map((l) => (l.type === 'int' ? 0 : false)),
        regs: [],
      })),
      owner: p.mutexes.map(() => -1),
      cvWaiters: p.cvs.map(() => []),
      promise: p.promises.map(() => null),
      failure: null,
    };
    for (let t = 0; t < state.threads.length; t++) this.runInvisible(state, t);
    return state;
  }

  // ───────────────────────── consultas ─────────────────────────

  instrAt(state: MachineState, thread: number): Instr {
    return this.program.threads[thread]!.code[state.threads[thread]!.pc]!;
  }

  /** ¿Puede el hilo dar su siguiente paso ahora mismo? */
  isEnabled(state: MachineState, thread: number): boolean {
    const ts = state.threads[thread]!;
    if (ts.status !== 'run' || state.failure) return false;
    const ins = this.instrAt(state, thread);
    switch (ins.op) {
      case 'end':
        return false;
      case 'lock':
        return state.owner[ins.m] === -1;
      case 'lockAll':
        return ins.ms.every((m) => state.owner[m] === -1);
      case 'get':
        return state.promise[ins.p] !== null;
      default:
        return true;
    }
  }

  enabledTransitions(state: MachineState): Transition[] {
    const out: Transition[] = [];
    for (let t = 0; t < state.threads.length; t++) {
      if (!this.isEnabled(state, t)) continue;
      const ins = this.instrAt(state, t);
      const waiters = ins.op === 'notify' && !ins.all ? state.cvWaiters[ins.cv]!.length : 0;
      if (waiters > 1) {
        // notify_one con varios dormidos: el sistema elige a cuál despertar → varias ramas.
        for (let c = 0; c < waiters; c++) out.push({ thread: t, choice: c });
      } else {
        out.push({ thread: t, choice: 0 });
      }
    }
    return out;
  }

  isFinished(state: MachineState): boolean {
    return state.threads.every((t) => t.status === 'done');
  }

  /** Huella estática de la siguiente instrucción del hilo (para POR). */
  footprint(state: MachineState, thread: number): Footprint {
    return this.footprintOf(this.instrAt(state, thread));
  }

  footprintOf(ins: Instr): Footprint {
    const M = this.program.mutexes.length;
    const C = this.program.cvs.length;
    const mutexObj = (m: number) => m;
    const cvObj = (c: number) => M + c;
    const promiseObj = (p: number) => M + C + p;
    switch (ins.op) {
      case 'load':
        return { reads: [ins.g], writes: [], objects: [] };
      case 'store':
        return { reads: [], writes: [ins.g], objects: [] };
      case 'lock':
      case 'unlock':
        return { reads: [], writes: [], objects: [mutexObj(ins.m)] };
      case 'lockAll':
      case 'release':
        return { reads: [], writes: [], objects: ins.ms.map(mutexObj) };
      case 'wait':
        return { reads: [], writes: [], objects: [mutexObj(ins.m), cvObj(ins.cv)] };
      case 'notify':
        return { reads: [], writes: [], objects: [cvObj(ins.cv)] };
      case 'setValue':
      case 'get':
        return { reads: [], writes: [], objects: [promiseObj(ins.p)] };
      default:
        // assert y las instrucciones locales no tocan nada compartido.
        return { reads: [], writes: [], objects: [] };
    }
  }

  // ───────────────────────── ejecución ─────────────────────────

  /** Ejecuta un paso visible del hilo y luego todas sus instrucciones locales siguientes. */
  step(state: MachineState, tr: Transition): StepResult {
    const s = cloneState(state);
    const t = tr.thread;
    const ts = s.threads[t]!;
    const ins = this.instrAt(s, t);
    const env = { globals: s.globals, locals: ts.locals, regs: ts.regs };
    let event: StepEvent;

    try {
      switch (ins.op) {
        case 'load': {
          const value = s.globals[ins.g]!;
          ts.regs[ins.reg] = value;
          event = { kind: 'read', g: ins.g, value };
          ts.pc++;
          break;
        }
        case 'store': {
          const value = evalExpr(ins.expr, env);
          const old = s.globals[ins.g]!;
          s.globals[ins.g] = value;
          ts.regs = [];
          event = { kind: 'write', g: ins.g, value, old };
          ts.pc++;
          break;
        }
        case 'assert': {
          const ok = evalExpr(ins.cond, env) as boolean;
          ts.regs = [];
          event = { kind: 'assert', ok, text: ins.text };
          if (!ok) {
            s.failure = {
              kind: 'assert',
              thread: t,
              loc: ins.loc,
              message: {
                es: `Falló assert(${ins.text}) en ${this.program.threads[t]!.name}`,
                en: `assert(${ins.text}) failed in ${this.program.threads[t]!.name}`,
              },
            };
          }
          ts.pc++;
          break;
        }
        case 'lock':
          s.owner[ins.m] = t;
          event = { kind: 'lock', m: ins.m, reacquire: ins.reacquire };
          ts.pc++;
          break;
        case 'lockAll':
          for (const m of ins.ms) s.owner[m] = t;
          event = { kind: 'lockAll', ms: ins.ms };
          ts.pc++;
          break;
        case 'unlock':
          if (s.owner[ins.m] !== t) {
            const name = this.program.mutexes[ins.m]!.name;
            this.fail(s, t, ins.loc, {
              es: `${this.program.threads[t]!.name} hizo ${name}.unlock() sin tener ${name} (comportamiento indefinido en C++)`,
              en: `${this.program.threads[t]!.name} called ${name}.unlock() without owning ${name} (undefined behavior in C++)`,
            });
            event = { kind: 'runtimeError' };
            break;
          }
          s.owner[ins.m] = -1;
          event = { kind: 'unlock', m: ins.m };
          ts.pc++;
          break;
        case 'release': {
          const released = ins.ms.filter((m) => s.owner[m] === t);
          for (const m of released) s.owner[m] = -1;
          event = { kind: 'release', ms: released, guard: ins.guard };
          ts.pc++;
          break;
        }
        case 'wait':
          if (s.owner[ins.m] !== t) {
            const name = this.program.mutexes[ins.m]!.name;
            this.fail(s, t, ins.loc, {
              es: `wait() exige tener tomado ${name}, pero ${this.program.threads[t]!.name} no lo tiene`,
              en: `wait() requires holding ${name}, but ${this.program.threads[t]!.name} does not`,
            });
            event = { kind: 'runtimeError' };
            break;
          }
          // Atómico: suelta el mutex y se duerme en la cv.
          s.owner[ins.m] = -1;
          ts.status = 'cv';
          s.cvWaiters[ins.cv] = [...s.cvWaiters[ins.cv]!, t].sort((a, b) => a - b);
          event = { kind: 'wait', cv: ins.cv, m: ins.m };
          ts.pc++;
          break;
        case 'notify': {
          const waiters = s.cvWaiters[ins.cv]!;
          let woken: number[];
          if (ins.all) woken = [...waiters];
          else woken = waiters.length > 0 ? [waiters[tr.choice]!] : [];
          for (const w of woken) s.threads[w]!.status = 'run';
          s.cvWaiters[ins.cv] = waiters.filter((w) => !woken.includes(w));
          event = { kind: 'notify', cv: ins.cv, all: ins.all, woken };
          ts.pc++;
          break;
        }
        case 'setValue': {
          if (s.promise[ins.p] !== null) {
            const name = this.program.promises[ins.p]!.name;
            this.fail(s, t, ins.loc, {
              es: `set_value() se llamó dos veces sobre ${name} (en C++ lanza promise_already_satisfied)`,
              en: `set_value() was called twice on ${name} (C++ throws promise_already_satisfied)`,
            });
            event = { kind: 'runtimeError' };
            break;
          }
          const value = evalExpr(ins.expr, env);
          ts.regs = [];
          s.promise[ins.p] = value;
          event = { kind: 'setValue', p: ins.p, value };
          ts.pc++;
          break;
        }
        case 'get': {
          const value = s.promise[ins.p]!;
          ts.regs[ins.reg] = value;
          event = { kind: 'get', p: ins.p, value };
          ts.pc++;
          break;
        }
        default:
          throw new Error(`Instrucción no ejecutable como paso visible: ${ins.op}`);
      }
    } catch (e) {
      if (!(e instanceof EvalError)) throw e;
      this.fail(s, t, ins.loc, e.bilingual);
      event = { kind: 'runtimeError' };
    }

    if (!s.failure) this.runInvisible(s, t);
    return { state: s, event, loc: ins.loc };
  }

  /** Avanza el hilo por sus instrucciones locales (no observables por otros hilos). */
  private runInvisible(s: MachineState, t: number): void {
    const ts = s.threads[t]!;
    const code = this.program.threads[t]!.code;
    let count = 0;
    for (;;) {
      const ins = code[ts.pc]!;
      if (ins.op === 'end') {
        ts.status = 'done';
        ts.regs = [];
        return;
      }
      if (!INVISIBLE_OPS.has(ins.op)) return;
      if (++count > MAX_LOCAL_STEPS) {
        this.fail(s, t, ins.loc, {
          es: `Bucle infinito en ${this.program.threads[t]!.name}: se repite sin leer ni escribir memoria compartida`,
          en: `Infinite loop in ${this.program.threads[t]!.name}: it repeats without touching shared memory`,
        });
        return;
      }
      const env = { globals: s.globals, locals: ts.locals, regs: ts.regs };
      try {
        if (ins.op === 'setLocal') {
          ts.locals[ins.slot] = evalExpr(ins.expr, env);
          ts.regs = [];
          ts.pc++;
        } else if (ins.op === 'branchFalse') {
          const c = evalExpr(ins.cond, env) as boolean;
          ts.regs = [];
          ts.pc = c ? ts.pc + 1 : ins.target;
        } else if (ins.op === 'jump') {
          ts.pc = ins.target;
        }
      } catch (e) {
        if (!(e instanceof EvalError)) throw e;
        this.fail(s, t, ins.loc, e.bilingual);
        return;
      }
    }
  }

  private fail(s: MachineState, thread: number, loc: SourceLoc, message: Bilingual): void {
    s.failure = { kind: 'runtime', thread, loc, message };
  }

  /** Evalúa los assert() finales (cuando todos los hilos terminaron). */
  checkFinalAsserts(state: MachineState): { text: string; loc: SourceLoc } | null {
    for (const fa of this.program.finalAsserts) {
      const ok = evalExpr(fa.cond, { globals: state.globals, locals: [], regs: [] });
      if (!ok) return { text: fa.text, loc: fa.loc };
    }
    return null;
  }

  // ───────────────────────── hashing ─────────────────────────

  /** Clave canónica del estado: dos estados con la misma clave son idénticos. */
  hash(s: MachineState): string {
    let h = s.globals.map(valueKey).join(',');
    for (const t of s.threads) {
      h += `|${t.pc}${t.status[0]}${t.locals.map(valueKey).join(',')}/${t.regs.map(valueKey).join(',')}`;
    }
    h += `|m${s.owner.join(',')}|c${s.cvWaiters.map((w) => w.join('.')).join(',')}`;
    h += `|p${s.promise.map((v) => (v === null ? '_' : valueKey(v))).join(',')}`;
    if (s.failure) h += '|F';
    return h;
  }
}

function valueKey(v: Value): string {
  return typeof v === 'boolean' ? (v ? 'T' : 'F') : String(v);
}

export function cloneState(s: MachineState): MachineState {
  return {
    globals: [...s.globals],
    threads: s.threads.map((t) => ({
      pc: t.pc,
      status: t.status,
      locals: [...t.locals],
      regs: [...t.regs],
    })),
    owner: [...s.owner],
    cvWaiters: s.cvWaiters.map((w) => [...w]),
    promise: [...s.promise],
    failure: s.failure,
  };
}

/** Dos pasos son dependientes si tocan el mismo objeto de sincronización
 *  o la misma variable y al menos uno escribe. Si son independientes, el
 *  orden en que se ejecutan no cambia el resultado. */
export function dependent(a: Footprint, b: Footprint): boolean {
  for (const o of a.objects) if (b.objects.includes(o)) return true;
  for (const w of a.writes) if (b.writes.includes(w) || b.reads.includes(w)) return true;
  for (const w of b.writes) if (a.reads.includes(w)) return true;
  return false;
}
