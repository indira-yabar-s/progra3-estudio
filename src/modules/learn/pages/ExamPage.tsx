import { ArrowLeft, ArrowRight, Award, RotateCcw, Target } from 'lucide-react';
import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useT } from '@/i18n';
import { href } from '@/lib/router';
import { getTopic } from '../content';
import { QuestionCard } from '../components/QuestionCard';
import { gradeOver20, PASSING, useProgress } from '../progress';

export function ExamPage({ topicId }: { topicId: string }) {
  const { t } = useT();
  const exam = getTopic(topicId)?.exam;
  const { recordAnswer, recordExam } = useProgress();
  const [answers, setAnswers] = useState<(number | null)[]>(
    () => exam?.questions.map(() => null) ?? [],
  );
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  if (!exam) return null;

  const n = exam.questions.length;
  const answeredCount = answers.filter((a) => a !== null).length;
  const correctCount = exam.questions.filter((q, i) => q.options[answers[i] ?? -1]?.correct).length;
  const score = gradeOver20(correctCount, n);
  const pts = (20 / n).toFixed(2).replace(/\.?0+$/, '');

  const finish = () => {
    exam.questions.forEach((q, i) => {
      if (answers[i] !== null) recordAnswer(q.id, !!q.options[answers[i]!]?.correct);
    });
    recordExam(exam.id, score);
    setFinished(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const restart = () => {
    setAnswers(exam.questions.map(() => null));
    setCurrent(0);
    setFinished(false);
    setStarted(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <a
        href={href('/aprende')}
        className="text-muted hover:text-fg inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft size={15} /> {t('learn.title')}
      </a>
      <h1 className="font-display mt-4 text-3xl font-extrabold">
        <Target className="text-accent mr-2 inline" size={28} />
        {exam.title}
      </h1>

      {!started && !finished && (
        <GlassCard glow className="mt-6 p-6">
          <p className="text-lg">{t('exam.intro', { n, pts })}</p>
          <button
            type="button"
            className="btn btn-primary mt-5 px-6 py-3"
            onClick={() => setStarted(true)}
            data-testid="exam-start"
          >
            {t('learn.start')} <ArrowRight size={17} />
          </button>
        </GlassCard>
      )}

      {started && !finished && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-mono font-bold">{t('exam.question', { i: current + 1, n })}</span>
            <span className="text-muted">{t('exam.answered', { n: answeredCount, total: n })}</span>
          </div>
          <div
            className="mb-4 flex flex-wrap gap-1.5"
            role="navigation"
            aria-label={t('exam.title')}
          >
            {exam.questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setCurrent(i)}
                aria-current={i === current ? 'step' : undefined}
                className={`size-8 rounded-lg border font-mono text-xs font-bold transition-colors ${
                  i === current
                    ? 'border-[color:var(--accent)] bg-accent/20'
                    : answers[i] !== null
                      ? 'border-line bg-accent/10'
                      : 'border-line text-subtle'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <QuestionCard
            key={exam.questions[current]!.id}
            question={exam.questions[current]!}
            index={current}
            mode="exam"
            selected={answers[current]}
            onSelect={(choice) => setAnswers((a) => a.map((x, i) => (i === current ? choice : x)))}
          />
          <div className="mt-4 flex flex-wrap justify-between gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={current === 0}
              onClick={() => setCurrent((c) => c - 1)}
            >
              <ArrowLeft size={16} /> {t('common.prev')}
            </button>
            {current < n - 1 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCurrent((c) => c + 1)}
              >
                {t('common.next')} <ArrowRight size={16} />
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={finish}
              disabled={answeredCount === 0}
              data-testid="exam-finish"
            >
              {t('exam.finish')}
            </button>
          </div>
        </div>
      )}

      {finished && (
        <div className="mt-6 grid gap-4">
          <GlassCard
            glow
            className="animate-pop flex flex-wrap items-center gap-5 p-6"
            role="status"
          >
            <Award size={44} className={score >= PASSING ? 'text-ok' : 'text-warn'} />
            <div className="flex-1">
              <p className="text-subtle text-xs font-semibold uppercase">{t('exam.score')}</p>
              <p className="font-display text-5xl font-extrabold" data-testid="exam-score">
                <span className="text-gradient">{score}</span>
                <span className="text-muted text-2xl">/20</span>
              </p>
              <p className={`font-bold ${score >= PASSING ? 'text-ok' : 'text-warn'}`}>
                {score >= PASSING ? t('exam.passed') : t('exam.failed')} · {correctCount}/{n}
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={restart}>
              <RotateCcw size={16} /> {t('exam.retry')}
            </button>
          </GlassCard>
          <h2 className="font-display mt-4 text-2xl font-bold">{t('exam.review')}</h2>
          {exam.questions.map((q, i) => (
            <div key={q.id}>
              {answers[i] === null && (
                <p className="text-warn mb-1 text-sm font-semibold">{t('exam.unanswered')}</p>
              )}
              <QuestionCard question={q} index={i} mode="exam" selected={answers[i]} reveal />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
