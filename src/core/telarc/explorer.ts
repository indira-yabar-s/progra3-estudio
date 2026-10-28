import type { Value } from './ast';
import { HBState, raceKey, type RaceReport } from './happensBefore';
import type { Instr } from './compiler';
import { dependent, type Machine, type MachineState, type Transition } from './machine';

/**
 * Explorador del espacio de estados.
 *
 * Recorre con DFS (pila explícita, sin recursión) TODAS las intercalaciones
 * posibles de los hilos. Cada estado se identifica por un hash canónico: si
 * llegamos a un estado ya visitado por otro camino, no lo volvemos a explorar.
 *
 * Reducción de orden parcial (POR), dos técnicas combinadas:
 *  1. Sleep sets: si en un estado ya exploramos el paso `a` y luego exploramos
 *     `b` independiente de `a`, no hace falta volver a probar `a` después de `b`
 *     (a·b y b·a llevan al mismo estado). `a` "duerme" en esa rama.
 *  2. Ample sets estáticos: si un hilo va a ejecutar un paso que toca solo cosas
 *     que ningún otro hilo usa jamás, basta con probar ese paso (con la condición
 *     de ciclo: no usarlo si cierra un ciclo con la pila de DFS).
 */

export interface ExploreOptions {
  maxStates: number;
  maxDepth: number;
  por: boolean;
  /** Guardar el grafo explorado (necesario para trazas mínimas y el árbol). */
  recordGraph: boolean;
  onProgress?: (p: ExploreProgress) => void;
  progressEvery?: number;
}

export interface ExploreProgress {
  states: number;
  transitions: number;
  depth: number;
}

export type RawFinding =
  | {
      kind: 'race';
      key: string;
      race: RaceReport;
      fromNode: number;
      transition: Transition;
      dfsSchedule: Transition[];
    }
  | { kind: 'deadlock'; key: string; node: number; dfsSchedule: Transition[] }
  | { kind: 'assert' | 'runtime'; key: string; node: number; dfsSchedule: Transition[] }
  | { kind: 'finalAssert'; key: string; node: number; dfsSchedule: Transition[]; text: string };

export interface Outcome {
  key: string;
  globals: Value[];
  node: number;
  dfsSchedule: Transition[];
}

export interface ExploredGraph {
  /** Padre en el árbol DFS (-1 para la raíz). */
  parent: number[];
  parentTransition: (Transition | null)[];
  depth: number[];
  error: boolean[];
  terminal: boolean[];
  edgeFrom: number[];
  edgeTo: number[];
  edgeTransition: Transition[];
}

export interface ExploreResult {
  states: number;
  transitions: number;
  revisits: number;
  /** Transiciones que POR evitó ejecutar (sleep sets + ample sets). */
  prunedTransitions: number;
  complete: boolean;
  depthLimitHit: boolean;
  maxDepthReached: number;
  findings: RawFinding[];
  outcomes: Outcome[];
  graph: ExploredGraph | null;
}

const MAX_FINDINGS = 25;
const MAX_OUTCOMES = 50;

interface Frame {
  id: number;
  state: MachineState;
  hb: HBState;
  /** Hilos dormidos (máscara de bits). */
  sleep: number;
  /** Si no es null, solo explorar transiciones de estos hilos (re-visita con sleep menor). */
  only: number | null;
  todo: Transition[] | null;
  idx: number;
  /** Hilos ya explorados desde este estado (para formar el sleep set de los hijos). */
  done: number;
  /** Transición que llevó a este frame (para reconstruir la traza DFS). */
  via: Transition | null;
}

