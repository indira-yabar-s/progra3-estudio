import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { highlight, type TokenClass } from '@/lib/highlight';

const CLS: Record<TokenClass, string> = {
  kw: 'text-[color:var(--accent)] font-semibold',
  type: 'text-[color:var(--accent-3)]',
  str: 'text-[color:var(--ok)]',
  num: 'text-[color:var(--warn)]',
  com: 'text-subtle italic',
  fn: 'text-[color:var(--read)]',
  pre: 'text-[color:var(--accent-2)]',
  plain: '',
};

export function CodeBlock({
  code,
  language = 'cpp',
  caption,
  maxHeight,
}: {
  code: string;
  language?: string;
  caption?: string;
  maxHeight?: number;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => highlight(code), [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* el portapapeles puede no estar disponible */
    }
  };

  return (
    <figure className="group border-line my-3 overflow-hidden rounded-2xl border bg-black/[0.04] dark:bg-black/30">
      <div className="border-line text-subtle flex items-center justify-between border-b px-3 py-1.5 font-mono text-[11px] uppercase">
        <span>{caption ?? language}</span>
        <button
          type="button"
          onClick={copy}
          className="hover:text-fg no-print flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors"
          aria-label={t('common.copy')}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span className="normal-case">{copied ? t('common.copied') : t('common.copy')}</span>
        </button>
      </div>
      <pre
        className="overflow-auto p-3 font-mono text-[13px] leading-relaxed"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code>
          {tokens.map((tk, i) => (
            <span key={i} className={CLS[tk.cls]}>
              {tk.text}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
