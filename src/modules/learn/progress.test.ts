import { beforeEach, describe, expect, it } from 'vitest';
import { gradeOver20, useProgress } from './progress';

describe('progreso de estudio', () => {
  beforeEach(() => useProgress.getState().reset());

  it('calcula la nota sobre 20', () => {
    expect(gradeOver20(15, 15)).toBe(20);
    expect(gradeOver20(8, 15)).toBe(11);
    expect(gradeOver20(0, 15)).toBe(0);
  });

  it('registra lecciones vistas, respuestas y mejor nota', () => {
    const p = useProgress.getState();
    p.markViewed('concurrencia', 'hilos');
    p.recordAnswer('q1', false);
    p.recordAnswer('q1', true);
    p.recordExam('sim', 12);
    p.recordExam('sim', 9);
    const s = useProgress.getState();
    expect(s.viewed['concurrencia/hilos']).toBeGreaterThan(0);
    expect(s.answers.q1).toMatchObject({ correct: true, attempts: 2 });
    expect(s.exams.sim).toEqual({ best: 12, last: 9, attempts: 2 });
  });
});
