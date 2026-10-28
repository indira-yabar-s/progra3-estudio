import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, Siren } from 'lucide-react';
import { useEffect } from 'react';
import type { Trace } from '@/core/telarc/trace';
import type { ProgramInfo } from '@/core/telarc/verify';
import { useT } from '@/i18n';
import { describeEnd, describeEvent, threadColor } from '../describe';

const SPEEDS = [0.5, 1, 2, 4];

/** Reproductor de trazas: anterior / siguiente / reproducir / velocidad / saltar al error. */
export function Player({
  trace,
  program,
  step,
  setStep,
  playing,
  setPlaying,
  speed,
  setSpeed,
  errorStep,
}: {
  trace: Trace;
  program: ProgramInfo;
  step: number;
  setStep: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  errorStep: number | null;
}) {
  const { t } = useT();
  const last = trace.steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setStep(step + 1), 900 / speed);
    return () => window.clearTimeout(id);
  }, [playing, step, last, speed, setStep, setPlaying]);

  // Atajos de teclado (si el foco no está en el editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('.monaco-editor, input, textarea, select')) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStep(Math.min(last, step + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStep(Math.max(-1, step - 1));
      } else if (e.key === ' ' && el.tagName !== 'BUTTON') {
        e.preventDefault();
        if (step >= last) setStep(-1);
        setPlaying(!playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, last, playing, setStep, setPlaying]);

  const current = step >= 0 ? trace.steps[step] : null;
  const atEnd = step === last;

  return (
    <div className="glass glass-strong sticky top-[84px] z-20 p-3" data-testid="player">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconBtn label={t('player.first')} onClick={() => setStep(-1)} disabled={step < 0}>
            <SkipBack size={16} />
          </IconBtn>
          <IconBtn
            label={t('player.prev')}
            onClick={() => setStep(Math.max(-1, step - 1))}
            disabled={step < 0}
          >
            <ChevronLeft size={18} />
          </IconBtn>
          <button
            type="button"
            className="btn btn-primary size-10 rounded-full p-0"
            onClick={() => {
              if (atEnd) setStep(-1);
              setPlaying(!playing);
            }}
            aria-label={playing ? t('player.pause') : t('player.play')}
            title={playing ? t('player.pause') : t('player.play')}
            disabled={last < 0}
          >
            {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <IconBtn
            label={t('player.next')}
            onClick={() => setStep(Math.min(last, step + 1))}
            disabled={atEnd}
          >
            <ChevronRight size={18} />
          </IconBtn>
          {errorStep !== null && (
            <button
              type="button"
              className="btn btn-ghost text-err gap-1 px-2.5 py-1.5"
              onClick={() => {
                setPlaying(false);
                setStep(errorStep);
              }}
              data-testid="jump-error"
            >
              <Siren size={15} /> <span className="hidden sm:inline">{t('player.toError')}</span>
            </button>
          )}
        </div>

        <label className="text-muted ml-auto flex items-center gap-1.5 text-xs">
          {t('player.speed')}
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="border-line bg-glass text-fg rounded-lg border px-1.5 py-1 font-mono text-xs"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        type="range"
        min={-1}
        max={Math.max(last, 0)}
        value={step}
        onChange={(e) => {
          setPlaying(false);
          setStep(Number(e.target.value));
        }}
        className="accent-[color:var(--accent)] mt-3 w-full"
        aria-label={t('player.step', { i: step + 1, n: last + 1 })}
      />

      <div
        className="mt-1 flex min-h-6 flex-wrap items-center gap-x-2 text-sm"
        aria-live="polite"
        data-testid="step-description"
      >
        <span className="text-subtle font-mono text-xs">
          {step < 0 ? t('player.initial') : t('player.step', { i: step + 1, n: last + 1 })}
        </span>
        {current && (
          <>
            <span className="font-mono font-bold" style={{ color: threadColor(current.thread) }}>
              {program.threads[current.thread]}
            </span>
            <span className={step === errorStep ? 'text-err font-semibold' : ''}>
              {describeEvent(current.event, program, t)}
            </span>
          </>
        )}
        {atEnd && <span className="text-muted">· {describeEnd(trace.end, t)}</span>}
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
