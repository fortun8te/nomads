# Subagent Architecture — Nomads Research Pipeline

## Overview

The subagent system extends the nomads research pipeline with specialized, parallel intelligence agents. Instead of the orchestrator doing all analysis work sequentially, it can now spawn focused subagents for specific tasks (research, analysis, validation, etc.).

**Key Design Principles:**
- **Specialization**: Each role is optimized for a specific task (research vs. analysis vs. synthesis)
- **Parallelization**: Subagents run concurrently with unified abort signals (pause/resume)
- **Safety**: No external dependencies (Wayfarer text-only, no Playwright/computer-use)
- **Transparency**: All subagent work tracked in audit trail
- **Flexibility**: Opt-in per stage; can be enabled/disabled via modelConfig.ts

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Main Pipeline (useCycleLoop)                           │
│  ├─ Research Stage (useOrchestratedResearch)            │
│  │  ├─ Phase 1: Desire Analysis (4 steps)               │
│  │  └─ Phase 2: Web Research Orchestration              │
│  │     ├─ Orchestrator decides what to research         │
│  │     ├─ Spawns N researchers (Phase 2A)               │
│  │     ├─ Spawns synthesizer (Phase 2B)                 │
│  │     └─ Spawns validator (Phase 2C)                   │
│  └─ All downstream stages...                            │
└─────────────────────────────────────────────────────────┘
         │
         ├─── SubagentManager (spawning + lifecycle)
         ├─── SubagentRoles (7 role definitions)
         └─── SubagentTools (filtered tool set)
```

### Data Flow: Orchestrator → Subagents → Research Findings

```
1. Orchestrator (Phase 2A)
   ├─ Analyzes current knowledge state
   ├─ Decides: "Need 3 research clusters"
   ├─ Spawns 3 Researcher subagents in parallel
   │  ├─ Researcher #1: "customer objections" query cluster
   │  ├─ Researcher #2: "competitor pricing" query cluster
   │  └─ Researcher #3: "market trends" query cluster
   └─ Wait for all 3 to complete

2. Researchers (parallel)
   ├─ web_search("objections" queries) → pages
   ├─ analyze_page(urls) → extracted text
   ├─ Compress findings
   └─ Return structured output

3. Synthesizer (Phase 2B) — runs after researchers complete
   ├─ Takes all researcher outputs
   ├─ Merges + deduplicates
   ├─ Maps coverage across 10 dimensions
   └─ Returns consolidated findings

4. Validator (Phase 2C) — runs after synthesizer
   ├─ Checks finding quality
   ├─ Identifies gaps
   ├─ Recommends next research topics
   └─ Returns coverage assessment

5. Reflection Agent (existing)
   ├─ Uses validator output
   ├─ Decides: continue research or stop
   └─ Loops back to step 1 (orchestrator)
```

---

## Subagent Roles (7 Specializations)

Each role is optimized for a specific function. All use the same Ollama endpoint.

| Role | Purpose | Tools | Input | Output | Est. Time |
|------|---------|-------|-------|--------|-----------|
| **researcher** | Web search + page analysis + synthesis | `web_search`, `analyze_page` | Query + context | Structured findings [sources] | ~30s |
| **analyzer** | Deep pattern analysis from content | — | Research findings | Insights + implications | ~15s |
| **synthesizer** | Merge + aggregate findings | — | Multiple finding blocks | Consolidated narrative + coverage map | ~20s |
| **validator** | Verify coverage + quality | — | Research findings | Gap assessment + confidence scores | ~15s |
| **strategist** | Extract creative strategy | — | Research findings | Strategic opportunities | ~20s |
| **compressor** | Ultra-fast fact extraction | — | Large text content | Bullet-point facts (max 200 words) | ~5s |
| **evaluator** | Score and rank options | — | Multiple options | Ranked scores + recommendations | ~15s |

### Role System Prompts

Each role has a specialized system prompt that:
- Explains its role and responsibilities
- Lists allowed tools
- Specifies output format
- Includes domain-specific constraints

Example: The **Researcher** role:
```
You are a specialized Web Researcher subagent. Your role is to:
1. Execute web searches based on specific queries
2. Analyze discovered pages for relevant insights
3. Synthesize findings into structured blocks
4. Identify and cite sources precisely

