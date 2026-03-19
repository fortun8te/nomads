# Memory Architecture for Nomads — Concrete Recommendations

Research date: 2026-03-19
Author: Claude (based on codebase audit + review of MemGPT/Letta, Mem0, LangGraph, LangChain memory patterns)

---

## 1. What Memory Types Actually Matter

There are four classical memory types for agents. Here is an honest verdict on each for Nomads specifically.

### 1.1 Working Memory (in-context, immediate)

**What it is:** Everything currently in the LLM's context window — the system prompt, the conversation so far, injected facts, tool results.

**Verdict: This is the only memory that 100% reliably affects output quality.** Everything else is plumbing to get the right things *into* this window. The job of every other memory tier is to decide what earns a spot here.

**Current state in Nomads:** Handled per-stage by each hook/agent. No unified working-memory budget.

**What to do:** Implement a token budget enforcer — a simple function that accepts a target token limit and a list of candidate blocks (system prompt, memories, conversation history, injected context) and trims the lower-priority blocks first. See Section 5 for the budget breakdown.

---

### 1.2 Episodic Memory (past events/cycles)

**What it is:** Records of what happened before — past cycles, what angles worked, what the model decided, what the user said.

**Verdict: High value for Nomads.** The "Memories" stage already runs after each cycle and is supposed to archive learnings. The problem is those learnings go into `memoryStore.ts` (localStorage, flat array, substring search only) and have no retrieval mechanism that connects them back to future research/make/test prompts.

**What to do:**
- Keep the Memories stage output.
- Restructure what it writes (see Section 3 for the schema).
- Inject the 3-5 most relevant past cycle outcomes into the Research orchestrator prompt and the Make stage prompt.
- Retrieval can stay keyword-based (search by `campaignId`, `productCategory`, `adAngle` tags) — no vector store needed for this.

---

### 1.3 Semantic Memory (facts, knowledge)

**What it is:** Stable facts that don't change with each cycle — brand DNA, product details, market constants, user's style preferences.

**Verdict: Already exists in Nomads via `userProfile.ts` and the Brand Hub preset data, but it is not being systematically injected into prompts.** The `getUserMemories()` function exists but there is no evidence it is called at agent startup in `useCycleLoop.ts` or `researchAgents.ts`.

**What to do:**
- Brand DNA (from `presetData`) → always inject, compact form, into every stage prompt. This is already partially done via `buildOrchestratorBrandContext()`. Extend this pattern to all stages.
- User preferences → inject once into the agent session system prompt (already in `userProfile.ts`, needs to be wired up).
- Market facts from past research → inject the key "what we already know" summary at the top of Phase 2 orchestrator iterations instead of re-discovering it each run.

---

### 1.4 Procedural Memory (how to do things)

**What it is:** Skill knowledge — how to write a PAS framework ad, how to structure a desire-analysis JSON, how the orchestrator decides when to stop.

