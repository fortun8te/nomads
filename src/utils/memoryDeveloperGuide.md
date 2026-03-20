# Memory System Developer Guide

## Quick Start

```typescript
import { getMemoryService } from './memoryService';

const memory = getMemoryService();

// 1. Log an interaction
const episodic = memory.createEpisodicMemory({
  campaignId: 'camp-123',
  stage: 'research',
  action: 'user selected Extended preset',
  content: 'User enabled Extended research with visual scouting',
  tags: ['research-depth', 'supplement'],
});

// 2. Query what you've learned
const insights = memory.retrieveMemories({
  types: ['semantic', 'procedural'],
  minConfidence: 0.70,
  limit: 5,
});

// 3. Log when memory influences decisions
memory.logEngagement({
  memoryId: episodic.id,
  stage: 'research',
  agent: 'orchestrator',
  campaignId: 'camp-123',
  wasActedUpon: true,
});
```

---

## Type System Overview

### Memory Types & Confidence

| Type | Confidence | Source | Purpose |
|------|-----------|--------|---------|
| **Episodic** | 0.5 | interaction | Raw observation: specific event with context |
| **Semantic** | 0.65–0.95 | consolidation | Generalized fact: pattern from 2+ episodes |
| **Procedural** | 0.75–0.95 | interaction/feedback | Learned workflow: validated success pattern |

### Quick Reference: Type Signatures

```typescript
// EPISODIC: "What happened?"
EpisodicMemory {
  type: 'episodic',
  confidence: 0.5,
  eventTimestamp: '2026-03-20T14:32:00Z',
  context: { campaignId, stage, action, outcome?, userInputs? },
  wasActedUpon?: boolean,
  consolidatedAt?: string,
}

// SEMANTIC: "What did we learn?"
SemanticMemory {
  type: 'semantic',
  confidence: 0.65–0.95,
  claim: 'Objection-handling outperforms desire-driven by ~18%',
  evidence: { episodeCount, sourceEpisodeIds, dataPoints, confidenceReason },
  domain: 'messaging-strategy',
  consolidatedAt: '2026-03-20T14:32:00Z',
  expiresAt?: '2026-06-18T14:32:00Z', // TTL-based decay
}

// PROCEDURAL: "What works?"
ProceduralMemory {
  type: 'procedural',
  confidence: 0.8+,
  procedure: 'Use Extended preset for supplement research',
  validation: { executionCount, successCount, successRate, recentSuccesses },
  category: 'workflow-step',
  applicabilityTags: ['supplement', 'research'],
  backingSemanticIds: ['sem_123'], // Links to "why"
}
```

---

## Creating Memories

### Episodic Memory: Log Interactions

Create episodic memories when user makes a choice or system records an event.

```typescript
// PATTERN 1: User Selection
const episodic = memory.createEpisodicMemory({
  campaignId: campaign.id,
  stage: 'research',
  action: 'user selected Extended research preset',

  // High-level description for agents to understand
  content: 'User chose Extended research depth with visual scouting for supplement campaign',

  // What the user did / configured
  userInputs: {
    preset: 'Extended',
    visualScoutingEnabled: true,
    orchestratorModel: 'qwen3.5:4b',
  },

  // Searchable metadata
  tags: ['research-depth', 'preset-selection', 'supplement'],

  // Measurable outcome (optional)
  outcome: {
    metric: 'research-scope',
    value: 'extended', // Can be number or string
    direction: 'increase', // 'increase' | 'decrease'
  },
});

// PATTERN 2: System Decision
const systemDecision = memory.createEpisodicMemory({
  campaignId: campaign.id,
  stage: 'research',
  action: 'orchestrator deployed 4 parallel researchers',
  content: 'Orchestrator spawned 4 parallel research agents due to Extended preset',
  tags: ['research-parallelism', 'orchestrator-decision'],
  outcome: {
    metric: 'researcher-count',
    value: 4,
  },
});

// PATTERN 3: Test Result
const testWinner = memory.createEpisodicMemory({
  campaignId: campaign.id,
  stage: 'test',
  action: 'objection-handling concept won A/B test',
  content: `Test: Objection-handling CTR 3.8% vs Desire-driven CTR 3.1% (p < 0.05)`,
  tags: ['test-winner', 'objection-handling', 'supplement'],
  outcome: {
    metric: 'ctr-improvement',
    value: 0.7, // percentage point improvement
    direction: 'increase',
  },
});
```

**Key guidance:**
- **action**: Brief description of what happened (verb + noun)
- **content**: Narrative that an LLM can parse and reason about
- **tags**: 1–4 searchable labels (category, domain, outcome type)
- **outcome**: Measurable metric when available (optional)

