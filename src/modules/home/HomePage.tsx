import { ArrowRight, BookOpen, Bug, Network, Route as RouteIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useT } from '@/i18n';
import { href } from '@/lib/router';
import { MODULES } from '@/modules/registry';
import { HeroAurora } from './HeroAurora';
import { HeroLoom } from './HeroLoom';

export default function HomePage() {
  const { t } = useT();
  const features = [
    { icon: Network, title: t('home.feature.explore'), text: t('home.feature.exploreText') },
    { icon: Bug, title: t('home.feature.detect'), text: t('home.feature.detectText') },
    { icon: RouteIcon, title: t('home.feature.trace'), text: t('home.feature.traceText') },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:pt-14">
      <section className="relative isolate grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <HeroAurora />
        <div className="animate-fade-up">
          <p className="chip text-accent mb-5">{t('home.kicker')}</p>
          <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl">
            {t('home.title').split(' ').slice(0, -2).join(' ')}{' '}
            <span className="text-gradient">{t('home.title').split(' ').slice(-2).join(' ')}</span>
          </h1>
          <p className="text-muted mt-5 max-w-xl text-lg leading-relaxed">{t('home.subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={href('/verificador', { ejemplo: 'deadlock-clasico' })}
              className="btn btn-primary px-5 py-3 text-base"
            >
              {t('home.ctaVerify')} <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a href={href('/aprende')} className="btn btn-ghost px-5 py-3 text-base">
              <BookOpen size={18} aria-hidden="true" /> {t('home.ctaLearn')}
            </a>
          </div>
        </div>
        <GlassCard glow className="animate-fade-up p-4 sm:p-6" style={{ animationDelay: '120ms' }}>
          <HeroLoom />
        </GlassCard>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, text }, i) => (
          <GlassCard
            key={title}
            className="animate-fade-up p-5"
            style={{ animationDelay: `${200 + i * 80}ms` }}
          >
            <Icon className="text-accent mb-3" size={22} aria-hidden="true" />
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <p className="text-muted mt-1 text-sm leading-relaxed">{text}</p>
          </GlassCard>
        ))}
      </section>

      <section className="mt-14">
        <h2 className="font-display mb-4 text-2xl font-bold">{t('home.modules')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => {
            const Icon = m.icon;
            const available = !!m.component;
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <span className="bg-accent/12 text-accent grid size-11 place-items-center rounded-2xl">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <span className={`chip ${available ? 'text-ok' : 'text-subtle'}`}>
                    {available ? t('common.phase', { n: m.phase }) : t('common.comingSoon')}
                  </span>
                </div>
                <h3 className="font-display mt-4 text-lg font-bold">{t(m.titleKey)}</h3>
                <p className="text-muted mt-1 text-sm leading-relaxed">{t(m.descKey)}</p>
              </>
            );
            return available ? (
              <a
                key={m.id}
                href={href(`/${m.path}`)}
                className="glass block p-5 transition-transform duration-200 hover:-translate-y-1"
              >
                {body}
              </a>
            ) : (
              <div key={m.id} className="glass p-5 opacity-60" aria-disabled="true">
                {body}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
