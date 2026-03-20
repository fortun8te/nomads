/**
 * Consolidation Engine
 *
 * Transforms episodic memories into semantic and procedural memories.
 * Implements intelligent pattern detection, evidence aggregation, and confidence scoring.
 *
 * Workflow:
 * 1. Cluster similar episodic memories (by domain/tags)
 * 2. Detect patterns (frequency, correlation, trend analysis)
 * 3. Generate semantic claims with evidence backing
 * 4. Validate procedural patterns against engagement logs
 * 5. Record consolidation history for audit trail
 */

import type {
  EpisodicMemory,
  ConsolidationEvent,
  ConsolidationConfig,
} from '../types/memory';
import { MemoryService } from './memoryService';

interface EpisodeCluster {
  domain: string;
  episodes: EpisodicMemory[];
  commonTags: string[];
  commonStage?: string;
  commonOutcomeMetric?: string;
}

interface PatternDetectionResult {
  pattern: string;
  confidence: number;
  evidence: {
    frequency: number;
    dataPoints: (number | string)[];
    trend?: 'increasing' | 'decreasing' | 'stable';
    consistency: number; // 0-1: how consistent the pattern is
  };
  sourceEpisodeIds: string[];
}

/**
 * Consolidation Engine for weekly/monthly pattern extraction.
 */
export class ConsolidationEngine {
  private memoryService: MemoryService;
  private config: ConsolidationConfig;

  constructor(memoryService: MemoryService, config: ConsolidationConfig) {
    this.memoryService = memoryService;
    this.config = config;
  }

  /**
   * Main consolidation job: transform episodic → semantic/procedural.
   * Returns list of consolidation events created.
   */
  runConsolidation(): ConsolidationEvent[] {
    const events: ConsolidationEvent[] = [];

    // 1. Cluster episodic memories by domain/context
    const clusters = this.clusterEpisodes();

    // 2. Detect patterns within each cluster
    clusters.forEach((cluster) => {
      if (cluster.episodes.length < this.config.minEpisodesForConsolidation) {
        return; // Skip small clusters
      }

      // Detect semantic patterns
      const patterns = this.detectPatterns(cluster);

      patterns.forEach((pattern) => {
        // 3. Create semantic memory if confidence meets threshold
        if (pattern.confidence >= this.config.minConfidenceForSemantic) {
          const semantic = this.memoryService.createSemanticMemory({
            claim: pattern.pattern,
            content: `Evidence: ${pattern.evidence.dataPoints.join(', ')}. Consistency: ${(
              pattern.evidence.consistency * 100
            ).toFixed(0)}%.`,
            domain: cluster.domain,
            episodeCount: cluster.episodes.length,
            sourceEpisodeIds: pattern.sourceEpisodeIds,
            dataPoints: pattern.evidence.dataPoints,
            confidenceReason: this.explainConfidence(pattern),
            tags: cluster.commonTags,
            ttlDays: this.calculateTTL(pattern.evidence.trend),
            relatedIds: cluster.episodes.map((e) => e.id),
          });

          // Mark source episodes as consolidated
          cluster.episodes.forEach((ep) => {
            ep.consolidatedAt = new Date().toISOString();
          });

          // Log the consolidation event
          const event: ConsolidationEvent = {
            id: `cons_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            consolidationType: 'episodic-to-semantic',
            sourceEpisodeIds: pattern.sourceEpisodeIds,
            resultingMemoryId: semantic.id,
            compressionRatio: pattern.sourceEpisodeIds.length * 2, // Typical compression
            deduplicatedCount: pattern.sourceEpisodeIds.length - 1,
            method: 'semantic-clustering',
            timestamp: new Date().toISOString(),
            triggeredBy: 'consolidation-job',
            consolidationNotes: pattern.pattern,
            resultingConfidence: pattern.confidence,
          };
          events.push(event);
        }
      });

      // 4. Detect and validate procedural patterns
      const procedurals = this.detectProceduralPatterns(cluster);
      procedurals.forEach((proc) => {
        const procedural = this.memoryService.createProceduralMemory({
          procedure: proc.procedure,
          content: `Success rate: ${(proc.successRate * 100).toFixed(0)}% across ${proc.executionCount} runs.`,
          category: proc.category,
          applicabilityTags: [cluster.domain, ...(cluster.commonStage ? [cluster.commonStage] : [])],
          successCount: proc.successCount,
          executionCount: proc.executionCount,
          recentSuccesses: proc.recentSuccesses,
          backingSemanticIds: [], // Will be linked if corresponding semantic exists
          tags: cluster.commonTags,
          knownLimitations: proc.knownLimitations,
        });

        const event: ConsolidationEvent = {
          id: `cons_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          consolidationType: 'procedural-validation',
          sourceEpisodeIds: proc.sourceEpisodeIds,
          resultingMemoryId: procedural.id,
          compressionRatio: proc.sourceEpisodeIds.length * 1.5,
          deduplicatedCount: proc.sourceEpisodeIds.length - 1,
          method: 'validation-triggered',
          timestamp: new Date().toISOString(),
          triggeredBy: 'consolidation-job',
          consolidationNotes: proc.procedure,
          resultingConfidence: procedural.confidence,
        };
        events.push(event);
      });
    });

    return events;
  }

  /**
   * Cluster episodic memories by common domain/tags/stage.
   */
  private clusterEpisodes(): EpisodeCluster[] {
    const store = this.memoryService.getStore();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.lookbackDays);

    // Filter recent, not-yet-consolidated episodes
    const candidates = store.episodic.filter((ep) => {
      const age = new Date(ep.createdAt);
      return (
        age > cutoffDate &&
        !ep.consolidatedAt &&
        age < new Date(Date.now() - this.config.maxEpisodicAge * 24 * 60 * 60 * 1000)
      );
    });

    // Group by primary tag (or stage)
    const grouped = new Map<string, EpisodicMemory[]>();

    candidates.forEach((ep) => {
      const key = ep.tags[0] || ep.stage || 'general';

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(ep);
    });

    // Convert to clusters
    const clusters: EpisodeCluster[] = [];

    grouped.forEach((episodes, domain) => {
      // Find common tags across all episodes in group
      const tagLists = episodes.map((e) => e.tags);
      const commonTags = tagLists.length > 0
        ? tagLists[0].filter((tag) =>
            tagLists.every((list) => list.includes(tag))
          )
        : [];

      // Find common stage
      const stages = new Set(episodes.map((e) => e.stage));
      const commonStage = stages.size === 1 ? Array.from(stages)[0] : undefined;

      // Find common outcome metric
      const metrics = new Set(
        episodes
          .map((e) => e.context.outcome?.metric)
          .filter((m) => m !== undefined)
      );
      const commonOutcomeMetric = metrics.size === 1 ? Array.from(metrics)[0] : undefined;

      clusters.push({
        domain,
        episodes,
        commonTags,
        commonStage,
        commonOutcomeMetric,
      });
    });

    return clusters;
  }

