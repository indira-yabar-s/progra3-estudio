import { describe, expect, it } from 'vitest';
import { HBState, happensBefore, joinInto } from '../happensBefore';
import { findCycle } from '../waitGraph';

const loc = { line: 1, col: 1, endLine: 1, endCol: 2 };

describe('relojes vectoriales y happens-before', () => {
  it('join toma el máximo componente a componente', () => {
    const a = [1, 4, 0];
    joinInto(a, [3, 2, 5]);
    expect(a).toEqual([3, 4, 5]);
  });

  it('dos escrituras sin sincronización son una race', () => {
    const hb = new HBState(2, 1, 0, 0);
    expect(hb.apply(0, { kind: 'write', g: 0, value: 1, old: 0 }, loc, 0).races).toHaveLength(0);
    const { races } = hb.apply(1, { kind: 'write', g: 0, value: 2, old: 1 }, loc, 1);
    expect(races).toHaveLength(1);
    expect(races[0]!.first.thread).toBe(0);
    expect(races[0]!.second.thread).toBe(1);
  });

  it('unlock → lock crea happens-before y evita la race', () => {
    const hb = new HBState(2, 1, 1, 0);
    hb.apply(0, { kind: 'lock', m: 0, reacquire: false }, loc, 0);
    hb.apply(0, { kind: 'write', g: 0, value: 1, old: 0 }, loc, 1);
    hb.apply(0, { kind: 'unlock', m: 0 }, loc, 2);
    const lock = hb.apply(1, { kind: 'lock', m: 0, reacquire: false }, loc, 3);
    expect(lock.edges).toEqual([{ fromStep: 2, toStep: 3, kind: 'mutex' }]);
    expect(hb.apply(1, { kind: 'read', g: 0, value: 1 }, loc, 4).races).toHaveLength(0);
    expect(happensBefore({ thread: 0, clock: 1, kind: 'write', loc, step: 1 }, hb.C[1]!)).toBe(
      true,
    );
  });

  it('set_value → get crea happens-before', () => {
    const hb = new HBState(2, 1, 0, 1);
    hb.apply(0, { kind: 'write', g: 0, value: 1, old: 0 }, loc, 0);
    hb.apply(0, { kind: 'setValue', p: 0, value: 1 }, loc, 1);
    const get = hb.apply(1, { kind: 'get', p: 0, value: 1 }, loc, 2);
    expect(get.edges[0]!.kind).toBe('promise');
    expect(hb.apply(1, { kind: 'write', g: 0, value: 2, old: 1 }, loc, 3).races).toHaveLength(0);
  });

  it('una lectura concurrente con una escritura posterior es una race', () => {
    const hb = new HBState(2, 1, 0, 0);
    hb.apply(0, { kind: 'read', g: 0, value: 0 }, loc, 0);
    const { races } = hb.apply(1, { kind: 'write', g: 0, value: 1, old: 0 }, loc, 1);
    expect(races.map((r) => r.first.kind)).toEqual(['read']);
  });

  it('clone produce una copia independiente', () => {
    const hb = new HBState(2, 1, 1, 0);
    const c = hb.clone();
    c.apply(0, { kind: 'unlock', m: 0 }, loc, 0);
    expect(hb.C[0]).toEqual([1, 0]);
    expect(c.C[0]).toEqual([2, 0]);
  });
});

describe('grafo de espera', () => {
  it('encuentra ciclos y no inventa ciclos', () => {
    expect(
      findCycle(2, [
        { from: 0, to: 1 },
        { from: 1, to: 0 },
      ]),
    ).toEqual([0, 1]);
    expect(
      findCycle(3, [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
      ]),
    ).toBeNull();
    expect(findCycle(1, [{ from: 0, to: 0 }])).toEqual([0]);
    expect(
      findCycle(4, [
        { from: 0, to: 1 },
        { from: 2, to: 3 },
        { from: 3, to: 1 },
        { from: 1, to: 2 },
      ]),
    ).toEqual([1, 2, 3]);
  });
});
