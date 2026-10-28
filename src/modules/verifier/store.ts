import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EXAMPLES, findExample } from '@/core/telarc/examples';
import type { Diagnostic } from '@/core/telarc/diagnostics';
import type { Trace } from '@/core/telarc/trace';
import type { Finding, VerifyResult } from '@/core/telarc/verify';
import { verifierClient } from './workerClient';

export type DoneResult = Extract<VerifyResult, { status: 'done' }>;
export type ResultTab = 'trace' | 'tree' | 'cpp' | 'about';
export type Selection = { kind: 'sample' } | { kind: 'finding'; id: string; outcome?: number };

interface VerifierState {
  source: string;
  exampleId: string | null;
  maxStates: number;
  por: boolean;
  measure: boolean;

  status: 'idle' | 'running' | 'done' | 'compileError' | 'failed';
  progress: { states: number; phase: 'por' | 'baseline' } | null;
  result: DoneResult | null;
  /** Error de compilación (en vivo mientras se escribe o al verificar). */
  diagnostic: Diagnostic | null;
  failure: string | null;
  /** Código que se verificó (las posiciones de las trazas se refieren a él). */
  verifiedSource: string | null;

  selection: Selection;
  step: number;
  playing: boolean;
  speed: number;
  tab: ResultTab;

  setSource: (s: string) => void;
  loadExample: (id: string) => void;
  resetExample: () => void;
  setOptions: (o: Partial<Pick<VerifierState, 'maxStates' | 'por' | 'measure'>>) => void;
  setDiagnostic: (d: Diagnostic | null) => void;
  verify: () => Promise<void>;
  cancel: () => void;
  select: (s: Selection) => void;
  setStep: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setTab: (t: ResultTab) => void;
}

const firstExample = EXAMPLES[0]!;

export const useVerifier = create<VerifierState>()(
  persist(
    (set, get) => ({
      source: firstExample.source,
      exampleId: firstExample.id,
      maxStates: 50_000,
      por: true,
      measure: true,

      status: 'idle',
      progress: null,
      result: null,
      diagnostic: null,
      failure: null,
      verifiedSource: null,

      selection: { kind: 'sample' },
      step: -1,
      playing: false,
      speed: 1,
      tab: 'trace',

      setSource: (source) => set({ source }),
      loadExample: (id) => {
        const ex = findExample(id);
        if (!ex) return;
        verifierClient.cancel();
        set({
          source: ex.source,
          exampleId: id,
          status: 'idle',
          result: null,
          progress: null,
          diagnostic: null,
          failure: null,
          selection: { kind: 'sample' },
          step: -1,
          playing: false,
          tab: 'trace',
        });
      },
      resetExample: () => {
        const id = get().exampleId;
        if (id) get().loadExample(id);
      },
      setOptions: (o) => set(o),
      setDiagnostic: (diagnostic) => set({ diagnostic }),

      verify: async () => {
        const { source, maxStates, por, measure } = get();
        set({
          status: 'running',
          progress: { states: 0, phase: 'por' },
          failure: null,
          playing: false,
        });
        try {
          const result = await verifierClient.run(
            source,
            { maxStates, por, measureSavings: measure },
            (progress) => set({ progress }),
          );
          if (result.status === 'compileError') {
            set({
              status: 'compileError',
              diagnostic: result.diagnostic,
              result: null,
              progress: null,
            });
            return;
          }
          const first = result.findings.find((f) => f.severity === 'error') ?? result.findings[0];
          set({
            status: 'done',
            result,
            progress: null,
            diagnostic: null,
            verifiedSource: source,
            selection: first ? { kind: 'finding', id: first.id } : { kind: 'sample' },
            step: -1,
            tab: get().tab === 'about' ? 'trace' : get().tab,
          });
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          set({
            status: 'failed',
            failure: e instanceof Error ? e.message : String(e),
            progress: null,
          });
        }
      },
      cancel: () => {
        verifierClient.cancel();
        set({ status: get().result ? 'done' : 'idle', progress: null });
      },

      select: (selection) => set({ selection, step: -1, playing: false, tab: 'trace' }),
      setStep: (step) => set({ step }),
      setPlaying: (playing) => set({ playing }),
      setSpeed: (speed) => set({ speed }),
      setTab: (tab) => set({ tab }),
    }),
    {
      name: 'telar:verifier',
      version: 1,
      partialize: (s) => ({
        source: s.source,
        exampleId: s.exampleId,
        maxStates: s.maxStates,
        por: s.por,
        measure: s.measure,
        speed: s.speed,
      }),
    },
  ),
);

/** Hallazgo seleccionado (si hay). */
export function selectedFinding(s: Pick<VerifierState, 'result' | 'selection'>): Finding | null {
  if (!s.result || s.selection.kind !== 'finding') return null;
  const id = s.selection.id;
  return s.result.findings.find((f) => f.id === id) ?? null;
}

/** Traza que se está reproduciendo según la selección. */
export function selectedTrace(s: Pick<VerifierState, 'result' | 'selection'>): Trace | null {
  if (!s.result) return null;
  const f = selectedFinding(s);
  if (!f) return s.result.sampleTrace;
  if (s.selection.kind === 'finding' && s.selection.outcome !== undefined && f.outcomes) {
    return f.outcomes[s.selection.outcome]?.trace ?? f.trace;
  }
  return f.trace;
}

/** Paso donde ocurre el error de la traza seleccionada. */
export function errorStepOf(s: Pick<VerifierState, 'result' | 'selection'>): number | null {
  const f = selectedFinding(s);
  const trace = selectedTrace(s);
  if (!f || !trace || f.severity !== 'error') return null;
  return f.errorStep >= 0 ? f.errorStep : trace.steps.length - 1;
}
