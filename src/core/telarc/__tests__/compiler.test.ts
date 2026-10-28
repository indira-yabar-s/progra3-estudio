import { describe, expect, it } from 'vitest';
import { compile, evalExpr, sliceSource, EvalError } from '../compiler';
import { TelarCError } from '../diagnostics';
import { parse } from '../parser';

const build = (src: string) => compile(parse(src), src);

function compileError(src: string) {
  try {
    build(src);
  } catch (e) {
    if (e instanceof TelarCError) return e.diagnostic;
    throw e;
  }
  throw new Error('se esperaba un error semántico');
}

describe('compilador', () => {
  it('convierte counter++ en dos pasos atómicos: LOAD y STORE', () => {
    const p = build('int counter = 0; thread t { counter++; }');
    expect(p.threads[0]!.code.map((i) => i.op)).toEqual(['load', 'store', 'end']);
  });

  it('las variables locales no generan pasos visibles', () => {
    const p = build('thread t { int a = 1; int b = a + 2; }');
    expect(p.threads[0]!.code.map((i) => i.op)).toEqual(['setLocal', 'setLocal', 'end']);
  });

  it('emite un LOAD por cada lectura de global, en orden', () => {
    const p = build('int x; int y; thread t { int s = x + y + x; }');
    const loads = p.threads[0]!.code.filter((i) => i.op === 'load');
    expect(loads.map((l) => (l.op === 'load' ? l.g : -1))).toEqual([0, 1, 0]);
  });

  it('suelta los guards al final del bloque, en orden inverso', () => {
    const p = build(
      'mutex a, b; thread t { { lock_guard<mutex> g1(a); lock_guard<mutex> g2(b); } }',
    );
    const code = p.threads[0]!.code;
    expect(code.map((i) => i.op)).toEqual(['lock', 'lock', 'release', 'release', 'end']);
    const rel = code
      .filter((i) => i.op === 'release')
      .map((i) => (i.op === 'release' ? i.ms[0] : -1));
    expect(rel).toEqual([1, 0]);
  });

  it('wait = soltar y dormir + volver a tomar el mutex', () => {
    const p = build(
      'mutex m; condition_variable cv; thread t { unique_lock<mutex> lk(m); cv.wait(lk); }',
    );
    const ops = p.threads[0]!.code.map((i) => i.op);
    expect(ops).toEqual(['lock', 'wait', 'lock', 'release', 'end']);
  });

  it('evalúa inicializadores globales constantes y asserts finales', () => {
    const p = build('int a = 2 * 3; int b = a + 1; bool c = b > a; thread t {} assert(b == 7);');
    expect(p.globals.map((g) => g.init)).toEqual([6, 7, true]);
    expect(p.finalAsserts[0]!.text).toBe('b == 7');
  });

  it('enlaza el future con su promise', () => {
    const p = build(
      'promise<bool> p; future<bool> f = p.get_future(); thread t { bool v = f.get(); }',
    );
    expect(p.promises[0]!.future).toBe('f');
    expect(p.threads[0]!.code.map((i) => i.op)).toEqual(['get', 'setLocal', 'end']);
  });

  it('detecta errores semánticos con mensajes en español', () => {
    const cases: [string, RegExp][] = [
      ['thread t { y = 1; }', /"y" no está declarada/],
      ['int x; int x; thread t {}', /ya fue declarado/],
      ['int x; thread t { x = true; }', /No se puede guardar un bool/],
      ['int x; thread t { if (x) { } }', /La condición debe ser bool/],
      ['bool b; thread t { b++; }', /solo funciona con int/],
      [
        'mutex m; condition_variable cv; thread t { lock_guard<mutex> g(m); cv.wait(g); }',
        /Usa unique_lock/,
      ],
      ['int m; thread t { m.lock(); }', /no tiene métodos/],
      ['mutex m; thread t { m.wait(); }', /lock\(\) o unlock\(\)/],
      ['condition_variable cv; thread t { cv.wait(); }', /exactamente un argumento/],
      ['condition_variable cv; thread t { cv.signal(); }', /notify_one/],
      ['promise<int> p; thread t { p.set_value(true); }', /Se esperaba un valor int/],
      [
        'promise<int> p; future<int> f = p.get_future(); thread t { f.get(); }',
        /guárdalo en una variable/,
      ],
      [
        'promise<int> p; future<int> f = p.get_future(); thread t { int x = f.get() + 1; }',
        /valor completo/,
      ],
      ['promise<int> p; future<bool> f = p.get_future(); thread t {}', /future es <bool>/],
      ['int x; thread t {} thread t {}', /Ya existe algo llamado "t"/],
      ['mutex a; thread t { scoped_lock lk(a, a); }', /mismo mutex dos veces/],
      ['thread t { int a = 1; int a = 2; }', /ya fue declarada en este bloque/],
      ['int x; thread t { x.lock(); }', /no tiene métodos/],
      ['mutex m; thread t { lock_guard<mutex> g(m); g.unlock(); }', /no tiene métodos/],
      ['mutex m; thread t { int y = m + 1; }', /no es una variable/],
      ['int x; thread t { bool b = !x; }', /Se esperaba un valor bool/],
      ['int x; bool b; thread t { bool c = x == b; }', /No se puede comparar/],
    ];
    for (const [src, re] of cases) {
      const d = compileError(src);
      expect(d.message.es, src).toMatch(re);
      expect(d.message.en.length, src).toBeGreaterThan(5);
    }
  });

  it('evalExpr hace aritmética entera de 32 bits y detecta división entre cero', () => {
    const env = { globals: [], locals: [], regs: [] };
    const bin = (op: '/' | '%' | '*', l: number, r: number) =>
      evalExpr({ k: 'bin', op, l: { k: 'const', v: l }, r: { k: 'const', v: r } }, env);
    expect(bin('/', 7, 2)).toBe(3);
    expect(bin('/', -7, 2)).toBe(-3);
    expect(bin('%', 7, 3)).toBe(1);
    expect(bin('*', 65536, 65536)).toBe(0);
    expect(() => bin('/', 1, 0)).toThrow(EvalError);
    expect(() => bin('%', 1, 0)).toThrow(EvalError);
  });

  it('sliceSource extrae texto de una o varias líneas', () => {
    const src = 'abc\ndef\nghi';
    expect(sliceSource(src, { line: 1, col: 2, endLine: 1, endCol: 4 })).toBe('bc');
    expect(sliceSource(src, { line: 1, col: 2, endLine: 3, endCol: 2 })).toBe('bc def g');
  });
});
