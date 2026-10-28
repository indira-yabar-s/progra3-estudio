/// <reference lib="webworker" />
import { verify, type VerifyOptions, type VerifyResult } from '@/core/telarc/verify';

/**
 * El explorador corre en un Web Worker: aunque explore cientos de miles de
 * estados, el hilo principal (la interfaz) nunca se congela.
 */

export type WorkerRequest = {
  type: 'verify';
  id: number;
  source: string;
  options: Omit<VerifyOptions, 'onProgress'>;
};

export type WorkerResponse =
  | { type: 'progress'; id: number; states: number; phase: 'por' | 'baseline' }
  | { type: 'result'; id: number; result: VerifyResult }
  | { type: 'error'; id: number; message: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, source, options } = e.data;
  let last = 0;
  try {
    const result = verify(source, {
      ...options,
      onProgress: (p) => {
        const now = performance.now();
        if (now - last < 60) return; // no saturar el canal de mensajes
        last = now;
        self.postMessage({
          type: 'progress',
          id,
          states: p.states,
          phase: p.phase,
        } satisfies WorkerResponse);
      },
    });
    self.postMessage({ type: 'result', id, result } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({
      type: 'error',
      id,
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
