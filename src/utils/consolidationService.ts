/**
 * consolidationService.ts
 *
 * MVP Memory Consolidation Pipeline
 * ──────────────────────────────────
 * Reduces context bloat (~50% reduction target) by:
 * 1. Clustering episodic memories by tag + semantic similarity
 * 2. Compressing each cluster into a single semantic memory
 * 3. Archiving originals (audit trail) and updating confidence scores
 *
 * Triggered: weekly schedule + manual request + threshold (50+ episodic)
 */

import type { Memory } from './memoryStore'; // Legacy flat type; new code should use types/memory.ts
import { ollamaService } from './ollama';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/**
 * Extended Memory type with consolidation fields
 */
export interface ConsolidatedMemory extends Memory {
  isArchived?: boolean;              // Episodic memories marked as archived after compression
  relatedIds?: string[];             // Original episodic IDs that were consolidated
  confidenceScore?: number;          // 0–1, derived from evidence count
  consolidatedAt?: string;           // ISO timestamp when this semantic memory was created
  evidenceCount?: number;            // # of episodic memories that informed this semantic
}

/**
 * Episodic memories grouped for compression
 */
export interface MemoryGroup {
  tag: string;                       // Primary grouping tag (e.g., "supplement-angles")
  primaryMemories: Memory[];         // Core 2–10 memories in this group
  secondaryMemories?: Memory[];      // Related memories (if semantic clustering available)
  semanticTheme?: string;            // Inferred theme across group (e.g., "objection-handling patterns")
}

/**
 * Result of a consolidation attempt on a single group
 */
export interface CompressionResult {
  success: boolean;
  group: MemoryGroup;
  semantic?: ConsolidatedMemory;     // Newly created semantic memory (if success)
  archivedIds: string[];             // IDs marked archived
  error?: string;                    // Failure reason
  tokensUsed?: number;               // Compression agent tokens
  executionTimeMs?: number;
}

/**
 * Overall consolidation cycle result
 */
export interface ConsolidationResult {
  triggeredBy: 'schedule' | 'threshold' | 'manual';
  startedAt: string;                 // ISO timestamp
  completedAt: string;               // ISO timestamp
  totalEpisodicMemories: number;     // Before consolidation
  groupsProcessed: number;
  successfulCompressions: number;
  failedCompressions: number;
  totalEpisodicArchived: number;
  newSemanticMemoriesCreated: number;
  contextReductionPercent: number;   // Est. % reduction in memory context size
  compressionResults: CompressionResult[];
  error?: string;
}

/**
 * Persistence record for audit trail
 */
export interface ConsolidationHistory {
  id: string;
  cycleId: string;                   // Cycle during which consolidation ran
  consolidationResult: ConsolidationResult;
  savedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const CONSOLIDATION_STORAGE_KEY = 'nomad_consolidation_history';
const EPISODIC_THRESHOLD = 50;      // Trigger compression at 50+ episodic memories
const MIN_GROUP_SIZE = 2;            // Only compress if 2+ memories in group
const MAX_GROUP_SIZE = 10;           // Cap group size for compression (avoid token bloat)
const MIN_CONFIDENCE_THRESHOLD = 0.4; // Reject semantic if confidence < 40%
const COMPRESSION_MODEL = 'qwen3.5:2b'; // Fast, adequate for summarization

// ═══════════════════════════════════════════════════════════════
// Service Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Main consolidation service
 */
export class ConsolidationService {
  /**
   * Check if consolidation should trigger based on:
   * - Weekly schedule
   * - Episodic memory threshold (50+ entries)
   */
  static shouldTriggerConsolidation(allMemories: Memory[]): {
    should: boolean;
    reason?: 'schedule' | 'threshold';
  } {
    // Count episodic memories (infer: non-seed, regular usage)
    const episodic = ConsolidationService.getEpisodicMemories(allMemories);
    if (episodic.length >= EPISODIC_THRESHOLD) {
      return { should: true, reason: 'threshold' };
    }

    // Weekly schedule: check last consolidation timestamp
    const lastConsolidation = this.getLastConsolidationTime();
    if (lastConsolidation === null) {
      // First time running — don't auto-trigger, wait for manual or threshold
      return { should: false };
    }

    const daysSinceLastRun = (Date.now() - lastConsolidation) / (1000 * 60 * 60 * 24);
    if (daysSinceLastRun >= 7) {
      return { should: true, reason: 'schedule' };
    }

    return { should: false };
  }

