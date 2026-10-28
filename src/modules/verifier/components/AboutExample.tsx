import { Eye, Info } from 'lucide-react';
import { CardHeader, GlassCard } from '@/components/ui/GlassCard';
import { Markdown } from '@/components/ui/Markdown';
import type { TelarExample } from '@/core/telarc/examples';
import { useT, type MessageKey } from '@/i18n';

const LEVEL: Record<TelarExample['level'], MessageKey> = {
  basic: 'about.level.basic',
  intermediate: 'about.level.intermediate',
  advanced: 'about.level.advanced',
};

export function AboutExample({ example }: { example: TelarExample | null }) {
  const { t, tb } = useT();
  if (!example) {
    return (
      <GlassCard className="p-5">
        <h2 className="font-display text-lg font-bold">{t('about.custom')}</h2>
        <p className="text-muted mt-1 text-sm">{t('about.customText')}</p>
      </GlassCard>
    );
  }
  return (
    <GlassCard data-testid="about">
      <CardHeader
        icon={<Info size={16} />}
        title={tb(example.title)}
        actions={<span className="chip">{t(LEVEL[example.level])}</span>}
      />
      <div className="px-4 pb-4">
        <Markdown text={tb(example.explanation)} className="text-[15px]" />
        <h3 className="font-display mt-4 flex items-center gap-2 font-bold">
          <Eye size={16} className="text-accent" /> {t('about.observe')}
        </h3>
        <ul className="mt-2 grid gap-2">
          {example.observe.map((o, i) => (
            <li key={i} className="border-line rounded-xl border px-3 py-2 text-sm">
              <Markdown text={tb(o)} />
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
}
