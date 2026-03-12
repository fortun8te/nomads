/**
 * Rate Limiter — Priority-based concurrency control for Ollama API
 * Prevents GPU thrashing from concurrent LLM calls while allowing
 * controlled parallelism (e.g., 2-3 simultaneous compression calls).
 */

export type Priority = 'critical' | 'high' | 'normal' | 'low';

interface QueueEntry {
  priority: Priority;
  resolve: () => void;
  enqueuedAt: number;
}

const PRIORITY_WEIGHTS: Record<Priority, number> = {
  critical: 4, // orchestrator decisions
  high: 3,     // reflection agents
  normal: 2,   // researcher synthesis
  low: 1,      // compression, memory writes
};

export class OllamaRateLimiter {
  private maxConcurrent: number;
  private active: number = 0;
  private queue: QueueEntry[] = [];
  private totalProcessed: number = 0;
  private totalWaitMs: number = 0;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  /** Acquire a slot. Resolves when a slot is available. */
  async acquire(priority: Priority = 'normal'): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return;
    }

    // Queue the request
    return new Promise<void>((resolve) => {
      this.queue.push({ priority, resolve, enqueuedAt: Date.now() });
      // Sort by priority (highest first), then by enqueue time (FIFO within same priority)
      this.queue.sort((a, b) => {
        const pw = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
        if (pw !== 0) return pw;
        return a.enqueuedAt - b.enqueuedAt;
      });
    });
  }

  /** Release a slot. Wakes next queued request. */
  release(): void {
    this.active = Math.max(0, this.active - 1);
    this.totalProcessed++;

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.active++;
      this.totalWaitMs += Date.now() - next.enqueuedAt;
      next.resolve();
    }
  }

  /** Helper to wrap an async function with rate limiting */
  async withLimit<T>(fn: () => Promise<T>, priority: Priority = 'normal'): Promise<T> {
    await this.acquire(priority);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** Update max concurrent (e.g., when switching presets) */
  setMaxConcurrent(n: number) {
    this.maxConcurrent = n;
    // Drain queue if we now have capacity
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.active++;
      this.totalWaitMs += Date.now() - next.enqueuedAt;
      next.resolve();
    }
  }

  getStats() {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      totalProcessed: this.totalProcessed,
      avgWaitMs: this.totalProcessed > 0 ? Math.round(this.totalWaitMs / this.totalProcessed) : 0,
    };
  }
}

// Singleton for the main Ollama rate limiter
export const ollamaLimiter = new OllamaRateLimiter(3);
