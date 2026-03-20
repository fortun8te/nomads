# Multi-Agent System Research: Coordination, Parallel Work, and Aggregation

*Researched: 2026-03-20*
*Sources: AutoGen (Microsoft), CrewAI, OpenAI Swarm, LangGraph, Anthropic engineering blog*

---

## 1. Core Question: When to Spawn a Subagent vs Do It Inline

The answer from all frameworks converges on the same principle: **spawn a subagent when the subtask has independent context, can fail in isolation, or benefits from a different persona/specialization**. Do it inline when it is a quick call that needs the same context the parent already has.

Anthropic's own engineering blog (from their multi-agent research system) gives the most actionable rule:

> "Simple fact-finding requires just 1 agent with 3-10 tool calls; direct comparisons might need 2-4 subagents with 10-15 calls each; complex research might use more than 10 subagents."

The decision logic they embed in the orchestrator's prompt:
- Will this subtask take more than a few tool calls? Spawn.
- Is this subtask truly independent (could run in parallel with no shared writes)? Spawn.
- Does this require a different expertise/persona than the parent? Spawn.
- Is this a quick lookup or synthesis of material already in context? Do inline.

**LangGraph's guidance** (from their multi-agent blog post):
- Use a full agent (subagent) when you need an AgentExecutor with its own scratchpad, tool loop, and termination logic.
- Use a simple LLM call inline when the work fits in a single prompt with context already assembled.
- The key signal: does the subtask need to make its own decisions about which tools to call next?

**AutoGen's guidance**: Use nested teams (inner agents) when you need different routing logic or tool sets. The cost is coordination overhead. MagenticOne's orchestrator uses explicit "is this worth delegating?" reasoning via its progress ledger JSON.

**Practical threshold**: If a subtask takes one LLM call, do it inline. If it takes a loop (search → compress → evaluate → search again), it belongs in a subagent.

---

## 2. How Results Get Aggregated: Sequential Synthesis vs Parallel Merge

### Pattern A: Shared Scratchpad (LangGraph multi-agent collaboration)

All agents write to a shared message thread. Every agent can see everything every other agent has produced. The orchestrator then synthesizes the full thread into a final answer.

**Pros**: Full transparency, agents can react to each other's work, easy to implement.
**Cons**: Context bloat — the thread grows large fast, costs increase, later agents see noise from earlier ones.

### Pattern B: Independent Scratchpads + Final Synthesis (Anthropic's research system, CrewAI)

Each subagent maintains its own conversation history. The parent receives only the final `[FINDINGS]` block, not the agent's internal reasoning chain.

**Pros**: Keeps parent context clean, each agent's prompt stays focused.
**Cons**: Parent can miss important caveats that an agent discovered internally but didn't surface in its output.

**Anthropic's system** synthesizes in two steps:
1. Subagents return structured findings blocks.
2. Lead agent reads all blocks and synthesizes: identifies agreements, contradictions, coverage gaps, and produces a master brief.

### Pattern C: Map-Reduce (CrewAI async_execution, our system's parallel researcher dispatch)

```
                [Orchestrator]
               /    |    |    \
           [A1]   [A2]  [A3]  [A4]   ← parallel "map" phase (async)
               \    |    |    /
            [Synthesizer / Reducer]   ← sequential "reduce" phase
```

CrewAI implements this via `async_execution=True` on tasks. The crew kicks off async tasks without waiting, collects them all into a `futures` list, then calls `_process_async_tasks(futures)` which does `future.result()` sequentially. Dependent tasks declare `context=[async_task_1, async_task_2]` to wait for specific upstream results.

**Key insight from CrewAI source**: Parallel tasks that run concurrently are joined before any downstream task that lists them as context. There is no streaming merge — it is a hard synchronization barrier.

### Pattern D: Debate / Voting (Anthropic's parallelization recommendation)

Run the same task N times with different prompts or temperatures, then have a final agent pick the best answer or synthesize a consensus.

