import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findExample } from '@/core/telarc/examples';
import { verify } from '@/core/telarc/verify';
import type { Course, Lesson, Question, Topic } from './schema';

const ROOT = join(__dirname, '../../../content');
const read = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;

function checkQuestion(q: Question) {
  expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
  expect(
    q.options.filter((o) => o.correct),
    `${q.id}: exactamente una correcta`,
  ).toHaveLength(1);
  for (const o of q.options) expect(o.why.length, `${q.id}: falta explicación`).toBeGreaterThan(15);
  expect(['predict', 'bug', 'complete', 'concept']).toContain(q.type);
}

describe('contenido del curso', () => {
  for (const courseId of readdirSync(ROOT)) {
    const course = read<Course>(join(ROOT, courseId, 'course.json'));
    const available = course.topics.filter((t) => t.status === 'available');

    for (const ref of available) {
      describe(`${courseId}/${ref.id}`, () => {
        const dir = join(ROOT, courseId, ref.id);
        const topic = read<Topic>(join(dir, 'topic.json'));
        const lessons = readdirSync(join(dir, 'lessons')).map((f) =>
          read<Lesson>(join(dir, 'lessons', f)),
        );

        it('cada lección declarada existe', () => {
          expect(topic.lessons.sort()).toEqual(lessons.map((l) => l.id).sort());
        });

        it.each(lessons.map((l) => [l.id, l] as const))('lección %s cumple el formato', (_, l) => {
          expect(l.quiz, 'debe tener 5 preguntas').toHaveLength(5);
          expect(l.remember, 'debe tener un resumen de 5 líneas').toHaveLength(5);
          expect(l.sections.some((s) => s.type === 'code')).toBe(true);
          expect(l.sections.some((s) => s.type === 'analogy')).toBe(true);
          l.quiz.forEach(checkQuestion);
          if (l.telarExample) expect(findExample(l.telarExample), l.telarExample).toBeDefined();
        });

        it('el simulacro tiene 15 preguntas válidas', () => {
          expect(topic.exam?.questions).toHaveLength(15);
          topic.exam!.questions.forEach(checkQuestion);
        });

        it('los ids de preguntas son únicos', () => {
          const ids = [...lessons.flatMap((l) => l.quiz), ...(topic.exam?.questions ?? [])].map(
            (q) => q.id,
          );
          expect(new Set(ids).size).toBe(ids.length);
        });
      });
    }
  }

  it('la pregunta del simulacro sobre TelarC coincide con lo que Telar reporta', () => {
    const r = verify(`int total = 0;
mutex m;
thread t1 { lock_guard<mutex> g(m); total++; }
thread t2 { lock_guard<mutex> g(m); total++; }
assert(total == 2);`);
    expect(r.status === 'done' && r.findings).toEqual([]);
  });
});
