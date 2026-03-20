/**
 * Memory Service
 *
 * Core operations for the MVP memory system:
 * - CRUD for episodic/semantic/procedural memories
 * - Consolidation logic (episodic → semantic)
 * - Engagement tracking (coactive feedback)
 * - Retrieval with hybrid search
 * - Confidence scoring and decay
 */

import type {
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  ConsolidationEvent,
  EngagementLogEntry,
  MemoryStore,
  MemoryRetrievalRequest,
  MemoryRetrievalResult,
  ConsolidationConfig,
  MemoryFeedback,
} from '../types/memory';

/**
 * In-memory and IndexedDB-backed memory service.
 * For MVP: in-memory with optional persistence to IndexedDB.
 */
export class MemoryService {
  private store: MemoryStore;
  private consolidationConfig: ConsolidationConfig;
  private consolidationScheduler?: ReturnType<typeof setInterval>;
  private lastConsolidationCheck: number = Date.now();

  constructor(initialStore?: MemoryStore, config?: Partial<ConsolidationConfig>) {
    this.store = initialStore || {
      episodic: [],
      semantic: [],
      procedural: [],
      consolidationHistory: [],
      engagementLog: [],
      metadata: {
        lastConsolidationAt: new Date().toISOString(),
        totalMemoriesCount: 0,
      },
    };

    this.consolidationConfig = {
      minEpisodesForConsolidation: 3,
      lookbackDays: 90,
      minConfidenceForSemantic: 0.65,
      maxEpisodicAge: 30,
      semanticTtlDays: 90,
      proceduralSuccessThreshold: 0.75,
      ...config,
    };

    // Start consolidation scheduler (runs weekly)
    this.startConsolidationScheduler();
  }

  /**
   * Create a new episodic memory from an interaction event.
   * Baseline confidence: 0.5 (single observation).
   */
  createEpisodicMemory(input: {
    campaignId: string;
    stage: string;
    action: string;
    outcome?: { metric: string; value: number | string; direction?: 'increase' | 'decrease' };
    userInputs?: Record<string, unknown>;
    content: string;
    tags: string[];
  }): EpisodicMemory {
    const id = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    const episodic: EpisodicMemory = {
      id,
      type: 'episodic',
      content: input.content,
      confidence: 0.5, // New episodic always starts at 0.5
      source: 'interaction',
      createdAt: now,
      eventTimestamp: now,
      tags: input.tags,
      accessCount: 0,
      relatedIds: [],
      campaignId: input.campaignId,
      stage: input.stage,
      context: {
        campaignId: input.campaignId,
        stage: input.stage,
        action: input.action,
        outcome: input.outcome,
        userInputs: input.userInputs,
      },
      wasActedUpon: false,
    };

    this.store.episodic.push(episodic);
    this.store.metadata.totalMemoriesCount++;
    // Cap episodic store at 500 entries — evict oldest when over limit
    const MAX_EPISODIC = 500;
    if (this.store.episodic.length > MAX_EPISODIC) {
      this.store.episodic = this.store.episodic.slice(-MAX_EPISODIC);
    }
    return episodic;
  }

