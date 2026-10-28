import { Suspense, useEffect } from 'react';
import { Background } from '@/components/layout/Background';
import { Header } from '@/components/layout/Header';
import { PwaToast } from '@/components/layout/PwaToast';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { useT } from '@/i18n';
import { href, useRoute } from '@/lib/router';
import HomePage from '@/modules/home/HomePage';
import { findModule } from '@/modules/registry';
import { applyTheme, useSettings } from '@/stores/settings';

export default function App() {
  const route = useRoute();
  const { t, locale } = useT();
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const lite = useSettings((s) => s.lite);
  useEffect(() => {
    if (lite !== null) document.documentElement.classList.toggle('lite', lite);
  }, [lite]);

  // Pausa todas las animaciones CSS mientras la pestaña no está visible.
  useEffect(() => {
    const sync = () => document.documentElement.classList.toggle('tab-hidden', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.path]);

  const first = route.segments[0];
  const mod = first ? findModule(first) : null;
  const Page = mod?.component;
  const Skeleton = mod?.skeleton;

  return (
    <>
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="bg-accent text-accent-fg sr-only z-50 rounded-lg px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('nav.skip')}
      </a>
      <Background />
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        {!first ? (
          <HomePage />
        ) : Page ? (
          <Suspense fallback={Skeleton ? <Skeleton /> : <PageSkeleton label={t('loading.page')} />}>
            <Page />
          </Suspense>
        ) : (
          <NotFound />
        )}
      </main>
      <footer className="no-print text-subtle px-4 pb-8 text-center text-xs">
        Telar · {t('app.tagline')} ·{' '}
        <a
          className="hover:text-fg underline-offset-2 hover:underline"
          href="https://github.com/indira-yabar-s/progra3-estudio"
        >
          GitHub
        </a>
      </footer>
      <PwaToast />
    </>
  );
}

function NotFound() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-bold">{t('notFound.title')}</h1>
      <a href={href('/')} className="btn btn-primary mt-6">
        {t('notFound.back')}
      </a>
    </div>
  );
}
