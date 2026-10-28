import type { Value, ValueType } from './ast';
import { compile, type CompiledProgram } from './compiler';
import { TelarCError, type Bilingual, type Diagnostic, type SourceLoc } from './diagnostics';
import {
  explore,
  pathTo,
  shortestPaths,
  type ExploreProgress,
  type ExploreResult,
  type RawFinding,
} from './explorer';
import { raceKey } from './happensBefore';
import { Machine, type Transition } from './machine';
import { parse } from './parser';
import { defaultSchedule, replay, type Trace } from './trace';

/**
 * Punto de entrada del núcleo: código fuente → resultado de verificación.
 *   código → lexer → parser → AST → compilador → máquina → explorador → trazas
 */

export interface VerifyOptions {
  maxStates?: number;
  maxDepth?: number;
  por?: boolean;
  /** Explorar también sin POR para medir cuántos estados se ahorraron. */
  measureSavings?: boolean;
  /** Máximo de nodos del árbol de estados que se devuelven para dibujar. */
  maxTreeNodes?: number;
  onProgress?: (p: ExploreProgress & { phase: 'por' | 'baseline' }) => void;
}

export const DEFAULT_OPTIONS = {
  maxStates: 50_000,
  maxDepth: 500,
  por: true,
  measureSavings: true,
  maxTreeNodes: 2500,
} satisfies Required<Omit<VerifyOptions, 'onProgress'>>;

export type FindingKind =
  'race' | 'deadlock' | 'assert' | 'runtime' | 'finalAssert' | 'nondeterminism';

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: 'error' | 'warning';
  title: Bilingual;
  detail: Bilingual;
  /** Líneas de código implicadas (para resaltarlas en el editor). */
  locs: SourceLoc[];
  trace: Trace;
  /** Paso de la traza donde se manifiesta el problema (-1 = al final). */
  errorStep: number;
  /** Para no determinismo: cada resultado final distinto con su traza. */
  outcomes?: { globals: Value[]; trace: Trace }[];
}

export interface ProgramInfo {
  threads: string[];
  globals: { name: string; type: ValueType; init: Value }[];
  mutexes: string[];
  cvs: string[];
  promises: { name: string; future: string | null }[];
}

export interface TreeNode {
  id: number;
  parent: number;
  depth: number;
  thread: number;
  error: boolean;
  terminal: boolean;
}

export interface VerifyStats {
  states: number;
  transitions: number;
  revisits: number;
  complete: boolean;
  depthLimitHit: boolean;
  maxDepth: number;
  baseline: { states: number; transitions: number; complete: boolean } | null;
  timeMs: number;
}

export type VerifyResult =
  | { status: 'compileError'; diagnostic: Diagnostic }
  | {
      status: 'done';
      program: ProgramInfo;
      findings: Finding[];
      outcomes: { globals: Value[] }[];
      sampleTrace: Trace;
      tree: { nodes: TreeNode[]; truncated: boolean; total: number };
      stats: VerifyStats;
    };

/** Solo compila (para validar mientras el usuario escribe). */
export function check(source: string): Diagnostic | null {
  try {
    compile(parse(source), source);
    return null;
  } catch (e) {
    if (e instanceof TelarCError) return e.diagnostic;
    throw e;
  }
}

export function compileSource(source: string): CompiledProgram {
  return compile(parse(source), source);
}