> "Voting: running identical tasks multiple times for diverse outputs requiring consensus. LLMs generally perform better when each consideration is handled by a separate LLM call, allowing focused attention on each specific aspect."

Used for: quality-critical decisions, guardrail checks (one agent processes, another screens), vulnerability reviews where multiple evaluators catch different issues.

### Pattern E: Sequential Handoffs with Accumulated State (OpenAI Swarm, AutoGen Swarm)

Agents hand control to the next agent explicitly. Each agent can modify a shared `context_variables` dict. The final agent in the chain has all accumulated state.

Good for pipelines with clear ordering: researcher → analyzer → strategist → writer. Not for parallel work.

---

## 3. Preventing Duplicate Work and Conflicts

This is the most under-documented problem across all frameworks. The practical techniques found:

### Explicit Task Boundaries in Dispatch Prompts

Anthropic's research system addresses this directly:
> "Rather than vague instructions like 'research the semiconductor shortage,' the lead agent provides explicit boundaries and research directions to prevent subagents from duplicating work."

Each subagent receives: a specific angle/dimension to research, not just a topic. If A1 is "market sizing," A2 is "consumer psychology," A3 is "competitor positioning" — they cannot overlap by design.

**This is the most reliable deduplication mechanism**: decompose the task space before spawning, not after.

### Claimed Dimensions / Coverage Map

The reflection agent or orchestrator maintains a "dimensions covered" list. Before spawning a researcher for a new query, the orchestrator checks: is this dimension already in the coverage map? This is what our reflection agent does with its dimensional coverage percentage check.

### Shared Query Registry (not currently in our system)

Systems like agent swarms in production often maintain a shared set of "queries already dispatched" to prevent the orchestrator from issuing the same search twice across iterations. When the orchestrator wants to dispatch "collagen market 2025," it checks the registry first.

**Gap in our system**: We do not track which search queries have already been dispatched across iterations. The orchestrator's memory is stateless between iterations — it can re-issue similar queries if the reflection agent does not explicitly flag them.

### CrewAI's Tool Cache

CrewAI avoids re-executing identical tool calls by caching tool results. If two agents call the same tool with the same input, the second gets the cached result. This is a transparent deduplication layer.

---

## 4. Right Granularity for Subagent Tasks

From studying all four frameworks:

**Too coarse**: "Research the collagen supplement market" — the agent will make arbitrary sub-decisions about what to cover, different instances will overlap.

**Too fine**: "Find the market size of collagen supplements in North America in 2024 in USD" — over-specified, doesn't leverage the agent's reasoning ability, and you need dozens of them.

**The goldilocks granularity**: A task with a clear **angle** (dimension of research), a clear **output format**, and enough latitude that the agent can exercise judgment within that angle. Estimated time: 15-60 seconds of LLM work.

AutoGen's `AgentTool` pattern wraps agents so that each tool call maps to one subagent invocation. This forces granularity: if you can't describe the task as a one-sentence tool call description, it's either too coarse or too fine.

**Anthropic's heuristic**: 3-10 tool calls per subagent is the right scale. Fewer than 3 calls — do it inline. More than 10 calls — decompose into sub-subagents.

**For research tasks specifically**: One subagent per "research question" (not per URL, not per topic area). The agent decides how many sources to check to answer its research question.

---

## 5. Handling a Subagent That Fails or Times Out

### Never let one failure kill the batch

All mature frameworks agree on this. From our own `subagentManager.ts`:
> "Error isolation — one subagent failure never kills the batch"

The pattern: always resolve to a result object, never reject/throw. Mark the result as `status: 'failed'`, include whatever partial output was collected, and let the orchestrator decide what to do.

### MagenticOne's Stall Detection

The most sophisticated failure handling studied. MagenticOne's progress ledger JSON asks after every step:
```json
{
  "is_request_satisfied": { "answer": false, "reason": "..." },
  "is_progress_being_made": { "answer": false, "reason": "..." },
  "is_in_loop": { "answer": true, "reason": "Repeated same search 3 times" },
  "next_speaker": { "answer": "WebSurfer", "reason": "..." }
}
```

