# Nomads MVP Memory Consolidation Pipeline

## Executive Summary

Consolidation reduces episodic memory context bloat (~50% target reduction) by:
1. **Grouping** episodic memories by tag + optional semantic similarity
2. **Compressing** each group into a single semantic memory via qwen3.5:2b
3. **Archiving** originals (for audit trail) and recording new semantic memories

**Key properties:**
- Triggered: weekly schedule + threshold (50+ episodic) + manual request
- Non-blocking: runs async in background
- Traceable: archived memories retained, confidence scores on semantics
- Configurable: adjustable thresholds, model selection, group sizing

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  CONSOLIDATION TRIGGER                                          │
│  - Schedule (weekly @ fixed time)                               │
│  - Threshold (50+ episodic memories)                            │
│  - Manual (user button)                                         │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: GROUPING                                              │
│  Input:  All episodic memories (exclude seed + archived)        │
│  Output: MemoryGroup[] (2–10 memories per group)                │
│                                                                 │
│  Process:                                                       │
│  1. Collect memories by tag → { tag → [memories] }             │
│  2. Skip groups < MIN_GROUP_SIZE (2)                           │
│  3. Split groups > MAX_GROUP_SIZE (10) via:                    │
│     a) Semantic clustering (if embeddings available)           │
│     b) Alphabetic bucketing (fallback)                         │
│  4. Infer semantic theme for each group                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: COMPRESSION (parallel per group)                      │
│  Input:  MemoryGroup (2–10 episodic memories)                   │
│  Output: CompressionResult {                                    │
│            semantic: ConsolidatedMemory,                        │
│            archivedIds: string[],                               │
│            confidence: 0–1,                                     │
│            error?: string                                       │
│          }                                                      │
│                                                                 │
│  Process (per group):                                           │
│  1. Build LLM prompt (group content + tag + theme)             │
│  2. Call qwen3.5:2b (300 token limit, temp=0.3)               │
│  3. Parse JSON response → summary + inferred_tags              │
│  4. Calculate confidence score (0–1)                           │
│  5. IF confidence < 0.4: RETURN { success: false, error }      │
│  6. ELSE: Create semantic memory + RETURN { success: true }    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: CLEANUP & PERSISTENCE                                 │
│  Input:  CompressionResult[] (all groups)                       │
│  Output: Updated memory store + ConsolidationHistory            │
│                                                                 │
│  Process:                                                       │
│  1. Archive episodic memories from successful compressions:     │
│     - Add 'archived' tag (don't delete)                         │
│  2. Add new semantic memories to store                          │
│  3. Record ConsolidationHistory:                                │
│     {                                                           │
│       id, cycleId, consolidationResult, savedAt                │
│     }                                                           │
│  4. Return ConsolidationResult {                                │
│       successfulCompressions,                                   │
│       failedCompressions,                                       │
│       contextReductionPercent,                                  │
│       compressionResults[]                                      │
│     }                                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Pseudocode

### 1. Grouping Phase

```typescript
function groupEpisodicMemories(episodic: Memory[]): MemoryGroup[] {
  // Step 1: Collect by tag
  const tagMap: Map<string, Memory[]> = new Map();
  for (const memory of episodic) {
    for (const tag of memory.tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, []);
      }
      tagMap.get(tag)!.push(memory);
    }
  }

  const groups: MemoryGroup[] = [];

  // Step 2: Process each tag group
  for (const [tag, memories] of tagMap.entries()) {
    // Skip tiny groups
    if (memories.length < MIN_GROUP_SIZE) {
      continue;
    }

    // Handle large groups
    if (memories.length > MAX_GROUP_SIZE) {
      // Option A: If embeddings available → semantic clustering
      if (hasEmbeddingsService()) {
        const clusters = clusterBySemanticSimilarity(memories, MAX_GROUP_SIZE);
        for (const cluster of clusters) {
          const theme = inferSemanticTheme(cluster);
          groups.push({
            tag: `${tag}/${theme}`,
            primaryMemories: cluster,
            semanticTheme: theme,
          });
        }
      }
      // Option B: Fallback → alphabetic bucketing
      else {
        const buckets = bucketByFirstChar(memories);
        for (const [char, bucket] of buckets.entries()) {
          if (bucket.length >= MIN_GROUP_SIZE) {
            groups.push({
              tag: `${tag}/${char}`,
              primaryMemories: bucket,
              semanticTheme: `Memories starting with "${char}"`,
            });
          }
        }
      }
    } else {
      // Group size is within bounds
      const theme = inferSemanticTheme(memories);
      groups.push({
        tag,
        primaryMemories: memories,
        semanticTheme: theme,
      });
    }
  }

  return groups;
}

function inferSemanticTheme(memories: Memory[]): string {
  // Extract words > 3 chars (exclude stopwords)
  const STOPWORDS = ['the', 'a', 'an', 'and', 'or', 'is', 'are', ...];
  const words = new Set<string>();

  for (const mem of memories) {
    const tokens = mem.content.toLowerCase().split(/\W+/);
    for (const token of tokens) {
      if (token.length > 3 && !STOPWORDS.has(token)) {
        words.add(token);
      }
    }
  }

  // Return top 2–3 words
  return Array.from(words).sort().slice(0, 3).join(', ');
}
```

### 2. Compression Phase

```typescript
async function compressGroup(group: MemoryGroup): Promise<CompressionResult> {
  const startTime = Date.now();

  // Step 1: Validate group size
  if (group.primaryMemories.length < MIN_GROUP_SIZE) {
    return {
      success: false,
      group,
      archivedIds: [],
      error: `Group too small (${group.primaryMemories.length} < ${MIN_GROUP_SIZE})`,
    };
  }

  // Step 2: Build compression prompt
  const memoryTexts = group.primaryMemories
    .map((m, i) => `[${i + 1}] ${m.content} (tags: ${m.tags.join(', ')})`)
    .join('\n\n');

  const prompt = `
You are a memory consolidation agent for a creative AI system.

Your task: Synthesize the following ${group.primaryMemories.length} episodic memories
into a single semantic insight.

EPISODIC MEMORIES (to consolidate):
${memoryTexts}

PRIMARY TAG: ${group.tag}
SEMANTIC THEME: ${group.semanticTheme}

Output a JSON response with:
{
  "summary": "<concise 1–2 sentence semantic memory summarizing the pattern/insight>",
  "confidence_reasoning": "<brief explanation of why this synthesis is valid>",
  "inferred_tags": ["<tag1>", "<tag2>"]
}

Keep the summary concrete and actionable.
Focus on patterns, percentages, or specific findings.
`;

  // Step 3: Call LLM (qwen3.5:2b)
  let responseText = '';
  try {
    await ollamaService.generateStream(
      'qwen3.5:2b',
      prompt,
      { temperature: 0.3, top_p: 0.9, top_k: 40 },
      (chunk) => { responseText += chunk; },
      { retries: 1 }
    );
  } catch (error) {
    return {
      success: false,
      group,
      archivedIds: [],
      error: `LLM compression failed: ${error.message}`,
    };
  }

  // Step 4: Parse response
  let parsed;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (error) {
    return {
      success: false,
      group,
      archivedIds: [],
      error: `Failed to parse compression response: ${error.message}`,
    };
  }

  const summary = parsed.summary?.trim() || '';
  const inferredTags = parsed.inferred_tags || [];

  // Step 5: Validate summary
  if (!summary || summary.length < 20) {
    return {
      success: false,
      group,
      archivedIds: [],
      error: 'Compression produced empty or too-short summary',
    };
  }

  // Step 6: Calculate confidence
  const confidence = calculateConfidence(
    group.primaryMemories.length,
    summary.length,
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

  // Step 7: Create semantic memory
  const semantic: ConsolidatedMemory = {
    id: generateId(),
    type: 'research',
    content: summary,
    tags: [group.tag, ...inferredTags],
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    accessCount: 0,
    relatedIds: group.primaryMemories.map(m => m.id),
    confidenceScore: confidence,
    consolidatedAt: new Date().toISOString(),
    evidenceCount: group.primaryMemories.length,
  };

  // Step 8: Return success
  return {
    success: true,
    group,
    semantic,
    archivedIds: group.primaryMemories.map(m => m.id),
    tokensUsed: Math.ceil(responseText.length / 4),
    executionTimeMs: Date.now() - startTime,
  };
}

function calculateConfidence(groupSize: number, summaryLength: number, tags: string[]): number {
  let score = 0.5; // Base: 50%

  // Evidence boost: +10% per memory (cap at +40%)
  score += Math.min(groupSize * 0.1, 0.4);

  // Summary quality:
  if (summaryLength >= 30 && summaryLength <= 500) {
    score += 0.05; // Good length
  } else if (summaryLength < 30) {
    score -= 0.1; // Too short
  }

  // Tag consistency:
  if (tags.length >= 2) {
    score += 0.05; // Multiple tags = higher consistency
  }

  return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
}
```

### 3. Trigger Logic

```typescript
function shouldTriggerConsolidation(allMemories: Memory[]): {
  should: boolean,
  reason?: 'schedule' | 'threshold'
} {
  // Count episodic memories
  const episodic = filterEpisodicMemories(allMemories);

  // Check threshold
  if (episodic.length >= EPISODIC_THRESHOLD) { // 50
    return { should: true, reason: 'threshold' };
  }

  // Check weekly schedule
  const lastConsolidation = getLastConsolidationTime();
  if (lastConsolidation === null) {
    // First run: don't auto-trigger, wait for manual or threshold
    return { should: false };
  }

  const daysSince = (Date.now() - lastConsolidation) / (1000 * 60 * 60 * 24);
  if (daysSince >= 7) {
    return { should: true, reason: 'schedule' };
  }

  return { should: false };
}
```

---

## Configuration & Constants

```typescript
// Grouping
const MIN_GROUP_SIZE = 2;           // Don't consolidate if < 2 memories
const MAX_GROUP_SIZE = 10;          // Split groups > 10 memories

// Thresholds
const EPISODIC_THRESHOLD = 50;      // Trigger consolidation at 50+ episodic
const MIN_CONFIDENCE_THRESHOLD = 0.4; // Reject semantic if confidence < 40%

// Model & resources
const COMPRESSION_MODEL = 'qwen3.5:2b'; // Fast summarization model
const COMPRESSION_PROMPT_TOKENS = 300;  // Max output tokens

// Storage
const CONSOLIDATION_STORAGE_KEY = 'nomad_consolidation_history';
const HISTORY_RETENTION = 12;       // Keep last 12 consolidation records
```

---

## Edge Cases & Resolution

### Edge Case 1: Only 2 episodic memories in group

**Scenario:** A group contains exactly 2 related memories.

**Handling:**
- Meets `MIN_GROUP_SIZE` threshold
- Proceeds to compression
- Confidence calculation: `0.5 + 0.2 (2*0.1) + 0.05 = 0.75` (good)
- Result: Likely compressed successfully

**Decision:** **Compress.** 2 memories is meaningful evidence for a pattern.

---

### Edge Case 2: LLM compression fails

**Scenario:** qwen3.5:2b returns error (timeout, OOM, network).

**Handling:**
```
CompressionResult {
  success: false,
  group,
  archivedIds: [], // ← Don't archive originals
  error: "LLM error: ...",
}
```

**Decision:** **Retry next cycle.** Original episodic memories remain in store untouched. No semantic created.

---

### Edge Case 3: Confidence score is too low

**Scenario:** LLM returns valid JSON, but calculated confidence < 0.4.

**Handling:**
```
Examples:
- Group size = 1 (should not happen, filtered out)
- Summary too short (< 30 chars): score -= 0.1
- Tag count = 0: score stays base

confidence = 0.5 - 0.1 = 0.4 ← threshold
If confidence < 0.4:
  CompressionResult { success: false, error: "Confidence too low" }
  Originals NOT archived
```

**Decision:** **Fail gracefully.** Log warning; user can manually review or retry. Original memories preserved.

---

### Edge Case 4: No memories to consolidate

**Scenario:** Episodic memory count < 2.

**Handling:**
```
shouldTriggerConsolidation() → { should: false }
consolidateWeekly() never called

OR if manually triggered:
groupEpisodicMemories(episodic) → returns []
compressionResults = []
ConsolidationResult {
  successfulCompressions: 0,
  contextReductionPercent: 0,
  ...
}
```

**Decision:** **No-op.** Safe to trigger manually anytime; returns empty result.

---

### Edge Case 5: Memory store is empty

**Scenario:** First run; only seed memories present.

**Handling:**
```
filterEpisodicMemories(allMemories)
  → filters out seed-*, user-context-*
  → returns []

groupEpisodicMemories([]) → []
consolidateWeekly() → empty result
```

**Decision:** **No-op.** Seed memories are excluded by design.

---

### Edge Case 6: Threshold and schedule both trigger

**Scenario:** 50+ episodic memories accumulated AND 7+ days since last consolidation.

**Handling:**
```
shouldTriggerConsolidation() checks threshold first
→ returns { should: true, reason: 'threshold' }

(Schedule check never reached in first condition)
```

**Decision:** **Threshold takes priority.** Weekly schedule honored regardless.

---

### Edge Case 7: Consolidation runs during an active cycle

**Scenario:** User starts a cycle while consolidation is running.

**Handling:**
- Consolidation runs async (non-blocking)
- Reads allMemories snapshot at start time
- New memories created during consolidation are NOT included in this run
- Next consolidation cycle picks up new memories
- No race conditions (localStorage writes are atomic)

**Decision:** **Safe.** Consolidation snapshot-based; doesn't interfere with live cycles.

---

### Edge Case 8: Archived memory accidentally re-added

**Scenario:** User manually adds a memory that was already archived.

**Handling:**
```
Memory { id: 'mem-123', tags: ['archived', 'other-tag'] }

filterEpisodicMemories() checks: !m.tags.includes('archived')
→ Filtered out automatically

Next consolidation doesn't touch it
```

**Decision:** **Archived memories remain archived.** Future consolidation excludes them.

---

### Edge Case 9: Very large memory content (10K+ chars)

**Scenario:** A memory contains extremely long content (e.g., full article).

**Handling:**
```
Building compression prompt:
  memoryTexts = content1 + content2 + ... (potentially huge)

If prompt exceeds Ollama context limit (4K for qwen3.5:2b):
  ollamaService.generateStream() → times out or errors
  CompressionResult { success: false, error: "LLM error" }
```

**Mitigations:**
- Truncate memory content to first 500 chars in grouping phase
- Or: Split large groups into sub-groups before compression
- Or: Filter memories > 1000 chars (optional)

**Decision:** **Recommended:** Truncate memory content in the prompt builder (first 500 chars) to avoid token overflow.

---

### Edge Case 10: Consolidation history grows unbounded

**Scenario:** Over months, consolidation runs 100+ times.

**Handling:**
```
recordConsolidationHistory() keeps last 12 records:
  if (history.length > 12) { history.shift(); }
```

**Decision:** **Audit trail capped at 12.** Prevents localStorage bloat. Older records discarded. (Adjust `HISTORY_RETENTION` if needed.)

---

## Confidence Score Formula

```
Base Score: 0.5 (50%)

Evidence Boost (group size):
  + min(groupSize * 0.1, 0.4)
  ─ For 2 memories: +0.2 → 0.7
  ─ For 5 memories: +0.5 (capped) → 0.9
  ─ For 10+ memories: +0.4 (capped) → 0.9

Summary Quality:
  IF 30 <= length <= 500:
    + 0.05
  ELSE IF length < 30:
    - 0.1
  ELSE IF length > 500:
    - 0.05

Tag Consistency:
  IF tags.length >= 2:
    + 0.05

Final: clamp(score, 0, 1)
```

**Examples:**
- Group of 2, summary "This is good" (13 chars), 1 tag: 0.5 + 0.2 - 0.1 + 0 = **0.6** ✓
- Group of 3, summary "Good pattern insight" (20 chars), 2 tags: 0.5 + 0.3 - 0.1 + 0.05 = **0.75** ✓
- Group of 5, summary valid, 0 tags: 0.5 + 0.4 + 0.05 + 0 = **0.95** ✓

---

## Integration Points

### 1. Memory Store (memoryStore.ts)

```typescript
// NEW method in Memory interface:
export interface ConsolidatedMemory extends Memory {
  isArchived?: boolean;
  relatedIds?: string[];      // Original episodic IDs
  confidenceScore?: number;   // 0–1
  consolidatedAt?: string;    // ISO timestamp
  evidenceCount?: number;     // # source memories
}

// NEW export:
export function archiveMemory(id: string): void
export function getArchivedMemories(): Memory[]
```

### 2. Campaign Context (CampaignContext.tsx)

```typescript
// After cycle completes:
const { currentCycle } = useCampaign();

if (currentCycle?.status === 'complete') {
  // Consolidation may auto-trigger if threshold met
  // Or manual button in UI
  const { triggerConsolidation } = useConsolidation();
}
```

### 3. Dashboard / Settings Panel

```typescript
// NEW UI section: "Memory Management"
// - Display episodic count + semantic count
// - Show last consolidation result
// - Manual consolidation button
// - Audit trail viewer

<ConsolidationPanel
  consolidationState={consolidationState}
  onManualTrigger={() => triggerConsolidation(true)}
/>
```

---

## Performance Notes

### Grouping Phase
- O(n) where n = episodic memory count
- Time: < 100ms for 1000 memories
- No LLM calls

### Compression Phase
- O(groups) where groups = number of memory groups (typically 5–20)
- Per group: 1 LLM call (qwen3.5:2b)
- Time: ~2–5s per group (varies by Ollama load)
- Total: ~10–100s for typical consolidation (5–20 groups)
- **Runs async; doesn't block UI**

### Cleanup Phase
- O(groups) to archive + persist
- Time: < 100ms
- Storage: +1 ConsolidationHistory record (~2KB)

---

## Testing Strategy

### Unit Tests

```typescript
// consolidationService.test.ts
describe('ConsolidationService', () => {
  describe('groupEpisodicMemories', () => {
    test('groups by tag', () => { ... });
    test('skips groups < MIN_GROUP_SIZE', () => { ... });
    test('splits groups > MAX_GROUP_SIZE', () => { ... });
    test('handles no episodic memories', () => { ... });
  });

  describe('compressGroup', () => {
    test('returns success for valid group', () => { ... });
    test('rejects low confidence', () => { ... });
    test('handles LLM errors', () => { ... });
    test('parses JSON response', () => { ... });
  });

  describe('calculateConfidence', () => {
    test('scores 2-memory group at 0.6+', () => { ... });
    test('scores 5-memory group at 0.75+', () => { ... });
    test('penalizes short summaries', () => { ... });
  });

  describe('shouldTriggerConsolidation', () => {
    test('triggers at threshold', () => { ... });
    test('triggers on schedule', () => { ... });
    test('skips if neither', () => { ... });
  });
});
```

### Integration Tests

```typescript
// useConsolidation.test.ts
describe('useConsolidation', () => {
  test('triggers consolidation manually', async () => { ... });
  test('shows progress during consolidation', async () => { ... });
  test('archives episodic memories', async () => { ... });
  test('creates semantic memories', async () => { ... });
});
```

### E2E Tests

```
Scenario: Run a full cycle, generate 10 episodic memories, trigger consolidation
Expected:
  - Consolidation completes
  - 10 episodic memories archived
  - 3–5 semantic memories created
  - Context reduction 40–60%
```

---

## Future Enhancements

1. **Embeddings-based clustering** (Phase 2)
   - Use vector embeddings for semantic similarity
   - Cluster via cosine distance
   - More accurate grouping than tag-based

2. **Scheduled auto-trigger** (Phase 2)
   - Cron job or background worker
   - Weekly consolidation without manual button
   - Configurable schedule

3. **Consolidation audit UI** (Phase 2)
   - View consolidation history
   - Click to see which memories were compressed
   - Undo consolidation (restore archived)

4. **Multi-tier consolidation** (Phase 3)
   - Weekly → compress episodic to semantic
   - Monthly → compress semantics to meta-patterns
   - Reduces context further

5. **Configurable thresholds** (Phase 2)
   - Settings panel to adjust MIN/MAX group sizes
   - Confidence threshold
   - Archive retention period

---

## References

- **Implementation:** `/src/utils/consolidationService.ts`
- **React hook:** `/src/hooks/useConsolidation.ts`
- **Memory store:** `/src/utils/memoryStore.ts`
- **Configuration:** `/src/config/infrastructure.ts`
