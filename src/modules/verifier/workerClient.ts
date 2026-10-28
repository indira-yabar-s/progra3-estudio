import type { VerifyOptions, VerifyResult } from '@/core/telarc/verify';
import type { WorkerRequest, WorkerResponse } from '@/workers/verifier.worker';

type Progress = (p: { states: number; phase: 'por' | 'baseline' }) => void;

/** Cliente del worker: una verificación a la vez; cancelar = terminar el worker. */
class VerifierClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending: { id: number; reject: (e: Error) => void } | null = null;

  private ensure(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../../workers/verifier.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  run(
    source: string,
    options: Omit<VerifyOptions, 'onProgress'>,
    onProgress: Progress,
  ): Promise<VerifyResult> {
    this.cancel();
    const worker = this.ensure();
    const id = ++this.seq;
    return new Promise<VerifyResult>((resolve, reject) => {
      this.pending = { id, reject };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.id !== id) return;
        if (msg.type === 'progress') onProgress({ states: msg.states, phase: msg.phase });
        else {
          this.pending = null;
          if (msg.type === 'result') resolve(msg.result);
          else reject(new Error(msg.message));
        }
      };
      worker.onerror = (e) => {
        this.pending = null;
        reject(new Error(e.message));
      };
      worker.postMessage({ type: 'verify', id, source, options } satisfies WorkerRequest);
    });
  }

  cancel(): void {
    if (this.pending) {
      this.worker?.terminate();
      this.worker = null;
      this.pending.reject(new DOMException('cancelado', 'AbortError'));
      this.pending = null;
    }
  }
}

export const verifierClient = new VerifierClient();
