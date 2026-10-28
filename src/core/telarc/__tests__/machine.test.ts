import { describe, expect, it } from 'vitest';
import { dependent } from '../machine';
import { machineFor } from './helpers';

describe('máquina de estados', () => {
  it('el estado inicial ejecuta las instrucciones locales iniciales', () => {
    const m = machineFor('int g; thread t { int a = 5; g = a; }');
    const s = m.initialState();
    expect(s.threads[0]!.locals).toEqual([5]);
    expect(m.instrAt(s, 0).op).toBe('store');
  });

  it('un lock tomado deshabilita al otro hilo', () => {
    const m = machineFor(
      'mutex x; thread a { x.lock(); x.unlock(); } thread b { x.lock(); x.unlock(); }',
    );
    let s = m.initialState();
    expect(m.enabledTransitions(s).map((t) => t.thread)).toEqual([0, 1]);
    s = m.step(s, { thread: 0, choice: 0 }).state;
    expect(s.owner[0]).toBe(0);
    expect(m.isEnabled(s, 1)).toBe(false);
    s = m.step(s, { thread: 0, choice: 0 }).state;
    expect(s.owner[0]).toBe(-1);
    expect(m.isEnabled(s, 1)).toBe(true);
    expect(s.threads[0]!.status).toBe('done');
  });

  it('notify_one con varios dormidos genera una rama por cada uno', () => {
    const m = machineFor(`
      mutex mx; condition_variable cv;
      thread w1 { mx.lock(); cv.wait(mx); mx.unlock(); }
      thread w2 { mx.lock(); cv.wait(mx); mx.unlock(); }
      thread n { cv.notify_one(); }`);
    let s = m.initialState();
    for (const t of [0, 0, 1, 1]) s = m.step(s, { thread: t, choice: 0 }).state;
    expect(s.cvWaiters[0]).toEqual([0, 1]);
    const trs = m.enabledTransitions(s);
    expect(trs).toEqual([
      { thread: 2, choice: 0 },
      { thread: 2, choice: 1 },
    ]);
    const r = m.step(s, { thread: 2, choice: 1 });
    expect(r.event).toEqual({ kind: 'notify', cv: 0, all: false, woken: [1] });
    expect(r.state.cvWaiters[0]).toEqual([0]);
    expect(r.state.threads[1]!.status).toBe('run');
  });

  it('notify_all despierta a todos', () => {
    const m = machineFor(`
      mutex mx; condition_variable cv;
      thread w1 { mx.lock(); cv.wait(mx); mx.unlock(); }
      thread n { cv.notify_all(); }`);
    let s = m.initialState();
    s = m.step(s, { thread: 0, choice: 0 }).state;
    s = m.step(s, { thread: 0, choice: 0 }).state;
    expect(s.threads[0]!.status).toBe('cv');
    s = m.step(s, { thread: 1, choice: 0 }).state;
    expect(s.threads[0]!.status).toBe('run');
  });

  it('future.get() se bloquea hasta set_value', () => {
    const m = machineFor(`
      promise<int> p; future<int> f = p.get_future(); int out;
      thread a { p.set_value(7); }
      thread b { out = f.get(); }`);
    let s = m.initialState();
    expect(m.isEnabled(s, 1)).toBe(false);
    s = m.step(s, { thread: 0, choice: 0 }).state;
    const r = m.step(s, { thread: 1, choice: 0 });
    expect(r.event).toEqual({ kind: 'get', p: 0, value: 7 });
    expect(m.step(r.state, { thread: 1, choice: 0 }).state.globals).toEqual([7]);
  });

  it('detecta errores en tiempo de ejecución', () => {
    const cases: [string, RegExp][] = [
      ['mutex x; thread a { x.unlock(); }', /sin tener x/],
      ['mutex x; condition_variable cv; thread a { cv.wait(x); }', /exige tener tomado/],
      ['promise<int> p; thread a { p.set_value(1); p.set_value(2); }', /dos veces/],
      ['int z = 0; thread a { int y = 1 / z; }', /División entre cero/],
      ['thread a { int i = 0; while (true) { i = i + 0; } }', /Bucle infinito/],
      ['int g = 0; thread a { assert(g == 1); }', /Falló assert\(g == 1\)/],
    ];
    for (const [src, re] of cases) {
      const m = machineFor(src);
      let s = m.initialState();
      for (let i = 0; i < 5 && !s.failure; i++) {
        const en = m.enabledTransitions(s);
        if (en.length === 0) break;
        s = m.step(s, en[0]!).state;
      }
      expect(s.failure?.message.es, src).toMatch(re);
    }
  });

  it('el hash identifica estados iguales y distingue distintos', () => {
    const m = machineFor('int a; int b; thread t1 { a = 1; } thread t2 { b = 1; }');
    const s0 = m.initialState();
    const x = m.step(m.step(s0, { thread: 0, choice: 0 }).state, { thread: 1, choice: 0 }).state;
    const y = m.step(m.step(s0, { thread: 1, choice: 0 }).state, { thread: 0, choice: 0 }).state;
    expect(m.hash(x)).toBe(m.hash(y));
    expect(m.hash(x)).not.toBe(m.hash(s0));
  });

  it('la relación de dependencia sigue la definición clásica', () => {
    expect(
      dependent({ reads: [0], writes: [], objects: [] }, { reads: [0], writes: [], objects: [] }),
    ).toBe(false);
    expect(
      dependent({ reads: [0], writes: [], objects: [] }, { reads: [], writes: [0], objects: [] }),
    ).toBe(true);
    expect(
      dependent({ reads: [], writes: [1], objects: [] }, { reads: [1], writes: [], objects: [] }),
    ).toBe(true);
    expect(
      dependent({ reads: [], writes: [], objects: [2] }, { reads: [], writes: [], objects: [2] }),
    ).toBe(true);
    expect(
      dependent({ reads: [], writes: [0], objects: [] }, { reads: [], writes: [1], objects: [] }),
    ).toBe(false);
  });
});
