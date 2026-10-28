import { useCallback } from 'react';
import type { Bilingual } from '@/core/telarc';
import { useSettings, type Locale } from '@/stores/settings';
import { en } from './en';
import { es, type MessageKey } from './es';

const DICTS = { es, en } as const;

export type Params = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const text: string = DICTS[locale][key] ?? es[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

/** Hook de traducción: `t('clave', { n: 3 })`. También traduce textos bilingües del núcleo. */
export function useT() {
  const locale = useSettings((s) => s.locale);
  const t = useCallback(
    (key: MessageKey, params?: Params) => translate(locale, key, params),
    [locale],
  );
  const tb = useCallback((b: Bilingual) => b[locale], [locale]);
  return { t, tb, locale };
}

export function formatNumber(n: number, locale: Locale): string {
  return n.toLocaleString(locale === 'es' ? 'es-PE' : 'en-US');
}

export type { MessageKey };
