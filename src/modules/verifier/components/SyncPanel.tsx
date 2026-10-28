import { Lock, LockOpen, Moon, Package, Users } from 'lucide-react';
import { CardHeader, GlassCard } from '@/components/ui/GlassCard';
import type { Snapshot } from '@/core/telarc/trace';
import type { ProgramInfo } from '@/core/telarc/verify';
import { useT } from '@/i18n';
import { fmtValue, threadColor } from '../describe';

/** Estado de cada mutex (libre / tomado por / quién espera), cv y promise. */
export function SyncPanel({ program, snapshot }: { program: ProgramInfo; snapshot: Snapshot }) {
  const { t } = useT();
  const name = (th: number) => program.threads[th] ?? `t${th}`;
  const none = program.mutexes.length + program.cvs.length + program.promises.length === 0;

  return (
    <GlassCard>
      <CardHeader icon={<Lock size={16} />} title={t('sync.title')} />
      <div className="grid gap-1.5 px-4 pb-4" data-testid="sync">
        {none && <p className="text-muted text-sm">{t('sync.none')}</p>}
        {program.mutexes.map((m, i) => {
          const owner = snapshot.owner[i]!;
          const waiters = snapshot.waitGraph.edges.filter((e) => e.mutex === i).map((e) => e.from);
          return (
            <div
              key={m}
              className="border-line flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
              style={
                owner >= 0
                  ? {
                      borderColor: threadColor(owner),
                      background: `color-mix(in srgb, ${threadColor(owner)} 10%, transparent)`,
                    }
                  : undefined
              }
            >
              {owner >= 0 ? (
                <Lock size={15} style={{ color: threadColor(owner) }} aria-hidden="true" />
              ) : (
                <LockOpen size={15} className="text-ok" aria-hidden="true" />
              )}
              <span className="font-mono text-sm font-semibold">{m}</span>
              <span className="text-xs">
                {owner >= 0 ? (
                  <span style={{ color: threadColor(owner) }}>
                    {t('sync.heldBy', { t: name(owner) })}
                  </span>
                ) : (
                  <span className="text-ok">{t('sync.free')}</span>
                )}
              </span>
              {waiters.length > 0 && (
                <span className="chip text-warn ml-auto text-[11px]">
                  <Users size={12} aria-hidden="true" />{' '}
                  {t('sync.waiting', { list: waiters.map(name).join(', ') })}
                </span>
              )}
            </div>
          );
        })}
        {program.cvs.map((c, i) => {
          const sleepers = snapshot.cvWaiters[i] ?? [];
          return (
            <div
              key={c}
              className="border-line flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
            >
              <Moon size={15} className="text-accent-3" aria-hidden="true" />
              <span className="font-mono text-sm font-semibold">{c}</span>
              <span className="text-muted text-xs">
                {sleepers.length
                  ? t('sync.sleeping', { list: sleepers.map(name).join(', ') })
                  : t('sync.noSleepers')}
              </span>
            </div>
          );
        })}
        {program.promises.map((p, i) => (
          <div
            key={p.name}
            className="border-line flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
          >
            <Package size={15} className="text-accent" aria-hidden="true" />
            <span className="font-mono text-sm font-semibold">
              {p.name}
              {p.future ? ` → ${p.future}` : ''}
            </span>
            <span className="text-muted text-xs">
              {snapshot.promise[i] === null
                ? t('sync.promiseEmpty')
                : t('sync.promiseValue', { v: fmtValue(snapshot.promise[i]) })}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
