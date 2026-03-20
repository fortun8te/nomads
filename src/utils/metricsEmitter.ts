/**
 * metricsEmitter.ts — Central metrics event bus
 *
 * This utility provides a way to emit real-time metrics updates
 * as the pipeline executes, without requiring constant Cycle saves.
 *
 * Use case: Stream metrics to LiveMetricsPanel in real-time while
 * research agents are running, for snappy UI updates.
 */

import * as React from 'react';
import type { MetricsUpdateEvent, MetricsListener } from '../types/metricsTypes';

class MetricsEmitter {
  private listeners = new Set<MetricsListener>();
  private lastEvent: MetricsUpdateEvent | null = null;

  /**
   * Emit a metrics update event
   */
  emit(event: MetricsUpdateEvent): void {
    this.lastEvent = event;
    this.listeners.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('Error in metrics listener:', err);
      }
    });
  }

  /**
   * Subscribe to metrics updates
   * Returns unsubscribe function
   */
  subscribe(callback: MetricsListener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get the last emitted event (for React components that missed it)
   */
  getLastEvent(): MetricsUpdateEvent | null {
    return this.lastEvent;
  }

  /**
   * Clear all listeners (useful for cleanup)
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get listener count (for debugging)
   */
  listenerCount(): number {
    return this.listeners.size;
  }
}

// Singleton instance
const metricsEmitter = new MetricsEmitter();

/**
 * Get the global metrics emitter
 */
export function getMetricsEmitter(): MetricsEmitter {
  return metricsEmitter;
}

/**
 * React hook to subscribe to metrics updates.
 * Bug fix: use proper import instead of require('react').
 * Bug fix: store callback in a ref so the effect doesn't re-subscribe
 * on every render when callers pass an unstable callback.
 */
export function useMetricsEvents(callback: MetricsListener): void {
  const callbackRef = React.useRef(callback);
  React.useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  React.useEffect(() => {
    const unsubscribe = metricsEmitter.subscribe((event) => {
      callbackRef.current(event);
    });
    return unsubscribe;
  }, []);
}

/**
 * Helper to emit orchestration metrics update
 */
export function emitOrchestrationUpdate(
  cycleId: string,
  metrics: {
    iteration?: number;
    maxIterations?: number;
    coveragePercent?: number;
    coverageDimensions?: string[];
    coverageDimensionCounts?: Record<string, number>;
    lastDecision?: string;
    reflectionFeedback?: string;
  }
): void {
  metricsEmitter.emit({
    type: 'metrics-update',
    timestamp: Date.now(),
    cycleId,
    orchestration: metrics,
  });
}

/**
 * Helper to emit watchdog metrics update
 */
export function emitWatchdogUpdate(
  cycleId: string,
  metrics: {
    tokensUsed?: number;
    tokenBudget?: number;
    iterationsRemaining?: number;
    stagnationRounds?: number;
    queryRepeatCount?: Record<string, number>;
    shouldKill?: boolean;
    killReason?: string;
  }
): void {
  metricsEmitter.emit({
    type: 'metrics-update',
    timestamp: Date.now(),
    cycleId,
    watchdog: metrics,
  });
}

/**
 * Helper to emit stage metrics update
 */
export function emitStageUpdate(
  cycleId: string,
  metrics: {
    currentStage?: string;
    elapsedMs?: number;
    currentModel?: string;
    thinkingTokens?: number;
  }
): void {
  metricsEmitter.emit({
    type: 'metrics-update',
    timestamp: Date.now(),
    cycleId,
    stage: metrics,
  });
}

/**
 * Helper to emit active researchers update
 */
export function emitResearchersUpdate(
  cycleId: string,
  researchers: Array<{
    query: string;
    progress: number;
    status: 'pending' | 'running' | 'complete' | 'error';
    error?: string;
    tokensUsed?: number;
    pagesProcessed?: number;
  }>
): void {
  metricsEmitter.emit({
    type: 'metrics-update',
    timestamp: Date.now(),
    cycleId,
    activeResearchers: researchers,
  });
}

/**
 * Helper to emit error update
 */
export function emitErrorUpdate(cycleId: string, error: string | null): void {
  metricsEmitter.emit({
    type: 'metrics-update',
    timestamp: Date.now(),
    cycleId,
    error,
  });
}

/**
 * Helper to emit a complete metrics snapshot (all fields)
 */
export function emitCompleteMetrics(
  cycleId: string,
  metrics: Partial<Omit<MetricsUpdateEvent, 'type' | 'timestamp' | 'cycleId'>>
): void {
  metricsEmitter.emit({
    type: 'metrics-update',
    timestamp: Date.now(),
    cycleId,
    ...metrics,
  });
}

/**
 * Example: How to use in your orchestrator
 *
 * import { emitOrchestrationUpdate, emitWatchdogUpdate, emitResearchersUpdate } from './utils/metricsEmitter';
 *
 * // In your orchestrator loop:
 * for (let i = 0; i < maxIterations; i++) {
 *   // ... orchestration logic ...
 *
 *   emitOrchestrationUpdate(cycle.id, {
 *     iteration: i + 1,
 *     maxIterations,
 *     coveragePercent: computeCoverage(),
 *     coverageDimensions: dims,
 *     coverageDimensionCounts: counts,
 *     lastDecision: decisionText,
 *   });
 *
 *   emitWatchdogUpdate(cycle.id, {
 *     tokensUsed: totalTokens,
 *     tokenBudget,
 *     iterationsRemaining: maxIterations - i - 1,
 *     stagnationRounds,
 *     shouldKill: !!killReason,
 *     killReason,
 *   });
 *
 *   emitResearchersUpdate(cycle.id, activeResearchers);
 *
 *   if (someError) {
 *     emitErrorUpdate(cycle.id, errorMessage);
 *   }
 * }
 */
