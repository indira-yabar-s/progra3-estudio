import type { SourceLoc } from './diagnostics';

export type TokenKind = 'ident' | 'number' | 'keyword' | 'punct' | 'eof';

export interface Token {
  kind: TokenKind;
  value: string;
  loc: SourceLoc;
}

export const KEYWORDS = new Set([
  'int',
  'bool',
  'true',
  'false',
  'if',
  'else',
  'while',
  'thread',
  'assert',
  'mutex',
  'condition_variable',
  'condition_variable_any',
  'lock_guard',
  'unique_lock',
  'scoped_lock',
  'promise',
  'future',
  'std',
]);

/** Ordenados de mayor a menor longitud para que el lexer tome el más largo. */
export const PUNCTUATORS = [
  '::',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
  ';',
  ',',
  '.',
  '=',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
] as const;
