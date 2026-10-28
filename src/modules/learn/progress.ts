import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Progreso de estudio guardado en localStorage (solo en este navegador). */
interface ProgressState {
  /** "tema/lección" → fecha en que se vio. */
  viewed: Record<string, number>;
  /** id de pregunta → resultado del último intento. */
  answers: Record<string, { correct: boolean; attempts: number; at: number }>;
  /** id de simulacro → notas sobre 20. */
  exams: Record<string, { best: number; last: number; attempts: number }>;
  markViewed: (topicId: string, lessonId: string) => void;
  recordAnswer: (questionId: string, correct: boolean) => void;
  recordExam: (examId: string, score: number) => void;
  reset: () => void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      viewed: {},
      answers: {},
      exams: {},
      markViewed: (topicId, lessonId) =>
        set((s) => {
          const key = `${topicId}/${lessonId}`;
          return s.viewed[key] ? s : { viewed: { ...s.viewed, [key]: Date.now() } };
        }),
      recordAnswer: (id, correct) =>
        set((s) => ({
          answers: {
            ...s.answers,
            [id]: { correct, attempts: (s.answers[id]?.attempts ?? 0) + 1, at: Date.now() },
          },
        })),
      recordExam: (id, score) =>
        set((s) => {
          const prev = s.exams[id];
          return {
            exams: {
              ...s.exams,
              [id]: {
                best: Math.max(prev?.best ?? 0, score),
                last: score,
                attempts: (prev?.attempts ?? 0) + 1,
              },
            },
          };
        }),
      reset: () => set({ viewed: {}, answers: {}, exams: {} }),
    }),
    { name: 'telar:progress', version: 1 },
  ),
);

export const isViewed = (viewed: Record<string, number>, topicId: string, lessonId: string) =>
  !!viewed[`${topicId}/${lessonId}`];

/** Nota vigesimal (0–20), como en las universidades peruanas. Se aprueba con 11. */
export const gradeOver20 = (correct: number, total: number) =>
  Math.round((correct * 20) / Math.max(1, total));
export const PASSING = 11;
