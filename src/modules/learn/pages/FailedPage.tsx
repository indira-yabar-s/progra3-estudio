import { ArrowLeft, PartyPopper } from 'lucide-react';
import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useT } from '@/i18n';
import { href } from '@/lib/router';
import { allQuestions } from '../content';
import { QuestionCard } from '../components/QuestionCard';
import { useProgress } from '../progress';

/** Repaso de las preguntas falladas (de lecciones y simulacros). */
export function FailedPage() {
  const { t } = useT();
  const { answers, recordAnswer } = useProgress();
  // Foto al entrar: la lista no cambia mientras respondes.
  const [failed] = useState(() =>
    allQuestions().filter((q) => answers[q.question.id] && !answers[q.question.id]!.correct),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <a
        href={href('/aprende')}
        className="text-muted hover:text-fg inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft size={15} /> {t('learn.title')}
      </a>
      <h1 className="font-display mt-4 text-3xl font-extrabold">{t('learn.failed')}</h1>
      {failed.length === 0 ? (
        <GlassCard className="mt-6 flex items-center gap-3 p-6">
          <PartyPopper className="text-accent" size={28} />
          <p className="text-lg">{t('learn.noFailed')}</p>
        </GlassCard>
      ) : (
        <div className="mt-6 grid gap-4">
          {failed.map((ref, i) => (
            <div key={ref.question.id}>
              <p className="text-subtle mb-1 text-xs">
                {ref.source.kind === 'lesson' ? ref.source.lessonTitle : t('learn.exam')}
              </p>
              <QuestionCard
                question={ref.question}
                index={i}
                onChecked={(ok) => recordAnswer(ref.question.id, ok)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
