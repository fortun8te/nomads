/**
 * metricsTypes.ts — Type definitions for LiveMetricsPanel
 *
 * These types extend the base Cycle type to support metrics tracking.
 * Add these fields to your Cycle object to enable real-time metrics display.
 */

import type { Cycle, OrchestrationMetrics, WatchdogMetrics, StageMetrics } from './index';

// Re-export canonical definitions from index.ts so importers of metricsTypes.ts still work.
export type { OrchestrationMetrics, WatchdogMetrics, StageMetrics };

/**
 * Researcher status — active researchers and their progress
 */
export interface ResearcherStatus {
  query: string;
  progress: number; // 0-100
  status: 'pending' | 'running' | 'complete' | 'error';
  error?: string;
  tokensUsed?: number;
  pagesProcessed?: number;
}

/**
 * Extended Cycle type with metrics support.
 * Use this as your Cycle type if metrics are important to your application.
 */
// CycleWithMetrics adds activeResearchers to the base Cycle type.
// orchestrationData / watchdogState / stageMetrics are now on Cycle itself.
export interface CycleWithMetrics extends Cycle {
  // Active researchers (snapshot during orchestration)
  activeResearchers?: ResearcherStatus[];
}

/**
 * Metrics update event — emitted during pipeline execution
 * Use this to stream metrics updates without polling Cycle
 */
export interface MetricsUpdateEvent {
  type: 'metrics-update';
  timestamp: number;
  cycleId: string;

  // Partial updates — only changed fields
  orchestration?: Partial<OrchestrationMetrics>;
  watchdog?: Partial<WatchdogMetrics>;
  stage?: Partial<StageMetrics>;
  activeResearchers?: ResearcherStatus[];
  error?: string | null;
}

/**
 * Metrics event listener callback
 */
export type MetricsListener = (event: MetricsUpdateEvent) => void;

/**
 * Metrics event emitter interface
 * Implement this if you want to emit metrics updates in real-time
 */
export interface IMetricsEmitter {
  emit(event: MetricsUpdateEvent): void;
  on(callback: MetricsListener): () => void; // Returns unsubscribe function
  off(callback: MetricsListener): void;
}

/**
 * Helper: Update watchdog metrics in a Cycle
 */
export function setWatchdogMetrics(cycle: CycleWithMetrics, metrics: Partial<WatchdogMetrics>): void {
  if (!cycle.watchdogState) {
    cycle.watchdogState = {
      tokensUsed: 0,
      tokenBudget: 500000,
      iterationsRemaining: 30,
      stagnationRounds: 0,
      queryRepeatCount: {},
      shouldKill: false,
    };
  }
  Object.assign(cycle.watchdogState, metrics);
}

/**
 * Helper: Update orchestration metrics in a Cycle
 */
export function setOrchestrationMetrics(cycle: CycleWithMetrics, metrics: Partial<OrchestrationMetrics>): void {
  if (!cycle.orchestrationData) {
    cycle.orchestrationData = {
      iteration: 0,
      maxIterations: 30,
      coveragePercent: 0,
      coverageDimensions: [],
      coverageDimensionCounts: {},
    };
  }
  Object.assign(cycle.orchestrationData, metrics);
}

/**
 * Helper: Update stage metrics in a Cycle
 */
export function setStageMetrics(cycle: CycleWithMetrics, metrics: Partial<StageMetrics>): void {
  if (!cycle.stageMetrics) {
    cycle.stageMetrics = {
      currentStage: 'idle',
      elapsedMs: 0,
      currentModel: 'qwen3.5:4b',
      thinkingTokens: 0,
    };
  }
  Object.assign(cycle.stageMetrics, metrics);
}

/**
 * Helper: Record active researcher in a Cycle
 */
export function recordActiveResearcher(
  cycle: CycleWithMetrics,
  researcher: ResearcherStatus,
  maxKeep: number = 5
): void {
  if (!cycle.activeResearchers) {
    cycle.activeResearchers = [];
  }

  // Replace if exists, otherwise append
  const idx = cycle.activeResearchers.findIndex(r => r.query === researcher.query);
  if (idx >= 0) {
    cycle.activeResearchers[idx] = researcher;
  } else {
    cycle.activeResearchers.push(researcher);
  }

  // Keep only the most recent
  if (cycle.activeResearchers.length > maxKeep) {
    cycle.activeResearchers = cycle.activeResearchers.slice(-maxKeep);
  }
}

/**
 * Helper: Clear active researchers from a Cycle
 */
export function clearActiveResearchers(cycle: CycleWithMetrics): void {
  cycle.activeResearchers = [];
}

/**
 * Create a simple in-memory metrics emitter
 */
export function createMetricsEmitter(): IMetricsEmitter {
  const listeners = new Set<MetricsListener>();

  return {
    emit(event: MetricsUpdateEvent) {
      listeners.forEach(callback => {
        try {
          callback(event);
        } catch (err) {
          console.error('Metrics listener error:', err);
        }
      });
    },

    on(callback: MetricsListener) {
      listeners.add(callback);
      return () => listeners.delete(callback); // unsubscribe
    },

    off(callback: MetricsListener) {
      listeners.delete(callback);
    },
  };
}

/**
 * Singleton metrics emitter instance
 * Use if you want global metrics event bus
 */
let globalEmitter: IMetricsEmitter | null = null;

export function getMetricsEmitter(): IMetricsEmitter {
  if (!globalEmitter) {
    globalEmitter = createMetricsEmitter();
  }
  return globalEmitter;
}

export function setMetricsEmitter(emitter: IMetricsEmitter): void {
  globalEmitter = emitter;
}