export function explore(machine: Machine, opts: ExploreOptions): ExploreResult {
  const T = machine.threadCount;
  if (T > 30) throw new Error('Demasiados hilos (máximo 30)');
  const prog = machine.program;
  const safeStep = computeSafeSteps(machine);

  const visited = new Map<string, number>();
  const sleepStore: number[] = [];
  const onStack: boolean[] = [];
  const graph: ExploredGraph | null = opts.recordGraph
    ? {
        parent: [],
        parentTransition: [],
        depth: [],
        error: [],
        terminal: [],
        edgeFrom: [],
        edgeTo: [],
        edgeTransition: [],
      }
    : null;

  const result: ExploreResult = {
    states: 0,
    transitions: 0,
    revisits: 0,
    prunedTransitions: 0,
    complete: true,
    depthLimitHit: false,
    maxDepthReached: 0,
    findings: [],
    outcomes: [],
    graph,
  };
  const findingKeys = new Set<string>();
  const outcomeKeys = new Set<string>();
  const progressEvery = opts.progressEvery ?? 2000;

  const addNode = (key: string, parent: number, via: Transition | null, depth: number): number => {
    const id = result.states++;
    visited.set(key, id);
    sleepStore[id] = 0;
    onStack[id] = false;
    if (graph) {
      graph.parent.push(parent);
      graph.parentTransition.push(via);
      graph.depth.push(depth);
      graph.error.push(false);
      graph.terminal.push(false);
    }
    if (opts.onProgress && result.states % progressEvery === 0) {
      opts.onProgress({ states: result.states, transitions: result.transitions, depth });
    }
    return id;
  };

  const stack: Frame[] = [];
  const schedule = (): Transition[] => stack.slice(1).map((f) => f.via!);
  const markError = (id: number) => {
    if (graph) graph.error[id] = true;
  };
  const addFinding = (f: RawFinding) => {
    if (findingKeys.has(f.key) || result.findings.length >= MAX_FINDINGS) return;
    findingKeys.add(f.key);
    result.findings.push(f);
  };

  const init = machine.initialState();
  const hb0 = new HBState(T, prog.globals.length, prog.mutexes.length, prog.promises.length);
  const rootId = addNode(machine.hash(init), -1, null, 0);
  stack.push({
    id: rootId,
    state: init,
    hb: hb0,
    sleep: 0,
    only: null,
    todo: null,
    idx: 0,
    done: 0,
    via: null,
  });
  onStack[rootId] = true;

  while (stack.length > 0) {
    const f = stack[stack.length - 1]!;

    if (f.todo === null) {
      f.todo = [];
      result.maxDepthReached = Math.max(result.maxDepthReached, stack.length - 1);
      const s = f.state;
      if (s.failure) {
        markError(f.id);
        if (graph) graph.terminal[f.id] = true;
        addFinding({
          kind: s.failure.kind,
          key: `${s.failure.kind}:${s.failure.loc.line}:${s.failure.message.es}`,
          node: f.id,
          dfsSchedule: schedule(),
        });
      } else {
        const enabled = machine.enabledTransitions(s);
        if (enabled.length === 0) {
          if (graph) graph.terminal[f.id] = true;
          if (machine.isFinished(s)) {
            const failed = machine.checkFinalAsserts(s);
            if (failed) {
              markError(f.id);
              addFinding({
                kind: 'finalAssert',
                key: `final:${failed.text}`,
                node: f.id,
                dfsSchedule: schedule(),
                text: failed.text,
              });
            }
            const okey = s.globals.map(String).join(',');
            if (!outcomeKeys.has(okey) && result.outcomes.length < MAX_OUTCOMES) {
              outcomeKeys.add(okey);
              result.outcomes.push({
                key: okey,
                globals: [...s.globals],
                node: f.id,
                dfsSchedule: schedule(),
              });
            }
          } else {
            markError(f.id);
            const blockedAt = s.threads
              .map((ts, t) =>
                ts.status === 'done' ? '' : `${t}@${machine.instrAt(s, t).loc.line}`,
              )
              .filter(Boolean)
              .join(',');
            addFinding({
              kind: 'deadlock',
              key: `deadlock:${blockedAt}`,
              node: f.id,
              dfsSchedule: schedule(),
            });
          }
        } else if (stack.length - 1 >= opts.maxDepth) {
          result.depthLimitHit = true;
          result.complete = false;
        } else {
          f.todo = selectTransitions(
            machine,
            f,
            enabled,
            opts.por,
            safeStep,
            visited,
            onStack,
            result,
          );
        }
      }
    }

    if (f.idx >= f.todo.length) {
      onStack[f.id] = false;
      stack.pop();
      continue;
    }

    const tr = f.todo[f.idx++]!;
    const { state: next, event, loc } = machine.step(f.state, tr);
    result.transitions++;

    const hb = f.hb.clone();
    const { races } = hb.apply(tr.thread, event, loc, stack.length - 1);

    // Sleep set del hijo: lo que dormía o ya exploramos aquí y es independiente de `tr`.
    const fp = machine.footprint(f.state, tr.thread);
    let childSleep = 0;
    const candidates = (f.sleep | f.done) & ~(1 << tr.thread);
    for (let u = 0; u < T; u++) {
      if (candidates & (1 << u) && !dependent(fp, machine.footprint(f.state, u)))
        childSleep |= 1 << u;
    }
    if (isDeterministic(f.todo, tr)) f.done |= 1 << tr.thread;
    if (!opts.por) childSleep = 0;

    const key = machine.hash(next);
    let childId = visited.get(key);
    const isNew = childId === undefined;
    if (isNew) {
      if (result.states >= opts.maxStates) {
        result.complete = false;
        break;
      }
      childId = addNode(key, f.id, tr, stack.length);
    }
    const cid = childId!;
    if (graph) {
      graph.edgeFrom.push(f.id);
      graph.edgeTo.push(cid);
      graph.edgeTransition.push(tr);
    }

    for (const race of races) {
      markError(cid);
      addFinding({
        kind: 'race',
        key: raceKey(race),
        race,
        fromNode: f.id,
        transition: tr,
        dfsSchedule: [...schedule(), tr],
      });
    }

    if (isNew) {
      sleepStore[cid] = childSleep;
      onStack[cid] = true;
      stack.push({
        id: cid,
        state: next,
        hb,
        sleep: childSleep,
        only: null,
        todo: null,
        idx: 0,
        done: 0,
        via: tr,
      });
      continue;
    }

    result.revisits++;
    // Re-visita: solo hace falta volver a explorar si antes dormían hilos que ahora no duermen.
    const stored = sleepStore[cid]!;
    const missing = stored & ~childSleep;
    if (missing !== 0 && !onStack[cid]) {
      sleepStore[cid] = stored & childSleep;
      onStack[cid] = true;
      stack.push({
        id: cid,
        state: next,
        hb,
        sleep: stored & childSleep,
        only: missing,
        todo: null,
        idx: 0,
        done: 0,
        via: tr,
      });
    }
  }

  opts.onProgress?.({
    states: result.states,
    transitions: result.transitions,
    depth: result.maxDepthReached,
  });
  return result;
}

