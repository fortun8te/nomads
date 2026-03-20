# Agent Memory Architecture Research

**Date:** 2026-03-20
**Scope:** How top agentic AI systems handle memory, context management, and long-horizon task execution

---

## 1. Systems Surveyed

- **LangChain / LangGraph** — `langchain-ai/langchain`, `langchain-ai/langgraph`
- **Microsoft AutoGen** — `microsoft/autogen` (autogen-core, autogen-ext experimental)
- **mem0** — `mem0ai/mem0`
- **Generative Agents** (Park et al. 2023, arXiv 2304.03442) — Stanford simulacra paper
- **LangChain memory blog** — `blog.langchain.com/memory-for-agents`

---

## 2. The Core Problem: Context Window Limits in Long Tasks

Every system surveyed agrees on the root constraint: **LLM context windows are fixed, but tasks are not.** The full history of a long multi-step agent run cannot fit. Systems that ignore this fail catastrophically (the context overflows and the model either errors or hallucinates).

### How Each System Handles It

**AutoGen — three distinct context window strategies (implemented as swappable `model_context` classes):**

1. `BufferedChatCompletionContext(buffer_size=N)` — Keep only the last N messages. Oldest are simply dropped. Simple but loses earlier context entirely.
2. `TokenLimitedChatCompletionContext(token_limit=K)` — Count tokens precisely, drop messages from the middle of the history (not the ends) until under budget. Preserves the most recent messages and the initial system message.
3. `HeadAndTailChatCompletionContext(head_size=N, tail_size=M)` — Keep first N messages (anchors: system prompt, task definition) + last M messages (recent context). Messages in between are dropped and replaced with a `"Skipped N messages."` placeholder. This is the most sophisticated because it preserves the task anchor while keeping recency.

**LangChain — rolling summary buffer (`ConversationSummaryBufferMemory`):**

The key pattern: when token count exceeds `max_token_limit`, messages are popped from the front of the buffer and the LLM is called to produce a `moving_summary_buffer`. This running summary then gets prepended to all future contexts as a special `SystemMessage`. The prompt used is:
```
Progressively summarize the lines of conversation provided, adding onto the previous summary returning a new summary.
```
This is a **progressive / incremental** summarization approach — each pruning event extends the existing summary rather than re-summarizing from scratch.

**LangGraph — checkpoint-based persistence:**

LangGraph treats all agent state as a serialized checkpoint stored in a configurable backend (in-memory dict, PostgreSQL, Redis). Every step, the full graph state is checkpointed. The "context window" for the LLM is managed separately from the agent state — short-term memory is the conversation thread (managed per-step), long-term memory is a namespaced key-value store (`InMemoryStore` or `PostgresStore`) with optional vector search.

**Our system (contextManager.ts):**

Rolling window: keep last 10 messages verbatim, compress the rest into ~300 words via the `compressionFn`. Compressed history prepended as a `SYSTEM` message. Phase transitions do a hard reset: compress the entire phase output into ~500-word summary, persist to IndexedDB, and seed next phase with all phase summaries. This is functionally similar to the LangChain summary buffer but without incremental updating — it re-compresses the whole old block each time.

---

## 3. Memory Architecture: Episodic vs. Semantic vs. Procedural

This three-tier taxonomy is used consistently across all major systems (LangGraph docs, LangChain blog, mem0, Park et al. 2023, our own `memoryService.ts`).

| Tier | What It Stores | Confidence | Lifespan |
|------|---------------|------------|---------|
| **Episodic** | Specific events: "this campaign used X and got Y result" | Low (0.5, single observation) | Short-medium, gets consolidated |
| **Semantic** | Abstracted facts: "objection-handling copy outperforms desire copy for supplements ~18%" | Medium-high (0.65-0.95, evidence-based) | Long, has TTL |
| **Procedural** | Validated workflows: "run 4 parallel researchers, then reflection, then orchestrator decides" | High (0.75-0.95, field-tested) | Permanent until invalidated |

### The Generative Agents Architecture (Park et al. 2023 — Most Cited Pattern)

The Stanford paper implements the most comprehensive memory architecture studied:

