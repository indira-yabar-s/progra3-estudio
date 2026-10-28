import {
  AlertOctagon,
  FileCode2,
  Info,
  Loader2,
  Network,
  PlayCircle,
  RotateCcw,
  Settings2,
  Square,
  Workflow,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Tabs } from '@/components/ui/Tabs';
import { EXAMPLES, findExample, type ExampleLevel } from '@/core/telarc/examples';
import { check } from '@/core/telarc/verify';
import { formatNumber, useT, type MessageKey } from '@/i18n';
import { useRoute } from '@/lib/router';
import { AboutExample } from './components/AboutExample';
import { CppView } from './components/CppView';
import { Loom } from './components/Loom';
import { MemoryPanel } from './components/MemoryPanel';
import { Player } from './components/Player';
import { ResultsSummary } from './components/ResultsSummary';
import { StateTree } from './components/StateTree';
import { SyncPanel } from './components/SyncPanel';
import { WaitGraphView } from './components/WaitGraphView';
import type { ThreadMarker } from './monaco/CodeEditor';
import { errorStepOf, selectedFinding, selectedTrace, useVerifier, type ResultTab } from './store';

const CodeEditor = lazy(() => import('./monaco/CodeEditor'));

const LEVELS: { level: ExampleLevel; key: MessageKey }[] = [
  { level: 'basic', key: 'about.level.basic' },
  { level: 'intermediate', key: 'about.level.intermediate' },
  { level: 'advanced', key: 'about.level.advanced' },
];

const MAX_STATE_OPTIONS = [1_000, 10_000, 50_000, 100_000, 250_000];

