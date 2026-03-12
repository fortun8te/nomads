/**
 * Worker Pool — Generic concurrent task executor
 * Used for parallel compression, batch screenshots, embedding generation, etc.
 */

export interface PoolStats {
  completed: number;
  failed: number;
  active: number;
  pending: number;
  elapsed: number;
}

type ProgressCallback = (stats: PoolStats) => void;

export class WorkerPool<T, R> {
  private concurrency: number;
  private onProgress?: ProgressCallback;

  constructor(concurrency: number, onProgress?: ProgressCallback) {
    this.concurrency = concurrency;
    this.onProgress = onProgress;
  }

  /**
   * Run all tasks with controlled concurrency. Returns results in order.
   * Throws if any task fails.
   */
  async run(
    tasks: T[],
    worker: (task: T, index: number) => Promise<R>,
    signal?: AbortSignal
  ): Promise<R[]> {
    const results: R[] = new Array(tasks.length);
    let nextIndex = 0;
    let completed = 0;
    let failed = 0;
    const startTime = Date.now();

    const reportProgress = () => {
      this.onProgress?.({
        completed,
        failed,
        active: Math.min(this.concurrency, tasks.length - nextIndex),
        pending: Math.max(0, tasks.length - nextIndex - this.concurrency),
        elapsed: Date.now() - startTime,
      });
    };

    const runNext = async (): Promise<void> => {
      while (nextIndex < tasks.length) {
        if (signal?.aborted) throw new Error('Aborted');

        const idx = nextIndex++;
        try {
          results[idx] = await worker(tasks[idx], idx);
          completed++;
        } catch (err) {
          failed++;
          throw err;
        }
        reportProgress();
      }
    };

    // Launch workers up to concurrency limit
    const workers = Array.from(
      { length: Math.min(this.concurrency, tasks.length) },
      () => runNext()
    );

    await Promise.all(workers);
    return results;
  }

  /**
   * Run all tasks, settling each independently (no early abort on failure).
   * Returns PromiseSettledResult for each task.
   */
  async runSettled(
    tasks: T[],
    worker: (task: T, index: number) => Promise<R>,
    signal?: AbortSignal
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(tasks.length);
    let nextIndex = 0;
    let completed = 0;
    let failed = 0;
    const startTime = Date.now();

    const reportProgress = () => {
      this.onProgress?.({
        completed,
        failed,
        active: Math.min(this.concurrency, tasks.length - completed - failed),
        pending: Math.max(0, tasks.length - nextIndex),
        elapsed: Date.now() - startTime,
      });
    };

    const runNext = async (): Promise<void> => {
      while (nextIndex < tasks.length) {
        if (signal?.aborted) {
          // Mark remaining as rejected
          while (nextIndex < tasks.length) {
            const idx = nextIndex++;
            results[idx] = { status: 'rejected', reason: new Error('Aborted') };
            failed++;
          }
          return;
        }

        const idx = nextIndex++;
        try {
          const value = await worker(tasks[idx], idx);
          results[idx] = { status: 'fulfilled', value };
          completed++;
        } catch (reason) {
          results[idx] = { status: 'rejected', reason };
          failed++;
        }
        reportProgress();
      }
    };

    const workers = Array.from(
      { length: Math.min(this.concurrency, tasks.length) },
      () => runNext()
    );

    await Promise.all(workers);
    return results;
  }

  setConcurrency(n: number) {
    this.concurrency = n;
  }
}

/** Convenience: run tasks with concurrency control */
export async function poolRun<T, R>(
  tasks: T[],
  worker: (task: T, index: number) => Promise<R>,
  concurrency: number = 3,
  signal?: AbortSignal
): Promise<R[]> {
  return new WorkerPool<T, R>(concurrency).run(tasks, worker, signal);
}

/** Convenience: run tasks settled (no early abort) */
export async function poolRunSettled<T, R>(
  tasks: T[],
  worker: (task: T, index: number) => Promise<R>,
  concurrency: number = 3,
  signal?: AbortSignal
): Promise<PromiseSettledResult<R>[]> {
  return new WorkerPool<T, R>(concurrency).runSettled(tasks, worker, signal);
}
