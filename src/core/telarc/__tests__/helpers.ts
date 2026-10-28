import { compile } from '../compiler';
import { Machine } from '../machine';
import { parse } from '../parser';
import { verify } from '../verify';

export function machineFor(src: string): Machine {
  return new Machine(compile(parse(src), src));
}

export function verifyOk(src: string, opts: Parameters<typeof verify>[1] = {}) {
  const r = verify(src, opts);
  if (r.status !== 'done') throw new Error(`error de compilación: ${r.diagnostic.message.es}`);
  return r;
}

export const kinds = (r: ReturnType<typeof verifyOk>) =>
  [...new Set(r.findings.map((f) => f.kind))].sort();