function isDeterministic(todo: Transition[], tr: Transition): boolean {
  let n = 0;
  for (const t of todo) if (t.thread === tr.thread) n++;
  return n === 1;
}

function selectTransitions(
  machine: Machine,
  f: Frame,
  enabled: Transition[],
  por: boolean,
  safeStep: (state: MachineState, thread: number) => boolean,
  visited: Map<string, number>,
  onStack: boolean[],
  result: ExploreResult,
): Transition[] {
  if (!por) return enabled;
  let cand = enabled.filter((t) => !(f.sleep & (1 << t.thread)) || !isDeterministic(enabled, t));
  if (f.only !== null) cand = cand.filter((t) => f.only! & (1 << t.thread));

  // Ample set: un paso seguro (independiente de todo lo que hagan los demás) basta por sí solo.
  for (const t of cand) {
    if (!isDeterministic(enabled, t) || !safeStep(f.state, t.thread)) continue;
    const succ = machine.step(f.state, t).state;
    const id = visited.get(machine.hash(succ));
    if (id !== undefined && onStack[id]) continue; // condición de ciclo (C3)
    result.prunedTransitions += enabled.length - 1;
    return [t];
  }
  result.prunedTransitions += enabled.length - cand.length;
  return cand;
}

/**
 * Precalcula qué pasos son "seguros" para el ample set: pasos que son
 * independientes de TODO lo que cualquier otro hilo pueda hacer después.
 *
 * Un paso es seguro si:
 *  - toca solo variables/objetos que ningún otro hilo usa jamás; o
 *  - es una lectura de una variable que ningún otro hilo escribe; o
 *  - accede a una variable protegida: el hilo tiene tomado un mutex m y todos
 *    los accesos de otros hilos a esa variable ocurren también con m tomado
 *    (análisis estático de locksets). Mientras el hilo tenga m, nadie más
 *    puede tocar la variable.
 */
