import type { Machine, MachineState } from './machine';

/**
 * Grafo de espera (wait-for graph): hay una arista A → B cuando el hilo A está
 * bloqueado esperando un mutex que tiene B. Un ciclo en este grafo es un deadlock:
 * todos los hilos del ciclo esperan a otro del ciclo y ninguno puede avanzar.
 */

export interface WaitEdge {
  from: number;
  to: number;
  mutex: number;
}

export type BlockReason =
  | { kind: 'mutex'; mutex: number; owner: number }
  | { kind: 'mutexes'; mutexes: number[] }
  | { kind: 'cv'; cv: number }
  | { kind: 'future'; promise: number };

export interface WaitGraph {
  edges: WaitEdge[];
  blocked: { thread: number; reason: BlockReason }[];
  /** Hilos que forman el ciclo, en orden, o null si no hay ciclo. */
  cycle: number[] | null;
}

export function buildWaitGraph(machine: Machine, state: MachineState): WaitGraph {
  const edges: WaitEdge[] = [];
  const blocked: WaitGraph['blocked'] = [];

  state.threads.forEach((ts, t) => {
    if (ts.status === 'done') return;
    if (ts.status === 'cv') {
      const ins = machine.program.threads[t]!.code[ts.pc - 1];
      blocked.push({
        thread: t,
        reason: { kind: 'cv', cv: ins && ins.op === 'wait' ? ins.cv : 0 },
      });
      return;
    }
    if (machine.isEnabled(state, t)) return;
    const ins = machine.instrAt(state, t);
    if (ins.op === 'lock') {
      const owner = state.owner[ins.m]!;
      edges.push({ from: t, to: owner, mutex: ins.m });
      blocked.push({ thread: t, reason: { kind: 'mutex', mutex: ins.m, owner } });
    } else if (ins.op === 'lockAll') {
      const taken = ins.ms.filter((m) => state.owner[m] !== -1);
      for (const m of taken) edges.push({ from: t, to: state.owner[m]!, mutex: m });
      blocked.push({ thread: t, reason: { kind: 'mutexes', mutexes: taken } });
    } else if (ins.op === 'get') {
      blocked.push({ thread: t, reason: { kind: 'future', promise: ins.p } });
    }
  });

  return { edges, blocked, cycle: findCycle(state.threads.length, edges) };
}

/** Busca un ciclo con DFS (colores blanco/gris/negro). */
export function findCycle(n: number, edges: { from: number; to: number }[]): number[] | null {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) adj[e.from]!.push(e.to);
  const color = new Array<number>(n).fill(0);
  const stack: number[] = [];

  const dfs = (u: number): number[] | null => {
    color[u] = 1;
    stack.push(u);
    for (const v of adj[u]!) {
      if (color[v] === 1) return stack.slice(stack.indexOf(v));
      if (color[v] === 0) {
        const c = dfs(v);
        if (c) return c;
      }
    }
    stack.pop();
    color[u] = 2;
    return null;
  };

  for (let u = 0; u < n; u++) {
    if (color[u] === 0) {
      const c = dfs(u);
      if (c) return c;
    }
  }
  return null;
}
