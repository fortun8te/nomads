# Memory System Integration Guide

## Overview

The MVP memory system is designed to learn from every interaction in the Nomads ad cycle. It captures:

1. **Episodic**: Specific events from interactions (raw observations)
2. **Semantic**: Generalized patterns from multiple episodes (facts/insights)
3. **Procedural**: Learned workflows and preferences (behavioral patterns)

This document shows how to integrate memory tracking into existing Nomads stages.

---

## Memory Service API

### Core Operations

```typescript
import { getMemoryService } from './memoryService';

const memory = getMemoryService();

// Create episodic memory from an interaction
const episodic = memory.createEpisodicMemory({
  campaignId: 'campaign-123',
  stage: 'research',
  action: 'user selected Extended preset',
  outcome: { metric: 'research-depth', value: 'extended', direction: 'increase' },
  userInputs: { preset: 'Extended', visualScout: true },
  content: 'User enabled Extended research preset with visual scouting for supplement campaign',
  tags: ['research-depth', 'preset-selection', 'supplement'],
});

// Retrieve relevant memories for decision-making
const relevant = memory.retrieveMemories({
  types: ['semantic', 'procedural'],
  tags: ['research-depth'],
  minConfidence: 0.70,
  stage: 'research',
  sortBy: 'relevance',
  limit: 5,
});

// Log when memory influences a decision
memory.logEngagement({
  memoryId: relevant[0].memory.id,
  stage: 'research',
  agent: 'orchestrator',
  campaignId: 'campaign-123',
  wasActedUpon: true,
  outcome: {
    description: 'Orchestrator deployed 4 parallel researchers per iteration',
    metric: 'research-efficiency',
    value: 4,
  },
});
```

---

## Integration Points by Stage

### 1. Research Stage

**Where to log memories:**

- When user selects research depth preset
- After orchestrator chooses research queries
- After reflection agent identifies coverage gaps
- When visual scouting completes

**Example: Research Preset Selection**

```typescript
// src/hooks/useCycleLoop.ts or Dashboard.tsx
const selectedPreset = 'Extended'; // From UI selection

memory.createEpisodicMemory({
  campaignId: campaign.id,
  stage: 'research',
  action: `selected ${selectedPreset} research preset`,
  content: `User selected ${selectedPreset} research depth for ${campaign.productName}`,
  userInputs: { preset: selectedPreset, visualScoutingEnabled: true },
  tags: ['research-depth', 'preset-selection', campaign.productName],
});

// Later, log when this choice influenced output
const searchQueries = orchestrator.decideQueries();
memory.logEngagement({
  memoryId: episodicId,
  stage: 'research',
  agent: 'orchestrator',
  campaignId: campaign.id,
  wasActedUpon: true,
  outcome: {
    description: `Orchestrator generated ${searchQueries.length} queries`,
    metric: 'query-count',
    value: searchQueries.length,
  },
});
```

### 2. Taste Stage

**Where to log memories:**

- When taste agent recommends color palettes
- When user approves/modifies palette
- When user selects tone/positioning

**Example: Palette Preference**

```typescript
// src/components/TasteOutput.tsx (hypothetical)
const palette = { primary: '#FF6B6B', secondary: '#4ECDC4' };
const userApproved = true;

if (userApproved) {
  memory.createEpisodicMemory({
    campaignId: campaign.id,
    stage: 'taste',
    action: 'user approved suggested palette',
    content: `User approved palette with primary ${palette.primary}, secondary ${palette.secondary}`,
    userInputs: { palette, approved: true, modifications: 0 },
    tags: ['palette-preference', campaign.category, 'first-approval'],
    outcome: { metric: 'taste-approval-speed', value: 'immediate', direction: 'increase' },
  });
}
```

### 3. Make Stage

**Where to log memories:**

- When subagent generates ad concepts
- When user rates/selects among concepts
- When concept passes quality gates

**Example: Ad Concept Effectiveness**

```typescript
// src/components/MakeOutput.tsx (hypothetical)
const concepts = [
  { id: 'c1', approach: 'objection-handling', score: 8.5 },
  { id: 'c2', approach: 'desire-driven', score: 7.2 },
];

const selectedConcept = concepts[0]; // User picks objection-handling

memory.createEpisodicMemory({
  campaignId: campaign.id,
  stage: 'make',
  action: 'user selected objection-handling ad concept',
  content: `User selected ad concept with objection-handling approach (score: ${selectedConcept.score})`,
  userInputs: { selectedApproach: selectedConcept.approach, score: selectedConcept.score },
  tags: ['ad-approach', 'objection-handling', campaign.category],
  outcome: { metric: 'concept-quality', value: selectedConcept.score, direction: 'increase' },
});
```

