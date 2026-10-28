import { describe, expect, it } from 'vitest';
import { TelarCError } from '../diagnostics';
import { parse } from '../parser';

function parseError(src: string) {
  try {
    parse(src);
  } catch (e) {
    if (e instanceof TelarCError) return e.diagnostic;
    throw e;
  }
  throw new Error('se esperaba un error de sintaxis');
}

describe('parser', () => {
  it('construye el AST de un programa completo', () => {
    const p = parse(`
      int counter = 0, other;
      bool done = false;
      std::mutex m, n;
      condition_variable cv;
      promise<int> p;
      future<int> f = p.get_future();
      thread t1 { counter++; }
      thread t2 { int x = f.get(); }
      assert(counter == 1);
    `);
    expect(p.globals.map((g) => `${g.kind}:${g.name.name}`)).toEqual([
      'var:counter',
      'var:other',
      'var:done',
      'mutex:m',
      'mutex:n',
      'cv:cv',
      'promise:p',
      'future:f',
    ]);
    expect(p.threads.map((t) => t.name.name)).toEqual(['t1', 't2']);
    expect(p.finalAsserts).toHaveLength(1);
    expect(p.items.map((i) => i.kind)).toContain('finalAssert');
  });

  it('respeta la precedencia de operadores como C++', () => {
    const p = parse('int x = 1 + 2 * 3 == 7 && !false || false; thread t { }');
    const g = p.globals[0]!;
    if (g.kind !== 'var' || !g.init || g.init.kind !== 'binary') throw new Error();
    expect(g.init.op).toBe('||');
    if (g.init.left.kind !== 'binary') throw new Error();
    expect(g.init.left.op).toBe('&&');
  });

  it('entiende ++, --, += y -= como asignaciones', () => {
    const p = parse('int x; thread t { x++; ++x; x--; x += 2; x -= 1; }');
    const ops = p.threads[0]!.body.body.map((s) =>
      s.kind === 'assign' ? `${s.op}${s.sugar ?? ''}` : '?',
    );
    expect(ops).toEqual(['+=++', '+=++', '-=--', '+=', '-=']);
  });

  it('parsea if/else, while, assert y guards', () => {
    const p = parse(`
      mutex a, b; int x;
      thread t {
        if (x > 0) { x = 1; } else x = 2;
        while (x < 3) x++;
        assert(x == 3);
        std::lock_guard<std::mutex> g(a);
        unique_lock<mutex> lk(a);
        scoped_lock both(a, b);
      }`);
    const kinds = p.threads[0]!.body.body.map((s) => s.kind);
    expect(kinds).toEqual(['if', 'while', 'assert', 'guard', 'guard', 'guard']);
  });

  it('acepta métodos: lock, unlock, wait, notify, set_value', () => {
    const p = parse(`
      mutex m; condition_variable cv; promise<int> p;
      thread t { m.lock(); cv.wait(m); cv.notify_one(); cv.notify_all(); p.set_value(3); m.unlock(); }`);
    const calls = p.threads[0]!.body.body.map((s) => (s.kind === 'call' ? s.method.name : ''));
    expect(calls).toEqual(['lock', 'wait', 'notify_one', 'notify_all', 'set_value', 'unlock']);
  });

  it('marca el ";" faltante al final del token anterior', () => {
    const d = parseError('int x = 0;\nthread t {\n  x = 1\n}');
    expect(d.message.es).toBe('Falta ";" al final de la sentencia');
    expect(d.loc.line).toBe(3);
    expect(d.loc.col).toBe(8);
  });

  it('reporta llaves sin cerrar indicando dónde se abrió el bloque', () => {
    const d = parseError('thread t {\n  int x = 1;\n');
    expect(d.message.es).toContain('línea 1');
  });

  it('exige al menos un hilo', () => {
    expect(parseError('int x = 1;').message.es).toContain('ningún hilo');
  });

  it('da errores claros en español con línea y columna', () => {
    const cases: [string, RegExp][] = [
      ['thread t { x }', /Después de "x"/],
      ['thread t { 3; }', /Sentencia inesperada/],
      ['thread t { mutex m; }', /global/],
      ['float y; thread t {}', /Declaración global inesperada/],
      ['promise<float> p; thread t {}', /<int> o <bool>/],
      ['promise<int> p; future<int> f; thread t {}', /get_future/],
      ['promise<int> p; future<int> f = p.get(); thread t {}', /get_future\(\)/],
      ['mutex a, b; thread t { lock_guard<mutex> g(a, b); }', /scoped_lock/],
      ['mutex a; thread t { scoped_lock g(); }', /al menos un mutex/],
      ['thread t { int x = (1 + 2; }', /Falta "\)"/],
      ['thread t { int x = ; }', /Se esperaba una expresión/],
      ['thread { }', /nombre del hilo/],
    ];
    for (const [src, re] of cases) {
      const d = parseError(src);
      expect(d.message.es, src).toMatch(re);
      expect(d.message.en.length).toBeGreaterThan(5);
      expect(d.loc.line).toBeGreaterThanOrEqual(1);
      expect(d.loc.col).toBeGreaterThanOrEqual(1);
    }
  });
});