When `is_progress_being_made` is false OR `is_in_loop` is true, the stall counter increments. When stall count hits `max_stalls`, the system does **not give up** — it re-enters the outer loop: updates the facts ledger, rewrites the plan, resets agents, and tries again with a fresh strategy.

This is the inner-loop / outer-loop architecture:
- **Inner loop**: assigns agent → receives result → checks progress → assigns next agent
- **Outer loop**: triggered on stall — updates facts + plan → re-enters inner loop with new strategy

### OpenAI Swarm's Approach

Much simpler: `max_turns` parameter prevents infinite loops. Missing tools are skipped with logged errors. No retry, no recovery — just bounded execution and graceful degradation.

### CrewAI

Individual task failures propagate naturally through `future.result()`. No explicit error recovery at the framework level — this is the caller's responsibility. The validation is done pre-execution (invalid configs raise at crew creation time, not at run time).

### Best Practices Synthesized

1. **Hard timeout per subagent** (we have this: `AGENT_CONFIG.subagentTimeoutMs`, default 120s).
2. **Retry with exponential backoff** on transient failures (we have this: 3 attempts, configurable).
3. **Partial output preservation**: if the agent timed out mid-stream, save whatever it produced — even partial findings have value for the synthesizer.
4. **Stall detection** at the orchestrator level: if N consecutive iterations produce no new coverage, trigger a strategy reset (we do not have this — see gaps below).
5. **Graceful degradation**: the synthesizer runs even if only 3 of 5 subagents succeeded. Do not wait for all to succeed.

---

## 6. Agent-to-Agent Communication: CrewAI vs AutoGen Compared

### AutoGen: Message Passing via Shared Thread

All agents are registered as participants in a group chat. Each agent publishes messages to the thread, visible to all others. The orchestrator reads the thread state to decide next steps.

- **Round-Robin**: strict turn-taking, every agent speaks every round.
- **Selector**: model picks next speaker based on thread content.
- **Swarm**: agents explicitly hand off via `HandoffMessage`.
- **MagenticOne**: orchestrator evaluates progress ledger, selects speaker via JSON, broadcasts instruction.

In all cases: communication is **broadcast** (one-to-all), not direct (one-to-one). The thread is the shared state.

### CrewAI: Task Output as Context

Agents do not talk to each other directly. A task's output becomes the `context` for the next task. The `AgentTools` mechanism allows a manager agent to call other agents as tools — the result is returned as a tool response, not as a conversation turn.

In hierarchical mode, the manager agent has `AgentTools(agents=crew.agents).tools()` — it can delegate tasks to any worker agent by name. The worker's output returns to the manager as a function result, then the manager synthesizes and continues.

This is **point-to-point via the manager**, not broadcast.

### OpenAI Swarm: Context Variables + Handoffs

Agents share state through `context_variables` (a dict that any agent can read/write). Control passes via handoffs (returning an Agent object from a function). Only one agent is active at a time — truly sequential, not parallel.

Communication is **state-based** (shared dict) + **handoff-based** (explicit routing).

### Key Insight for Our System

Our system currently has no agent-to-agent communication. Each subagent runs independently and returns a result to the parent orchestrator, which aggregates manually. This is actually the most correct pattern for our use case (pure parallel fan-out → reduce), but it means agents cannot react to each other's discoveries mid-run.

---

## 7. The Four Core Patterns — Detailed

### A. Manager-Worker Pattern (Orchestrator + Specialized Workers)

**Structure**: One orchestrator LLM decides what work to do and dispatches to N workers. Workers have no awareness of each other.

**How orchestrator decides who to call**: Either LLM-based routing (describe the task, the model picks the right worker based on role descriptions) or rule-based (always send web search tasks to researcher, always send scoring to evaluator).

**Anthropic's system**: Lead agent uses extended thinking to decide which subagents to spawn and with what precise instructions. Uses 3-5 subagents per round, each with explicit task boundaries.