  /**
   * Detect patterns in a cluster of episodic memories.
   * Returns array of PatternDetectionResult for high-confidence patterns.
   */
  private detectPatterns(cluster: EpisodeCluster): PatternDetectionResult[] {
    const results: PatternDetectionResult[] = [];

    // Pattern 1: Frequency-based (what happens most often?)
    const actionFrequency = new Map<string, number>();
    cluster.episodes.forEach((ep) => {
      const action = ep.context.action;
      actionFrequency.set(action, (actionFrequency.get(action) || 0) + 1);
    });

    // Find most frequent action
    let maxAction = '';
    let maxCount = 0;
    actionFrequency.forEach((count, action) => {
      if (count > maxCount) {
        maxCount = count;
        maxAction = action;
      }
    });

    if (maxCount >= this.config.minEpisodesForConsolidation) {
      const frequency = maxCount / cluster.episodes.length;
      results.push({
        pattern: `Action '${maxAction}' occurs in ${(frequency * 100).toFixed(0)}% of interactions`,
        confidence: 0.6 + frequency * 0.3, // 0.6-0.9 based on frequency
        evidence: {
          frequency: maxCount,
          dataPoints: [maxCount, cluster.episodes.length],
          consistency: frequency,
        },
        sourceEpisodeIds: cluster.episodes
          .filter((ep) => ep.context.action === maxAction)
          .map((ep) => ep.id),
      });
    }

    // Pattern 2: Outcome-based (if we have metrics, detect trends)
    if (cluster.commonOutcomeMetric) {
      const outcomes = cluster.episodes
        .filter((ep) => ep.context.outcome?.metric === cluster.commonOutcomeMetric)
        .map((ep) => ep.context.outcome!.value)
        .filter((v) => typeof v === 'number') as number[];

      if (outcomes.length >= 2) {
        const avg = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
        const sorted = [...outcomes].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];

        // Detect trend
        const trend = this.detectTrend(outcomes);

        const consistency = avg !== 0 ? Math.max(0, 1 - this.calculateStdDev(outcomes) / Math.abs(avg)) : 0; // Consistency is inverse of coefficient of variation
        const minConsistency = 0.3; // At least some consistency
        if (consistency >= minConsistency) {
          results.push({
            pattern: `${cluster.commonOutcomeMetric} averages ${avg.toFixed(2)} (median: ${median.toFixed(
              2
            )}), ${trend || 'stable'}`,
            confidence: 0.65 + consistency * 0.25, // 0.65-0.9 based on consistency
            evidence: {
              frequency: outcomes.length,
              dataPoints: [avg, median, ...outcomes],
              trend,
              consistency,
            },
            sourceEpisodeIds: cluster.episodes
              .filter((ep) => ep.context.outcome?.metric === cluster.commonOutcomeMetric)
              .map((ep) => ep.id),
          });
        }
      }
    }