### Semantic Memory: Consolidate Patterns

Created by consolidation job (not manually). Represents generalized knowledge.

```typescript
// Created by consolidationEngine.runConsolidation()
const semantic = memory.createSemanticMemory({
  claim: 'Objection-handling messaging outperforms desire-driven by ~18%',
  content: 'Evidence: 3 A/B tests across supplement/health categories. Objection-handling CTR: 3.6% avg vs Desire-driven: 3.0% avg. Conversion rate: 2.4% vs 2.0%.',

  domain: 'messaging-strategy', // Category (helps filter)

  // Backing evidence (provides traceability)
  episodeCount: 3, // How many episodes consolidated
  sourceEpisodeIds: ['ep_123', 'ep_456', 'ep_789'],
  dataPoints: [0.18, 3.6, 3.0], // Raw metrics
  confidenceReason: '3 independent tests, consistent trend',

  tags: ['objection-handling', 'supplement', 'health', 'messaging'],
  ttlDays: 90, // Expires in 90 days if not re-confirmed
});

// Result: confidence = 0.60 + 3 * 0.05 = 0.75
// High enough to influence agent recommendations
```

**When created:**
- Consolidation job detects 3+ related episodic memories
- Patterns are extracted (frequency, outcomes, trends)
- If confidence ≥ minConfidenceForSemantic (0.65), semantic memory is created
- Source episodes are marked as consolidated

### Procedural Memory: Encode Workflows

Created after procedural patterns validated (usually from engagement logs).

```typescript
const procedural = memory.createProceduralMemory({
  procedure: 'For supplement campaigns, use Extended research preset with visual scouting',
  content: 'Workflow: Select Extended preset → enable visual scouting → 4 researchers per round. Success: 4/5 cycles resulted in deeper insights and faster ad concept approval.',

  category: 'workflow-step', // Type of procedure
  applicabilityTags: ['supplement', 'research', 'health-category'],

  // Validation from field testing
  successCount: 4,
  executionCount: 5,
  recentSuccesses: [
    '2026-03-15T10:00:00Z',
    '2026-03-08T14:30:00Z',
    '2026-03-01T09:15:00Z',
  ],

  // Why this procedure works (semantic backing)
  backingSemanticIds: ['sem_123', 'sem_456'],

  tags: ['research-workflow', 'supplement', 'best-practice'],
});

// Result: confidence = 0.75 + 0.80 * 0.20 = 0.91
// High confidence → agents prioritize this in recommendations
```

**Triggers procedural creation:**
- Engagement logs show same workflow used 3+ times
- Success rate ≥ proceduralSuccessThreshold (0.75)
- Pattern confirmed across multiple campaigns

---

## Retrieving Memories

### Simple Query: Tags + Confidence

```typescript
// "What do we know about objection-handling in supplements?"
const insights = memory.retrieveMemories({
  tags: ['objection-handling', 'supplement'],
  types: ['semantic'],
  minConfidence: 0.70,
  sortBy: 'confidence', // confidence | recency | frequency | relevance (default)
  limit: 5,
});

insights.forEach((result) => {
  console.log(`Insight: ${result.memory.claim}`);
  console.log(`Score: ${(result.relevanceScore * 100).toFixed(0)}%`);
});
```

### Stage-Specific Query: Context-Aware

```typescript
// During research stage: "What research strategies worked before?"
const researchMemories = memory.retrieveMemories({
  stage: 'research',
  types: ['procedural', 'semantic'],
  minConfidence: 0.75,
  campaignId: campaign.id, // Boost memories from same campaign
  recentDays: 180, // Last 6 months
  sortBy: 'relevance',
});
```

### Complex Query: Hybrid Search

```typescript
// "What ad approaches won tests for health products?"
const winningApproaches = memory.retrieveMemories({
  query: 'ad approach', // Future: semantic vector search
  tags: ['test-winner', 'health-product'],
  types: ['episodic', 'semantic'],
  minConfidence: 0.65,
  sortBy: 'confidence',
  limit: 10,
});

// Agents use this to make informed recommendations
winningApproaches.forEach((result) => {
  const mem = result.memory;
  if (mem.type === 'episodic') {
    console.log(`Past success: ${mem.context.action}`);
  } else if (mem.type === 'semantic') {
    console.log(`Learned fact: ${mem.claim}`);
  }
});
```

---

## Engagement Tracking

Log when memories influence decisions (coactive feedback).

### Pattern: Decision → Outcome