**MagenticOne**: Orchestrator queries a JSON progress ledger after each step. The JSON includes `next_speaker` with reasoning. The orchestrator does not pick from all possible agents randomly — it reasons about who has the right tools for the next step.

**Our system has this**: orchestrator → researcher agents. **What we lack**: the orchestrator does not have a rich progress ledger with explicit loop detection. It decides next queries but does not formally track whether it is making progress.

### B. Critic Pattern (Generator + Critic Roles)

**Structure**: Agent A produces output. Agent B (the critic) evaluates it and provides specific, structured feedback. Agent A revises based on feedback. Loop until critic approves or iteration limit.

**AutoGen's reflection pattern** (from RoundRobinGroupChat docs):
- Agent 1: writes code / draft
- Agent 2 (critic): reviews, provides `[APPROVE]` or structured critique
- Loop: if not approved, A1 revises, A2 critiques again
- Termination: `TextMentionTermination("[APPROVE]")`

**CrewAI equivalent**: A task's `agent` writes the output. A second task with a critic agent receives the first task's output as context and either validates or returns a correction that feeds back into the pipeline.

**Our system has this partially**: the `reflection` agent critiques the coverage after each research round. The `validator` subagent role exists in `subagentRoles.ts`. **What we lack**: the reflection agent's critique does not feed back to individual researchers to fix specific gaps — it feeds to the orchestrator which decides new queries. This is less tight than a true critic loop.

### C. Debate Pattern (Multiple Agents Argue, Best Answer Wins)

**Structure**: 2-3 agents independently generate solutions. A judge agent evaluates all solutions and picks the winner (or synthesizes the best elements).

**AutoGen**: Can be implemented with SelectorGroupChat where each agent proposes, then a judge agent is selected to evaluate.

**Anthropic's parallelization pattern** (voting variant):
> "Running identical tasks multiple times for diverse outputs requiring consensus."

**When to use**: High-stakes decisions where you need diverse perspectives. Examples: picking the best ad headline, evaluating whether a finding is solid or thin, deciding which creative angle has strongest emotional hook.

**Our system**: The `evaluator` role is defined but not wired into a debate pattern. Currently, `Test` stage has one agent evaluate 3 concepts — this is a judge pattern, not a debate pattern. **Gap**: no multi-agent debate happens. Adding debate would mean: spawn 3 strategist agents with different "priors" (one pessimistic, one optimistic, one contrarian), collect their takes, then have the evaluator pick or synthesize.

### D. Map-Reduce Pattern (Parallel Processing + Aggregation)

**Structure**:
1. Orchestrator decomposes task into N independent subtasks.
2. All N subtasks run in parallel.
3. A reducer aggregates results into one coherent output.

**CrewAI implementation**: `async_execution=True` on N tasks. Dependent task declares `context=[task1, task2, ..., taskN]`. CrewAI's `_process_async_tasks` collects all futures before the reducer runs.

**Our system implementation** (Phase 2 research): Orchestrator generates 5 search queries → dispatches 5 parallel researchers → each researcher fetches + compresses → synthesizer (reflection agent) aggregates. This is a textbook map-reduce.

**Key nuance from CrewAI**: there is a synchronization barrier — the reduce step cannot start until all map steps complete (or fail). We handle this via `Promise.allSettled()` in our researcher dispatch, which correctly continues even if some researchers fail.

**What mature systems add over our approach**:
1. **Progressive reduction**: as researchers finish, the synthesizer starts on completed batches rather than waiting for all. This reduces total latency.
2. **Weighted aggregation**: results from higher-confidence agents get more weight in the synthesis.
3. **Cascading reduce**: for very large fan-outs, do a two-level reduce (5 agents → 2 intermediate synthesizers → 1 final synthesizer).

---

## 8. Gap Analysis: What We Are Missing vs Best Practices

### Gap 1: No Progress Ledger / Stall Detection

