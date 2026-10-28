import type { Value } from '@/core/telarc/ast';
import type { StepEvent } from '@/core/telarc/machine';
import type { TraceEnd } from '@/core/telarc/trace';
import type { ProgramInfo } from '@/core/telarc/verify';
import type { MessageKey, Params } from '@/i18n';

type T = (key: MessageKey, params?: Params) => string;

export const threadColor = (t: number) => `var(--t${((t % 6) + 6) % 6})`;

export const fmtValue = (v: Value | null | undefined) =>
  v === null || v === undefined ? '—' : String(v);

/** Frase corta que describe lo que hizo un paso. */
export function describeEvent(e: StepEvent, p: ProgramInfo, t: T): string {
  const g = (i: number) => p.globals[i]?.name ?? `g${i}`;
  const m = (i: number) => p.mutexes[i] ?? `m${i}`;
  const cv = (i: number) => p.cvs[i] ?? `cv${i}`;
  const th = (i: number) => p.threads[i] ?? `t${i}`;
  switch (e.kind) {
    case 'read':
      return t('event.read', { v: g(e.g), val: fmtValue(e.value) });
    case 'write':
      return t('event.write', { v: g(e.g), val: fmtValue(e.value) });
    case 'assert':
      return t(e.ok ? 'event.assertOk' : 'event.assertFail', { text: e.text });
    case 'lock':
      return t(e.reacquire ? 'event.relock' : 'event.lock', { m: m(e.m) });
    case 'unlock':
      return t('event.unlock', { m: m(e.m) });
    case 'lockAll':
      return t('event.lockAll', { ms: e.ms.map(m).join(', ') });
    case 'release':
      return e.ms.length
        ? t('event.release', { ms: e.ms.map(m).join(', ') })
        : t('event.releaseNone');
    case 'wait':
      return t('event.wait', { m: m(e.m), cv: cv(e.cv) });
    case 'notify': {
      const op = e.all ? 'notify_all' : 'notify_one';
      return e.woken.length
        ? t('event.notify', { op, cv: cv(e.cv), list: e.woken.map(th).join(', ') })
        : t('event.notifyNone', { op, cv: cv(e.cv) });
    }
    case 'setValue':
      return t('event.setValue', { p: p.promises[e.p]?.name ?? 'p', val: fmtValue(e.value) });
    case 'get':
      return t('event.get', { f: p.promises[e.p]?.future ?? 'f', val: fmtValue(e.value) });
    case 'runtimeError':
      return t('event.runtimeError');
  }
}

export function describeEnd(end: TraceEnd, t: T): string {
  switch (end.kind) {
    case 'finished':
      return t('end.finished');
    case 'deadlock':
      return t('end.deadlock');
    case 'failure':
      return t('end.failure');
    case 'partial':
      return t('end.partial');
  }
}
