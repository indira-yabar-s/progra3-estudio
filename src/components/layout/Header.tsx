import { Feather, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useT } from '@/i18n';
import { href, useRoute } from '@/lib/router';
import { MODULES } from '@/modules/registry';
import { useSettings, type ThemePref } from '@/stores/settings';
import { Logo } from './Logo';

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'dark', dark: 'light', light: 'system' };

export function Header() {
  const { t, locale } = useT();
  const route = useRoute();
  const { theme, setTheme, setLocale, lite, setLite } = useSettings();
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeLabel = t(
    theme === 'dark' ? 'theme.dark' : theme === 'light' ? 'theme.light' : 'theme.system',
  );
  const navModules = MODULES.filter((m) => m.component && m.navKey);

  return (
    <header className="no-print sticky top-0 z-30 px-3 pt-3 sm:px-5">
      <nav
        className="glass glass-strong glass-blur mx-auto flex max-w-[1600px] items-center gap-2 px-2 py-2 sm:gap-4 sm:px-3"
        aria-label="Telar"
      >
        <a href={href('/')} className="flex items-center gap-2 rounded-xl pr-2">
          <Logo size={34} />
          <span className="font-display text-xl font-extrabold tracking-tight">
            Tel<span className="text-gradient">ar</span>
          </span>
        </a>

        <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {navModules.map((m) => {
            const active = route.segments[0] === m.path;
            const Icon = m.icon;
            return (
              <li key={m.id}>
                <a
                  href={href(`/${m.path}`)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition-colors sm:px-3 ${
                    active ? 'bg-accent/15 text-fg' : 'text-muted hover:text-fg'
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{t(m.navKey!)}</span>
                </a>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-icon gap-1 px-2 font-mono text-xs uppercase"
            onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
            aria-label={t('lang.toggle')}
            title={t('lang.toggle')}
          >
            <Languages size={16} aria-hidden="true" />
            {locale}
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-icon ${lite ? 'text-accent bg-accent/12' : ''}`}
            onClick={() => setLite(!lite)}
            aria-pressed={!!lite}
            aria-label={t('lite.toggle')}
            title={`${t('lite.toggle')}: ${lite ? t('lite.on') : t('lite.off')} — ${t('lite.hint')}`}
            data-testid="lite-toggle"
          >
            <Feather size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setTheme(NEXT_THEME[theme])}
            aria-label={`${t('theme.toggle')} (${themeLabel})`}
            title={`${t('theme.toggle')} (${themeLabel})`}
          >
            <ThemeIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </nav>
    </header>
  );
}
