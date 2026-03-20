import { useMemo, useState, useEffect, useRef } from 'react';
import type { Cycle } from '../types';
import type { LiveMetricsInput } from '../components/LiveMetricsPanel';

/**
 * useMetrics — Aggregates orchestrator, watchdog, and stage metrics into a single
 * data structure suitable for LiveMetricsPanel.
 *
 * Tracks:
 * - Orchestration state (iteration, coverage, dimensions)
 * - Watchdog budget enforcement (tokens, iterations, stagnation)
 * - Stage execution (elapsed time, current model)
 * - Research progress (pages, URLs, facts)
 * - Active researchers and their progress
 */

interface RawMetrics {
  // From cycle
  cycle: Cycle | null;
  isRunning: boolean;

  // From orchestrator state (usually in cycle.orchestrationData or similar)
  iteration?: number;
  maxIterations?: number;
  coveragePercent?: number;
  coveredDimensions?: number;
  totalDimensions?: number;
  totalSources?: number;
  totalQueries?: number;
  coverageDimensions?: string[];
  coverageDimensionCounts?: Record<string, number>;
  orchestratorDecision?: string;
  reflectionFeedback?: string;

  // From watchdog/research audit
  tokensUsed?: number;
  tokenBudget?: number;
  iterationsRemaining?: number;
  stagnationRounds?: number;
  queryRepeatCount?: Record<string, number>;
  shouldKillOrchestrator?: boolean;
  killReason?: string;

  // From stage execution
  currentStage?: string;
  elapsedMs?: number;
  currentModel?: string;
  thinkingTokens?: number;

  // From research findings
  pagesScanned?: number;
  urlsProcessed?: number;
  keyFactsExtracted?: number;
  visualScreenshots?: number;

  // Active researchers
  activeResearchers?: Array<{
    query: string;
    progress: number;
    status: 'pending' | 'running' | 'complete' | 'error';
  }>;

  // Error tracking
  lastError?: string;
  thinkingContent?: string;
}

/**
 * Default/empty metrics when no cycle is active
 */
function defaultMetrics(): RawMetrics {
  return {
    cycle: null,
    isRunning: false,
    iteration: 0,
    maxIterations: 30,
    coveragePercent: 0,
    coverageDimensions: [
      'market_trends',
      'competitor_analysis',
      'customer_objections',
      'pricing_strategies',
      'audience_language',
      'channel_effectiveness',
      'brand_positioning',
      'psychological_triggers',
      'regional_differences',
      'emerging_opportunities',
      'visual_patterns',
      'community_insights',
    ],
    coverageDimensionCounts: {},
    tokensUsed: 0,
    tokenBudget: 500000,
    iterationsRemaining: 30,
    stagnationRounds: 0,
    queryRepeatCount: {},
    shouldKillOrchestrator: false,
    currentStage: 'idle',
    elapsedMs: 0,
    currentModel: 'qwen3.5:4b',
    thinkingTokens: 0,
    pagesScanned: 0,
    urlsProcessed: 0,
    keyFactsExtracted: 0,
    activeResearchers: [],
    lastError: undefined,
  };
}

/**
 * Extract metrics from a Cycle object.
 * Cycle may have different shapes depending on stage — this function
 * is defensive and provides sensible defaults.
 */
function extractMetricsFromCycle(cycle: Cycle | null): RawMetrics {
  if (!cycle) return defaultMetrics();

  const metrics: RawMetrics = defaultMetrics();
  metrics.cycle = cycle;

  // Orchestration data (usually stored during research stage)
  if (cycle.orchestrationData) {
    const data = cycle.orchestrationData;
    metrics.iteration = data.iteration ?? 0;
    metrics.maxIterations = data.maxIterations ?? 30;
    metrics.coveragePercent = data.coveragePercent ?? 0;
    metrics.coveredDimensions = data.coveredDimensions ?? 0;
    metrics.totalDimensions = data.totalDimensions ?? 0;
    metrics.totalSources = data.totalSources ?? 0;
    metrics.totalQueries = data.totalQueries ?? 0;
    metrics.coverageDimensions = data.coverageDimensions ?? metrics.coverageDimensions;
    metrics.coverageDimensionCounts = data.coverageDimensionCounts ?? {};
    metrics.orchestratorDecision = data.lastDecision;
    metrics.reflectionFeedback = data.reflectionFeedback;
  }

  // Watchdog state (may be in a metadata field)
  if (cycle.watchdogState) {
    const wd = cycle.watchdogState;
    metrics.tokensUsed = wd.tokensUsed ?? 0;
    metrics.tokenBudget = wd.tokenBudget ?? 500000;
    metrics.iterationsRemaining = wd.iterationsRemaining ?? 30;
    metrics.stagnationRounds = wd.stagnationRounds ?? 0;
    metrics.queryRepeatCount = wd.queryRepeatCount ?? {};
    metrics.shouldKillOrchestrator = wd.shouldKill ?? false;
    metrics.killReason = wd.killReason;
  }

  // Stage metrics
  if (cycle.stageMetrics) {
    const stg = cycle.stageMetrics;
    metrics.currentStage = stg.currentStage;
    metrics.elapsedMs = stg.elapsedMs ?? 0;
    metrics.currentModel = stg.currentModel ?? 'qwen3.5:4b';
    metrics.thinkingTokens = stg.thinkingTokens ?? 0;
  }

  // Research findings (from researchFindings object)
  if (cycle.researchFindings) {
    const rf = cycle.researchFindings;
    metrics.pagesScanned = rf.pagesScanned ?? 0;
    metrics.urlsProcessed = rf.urlsProcessed ?? 0;
    metrics.keyFactsExtracted = rf.keyFactsExtracted ?? 0;
    if (rf.visualFindings) {
      metrics.visualScreenshots = rf.visualFindings.competitorVisuals?.length ?? 0;
    }
  }

  // Error tracking
  metrics.lastError = cycle.error;

  return metrics;
}