```typescript
// 1. Retrieve memory to inform decision
const strategies = memory.retrieveMemories({
  tags: ['messaging-strategy'],
  minConfidence: 0.70,
});

// 2. Use memory to make decision
const selectedStrategy = strategies[0].memory;
const message = generateMessage(selectedStrategy);

// 3. Log that this memory influenced the output
memory.logEngagement({
  memoryId: strategies[0].memory.id,

  stage: 'make', // Where decision was made
  agent: 'content-generator', // Which agent retrieved it
  campaignId: campaign.id,

  wasActedUpon: true, // Memory actually influenced output

  // What happened as a result?
  outcome: {
    description: `Generated ad copy emphasizing objection handling`,
    metric: 'message-type',
    value: 'objection-focused',
  },
});
```

### Pattern: Retrieval Validation

```typescript
// Just retrieved memory for lookup (didn't act on it)
memory.logEngagement({
  memoryId: irrelevantMemory.id,
  stage: 'research',
  agent: 'orchestrator',
  campaignId: campaign.id,

  wasActedUpon: false, // Retrieved but not useful

  outcome: {
    description: 'Orchestrator checked but did not use this memory',
  },
});

// Over time: frequently-acted-on memories get boosted
// infrequently-used memories get deprioritized
```

---

## Consolidation Job

Runs weekly or after each cycle. Transforms episodic → semantic/procedural.

### Manual Trigger

```typescript
import { createConsolidationEngine } from './consolidationEngine';

const config = {
  minEpisodesForConsolidation: 3,
  lookbackDays: 90,
  minConfidenceForSemantic: 0.65,
  maxEpisodicAge: 7, // 1 week old before consolidating
  semanticTtlDays: 90,
  proceduralSuccessThreshold: 0.75,
};

const consolidator = createConsolidationEngine(memory, config);
const events = consolidator.runConsolidation();

console.log(`Created ${events.length} new semantic/procedural memories`);

events.forEach((event) => {
  console.log(`
    Type: ${event.consolidationType}
    Source episodes: ${event.sourceEpisodeIds.length}
    Compression: ${event.compressionRatio.toFixed(1)}x
    Confidence: ${event.resultingConfidence.toFixed(2)}
  `);
});
```

### Automatic Scheduling (Future)

```typescript
// Pseudo-code: run consolidation weekly
setInterval(() => {
  const consolidator = createConsolidationEngine(memory, config);
  consolidator.runConsolidation();
}, 7 * 24 * 60 * 60 * 1000); // 1 week
```

---

## Confidence Scoring

### Episodic: Always 0.5
Single observation, no validation.

```typescript
const episodic = memory.createEpisodicMemory({
  // ...
});
// episodic.confidence === 0.5 (always)
```

### Semantic: Evidence-Based (0.65–0.95)

```typescript
const semantic = memory.createSemanticMemory({
  episodeCount: 3,
  // ...
});
// confidence = 0.60 + 3 * 0.05 = 0.75 ✓

// More episodes = higher confidence
// 5 episodes → 0.85
// 8 episodes → 0.95 (capped)
```

### Procedural: Success-Based (0.75–0.95)

```typescript
const procedural = memory.createProceduralMemory({
  successCount: 4,
  executionCount: 5, // 80% success rate
  // ...
});
// confidence = 0.75 + 0.80 * 0.20 = 0.91 ✓

// 90% success → 0.93
// 100% success → 0.95 (capped)
```

### Confidence Updates from Feedback

```typescript
// User rates memory as "helpful"
memory.applyFeedback({
  memoryId: 'sem_123',
  feedbackType: 'usefulness',
  rating: 1, // +1 = helpful
});
// Confidence increases by +0.1 (up to 1.0)

// User rates as "unhelpful"
memory.applyFeedback({
  memoryId: 'sem_123',
  feedbackType: 'usefulness',
  rating: -1, // -1 = unhelpful
});
// Confidence decreases by -0.1 (down to 0.0)
```

---

## Debugging & Inspection

### View Memory by ID

```typescript
const memory = memoryService.getMemoryById('sem_123');

if (memory.type === 'semantic') {
  console.log(`
    Claim: ${memory.claim}
    Confidence: ${memory.confidence}
    Evidence: ${memory.evidence.episodeCount} episodes
    Expires: ${memory.expiresAt}
  `);
}
```

### View Engagement Stats

```typescript
const stats = memoryService.getEngagementStats('sem_123');

console.log(`
  Retrieved: ${stats.totalRetrievals} times
  Acted upon: ${stats.timesActedUpon} times
  Influence rate: ${(stats.timesActedUpon / stats.totalRetrievals * 100).toFixed(0)}%
  Last used: ${stats.lastRetrievedAt}
  User rating: ${stats.averageUserRating?.toFixed(2) || 'not rated'}
`);
```

### View Consolidation History

