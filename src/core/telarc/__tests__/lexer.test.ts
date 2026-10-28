import { describe, expect, it } from 'vitest';
import { TelarCError } from '../diagnostics';
import { tokenize } from '../lexer';

describe('lexer', () => {
  it('separa palabras clave, identificadores, números y puntuación', () => {
    const toks = tokenize('int x = 42;');
    expect(toks.map((t) => [t.kind, t.value])).toEqual([
      ['keyword', 'int'],
      ['ident', 'x'],
      ['punct', '='],
      ['number', '42'],
      ['punct', ';'],
      ['eof', ''],
    ]);
  });

  it('toma el operador más largo posible', () => {
    const toks = tokenize('a<=b == c && d++ :: e != f');
    expect(toks.filter((t) => t.kind === 'punct').map((t) => t.value)).toEqual([
      '<=',
      '==',
      '&&',
      '++',
      '::',
      '!=',
    ]);
  });

  it('registra línea y columna de cada token', () => {
    const toks = tokenize('int a;\n  bool b;');
    const b = toks.find((t) => t.value === 'b')!;
    expect(b.loc).toEqual({ line: 2, col: 8, endLine: 2, endCol: 9 });
  });

  it('ignora comentarios de línea, de bloque y #include', () => {
    const toks = tokenize('#include <mutex>\n// hola\n/* varias\nlíneas */ int x;');
    expect(toks.map((t) => t.value)).toEqual(['int', 'x', ';', '']);
    expect(toks[0]!.loc.line).toBe(4);
  });

  it('reporta caracteres inválidos con su posición', () => {
    try {
      tokenize('int x = 3;\nx = @;');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TelarCError);
      const d = (e as TelarCError).diagnostic;
      expect(d.loc.line).toBe(2);
      expect(d.loc.col).toBe(5);
      expect(d.message.es).toContain('Carácter inesperado');
      expect(d.message.en).toContain('Unexpected character');
    }
  });

  it('reporta comentarios sin cerrar y números mal formados', () => {
    expect(() => tokenize('/* nunca termina')).toThrow(/sin cerrar/);
    expect(() => tokenize('int x = 12abc;')).toThrow(/Número mal formado/);
  });
});
