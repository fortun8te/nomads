/**
 * Enhanced MVP Memory System for Nomads
 *
 * Cognitive Architecture:
 * - EpisodicMemory: Specific events with full context (raw data)
 * - SemanticMemory: Generalized patterns extracted from episodes (compressed knowledge)
 * - ProceduralMemory: Learned workflows and preferences (behavioral patterns)
 *
 * Consolidation Flow:
 * 1. Episodic memories accumulate as interactions occur
 * 2. Weekly consolidation job identifies patterns across episodes
 * 3. High-confidence patterns → SemanticMemory with backing evidence
 * 4. ProceduralMemory captures learned workflows from successful patterns
 *
 * Confidence Scoring:
 * - Episodic (0.5): Single observation, may be noise or outlier
 * - Semantic (0.6-0.95): Consolidated from 2-10+ episodes, evidence-backed
 * - Procedural (0.8+): Demonstrated success pattern, workflow-validated
 *
 * Vector Integration Ready:
 * - embedding field supports future semantic search
 * - tags enable hybrid search (semantic + metadata)
 * - relatedIds enable memory graph traversal
 */

/**
 * Base memory properties shared across all memory types
 */
export interface BaseMemory {
  /** Unique identifier for this memory */
  id: string;

  /** Content stored as narrative text (human-readable, LLM-processable) */
  content: string;

  /** Optional embedding vector for semantic search (Future: populated by consolidation) */
  embedding?: Float32Array;

  /** Confidence score 0-1. Higher = more reliable for agent retrieval */
  confidence: number;

  /** Origin of this memory */
  source: 'user' | 'interaction' | 'consolidation' | 'feedback';

  /** When this memory was created (ISO 8601) */
  createdAt: string;

  /** Searchable tags for hybrid queries (e.g., "supplement", "objection-handling", "conversion") */
  tags: string[];

  /** How many times this memory has been retrieved by agents */
  accessCount: number;

  /** Most recent retrieval timestamp (ISO 8601) */
  lastUsedAt?: string;

  /** IDs of related memories (enables graph traversal without full joins) */
  relatedIds: string[];

  /** Metadata: which campaign/cycle this originated from */
  campaignId?: string;

  /** Metadata: which stage generated this memory */
  stage?: string;
}

/**
 * EPISODIC MEMORY
 *
 * Represents specific, dated events with full context.
 * Raw observations from interactions.
 *
 * Examples:
 * - "User selected 'Extended' research preset for collagen campaign"
 * - "Taste stage recommended blue/white palette; user approved without revision"
 * - "Objection-handling approach reduced bounce by 12% in A/B test"
 *
 * Confidence: 0.5 (single observation, no validation yet)
 * Consolidation: After 2+ similar episodes, semantic memory is created
 */
export interface EpisodicMemory extends BaseMemory {
  type: 'episodic';

  /**
   * Timestamp of the event itself (when the interaction occurred).
   * May differ from createdAt if memory was logged retroactively.
   */
  eventTimestamp: string;

  /**
   * Structured context captured at moment of event.
   * Preserves raw data for later consolidation.
   */
  context: {
    /** What campaign/cycle was active */
    campaignId: string;
    /** Which stage of the cycle */
    stage: string;
    /** What the user or system did */
    action: string;
    /** Measurable outcome if applicable */
    outcome?: {
      metric: string;
      value: number | string;
      direction?: 'increase' | 'decrease';
    };
    /** User inputs/choices made */
    userInputs?: Record<string, unknown>;
  };

  /**
   * Was this memory subsequently used to influence decisions?
   * Updated when engagement log marks this memory as "acted upon"
   */
  wasActedUpon?: boolean;

  /** When this episodic memory was last consolidated (moved to semantic) */
  consolidatedAt?: string;
}

/**
 * SEMANTIC MEMORY
 *
 * Generalized knowledge extracted from multiple episodic memories.
 * Consolidated patterns ready for agent retrieval.
 * Equivalent to "facts" the system has learned.
 *
 * Examples:
 * - "Objection-handling copy outperforms desire-driven by ~18% (5 cycles, confidence 0.78)"
 * - "User prefers visual scouting enabled for supplement/health categories"
 * - "Blue/white palette drives 15% higher engagement in skincare ads (3 tests)"
 *
 * Confidence: 0.6-0.95 (evidence-backed from consolidation)
 * Sources: Always from consolidation process with backing evidence
 */
export interface SemanticMemory extends BaseMemory {
  type: 'semantic';

  /**
   * Core claim or pattern expressed as generalized knowledge.
   * Differs from episodic: no specific dates/campaign IDs, purely the pattern.
   */
  claim: string;

  /**
   * Backing evidence data (what consolidation found).
   * Provides traceability and confidence justification.
   */
  evidence: {
    /** How many episodic memories contributed */
    episodeCount: number;
    /** IDs of episodic memories that were consolidated */
    sourceEpisodeIds: string[];
    /** Specific data points (e.g., percentages, rankings) */
    dataPoints: (number | string)[];
    /** Statistical strength (if available) */
    confidenceReason: string; // e.g. "3 independent tests, consistent trend"
  };