### 4. Test Stage

**Where to log memories:**

- When test results show performance metrics
- When winner concept is determined
- When test confidence/learnings are recorded

**Example: Test Performance**

```typescript
// src/hooks/useCycleLoop.ts, after test stage completes
const testResults = {
  concept1_ctr: 3.2,
  concept2_ctr: 2.8,
  winner: 'objection-handling',
};

memory.createEpisodicMemory({
  campaignId: campaign.id,
  stage: 'test',
  action: 'objection-handling concept won A/B test',
  content: `A/B test completed: objection-handling CTR ${testResults.concept1_ctr}% vs desire-driven ${testResults.concept2_ctr}%`,
  outcome: {
    metric: 'ctr-improvement',
    value: testResults.concept1_ctr - testResults.concept2_ctr,
    direction: 'increase',
  },
  tags: ['ad-approach', 'test-winner', campaign.category],
});
```

### 5. Research Agent Selection

**Where to log memories:**

Before deploying research agents, query memory for similar past campaigns:

```typescript
// src/utils/researchAgents.ts
const relevantMemories = memory.retrieveMemories({
  types: ['semantic', 'procedural'],
  tags: [campaign.category, 'research-strategy'],
  minConfidence: 0.70,
  sortBy: 'relevance',
  limit: 5,
});

// Example: if memory says "Visual scouting successful for supplements",
// suggest deploying visual scout for this supplement campaign
const shouldUseVisualScouting = relevantMemories.some(
  (m) => m.memory.type === 'semantic' && m.memory.content.includes('visual scouting')
);
```

---

## Consolidation & Decay

### Weekly Consolidation Job

Run this periodically (e.g., on a timer or at end of cycle):

```typescript
import { createConsolidationEngine } from './consolidationEngine';

// In a scheduled task or background job:
const consolidator = createConsolidationEngine(memoryService, consolidationConfig);
const events = consolidator.runConsolidation();

console.log(`Consolidation completed: ${events.length} semantic/procedural memories created`);
```

**What it does:**

1. Clusters episodic memories by domain/tags
2. Detects patterns (frequency, outcomes, trends)
3. Creates semantic memories if confidence ≥ 0.65
4. Creates procedural memories if success rate ≥ 75%
5. Records audit trail of all consolidations

### Memory Decay & TTL

Semantic memories have TTL (time-to-live) that depends on trend direction:

- **Increasing trend**: 120 days (pattern is strengthening)
- **Decreasing trend**: 45 days (pattern may be changing)
- **Stable trend**: 90 days (default)

After expiry, memories remain but have lower retrieval priority. They're archived rather than deleted for audit purposes.

---

## Confidence Scoring Rules

### Episodic Memory: 0.5 (always)
Single observation. No context for validation yet.

### Semantic Memory: 0.65–0.95
Based on evidence consolidation:
- **2–3 episodes, low variation**: 0.65
- **4–7 episodes, consistent**: 0.78
- **8+ episodes, strong trend**: 0.88–0.95

Formula: `confidence = 0.60 + episodeCount * 0.05` (capped at 0.95)

### Procedural Memory: 0.75–0.95
Based on validation success rate:
- **Success rate 75%**: 0.80
- **Success rate 90%**: 0.90
- **Success rate 100%**: 0.95

Formula: `confidence = 0.75 + successRate * 0.20`

### Confidence Updates from Feedback
Each piece of user/system feedback adjusts confidence by ±0.1:

```typescript
memory.applyFeedback({
  memoryId: 'sem_123',
  feedbackType: 'usefulness',
  rating: 1, // +1 = helpful, 0 = neutral, -1 = unhelpful
  comment: 'This insight perfectly matched our campaign',
  timestamp: new Date().toISOString(),
  source: 'user',
});
// Confidence increases by 0.1 (up to 1.0 cap)
```

---

## Engagement Tracking

The engagement log captures implicit signals of memory value:

```typescript
interface EngagementLogEntry {
  memoryId: string;           // Which memory was used
  retrievalContext: {
    stage: string;             // e.g., 'research'
    agent: string;             // e.g., 'orchestrator'
    campaignId: string;
  };
  wasActedUpon: boolean;       // Did the memory influence the output?
  outcome?: {                  // What happened?
    description: string;
    metric?: string;
    value?: number | string;
  };
  timestamp: string;           // When was it retrieved?
  userRating?: number;         // -1, 0, +1 (later, when user reviews)
}
```

**Metrics that improve memory ranking:**

- `accessCount`: How often a memory was retrieved
- `timesActedUpon`: How often it actually influenced decisions
- `averageUserRating`: What users thought of it
- `recency`: When it was last used (with exponential decay)

---

## Retrieval Best Practices

### Query by Stage Context

```typescript
// When research stage is active, prioritize research-domain memories
const researchMemories = memory.retrieveMemories({
  stage: 'research',
  types: ['semantic', 'procedural'],
  minConfidence: 0.70,
  sortBy: 'relevance',
});
```

### Query by Tag

```typescript
// For supplement campaigns, get insights specific to supplement category
const supplementInsights = memory.retrieveMemories({
  tags: ['supplement'],
  minConfidence: 0.65,
  recentDays: 90,
});
```

### Hybrid Query

```typescript
// "What have we learned about objection-handling in health products?"
const objectionInsights = memory.retrieveMemories({
  tags: ['objection-handling', 'health'],
  types: ['semantic'],
  minConfidence: 0.75,
  sortBy: 'confidence',
  limit: 5,
});

objectionInsights.forEach((result) => {
  console.log(`Insight: ${result.memory.claim}`);
  console.log(`Reason retrieved: ${result.retrievalReason}`);
  console.log(`Relevance score: ${result.relevanceScore.toFixed(2)}`);
});
```

---

## Future Vector Search Integration

The schema is designed to support semantic vector search:

```typescript
// Future: When embeddings are populated by consolidation job
const embedding = await generateEmbedding(
  'User prefers visual design over copy-heavy ads'
);

const similarMemories = memory.retrieveMemoriesByVector(
  embedding,
  { minSimilarity: 0.75, limit: 10 }
);
```

For MVP, we use substring search on tags + metadata filtering. Embeddings field is reserved for future vector search.

---

## Audit Trail & Debugging

View memory lineage:

```typescript
// Get a semantic memory's consolidation history
const consolidationHistory = memoryService.getStore().consolidationHistory.filter(
  (event) => event.resultingMemoryId === 'sem_123'
);

// See which episodic memories contributed
const sourcedEpisodes = consolidationHistory[0].sourceEpisodeIds.map(
  (id) => memoryService.getMemoryById(id)
);

// Trace engagement: who used this memory and when?
const engagementStats = memoryService.getEngagementStats('sem_123');
console.log(`Retrieved ${engagementStats.totalRetrievals} times`);
console.log(`Acted upon ${engagementStats.timesActedUpon} times`);
```

---

## MVP Roadmap

**Phase 1 (Current):**
- ✅ Type definitions (episodic, semantic, procedural)
- ✅ Memory service (CRUD, retrieval, engagement)
- ✅ Consolidation engine (pattern detection)
- ✅ Integration points documented

**Phase 2 (Next):**
- Vector embeddings via consolidation job
- Semantic search over consolidated knowledge
- Memory export/import for persistence
- Weekly consolidation scheduler

**Phase 3 (Future):**
- Multi-agent memory retrieval + debate
- Memory-informed prompt injection for agents
- User interface for memory exploration
- Decay policy refinement based on actual usage

---

## Configuration

Tune consolidation behavior via `ConsolidationConfig`:

```typescript
import { initializeMemoryService } from './memoryService';

const config = {
  minEpisodesForConsolidation: 3,  // Min episodic memories to trigger consolidation
  lookbackDays: 90,               // How far back to look for related episodes
  minConfidenceForSemantic: 0.65, // Min confidence for new semantic memory
  maxEpisodicAge: 30,             // Max age before episodic is consolidated
  semanticTtlDays: 90,            // Default semantic memory lifetime
  proceduralSuccessThreshold: 0.75, // Min success rate for procedural
};

initializeMemoryService(undefined, config);
```

---

## Questions?

If you have questions about memory system design or integration, check:
1. `src/types/memory.ts` — Type definitions with detailed JSDoc
2. `src/utils/memoryService.ts` — Core operations and examples
3. `src/utils/consolidationEngine.ts` — Pattern detection logic