**Importance Scoring** — Every observation is rated on a 1-10 importance scale by the LLM:
> "On the scale of 1 to 10, where 1 is purely mundane (e.g., brushing teeth, making bed) and 10 is extremely poignant (e.g., a breakup, college acceptance), rate the likely poignancy of the following piece of memory."

Only high-importance memories persist long-term. This is the **gating mechanism** that prevents episodic store bloat.

**Recency Decay** — Memories get a recency score that exponentially decays over time. Combined with importance and relevance (cosine similarity to the query), retrieval scores are computed:
```
retrieval_score = α × recency + β × importance + γ × cosine_similarity(query, memory)
```
Default weights: α=β=γ=1 (equal weighting).

**Reflection (Consolidation)** — When total importance of recent memories exceeds a threshold (e.g., 150 points accumulated), the agent runs a reflection pass:
1. Ask: "What are the 5 most salient high-level questions I can answer about my experiences?"
2. For each question, retrieve relevant memories and synthesize an insight
3. Store the insight as a new (higher-level, higher-importance) episodic memory

This is how episodic memories get consolidated into semantic memories **without the agent explicitly knowing the memory types** — the reflection layer handles it naturally.

### mem0 Architecture

mem0 uses a hybrid storage design with two parallel stores:

1. **Vector store** (Qdrant, Chroma, Pinecone, etc.) — stores embedded memory representations for semantic search
2. **Graph store** (Neo4j) — stores entity-relationship triples extracted from conversations

The pipeline for `add()`:
1. Parse incoming messages to extract "facts" via the `FACT_RETRIEVAL_PROMPT`
2. Embed the facts
3. Search the vector store for existing related memories
4. Call `DEFAULT_UPDATE_MEMORY_PROMPT` — the LLM decides ADD / UPDATE / DELETE / NONE for each existing memory given the new facts
5. Execute the operations; update the graph store with entity relations

This is **LLM-as-memory-manager** — the model itself decides what to remember, update, or forget. No hard-coded rules.

The three memory scopes mem0 supports:
- `user_id` — facts about the user (preferences, history)
- `agent_id` — facts about the agent itself (procedural memory, behavior patterns)
- `run_id` — session-specific ephemeral context

**Procedural memory** in mem0 uses `PROCEDURAL_MEMORY_SYSTEM_PROMPT` — the LLM is given the agent's full execution history and produces a numbered step-by-step summary preserving every action and its exact output verbatim. This is designed for browser/computer-use agents that need to resume mid-task.

### AutoGen Task-Centric Memory (Experimental)

The most sophisticated cross-session learning system found in the survey.

**The `MemoryBank` + `MemoryController` pattern:**

1. When an agent **fails** a task, `MemoryController.train_on_task()` iterates:
   - Attempt the task
   - If wrong, ask: "What insight would have helped?"
   - Store that insight as a `Memo(task=..., insight=...)`
   - Retry with the new memo injected — repeat until success or max_trials

2. Insights are indexed by **topics** extracted from the insight text. The prompter asks:
   > "Extract the task-completion topics that are covered. Each topic should be a meaningful phrase composed of a few words."
   Topics are stored in a `StringSimilarityMap` (vector DB).

3. On future tasks, `retrieve_relevant_memos()` does:
   - Optionally generalize the new task to abstract form
   - Extract topics from it
   - Similarity search topics → retrieve matching memos
   - Validate each memo: "Could this insight help solve this task? Reply 1 or 0"
   - Return validated memos, injected into the agent's prompt

This is **deliberate learning from failure** — the system specifically encodes "what went wrong and what fixed it."

---

## 4. Compression and Summarization Patterns

### Pattern 1: Rolling Window (Tail-only)
**AutoGen `BufferedChatCompletionContext`**
- Keep last N messages, drop the rest
- Fast, zero latency
- Problem: loses all earlier context

### Pattern 2: Progressive Summary (LangChain)
- When buffer exceeds limit, pop oldest messages
- LLM call: `predict_new_summary(pruned_messages, existing_summary)` → updated summary
- Summary prepended as system message next call
- Cost: 1 LLM call per prune event (amortized)
- Preserves semantic content of old messages in compressed form

