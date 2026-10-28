import type { Value } from './ast';
import type { SourceLoc } from './diagnostics';
import { HBState, type RaceReport, type SyncEdge } from './happensBefore';
import type { Machine, MachineState, RuntimeFailure, StepEvent, Transition } from './machine';
import { buildWaitGraph, type WaitGraph } from './waitGraph';

/**
 * Una traza es una ejecución concreta (una intercalación) reproducida paso a paso,
 * con una foto completa del estado después de cada paso. Es lo que el reproductor
 * de la interfaz muestra.
 */

export type ThreadView = 'ready' | 'blocked' | 'waiting' | 'done' | 'failed';

export interface Snapshot {
  globals: Value[];
  owner: number[];
  cvWaiters: number[][];
  promise: (Value | null)[];
  threads: { view: ThreadView; loc: SourceLoc | null }[];
  waitGraph: WaitGraph;
  /** Reloj vectorial de cada hilo en este punto. */
  clocks: number[][];
}

export interface TraceStep {
  index: number;
  thread: number;
  choice: number;
  event: StepEvent;
  loc: SourceLoc;
  after: Snapshot;
  races: RaceReport[];
  syncEdges: SyncEdge[];
}

export type TraceEnd =
  | { kind: 'finished'; finalAssert: { text: string; loc: SourceLoc } | null }
  | { kind: 'deadlock'; waitGraph: WaitGraph }
  | { kind: 'failure'; failure: RuntimeFailure }
  | { kind: 'partial' };

export interface Trace {
  initial: Snapshot;
  steps: TraceStep[];
  end: TraceEnd;
}

export function snapshot(machine: Machine, s: MachineState, hb: HBState): Snapshot {
  return {
    globals: [...s.globals],
    owner: [...s.owner],
    cvWaiters: s.cvWaiters.map((w) => [...w]),
    promise: [...s.promise],
    threads: s.threads.map((ts, t) => {
      let view: ThreadView;
      if (s.failure && s.failure.thread === t) view = 'failed';
      else if (ts.status === 'done') view = 'done';
      else if (ts.status === 'cv') view = 'waiting';
      else view = machine.isEnabled(s, t) || s.failure ? 'ready' : 'blocked';
      return {
        view,
        loc: ts.status === 'done' ? null : machine.instrAt(s, t).loc,
      };
    }),
    waitGraph: buildWaitGraph(machine, s),
    clocks: hb.C.map((c) => [...c]),
  };
}

/** Reproduce una secuencia de transiciones y construye la traza detallada. */
export function replay(machine: Machine, schedule: Transition[]): Trace {
  const prog = machine.program;
  let state = machine.initialState();
  const hb = new HBState(
    machine.threadCount,
    prog.globals.length,
    prog.mutexes.length,
    prog.promises.length,
  );
  const initial = snapshot(machine, state, hb);
  const steps: TraceStep[] = [];

  for (const tr of schedule) {
    if (!machine.isEnabled(state, tr.thread)) {
      throw new Error(
        `Traza inválida: el hilo ${tr.thread} no puede avanzar en el paso ${steps.length}`,
      );
    }
    const { state: next, event, loc } = machine.step(state, tr);
    const { races, edges } = hb.apply(tr.thread, event, loc, steps.length);
    state = next;
    steps.push({
      index: steps.length,
      thread: tr.thread,
      choice: tr.choice,
      event,
      loc,
      after: snapshot(machine, state, hb),
      races,
      syncEdges: edges,
    });
  }

  let end: TraceEnd;
  if (state.failure) end = { kind: 'failure', failure: state.failure };
  else if (machine.enabledTransitions(state).length > 0) end = { kind: 'partial' };
  else if (machine.isFinished(state))
    end = { kind: 'finished', finalAssert: machine.checkFinalAsserts(state) };
  else end = { kind: 'deadlock', waitGraph: buildWaitGraph(machine, state) };

  return { initial, steps, end };
}

/** Ejecuta hasta el final eligiendo siempre el primer hilo habilitado (una ejecución "normal"). */
export function defaultSchedule(machine: Machine, maxSteps = 2000): Transition[] {
  let s = machine.initialState();
  const out: Transition[] = [];
  while (out.length < maxSteps && !s.failure) {
    const en = machine.enabledTransitions(s);
    if (en.length === 0) break;
    // Round-robin suave: preferimos un hilo distinto al anterior para que se vea la intercalación.
    const last = out[out.length - 1]?.thread ?? -1;
    const tr = en.find((t) => t.thread > last) ?? en[0]!;
    out.push(tr);
    s = machine.step(s, tr).state;
  }
  return out;
}