**What best systems do**: MagenticOne explicitly tracks `is_progress_being_made` and `is_in_loop` after every step. When stalled, it re-plans.

**What we do**: The reflection agent computes dimensional coverage percentage. If coverage is below threshold, we continue. But we do not detect if the last N iterations added zero new coverage (loop detection).

**Fix**: Track coverage delta per iteration. If coverage delta < 2% for 3 consecutive iterations, trigger a strategy reset: have the orchestrator reassess from scratch with updated facts.

### Gap 2: No Shared Query Registry

**What best systems do**: Track which queries have been dispatched. Prevent re-dispatching nearly-identical queries.

**What we do**: The orchestrator generates new queries each iteration. It sees the previous round's output but has no explicit memory of all past queries across all iterations.

**Fix**: Maintain a `dispatchedQueries: string[]` array in the research state. Before each dispatch, pass this list to the orchestrator prompt so it can avoid duplicates. Simple string or embedding-based deduplication.

### Gap 3: Orchestrator Has No Extended Thinking / Pre-Planning Step

**What best systems do**: Anthropic's system and MagenticOne both use a separate planning step before dispatching. MagenticOne does: gather facts → create plan → inner loop. Anthropic uses extended thinking in the orchestrator before spawning.

**What we do**: Orchestrator generates queries in a single LLM call with no explicit planning phase. There is no separate "what do I know vs what do I need to find?" step.

**Fix**: Add a pre-planning step to the orchestrator. Before generating queries, ask: "What are the known facts? What critical gaps remain? What are the highest-value things to search next?" This dramatically improves query quality and reduces wasted iterations.

### Gap 4: No Progressive / Cascading Reduction

**What best systems do**: Progressive aggregation as results come in, rather than waiting for all results before synthesizing.

**What we do**: Wait for all researchers to complete (`Promise.allSettled`), then pass all their outputs to the reflection agent.

**Fix**: Start the synthesizer as soon as the first N results are ready (e.g., N=3). If more results come in after, run a second synthesis pass that merges the new findings with the previous synthesis. This reduces iteration wall-clock time.

### Gap 5: No True Critic Loop

**What best systems do**: Reflection agent critique feeds directly back to researchers to fix specific gaps in the same round.

**What we do**: Reflection critique feeds to the orchestrator, which generates new queries for the next round. Gaps are addressed in the next iteration, not the current one.

**Fix**: After reflection identifies a specific gap, optionally spawn 1-2 targeted researcher subagents immediately within the same iteration to fill that gap, before moving to the next round. "Fast-fill" pattern for critical missing dimensions.

### Gap 6: Subagents Do Not React to Each Other

**What best systems do**: In AutoGen's group chat, agents see each other's outputs and can build on or challenge them.

**What we do**: Each researcher runs in isolation. Researcher 2 cannot see what Researcher 1 found and adjust its search accordingly.

**Assessment**: For our use case (parallel web research), this isolation is actually correct — it prevents false confirmation bias where researchers agree because they read each other's output. The isolation ensures independent perspectives. **This is not a gap to fix** — it is a deliberate architectural advantage.

### Gap 7: No Debate Pattern for High-Stakes Decisions

**What we have**: Single evaluator for Test stage, single strategist for Taste stage.

**What would improve quality**: For the Taste stage (creative direction), spawn 3 strategist agents with different briefs:
- One framed as a "performance marketer" (conversion-focused, benefit-led)
- One framed as a "brand strategist" (positioning-led, long-term equity)
- One framed as a "cultural observer" (trend-led, community language)

Then have the evaluator synthesize the best elements from all three. This is how top agencies brief multiple strategy teams on the same pitch.

### Gap 8: No Resumable / Checkpoint System

**What Anthropic's production system does**: Build resumable pipelines since restarts are expensive. Checkpoint after each iteration so a failure at iteration 20 doesn't restart from iteration 1.

**What we do**: Research state is streamed and stored, but if the browser closes or the model crashes mid-research, recovery is incomplete.

