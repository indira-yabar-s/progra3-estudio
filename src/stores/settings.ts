import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'light' | 'dark' | 'system';
export type Locale = 'es' | 'en';

interface SettingsState {
  theme: ThemePref;
  locale: Locale;
  setTheme: (t: ThemePref) => void;
  setLocale: (l: Locale) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: 'es',
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'telar:settings', version: 1 },
  ),
);

/** Resuelve "system" y aplica la clase .dark al <html>. */
export function applyTheme(pref: ThemePref): boolean {
  const dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  return dark;
}