CONSTRAINTS:
- You can use web_search and analyze_page tools ONLY
- Focus on textual content and facts
- Always cite sources with URLs
- Extract exact numbers, quotes, and data points
```

---

## Tool Access (Safety Constraints)

### Allowed Tools
Subagents can use a **filtered subset** of the main agent's tools:

- **web_search**: Wayfarer text-only search (via SearXNG)
- **analyze_page**: Extract text from URLs (NO Playwright, NO screenshots)
- **reason**: Call LLM for analysis/synthesis (for non-search roles)
- **record_finding**: Log discoveries to audit trail

### Blocked Tools (Not Available to Subagents)
- ✗ `screenshot` / `analyze_visual` (Wayfarer Plus)
- ✗ `computer_use` (browser automation)
- ✗ `image_generation` (Freepik)
- ✗ External APIs (only Ollama + SearXNG)
- ✗ File system write (read-only)

### Tool Authorization by Role

```
researcher:   [web_search, analyze_page, record_finding]
analyzer:     [reason, record_finding]
synthesizer:  [reason, record_finding]
validator:    [reason, record_finding]
strategist:   [reason, record_finding]
compressor:   [reason, record_finding]
evaluator:    [reason, record_finding]
```

---

## Spawning Mechanism

### How to Spawn a Subagent

From the orchestrator (in Phase 2 research):

```typescript
// In researchAgents.ts — orchestratorAgent function

const manager = createSubagentManager();

// Spawn 3 researchers for different query clusters
const researcherTasks = [
  {
    id: 'researcher-objections',
    role: 'researcher',
    task: 'Find customer objections and concerns',
    context: 'Market: collagen supplements. Audience: fitness enthusiasts.',
    input: JSON.stringify([
      'customer complaints about collagen supplements',
      'collagen supplement side effects Reddit',
      'why people don\'t buy collagen',
    ]),
    signal: abortSignal,  // Use main agent's abort signal
  },
  // ... more researcher tasks
];

const results = await Promise.all(
  researcherTasks.map(task => manager.spawn(task))
);

// Results are now available
console.log(results[0].output);  // Structured findings
console.log(results[0].tokensUsed);  // For audit trail
```

### API: SubagentManager

```typescript
// Create a new manager for this research cycle
const manager = createSubagentManager();

// Spawn a subagent
const result: SubagentResult = await manager.spawn({
  id: 'sub-123',
  role: 'researcher',
  task: 'Find market trends',
  context: 'Product: collagen supplement',
  input: 'market trends 2024 2025',
  model: 'qwen3.5:4b',  // optional override
  timeoutMs: 60000,     // optional timeout
  signal: abortSignal,  // optional abort signal
});

// Check status
const progress = manager.getStatus('sub-123');
console.log(`${progress.progress}% complete, ${progress.elapsedMs}ms elapsed`);

// Abort a specific subagent
manager.abortSubagent('sub-123');

// Abort all subagents at once
manager.abortAll();

// Wait for all to complete
const allResults = await manager.waitAll();

// Track concurrency
console.log(`Active: ${manager.getActiveCount()}`);
console.log(`Researchers active: ${manager.getActiveCountForRole('researcher')}`);
```

---

## Abort Signal Threading

Subagents inherit the main agent's abort signal for unified pause/resume:

```typescript
// Main pipeline (useCycleLoop)
const abortController = new AbortController();

// Pass through to orchestrator
await executeOrchestratedResearch({
  // ...
  abortSignal: abortController.signal,
});

// Inside orchestrator → subagent spawn
const manager = createSubagentManager();
const result = await manager.spawn({
  // ...
  signal: abortController.signal,  // Same signal as main agent
});

