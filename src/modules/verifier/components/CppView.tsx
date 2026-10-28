import { Check, Copy, FileCode2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { CardHeader, GlassCard } from '@/components/ui/GlassCard';
import { toCpp } from '@/core/telarc/cppgen';
import { useT } from '@/i18n';

const CodeEditor = lazy(() => import('../monaco/CodeEditor'));

export function CppView({ source }: { source: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const cpp = useMemo(() => {
    try {
      return toCpp(source);
    } catch {
      return null;
    }
  }, [source]);

  return (
    <GlassCard>
      <CardHeader
        icon={<FileCode2 size={16} />}
        title={t('cpp.title')}
        hint={t('cpp.hint')}
        actions={
          cpp && (
            <button
              type="button"
              className="btn btn-ghost px-2.5 py-1.5 text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(cpp).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          )
        }
      />
      <div className="h-[520px] px-1 pb-2" data-testid="cpp">
        {cpp ? (
          <Suspense fallback={null}>
            <CodeEditor value={cpp} language="cpp" readOnly ariaLabel={t('cpp.title')} />
          </Suspense>
        ) : (
          <p className="text-muted p-4 text-sm">{t('verifier.compileError')}</p>
        )}
      </div>
    </GlassCard>
  );
}