### Pattern 3: Head + Tail (AutoGen)
- Keep first N messages (task anchor) + last M messages (recency)
- Middle messages dropped with "Skipped N messages" placeholder
- Zero LLM calls, zero latency
- Best for tasks where the original task description must remain precisely in context

### Pattern 4: Phase Summary (our system + LangGraph)
- Full context reset between major phases
- Each phase output compressed to ~500 words (our system) or checkpointed (LangGraph)
- Next phase gets: system prompt + all phase summaries + current working memory
- Works well for pipeline-style agents (which is exactly what we are)

### Pattern 5: Hierarchical Compression (Generative Agents)
- Immediate → reflection → long-term
- Reflection events triggered by accumulated importance score
- Most computationally expensive but most faithful to human memory

### Which Should We Use?

We already use Pattern 4 (phase summary) which is correct for our pipeline architecture. The missing piece is Pattern 2's **incremental summary** — instead of re-compressing the entire old block each time, we should maintain a running summary that gets updated incrementally. This halves compression cost.

---

## 5. Retrieval: Keyword vs. Vector vs. Hybrid

| Method | Systems Using It | Strengths | Weaknesses |
|--------|-----------------|-----------|------------|
| **Exact/substring match** | Our `memoryStore.ts` | Zero latency, zero cost, deterministic | Misses synonyms, requires exact terms |
| **BM25 (TF-IDF)** | mem0 graph search | Handles variable term length, good precision | No semantic understanding |
| **Vector similarity** | mem0, LangGraph store, AutoGen MemoryBank | Semantic matching, finds related concepts | Requires embedding model, compute cost |
| **Hybrid (BM25 + vector)** | mem0 (graph layer uses both) | Best of both | Most complex |
| **Recency + importance + similarity** | Generative Agents | Tunable, human-like retrieval | Requires importance scoring infrastructure |

**The practical sweet spot for us:** Because we use local Ollama models without a local embedding server, pure vector search is expensive. The best near-term upgrade is a **weighted scoring function** applied to our existing keyword search:

```
score = confidence × 0.4 + recency_boost × 0.2 + frequency_boost × 0.1 + tag_match × 0.3
```

This is exactly what `memoryService.ts` already implements in `retrieveMemories()`. The missing piece is wiring it to the pipeline so retrieved memories actually influence prompts.

---

## 6. Multi-Agent Memory Sharing and Synchronization

### AutoGen's Model
Each agent has its own `ChatCompletionContext` (short-term). Memory sharing between agents is done through the **store** — a shared namespace agents read from and write to. There is no automatic sync; agents must explicitly call `memory.update_context(model_context)` to inject relevant memories.

AutoGen's approach: **pull-based retrieval** — each agent pulls relevant memories from the shared store before each step. No push/broadcast.

### LangGraph's Model
The `Store` is a global, namespaced key-value object accessible to all nodes in the graph. Namespaces are structured as tuples: `("users", user_id)`, `("campaigns", campaign_id)`. Agents read/write the store; LangGraph provides no automatic conflict resolution (last-write-wins).

### mem0's Model
mem0 uses **scoped isolation** — memories are partitioned by `user_id`, `agent_id`, and `run_id`. Queries always filter by scope. This prevents unintended cross-contamination between campaigns or agents but requires explicit scope management.

### Our System's Gap
Our memories in `memoryStore.ts` are stored in localStorage (not IndexedDB) as a flat array. There is no scoping by campaign or by stage. A memory learned during a collagen supplement campaign could accidentally surface during a vitamin C campaign. The fix is adding a `campaignId` field as a filter — our `memoryService.ts` already has this in its type (`campaignId` on `EpisodicMemory`) but `memoryStore.ts` (the localStorage version actually used by the UI) does not.

---

## 7. Cross-Session Learning: What Worked vs. What Failed

### The AutoGen Pattern (Most Effective Found)
`MemoryController.train_on_task()` explicitly targets failures:
1. The agent attempts a task
2. If it fails, the system asks the LLM: "What insight would have helped?"
3. The insight is stored and the task is retried with it
4. If successful, the insight is kept; otherwise, iterate up to `max_train_trials`

