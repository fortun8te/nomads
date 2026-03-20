/**
 * consolidationTypes.ts
 *
 * Type definitions for the memory consolidation system.
 * Extends base Memory type with consolidation-specific fields.
 */

/**
 * Extended Memory type with consolidation metadata.
 * Consolidation tracks the provenance of semantic memories (which episodics they came from)
 * and includes confidence scores for ranking.
 */
export interface ConsolidatedMemory {
  // Base Memory fields
  id: string;
  type: 'general' | 'user' | 'campaign' | 'research';
  content: string;
  tags: string[];
  createdAt: string;           // ISO timestamp
  lastAccessedAt: string;      // ISO timestamp
  accessCount: number;

  // Consolidation-specific fields
  isArchived?: boolean;        // Episodic memories marked archived post-compression
  relatedIds?: string[];       // IDs of episodic memories that were consolidated into this semantic
  confidenceScore?: number;    // 0–1, reflects certainty of semantic synthesis
  consolidatedAt?: string;     // ISO timestamp when semantic was created
  evidenceCount?: number;      // Number of episodic memories that informed this semantic
}

/**
 * A group of episodic memories ready for compression.
 */
export interface MemoryGroup {
  tag: string;                           // Primary grouping tag (e.g., "supplement-angles")
  primaryMemories: Array<{
    id: string;
    content: string;
    tags: string[];
    createdAt: string;
  }>;                                    // Core 2–10 memories in this group
  secondaryMemories?: Array<{
    id: string;
    content: string;
    tags: string[];
  }>;                                    // Related memories (optional, from semantic clustering)
  semanticTheme?: string;                // Inferred theme across group (e.g., "objection-handling patterns")
}

/**
 * Result of compressing a single memory group into a semantic memory.
 */
export interface CompressionResult {
  success: boolean;
  group: MemoryGroup;
  semantic?: ConsolidatedMemory;         // Newly created semantic (if success: true)
  archivedIds: string[];                 // IDs marked as archived
  error?: string;                        // Failure reason (if success: false)
  tokensUsed?: number;                   // Compression agent tokens consumed
  executionTimeMs?: number;              // Milliseconds to compress this group
}

/**
 * Summary of a consolidation run (groups compressed, archiving metrics, context reduction).
 */
export interface ConsolidationResult {
  triggeredBy: 'schedule' | 'threshold' | 'manual';
  startedAt: string;                     // ISO timestamp
  completedAt: string;                   // ISO timestamp
  totalEpisodicMemories: number;         // Count before consolidation
  groupsProcessed: number;               // Number of groups created
  successfulCompressions: number;        // Number of successful compressions
  failedCompressions: number;            // Number of failed compressions
  totalEpisodicArchived: number;         // Total episodic memories archived
  newSemanticMemoriesCreated: number;    // Number of new semantic memories added
  contextReductionPercent: number;       // Estimated % reduction in memory context size
  compressionResults: CompressionResult[]; // Per-group results (for debugging)
  error?: string;                        // Overall consolidation error (if any)
}

/**
 * Audit trail entry: records each consolidation run for history/debugging.
 */
export interface ConsolidationHistory {
  id: string;                            // Unique ID for this consolidation run
  cycleId: string;                       // Cycle ID during which consolidation ran (or 'manual')
  consolidationResult: ConsolidationResult; // Full result of the consolidation
  savedAt: string;                       // ISO timestamp when recorded
}

/**
 * Configuration for consolidation behavior.
 */
export interface ConsolidationConfig {
  // Grouping
  minGroupSize: number;                  // Minimum memories in a group for compression (default: 2)
  maxGroupSize: number;                  // Maximum memories in a group before splitting (default: 10)

  // Triggering
  episodicThreshold: number;             // Trigger consolidation at N episodic memories (default: 50)
  scheduleIntervalDays: number;          // Trigger consolidation every N days (default: 7)

  // Quality control
  minConfidenceThreshold: number;        // Reject semantic if confidence < N (default: 0.4)
  compressionModel: string;              // Model for compression (default: 'qwen3.5:2b')
  compressionMaxTokens: number;          // Max output tokens for compression (default: 300)

  // Storage
  historyRetention: number;              // Keep last N consolidation records (default: 12)
}

/**
 * State of the consolidation hook (useConsolidation).
 */
export interface ConsolidationState {
  isRunning: boolean;                    // Currently consolidating?
  result: ConsolidationResult | null;    // Last consolidation result
  error: string | null;                  // Last error (if any)
  progress: {
    currentGroup: number;                // Current group being compressed (0-indexed)
    totalGroups: number;                 // Total groups to process
    currentStatus: string;               // Human-readable status message
  };
}

/**
 * Return type of useConsolidation hook.
 */
export interface UseConsolidationReturn {
  consolidationState: ConsolidationState;
  triggerConsolidation: (manual?: boolean) => Promise<void>; // Manually trigger consolidation
  resetState: () => void;                // Reset state to initial
  shouldAutoTrigger: boolean;            // Whether consolidation should auto-trigger
}