export function computeSafeSteps(
  machine: Machine,
): (state: MachineState, thread: number) => boolean {
  const threads = machine.program.threads;
  const locksets = threads.map((th) => mustLocksets(th.code, machine.program.mutexes.length));

  const users = new Map<string, Set<number>>();
  const use = (k: string, t: number) => {
    if (!users.has(k)) users.set(k, new Set());
    users.get(k)!.add(t);
  };
  /** Por variable: para cada acceso de cada hilo, los mutex que seguro tiene tomados. */
  const accesses = new Map<number, { thread: number; write: boolean; held: Set<number> }[]>();
  threads.forEach((th, t) => {
    th.code.forEach((ins, pc) => {
      const fp = machine.footprintOf(ins);
      for (const o of fp.objects) use(`o${o}`, t);
      for (const g of [...fp.reads, ...fp.writes]) {
        if (!accesses.has(g)) accesses.set(g, []);
        accesses.get(g)!.push({ thread: t, write: fp.writes.includes(g), held: locksets[t]![pc]! });
      }
    });
  });

  const objectPrivate = (o: number, t: number) => {
    const u = users.get(`o${o}`);
    return !u || (u.size === 1 && u.has(t));
  };
  const globalSafe = (g: number, write: boolean, t: number, held: Set<number>) => {
    const others = (accesses.get(g) ?? []).filter((a) => a.thread !== t);
    if (others.length === 0) return true;
    if (!write && others.every((a) => !a.write)) return true;
    for (const m of held) if (others.every((a) => a.held.has(m))) return true;
    return false;
  };

  return (state, thread) => {
    const pc = state.threads[thread]!.pc;
    const fp = machine.footprint(state, thread);
    const held = locksets[thread]![pc]!;
    return (
      fp.objects.every((o) => objectPrivate(o, thread)) &&
      fp.reads.every((g) => globalSafe(g, false, thread, held)) &&
      fp.writes.every((g) => globalSafe(g, true, thread, held))
    );
  };
}

/**
 * Análisis de flujo de datos "must-lockset": para cada instrucción, el conjunto
 * de mutex que el hilo tiene tomados SEGURO (por cualquier camino) antes de
 * ejecutarla. Se combina por intersección en los puntos donde se juntan caminos.
 */
export function mustLocksets(code: Instr[], mutexCount: number): Set<number>[] {
  const all = new Set(Array.from({ length: mutexCount }, (_, i) => i));
  const IN: (Set<number> | null)[] = code.map(() => null);
  IN[0] = new Set();
  const work = [0];
  while (work.length > 0) {
    const pc = work.pop()!;
    const ins = code[pc]!;
    const out = new Set(IN[pc]!);
    switch (ins.op) {
      case 'lock':
        out.add(ins.m);
        break;
      case 'lockAll':
        for (const m of ins.ms) out.add(m);
        break;
      case 'unlock':
      case 'wait':
        out.delete(ins.m);
        break;
      case 'release':
        for (const m of ins.ms) out.delete(m);
        break;
      default:
        break;
    }
    const succ =
      ins.op === 'end'
        ? []
        : ins.op === 'jump'
          ? [ins.target]
          : ins.op === 'branchFalse'
            ? [pc + 1, ins.target]
            : [pc + 1];
    for (const s of succ) {
      const prev = IN[s] ?? null;
      const merged = prev === null ? out : new Set([...prev].filter((m) => out.has(m)));
      if (prev === null || merged.size !== prev.size) {
        IN[s] = merged;
        work.push(s);
      }
    }
  }
  return IN.map((s) => s ?? all);
}

/** BFS sobre el grafo explorado: camino más corto desde la raíz hasta cada nodo. */
export function shortestPaths(graph: ExploredGraph): { prevEdge: Int32Array; dist: Int32Array } {
  const n = graph.parent.length;
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let e = 0; e < graph.edgeFrom.length; e++) out[graph.edgeFrom[e]!]!.push(e);
  const dist = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  const queue: number[] = [0];
  dist[0] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]!;
    for (const e of out[u]!) {
      const v = graph.edgeTo[e]!;
      if (dist[v] === -1) {
        dist[v] = dist[u]! + 1;
        prevEdge[v] = e;
        queue.push(v);
      }
    }
  }
  return { prevEdge, dist };
}

export function pathTo(
  graph: ExploredGraph,
  prevEdge: Int32Array,
  node: number,
): Transition[] | null {
  const path: Transition[] = [];
  let v = node;
  while (v !== 0) {
    const e = prevEdge[v]!;
    if (e < 0) return null;
    path.push(graph.edgeTransition[e]!);
    v = graph.edgeFrom[e]!;
  }
  return path.reverse();
}
