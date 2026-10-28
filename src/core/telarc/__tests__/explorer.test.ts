import { describe, expect, it } from 'vitest';
import { EXAMPLES, findExample, isChallengeSolved } from '../examples';
import { explore, mustLocksets } from '../explorer';
import { replay } from '../trace';
import { check, verify } from '../verify';
import { kinds, machineFor, verifyOk } from './helpers';

describe('explorador: DEBE encontrar errores', () => {
  it('race condition en un contador sin protección', () => {
    const r = verifyOk(findExample('contador-race')!.source);
    const race = r.findings.find((f) => f.kind === 'race')!;
    expect(race.title.es).toContain('counter');
    expect(race.locs).toHaveLength(2);
    // La traza mínima: t1 lee, t1 escribe, t2 lee → 3 pasos.
    expect(race.trace.steps.length).toBeLessThanOrEqual(3);
    expect(race.trace.steps[race.errorStep]!.races.length).toBeGreaterThan(0);
  });

  it('deadlock clásico con traza mínima de 2 pasos y ciclo en el grafo de espera', () => {
    const r = verifyOk(findExample('deadlock-clasico')!.source);
    const d = r.findings.find((f) => f.kind === 'deadlock')!;
    expect(d.trace.steps).toHaveLength(2);
    expect(d.trace.end.kind).toBe('deadlock');
    if (d.trace.end.kind === 'deadlock') expect(d.trace.end.waitGraph.cycle).toHaveLength(2);
    expect(d.detail.es).toContain('Ciclo');
  });

  it('auto-deadlock: tomar dos veces el mismo mutex', () => {
    const r = verifyOk('mutex m; thread t { m.lock(); m.lock(); }');
    const d = r.findings.find((f) => f.kind === 'deadlock')!;
    expect(d.trace.end.kind === 'deadlock' && d.trace.end.waitGraph.cycle).toEqual([0]);
  });

  it('assert dentro de un hilo que falla en alguna intercalación', () => {
    const r = verifyOk(`
      int x = 0;
      thread a { x = 1; }
      thread b { int v = x; assert(v == 0); }`);
    expect(kinds(r)).toEqual(['assert', 'race']);
    const a = r.findings.find((f) => f.kind === 'assert')!;
    expect(a.trace.end.kind).toBe('failure');
    expect(a.detail.es).toContain('assert(v == 0)');
  });

  it('future que nunca recibe valor = bloqueo permanente', () => {
    const r = verifyOk(
      'promise<int> p; future<int> f = p.get_future(); thread t { int v = f.get(); }',
    );
    expect(r.findings[0]!.detail.es).toContain('nunca llega');
  });

  it('resultados finales distintos', () => {
    const r = verifyOk('int x = 0; thread a { x = 1; } thread b { x = 2; }');
    const nd = r.findings.find((f) => f.kind === 'nondeterminism')!;
    expect(nd.severity).toBe('warning');
    expect(nd.outcomes!.map((o) => o.globals[0]).sort()).toEqual([1, 2]);
  });
});

describe('explorador: NO debe reportar errores', () => {
  it.each([
    ['contador-mutex'],
    ['lock-guard'],
    ['orden-de-bloqueo'],
    ['scoped-lock'],
    ['productor-consumidor'],
    ['promise-future'],
    ['independientes'],
  ])('%s', (id) => {
    const r = verifyOk(findExample(id)!.source);
    expect(r.findings).toEqual([]);
    expect(r.stats.complete).toBe(true);
    expect(r.sampleTrace.end.kind).toBe('finished');
  });

  it('lecturas concurrentes de la misma variable no son race', () => {
    expect(
      verifyOk('int x = 3; int a; int b; thread t1 { a = x; } thread t2 { b = x; }').findings,
    ).toEqual([]);
  });
});

describe('reducción de orden parcial (POR)', () => {
  it('encuentra exactamente los mismos tipos de error y resultados finales que sin POR', () => {
    for (const ex of EXAMPLES) {
      const withPor = verifyOk(ex.source, { por: true });
      const without = verifyOk(ex.source, { por: false });
      expect(kinds(withPor), ex.id).toEqual(kinds(without));
      const outcomes = (r: typeof withPor) => r.outcomes.map((o) => o.globals.join(',')).sort();
      expect(outcomes(withPor), ex.id).toEqual(outcomes(without));
    }
  });

  it('nunca explora más estados que sin POR', () => {
    for (const ex of EXAMPLES) {
      const r = verifyOk(ex.source);
      expect(r.stats.states, ex.id).toBeLessThanOrEqual(r.stats.baseline!.states);
    }
  });

  it('ahorra muchísimos estados con hilos independientes', () => {
    const r = verifyOk(findExample('independientes')!.source);
    expect(r.stats.baseline!.states / r.stats.states).toBeGreaterThan(20);
  });

  it('must-lockset: sabe qué mutex están tomados en cada instrucción', () => {
    const m = machineFor(
      'mutex a, b; int x; thread t { a.lock(); x = 1; if (x > 0) { b.lock(); b.unlock(); } x = 2; a.unlock(); x = 3; }',
    );
    const code = m.program.threads[0]!.code;
    const ls = mustLocksets(code, 2);
    const stores = code.flatMap((ins, pc) => (ins.op === 'store' ? [[...ls[pc]!]] : []));
    expect(stores).toEqual([[0], [0], []]);
  });
});