```typescript
const store = memoryService.getStore();
const consolidationHistory = store.consolidationHistory;

consolidationHistory.forEach((event) => {
  console.log(`
    When: ${event.timestamp}
    Type: ${event.consolidationType}
    Episodes merged: ${event.sourceEpisodeIds.length}
    Result: ${event.resultingMemoryId}
    Compression: ${event.compressionRatio.toFixed(1)}x
  `);
});
```

---

## Performance Considerations

### Memory Store Size
- **Episodic**: Low overhead (~100–500 bytes per memory)
- **Semantic**: Higher overhead (1–3 KB due to evidence data)
- **Procedural**: Medium overhead (~500 bytes per memory)

**Typical size after 10 cycles:**
- ~500 episodic memories: ~50–250 KB
- ~50 semantic memories: ~50–150 KB
- ~20 procedural memories: ~10–20 KB
- **Total: ~150–500 KB** (negligible for IndexedDB)

### Retrieval Complexity
- **Single tag query**: O(n) where n = total memories (~10 ms for 1000 memories)
- **Multi-tag query**: O(n) with filtering (~15 ms for 1000 memories)
- **Future vector search**: O(1) with vector index (~1 ms per query)

### Consolidation Job
- **Clustering**: O(n log n)
- **Pattern detection**: O(n²) per cluster (parallelizable)
- **Typical runtime**: 100 episodic memories → 1–2 seconds

---

## Common Patterns

### Pattern 1: Recommend Best Approach

```typescript
// Query successful approaches from past
const successes = memory.retrieveMemories({
  tags: ['test-winner'],
  minConfidence: 0.75,
  sortBy: 'confidence',
});

if (successes.length > 0) {
  const bestApproach = successes[0].memory;
  const recommendation = `Based on past success, we recommend: ${bestApproach.claim}`;
}
```

### Pattern 2: Adapt to Category

```typescript
// Supplement-specific insights
const supplementInsights = memory.retrieveMemories({
  tags: ['supplement'],
  campaignId: campaign.id,
  minConfidence: 0.70,
});

const recommendations = supplementInsights
  .filter((r) => r.memory.type === 'procedural')
  .map((r) => r.memory.procedure);
```

### Pattern 3: Track User Preference Evolution

```typescript
// Get all palette-related memories
const paletteHistory = memory.retrieveMemories({
  tags: ['palette-preference'],
  sortBy: 'recency',
  limit: 10,
});

const preferredColors = paletteHistory
  .slice(0, 3)
  .map((r) => r.memory.userInputs?.palette);

// Most recent 3 palettes show preference trend
```

### Pattern 4: Quality Gate

```typescript
// Only use high-confidence memories for critical decisions
const reliableInsights = memory.retrieveMemories({
  minConfidence: 0.85, // High bar
  types: ['semantic', 'procedural'],
});

if (reliableInsights.length > 0) {
  // Make decision based on high-confidence knowledge
}
```

---

## Testing Memory

```typescript
// Unit test: Episodic → Semantic consolidation
import { MemoryService } from './memoryService';

const memory = new MemoryService();

// Create 3 related episodic memories
for (let i = 0; i < 3; i++) {
  memory.createEpisodicMemory({
    campaignId: 'test-camp',
    stage: 'taste',
    action: 'user approved palette without modification',
    tags: ['palette-preference', 'supplement'],
    outcome: { metric: 'approval-speed', value: 'immediate' },
  });
}

// Consolidate
const engine = createConsolidationEngine(memory, config);
const events = engine.runConsolidation();

// Verify semantic memory created
expect(events.length).toBeGreaterThan(0);
expect(memory.getStore().semantic.length).toBe(1);
expect(memory.getStore().semantic[0].confidence).toBeGreaterThanOrEqual(0.65);
```

---

## FAQ

**Q: When should I create episodic vs semantic memories?**
A: Create episodic for every significant interaction. Semantic are created automatically by consolidation job from episodic.

**Q: Can I manually create semantic/procedural?**
A: Yes, but normally they're created by consolidation engine. Manual creation useful for seeding system with known facts.

**Q: What if I want to forget a memory?**
A: Call `memory.deleteMemory(id)` (hard delete for MVP). Future: soft delete with archive flag.

**Q: How do I export/import memories?**
A: Call `memory.getStore()` to serialize, `memory.loadStore(store)` to deserialize. Store to IndexedDB for persistence.

**Q: Can multiple agents query memory simultaneously?**
A: Yes, reads are safe. Writes use in-memory updates (no locking needed for single-threaded JS).

**Q: What's the difference between confidence and relevance?**
A: **Confidence** = how reliable the memory is (0–1). **Relevance** = how applicable to current query (0–1). Memory with high confidence but low relevance won't be retrieved.