export default function VerifierPage() {
  const { t, tb, locale } = useT();
  const route = useRoute();
  const s = useVerifier();
  const [showOptions, setShowOptions] = useState(false);
  const example = s.exampleId ? (findExample(s.exampleId) ?? null) : null;
  const edited = example ? example.source !== s.source : false;

  // ?ejemplo=<id> carga un ejemplo (lo usan las lecciones con "Abrir en Telar").
  const requested = route.query.get('ejemplo');
  useEffect(() => {
    if (!requested) return;
    if (findExample(requested)) useVerifier.getState().loadExample(requested);
    history.replaceState(null, '', '#/verificador');
  }, [requested]);

  // Validación en vivo mientras se escribe.
  const { source, setDiagnostic } = s;
  useEffect(() => {
    const id = window.setTimeout(() => setDiagnostic(check(source)), 250);
    return () => window.clearTimeout(id);
  }, [source, setDiagnostic]);

  const trace = selectedTrace(s);
  const finding = selectedFinding(s);
  const errorStep = errorStepOf(s);
  const fresh = s.result !== null && s.verifiedSource === s.source;
  const snapshot = trace ? (s.step >= 0 ? trace.steps[s.step]!.after : trace.initial) : null;
  const currentStep = trace && s.step >= 0 ? trace.steps[s.step]! : null;

  const threadMarkers: ThreadMarker[] = useMemo(() => {
    if (!fresh || !snapshot || !s.result) return [];
    return snapshot.threads.flatMap((th, i) =>
      th.loc && th.view !== 'done'
        ? [{ thread: i, name: s.result!.program.threads[i]!, loc: th.loc }]
        : [],
    );
  }, [fresh, snapshot, s.result]);

  const tabs: { key: ResultTab; label: string; icon: React.ReactNode }[] = [
    { key: 'trace', label: t('tabs.trace'), icon: <Workflow size={15} /> },
    { key: 'tree', label: t('tabs.tree'), icon: <Network size={15} /> },
    { key: 'cpp', label: t('tabs.cpp'), icon: <FileCode2 size={15} /> },
    { key: 'about', label: t('tabs.about'), icon: <Info size={15} /> },
  ];

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)] gap-4 px-3 pt-4 pb-10 sm:px-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ───────────── Editor ───────────── */}
      <section
        className="xl:sticky xl:top-[84px] xl:self-start"
        aria-label={t('verifier.editorLabel')}
      >
        <GlassCard className="flex flex-col overflow-hidden">
          <div className="border-line flex flex-wrap items-center gap-2 border-b p-3">
            <label className="sr-only" htmlFor="example-select">
              {t('verifier.chooseExample')}
            </label>
            <select
              id="example-select"
              data-testid="example-select"
              value={s.exampleId ?? ''}
              onChange={(e) => s.loadExample(e.target.value)}
              className="border-line bg-glass text-fg min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm font-semibold"
            >
              {!example && <option value="">{t('about.custom')}</option>}
              {LEVELS.map(({ level, key }) => (
                <optgroup key={level} label={t(key)}>
                  {EXAMPLES.filter((e) => e.level === level).map((e) => (
                    <option key={e.id} value={e.id}>
                      {tb(e.title)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {edited && (
              <button
                type="button"
                className="btn btn-ghost px-2.5"
                onClick={s.resetExample}
                title={t('verifier.reset')}
              >
                <RotateCcw size={15} />{' '}
                <span className="hidden sm:inline">{t('verifier.reset')}</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setShowOptions((v) => !v)}
              aria-expanded={showOptions}
              aria-label={t('verifier.settings')}
              title={t('verifier.settings')}
            >
              <Settings2 size={16} />
            </button>
          </div>

          {showOptions && (
            <div className="border-line animate-fade-up grid gap-3 border-b p-3 text-sm sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs font-semibold">{t('verifier.maxStates')}</span>
                <select
                  value={s.maxStates}
                  onChange={(e) => s.setOptions({ maxStates: Number(e.target.value) })}
                  className="border-line bg-glass text-fg rounded-lg border px-2 py-1.5 font-mono"
                >
                  {MAX_STATE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {formatNumber(n, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={s.por}
                    onChange={(e) => s.setOptions({ por: e.target.checked })}
                    className="accent-[color:var(--accent)] mt-1"
                  />
                  <span>
                    <span className="font-semibold">{t('verifier.por')}</span>
                    <span className="text-muted block text-xs">{t('verifier.porHint')}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={s.measure}
                    disabled={!s.por}
                    onChange={(e) => s.setOptions({ measure: e.target.checked })}
                    className="accent-[color:var(--accent)] mt-1"
                  />
                  <span className="text-xs">{t('verifier.measure')}</span>
                </label>
              </div>
            </div>
          )}

          <div className="h-[46vh] min-h-[340px] xl:h-[calc(100dvh-300px)]" data-testid="editor">
            <Suspense
              fallback={<div className="text-muted grid h-full place-items-center text-sm">…</div>}
            >
              <CodeEditor
                value={s.source}
                onChange={s.setSource}
                diagnostic={s.diagnostic}
                threads={threadMarkers}
                current={fresh ? (currentStep?.loc ?? null) : null}
                errorLocs={fresh && finding && s.step === errorStep ? finding.locs : undefined}
                onRun={s.verify}
                ariaLabel={t('verifier.editorLabel')}
              />
            </Suspense>
          </div>

          <div className="border-line flex flex-wrap items-center gap-3 border-t p-3">
            {s.diagnostic ? (
              <p
                className="text-err flex min-w-0 flex-1 items-start gap-2 text-sm"
                role="alert"
                data-testid="diagnostic"
              >
                <AlertOctagon size={16} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold">
                    {t('verifier.line', { line: s.diagnostic.loc.line, col: s.diagnostic.loc.col })}
                    :
                  </span>{' '}
                  {tb(s.diagnostic.message)}
                </span>
              </p>
            ) : (
              <p className="text-subtle hidden flex-1 text-xs sm:block">
                {t('verifier.idleHint', {
                  key: navigator.platform.includes('Mac') ? '⌘ + Enter' : 'Ctrl + Enter',
                })}
              </p>
            )}
            {s.status === 'running' ? (
              <button type="button" className="btn btn-ghost ml-auto" onClick={s.cancel}>
                <Square size={15} /> {t('verifier.cancel')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary ml-auto px-5"
                onClick={s.verify}
                disabled={!!s.diagnostic}
                data-testid="verify"
              >
                <PlayCircle size={17} /> {t('verifier.verify')}
              </button>
            )}
          </div>
        </GlassCard>
      </section>

      {/* ───────────── Resultados ───────────── */}
      <section
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4"
        aria-live="polite"
      >
        {s.status === 'running' && s.progress && (
          <GlassCard className="p-5" role="status">
            <div className="flex items-center gap-3">
              <Loader2 className="text-accent animate-spin" size={22} />
              <p className="font-display font-bold">{t('verifier.verifying')}</p>
              <span className="text-muted ml-auto font-mono text-sm">
                {s.progress.phase === 'por'
                  ? t('verifier.progress', { states: formatNumber(s.progress.states, locale) })
                  : t('verifier.progressBaseline', {
                      states: formatNumber(s.progress.states, locale),
                    })}
              </span>
            </div>
            <div className="bg-accent/15 mt-4 h-2 overflow-hidden rounded-full">
              <div
                className="progress-shimmer h-full rounded-full bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-3)] transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, (s.progress.states / s.maxStates) * (s.progress.phase === 'por' ? 50 : 50) + (s.progress.phase === 'baseline' ? 50 : 0))}%`,
                }}
              />
            </div>
          </GlassCard>
        )}

        {s.status === 'idle' && !s.result && (
          <GlassCard className="p-6">
            <p className="font-display text-lg font-bold">{t('verifier.idle')}</p>
            <div className="mt-4">
              <AboutExample example={example} />
            </div>
          </GlassCard>
        )}

        {s.status === 'compileError' && s.diagnostic && (
          <GlassCard className="border-err/40 p-5" role="alert">
            <p className="text-err font-display font-bold">{t('verifier.compileError')}</p>
            <p className="mt-1 text-sm">
              {t('verifier.line', { line: s.diagnostic.loc.line, col: s.diagnostic.loc.col })}:{' '}
              {tb(s.diagnostic.message)}
            </p>
          </GlassCard>
        )}

        {s.status === 'failed' && (
          <GlassCard className="p-5" role="alert">
            <p className="text-err font-display font-bold">{t('verifier.workerError')}</p>
            <p className="text-muted mt-1 font-mono text-xs">{s.failure}</p>
          </GlassCard>
        )}

        {s.result && s.status !== 'running' && (
          <>
            <ResultsSummary result={s.result} example={example} />
            <Tabs items={tabs} value={s.tab} onChange={s.setTab} label={t('verifier.title')} />

            {s.tab === 'trace' && trace && snapshot && (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="trace-view">
                <Player
                  trace={trace}
                  program={s.result.program}
                  step={s.step}
                  setStep={s.setStep}
                  playing={s.playing}
                  setPlaying={s.setPlaying}
                  speed={s.speed}
                  setSpeed={s.setSpeed}
                  errorStep={errorStep}
                />
                <Loom
                  trace={trace}
                  program={s.result.program}
                  step={s.step}
                  errorStep={errorStep}
                  onStep={s.setStep}
                />
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
                  <MemoryPanel
                    program={s.result.program}
                    snapshot={snapshot}
                    current={currentStep}
                  />
                  <SyncPanel program={s.result.program} snapshot={snapshot} />
                </div>
                <WaitGraphView program={s.result.program} snapshot={snapshot} />
              </div>
            )}
            {s.tab === 'tree' && (
              <StateTree
                nodes={s.result.tree.nodes}
                truncated={s.result.tree.truncated}
                total={s.result.tree.total}
              />
            )}
            {s.tab === 'cpp' && <CppView source={s.verifiedSource ?? s.source} />}
            {s.tab === 'about' && <AboutExample example={example} />}
          </>
        )}
      </section>
    </div>
  );
}