export function verify(source: string, options: VerifyOptions = {}): VerifyResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const t0 = now();
  let program: CompiledProgram;
  try {
    program = compileSource(source);
  } catch (e) {
    if (e instanceof TelarCError) return { status: 'compileError', diagnostic: e.diagnostic };
    throw e;
  }
  const machine = new Machine(program);

  const res = explore(machine, {
    maxStates: opts.maxStates,
    maxDepth: opts.maxDepth,
    por: opts.por,
    recordGraph: true,
    onProgress: opts.onProgress && ((p) => opts.onProgress!({ ...p, phase: 'por' })),
  });

  let baseline: VerifyStats['baseline'] = null;
  if (opts.measureSavings && opts.por) {
    const b = explore(machine, {
      maxStates: opts.maxStates,
      maxDepth: opts.maxDepth,
      por: false,
      recordGraph: false,
      onProgress: opts.onProgress && ((p) => opts.onProgress!({ ...p, phase: 'baseline' })),
    });
    baseline = { states: b.states, transitions: b.transitions, complete: b.complete };
  }

  const findings = buildFindings(machine, res);
  const graph = res.graph!;
  const nTree = Math.min(graph.parent.length, opts.maxTreeNodes);
  const nodes: TreeNode[] = [];
  for (let i = 0; i < nTree; i++) {
    nodes.push({
      id: i,
      parent: graph.parent[i]!,
      depth: graph.depth[i]!,
      thread: graph.parentTransition[i]?.thread ?? -1,
      error: graph.error[i]!,
      terminal: graph.terminal[i]!,
    });
  }

  const firstError = findings.find((f) => f.severity === 'error');
  return {
    status: 'done',
    program: {
      threads: program.threads.map((t) => t.name),
      globals: program.globals.map((g) => ({ name: g.name, type: g.type, init: g.init })),
      mutexes: program.mutexes.map((m) => m.name),
      cvs: program.cvs.map((c) => c.name),
      promises: program.promises.map((p) => ({ name: p.name, future: p.future })),
    },
    findings,
    outcomes: res.outcomes.map((o) => ({ globals: o.globals })),
    sampleTrace: firstError ? firstError.trace : replay(machine, defaultSchedule(machine)),
    tree: { nodes, truncated: graph.parent.length > nTree, total: graph.parent.length },
    stats: {
      states: res.states,
      transitions: res.transitions,
      revisits: res.revisits,
      complete: res.complete,
      depthLimitHit: res.depthLimitHit,
      maxDepth: res.maxDepthReached,
      baseline,
      timeMs: Math.round(now() - t0),
    },
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ───────────────────────────── Hallazgos ─────────────────────────────

const ORDER: Record<FindingKind, number> = {
  deadlock: 0,
  race: 1,
  assert: 2,
  finalAssert: 3,
  runtime: 4,
  nondeterminism: 5,
};

function buildFindings(machine: Machine, res: ExploreResult): Finding[] {
  const graph = res.graph!;
  const { prevEdge } = shortestPaths(graph);
  const prog = machine.program;
  const tn = (t: number) => prog.threads[t]!.name;
  const findings: Finding[] = [];

  /** Traza más corta (BFS sobre el grafo explorado); si no reproduce el error, la de DFS. */
  const shortest = (raw: RawFinding): Trace => {
    if (raw.kind === 'race') {
      const prefix = pathTo(graph, prevEdge, raw.fromNode);
      if (prefix) {
        const candidate = [...prefix, raw.transition];
        if (candidate.length <= raw.dfsSchedule.length) {
          const trace = replay(machine, candidate);
          const last = trace.steps[trace.steps.length - 1]!;
          if (last.races.some((r) => raceKey(r) === raw.key)) return trace;
        }
      }
      return replay(machine, raw.dfsSchedule);
    }
    const path = pathTo(graph, prevEdge, raw.node);
    const schedule: Transition[] =
      path && path.length <= raw.dfsSchedule.length ? path : raw.dfsSchedule;
    return replay(machine, schedule);
  };

  for (const raw of res.findings) {
    const trace = shortest(raw);
    switch (raw.kind) {
      case 'race': {
        const r = raw.race;
        const v = prog.globals[r.g]!.name;
        const verb = (k: 'read' | 'write') =>
          k === 'read' ? { es: 'lee', en: 'reads' } : { es: 'escribe', en: 'writes' };
        const a = verb(r.first.kind);
        const b = verb(r.second.kind);
        const last = trace.steps[trace.steps.length - 1]!;
        const race = last.races.find((x) => raceKey(x) === raw.key) ?? r;
        findings.push({
          id: raw.key,
          kind: 'race',
          severity: 'error',
          title: { es: `Data race en "${v}"`, en: `Data race on "${v}"` },
          detail: {
            es: `${tn(race.first.thread)} ${a.es} "${v}" (línea ${race.first.loc.line}) y ${tn(race.second.thread)} ${b.es} "${v}" (línea ${race.second.loc.line}) sin que haya una relación happens-before entre ambos accesos. Ningún mutex ni promise los ordena.`,
            en: `${tn(race.first.thread)} ${a.en} "${v}" (line ${race.first.loc.line}) and ${tn(race.second.thread)} ${b.en} "${v}" (line ${race.second.loc.line}) with no happens-before relation between the two accesses. No mutex or promise orders them.`,
          },
          locs: [race.first.loc, race.second.loc],
          trace,
          errorStep: trace.steps.length - 1,
        });
        break;
      }
      case 'deadlock': {
        const end = trace.end;
        const wg = end.kind === 'deadlock' ? end.waitGraph : null;
        const cycle = wg?.cycle;
        let detail: Bilingual;
        if (cycle && wg) {
          const parts = cycle.map((t) => {
            const e = wg.edges.find((x) => x.from === t)!;
            return {
              es: `${tn(t)} espera ${prog.mutexes[e.mutex]!.name} (lo tiene ${tn(e.to)})`,
              en: `${tn(t)} waits for ${prog.mutexes[e.mutex]!.name} (held by ${tn(e.to)})`,
            };
          });
          detail = {
            es: `Ciclo en el grafo de espera: ${parts.map((p) => p.es).join(' → ')}. Nadie puede avanzar.`,
            en: `Cycle in the wait-for graph: ${parts.map((p) => p.en).join(' → ')}. Nobody can make progress.`,
          };
        } else {
          const waits = (wg?.blocked ?? []).map((b) => {
            if (b.reason.kind === 'cv') {
              return {
                es: `${tn(b.thread)} duerme en ${prog.cvs[b.reason.cv]!.name} y nadie lo va a despertar`,
                en: `${tn(b.thread)} sleeps on ${prog.cvs[b.reason.cv]!.name} and nobody will wake it up`,
              };
            }
            if (b.reason.kind === 'future') {
              return {
                es: `${tn(b.thread)} espera un valor de ${prog.promises[b.reason.promise]!.name} que nunca llega`,
                en: `${tn(b.thread)} waits for a value from ${prog.promises[b.reason.promise]!.name} that never comes`,
              };
            }
            return {
              es: `${tn(b.thread)} espera un mutex`,
              en: `${tn(b.thread)} waits for a mutex`,
            };
          });
          detail = {
            es: `Bloqueo sin ciclo de mutex: ${waits.map((w) => w.es).join('; ')}.`,
            en: `Blocked without a mutex cycle: ${waits.map((w) => w.en).join('; ')}.`,
          };
        }
        const finalSnap = trace.steps[trace.steps.length - 1]?.after ?? trace.initial;
        findings.push({
          id: raw.key,
          kind: 'deadlock',
          severity: 'error',
          title: cycle
            ? { es: 'Deadlock (interbloqueo)', en: 'Deadlock' }
            : { es: 'Bloqueo permanente (espera perdida)', en: 'Permanent block (lost wake-up)' },
          detail,
          locs: finalSnap.threads.flatMap((t) => (t.loc && t.view !== 'done' ? [t.loc] : [])),
          trace,
          errorStep: -1,
        });
        break;
      }
      case 'assert':
      case 'runtime': {
        const end = trace.end;
        const failure = end.kind === 'failure' ? end.failure : null;
        findings.push({
          id: raw.key,
          kind: raw.kind,
          severity: 'error',
          title:
            raw.kind === 'assert'
              ? { es: 'Assert que falla', en: 'Failing assert' }
              : { es: 'Error en tiempo de ejecución', en: 'Runtime error' },
          detail: failure?.message ?? { es: 'Error', en: 'Error' },
          locs: failure ? [failure.loc] : [],
          trace,
          errorStep: trace.steps.length - 1,
        });
        break;
      }
      case 'finalAssert': {
        const end = trace.end;
        const loc = end.kind === 'finished' && end.finalAssert ? end.finalAssert.loc : null;
        const last = trace.steps[trace.steps.length - 1]?.after ?? trace.initial;
        const values = prog.globals
          .map((g, i) => `${g.name} = ${String(last.globals[i])}`)
          .join(', ');
        findings.push({
          id: raw.key,
          kind: 'finalAssert',
          severity: 'error',
          title: {
            es: `Falla el assert final: ${raw.text}`,
            en: `Final assert fails: ${raw.text}`,
          },
          detail: {
            es: `Con esta intercalación todos los hilos terminan, pero al final ${values}.`,
            en: `With this interleaving every thread finishes, but at the end ${values}.`,
          },
          locs: loc ? [loc] : [],
          trace,
          errorStep: -1,
        });
        break;
      }
    }
  }

  if (res.outcomes.length > 1) {
    const outcomes = res.outcomes.map((o) => {
      const path = pathTo(graph, prevEdge, o.node);
      return { globals: o.globals, trace: replay(machine, path ?? o.dfsSchedule) };
    });
    const fmt = (gs: Value[]) =>
      prog.globals.map((g, i) => `${g.name}=${String(gs[i])}`).join(', ');
    const list = res.outcomes.map((o) => `{ ${fmt(o.globals)} }`).join('  ·  ');
    findings.push({
      id: 'nondeterminism',
      kind: 'nondeterminism',
      severity: 'warning',
      title: {
        es: `${res.outcomes.length} resultados finales distintos`,
        en: `${res.outcomes.length} different final results`,
      },
      detail: {
        es: `El resultado depende de cómo se intercalen los hilos: ${list}`,
        en: `The result depends on how the threads interleave: ${list}`,
      },
      locs: [],
      trace: outcomes[1]!.trace,
      errorStep: -1,
      outcomes,
    });
  }

  return findings.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