**Verdict: Skip building a separate procedural memory store.** In Nomads this knowledge lives in the prompts themselves (`src/utils/prompts.ts`, stage-specific system prompts). That is the right place for it. Procedural memory as a separate retrieval system adds complexity without benefit at this scale. The only exception is if you build a "reflection-rewriting" loop (like LangGraph's approach) that mutates the system prompt based on past failures — that is a Phase 9+ feature.

---

### 1.5 What to Skip Entirely

- **Raw conversation history injection:** Do not inject full past conversation turns into new cycles. Summarize instead (see Section 4).
- **General-purpose memory with no scope:** The current `type: 'general'` memories in `memoryStore.ts` are vague. Seed memories like "Nomad is an autonomous marketing agent" waste tokens.
- **Cross-product knowledge bleed:** Research findings from a collagen campaign should not pollute a fashion brand campaign. Scope memories strictly to `campaignId`.

---

## 2. What the Top Systems Do (Practical Summary)

### Letta/MemGPT

Three tiers:
1. **Core memory** — pinned to the system prompt, always in context. Small (typically 1-4KB). The agent can rewrite it via tool calls.
2. **Recall storage** — full conversation history in a database, searchable by keyword or semantic similarity. Paged into context on demand.
3. **Archival storage** — unlimited external facts, vector-searched on demand.

The key insight: the agent itself decides what to page in/out by calling memory tools. This works well for long-running autonomous agents but adds latency and complexity. **For Nomads' campaign-scoped, orchestrated pipeline, you do not need the agent to self-manage memory. You can pre-compute what to inject.**

### Mem0

Uses an LLM call to extract atomic facts from each conversation turn. Each fact is stored as an embedding in a vector store. On next query, semantic search returns the top-k relevant facts. The LLM decides ADD/UPDATE/DELETE when new facts conflict with existing ones.

Key pattern worth stealing: **the action-based deduplication model (ADD/UPDATE/DELETE/NONE).** When the Memories stage runs, instead of just appending a new memory blob, it should compare against existing memories for the same campaign and update or delete stale ones.

### LangGraph

Categorizes memory as:
- **Short-term (thread-scoped):** current session message history
- **Long-term (cross-thread):** semantic facts, episodic records, procedural rules — stored under namespaced keys

Two write patterns:
- **Hot path:** write memory synchronously during agent execution (adds latency)
- **Background:** write asynchronously after the fact (Nomads' current approach — correct choice)

LangGraph explicitly warns that long conversations are the main context window killer. Their recommended mitigation: **ConversationSummaryBufferMemory** — keep the last N raw messages verbatim, summarize everything older. For Nomads: keep the last stage's output raw, summarize older stages.

### OpenAI Assistants

Store files + message threads. Context window managed by automatic truncation (oldest messages first). Simple but lossy — no semantic retrieval.

### Claude Projects

Store user-uploaded documents + a persistent system instruction. Retrieval is automatic (Claude decides what to attend to). Not inspectable or programmable — irrelevant for Nomads.

---

## 3. Recommended Data Structures

### 3.1 CampaignMemory (replaces current `Memory` type for campaign/research memories)

Store in IndexedDB under key `nomad-campaign-memories`.

```typescript
interface CampaignMemory {
  id: string;                      // "cmem-{timestamp}-{random}"
  campaignId: string;              // strict scoping — never crosses campaigns
  cycleNumber: number;             // which cycle produced this
  category:
    | 'winning-angle'              // ad angle that scored well in Test stage
    | 'losing-angle'               // angle that was rejected and why
    | 'audience-insight'           // specific audience behavior/language finding
    | 'competitor-move'            // competitor positioning that changed
    | 'market-fact'                // stable market fact (bioavailability claims, etc.)
    | 'brand-constraint'           // things the brand cannot/will not do
    | 'objection-pattern'          // recurring purchase objection + how it was handled
    | 'research-gap';              // known unknowns — things we tried to research but couldn't confirm
  content: string;                 // 1-3 sentence factual statement, no fluff
  confidence: 'high' | 'medium' | 'low';  // high = test-validated, medium = research-backed, low = inferred
  tags: string[];                  // e.g. ['supplements', 'collagen', 'meta-ads', 'desire-angle']
  createdAt: number;               // Unix ms
  lastAccessedAt: number;
  accessCount: number;
  supersededBy?: string;           // id of newer memory that replaces this one
  sourceStage: 'research' | 'objections' | 'taste' | 'make' | 'test' | 'memories';
}
```

**Key differences from current `Memory` type:**
- `campaignId` is mandatory — no cross-contamination
- `category` is specific and actionable (not just 'research' or 'general')
- `confidence` enables filtering — only inject `high` confidence memories into Make stage prompts
- `supersededBy` enables the Mem0-style UPDATE pattern without deleting history
- Stored in IndexedDB (not localStorage — localStorage has a 5-10MB limit and blocks the main thread)

### 3.2 SessionMemory (working memory for a single cycle run)

Keep in-memory only (JavaScript object, not persisted). Lives in `useCycleLoop.ts` state. Cleared at cycle start.

```typescript
interface SessionMemory {
  cycleId: string;
  campaignId: string;
  stageOutputs: Record<string, string>;   // stage name → compressed output
  injectedMemoryIds: string[];            // which CampaignMemories were injected this cycle
  tokenBudgetUsed: number;               // running count of tokens spent on memory injection
  researchCoverage: Record<string, number>; // dimension → coverage %
}
```

### 3.3 UserProfile (keep as-is, minor extension)

The existing `userProfile.ts` structure is fine. Add one field:

```typescript
interface UserProfile {
  // ... existing fields ...
  communicationExamples: string[];   // up to 3 examples of feedback the user gave on past output
                                     // e.g. "Too corporate — strip the adjectives"
}
```

This is the single highest-ROI user memory addition. When the agent gets negative feedback, extract the pattern and store it here. Inject these examples into the Make stage system prompt.

### 3.4 ResearchKnowledgeBase (semantic facts, cross-cycle)

For campaigns that run many cycles, it becomes expensive to re-research the same market facts. Store compressed research findings per campaign.

```typescript
interface ResearchKnowledgeBase {
  campaignId: string;
  lastUpdated: number;
  productCategory: string;           // e.g. 'marine-collagen-supplement'
  marketFacts: string[];             // bullet list of confirmed stable facts (5-15 items)
  audienceLanguage: string[];        // exact phrases, words, idioms used by the target audience
  competitorPositions: Array<{
    brand: string;
    angle: string;                   // their main positioning claim
    weakness: string;                // gap Nomads found
  }>;
  researchedTopics: string[];        // list of queries already searched — prevents re-searching
}
```

Stored in IndexedDB. Updated (not replaced) each cycle by the Memories stage.

---

## 4. Context Window Budget Strategy

Nomads uses GLM-4.7-flash (30B, likely 32K-128K context) for most stages and LFM-2.5 (1.2B, likely 4K-8K context) for compression. Budget accordingly.

### Recommended Token Allocation Per Stage

| Slot | GLM-4.7 Budget | LFM-2.5 Budget | Notes |
|------|---------------|----------------|-------|
| System prompt (instructions) | 800-1200 | 400-600 | Fixed per stage |
| Brand DNA block | 300-500 | 150-250 | Compact version always |
| User preferences | 100-150 | 50 | 3-4 bullets max |
| Injected memories | 500-800 | 0 | LFM doesn't need memories |
| Past stage output (raw) | 1500-3000 | 500-1000 | Current stage's direct input |
| Older stage summaries | 300-500 | 0 | Compressed, not raw |
| Tool call budget / generation | remainder | remainder | |

**Total memory budget per GLM call: ~1500-2000 tokens for all injected memories.**

This means: inject at most 5-8 CampaignMemories per prompt. Pick the most relevant by category and confidence.

### Summarization Threshold

- If a stage output exceeds 4000 tokens, compress it before using as input to the next stage.
- The LFM-2.5 model (already in use for compression) should handle this. Target: 600-800 tokens for a compressed stage summary.
- Keep the last stage's output raw (the direct predecessor). Compress everything older.
- Pattern: `[compressed-research-summary] [compressed-objections-summary] [raw-taste-output]` → Make stage.

### The "Everything is Important" Trap

This is the most common failure mode. To avoid it:

1. **Never inject all memories.** Always filter to the current task. Make stage → inject only `winning-angle` and `losing-angle` memories. Research stage → inject only `research-gap` and `market-fact` memories.
2. **Category-gated retrieval:** Each stage has a whitelist of memory categories it can receive. Hard-code this.
3. **Max 5 memories per prompt, max 150 tokens each.** If a memory needs more than 150 tokens to express, it should be split into multiple atomic memories or compressed.
4. **Confidence gate for Make stage:** Only inject `confidence: 'high'` memories. Medium/low confidence memories stay in the audit trail but don't pollute the creative context.

---

## 5. Retrieval Strategy: When to Use Which

### Keyword/Tag-based Retrieval (recommended for Nomads)

**Use when:** retrieving campaign-scoped memories by category, cycling through known facts, retrieving by `cycleNumber` range.

**How:** Filter by `campaignId` + `category` + `confidence`. Sort by `accessCount` desc (frequently accessed = more validated). Take top N.

**Cost:** Zero — pure JavaScript filter/sort on IndexedDB results. No model calls.

**Good for:** All memory injection in Nomads' current pipeline.

### Semantic/Vector Retrieval

**Use when:** you have >500 memories per campaign, OR you need cross-campaign retrieval (e.g. "what worked for other supplement brands"), OR the user query is a free-form question.

**Not needed yet.** At Nomads' current scale (dozens of memories per campaign, no cross-campaign retrieval), keyword retrieval is faster, more predictable, and has zero infrastructure cost.

**If you do need it later:** Use Chroma (Python, local, pip install chromadb) or FAISS (if you want no network calls at all). Qdrant has a local mode too but requires a separate process. For a browser-based app, these require a sidecar server — similar to how Wayfarer is already run. Chroma is the easiest to self-host and has a Python HTTP server mode.

### Recency Weighting

**Formula:** `score = confidence_weight * (1 / (1 + days_old * 0.1))`

Where `confidence_weight` = 1.0 for high, 0.6 for medium, 0.3 for low.

This naturally downweights memories from 30+ days ago. Apply this when sorting memories for injection. Memories from the same campaign but 2 cycles ago should score lower than fresh memories from last cycle.

### How Many Memories to Inject

Based on LangGraph/LangChain research and Mem0's defaults:

- **3-5 memories per prompt** is the sweet spot.
- Beyond 7, the model starts to average them out and the marginal value drops.
- Research stage: 3 memories (1 `market-fact`, 1 `research-gap`, 1 `audience-insight`).
- Make stage: 5 memories (2 `winning-angle`, 1 `losing-angle`, 1 `objection-pattern`, 1 `brand-constraint`).
- Test stage: 3 memories (the Make stage output's top-3 angles, not historical memories).

---

## 6. What NOT to Store

### Noise vs. Signal

| Do NOT store | Why |
|---|---|
| Raw LLM output verbatim | Too long, too redundant — compress first |
| Failed web search results | Noise — store the *query* in `researchedTopics`, not the empty result |
| Intermediate reasoning steps (thinking tokens) | Ephemeral, not reusable across cycles |
| Seed/default memories | They never update and waste retrieval budget |
| Confidence: low memories from early cycles | Likely superseded by actual research |
| Stage outputs for stages that were aborted | Partial data corrupts future cycles |

### Stale Memory Detection

Current `memoryStore.ts` has `lastAccessedAt` and `accessCount` — good start. Add:

1. **TTL by category:** `market-fact` memories expire after 90 days (markets change). `winning-angle` memories expire after 30 days (creative fatigue). `audience-insight` memories expire after 60 days.
2. **Supersession:** When the Memories stage generates a new `winning-angle` for the same product, it should search for existing `winning-angle` memories with the same tags and either UPDATE (set `supersededBy`) or confirm they are still valid.
3. **Conflict resolution:** If a new memory contradicts an old one (e.g., "objection-handling outperforms desire ads" vs. a new cycle finding "desire-based copy won this round"), store both with different `cycleNumber` values and let the injection logic pick the most recent.

### Memory Conflicts

Do not try to auto-resolve conflicts with another LLM call (this is expensive and circular). Instead:

- Store conflicting memories with their `cycleNumber` and `confidence`.
- At injection time, if two memories in the same category conflict, inject the more recent one only.
- Surface the conflict in the UI (a "conflicting memories" warning badge) so the user can manually review.

---

## 7. What the Current Nomads Codebase Has

| Feature | Status | Location |
|---|---|---|
| Memory storage (localStorage) | Exists, flat | `memoryStore.ts` |
| User profile | Exists, not wired to prompts | `userProfile.ts` |
| Campaign/cycle storage (IndexedDB) | Exists, solid | `storage.ts` |
| Research audit trail | Exists, good | `researchAudit.ts` |
| Chat conversation history (IndexedDB) | Exists | `chatHistory.ts` |
| Memory injection into prompts | Missing | — |
| Campaign-scoped memory retrieval | Missing | — |
| Memories stage → IndexedDB | Stage exists, writes to localStorage only | `useCycleLoop.ts` |
| Summarization of old stage outputs | Missing | — |
| Token budget tracking for memory | Missing | — |
| Stale memory detection / TTL | Missing | — |

**The single biggest gap:** The Memories stage runs and generates text, but that text is not being parsed and stored as structured `CampaignMemory` objects. It just streams out as UI text and is never retrieved. Fix this first.

---

## 8. What to Implement in IndexedDB vs. What Needs a Vector Store

### Stay in IndexedDB (implement now, free, already there)

| Store | Key | Contents |
|---|---|---|
| `nomad-campaign-memories` | campaignId + memId | `CampaignMemory[]` — all typed campaign learnings |
| `nomad-research-kb` | campaignId | `ResearchKnowledgeBase` — compressed per-campaign knowledge |
| Existing: `campaigns`, `cycles`, `images` | — | Already working, keep as-is |

IndexedDB can hold gigabytes. For text-based memories (no embeddings), it is the right choice indefinitely.

### Consider a Vector Store Only If

- You exceed ~1000 memories per campaign and keyword search is returning too many false positives.
- You want cross-campaign semantic search ("find all winning angles for supplement brands").
- You build a user-facing "ask about past campaigns" chat feature.

**If/when you need a vector store:** Chroma is the recommended choice.
- Pure Python, runs locally, zero API cost.
- Already have a Python sidecar (Wayfarer). Add Chroma as a second endpoint in the same FastAPI app.
- Embedding model: `nomic-embed-text` via Ollama (already running) — no extra cost.
- At 1000 memories, Chroma query latency is <20ms warm.
- Collections: one per campaign (`campaign_{campaignId}`), plus one global user collection.

**FAISS:** Faster for pure similarity search at scale, but no metadata filtering and no persistent server — you'd need to save/load the index file manually. More code, less flexibility. Skip unless you need millisecond-scale retrieval at 10M+ vectors.

**Qdrant:** Best feature set (filtering + vectors combined), but requires running a separate Docker container. Fine if you already use Docker (you do for SearXNG). Worth considering for Phase 9+.

---

## 9. Implementation Roadmap

Ordered by ROI / effort.

### Phase A — Wire existing memory into prompts (1-2 days, high ROI)

1. Call `getUserMemories()` and inject into every stage's system prompt in `useCycleLoop.ts`. Already built, just not called.
2. Inject `presetData.brand` as a compact block into Make and Test stage prompts (extend `buildOrchestratorBrandContext` pattern to all stages).
3. Stop injecting seed memories (they're noise).

**Estimated tokens saved/gained:** +300 tokens of useful context per stage at zero new code complexity.

### Phase B — Structured CampaignMemory store (3-4 days, high ROI)

1. Move `memoryStore.ts` from localStorage to IndexedDB.
2. Replace the `Memory` type with `CampaignMemory` type (add `campaignId`, `category`, `confidence`, `supersededBy`).
3. Update the Memories stage prompt to output structured JSON that maps to `CampaignMemory[]` instead of freeform text.
4. Parse and persist those memories to IndexedDB after each cycle completes.
5. Add `retrieveCampaignMemories(campaignId, categories, maxCount)` function that filters + sorts by recency-weighted score.

**Effort:** Medium. The Memories stage already exists — it just needs a structured output format.

### Phase C — Memory injection into pipeline stages (2-3 days, high ROI)

1. At the start of each Research Phase 2 orchestrator iteration, inject relevant `market-fact` + `research-gap` memories from past cycles.
2. At Make stage, inject `winning-angle` + `losing-angle` + `objection-pattern` memories (confidence: high only).
3. Add token counter to the injection function — stop injecting if budget exceeded.
4. Wire `researchedTopics` from `ResearchKnowledgeBase` into the orchestrator prompt so it skips already-covered queries.

**Effort:** Medium. Mostly prompt engineering + calling the new retrieval function.

### Phase D — Stage output compression (2 days, medium ROI)

1. After each stage completes, if its output exceeds 4000 tokens, compress it with LFM-2.5.
2. Store the compressed summary alongside the raw output in the cycle record.
3. Use compressed summaries for "older stage" context injection; use raw only for the direct predecessor stage.

**Effort:** Low. LFM-2.5 is already in use for compression in the research pipeline.

### Phase E — ResearchKnowledgeBase (2-3 days, medium ROI)

1. After each research phase, extract the key facts into `ResearchKnowledgeBase` format.
2. Before starting a new cycle's research, inject the existing KB summary so the orchestrator doesn't re-research known facts.
3. Track `researchedTopics` to avoid duplicate queries across cycles.

**Effort:** Medium. Requires a structured extraction step after Phase 2 completes.

### Phase F — Stale memory TTL + conflict UI (1-2 days, low-medium ROI)

1. Add TTL check to `retrieveCampaignMemories` — filter out expired memories by category.
2. Add `supersededBy` chain resolution in retrieval.
3. Add a conflict indicator in the Memories UI panel when two memories in the same category disagree.

**Effort:** Low. Pure logic, no new infrastructure.

### Phase G — Vector store (only if needed, 3-5 days)

1. Add `chromadb` to Wayfarer's Python environment.
2. Expose `/memory/add` and `/memory/search` endpoints in `wayfarer_server.py`.
3. Add TypeScript client in `wayfarer.ts` (same pattern as existing Wayfarer client).
4. Use `nomic-embed-text` via Ollama for embeddings.
5. Migrate `CampaignMemory` writes to also embed + store in Chroma.
6. Use Chroma retrieval only for cross-campaign or free-text queries.

**Trigger for starting this phase:** When you have >3 campaigns with >100 memories each and keyword retrieval is failing.

---

## 10. What Manus/Claude Projects/OpenAI Assistants Do That You Should Not Copy

- **Auto-truncation (oldest first):** OpenAI Assistants truncate the oldest messages when context fills up. This works for chat but is wrong for a campaign pipeline — the oldest message might be the brand brief, which is the most critical context.
- **Everything in one giant system prompt:** Claude Projects lets you dump docs into a project knowledge base. It works but gives you no control over what gets attended to. For a pipeline agent, deterministic injection is better.
- **Managed memory with no visibility:** If you cannot see what the agent "knows," you cannot debug why it made bad creative decisions. IndexedDB + explicit retrieval logs give you full transparency.

---

## Summary: The 3 Things to Build First

1. **Wire `getUserMemories()` into stage prompts** — 2 hours, existing code, immediate improvement.
2. **Structured `CampaignMemory` output from the Memories stage + store in IndexedDB** — the foundation everything else builds on.
3. **Inject past `winning-angle` and `losing-angle` memories into the Make stage** — directly improves cycle-over-cycle learning, which is the core promise of the agent.

Everything beyond that is optimization. The vector store is probably never needed at Nomads' scale unless you build a multi-user SaaS version.
