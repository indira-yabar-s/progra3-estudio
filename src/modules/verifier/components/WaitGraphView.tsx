import { Share2 } from 'lucide-react';
import { CardHeader, GlassCard } from '@/components/ui/GlassCard';
import type { Snapshot } from '@/core/telarc/trace';
import type { ProgramInfo } from '@/core/telarc/verify';
import { useT, type MessageKey } from '@/i18n';
import { threadColor } from '../describe';

const VIEW: Record<string, MessageKey> = {
  ready: 'threads.ready',
  blocked: 'threads.blocked',
  waiting: 'threads.waiting',
  done: 'threads.done',
  failed: 'threads.failed',
};

/**
 * Grafo de espera: una flecha A → B significa "A espera un mutex que tiene B".
 * Si hay un ciclo, las flechas del ciclo se animan en rojo: eso es un deadlock.
 */
export function WaitGraphView({ program, snapshot }: { program: ProgramInfo; snapshot: Snapshot }) {
  const { t } = useT();
  const n = program.threads.length;
  const W = 380;
  const H = n <= 2 ? 150 : 300;
  const cx = W / 2;
  const cy = n <= 2 ? H / 2 + 10 : H / 2 + 4;
  const R = n <= 1 ? 0 : n === 2 ? 115 : Math.min(130, 95 + (n - 3) * 12);
  // Con 2 hilos los ponemos lado a lado; con más, en círculo.
  const start = n === 2 ? Math.PI : -Math.PI / 2;
  const pos = program.threads.map((_, i) => {
    const a = start + (i * 2 * Math.PI) / Math.max(n, 1);
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const { edges, cycle } = snapshot.waitGraph;
  const inCycle = (from: number, to: number) => {
    if (!cycle) return false;
    const i = cycle.indexOf(from);
    return i >= 0 && cycle[(i + 1) % cycle.length] === to;
  };

  return (
    <GlassCard>
      <CardHeader
        icon={<Share2 size={16} />}
        title={t('wait.title')}
        actions={
          cycle ? <span className="chip text-err border-err/50">{t('wait.cycle')}</span> : undefined
        }
      />
      <div className="px-4 pb-2">
        <ul className="mb-2 flex flex-wrap gap-1.5" data-testid="threads">
          {program.threads.map((name, i) => {
            const view = snapshot.threads[i]!.view;
            return (
              <li
                key={name}
                className="chip"
                style={{ borderColor: threadColor(i), opacity: view === 'done' ? 0.55 : 1 }}
              >
                <span className="size-2 rounded-full" style={{ background: threadColor(i) }} />
                <span className="font-mono">{name}</span>
                <span
                  className={
                    view === 'blocked' || view === 'failed'
                      ? 'text-err'
                      : view === 'waiting'
                        ? 'text-warn'
                        : 'text-muted'
                  }
                >
                  {t(VIEW[view]!)}
                </span>
              </li>
            );
          })}
        </ul>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto w-full max-w-md"
          role="img"
          aria-label={t('wait.title')}
        >
          <defs>
            <marker
              id="wg-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-muted)" />
            </marker>
            <marker
              id="wg-arrow-err"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--err)" />
            </marker>
          </defs>
          {edges.map((e, k) => {
            const a = pos[e.from]!;
            const b = pos[e.to]!;
            const bad = inCycle(e.from, e.to);
            const color = bad ? 'var(--err)' : 'var(--fg-muted)';
            if (e.from === e.to) {
              return (
                <g key={k}>
                  <path
                    d={`M${a.x - 8},${a.y - 18} C${a.x - 40},${a.y - 70} ${a.x + 40},${a.y - 70} ${a.x + 8},${a.y - 18}`}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeDasharray={bad ? '6 6' : undefined}
                    className={bad ? 'animate-dash' : undefined}
                    markerEnd={`url(#${bad ? 'wg-arrow-err' : 'wg-arrow'})`}
                  />
                  <text
                    x={a.x}
                    y={a.y - 58}
                    textAnchor="middle"
                    className="font-mono text-[11px]"
                    fill={color}
                  >
                    {program.mutexes[e.mutex]}
                  </text>
                </g>
              );
            }
            // Curvamos la flecha para que A→B y B→A no se encimen.
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const sx = a.x + ux * 32;
            const sy = a.y + uy * 32;
            const ex = b.x - ux * 34;
            const ey = b.y - uy * 34;
            // Curvamos hacia AFUERA del círculo para que las etiquetas no se encimen en el centro.
            let nx = -uy;
            let ny = ux;
            const midX = (sx + ex) / 2;
            const midY = (sy + ey) / 2;
            if ((midX - cx) * nx + (midY - cy) * ny < 0) {
              nx = -nx;
              ny = -ny;
            }
            const mx = midX + nx * 26;
            const my = midY + ny * 26;
            return (
              <g key={k}>
                <path
                  d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={bad ? 2.5 : 1.8}
                  strokeDasharray={bad ? '6 6' : undefined}
                  className={bad ? 'animate-dash' : undefined}
                  markerEnd={`url(#${bad ? 'wg-arrow-err' : 'wg-arrow'})`}
                />
                <text
                  x={mx - uy * 10}
                  y={my + ux * 10 + 4}
                  textAnchor="middle"
                  className="font-mono text-[11px] font-semibold"
                  fill={color}
                >
                  {program.mutexes[e.mutex]}
                </text>
              </g>
            );
          })}
          {program.threads.map((name, i) => {
            const p = pos[i]!;
            const view = snapshot.threads[i]!.view;
            const hot = cycle?.includes(i);
            return (
              <g key={name} opacity={view === 'done' ? 0.45 : 1}>
                {hot && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="27"
                    fill="none"
                    stroke="var(--err)"
                    strokeWidth="2"
                    className="animate-pulse-ring"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="28"
                  fill={`color-mix(in srgb, ${threadColor(i)} 22%, var(--bg))`}
                  stroke={hot ? 'var(--err)' : threadColor(i)}
                  strokeWidth="2.5"
                />
                <text
                  x={p.x}
                  y={p.y + 3.5}
                  textAnchor="middle"
                  className="font-mono text-[10px] font-bold"
                  fill="var(--fg)"
                >
                  {name.length > 9 ? name.slice(0, 8) + '…' : name}
                </text>
                {view === 'waiting' && (
                  <text x={p.x + 16} y={p.y - 14} className="text-[13px]">
                    🌙
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {edges.length === 0 && (
          <p className="text-muted -mt-2 pb-2 text-center text-xs">{t('wait.empty')}</p>
        )}
      </div>
    </GlassCard>
  );
}