  /**
   * When this semantic memory was created from episodic consolidation (ISO 8601)
   */
  consolidatedAt: string;

  /**
   * Domain classification (helps filter irrelevant memories).
   * Examples: "research-depth", "aesthetic-preference", "messaging-strategy"
   */
  domain: string;

  /**
   * How long this semantic memory should be considered "fresh" (days).
   * After expiry, becomes lower priority for retrieval unless re-confirmed.
   * Defaults to 90 days; can be extended if recently confirmed.
   */
  ttlDays?: number;

  /**
   * Explicit decay target: when should this semantic fact be
   * deprioritized/archived if not re-confirmed? (ISO 8601)
   */
  expiresAt?: string;
}

/**
 * PROCEDURAL MEMORY
 *
 * Learned workflows, preferences, and behavioral patterns.
 * "How to do things" and "what the user prefers".
 * More durable than semantic (high confidence after validation).
 *
 * Examples:
 * - "Research workflow: Extended preset + visual scouting + 4b orchestrator (validated across 8 cycles)"
 * - "Taste stage: Always check red/blue contrast, generate 3 palettes, user picks fastest"
 * - "Objection handling first; then desire-based positioning (user-preferred sequence)"
 *
 * Confidence: 0.8+ (demonstrated success, repeated validation)
 * Source: Interaction or feedback (learns from doing)
 */
export interface ProceduralMemory extends BaseMemory {
  type: 'procedural';

  /**
   * The learned procedure/preference expressed as actionable steps or rules.
   * Unlike semantic (which is a fact), this is prescriptive: "do X, then Y".
   */
  procedure: string;

  /**
   * Validation metrics showing this procedure works.
   * Procedural is only high-confidence after field-testing.
   */
  validation: {
    /** How many times this procedure was executed */
    executionCount: number;
    /** How many times it succeeded */
    successCount: number;
    /** Success rate (0-1) */
    successRate: number;
    /** Timestamps of last 3 successful uses (ISO 8601) */
    recentSuccesses: string[];
    /** Any known failure cases or edge conditions */
    knownLimitations?: string[];
  };

  /**
   * Associated semantic memories that support this procedure.
   * Links procedural back to the "why" (semantic facts).
   * Example: procedural "use Extended preset" links to semantic "Extended yields 25% more insights"
   */
  backingSemanticIds: string[];

  /**
   * When user last explicitly validated/confirmed this procedure.
   * High recentness = higher confidence for retrieval.
   */
  lastValidatedAt: string;

  /**
   * Category of procedure (helps with relevant retrieval).
   * Examples: "workflow-step", "user-preference", "quality-gate", "model-selection"
   */
  category: string;

  /**
   * Applicability scope (when/where this procedure applies).
   * Prevents wrong context reuse.
   * Examples: ["campaign:supplement", "stage:research", "region:US"]
   */
  applicabilityTags: string[];
}

/**
 * CONSOLIDATION HISTORY
 *
 * Immutable log of consolidation events.
 * Tracks which episodic memories were merged/compressed into semantic memories.
 * Provides audit trail and justification for confidence scoring.
 *
 * Used by:
 * - Consolidation job: records what it did
 * - Agent reasoning: "this semantic memory came from X episodes on dates Y, Z"
 * - Debugging: understand confidence/validity chain
 */
export interface ConsolidationEvent {
  /** Unique ID for this consolidation event */
  id: string;

  /** Type of consolidation performed */
  consolidationType: 'episodic-to-semantic' | 'semantic-refinement' | 'procedural-validation';

  /** IDs of episodic memories that were consolidated */
  sourceEpisodeIds: string[];

  /** ID of the resulting semantic or procedural memory */
  resultingMemoryId: string;

  /**
   * Compression ratio: (source episodic bytes) / (result semantic bytes).
   * High ratio = strong consolidation (noisy data reduced to signal).
   * Typical: 3-10x compression from 5-20 episodic memories.
   */
  compressionRatio: number;

  /** How many source memories were deduplicated/merged */
  deduplicatedCount: number;

  /** Consolidation method used (for future ML refinement) */
  method: 'frequency-based' | 'semantic-clustering' | 'validation-triggered' | 'decay-based';

  /** Timestamp when consolidation occurred (ISO 8601) */
  timestamp: string;

  /** Which agent/system triggered this consolidation */
  triggeredBy: string; // e.g. "consolidation-job", "feedback-handler", "manual"

  /** Notes on what pattern was identified */
  consolidationNotes?: string;

  /** Confidence of the resulting memory (copied from result) */
  resultingConfidence: number;
}

/**
 * USER ENGAGEMENT LOG
 *
 * Implicit signal collection: which memories agents retrieved and acted upon.
 * Drives confidence updates and memory ranking.
 *
 * Example row:
 * - Memory: "Objection-handling outperforms by 18%"
 * - Context: Research phase, orchestrator choosing messaging strategy
 * - WasActedUpon: true (orchestrator used this to decide objection-first research)
 * - Timestamp: 2026-03-20T14:32:00Z
 *
 * Used by:
 * - Feedback consolidation: "memory X was acted upon Y times in last 30 days"
 * - Confidence updates: Frequently acted-upon memories ↑ confidence
 * - Decay system: Unused memories → lower priority over time
 */
