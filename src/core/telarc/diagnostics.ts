/** Posición en el código fuente (1-indexada, como la muestra Monaco). */
export interface SourceLoc {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

/** Texto bilingüe. El núcleo produce mensajes en español e inglés; la UI elige. */
export interface Bilingual {
  es: string;
  en: string;
}

export interface Diagnostic {
  message: Bilingual;
  loc: SourceLoc;
}

/** Error de compilación (léxico, sintáctico o semántico) con posición exacta. */
export class TelarCError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(message: Bilingual, loc: SourceLoc) {
    super(`${message.es} (línea ${loc.line}, columna ${loc.col})`);
    this.name = 'TelarCError';
    this.diagnostic = { message, loc };
  }
}

export function locSpan(start: SourceLoc, end: SourceLoc): SourceLoc {
  return { line: start.line, col: start.col, endLine: end.endLine, endCol: end.endCol };
}

export const NO_LOC: SourceLoc = { line: 1, col: 1, endLine: 1, endCol: 1 };
