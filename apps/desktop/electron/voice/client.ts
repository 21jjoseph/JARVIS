import { Worker } from 'node:worker_threads';
export class SpeechWorker {
  private worker: Worker;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(path: string, root: string) {
    this.worker = new Worker(path, { workerData: { root } });
    this.worker.on('message', (response: { id: number; result?: unknown; error?: string }) => {
      const item = this.pending.get(response.id);
      if (!item) return;
      this.pending.delete(response.id);
      clearTimeout(item.timer);
      if (response.error) item.reject(new Error(response.error));
      else item.resolve(response.result);
    });
    this.worker.on('error', () =>
      this.rejectAll(new Error('The local speech worker stopped. Restart the voice session.')),
    );
    this.worker.on('exit', () => this.rejectAll(new Error('Voice session stopped.')));
  }
  call<T>(kind: string, data: Record<string, unknown> = {}): Promise<T> {
    if (this.pending.size >= 2) return Promise.reject(new Error('Speech worker is busy.'));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            'Local speech processing timed out. Try a shorter phrase or use Eco graphics mode.',
          ),
        );
        void this.stop();
      }, 120_000);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.worker.postMessage({ id, kind, ...data });
    });
  }
  private rejectAll(error: Error) {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }
  async stop() {
    this.rejectAll(new Error('Voice session stopped.'));
    await this.worker.terminate();
  }
}