export interface EngagementLogEntry {
  /** Unique ID for this engagement event */
  id: string;

  /** ID of the memory that was retrieved */
  memoryId: string;

  /**
   * Where was this memory retrieved?
   * Helps understand what type of agent/stage values this memory.
   */
  retrievalContext: {
    /** Which stage of cycle (e.g., "research", "taste", "make") */
    stage: string;
    /** Which agent/system retrieved it (e.g., "orchestrator", "taste-agent", "user") */
    agent: string;
    /** Which campaign/cycle */
    campaignId: string;
  };

  /**
   * Did this memory actually influence the output?
   * True = memory was used to make a decision or shape output
   * False = memory was retrieved but not acted upon (noise in retrieval)
   */
  wasActedUpon: boolean;

  /**
   * If acted upon, what was the outcome?
   * Helps reinforce high-value memories.
   */
  outcome?: {
    /** Description of what happened */
    description: string;
    /** Measurable metric if applicable */
    metric?: string;
    value?: number | string;
  };

  /** When this engagement occurred (ISO 8601) */
  timestamp: string;

  /**
   * Explicit feedback from user on this memory's usefulness.
   * Updated when user reviews/rates memories.
   * Scale: -1 (unhelpful), 0 (neutral), +1 (helpful)
   */
  userRating?: number;
}

/**
 * MEMORY STORE STATE
 *
 * Top-level container for all memory types.
 * Supports efficient indexed queries and batch operations.
 */
export interface MemoryStore {
  episodic: EpisodicMemory[];
  semantic: SemanticMemory[];
  procedural: ProceduralMemory[];
  consolidationHistory: ConsolidationEvent[];
  engagementLog: EngagementLogEntry[];
  /** Metadata about the memory store itself */
  metadata: {
    lastConsolidationAt: string; // When consolidation job last ran
    totalMemoriesCount: number;
    embeddingsPopulatedAt?: string; // When vector embeddings were last computed
  };
}

/**
 * CONSOLIDATION CONFIGURATION
 *
 * Controls how aggressively the system consolidates episodic → semantic.
 * Tuned based on domain and update frequency.
 */
export interface ConsolidationConfig {
  /** Minimum episodic memories before consolidation triggers */
  minEpisodesForConsolidation: number; // Default: 3

  /** Time window to look back for related episodes (days) */
  lookbackDays: number; // Default: 90

  /** Minimum confidence for new semantic memory (0-1) */
  minConfidenceForSemantic: number; // Default: 0.65

  /** How old can an episodic memory be before it's consolidated? (days) */
  maxEpisodicAge: number; // Default: 30

  /** TTL for new semantic memories if not re-confirmed (days) */
  semanticTtlDays: number; // Default: 90

  /** Threshold for "frequent enough to be procedural" (0-1) */
  proceduralSuccessThreshold: number; // Default: 0.75
}

/**
 * MEMORY RETRIEVAL REQUEST
 *
 * Structured query for fetching relevant memories.
 * Supports hybrid search: semantic + metadata filtering.
 */
export interface MemoryRetrievalRequest {
  /** Query text (for future vector semantic search) */
  query?: string;

  /** Filter by memory type */
  types?: Array<'episodic' | 'semantic' | 'procedural'>;

  /** Filter by tags (AND logic) */
  tags?: string[];

  /** Filter by source */
  sources?: Array<'user' | 'interaction' | 'consolidation' | 'feedback'>;

  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;

  /** Recency: only memories from last N days */
  recentDays?: number;

  /** Campaign context (prioritize memories from this campaign) */
  campaignId?: string;

  /** Stage context (prioritize memories from this stage) */
  stage?: string;

  /** Sort order */
  sortBy?: 'confidence' | 'recency' | 'frequency' | 'relevance';

  /** Max results to return */
  limit?: number;
}

/**
 * MEMORY RETRIEVAL RESULT
 *
 * Response from memory query with scoring metadata.
 */
export interface MemoryRetrievalResult {
  /** Retrieved memory (any of the three types) */
  memory: EpisodicMemory | SemanticMemory | ProceduralMemory;

  /** Score used to rank this result (0-1) */
  relevanceScore: number;

  /** Why this memory was retrieved (explanation for agent) */
  retrievalReason: string;

  /** Related memories that give more context */
  relatedMemories: string[]; // IDs of related memories
}

/**
 * MEMORY FEEDBACK
 *
 * User or system feedback on memory quality/usefulness.
 * Used to update confidence and tune consolidation.
 */
export interface MemoryFeedback {
  /** ID of memory being evaluated */
  memoryId: string;

  /** Type of feedback */
  feedbackType: 'usefulness' | 'accuracy' | 'relevance' | 'flag-for-removal';

  /** Rating (-1 to +1) */
  rating: number;

  /** Optional explanation */
  comment?: string;

  /** When feedback was given (ISO 8601) */
  timestamp: string;

  /** Who gave the feedback */
  source: 'user' | 'system' | 'agent';
}
