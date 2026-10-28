import { ArrowLeft, Printer } from 'lucide-react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { useT } from '@/i18n';
import { href } from '@/lib/router';
import { getLessons, getTopic } from '../content';

/** Hoja de repaso imprimible: tabla de herramientas, trampas y el resumen de cada lección. */
export function ReviewPage({ topicId }: { topicId: string }) {
  const { t } = useT();
  const topic = getTopic(topicId);
  if (!topic) return null;
  const lessons = getLessons(topicId);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-16">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <a
          href={href('/aprende')}
          className="text-muted hover:text-fg inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft size={15} /> {t('learn.title')}
        </a>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> {t('common.print')}
        </button>
      </div>
      <p className="no-print text-subtle mt-2 text-right text-xs">{t('learn.printHint')}</p>

      <header className="mt-4">
        <h1 className="font-display text-3xl font-extrabold">
          {t('learn.review')} · <span className="text-gradient">{topic.title}</span>
        </h1>
        <p className="text-muted mt-1">{topic.description}</p>
      </header>

      {topic.review && (
        <>
          <GlassCard className="print-page mt-6 overflow-x-auto p-4">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-line text-subtle border-b text-xs uppercase">
                  <th className="py-2 pr-3">C++</th>
                  <th className="py-2 pr-3">¿Para qué?</th>
                  <th className="py-2">Cuidado</th>
                </tr>
              </thead>
              <tbody>
                {topic.review.cheatsheet.map((row) => (
                  <tr key={row.tool} className="border-line border-b last:border-0">
                    <td className="text-accent py-2 pr-3 font-mono text-[13px] font-semibold">
                      {row.tool}
                    </td>
                    <td className="py-2 pr-3">{row.use}</td>
                    <td className="text-muted py-2">{row.careful}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>

          <GlassCard className="print-page mt-4 p-5">
            <h2 className="font-display text-lg font-bold">⚠️ Trampas clásicas</h2>
            <ul className="mt-2 grid list-disc gap-1 pl-5">
              {topic.review.pitfalls.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </GlassCard>
        </>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 print:grid-cols-2">
        {lessons.map((l) => {
          const code = l.sections.find((s) => s.type === 'code');
          return (
            <GlassCard key={l.id} className="print-page p-5">
              <p className="text-accent font-mono text-xs font-bold">
                {t('learn.lessonN', { n: l.number })}
              </p>
              <h2 className="font-display text-lg font-bold">{l.title}</h2>
              <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm">
                {l.remember.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              {code?.type === 'code' && l.number >= 3 && (
                <CodeBlock
                  code={code.code.split('\n').slice(0, 14).join('\n')}
                  caption={code.title}
                  maxHeight={260}
                />
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
