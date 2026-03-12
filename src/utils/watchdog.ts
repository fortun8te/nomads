/**
 * Watchdog — Detects stuck research agents and auto-recovers
 * Each active LLM call pings the watchdog; if no ping arrives
 * within the timeout window, the watchdog fires onStuck.
 */

export interface WatchdogConfig {
  stageTimeoutMs: number;       // max time per LLM call before considered stuck
  totalTimeoutMs: number;       // max total research time
  maxConsecutiveErrors: number;  // errors before hard abort
  onStuck?: (stageId: string, elapsedMs: number) => void;
  onRecovery?: (stageId: string) => void;
  onHardAbort?: (reason: string) => void;
}

interface TrackedStage {
  id: string;
  startedAt: number;
  lastPingAt: number;
  isStuck: boolean;
}

// Preset-based timeout configs
export const WATCHDOG_PRESETS: Record<string, Pick<WatchdogConfig, 'stageTimeoutMs' | 'totalTimeoutMs'>> = {
  'super-quick':  { stageTimeoutMs: 60_000,  totalTimeoutMs: 300_000 },
  'quick':        { stageTimeoutMs: 90_000,  totalTimeoutMs: 900_000 },
  'normal':       { stageTimeoutMs: 120_000, totalTimeoutMs: 2_700_000 },
  'extended':     { stageTimeoutMs: 180_000, totalTimeoutMs: 7_200_000 },
  'max':          { stageTimeoutMs: 300_000, totalTimeoutMs: 18_000_000 },
};

class Watchdog {
  private config: WatchdogConfig;
  private stages: Map<string, TrackedStage> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private consecutiveErrors: number = 0;
  private abortController: AbortController | null = null;

  constructor(config: Partial<WatchdogConfig> = {}) {
    this.config = {
      stageTimeoutMs: 120_000,
      totalTimeoutMs: 2_700_000,
      maxConsecutiveErrors: 3,
      ...config,
    };
  }

  /** Start the watchdog with an abort controller it can trigger */
  start(abortController?: AbortController) {
    this.startTime = Date.now();
    this.consecutiveErrors = 0;
    this.abortController = abortController || null;

    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.tick(), 5_000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stages.clear();
    this.abortController = null;
  }

  /** Register a new active stage */
  beginStage(stageId: string) {
    const now = Date.now();
    this.stages.set(stageId, {
      id: stageId,
      startedAt: now,
      lastPingAt: now,
      isStuck: false,
    });
  }

  /** Heartbeat — call this during streaming to signal progress */
  ping(stageId: string) {
    const stage = this.stages.get(stageId);
    if (stage) {
      stage.lastPingAt = Date.now();
      if (stage.isStuck) {
        stage.isStuck = false;
        this.config.onRecovery?.(stageId);
      }
    }
  }

  /** Mark a stage as complete */
  endStage(stageId: string) {
    this.stages.delete(stageId);
  }

  /** Record an error — triggers hard abort after maxConsecutiveErrors */
  recordError(stageId: string) {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      this.config.onHardAbort?.(`${this.consecutiveErrors} consecutive errors (last: ${stageId})`);
      this.abortController?.abort();
      this.stop();
    }
  }

  /** Record a success — resets error counter */
  recordSuccess() {
    this.consecutiveErrors = 0;
  }

  /** Update config (e.g., when preset changes) */
  updateConfig(config: Partial<WatchdogConfig>) {
    Object.assign(this.config, config);
  }

  /** Internal tick — checks all active stages */
  private tick() {
    const now = Date.now();

    // Check total timeout
    if (this.startTime && (now - this.startTime) > this.config.totalTimeoutMs) {
      this.config.onHardAbort?.(`Total timeout exceeded (${Math.round(this.config.totalTimeoutMs / 60_000)}min)`);
      this.abortController?.abort();
      this.stop();
      return;
    }

    // Check per-stage timeouts
    for (const stage of this.stages.values()) {
      const elapsed = now - stage.lastPingAt;
      if (elapsed > this.config.stageTimeoutMs && !stage.isStuck) {
        stage.isStuck = true;
        this.config.onStuck?.(stage.id, elapsed);
      }
    }
  }

  /** Get current watchdog state for UI display */
  getState() {
    return {
      running: this.intervalId !== null,
      elapsed: this.startTime ? Date.now() - this.startTime : 0,
      activeStages: Array.from(this.stages.values()).map(s => ({
        id: s.id,
        elapsed: Date.now() - s.startedAt,
        isStuck: s.isStuck,
      })),
      consecutiveErrors: this.consecutiveErrors,
    };
  }
}

export function createWatchdog(config?: Partial<WatchdogConfig>): Watchdog {
  return new Watchdog(config);
}
