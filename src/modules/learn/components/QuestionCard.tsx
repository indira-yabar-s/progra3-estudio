import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Markdown } from '@/components/ui/Markdown';
import { useT, type MessageKey } from '@/i18n';
import type { Question, QuestionType } from '../content/schema';

const TYPE_KEY: Record<QuestionType, MessageKey> = {
  predict: 'learn.qtype.predict',
  bug: 'learn.qtype.bug',
  complete: 'learn.qtype.complete',
  concept: 'learn.qtype.concept',
};

const LETTERS = 'ABCDEFGH';

/**
 * Pregunta de opción múltiple. En modo práctica se comprueba al instante y se
 * explica cada opción; en modo examen solo registra la elección.
 */
export function QuestionCard({
  question,
  index,
  mode = 'practice',
  selected: controlled,
  onSelect,
  reveal: forceReveal,
  onChecked,
}: {
  question: Question;
  index?: number;
  mode?: 'practice' | 'exam';
  selected?: number | null;
  onSelect?: (i: number) => void;
  reveal?: boolean;
  onChecked?: (correct: boolean) => void;
}) {
  const { t } = useT();
  const name = useId();
  const [local, setLocal] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const selected = controlled !== undefined ? controlled : local;
  const reveal = forceReveal ?? checked;
  const correctIdx = question.options.findIndex((o) => o.correct);
  const isCorrect = selected === correctIdx;

  const choose = (i: number) => {
    if (reveal && mode === 'practice') return;
    setLocal(i);
    onSelect?.(i);
  };

  return (
    <article
      className="glass print-page min-w-0 p-4 sm:p-5"
      data-testid={`question-${question.id}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {index !== undefined && <span className="chip text-accent font-mono">#{index + 1}</span>}
        <span className="chip">{t(TYPE_KEY[question.type])}</span>
      </div>
      <Markdown text={question.prompt} className="font-medium" />
      {question.code && <CodeBlock code={question.code} />}

      <fieldset className="mt-3 grid min-w-0 gap-2">
        <legend className="sr-only">{question.prompt}</legend>
        {question.options.map((o, i) => {
          const isSel = selected === i;
          const state = reveal
            ? o.correct
              ? 'ok'
              : isSel
                ? 'bad'
                : 'idle'
            : isSel
              ? 'sel'
              : 'idle';
          const tone =
            state === 'ok'
              ? 'var(--ok)'
              : state === 'bad'
                ? 'var(--err)'
                : state === 'sel'
                  ? 'var(--accent)'
                  : undefined;
          return (
            <label
              key={i}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                tone ? '' : 'border-line hover:bg-accent/5'
              }`}
              style={
                tone
                  ? {
                      borderColor: tone,
                      background: `color-mix(in srgb, ${tone} 10%, transparent)`,
                    }
                  : undefined
              }
            >
              <input
                type="radio"
                name={name}
                checked={isSel}
                onChange={() => choose(i)}
                className="sr-only"
                disabled={reveal && mode === 'practice'}
              />
              <span
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border font-mono text-xs font-bold"
                style={{ borderColor: tone ?? 'var(--glass-border)', color: tone }}
                aria-hidden="true"
              >
                {LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1">
                <Markdown text={o.text} className="text-[15px] [&_p]:my-0" />
                {reveal && (
                  <span className="text-muted mt-1 block text-sm leading-relaxed">
                    {o.correct ? '✓ ' : '✗ '}
                    {o.why}
                  </span>
                )}
              </span>
              {reveal && o.correct && (
                <CheckCircle2 size={18} className="text-ok mt-0.5 shrink-0" aria-hidden="true" />
              )}
              {reveal && isSel && !o.correct && (
                <XCircle size={18} className="text-err mt-0.5 shrink-0" aria-hidden="true" />
              )}
            </label>
          );
        })}
      </fieldset>

      {mode === 'practice' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {!checked ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={selected === null}
              onClick={() => {
                setChecked(true);
                onChecked?.(isCorrect);
              }}
            >
              {t('learn.check')}
            </button>
          ) : (
            <>
              <p
                role="status"
                className={`flex items-center gap-1.5 font-bold ${isCorrect ? 'text-ok' : 'text-err'}`}
              >
                {isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {isCorrect ? t('learn.correct') : t('learn.incorrect')}
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setChecked(false);
                  setLocal(null);
                }}
              >
                <RotateCcw size={15} /> {t('learn.tryAgain')}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
