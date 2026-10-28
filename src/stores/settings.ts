import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'light' | 'dark' | 'system';
export type Locale = 'es' | 'en';

interface SettingsState {
  theme: ThemePref;
  locale: Locale;
  /** Modo ligero: sin blur ni luces animadas. null = aún no decidido (se detecta solo). */
  lite: boolean | null;
  setTheme: (t: ThemePref) => void;
  setLocale: (l: Locale) => void;
  setLite: (l: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: 'es',
      lite: null,
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      setLite: (lite) => set({ lite }),
    }),
    {
      name: 'telar:settings',
      version: 1,
      // Primera visita: si el equipo parece lento, se activa el modo ligero y queda guardado.
      onRehydrateStorage: () => (state) => {
        if (state && state.lite === null) state.setLite(detectSlowDevice());
      },
    },
  ),
);

/** Heurística de equipo lento: 4 núcleos o menos, o el usuario pidió menos movimiento. */
export function detectSlowDevice(): boolean {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (cores !== undefined && cores <= 4) || !!reduced;
}

/** Resuelve "system" y aplica la clase .dark al <html>. */
export function applyTheme(pref: ThemePref): boolean {
  const dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  return dark;
}
