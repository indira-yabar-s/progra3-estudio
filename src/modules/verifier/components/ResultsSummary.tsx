import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  CircleSlash,
  Lock,
  Shuffle,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { isChallengeSolved, type TelarExample } from '@/core/telarc/examples';
import type { Finding, FindingKind } from '@/core/telarc/verify';
import { formatNumber, useT, type MessageKey } from '@/i18n';
import { useVerifier, type DoneResult } from '../store';

const KIND_ICON: Record<FindingKind, ReactNode> = {
  race: <Zap size={16} />,
  deadlock: <Lock size={16} />,
  assert: <Bug size={16} />,
  finalAssert: <Bug size={16} />,
  runtime: <CircleSlash size={16} />,
  nondeterminism: <Shuffle size={16} />,
};

const KIND_KEY: Record<FindingKind, MessageKey> = {
  race: 'kind.race',
  deadlock: 'kind.deadlock',
  assert: 'kind.assert',
  finalAssert: 'kind.finalAssert',
  runtime: 'kind.runtime',
  nondeterminism: 'kind.nondeterminism',
};

export function ResultsSummary({
  result,
  example,
}: {
  result: DoneResult;
  example: TelarExample | null;
}) {
  const { t, tb, locale } = useT();
  const { selection, select, verifiedSource } = useVerifier();
  const { stats, findings } = result;
  const errors = findings.filter((f) => f.severity === 'error').length;
  const solved =
    example?.challenge && verifiedSource
      ? isChallengeSolved(example, verifiedSource, findings.length)
      : false;
  const base = stats.baseline;
  const saved = base && base.states > 0 ? Math.round((1 - stats.states / base.states) * 100) : null;
  const fmt = (n: number) => formatNumber(n, locale);

  return (
    <div className="grid gap-3" data-testid="results">
      {solved && (
        <GlassCard glow className="animate-pop flex items-center gap-3 p-4" role="status">
          <Trophy className="text-warn shrink-0" size={28} />
          <div>
            <p className="font-display text-lg font-bold">{t('verifier.challengeSolved')}</p>
            <p className="text-muted text-sm">{t('verifier.challengeSolvedText')}</p>
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          {findings.length === 0 ? (
            <CheckCircle2 className="text-ok shrink-0" size={30} />
          ) : (
            <AlertTriangle
              className={errors ? 'text-err shrink-0' : 'text-warn shrink-0'}
              size={30}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-bold" data-testid="verdict">
              {findings.length === 0
                ? t('verifier.noErrors')
                : findings.length === 1
                  ? t('verifier.problem')
                  : t('verifier.problems', { n: findings.length })}
            </p>
            <p className="text-muted text-sm">
              {!stats.complete
                ? t('verifier.incompleteText')
                : findings.length === 0
                  ? t('verifier.noErrorsText')
                  : null}
            </p>
          </div>
          {!stats.complete && <span className="chip text-warn">{t('verifier.incomplete')}</span>}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label={`${t('stats.states')} · ${t('stats.withPor')}`}
            value={fmt(stats.states)}
            accent
          />
          <Stat
            label={`${t('stats.states')} · ${t('stats.withoutPor')}`}
            value={base ? `${base.complete ? '' : '≥ '}${fmt(base.states)}` : '—'}
            extra={saved !== null && saved > 0 ? `−${saved}% ${t('stats.saved')}` : undefined}
          />
          <Stat
            label={t('stats.transitions')}
            value={fmt(stats.transitions)}
            extra={base ? `${t('stats.withoutPor')}: ${fmt(base.transitions)}` : undefined}
          />
          <Stat
            label={t('stats.time')}
            value={`${fmt(stats.timeMs)} ms`}
            extra={`${t('stats.depth')}: ${stats.maxDepth}`}
          />
        </dl>
      </GlassCard>

      {findings.length > 0 && (
        <ul className="grid gap-2" data-testid="findings">
          {findings.map((f, i) => (
            <FindingCard
              key={f.id}
              finding={f}
              index={i}
              active={selection.kind === 'finding' && selection.id === f.id}
              activeOutcome={
                selection.kind === 'finding' && selection.id === f.id
                  ? selection.outcome
                  : undefined
              }
              onSelect={(outcome) => select({ kind: 'finding', id: f.id, outcome })}
              title={tb(f.title)}
              detail={tb(f.detail)}
              kindLabel={t(KIND_KEY[f.kind])}
            />
          ))}
        </ul>
      )}
      {example?.challenge && !solved && findings.length > 0 && (
        <p className="text-muted flex items-center gap-2 px-1 text-sm">
          <Sparkles size={15} className="text-accent" /> {tb(example.challenge.hint)}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  extra,
  accent,
}: {
  label: string;
  value: string;
  extra?: string;
  accent?: boolean;
}) {
  return (
    <div className="border-line rounded-xl border px-3 py-2">
      <dt className="text-subtle text-[11px] leading-tight font-semibold uppercase">{label}</dt>
      <dd className={`font-display text-xl font-bold ${accent ? 'text-gradient' : ''}`}>{value}</dd>
      {extra && <dd className="text-ok text-[11px] font-semibold">{extra}</dd>}
    </div>
  );
}

function FindingCard({
  finding,
  index,
  active,
  activeOutcome,
  onSelect,
  title,
  detail,
  kindLabel,
}: {
  finding: Finding;
  index: number;
  active: boolean;
  activeOutcome?: number;
  onSelect: (outcome?: number) => void;
  title: string;
  detail: string;
  kindLabel: string;
}) {
  const { t } = useT();
  const tone = finding.severity === 'error' ? 'var(--err)' : 'var(--warn)';
  return (
    <li
      className="glass animate-fade-up p-3 transition-shadow"
      style={{
        animationDelay: `${index * 60}ms`,
        borderColor: active ? tone : undefined,
        boxShadow: active ? `0 0 0 1px ${tone}, var(--shadow)` : undefined,
      }}
      data-testid={`finding-${finding.kind}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl"
          style={{ color: tone, background: `color-mix(in srgb, ${tone} 15%, transparent)` }}
        >
          {KIND_ICON[finding.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-wide uppercase" style={{ color: tone }}>
            {kindLabel}
          </p>
          <p className="font-display font-bold">{title}</p>
          <p className="text-muted mt-0.5 text-sm leading-relaxed">{detail}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {finding.outcomes ? (
              finding.outcomes.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`btn px-2.5 py-1 text-xs ${active && (activeOutcome ?? 1) === i ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => onSelect(i)}
                >
                  {t('verifier.outcome', { n: i + 1 })}
                </button>
              ))
            ) : (
              <button
                type="button"
                className={`btn px-2.5 py-1 text-xs ${active ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onSelect()}
              >
                {active ? t('verifier.viewing') : t('verifier.viewTrace')} ·{' '}
                {t('verifier.steps', { n: finding.trace.steps.length })}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
