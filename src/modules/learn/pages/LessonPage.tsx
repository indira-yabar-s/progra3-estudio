import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  PlayCircle,
  Timer,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useT } from '@/i18n';
import { href } from '@/lib/router';
import { getLessons, getTopic } from '../content';
import { LessonSection } from '../components/LessonSection';
import { QuestionCard } from '../components/QuestionCard';
import { isViewed, useProgress } from '../progress';

export function LessonPage({ topicId, lessonId }: { topicId: string; lessonId: string }) {
  const { t } = useT();
  const topic = getTopic(topicId);
  const lessons = getLessons(topicId);
  const idx = lessons.findIndex((l) => l.id === lessonId);
  const lesson = lessons[idx];
  const { viewed, markViewed, recordAnswer } = useProgress();
  const endRef = useRef<HTMLDivElement>(null);

  // La lección cuenta como vista cuando llegas al resumen final.
  useEffect(() => {
    const el = endRef.current;
    if (!el || !lesson) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) markViewed(topicId, lesson.id);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [lesson, topicId, markViewed]);

  if (!topic || !lesson) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">{t('notFound.title')}</h1>
        <a href={href('/aprende')} className="btn btn-primary mt-6">
          {t('common.back')}
        </a>
      </div>
    );
  }
  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];
  const seen = isViewed(viewed, topicId, lesson.id);

  return (
    <article className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <a
        href={href('/aprende')}
        className="text-muted hover:text-fg no-print inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft size={15} /> {topic.title}
      </a>

      <header className="animate-fade-up mt-4">
        <p className="text-accent font-mono text-sm font-bold">
          {t('learn.lessonN', { n: lesson.number })} · {topic.title}
        </p>
        <h1 className="font-display mt-1 text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
          {lesson.title}
        </h1>
        <p className="text-muted mt-2 text-lg">{lesson.subtitle}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="chip">
            <Timer size={13} /> {t('common.minutes', { n: lesson.minutes })}
          </span>
          {seen && (
            <span className="chip text-ok">
              <CheckCircle2 size={13} /> {t('learn.viewedBadge')}
            </span>
          )}
          {lesson.telarExample && (
            <a
              href={href('/verificador', { ejemplo: lesson.telarExample })}
              className="btn btn-primary ml-auto"
              title={t('learn.openInTelarHint')}
              data-testid="open-in-telar"
            >
              <PlayCircle size={17} /> {t('learn.openInTelar')}
            </a>
          )}
        </div>
      </header>

      <div className="mt-8">
        {lesson.sections.map((s, i) => (
          <LessonSection key={i} section={s} />
        ))}
      </div>

      {lesson.telarExample && (
        <GlassCard glow className="no-print my-8 flex flex-wrap items-center gap-4 p-5">
          <p className="min-w-0 flex-1">
            <span className="font-display block font-bold">{t('learn.openInTelar')}</span>
            <span className="text-muted text-sm">{t('learn.openInTelarHint')}</span>
          </p>
          <a
            href={href('/verificador', { ejemplo: lesson.telarExample })}
            className="btn btn-primary"
          >
            <PlayCircle size={17} /> {t('learn.openInTelar')}
          </a>
        </GlassCard>
      )}

      <section className="mt-10" aria-labelledby="quiz-title">
        <h2 id="quiz-title" className="font-display mb-4 text-2xl font-bold">
          {t('learn.quiz')}
        </h2>
        <div className="grid gap-4">
          {lesson.quiz.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={i}
              onChecked={(ok) => recordAnswer(q.id, ok)}
            />
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="remember-title">
        <GlassCard glow className="print-page p-5">
          <h2
            id="remember-title"
            className="font-display flex items-center gap-2 text-xl font-bold"
          >
            <BookmarkCheck size={20} className="text-accent" /> {t('learn.remember')}
          </h2>
          <ol className="mt-3 grid gap-2">
            {lesson.remember.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-accent font-mono font-bold">{i + 1}.</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
        <div ref={endRef} />
      </section>

      <nav className="no-print mt-10 flex flex-wrap justify-between gap-3">
        {prev ? (
          <a
            href={href(`/aprende/${topicId}/${prev.id}`)}
            className="btn btn-ghost max-w-full text-left whitespace-normal"
          >
            <ArrowLeft size={16} /> {prev.title}
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a
            href={href(`/aprende/${topicId}/${next.id}`)}
            className="btn btn-primary ml-auto max-w-full text-left whitespace-normal"
          >
            {next.title} <ArrowRight size={16} />
          </a>
        ) : (
          topic.exam && (
            <a href={href(`/aprende/${topicId}/simulacro`)} className="btn btn-primary">
              {t('learn.exam')} <ArrowRight size={16} />
            </a>
          )
        )}
      </nav>
    </article>
  );
}
