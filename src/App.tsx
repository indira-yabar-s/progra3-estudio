import { Suspense, useEffect } from 'react';
import { Background } from '@/components/layout/Background';
import { Header } from '@/components/layout/Header';
import { PwaToast } from '@/components/layout/PwaToast';
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

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.path]);

  const first = route.segments[0];
  const mod = first ? findModule(first) : null;
  const Page = mod?.component;

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
          <Suspense fallback={<PageLoader />}>
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

function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-live="polite">
      <div className="border-accent size-10 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
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
