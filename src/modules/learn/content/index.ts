import type { Course, Lesson, Question, Topic } from './schema';

/**
 * Carga todo el contenido JSON en tiempo de compilación (Vite import.meta.glob).
 * Agregar un tema = agregar archivos; este cargador los descubre solo.
 */
const courseFiles = import.meta.glob<Course>('/src/content/*/course.json', {
  eager: true,
  import: 'default',
});
const topicFiles = import.meta.glob<Topic>('/src/content/*/*/topic.json', {
  eager: true,
  import: 'default',
});
const lessonFiles = import.meta.glob<Lesson>('/src/content/*/*/lessons/*.json', {
  eager: true,
  import: 'default',
});

export const COURSES: Course[] = Object.values(courseFiles);

export const TOPICS: Topic[] = Object.values(topicFiles);

const lessonsByTopic = new Map<string, Lesson[]>();
for (const [path, lesson] of Object.entries(lessonFiles)) {
  const topicId = path.split('/').at(-3)!;
  lessonsByTopic.set(topicId, [...(lessonsByTopic.get(topicId) ?? []), lesson]);
}

export function getTopic(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

/** Lecciones de un tema en el orden declarado en topic.json. */
export function getLessons(topicId: string): Lesson[] {
  const topic = getTopic(topicId);
  const all = lessonsByTopic.get(topicId) ?? [];
  if (!topic) return all;
  return topic.lessons.map((id) => all.find((l) => l.id === id)).filter((l): l is Lesson => !!l);
}

export function getLesson(topicId: string, lessonId: string): Lesson | undefined {
  return getLessons(topicId).find((l) => l.id === lessonId);
}

/** Todas las preguntas (lecciones + simulacros) indexadas por id. */
export interface QuestionRef {
  question: Question;
  topicId: string;
  source:
    { kind: 'lesson'; lessonId: string; lessonTitle: string } | { kind: 'exam'; examId: string };
}

export function allQuestions(): QuestionRef[] {
  const out: QuestionRef[] = [];
  for (const topic of TOPICS) {
    for (const lesson of getLessons(topic.id)) {
      for (const q of lesson.quiz) {
        out.push({
          question: q,
          topicId: topic.id,
          source: { kind: 'lesson', lessonId: lesson.id, lessonTitle: lesson.title },
        });
      }
    }
    for (const q of topic.exam?.questions ?? []) {
      out.push({
        question: q,
        topicId: topic.id,
        source: { kind: 'exam', examId: topic.exam!.id },
      });
    }
  }
  return out;
}
