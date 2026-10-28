import { TelarCError } from './diagnostics';
import { KEYWORDS, PUNCTUATORS, type Token } from './tokens';

/**
 * Convierte el texto fuente en una lista de tokens.
 * Lleva la cuenta de línea y columna para poder reportar errores exactos.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance(1);
      continue;
    }

    // Comentario de línea
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') advance(1);
      continue;
    }

    // Comentario de bloque
    if (ch === '/' && source[i + 1] === '*') {
      const startLine = line;
      const startCol = col;
      advance(2);
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) advance(1);
      if (i >= source.length) {
        throw new TelarCError(
          {
            es: 'Comentario /* sin cerrar: falta */',
            en: 'Unterminated /* comment: missing */',
          },
          { line: startLine, col: startCol, endLine: startLine, endCol: startCol + 2 },
        );
      }
      advance(2);
      continue;
    }

    // Directivas #include se ignoran para que el código parezca C++ real.
    if (ch === '#') {
      while (i < source.length && source[i] !== '\n') advance(1);
      continue;
    }

    const startLine = line;
    const startCol = col;

    if (isDigit(ch)) {
      let j = i;
      while (j < source.length && isDigit(source[j]!)) j++;
      if (j < source.length && isIdentStart(source[j]!)) {
        throw new TelarCError(
          {
            es: `Número mal formado: "${source.slice(i, j + 1)}"`,
            en: `Malformed number: "${source.slice(i, j + 1)}"`,
          },
          { line, col, endLine: line, endCol: col + (j - i) + 1 },
        );
      }
      const value = source.slice(i, j);
      advance(j - i);
      tokens.push({
        kind: 'number',
        value,
        loc: { line: startLine, col: startCol, endLine: line, endCol: col },
      });
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i;
      while (j < source.length && isIdentPart(source[j]!)) j++;
      const value = source.slice(i, j);
      advance(j - i);
      tokens.push({
        kind: KEYWORDS.has(value) ? 'keyword' : 'ident',
        value,
        loc: { line: startLine, col: startCol, endLine: line, endCol: col },
      });
      continue;
    }

    const punct = PUNCTUATORS.find((p) => source.startsWith(p, i));
    if (punct) {
      advance(punct.length);
      tokens.push({
        kind: 'punct',
        value: punct,
        loc: { line: startLine, col: startCol, endLine: line, endCol: col },
      });
      continue;
    }

    throw new TelarCError(
      { es: `Carácter inesperado: "${ch}"`, en: `Unexpected character: "${ch}"` },
      { line, col, endLine: line, endCol: col + 1 },
    );
  }

  tokens.push({ kind: 'eof', value: '', loc: { line, col, endLine: line, endCol: col } });
  return tokens;
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isIdentStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}
