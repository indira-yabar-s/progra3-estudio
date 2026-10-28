import type { SourceLoc } from './diagnostics';
import type { StepEvent } from './machine';

/**
 * Detector de data races basado en la relación happens-before (HB), implementado
 * con relojes vectoriales (la idea del algoritmo DJIT+/FastTrack).
 *
 * - Cada hilo t tiene un reloj vectorial C[t]: C[t][u] = "cuánto de la historia
 *   del hilo u conoce t".
 * - Soltar un mutex (unlock) publica el reloj del hilo en el mutex; tomarlo (lock)
 *   lo combina con el reloj del hilo. Así se crea la arista HB unlock → lock.
 * - set_value → get de una promise crea otra arista HB.
 * - Dos accesos a la misma variable, de hilos distintos, al menos uno escritura,
 *   y SIN relación HB entre ellos = data race.
 */

export type VectorClock = number[];

export interface Access {
  thread: number;
  /** Valor del reloj propio del hilo cuando hizo el acceso ("epoch"). */
  clock: number;
  kind: 'read' | 'write';
  loc: SourceLoc;
  /** Índice del paso dentro de la traza en que ocurrió. */
  step: number;
}

export interface RaceReport {
  g: number;
  first: Access;
  second: Access;
}

/** Arista happens-before entre dos pasos (para dibujar hilos cruzados en el telar). */
export interface SyncEdge {
  fromStep: number;
  toStep: number;
  kind: 'mutex' | 'promise';
}

export function joinInto(target: VectorClock, other: VectorClock): void {
  for (let i = 0; i < target.length; i++) target[i] = Math.max(target[i]!, other[i] ?? 0);
}

/** ¿El acceso `a` ocurre-antes que el estado actual del hilo con reloj `c`? */
export function happensBefore(a: Access, c: VectorClock): boolean {
  return a.clock <= (c[a.thread] ?? 0);
}

export class HBState {
  /** Reloj de cada hilo. */
  C: VectorClock[];
  /** Reloj publicado por el último unlock de cada mutex. */
  L: VectorClock[];
  /** Reloj publicado por set_value de cada promise. */
  P: VectorClock[];
  /** Última escritura de cada global. */
  W: (Access | null)[];
  /** Últimas lecturas de cada global, por hilo. */
  R: (Access | null)[][];
  /** Paso del último release de cada mutex / promise (para dibujar aristas HB). */
  lastRelease: { mutex: number[]; promise: number[] };

  constructor(threads: number, globals: number, mutexes: number, promises: number) {
    this.C = Array.from({ length: threads }, (_, t) =>
      Array.from({ length: threads }, (_, u) => (u === t ? 1 : 0)),
    );
    this.L = Array.from({ length: mutexes }, () => new Array<number>(threads).fill(0));
    this.P = Array.from({ length: promises }, () => new Array<number>(threads).fill(0));
    this.W = new Array<Access | null>(globals).fill(null);
    this.R = Array.from({ length: globals }, () => new Array<Access | null>(threads).fill(null));
    this.lastRelease = {
      mutex: new Array<number>(mutexes).fill(-1),
      promise: new Array<number>(promises).fill(-1),
    };
  }

  clone(): HBState {
    const c = Object.create(HBState.prototype) as HBState;
    c.C = this.C.map((v) => [...v]);
    c.L = this.L.map((v) => [...v]);
    c.P = this.P.map((v) => [...v]);
    c.W = [...this.W];
    c.R = this.R.map((r) => [...r]);
    c.lastRelease = { mutex: [...this.lastRelease.mutex], promise: [...this.lastRelease.promise] };
    return c;
  }

  /**
   * Procesa el evento de un paso. Devuelve las races detectadas y las aristas HB
   * creadas (de un release anterior a este acquire).
   */
  apply(
    thread: number,
    event: StepEvent,
    loc: SourceLoc,
    step: number,
  ): { races: RaceReport[]; edges: SyncEdge[] } {
    const races: RaceReport[] = [];
    const edges: SyncEdge[] = [];
    const C = this.C[thread]!;
    const now = (kind: 'read' | 'write'): Access => ({
      thread,
      clock: C[thread]!,
      kind,
      loc,
      step,
    });

    const acquireMutex = (m: number) => {
      joinInto(C, this.L[m]!);
      const from = this.lastRelease.mutex[m]!;
      if (from >= 0 && step >= 0) edges.push({ fromStep: from, toStep: step, kind: 'mutex' });
    };
    const releaseMutex = (m: number) => {
      this.L[m] = [...C];
      this.lastRelease.mutex[m] = step;
    };

    switch (event.kind) {
      case 'read': {
        const w = this.W[event.g];
        if (w && w.thread !== thread && !happensBefore(w, C)) {
          races.push({ g: event.g, first: w, second: now('read') });
        }
        this.R[event.g]![thread] = now('read');
        break;
      }
      case 'write': {
        const w = this.W[event.g];
        const access = now('write');
        if (w && w.thread !== thread && !happensBefore(w, C)) {
          races.push({ g: event.g, first: w, second: access });
        }
        for (const r of this.R[event.g]!) {
          if (r && r.thread !== thread && !happensBefore(r, C)) {
            races.push({ g: event.g, first: r, second: access });
          }
        }
        this.W[event.g] = access;
        this.R[event.g] = this.R[event.g]!.map(() => null);
        break;
      }
      case 'lock':
        acquireMutex(event.m);
        break;
      case 'lockAll':
        for (const m of event.ms) acquireMutex(m);
        break;
      case 'unlock':
        releaseMutex(event.m);
        C[thread]!++;
        break;
      case 'release':
        if (event.ms.length > 0) {
          for (const m of event.ms) releaseMutex(m);
          C[thread]!++;
        }
        break;
      case 'wait':
        // wait suelta el mutex: es un release.
        releaseMutex(event.m);
        C[thread]!++;
        break;
      case 'setValue':
        this.P[event.p] = [...C];
        this.lastRelease.promise[event.p] = step;
        C[thread]!++;
        break;
      case 'get': {
        joinInto(C, this.P[event.p]!);
        const from = this.lastRelease.promise[event.p]!;
        if (from >= 0) edges.push({ fromStep: from, toStep: step, kind: 'promise' });
        break;
      }
      default:
        break;
    }
    return { races, edges };
  }
}

/** Clave de una race: se reporta una sola vez por variable. */
export function raceKey(r: RaceReport): string {
  return `race:${r.g}`;
}
