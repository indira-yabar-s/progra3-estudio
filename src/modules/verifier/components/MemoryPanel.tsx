import { Database } from 'lucide-react';
import { CardHeader, GlassCard } from '@/components/ui/GlassCard';
import type { Snapshot, TraceStep } from '@/core/telarc/trace';
import type { ProgramInfo } from '@/core/telarc/verify';
import { useT } from '@/i18n';
import { fmtValue, threadColor } from '../describe';

/** Valores de las variables compartidas en el paso actual, resaltando lecturas y escrituras. */
export function MemoryPanel({
  program,
  snapshot,
  current,
}: {
  program: ProgramInfo;
  snapshot: Snapshot;
  current: TraceStep | null;
}) {
  const { t } = useT();
  const ev = current?.event;
  const racy = new Set(current?.races.map((r) => r.g));

  return (
    <GlassCard>
      <CardHeader icon={<Database size={16} />} title={t('memory.title')} />
      <div className="px-4 pb-4">
        {program.globals.length === 0 ? (
          <p className="text-muted text-sm">{t('memory.empty')}</p>
        ) : (
          <ul className="grid gap-1.5" data-testid="memory">
            {program.globals.map((g, i) => {
              const read = ev?.kind === 'read' && ev.g === i;
              const write = ev?.kind === 'write' && ev.g === i;
              const tone = racy.has(i)
                ? 'var(--err)'
                : write
                  ? 'var(--write)'
                  : read
                    ? 'var(--read)'
                    : null;
              return (
                <li
                  key={g.name}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors duration-300"
                  style={{
                    borderColor: tone ?? 'var(--glass-border)',
                    background: tone ? `color-mix(in srgb, ${tone} 12%, transparent)` : undefined,
                  }}
                >
                  <span className="text-subtle font-mono text-[11px]">{g.type}</span>
                  <span className="font-mono text-sm font-semibold">{g.name}</span>
                  {(read || write) && current && (
                    <span
                      className="chip px-1.5 py-0 text-[10px]"
                      style={{ color: tone ?? undefined, borderColor: tone ?? undefined }}
                    >
                      <span style={{ color: threadColor(current.thread) }}>●</span>
                      {read ? t('memory.read') : t('memory.write')}
                    </span>
                  )}
                  <span className="ml-auto flex items-baseline gap-2 font-mono">
                    {write && ev?.kind === 'write' && (
                      <span className="text-subtle text-xs line-through">{fmtValue(ev.old)}</span>
                    )}
                    <span
                      key={String(snapshot.globals[i])}
                      className="animate-pop text-base font-bold"
                    >
                      {fmtValue(snapshot.globals[i])}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}
