import {
  Box,
  CheckCircle2,
  ClipboardList,
  Gauge,
  GitFork,
  Layers,
  Puzzle,
  RotateCcw,
  Target,
  Timer,
  Workflow,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useT } from '@/i18n';
import { href } from '@/lib/router';
import { allQuestions, COURSES, getLessons, getTopic } from '../content';
import { isViewed, useProgress } from '../progress';

const ICONS: Record<string, typeof Workflow> = {
  workflow: Workflow,
  gauge: Gauge,
  puzzle: Puzzle,
  layers: Layers,
  'git-fork': GitFork,
  box: Box,
};

export function LearnHome() {
  const { t, locale } = useT();
  const { viewed, answers, exams, reset } = useProgress();
  const questions = allQuestions();
  const answered = questions.filter((q) => answers[q.question.id]);
  const correct = answered.filter((q) => answers[q.question.id]!.correct).length;
  const failed = answered.length - correct;
  const allLessons = COURSES.flatMap((c) =>
    c.topics
      .filter((tp) => tp.status === 'available')
      .flatMap((tp) => getLessons(tp.id).map((l) => ({ topic: tp.id, l }))),
  );
  const viewedCount = allLessons.filter(({ topic, l }) => isViewed(viewed, topic, l.id)).length;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16">
      <header className="animate-fade-up">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="text-gradient">{t('learn.title')}</span>
        </h1>
        <p className="text-muted mt-3 max-w-2xl text-lg">{t('learn.subtitle')}</p>
        {locale !== 'es' && <p className="chip text-warn mt-3">{t('learn.contentLang')}</p>}
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-3" aria-label={t('learn.progress')}>
        <GlassCard className="p-4">
          <p className="text-subtle text-xs font-semibold uppercase">{t('learn.lessons')}</p>
          <p className="font-display text-2xl font-bold">
            {t('learn.viewed', { n: viewedCount, total: allLessons.length })}
          </p>
          <div className="bg-accent/15 mt-2 h-1.5 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-3)]"
              style={{ width: `${(viewedCount / Math.max(1, allLessons.length)) * 100}%` }}
            />
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-subtle text-xs font-semibold uppercase">{t('learn.quiz')}</p>
          <p className="font-display text-2xl font-bold">
            {answered.length
              ? t('learn.accuracy', { pct: Math.round((correct / answered.length) * 100) })
              : '—'}
          </p>
          <p className="text-muted text-xs">
            {answered.length}/{questions.length}
          </p>
        </GlassCard>
        <a
          href={href('/aprende/repasar')}
          className="glass block p-4 transition-transform hover:-translate-y-0.5"
        >
          <p className="text-subtle text-xs font-semibold uppercase">{t('learn.failed')}</p>
          <p className={`font-display text-2xl font-bold ${failed ? 'text-err' : 'text-ok'}`}>
            {t('learn.failedCount', { n: failed })}
          </p>
          <p className="text-muted text-xs">
            {failed ? t('learn.continue') + ' →' : t('learn.noFailed')}
          </p>
        </a>
      </section>

      {COURSES.map((course) => (
        <section key={course.id} className="mt-10">
          <h2 className="font-display mb-4 text-2xl font-bold">
            {t('learn.course')} · {course.title}{' '}
            <span className="text-subtle text-base">({course.institution})</span>
          </h2>
          <div className="grid gap-4">
            {course.topics.map((ref) => {
              const Icon = ICONS[ref.icon] ?? Workflow;
              const topic = getTopic(ref.id);
              if (ref.status !== 'available' || !topic) {
                return (
                  <GlassCard key={ref.id} className="flex items-center gap-4 p-4 opacity-60">
                    <Icon className="text-subtle shrink-0" size={22} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold">{ref.title}</p>
                      <p className="text-muted text-sm">{ref.description}</p>
                    </div>
                    <span className="chip text-subtle">{t('common.comingSoon')}</span>
                  </GlassCard>
                );
              }
              const lessons = getLessons(topic.id);
              const exam = topic.exam ? exams[topic.exam.id] : undefined;
              return (
                <GlassCard key={ref.id} glow className="p-5">
                  <div className="flex items-start gap-4">
                    <span className="bg-accent/12 text-accent grid size-11 shrink-0 place-items-center rounded-2xl">
                      <Icon size={22} />
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-bold">{topic.title}</h3>
                      <p className="text-muted text-sm">{topic.description}</p>
                    </div>
                  </div>
                  <ol className="mt-4 grid gap-2">
                    {lessons.map((l) => {
                      const seen = isViewed(viewed, topic.id, l.id);
                      return (
                        <li key={l.id}>
                          <a
                            href={href(`/aprende/${topic.id}/${l.id}`)}
                            className="border-line hover:bg-accent/5 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors"
                            data-testid={`lesson-link-${l.id}`}
                          >
                            <span className="text-accent font-mono text-sm font-bold">
                              {String(l.number).padStart(2, '0')}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold">{l.title}</span>
                              <span className="text-muted block text-xs">{l.subtitle}</span>
                            </span>
                            <span className="text-subtle hidden items-center gap-1 text-xs sm:flex">
                              <Timer size={13} /> {t('common.minutes', { n: l.minutes })}
                            </span>
                            {seen && (
                              <CheckCircle2
                                size={18}
                                className="text-ok shrink-0"
                                aria-label={t('learn.viewedBadge')}
                              />
                            )}
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {topic.review && (
                      <a
                        href={href(`/aprende/${topic.id}/repaso`)}
                        className="btn btn-ghost justify-start py-3"
                      >
                        <ClipboardList size={17} /> {t('learn.review')}
                      </a>
                    )}
                    {topic.exam && (
                      <a
                        href={href(`/aprende/${topic.id}/simulacro`)}
                        className="btn btn-primary justify-start py-3"
                      >
                        <Target size={17} /> {t('learn.exam')} ·{' '}
                        {t('learn.examDesc', { n: topic.exam.questions.length })}
                        {exam && (
                          <span className="ml-auto text-xs opacity-90">
                            {t('learn.bestScore', { score: exam.best })}
                          </span>
                        )}
                      </a>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </section>
      ))}

      <div className="mt-10 text-center">
        <button
          type="button"
          className="btn btn-ghost text-muted text-xs"
          onClick={() => {
            if (window.confirm(t('learn.resetConfirm'))) reset();
          }}
        >
          <RotateCcw size={14} /> {t('learn.reset')}
        </button>
      </div>
    </div>
  );
}