// User clicks "Pause" → abortController.abort()
// → All subagents halt immediately
// → All resume when user clicks "Resume"
```

---

## Output Parsing

Subagents structure output with markers for UI parsing:

### Researcher Output Format
```
[FINDINGS]
Topic: Customer Objections to Collagen Supplements
Key Points:
- Price sensitivity: most objections center on cost ($X/month) [Source: reddit.com/r/fitness]
- Efficacy doubt: "I tried collagen for 3 months, saw no difference" [Source: amazon.com/reviews]
- GI issues: digestive side effects reported in 15% of reviews [Source: healthline.com]
Gaps: Limited data on long-term effects (>1 year)
[/FINDINGS]
```

### Analyzer Output Format
```
[ANALYSIS]
Insight: Price is psychological barrier, not actual cost
Evidence: $50-80/month is objection #1, but $2-3/day is affordable for target audience
Implication: Reframe as daily cost; bundle with complementary products
Confidence: high
[/ANALYSIS]
```

### Validator Output Format
```
[VALIDATION]
Dimension: customer_objections
Covered: partial
Confidence: 65
Gaps: Limited data on alternatives customers use instead; no data on objection resolution tactics
Recommendations:
- "What supplements do people buy instead of collagen?"
- "How do top brands overcome objection XYZ?"
[/VALIDATION]
```

---

## Research Audit Integration

All subagent work is recorded in the audit trail:

```typescript
// In researchAudit.ts
recordResearchSource({
  url: 'reddit.com/r/fitness/comments/...',
  query: 'collagen supplement complaints',
  source: 'web',
  contentLength: 2048,
  extractedSnippet: '"I wasted $80 on this..."',
});

recordResearchModel('qwen3.5:4b');  // Called by subagent
```

Final audit trail:
```typescript
{
  totalSources: 87,
  sourcesByType: {
    text: 75,
    visual: 0,  // No visual analysis for subagents
    reddit: 12,
  },
  sourceList: [
    { url: 'reddit.com/...', query: 'collagen complaints', source: 'web', ... },
    { url: 'healthline.com/...', query: 'collagen side effects', source: 'web', ... },
    // ... more
  ],
  modelsUsed: ['qwen3.5:4b', 'qwen3.5:2b'],
  totalTokensGenerated: 145000,
  subagentWork: {
    researchers: 3,
    synthesizers: 1,
    validators: 1,
    // ...
  },
}
```

---

## UI Integration

### ResearchOutput.tsx Changes
Display subagent activity with collapsible sections:

```
[Research Output]
├─ Phase 2 — Web Research Orchestration
│  ├─ Iteration 1
│  │  ├─ Orchestrator Decision (blue) — "Need: objections, pricing, trends"
│  │  ├─ Spawned 3 Researchers (teal)
│  │  │  ├─ Researcher #1 (objections) — 2.3K tokens, 18.4s
│  │  │  │  └─ Finding: Price sensitivity, GI side effects...
│  │  │  ├─ Researcher #2 (pricing) — 1.9K tokens, 22.1s
│  │  │  └─ Researcher #3 (trends) — 2.1K tokens, 19.7s
│  │  ├─ Synthesizer (purple)
│  │  │  └─ Merged 3 researcher outputs, 87% coverage
│  │  └─ Validator (amber)
│  │     └─ Gaps: Long-term efficacy data needed
│  │
│  └─ Iteration 2
│     └─ ...
```

### Activity Bar Updates
Show live token count per subagent:

```
[Activity Bar]
Researchers: 3 active | 45.2K tokens | 31s elapsed
Synthesizer: 1 active | 12.4K tokens | 8s elapsed
Validator: pending...
```

### Pause/Resume Behavior
- **Pause**: Aborts all subagents immediately via abort signal
- **Resume**: Subagents restart from where they were paused (or from scratch, depending on logic)
- **Stop**: Aborts all and moves to next stage

---

## Configuration

### modelConfig.ts Flags

Enable/disable subagent spawning per preset:

```typescript
const RESEARCH_PRESETS: ResearchPresetDef[] = [
  {
    id: 'super-quick',
    limits: {
      // ... existing fields
      enableSubagentResearch: false,      // SQ: skip subagents
      enableSubagentValidation: false,
      // ...
    },
  },
  {
    id: 'normal',
    limits: {
      enableSubagentResearch: true,       // NR: use researchers
      maxResearcherSubagents: 3,          // max 3 parallel
      enableSubagentValidation: true,
      // ...
    },
  },
  {
    id: 'max',
    limits: {
      enableSubagentResearch: true,
      maxResearcherSubagents: 5,
      enableSubagentValidation: true,
      enableSubagentAnalysis: true,       // MX: full suite
      enableSubagentStrategy: true,
      // ...
    },
  },
];
```

### LocalStorage Overrides

Users can override from the UI:

```typescript
localStorage.setItem('subagent_research_enabled', 'true');
localStorage.setItem('max_researcher_subagents', '5');
localStorage.setItem('subagent_validation_enabled', 'true');
```

---

## Example Workflows

### Workflow 1: Parallel Research (Phase 2A)
```
Orchestrator decides: "Need pricing, objections, and trends"
↓
Spawn 3 Researcher subagents (parallel):
  1. "Find current collagen prices"
  2. "Find customer objections"
  3. "Find market growth trends"