This creates a **failure-indexed memory** — insights are specifically tagged to the type of failure that prompted them, making retrieval highly targeted.

### The Generative Agents Pattern
The reflection mechanism naturally produces cross-session learning. After N cycles, the reflection agent synthesizes: "Across all research runs, emotional/transformational copy consistently outperforms rational/feature-based copy for supplement brands." This gets stored as a high-importance semantic memory and surfaces in future campaigns.

### mem0's Pattern
The `DEFAULT_UPDATE_MEMORY_PROMPT` handles cross-session by merging: when a new fact contradicts an existing memory (e.g., "objection-handling copy wins" vs. new run where desire copy won), the LLM can UPDATE the memory with nuance ("objection-handling wins in 3 of 4 campaigns; desire copy won once for collagen specifically").

### Our System
The `Memories` stage at end of each cycle already runs, but the output is stored as flat strings in the cycle object. There is no retrieval mechanism that surfaces these memories to future cycles' prompts. The memories exist in IndexedDB but are not injected anywhere in the pipeline. **This is the highest-value gap identified.**

---

## 8. Importance Scoring: What Gets Remembered vs. Forgotten

### Generative Agents Approach
LLM-rated importance (1-10) at creation time. Memories with low importance are never promoted to long-term storage.

### mem0 Approach
No explicit importance score. Instead, importance is implicit in the LLM's ADD/UPDATE/DELETE decisions. Facts that are redundant get merged (UPDATE); facts about passing context get deleted; genuinely new facts get added.

### Our memoryService.ts Approach
Confidence scoring (0.5-0.95) based on evidence count:
- Episodic: 0.5 (single observation)
- Semantic: 0.65-0.95 (scales with episode count)
- Procedural: 0.75-0.95 (scales with success rate)

EMA-based confidence updates: `confidence = old × 0.95 + feedback × 0.05` — conservative decay, requires 20 feedback signals to meaningfully shift confidence. This is intentionally slow to prevent noise from one bad run destroying good memories.

TTL: semantic memories expire after 90 days by default.

### Consolidation Trigger
The weekly consolidation job groups episodic memories by tag, and when a tag group reaches 3+ episodes, consolidates them into a semantic memory. The threshold (3 episodes minimum) is taken directly from the mem0 design philosophy — you shouldn't generalize from a single observation.

---

## 9. Gap Analysis: What Our System Is Missing

### Priority 1 (Highest Impact): Memory-to-Pipeline Wiring

**Current state:** `memoryService.ts` is fully implemented but nothing in the pipeline reads from it. The `Memories` stage at end of each cycle writes a summary to the cycle object, but no future stage reads it back.

**What to build:** A `retrieveRelevantMemories(campaignContext, stage)` call that runs before the Orchestrator stage and injects top-K retrieved memories as context. The retrieval already works in `memoryService.ts` — the missing piece is calling it.

**Impact:** This is the difference between a system that learns and one that doesn't.

### Priority 2: Campaign-Scoped Memory Isolation

**Current state:** `memoryStore.ts` (localStorage layer, used by the UI) has no `campaignId`. All memories bleed together.

**What to build:** Add `campaignId?: string` to the `Memory` type in `memoryStore.ts`. Update `searchMemories()` to optionally filter by campaignId. The `memoryService.ts` types already have this.

### Priority 3: Importance Scoring at Write Time

**Current state:** All memories are treated equally. The weekly consolidation job is the only filtering mechanism.

**What to build:** When the `Memories` stage LLM generates the end-of-cycle memory summary, have it also output an importance score (1-5) for each memory. Only store memories with importance >= 3. This prevents the store from accumulating noise from low-quality cycles.

This matches the Generative Agents pattern — importance scoring prevents store bloat.

### Priority 4: Incremental Summary (Progressive Compression)

**Current state:** `compressContext()` re-compresses the entire old block every time it triggers.

**What to build:** Maintain a `moving_summary` string. When compression triggers, call the LLM with: existing summary + new messages to add → updated summary. One LLM call per compression event instead of re-processing all old messages. This is the LangChain `ConversationSummaryBufferMemory` pattern.

### Priority 5: Failure-Indexed Memories