    // Pattern 3: Context-based (if all episodes share campaign/stage characteristics)
    if (cluster.commonStage && cluster.episodes.length >= 3) {
      const successCount = cluster.episodes.filter(
        (ep) => ep.context.outcome && (ep.context.outcome.direction === 'increase' || !ep.context.outcome.direction)
      ).length;

      const successRate = successCount / cluster.episodes.length;
      if (successRate >= 0.7) {
        results.push({
          pattern: `Stage '${cluster.commonStage}' has ${(successRate * 100).toFixed(0)}% positive outcomes`,
          confidence: 0.65 + successRate * 0.25,
          evidence: {
            frequency: cluster.episodes.length,
            dataPoints: [successCount, cluster.episodes.length],
            consistency: successRate,
          },
          sourceEpisodeIds: cluster.episodes.map((ep) => ep.id),
        });
      }
    }

    return results;
  }

  /**
   * Detect procedural patterns: workflows that work consistently.
   */
  private detectProceduralPatterns(
    cluster: EpisodeCluster
  ): Array<{
    procedure: string;
    successRate: number;
    executionCount: number;
    successCount: number;
    category: string;
    recentSuccesses: string[];
    sourceEpisodeIds: string[];
    knownLimitations?: string[];
  }> {
    const results: Array<{
      procedure: string;
      successRate: number;
      executionCount: number;
      successCount: number;
      category: string;
      recentSuccesses: string[];
      sourceEpisodeIds: string[];
      knownLimitations?: string[];
    }> = [];

    // Only create procedural if we have engagement data showing this pattern was acted upon
    const store = this.memoryService.getStore();

    // Group episodes by "input pattern" (what user selected/configured)
    const procedurePatterns = new Map<string, EpisodicMemory[]>();

    cluster.episodes.forEach((ep) => {
      const inputKey = JSON.stringify(ep.context.userInputs || {});
      if (!procedurePatterns.has(inputKey)) {
        procedurePatterns.set(inputKey, []);
      }
      procedurePatterns.get(inputKey)!.push(ep);
    });

    // For each input pattern, check if it has high success rate and engagement
    procedurePatterns.forEach((episodes, inputKey) => {
      if (episodes.length < 2) return; // Too few examples

      // Count successes
      const successCount = episodes.filter((ep) => {
        // Success = outcome shows positive direction OR was acted upon
        const hasPositiveOutcome =
          ep.context.outcome?.direction === 'increase' ||
          (ep.context.outcome?.direction === undefined && ep.context.outcome?.value !== 0);
        const wasActedUpon = ep.wasActedUpon ?? false;
        return hasPositiveOutcome || wasActedUpon;
      }).length;

      const successRate = successCount / episodes.length;

      if (successRate >= this.config.proceduralSuccessThreshold) {
        // Check engagement: was this pattern actually used by agents?
        const engagementCount = store.engagementLog.filter((entry) =>
          episodes.map((e) => e.id).includes(entry.memoryId)
        ).length;

        if (engagementCount > 0) {
          const recentSuccesses = episodes
            .filter((ep) => {
              const outcome = ep.context.outcome?.direction === 'increase';
              return outcome || ep.wasActedUpon;
            })
            .slice(-3)
            .map((ep) => ep.createdAt);

          results.push({
            procedure: `Apply user inputs: ${inputKey} (${successRate * 100}% success rate)`,
            successRate,
            executionCount: episodes.length,
            successCount,
            category: 'workflow-preference',
            recentSuccesses,
            sourceEpisodeIds: episodes.map((ep) => ep.id),
            knownLimitations: undefined,
          });
        }
      }
    });

    return results;
  }

  /**
   * Explain why a pattern has its confidence score.
   */
  private explainConfidence(pattern: PatternDetectionResult): string {
    const { frequency, consistency } = pattern.evidence;

    if (frequency >= 5 && consistency > 0.8) {
      return `${frequency} consistent observations, highly regular`;
    } else if (frequency >= 3 && consistency > 0.6) {
      return `${frequency} observations, consistent trend`;
    } else {
      return `${frequency} observations, moderate consistency (${(consistency * 100).toFixed(0)}%)`;
    }
  }

  /**
   * Calculate TTL based on trend direction.
   * - Increasing trends: longer TTL (pattern is strengthening)
   * - Stable: standard TTL
   * - Decreasing: shorter TTL (pattern may be changing)
   */
  private calculateTTL(trend?: 'increasing' | 'decreasing' | 'stable'): number {
    switch (trend) {
      case 'increasing':
        return 120; // 4 months
      case 'decreasing':
        return 45; // 6 weeks
      case 'stable':
      default:
        return 90; // 3 months (default)
    }
  }

  /**
   * Detect trend in numeric sequence.
   */
  private detectTrend(
    values: number[]
  ): 'increasing' | 'decreasing' | 'stable' | undefined {
    if (values.length < 3) return undefined;

    // Simple linear regression approach
    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (Math.abs(slope) < 0.5) {
      return 'stable';
    } else if (slope > 0) {
      return 'increasing';
    } else {
      return 'decreasing';
    }
  }

  /**
   * Calculate standard deviation.
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Factory for creating consolidation engine.
 */
export function createConsolidationEngine(
  memoryService: MemoryService,
  config: ConsolidationConfig
): ConsolidationEngine {
  return new ConsolidationEngine(memoryService, config);
}