  /**
   * Main consolidation pipeline:
   * 1. Group episodic memories (by tag, then semantic)
   * 2. Compress each group via LLM
   * 3. Archive originals, record new semantic memories
   * 4. Persist ConsolidationHistory
   */
  static async consolidateWeekly(
    allMemories: Memory[],
    triggeredBy: 'schedule' | 'threshold' | 'manual' = 'manual',
    cycleId?: string
  ): Promise<ConsolidationResult> {
    const startedAt = new Date().toISOString();
    const episodic = this.filterEpisodicForConsolidation(allMemories);
    const totalEpisodicMemories = episodic.length;

    try {
      // ── Phase 1: Grouping ──
      const groups = this.groupEpisodicMemories(episodic);
      console.log(`[Consolidation] Grouped ${episodic.length} episodic → ${groups.length} groups`);

      // ── Phase 2: Compression ──
      const compressionResults: CompressionResult[] = [];
      for (const group of groups) {
        try {
          const result = await this.compressGroup(group);
          compressionResults.push(result);
        } catch (err) {
          compressionResults.push({
            success: false,
            group,
            archivedIds: [],
            error: `Compression failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      // ── Phase 3: Archive + Persist ──
      const successfulCompressions = compressionResults.filter(r => r.success);
      const archivedIds = compressionResults.flatMap(r => r.archivedIds);

      // Update memoryStore: archive originals, add semantics
      this.applyConsolidationChanges(allMemories, compressionResults);
      // (In real implementation: persist to memoryStore)

      // ── Calculate metrics ──
      const newSemanticMemoriesCreated = successfulCompressions.length;
      const contextReductionPercent = this.estimateContextReduction(
        episodic.length,
        archivedIds.length,
        newSemanticMemoriesCreated
      );

      const result: ConsolidationResult = {
        triggeredBy,
        startedAt,
        completedAt: new Date().toISOString(),
        totalEpisodicMemories,
        groupsProcessed: groups.length,
        successfulCompressions: successfulCompressions.length,
        failedCompressions: compressionResults.length - successfulCompressions.length,
        totalEpisodicArchived: archivedIds.length,
        newSemanticMemoriesCreated,
        contextReductionPercent,
        compressionResults,
      };

      // Persist to audit trail
      this.recordConsolidationHistory(result, cycleId);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        triggeredBy,
        startedAt,
        completedAt: new Date().toISOString(),
        totalEpisodicMemories,
        groupsProcessed: 0,
        successfulCompressions: 0,
        failedCompressions: 0,
        totalEpisodicArchived: 0,
        newSemanticMemoriesCreated: 0,
        contextReductionPercent: 0,
        compressionResults: [],
        error: errorMsg,
      };
    }
  }

  /**
   * Group episodic memories by tag, then by semantic similarity
   *
   * Pseudocode:
   * ```
   * FOR EACH unique tag in episodic memories:
   *   - Collect all memories with that tag
   *   - If count > MAX_GROUP_SIZE:
   *       - Sub-cluster by semantic similarity (if embeddings available)
   *       - Else: split alphabetically by first char of content
   *   - Skip groups with < MIN_GROUP_SIZE
   * RETURN array of MemoryGroup
   * ```
   */
  static groupEpisodicMemories(episodic: Memory[]): MemoryGroup[] {
    const tagMap = new Map<string, Memory[]>();

    // 1. Collect by tag
    for (const mem of episodic) {
      for (const tag of mem.tags) {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag)!.push(mem);
      }
    }

    const groups: MemoryGroup[] = [];

    // 2. Process each tag group
    for (const [tag, memories] of tagMap.entries()) {
      if (memories.length < MIN_GROUP_SIZE) continue; // Skip tiny groups

      // 3. Split large groups
      if (memories.length > MAX_GROUP_SIZE) {
        const subGroups = this.subClusterBySemanticOrAlphabet(tag, memories);
        groups.push(...subGroups);
      } else {
        // Infer semantic theme if possible
        const theme = this.inferSemanticTheme(memories);
        groups.push({
          tag,
          primaryMemories: memories,
          semanticTheme: theme,
        });
      }
    }

    return groups;
  }

  /**
   * Compress a group of episodic memories into a single semantic memory
   *
   * Input: Group of 2–10 related memories
   * Output: Single semantic memory with confidence score
   *
   * Pseudocode:
   * ```
   * prompt = buildCompressionPrompt(group.primaryMemories)
   * response = llm(model=qwen3.5:2b, prompt, maxTokens=300)
   * confidence = calculateConfidence(response, group.size)
   * IF confidence < MIN_THRESHOLD:
   *   RETURN { success: false, error: "Low confidence" }
   * semantic = createSemanticMemory(
   *   content: response.summary,
   *   tags: inferTags(response, group.tag),
   *   relatedIds: group.primaryMemories.map(m => m.id),
   *   confidenceScore: confidence,
   *   evidenceCount: group.size
   * )
   * RETURN { success: true, semantic, archivedIds: [...] }
   * ```
   */
  static async compressGroup(group: MemoryGroup): Promise<CompressionResult> {
    const startTime = Date.now();

    try {
      // Validate group size
      if (group.primaryMemories.length < MIN_GROUP_SIZE) {
        return {
          success: false,
          group,
          archivedIds: [],
          error: `Group too small (${group.primaryMemories.length} < ${MIN_GROUP_SIZE})`,
        };
      }

      // Build compression prompt
      const prompt = this.buildCompressionPrompt(group);

      // Call LLM (qwen3.5:2b for speed)
      let compressionText = '';
      let tokensUsed = 0;

      try {
        // Use streaming for token counting
        await ollamaService.generateStream(
          prompt,
          'You are a memory consolidation agent. Synthesize episodic memories into semantic insights.',
          {
            model: COMPRESSION_MODEL,
            temperature: 0.3,
            top_p: 0.9,
            onChunk: (chunk: string) => {
              compressionText += chunk;
            },
          }
        );

        // Estimate token count (rough: ~4 chars per token)
        tokensUsed = Math.ceil(compressionText.length / 4);
      } catch (err) {
        return {
          success: false,
          group,
          archivedIds: [],
          error: `LLM compression failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Parse response and calculate confidence
      const { summary, inferred_tags } = this.parseCompressionResponse(compressionText);
      if (!summary || summary.length < 20) {
        return {
          success: false,
          group,
          archivedIds: [],
          error: 'Compression produced empty or invalid summary',
        };
      }

      const confidence = this.calculateConfidence(
        group.primaryMemories.length,
        compressionText.length,
        group.primaryMemories[0]?.tags || []
      );

      if (confidence < MIN_CONFIDENCE_THRESHOLD) {
        return {
          success: false,
          group,
          archivedIds: [],
          error: `Confidence too low (${confidence.toFixed(2)} < ${MIN_CONFIDENCE_THRESHOLD})`,
        };
      }

      // Create semantic memory
      const semantic: ConsolidatedMemory = {
        id: `sem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'research', // Semantic memories are typically insights
        content: summary,
        tags: [group.tag, ...(inferred_tags || [])],
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        accessCount: 0,
        relatedIds: group.primaryMemories.map(m => m.id),
        confidenceScore: confidence,
        consolidatedAt: new Date().toISOString(),
        evidenceCount: group.primaryMemories.length,
      };

      return {
        success: true,
        group,
        semantic,
        archivedIds: group.primaryMemories.map(m => m.id),
        tokensUsed,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        group,
        archivedIds: [],
        error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Archive a single episodic memory (mark as archived, don't delete)
   * Archived memories are excluded from future consolidation rounds
   * but retained for audit trail
   */
  static archiveEpisodicMemory(id: string, allMemories: Memory[]): Memory[] {
    return allMemories.map(m =>
      m.id === id
        ? { ...m, tags: [...m.tags, 'archived'] }
        : m
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Helper methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Filter out seed/system memories, keep only episodic (user-created or cycle-derived)
   */
  private static filterEpisodicForConsolidation(allMemories: Memory[]): Memory[] {
    return allMemories.filter(m => !this.isSeedMemory(m) && !m.tags.includes('archived'));
  }

  /**
   * Identify seed memories (system-provided on first run)
   */
  private static isSeedMemory(m: Memory): boolean {
    return m.id.startsWith('seed-') || m.id.startsWith('user-context-');
  }

  /**
   * Get episodic memories for consolidation
   */
  static getEpisodicMemories(allMemories: Memory[]): Memory[] {
    return this.filterEpisodicForConsolidation(allMemories);
  }

  /**
   * Sub-cluster large groups by semantic similarity or alphabet
   */
  private static subClusterBySemanticOrAlphabet(tag: string, memories: Memory[]): MemoryGroup[] {
    // Edge case: if we had embeddings, we'd cluster by cosine similarity
    // For MVP, use simple alphabetic bucketing
    const buckets = new Map<string, Memory[]>();

    for (const mem of memories) {
      const firstChar = mem.content[0]?.toUpperCase() || 'Z';
      if (!buckets.has(firstChar)) buckets.set(firstChar, []);
      buckets.get(firstChar)!.push(mem);
    }

    const groups: MemoryGroup[] = [];
    for (const [char, bucket] of buckets.entries()) {
      if (bucket.length >= MIN_GROUP_SIZE) {
        groups.push({
          tag: `${tag}/${char}`, // e.g., "supplement-angles/O"
          primaryMemories: bucket,
          semanticTheme: `Memories starting with "${char}"`,
        });
      }
    }

    return groups;
  }

  /**
   * Infer semantic theme from a group of memories
   * (Simple heuristic: look for common words in content)
   */
  private static inferSemanticTheme(memories: Memory[]): string {
    const words = new Set<string>();
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'have', 'has', 'do', 'does']);

    for (const mem of memories) {
      const tokens = mem.content.toLowerCase().split(/\W+/);
      for (const token of tokens) {
        if (token.length > 3 && !stopwords.has(token)) {
          words.add(token);
        }
      }
    }

    // Return top 2–3 words as theme
    const sorted = Array.from(words).sort().slice(0, 3);
    return sorted.join(', ') || 'unknown theme';
  }

  /**
   * Build LLM prompt for compressing a group of memories
   */
  private static buildCompressionPrompt(group: MemoryGroup): string {
    const memoryTexts = group.primaryMemories
      .map((m, i) => `[${i + 1}] ${m.content} (tags: ${m.tags.join(', ')})`)
      .join('\n\n');

    return `You are a memory consolidation agent for a creative AI system.

Your task: Synthesize the following ${group.primaryMemories.length} episodic memories into a single semantic insight.

EPISODIC MEMORIES (to consolidate):
${memoryTexts}

PRIMARY TAG: ${group.tag}
SEMANTIC THEME: ${group.semanticTheme || 'unknown'}

Output a JSON response with:
{
  "summary": "<concise 1–2 sentence semantic memory summarizing the pattern/insight across all memories>",
  "confidence_reasoning": "<brief explanation of why this synthesis is valid>",
  "inferred_tags": ["<tag1>", "<tag2>"]
}

Keep the summary concrete and actionable (e.g., avoid vague phrases like "shows promise").
Focus on patterns, percentages, or specific findings that emerged across the group.`;
  }

  /**
   * Parse LLM compression response
   */
  private static parseCompressionResponse(text: string): { summary: string; inferred_tags?: string[] } {
    try {
      // Find JSON block in response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || '',
        inferred_tags: parsed.inferred_tags || [],
      };
    } catch {
      // Fallback: use entire response as summary
      return {
        summary: text.trim().slice(0, 300),
        inferred_tags: [],
      };
    }
  }

  /**
   * Calculate confidence score based on:
   * - Group size (more evidence = higher confidence)
   * - Summary length (too short = low confidence)
   * - Tag consistency
   */
  private static calculateConfidence(
    groupSize: number,
    summaryLength: number,
    tags: string[]
  ): number {
    let score = 0.5; // Base 50%

    // Evidence boost: +10% per memory (max +40%)
    score += Math.min(groupSize * 0.1, 0.4);

    // Summary length: penalize if too short (< 30 chars) or too long (> 500)
    if (summaryLength >= 30 && summaryLength <= 500) {
      score += 0.05;
    } else if (summaryLength < 30) {
      score -= 0.1;
    }

    // Tag consistency: if memories share multiple tags, +5%
    if (tags.length >= 2) {
      score += 0.05;
    }

    return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
  }

  /**
   * Apply consolidation changes to memory store:
   * - Archive originals (mark with 'archived' tag)
   * - Add new semantic memories
   */
  private static applyConsolidationChanges(
    allMemories: Memory[],
    compressionResults: CompressionResult[]
  ): Memory[] {
    let updated = [...allMemories];

    // Archive originals
    for (const result of compressionResults) {
      if (result.success) {
        for (const id of result.archivedIds) {
          updated = this.archiveEpisodicMemory(id, updated);
        }
      }
    }

    // Add new semantic memories
    const semantics = compressionResults
      .filter(r => r.success && r.semantic)
      .map(r => r.semantic!);
    updated = [...semantics, ...updated];

    return updated;
  }

  /**
   * Estimate context reduction percentage
   * Simple heuristic: (archived_count - semantic_count) / original_episodic * 100
   */
  private static estimateContextReduction(
    originalEpisodicCount: number,
    archivedCount: number,
    semanticCreatedCount: number
  ): number {
    if (originalEpisodicCount === 0) return 0;
    const netReduction = archivedCount - semanticCreatedCount;
    return Math.round((netReduction / originalEpisodicCount) * 100);
  }

  /**
   * Get the timestamp of the last consolidation (from localStorage)
   */
  private static getLastConsolidationTime(): number | null {
    try {
      const history = localStorage.getItem(CONSOLIDATION_STORAGE_KEY);
      if (!history) return null;

      const parsed = JSON.parse(history) as ConsolidationHistory[];
      if (parsed.length === 0) return null;

      const latest = parsed[parsed.length - 1];
      return new Date(latest.consolidationResult.completedAt).getTime();
    } catch {
      return null;
    }
  }

  /**
   * Record consolidation to audit trail (localStorage)
   */
  private static recordConsolidationHistory(
    result: ConsolidationResult,
    cycleId?: string
  ): void {
    try {
      const history: ConsolidationHistory[] = JSON.parse(
        localStorage.getItem(CONSOLIDATION_STORAGE_KEY) || '[]'
      );

      history.push({
        id: `con-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        cycleId: cycleId || 'manual',
        consolidationResult: result,
        savedAt: new Date().toISOString(),
      });

      // Keep only last 12 consolidation records (audit trail)
      if (history.length > 12) {
        history.shift();
      }

      localStorage.setItem(CONSOLIDATION_STORAGE_KEY, JSON.stringify(history));
    } catch (err) {
      console.warn('[consolidationService] Failed to record consolidation history:', err);
    }
  }

  /**
   * Get consolidation history (for debug/audit)
   */
  static getConsolidationHistory(): ConsolidationHistory[] {
    try {
      return JSON.parse(localStorage.getItem(CONSOLIDATION_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Clear consolidation history (admin/reset only)
   */
  static clearConsolidationHistory(): void {
    try {
      localStorage.removeItem(CONSOLIDATION_STORAGE_KEY);
    } catch {
      console.warn('[consolidationService] Failed to clear consolidation history');
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Edge cases & error handling notes
// ═══════════════════════════════════════════════════════════════

/*
 * EDGE CASE 1: Only 2 episodic memories
 * ─────────────────────────────────────
 * If group has exactly 2 memories:
 * - Still eligible for compression (meets MIN_GROUP_SIZE)
 * - Confidence penalty may apply (fewer evidence points)
 * - Result: confidence ~0.6–0.7 (acceptable if meaningful overlap)
 *
 * EDGE CASE 2: Compression fails
 * ───────────────────────────────
 * If LLM returns error or empty response:
 * - CompressionResult.success = false
 * - Original episodic memories stay in store (NOT archived)
 * - Group can be retried in next consolidation cycle
 * - No semantic memory created
 *
 * EDGE CASE 3: Confidence too low
 * ────────────────────────────────
 * If confidence < 0.4:
 * - Compression succeeds (LLM runs)
 * - But result marked as failed (success: false)
 * - Original memories NOT archived
 * - System logs warning; user can manually inspect group
 *
 * EDGE CASE 4: No memories to consolidate
 * ──────────────────────────────────────
 * If episodic count < 2:
 * - shouldTriggerConsolidation returns false
 * - consolidateWeekly still runs if manually triggered
 * - Returns 0 groups, 0 compressions; no-op
 *
 * EDGE CASE 5: Threshold vs. schedule race
 * ──────────────────────────────────────
 * If 50 episodic memories accumulate AND it's been 7 days:
 * - Both conditions true
 * - shouldTriggerConsolidation returns 'threshold' (first check)
 * - Weekly schedule can still be honored if needed
 */
