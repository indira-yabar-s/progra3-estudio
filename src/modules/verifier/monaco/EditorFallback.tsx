import { Pencil } from 'lucide-react';
import { useMemo } from 'react';
import { useT } from '@/i18n';
import { highlight } from '@/lib/highlight';

const CLS: Record<string, string> = {
  kw: 'text-[color:var(--accent)] font-semibold',
  type: 'text-[color:var(--accent-3)]',
  num: 'text-[color:var(--warn)]',
  com: 'text-subtle italic',
  fn: 'text-[color:var(--read)]',
  pre: 'text-[color:var(--accent-2)]',
  str: 'text-[color:var(--ok)]',
  plain: '',
};

/**
 * Vista previa del código con la misma tipografía y alto de línea que Monaco.
 * - Con `onActivate`: es una "fachada" (facade). Al hacer clic o pulsar una tecla
 *   se carga el editor real. Así la página abre al instante sin bajar Monaco.
 * - Sin `onActivate`: es el estado de carga mientras Monaco descarga.
 */
export function EditorFallback({ code, onActivate }: { code: string; onActivate?: () => void }) {
  const { t } = useT();
  const lines = useMemo(() => {
    const out: { text: string; cls: string }[][] = [[]];
    for (const tk of highlight(code)) {
      tk.text.split('\n').forEach((part, i) => {
        if (i > 0) out.push([]);
        if (part) out[out.length - 1]!.push({ text: part, cls: CLS[tk.cls] ?? '' });
      });
    }
    return out;
  }, [code]);

  const pre = (
    <pre
      className="h-full overflow-auto py-3 font-mono text-[14px] leading-[22px]"
      aria-hidden="true"
    >
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="text-subtle w-[52px] shrink-0 pr-4 text-right select-none">{i + 1}</span>
          <span className="whitespace-pre">
            {line.map((tk, j) => (
              <span key={j} className={tk.cls}>
                {tk.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  );

  if (!onActivate) {
    return (
      <div className="relative h-full overflow-hidden" role="status" aria-busy="true">
        <span className="sr-only">{t('loading.editor')}</span>
        {pre}
        <span className="chip glass-strong absolute right-3 bottom-3 text-[11px] shadow-lg">
          {t('loading.editor')}
        </span>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('verifier.editHint')}
      onPointerDown={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Tab' || e.key === 'Shift') return;
        e.preventDefault();
        onActivate();
      }}
      className="group relative h-full cursor-text overflow-hidden"
      data-testid="editor-facade"
    >
      {pre}
      <span className="chip glass-strong text-accent absolute right-3 bottom-3 text-[11px] shadow-lg">
        <Pencil size={12} aria-hidden="true" /> {t('verifier.editHint')}
      </span>
    </div>
  );
}