  /**
   * Create a new semantic memory from consolidation.
   * Confidence determined by evidence (typically 0.65-0.95).
   */
  createSemanticMemory(input: {
    claim: string;
    content: string;
    domain: string;
    episodeCount: number;
    sourceEpisodeIds: string[];
    dataPoints: (number | string)[];
    confidenceReason: string;
    tags: string[];
    ttlDays?: number;
    relatedIds?: string[];
  }): SemanticMemory {
    // Validate minimum episodes for semantic consolidation
    if (input.episodeCount < 3) {
      throw new Error(`Insufficient episodes for semantic consolidation: need 3+, got ${input.episodeCount}`);
    }

    const id = `sem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    // Confidence scoring for semantic:
    // 3 episodes: 0.65, 4-7 episodes: 0.70-0.80, 8+: 0.85-0.95
    const baseConfidence = 0.60 + Math.max(0, input.episodeCount - 2) * 0.05;
    const confidence = Math.min(0.95, baseConfidence);

    const semantic: SemanticMemory = {
      id,
      type: 'semantic',
      claim: input.claim,
      content: input.content,
      confidence,
      source: 'consolidation',
      createdAt: now,
      consolidatedAt: now,
      tags: input.tags,
      accessCount: 0,
      relatedIds: input.relatedIds || [],
      evidence: {
        episodeCount: input.episodeCount,
        sourceEpisodeIds: input.sourceEpisodeIds,
        dataPoints: input.dataPoints,
        confidenceReason: input.confidenceReason,
      },
      domain: input.domain,
      ttlDays: input.ttlDays || this.consolidationConfig.semanticTtlDays,
      expiresAt: new Date(Date.now() + (input.ttlDays || 90) * 24 * 60 * 60 * 1000).toISOString(),
    };

    this.store.semantic.push(semantic);
    this.store.metadata.totalMemoriesCount++;

    // Record consolidation event
    this.recordConsolidation({
      consolidationType: 'episodic-to-semantic',
      sourceEpisodeIds: input.sourceEpisodeIds,
      resultingMemoryId: id,
      compressionRatio: Math.max(2, input.episodeCount * 1.5), // Typical compression
      deduplicatedCount: input.episodeCount - 1,
      method: 'semantic-clustering',
      resultingConfidence: confidence,
    });

    return semantic;
  }

  /**
   * Create a new procedural memory from validated workflow.
   * Confidence: 0.8+ (only after field testing).
   */
  createProceduralMemory(input: {
    procedure: string;
    content: string;
    category: string;
    applicabilityTags: string[];
    successCount: number;
    executionCount: number;
    recentSuccesses: string[];
    backingSemanticIds: string[];
    tags: string[];
    knownLimitations?: string[];
  }): ProceduralMemory {
    // Validate at least one success before creating procedural memory
    if (input.successCount === 0 || input.executionCount === 0) {
      throw new Error(`Cannot create procedural memory with 0 successes: ${input.successCount}/${input.executionCount}`);
    }

    // Clamp successCount to executionCount to prevent invalid successRate > 1
    const clampedSuccessCount = Math.min(input.successCount, input.executionCount);

    const id = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    const successRate = clampedSuccessCount / input.executionCount;

    const procedural: ProceduralMemory = {
      id,
      type: 'procedural',
      procedure: input.procedure,
      content: input.content,
      confidence: Math.min(0.95, 0.75 + successRate * 0.2), // 0.75-0.95 based on success rate
      source: 'interaction',
      createdAt: now,
      lastValidatedAt: now,
      tags: input.tags,
      accessCount: 0,
      relatedIds: [],
      validation: {
        executionCount: input.executionCount,
        successCount: clampedSuccessCount,
        successRate,
        recentSuccesses: input.recentSuccesses,
        knownLimitations: input.knownLimitations,
      },
      backingSemanticIds: input.backingSemanticIds,
      category: input.category,
      applicabilityTags: input.applicabilityTags,
    };

    this.store.procedural.push(procedural);
    this.store.metadata.totalMemoriesCount++;
    return procedural;
  }

  /**
   * Log that a memory was retrieved and potentially acted upon.
   * Used to track implicit signals for confidence updates.
   * Throws if memory doesn't exist to prevent stale references.
   */
  logEngagement(input: {
    memoryId: string;
    stage: string;
    agent: string;
    campaignId: string;
    wasActedUpon: boolean;
    outcome?: { description: string; metric?: string; value?: number | string };
    userRating?: number;
  }): EngagementLogEntry {
    // Validate memory exists before logging
    const memory = this.getMemoryById(input.memoryId);
    if (!memory) {
      throw new Error(`Cannot log engagement: memory ${input.memoryId} does not exist`);
    }

    const id = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const entry: EngagementLogEntry = {
      id,
      memoryId: input.memoryId,
      retrievalContext: {
        stage: input.stage,
        agent: input.agent,
        campaignId: input.campaignId,
      },
      wasActedUpon: input.wasActedUpon,
      outcome: input.outcome,
      timestamp: new Date().toISOString(),
      userRating: input.userRating,
    };

    this.store.engagementLog.push(entry);

    // Update the memory's access count and lastUsedAt
    memory.accessCount++;
    memory.lastUsedAt = entry.timestamp;

    // Mark episodic as acted upon if applicable
    if (memory.type === 'episodic' && input.wasActedUpon) {
      (memory as EpisodicMemory).wasActedUpon = true;
    }

    return entry;
  }

  /**
   * Retrieve relevant memories using hybrid search (metadata + optional semantic text).
   * Sorts by relevance score combining confidence, recency, and frequency.
   */
  retrieveMemories(request: MemoryRetrievalRequest): MemoryRetrievalResult[] {
    const now = new Date();
    const results: MemoryRetrievalResult[] = [];

    // Gather all memories
    const allMemories = [
      ...this.store.episodic,
      ...this.store.semantic,
      ...this.store.procedural,
    ];

    // Filter
    const filtered = allMemories.filter((memory) => {
      // Type filter
      if (request.types && !request.types.includes(memory.type)) return false;

      // Confidence filter
      if (request.minConfidence && memory.confidence < request.minConfidence) return false;

      // Tags filter (AND logic: all requested tags must be present)
      if (request.tags && request.tags.length > 0) {
        const hasAllTags = request.tags.every((tag) => memory.tags.includes(tag));
        if (!hasAllTags) return false;
      }

      // Source filter
      if (request.sources && !request.sources.includes(memory.source)) return false;

      // Recency filter
      if (request.recentDays) {
        const ageMs = now.getTime() - new Date(memory.createdAt).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays > request.recentDays) return false;
      }

      // Campaign context (soft filter, affects scoring but not inclusion)
      // Stage context (soft filter, affects scoring but not inclusion)

      return true;
    });

    // Score and rank
    filtered.forEach((memory) => {
      // Base relevance from confidence
      let relevance = memory.confidence;

      // Apply TTL decay for semantic memories
      if (memory.type === 'semantic') {
        const semantic = memory as SemanticMemory;
        if (semantic.expiresAt && new Date(semantic.expiresAt) < now) {
          // Memory has expired: reduce relevance by 50%
          relevance *= 0.5;
        }
      }

      // Boost recent memories
      const ageMs = now.getTime() - new Date(memory.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.max(0, 1 - ageDays / 180); // 180-day decay
      relevance += recencyBoost * 0.2;

      // Boost frequently accessed memories
      const frequencyBoost = Math.min(0.2, memory.accessCount * 0.02);
      relevance += frequencyBoost;

      // Boost if from current campaign context
      if (
        request.campaignId &&
        memory.campaignId === request.campaignId
      ) {
        relevance += 0.15;
      }

      // Boost if from current stage context
      if (request.stage && memory.stage === request.stage) {
        relevance += 0.1;
      }

      // Clamp to 0-1
      relevance = Math.min(1, relevance);

      const retrievalReason =
        memory.type === 'semantic'
          ? `Consolidated from ${(memory as SemanticMemory).evidence.episodeCount} observations`
          : memory.type === 'procedural'
            ? `Validated workflow (${((memory as ProceduralMemory).validation.successRate * 100).toFixed(0)}% success)`
            : 'Specific interaction from history';

      results.push({
        memory,
        relevanceScore: relevance,
        retrievalReason,
        relatedMemories: memory.relatedIds,
      });
    });

    // Sort by relevance (or other criteria)
    if (request.sortBy === 'confidence') {
      results.sort((a, b) => b.memory.confidence - a.memory.confidence);
    } else if (request.sortBy === 'recency') {
      results.sort(
        (a, b) =>
          new Date(b.memory.lastUsedAt || b.memory.createdAt).getTime() -
          new Date(a.memory.lastUsedAt || a.memory.createdAt).getTime()
      );
    } else if (request.sortBy === 'frequency') {
      results.sort((a, b) => b.memory.accessCount - a.memory.accessCount);
    } else {
      // Default: relevance
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    return results.slice(0, request.limit || 10);
  }

  /**
   * Record a consolidation event in the audit trail.
   */
  private recordConsolidation(input: {
    consolidationType: 'episodic-to-semantic' | 'semantic-refinement' | 'procedural-validation';
    sourceEpisodeIds: string[];
    resultingMemoryId: string;
    compressionRatio: number;
    deduplicatedCount: number;
    method: 'frequency-based' | 'semantic-clustering' | 'validation-triggered' | 'decay-based';
    resultingConfidence: number;
    consolidationNotes?: string;
  }): void {
    const event: ConsolidationEvent = {
      id: `cons_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      consolidationType: input.consolidationType,
      sourceEpisodeIds: input.sourceEpisodeIds,
      resultingMemoryId: input.resultingMemoryId,
      compressionRatio: input.compressionRatio,
      deduplicatedCount: input.deduplicatedCount,
      method: input.method,
      timestamp: new Date().toISOString(),
      triggeredBy: 'consolidation-job',
      consolidationNotes: input.consolidationNotes,
      resultingConfidence: input.resultingConfidence,
    };

