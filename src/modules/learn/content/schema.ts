/**
 * Formato genérico del contenido del curso. Cada tema nuevo (Big O, grafos,
 * patrones...) se agrega como archivos JSON con esta misma forma en
 * src/content/<curso>/<tema>/, sin tocar el código de la interfaz.
 */

export type QuestionType = 'predict' | 'bug' | 'complete' | 'concept';

export interface QuestionOption {
  text: string;
  correct: boolean;
  /** Por qué esta opción es correcta o incorrecta. */
  why: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  /** Enunciado en markdown sencillo. */
  prompt: string;
  code?: string;
  options: QuestionOption[];
}

export type Section =
  | { type: 'text'; md: string }
  | { type: 'analogy'; emoji: string; title: string; md: string }
  | { type: 'code'; title: string; code: string; explain?: string }
  | { type: 'callout'; variant: 'tip' | 'warning' | 'exam'; md: string };

export interface Lesson {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  minutes: number;
  /** Id del ejemplo equivalente en el verificador ("Abrir en Telar"). */
  telarExample?: string;
  sections: Section[];
  quiz: Question[];
  /** Resumen de 5 líneas para el examen. */
  remember: string[];
}

export interface Exam {
  id: string;
  title: string;
  questions: Question[];
}

export interface Topic {
  id: string;
  course: string;
  title: string;
  description: string;
  /** Ids de lecciones, en orden. */
  lessons: string[];
  exam?: Exam;
  review?: {
    cheatsheet: { tool: string; use: string; careful: string }[];
    pitfalls: string[];
  };
}

export interface CourseTopicRef {
  id: string;
  title: string;
  description: string;
  status: 'available' | 'soon';
  icon: string;
}

export interface Course {
  id: string;
  title: string;
  institution: string;
  topics: CourseTopicRef[];
}