/**
 * Hook that provides a normalized LiveMetricsInput object for the panel.
 *
 * Accepts raw metrics and augments them with derived values (percentages, formatted strings, etc).
 *
 * Usage:
 *   const metricsInput = useMetrics(cycle, isRunning, customMetrics);
 *   <LiveMetricsPanel {...metricsInput} />
 */
export function useMetrics(
  cycle: Cycle | null,
  isRunning: boolean,
  overrideMetrics?: Partial<RawMetrics>,
): LiveMetricsInput {
  const [activeResearchers, setActiveResearchers] = useState<
    Array<{ query: string; progress: number; status: 'pending' | 'running' | 'complete' | 'error' }>
  >([]);

  // Bug fix: stabilize the overrideMetrics reference so that callers passing an
  // inline object literal ({}) on every render don't cause the rawMetrics useMemo
  // to re-run on every render.  We deep-compare via JSON and only update the ref
  // when the serialized value actually changes.
  const overrideMetricsRef = useRef<Partial<RawMetrics> | undefined>(overrideMetrics);
  const overrideMetricsSerialized = overrideMetrics ? JSON.stringify(overrideMetrics) : undefined;
  const prevSerializedRef = useRef<string | undefined>(overrideMetricsSerialized);
  if (overrideMetricsSerialized !== prevSerializedRef.current) {
    prevSerializedRef.current = overrideMetricsSerialized;
    overrideMetricsRef.current = overrideMetrics;
  }
  const stableOverrideMetrics = overrideMetricsRef.current;

  // Extract base metrics from cycle
  const rawMetrics = useMemo(() => {
    let metrics = extractMetricsFromCycle(cycle);
    if (stableOverrideMetrics) {
      metrics = { ...metrics, ...stableOverrideMetrics };
    }
    return metrics;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle, overrideMetricsSerialized]);

  // Bug fix: extract a primitive count so the effect dep is stable and doesn't
  // tear down/recreate the interval every time overrideMetrics changes reference.
  const activeResearcherCount = rawMetrics.activeResearchers?.length ?? 0;

  // Simulate researcher progress changes (in real implementation, this would come from orchestrator streaming)
  useEffect(() => {
    if (!isRunning || activeResearcherCount === 0) {
      setActiveResearchers([]);
      return;
    }

    // For now, animate existing researchers' progress
    const interval = setInterval(() => {
      setActiveResearchers((prev) =>
        prev.map((r) =>
          r.progress >= 100
            ? r
            : { ...r, progress: Math.min(r.progress + Math.random() * 15, 100) }
        )
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, activeResearcherCount]);

  // Build normalized input
  const metricsInput: LiveMetricsInput = useMemo(
    () => ({
      cycle,
      isRunning,
      currentStage: rawMetrics.currentStage ?? 'idle',
      iteration: rawMetrics.iteration ?? 0,
      maxIterations: rawMetrics.maxIterations ?? 30,
      coveragePercent: rawMetrics.coveragePercent ?? 0,
      coveredDimensions: rawMetrics.coveredDimensions ?? 0,
      totalDimensions: rawMetrics.totalDimensions ?? 0,
      totalSources: rawMetrics.totalSources ?? 0,
      totalQueries: rawMetrics.totalQueries ?? 0,
      coverageDimensions: rawMetrics.coverageDimensions ?? [],
      coverageDimensionCounts: rawMetrics.coverageDimensionCounts ?? {},
      watchdogStatus: {
        tokensUsed: rawMetrics.tokensUsed ?? 0,
        tokenBudget: rawMetrics.tokenBudget ?? 500000,
        iterationsRemaining: rawMetrics.iterationsRemaining ?? 30,
        stagnationRounds: rawMetrics.stagnationRounds ?? 0,
        queryRepeatCount: rawMetrics.queryRepeatCount ?? {},
        shouldKill: rawMetrics.shouldKillOrchestrator ?? false,
        killReason: rawMetrics.killReason,
      },
      elapsedMs: rawMetrics.elapsedMs ?? 0,
      currentModel: rawMetrics.currentModel ?? 'qwen3.5:4b',
      thinkingTokens: rawMetrics.thinkingTokens ?? 0,
      activeResearchers: activeResearchers.length > 0 ? activeResearchers : (rawMetrics.activeResearchers ?? []),
      pagesScanned: rawMetrics.pagesScanned ?? 0,
      urlsProcessed: rawMetrics.urlsProcessed ?? 0,
      keyFactsExtracted: rawMetrics.keyFactsExtracted ?? 0,
      visualScreenshots: rawMetrics.visualScreenshots ?? 0,
      lastError: rawMetrics.lastError,
      thinkingContent: rawMetrics.thinkingContent,
    }),
    [cycle, isRunning, rawMetrics, activeResearchers]
  );

  return metricsInput;
}

/**
 * Alternative hook: useMetricsFromCycle
 * Simpler version that just takes a cycle and isRunning flag.
 * Useful when you don't have custom metrics to override.
 */
export function useMetricsFromCycle(
  cycle: Cycle | null,
  isRunning: boolean,
): LiveMetricsInput {
  return useMetrics(cycle, isRunning);
}

/**
 * Pure function that computes a LiveMetricsInput without any React hooks.
 * Used by buildMetrics (non-component contexts) and internally by useMetrics.
 */
export function computeMetrics(
  cycle: Cycle | null,
  isRunning: boolean,
  overrides: Partial<RawMetrics> = {},
): LiveMetricsInput {
  let rawMetrics = extractMetricsFromCycle(cycle);
  if (overrides && Object.keys(overrides).length > 0) {
    rawMetrics = { ...rawMetrics, ...overrides };
  }

  return {
    cycle,
    isRunning,
    currentStage: rawMetrics.currentStage ?? 'idle',
    iteration: rawMetrics.iteration ?? 0,
    maxIterations: rawMetrics.maxIterations ?? 30,
    coveragePercent: rawMetrics.coveragePercent ?? 0,
    coveredDimensions: rawMetrics.coveredDimensions ?? 0,
    totalDimensions: rawMetrics.totalDimensions ?? 0,
    totalSources: rawMetrics.totalSources ?? 0,
    totalQueries: rawMetrics.totalQueries ?? 0,
    coverageDimensions: rawMetrics.coverageDimensions ?? [],
    coverageDimensionCounts: rawMetrics.coverageDimensionCounts ?? {},
    watchdogStatus: {
      tokensUsed: rawMetrics.tokensUsed ?? 0,
      tokenBudget: rawMetrics.tokenBudget ?? 500000,
      iterationsRemaining: rawMetrics.iterationsRemaining ?? 30,
      stagnationRounds: rawMetrics.stagnationRounds ?? 0,
      queryRepeatCount: rawMetrics.queryRepeatCount ?? {},
      shouldKill: rawMetrics.shouldKillOrchestrator ?? false,
      killReason: rawMetrics.killReason,
    },
    elapsedMs: rawMetrics.elapsedMs ?? 0,
    currentModel: rawMetrics.currentModel ?? 'qwen3.5:4b',
    thinkingTokens: rawMetrics.thinkingTokens ?? 0,
    activeResearchers: rawMetrics.activeResearchers ?? [],
    pagesScanned: rawMetrics.pagesScanned ?? 0,
    urlsProcessed: rawMetrics.urlsProcessed ?? 0,
    keyFactsExtracted: rawMetrics.keyFactsExtracted ?? 0,
    visualScreenshots: rawMetrics.visualScreenshots ?? 0,
    lastError: rawMetrics.lastError,
    thinkingContent: rawMetrics.thinkingContent,
  };
}

/**
 * Utility to build metrics from scratch (for testing or manual construction).
 * Safe to call outside React components — uses computeMetrics, not the hook.
 */
export function buildMetrics(
  cycle: Cycle | null,
  isRunning: boolean,
  overrides: Partial<RawMetrics> = {},
): LiveMetricsInput {
  return computeMetrics(cycle, isRunning, overrides);
}