    this.store.consolidationHistory.push(event);
    this.store.metadata.lastConsolidationAt = event.timestamp;
  }

  /**
   * Apply user/system feedback to update memory confidence.
   * Positive feedback boosts confidence, negative triggers review.
   */
  applyFeedback(feedback: MemoryFeedback): void {
    const memory = this.getMemoryById(feedback.memoryId);
    if (!memory) return;

    // Adjust confidence using exponential moving average (EMA)
    // EMA = old_conf * α + feedback_signal * (1 - α)
    // where α = 0.95 (conservative: recent feedback gets 5% weight)
    const EMA_DECAY = 0.95;

    // Clamp rating to valid range [-1, 1] to prevent confidence escaping bounds
    const clampedRating = Math.max(-1, Math.min(1, feedback.rating));

    if (feedback.feedbackType === 'usefulness' || feedback.feedbackType === 'accuracy' || feedback.feedbackType === 'relevance') {
      // Convert -1..1 rating to 0..1 signal
      const feedbackSignal = (clampedRating + 1) / 2;
      // Apply EMA: weight old confidence 95%, new feedback 5%
      memory.confidence = memory.confidence * EMA_DECAY + feedbackSignal * (1 - EMA_DECAY);
      // Clamp to valid range
      memory.confidence = Math.max(0, Math.min(1, memory.confidence));
    }

    // Flag-for-removal is handled separately (aggressive decay)
    if (feedback.feedbackType === 'flag-for-removal') {
      // Rapid decay for flagged memories: use signal 0.2 instead
      memory.confidence = memory.confidence * EMA_DECAY + 0.2 * (1 - EMA_DECAY);
      memory.confidence = Math.max(0, memory.confidence);
    }

  }

  /**
   * Get a memory by ID (any type).
   */
  getMemoryById(id: string): EpisodicMemory | SemanticMemory | ProceduralMemory | undefined {
    return (
      this.store.episodic.find((m) => m.id === id) ||
      this.store.semantic.find((m) => m.id === id) ||
      this.store.procedural.find((m) => m.id === id)
    );
  }

  /**
   * Update memory (partial).
   */
  updateMemory(
    id: string,
    updates: Partial<EpisodicMemory | SemanticMemory | ProceduralMemory>
  ): void {
    const memory = this.getMemoryById(id);
    if (memory) {
      Object.assign(memory, updates);
    }
  }

  /**
   * Delete a memory (hard delete for MVP, can be soft delete later).
   */
  deleteMemory(id: string): boolean {
    // First, clean up all relatedIds references to prevent circular refs
    const allMemories = [...this.store.episodic, ...this.store.semantic, ...this.store.procedural];
    allMemories.forEach((m) => {
      m.relatedIds = m.relatedIds.filter(rid => rid !== id);
    });

    // Then delete the memory itself
    const episodicIndex = this.store.episodic.findIndex((m) => m.id === id);
    if (episodicIndex !== -1) {
      this.store.episodic.splice(episodicIndex, 1);
      this.store.metadata.totalMemoriesCount--;
      // Persistence would go here (IndexedDB, localStorage, etc)
      return true;
    }

    const semanticIndex = this.store.semantic.findIndex((m) => m.id === id);
    if (semanticIndex !== -1) {
      this.store.semantic.splice(semanticIndex, 1);
      this.store.metadata.totalMemoriesCount--;
      // Persistence would go here (IndexedDB, localStorage, etc)
      return true;
    }

    const proceduralIndex = this.store.procedural.findIndex((m) => m.id === id);
    if (proceduralIndex !== -1) {
      this.store.procedural.splice(proceduralIndex, 1);
      this.store.metadata.totalMemoriesCount--;
      // Persistence would go here (IndexedDB, localStorage, etc)
      return true;
    }

    return false;
  }

  /**
   * Get the full store state (for persistence/debugging).
   */
  getStore(): MemoryStore {
    return this.store;
  }

  /**
   * Load a store state (from IndexedDB or export).
   */
  loadStore(store: MemoryStore): void {
    this.store = store;
  }

  /**
   * Get engagement statistics for a memory.
   */
  getEngagementStats(memoryId: string): {
    totalRetrievals: number;
    timesActedUpon: number;
    averageUserRating: number | null;
    lastRetrievedAt: string | null;
  } {
    const entries = this.store.engagementLog.filter((e) => e.memoryId === memoryId);

    return {
      totalRetrievals: entries.length,
      timesActedUpon: entries.filter((e) => e.wasActedUpon).length,
      averageUserRating:
        entries.filter((e) => e.userRating !== undefined).length > 0
          ? entries
              .filter((e) => e.userRating !== undefined)
              .reduce((sum, e) => sum + (e.userRating || 0), 0) /
            entries.filter((e) => e.userRating !== undefined).length
          : null,
      lastRetrievedAt: entries.length > 0 ? entries[entries.length - 1].timestamp : null,
    };
  }

  /**
   * Start the weekly consolidation scheduler.
   * Runs consolidation check every 7 days.
   */
  private startConsolidationScheduler(): void {
    if (typeof window === 'undefined') return; // Skip in non-browser environments

    // Check consolidation every 24 hours, but only run if 7+ days since last consolidation
    this.consolidationScheduler = setInterval(() => {
      const now = Date.now();
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

      if (now - this.lastConsolidationCheck >= oneWeekMs) {
        try {
          this.runConsolidationJob();
          this.lastConsolidationCheck = now;
          this.store.metadata.lastConsolidationAt = new Date().toISOString();
          // Persistence would go here (IndexedDB, localStorage, etc)
        } catch (error) {
          console.warn('[MemoryService] Consolidation job failed:', error);
        }
      }
    }, 24 * 60 * 60 * 1000); // Check daily
  }

  /**
   * Stop the consolidation scheduler (cleanup).
   */
  stopConsolidationScheduler(): void {
    if (this.consolidationScheduler) {
      clearInterval(this.consolidationScheduler);
      this.consolidationScheduler = undefined;
    }
  }

  /**
   * Manually trigger a consolidation job now (useful for testing/forcing).
   */
  triggerConsolidationNow(): ConsolidationEvent[] {
    try {
      const events = this.runConsolidationJob();
      this.lastConsolidationCheck = Date.now();
      this.store.metadata.lastConsolidationAt = new Date().toISOString();
      // Persistence would go here (IndexedDB, localStorage, etc)
      return events;
    } catch (error) {
      console.error('[MemoryService] Manual consolidation failed:', error);
      return [];
    }
  }

  /**
   * Consolidation job: batch-process episodic memories weekly.
   * Identifies patterns and creates semantic/procedural memories.
   *
   * This is a stub for MVP — real implementation would:
   * 1. Cluster similar episodic memories
   * 2. Extract common patterns
   * 3. Generate semantic claims with evidence
   * 4. Link to procedural if validated
   */
  runConsolidationJob(): ConsolidationEvent[] {
    const events: ConsolidationEvent[] = [];
    const now = new Date();

    // Get episodic memories older than min age but not yet consolidated
    const candidateEpisodes = this.store.episodic.filter((ep) => {
      if (ep.consolidatedAt) return false; // Already consolidated

      const ageMs = now.getTime() - new Date(ep.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      return ageDays >= 1; // At least 1 day old for MVP
    });

    // Group by domain/tag for clustering
    const grouped = new Map<string, EpisodicMemory[]>();
    candidateEpisodes.forEach((ep) => {
      const key = ep.tags.slice(0, 1).join('|') || 'general';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(ep);
    });

    // Consolidate each group if it has enough members
    grouped.forEach((episodes, domain) => {
      if (episodes.length >= this.consolidationConfig.minEpisodesForConsolidation) {
        // Create semantic memory summarizing the group
        this.createSemanticMemory({
          claim: `Pattern from ${episodes.length} interactions in ${domain}`,
          content: `Consolidated observation: ${episodes.map((e) => e.content).join(' | ')}`,
          domain,
          episodeCount: episodes.length,
          sourceEpisodeIds: episodes.map((e) => e.id),
          dataPoints: episodes
            .map((e) => e.context.outcome?.value)
            .filter((v): v is number | string => v !== undefined),
          confidenceReason: `${episodes.length} consistent observations`,
          tags: episodes[0]?.tags || [],
          relatedIds: episodes.map((e) => e.id),
        });

        // Mark episodic memories as consolidated
        episodes.forEach((ep) => {
          ep.consolidatedAt = new Date().toISOString();
        });

        events.push(...this.store.consolidationHistory.slice(-1)); // Last recorded event
      }
    });

    return events;
  }
}

/**
 * Singleton instance for application-wide use.
 */
let memoryServiceInstance: MemoryService | null = null;

export function getMemoryService(): MemoryService {
  if (!memoryServiceInstance) {
    memoryServiceInstance = new MemoryService();
  }
  return memoryServiceInstance;
}

export function initializeMemoryService(store?: MemoryStore, config?: Partial<ConsolidationConfig>): MemoryService {
  // Stop previous instance's scheduler to prevent leaked intervals
  if (memoryServiceInstance) {
    memoryServiceInstance.stopConsolidationScheduler();
  }
  memoryServiceInstance = new MemoryService(store, config);
  return memoryServiceInstance;
}