↓
All 3 run in parallel (~20-30s total, vs 60s sequentially)
↓
Aggregated findings → Synthesizer
```

### Workflow 2: Validation (Phase 2C)
```
After research iteration:
↓
Spawn Validator subagent:
  "Check coverage across 10 dimensions"
  Input: All research findings so far
↓
Validator returns:
  - market_size: 95% (high confidence)
  - competitor_analysis: 70% (moderate)
  - customer_language: 80% (good)
  - [gaps identified]
↓
Reflection agent sees: "Need more on competitors"
↓
Loop → Orchestrator spawns researchers for "competitor ads"
```

### Workflow 3: Strategic Analysis (Post-Research)
```
After research complete:
↓
Spawn 2 Strategists:
  1. "Extract brand differentiation angles"
  2. "Find positioning white space"
  Input: All research findings
↓
Strategists run in parallel (~15s each)
↓
Outputs → inform Angles stage
```

---

## Performance Characteristics

### Concurrency Model

```
Max Global Subagents:    10 (default, configurable)
Max per Role:            3-5 (varies by role)
Max Researchers:         5  (bottleneck: LLM synthesis, not search)
Max Synthesizers:        2  (rare, mostly sequential)
Max Validators:          2  (rare, mostly sequential)
```

### Token Usage Estimation

```
1 Researcher run (search + synthesis):
  - Search queries: ~500 tokens
  - Page compression (5 pages): ~3K tokens
  - Synthesis: ~1K tokens
  - Total: ~4.5K tokens, ~20-30s
  - Cost: ~20% of orchestrator iteration time

3 Researchers in parallel:
  - Total: ~13.5K tokens, ~20-30s (same wall-clock time!)
  - Savings vs sequential: ~40-60s
```

### Time Breakdown (Normal Preset, 1 iteration)

```
Sequential (no subagents):
├─ Orchestrator decision: 8s
├─ 3 web searches (serial): 15s
├─ 3 page analyses (serial): 18s
├─ 3 compressions (serial): 9s
├─ 1 synthesis: 12s
└─ Total: ~62s

Parallel (with subagents):
├─ Orchestrator decision: 8s
├─ 3 researchers (parallel): 20s  ← 3x work, same time
├─ 1 synthesizer: 12s
└─ Total: ~40s, 35% faster
```

---

## Error Handling

Subagents handle errors gracefully:

```typescript
SubagentResult {
  status: 'error' | 'aborted' | 'timeout' | 'success',
  error?: string,
}
```

### Error Cases
- **Tool not available for role**: Returns error, doesn't try
- **LLM timeout**: Captures partial output, marks as timeout
- **Abort signal**: Halts immediately, returns empty output
- **Ollama unreachable**: Returns error, main pipeline continues
- **Max concurrency exceeded**: Queues or returns error (configurable)

---

## Testing Strategy

### Unit Tests
- `subagentRoles.spec.ts`: Role config validation
- `subagentTools.spec.ts`: Tool authorization checks
- `subagentManager.spec.ts`: Spawn/abort lifecycle

### Integration Tests
- Spawn 3 researchers, verify outputs merge correctly
- Abort signal propagates to all subagents
- Token tracking works for subagent work

### E2E Tests
- Full research cycle with subagents enabled
- Compare results (quality, time) with subagents vs without
- Pause/resume cycle integrity

---

## Future Enhancements

1. **Subagent Tool Use**: Full ReAct loop allowing subagents to call tools multiple times
2. **Subagent Chaining**: Orchestrate dependencies (validator → recommend topics → spawn new researchers)
3. **Subagent Rollout**: A/B test different role configurations
4. **Subagent Cost Tracking**: Fine-grained token accounting per role
5. **Subagent Templates**: Save/reuse common task combinations
6. **Cross-Agent Learning**: Earlier research informs later stages
