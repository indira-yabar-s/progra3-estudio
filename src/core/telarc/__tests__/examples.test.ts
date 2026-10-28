import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../examples';
import { verify } from '../verify';

describe('biblioteca de ejemplos', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: encuentra exactamente ${ex.expected.join(', ') || 'ningún error'}`, () => {
      const r = verify(ex.source);
      if (r.status !== 'done') throw new Error(JSON.stringify(r.diagnostic));
      expect(r.stats.complete).toBe(true);
      const kinds = [...new Set(r.findings.map((f) => f.kind))].sort();
      expect(kinds).toEqual([...ex.expected].sort());
    });
  }
});