**Current state:** Memories store what worked but not what failed.

**What to build:** When the `Test` stage rejects a concept, record it as a low-confidence episodic memory tagged with the failure mode: `["collagen", "social-proof-failed", "authority-hook", "cycle-3"]`. When future cycles run similar campaigns, retrieve and inject failure memories: "In cycle 3, authority-hook social proof copy was rejected — avoid."

This matches AutoGen's `train_on_task` pattern.

### Priority 6: Cross-Session Reflection (Low Priority, High Complexity)

**Current state:** No reflection agent runs across cycles.

**What to build:** After N cycles (e.g., 5), run a reflection pass: give the `qwen3.5:9b` model the last N cycle memory summaries and ask: "What are the 3 most important patterns you've learned about this brand/market?" Store the result as a high-confidence semantic memory. This is the Generative Agents reflection mechanism.

---

## 10. Summary Table: Our System vs. Industry Patterns

| Pattern | Industry Best Practice | Our Current State | Gap |
|---------|----------------------|------------------|-----|
| Rolling window | Head+tail or progressive summary | Keep last 10 + compress old | Works, but no incremental update |
| Phase transitions | Checkpoint + phase summaries | Phase summaries in IndexedDB | Good — matches LangGraph |
| Memory types | Episodic / Semantic / Procedural | All three implemented | Types exist, pipeline wiring missing |
| Retrieval | Hybrid (BM25 + vector + recency) | Keyword substring only (memoryStore.ts) | memoryService.ts has scoring but not connected |
| Importance scoring | LLM-rated at write time | Confidence tiers (0.5/0.65/0.95) | No per-memory importance at write time |
| Cross-session injection | Retrieved memories injected into prompts | Memories written but never read back | Critical gap |
| Campaign isolation | Scoped by user/agent/run | Flat array, no campaign scoping | Medium priority |
| Failure memory | Explicit failure-indexed storage | Not implemented | High value, low complexity |
| Consolidation | LLM-decided merge/update/delete | Weekly batch by tag cluster | Stub-level — no LLM in the loop |
| Multi-agent sync | Pull-based from shared store | N/A (single-agent system currently) | Not applicable yet |

---

## 11. Recommended Implementation Order

1. **Wire retrieval to pipeline** — Call `memoryService.retrieveMemories()` before the Orchestrator and inject top-5 results as context. ETA: 1 session.

2. **Add importance score to Memories stage** — Update the `Memories` stage prompt to output `importance: 1-5` per memory. Only persist memories scoring 3+. ETA: 30 min.

3. **Campaign-scope memoryStore.ts** — Add `campaignId` field, update search. ETA: 30 min.

4. **Failure memory recording** — When `Test` stage rejects a concept, write a tagged failure episodic memory. ETA: 1 session.

5. **Incremental compression** — Replace `compressContext()` re-compression with progressive summary update. ETA: 2-3 hours.

6. **Reflection agent (optional, post-MVP)** — Cross-cycle pattern synthesis. ETA: 1 full session.

---

## 12. Key Sources

- `microsoft/autogen` — `python/packages/autogen-core/src/autogen_core/model_context/` (BufferedChatCompletionContext, TokenLimitedChatCompletionContext, HeadAndTailChatCompletionContext)
- `microsoft/autogen` — `python/packages/autogen-ext/src/autogen_ext/experimental/task_centric_memory/` (MemoryBank, MemoryController, Prompter)
- `mem0ai/mem0` — `mem0/memory/main.py`, `mem0/configs/prompts.py`, `mem0/memory/graph_memory.py`
- `langchain-ai/langchain` — `libs/langchain/langchain_classic/memory/summary_buffer.py`, `buffer.py`, `vectorstore.py`
- `langchain-ai/langgraph` — `libs/checkpoint/langgraph/store/memory/__init__.py`
- Park et al. 2023 — "Generative Agents: Interactive Simulacra of Human Behavior" (arXiv 2304.03442)
- LangChain blog — "Memory for Agents" (blog.langchain.com/memory-for-agents)
- LangGraph docs — "Memory" (docs.langchain.com/oss/python/langgraph/memory)
