import { useEffect, useMemo, useRef } from 'react';
import { GitCommitHorizontal } from 'lucide-react';
import { CardHeader, GlassCard } from '@/components/ui/GlassCard';
import type { Trace } from '@/core/telarc/trace';
import type { ProgramInfo } from '@/core/telarc/verify';
import { useT } from '@/i18n';
import { describeEvent, threadColor } from '../describe';

const LANE_H = 52;
const STEP_W = 46;
const PAD_L = 92;
const PAD_T = 30;

/**
 * El "telar": un carril horizontal por hilo (la urdimbre) y un nudo por paso.
 * La trama (la línea que va de nudo en nudo) muestra cómo el planificador
 * salta de un hilo a otro. Las aristas happens-before se dibujan punteadas.
 */
export function Loom({
  trace,
  program,
  step,
  errorStep,
  onStep,
}: {
  trace: Trace;
  program: ProgramInfo;
  step: number;
  errorStep: number | null;
  onStep: (i: number) => void;
}) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const T = program.threads.length;
  const n = trace.steps.length;
  const width = PAD_L + Math.max(n, 6) * STEP_W + 40;
  const height = PAD_T + T * LANE_H + 10;
  const laneY = (th: number) => PAD_T + th * LANE_H + LANE_H / 2;
  const stepX = (i: number) => PAD_L + i * STEP_W + STEP_W / 2;

  const weft = useMemo(() => {
    const parts: string[] = [];
    trace.steps.forEach((s, i) => {
      const x = stepX(i);
      const y = laneY(s.thread);
      if (i === 0) parts.push(`M${x},${y}`);
      else {
        const prev = trace.steps[i - 1]!;
        const px = stepX(i - 1);
        const py = laneY(prev.thread);
        parts.push(`C${(px + x) / 2},${py} ${(px + x) / 2},${y} ${x},${y}`);
      }
    });
    return parts.join(' ');
  }, [trace]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || step < 0) return;
    const x = stepX(step);
    if (x < el.scrollLeft + 60 || x > el.scrollLeft + el.clientWidth - 60) {
      el.scrollTo({ left: x - el.clientWidth / 2, behavior: 'smooth' });
    }
  }, [step]);

  return (
    <GlassCard>
      <CardHeader
        icon={<GitCommitHorizontal size={16} />}
        title={t('loom.title')}
        hint={t('loom.hint')}
      />
      <div ref={scrollRef} className="overflow-x-auto px-2 pb-3" data-testid="loom">
        <svg width={width} height={height} role="list" aria-label={t('loom.title')}>
          {program.threads.map((name, th) => (
            <g key={name}>
              <line
                x1={PAD_L - 8}
                x2={width - 10}
                y1={laneY(th)}
                y2={laneY(th)}
                stroke={threadColor(th)}
                strokeOpacity="0.28"
                strokeWidth="2"
              />
              <text
                x={10}
                y={laneY(th) + 4}
                className="font-mono text-[12px] font-bold"
                fill={threadColor(th)}
              >
                {name.length > 10 ? name.slice(0, 9) + '…' : name}
              </text>
            </g>
          ))}

          {/* aristas happens-before */}
          {trace.steps.flatMap((s) =>
            s.syncEdges.map((e, k) => {
              const from = trace.steps[e.fromStep];
              if (!from || from.thread === s.thread) return null;
              const x0 = stepX(e.fromStep);
              const y0 = laneY(from.thread);
              const x1 = stepX(s.index);
              const y1 = laneY(s.thread);
              return (
                <path
                  key={`${s.index}-${k}`}
                  d={`M${x0},${y0} Q${(x0 + x1) / 2},${(y0 + y1) / 2 - 18} ${x1},${y1}`}
                  fill="none"
                  stroke="var(--accent-3)"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity={s.index <= step ? 0.9 : 0.25}
                >
                  <title>{t('loom.hb')}</title>
                </path>
              );
            }),
          )}

          {n > 0 && (
            <path
              d={weft}
              fill="none"
              stroke="var(--fg-subtle)"
              strokeOpacity="0.45"
              strokeWidth="1.5"
            />
          )}

          {trace.steps.map((s, i) => {
            const x = stepX(i);
            const y = laneY(s.thread);
            const isCurrent = i === step;
            const isError = i === errorStep;
            const future = i > step;
            const label = describeEvent(s.event, program, t);
            return (
              <g
                key={i}
                role="listitem"
                tabIndex={-1}
                onClick={() => onStep(i)}
                className="cursor-pointer"
                aria-label={`${i + 1}. ${program.threads[s.thread]}: ${label}`}
                data-step={i}
              >
                <title>{`${i + 1}. ${program.threads[s.thread]}: ${label}`}</title>
                {isError && (
                  <circle
                    cx={x}
                    cy={y}
                    r="13"
                    fill="none"
                    stroke="var(--err)"
                    strokeWidth="2"
                    className="animate-pulse-ring"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isCurrent ? 12 : 9}
                  fill={isError ? 'var(--err)' : threadColor(s.thread)}
                  fillOpacity={future ? 0.3 : 1}
                  stroke={isCurrent ? 'var(--fg)' : 'var(--bg)'}
                  strokeWidth={isCurrent ? 2.5 : 2}
                  style={{ transition: 'r 160ms ease' }}
                />
                {s.races.length > 0 && (
                  <text
                    x={x}
                    y={y - 16}
                    textAnchor="middle"
                    className="text-[11px] font-bold"
                    fill="var(--err)"
                  >
                    ⚡
                  </text>
                )}
                <text
                  x={x}
                  y={PAD_T - 12}
                  textAnchor="middle"
                  className="font-mono text-[10px]"
                  fill={isCurrent ? 'var(--fg)' : 'var(--fg-subtle)'}
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </GlassCard>
  );
}