describe('límites y opciones', () => {
  it('respeta el límite de estados y marca la exploración como incompleta', () => {
    const r = verifyOk(findExample('independientes')!.source, { maxStates: 100, por: false });
    expect(r.stats.complete).toBe(false);
    expect(r.stats.states).toBeLessThanOrEqual(100);
  });

  it('respeta el límite de profundidad', () => {
    const r = verifyOk('int x; thread t { while (true) { x++; } }', {
      maxDepth: 10,
      maxStates: 1000,
    });
    expect(r.stats.depthLimitHit || !r.stats.complete).toBe(true);
  });

  it('informa progreso', () => {
    const phases = new Set<string>();
    verify(findExample('independientes')!.source, { onProgress: (p) => phases.add(p.phase) });
    expect(phases).toEqual(new Set(['por', 'baseline']));
  });

  it('los bucles de espera activa terminan gracias a la detección de estados repetidos', () => {
    const r = verifyOk(`
      bool listo = false; mutex m;
      thread a { bool ok = false; while (!ok) { m.lock(); ok = listo; m.unlock(); } }
      thread b { m.lock(); listo = true; m.unlock(); }`);
    expect(r.stats.complete).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.stats.revisits).toBeGreaterThan(0);
  });

  it('devuelve el árbol de estados recortado', () => {
    const r = verifyOk(findExample('independientes')!.source, { por: false, maxTreeNodes: 50 });
    expect(r.tree.nodes).toHaveLength(50);
    expect(r.tree.truncated).toBe(true);
    expect(r.tree.nodes[0]!.parent).toBe(-1);
    for (const n of r.tree.nodes.slice(1)) expect(n.parent).toBeLessThan(n.id);
  });

  it('el explorador sin grafo solo cuenta', () => {
    const res = explore(machineFor('int x; thread a { x = 1; } thread b { x = 2; }'), {
      maxStates: 100,
      maxDepth: 100,
      por: false,
      recordGraph: false,
    });
    expect(res.graph).toBeNull();
    expect(res.states).toBeGreaterThan(1);
  });
});

describe('API del verificador', () => {
  it('devuelve el error de compilación con posición', () => {
    const r = verify('thread t { x = 1; }');
    expect(r.status).toBe('compileError');
    expect(check('thread t { x = 1; }')?.loc.line).toBe(1);
    expect(check('int x; thread t { x = 1; }')).toBeNull();
  });

  it('reproduce trazas y rechaza trazas imposibles', () => {
    const m = machineFor('mutex a; thread t1 { a.lock(); } thread t2 { a.lock(); }');
    const tr = replay(m, [{ thread: 0, choice: 0 }]);
    expect(tr.steps[0]!.after.owner).toEqual([0]);
    expect(tr.steps[0]!.after.threads.map((t) => t.view)).toEqual(['done', 'blocked']);
    expect(() =>
      replay(m, [
        { thread: 0, choice: 0 },
        { thread: 1, choice: 0 },
      ]),
    ).toThrow(/Traza inválida/);
  });

  it('reconoce cuando el reto está resuelto', () => {
    const ex = findExample('reto-cuentas')!;
    const fixed = ex.source
      .replace('mb.lock();\n  ma.lock();', 'ma.lock();\n  mb.lock();')
      .replace(
        '  mb.unlock();\n  ma.unlock();\n  operaciones++;',
        '  operaciones++;\n  mb.unlock();\n  ma.unlock();',
      )
      .replace(
        '  ma.unlock();\n  mb.unlock();\n  operaciones++;',
        '  operaciones++;\n  mb.unlock();\n  ma.unlock();',
      )
      .replace('ma.unlock();\n  operaciones++;', 'operaciones++;\n  ma.unlock();');
    const r = verifyOk(fixed);
    expect(r.findings).toEqual([]);
    expect(isChallengeSolved(ex, fixed, 0)).toBe(true);
    expect(isChallengeSolved(ex, fixed.replace('assert(operaciones == 2);', ''), 0)).toBe(false);
    expect(isChallengeSolved(ex, ex.source, 3)).toBe(false);
  });
});