**Assessment**: Lower priority for current phase but important for long-running MX-tier (5-hour) research runs.

---

## 9. Concrete Recommendations Ranked by Impact

### High Impact, Low Effort

**1. Shared query registry** — Pass `dispatchedQueries` array to orchestrator prompt each iteration. Prevents wasted iterations re-searching the same ground. ~1 hour to implement.

**2. Coverage delta stall detection** — Track `prevCoverage` and `currentCoverage` per iteration. If delta < 2% for 3 iterations, trigger orchestrator re-planning. ~2 hours to implement.

### High Impact, Medium Effort

**3. Pre-planning step in orchestrator** — Before generating queries, add a separate LLM call: "Here are the known facts. What critical dimensions are still uncovered? What are the top 3 highest-value questions to answer next?" Then use that analysis to drive query generation. Dramatically improves query quality. ~4 hours to implement.

**4. Fast-fill pattern for reflection gaps** — When reflection agent identifies a specific high-priority gap (e.g., "no competitor pricing data found"), spawn 1-2 targeted researchers immediately within the same iteration rather than waiting for the next round. Tightens the feedback loop. ~3 hours to implement.

### Medium Impact, Medium Effort

**5. Debate pattern for Taste stage** — Spawn 3 strategists with different creative briefs (performance / brand / cultural). Have evaluator synthesize. Produces richer, more contrarian creative direction. ~6 hours to implement.

**6. Progressive reduction** — Start synthesis after first 3 researchers complete instead of waiting for all 5. Reduces iteration wall-clock time by ~30% on NR/EX/MX tiers. ~4 hours to implement.

### Lower Priority

**7. Weighted confidence aggregation** — Use subagent confidence scores (already computed in `scoreConfidence()`) to weight synthesis. Higher-confidence findings get more prominence. Requires synthesizer prompt update. ~3 hours.

**8. Inner-loop / outer-loop re-planning** — Full MagenticOne-style: stall triggers a complete facts+plan refresh. Overkill for current research scale but valuable for MX-tier. ~8 hours.

---

## 10. Reference: Architecture Patterns Quick Comparison

| Pattern | Framework | Parallel? | Aggregation | Best For |
|---------|-----------|-----------|-------------|----------|
| Shared scratchpad | LangGraph multi-agent | No | All agents read all outputs | Sequential reasoning chains |
| Independent scratchpads + synthesis | Anthropic, CrewAI | Yes | Lead agent synthesizes blocks | Parallel research |
| Map-reduce (async tasks) | CrewAI `async_execution` | Yes | Synchronization barrier + reducer | Independent parallel workloads |
| Round-robin + critic | AutoGen RoundRobin | No | Accumulate in thread | Iterative refinement loops |
| Progress ledger orchestration | MagenticOne | No | Ledger tracks facts+plan | Complex open-ended tasks |
| Handoff chain | OpenAI Swarm | No | Context variables accumulate | Clear sequential pipelines |
| Voting / debate | Anthropic parallelization | Yes | Judge agent selects/merges | High-stakes decisions |

---

## Sources

1. AutoGen MagenticOne orchestrator source: `_magentic_one_orchestrator.py` — inner/outer loop, progress ledger, stall detection
2. AutoGen team patterns: RoundRobinGroupChat, SelectorGroupChat, Swarm — from source + docs
3. CrewAI crew.py — async_execution futures pattern, manager agent, context passing
4. CrewAI task.py — async_execution, context declarations, dependency graph
5. OpenAI Swarm core.py — handoff mechanism, parallel_tool_calls, max_turns
6. LangGraph multi-agent blog — shared vs independent scratchpads, supervisor pattern
7. Anthropic "Building Effective Agents" — orchestrator-worker, parallelization (sectioning + voting), failure handling
8. Anthropic "Built a Multi-Agent Research System" — spawn decisions, deduplication via task boundaries, 90.2% improvement over single-agent, resumability lessons
9. Our codebase: `subagentManager.ts`, `subagentRoles.ts`, `researchAgents.ts`
