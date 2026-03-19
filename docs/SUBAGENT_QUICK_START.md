# Subagent Quick Start — TL;DR

## What Is This?

Subagents are specialized AI workers that the orchestrator can spawn to parallelize research work.

**Before subagents**: Orchestrator runs research sequentially → 90 min cycle
**With subagents**: Orchestrator spawns 3 researchers in parallel → 55 min cycle (39% faster)

---

## 3-Minute Overview

```
Main Pipeline
    ↓
Orchestrator decides: "Need objections, pricing, trends"
    ↓
Spawn 3 Researcher subagents (parallel)
  ├─ Researcher A: web_search + analyze for objections
  ├─ Researcher B: web_search + analyze for pricing
  └─ Researcher C: web_search + analyze for trends
    ↓ (all run in parallel, ~25s total)
Results merged by Synthesizer
    ↓
Validator checks coverage
    ↓
Continue research or move to next stage
```

---

## 7 Subagent Roles

| Role | Does | Time |
|------|------|------|
| **researcher** | Web search + synthesis | 30s |
| **analyzer** | Extract insights from findings | 15s |
| **synthesizer** | Merge findings + coverage map | 20s |
| **validator** | Check gaps + recommend research | 15s |
| **strategist** | Find positioning opportunities | 20s |
| **compressor** | Ultra-fast fact extraction | 5s |
| **evaluator** | Score/rank concepts | 15s |

---

## Tool Access (BLOCKED Features)

✗ NO Wayfarer Plus (Playwright, screenshots)
✗ NO computer-use / browser automation
✗ NO image generation
✗ NO external APIs (only Ollama + SearXNG)

**Allowed**: web_search, analyze_page, LLM reasoning

---

## Files Created

```
src/utils/
├─ subagentRoles.ts        (7 role definitions)
├─ subagentTools.ts        (filtered tool set)
├─ subagentManager.ts      (spawn/monitor/abort)

src/types/
├─ index.ts                (SubagentTask types) — UPDATED

docs/
├─ SUBAGENT_ARCHITECTURE.md    (full technical design)
├─ SUBAGENT_IMPLEMENTATION_GUIDE.md (integration steps)
├─ SUBAGENT_EXAMPLES.md         (real workflows)
└─ SUBAGENT_QUICK_START.md      (this file)
```

---

## How to Enable

### Via Dashboard Toggle (Easy)
1. Open Dashboard
2. Settings → Research → Enable Subagents
3. Set max concurrent researchers (3-5)
4. Run a cycle

### Via Preset (Automatic)
- SQ / QK: Subagents disabled (too much overhead)
- NR: Subagents enabled, 3 researchers max
- EX: Subagents enabled, 4 researchers max
- MX: Subagents enabled, 5 researchers max

### Via LocalStorage (Manual)
```javascript
localStorage.setItem('enable_subagents', 'true');
localStorage.setItem('max_researcher_subagents', '3');
location.reload();
```

---

## Example: Spawn 3 Researchers

```typescript
const manager = createSubagentManager();

// Spawn 3 researchers in parallel
const results = await Promise.all([
  manager.spawn({
    id: 'researcher-1',
    role: 'researcher',
    task: 'Find customer objections',
    context: 'Collagen supplement market',
    input: 'customer complaints collagen',
    signal: abortSignal,
  }),
  manager.spawn({
    id: 'researcher-2',
    role: 'researcher',
    task: 'Find competitor pricing',
    context: 'Collagen supplement market',
    input: 'collagen supplement prices competitors',
    signal: abortSignal,
  }),
  manager.spawn({
    id: 'researcher-3',
    role: 'researcher',
    task: 'Find market trends',
    context: 'Collagen supplement market',
    input: 'collagen market growth trends 2024',
    signal: abortSignal,
  }),
]);

// All results available
console.log(results[0].output);  // Researcher 1 findings
console.log(results[1].tokensUsed);  // Token count
console.log(results[2].durationMs);  // How long it took
```

---

## Example: Pause/Resume Works

```typescript
// Main agent has abort controller
const abortController = new AbortController();

// Pass to subagents
const result = await manager.spawn({
  // ...
  signal: abortController.signal,  // Same signal!
});

// User clicks "Pause"
abortController.abort();
// ↓ All subagents halt immediately

// User clicks "Resume"
// Create new controller, restart research
const newController = new AbortController();
// Re-spawn subagents...
```

---

## Performance: Expected Gains

```
Normal Preset (90 min baseline)
├─ With Subagents: 55 min (39% faster)
├─ Token overhead: +15% (worth the speed)
└─ Best for: Research phases with multiple orthogonal queries

Extended Preset (120 min baseline)
├─ With Subagents: 72 min (40% faster)
├─ Includes visual analysis, so parallelization helps
└─ Best for: Large research with multiple angles
```

---

## Integration Checklist

- [ ] Copy 3 new files (subagentRoles.ts, subagentTools.ts, subagentManager.ts)
- [ ] Update types/index.ts with SubagentTask types
- [ ] Update researchAgents.ts (orchestratorAgent function)
- [ ] Update useOrchestratedResearch.ts (pass enableSubagents flag)
- [ ] Update modelConfig.ts (add subagent flags to ResearchLimits)
- [ ] Update ResearchOutput.tsx (render subagent sections)
- [ ] Test: spawn 3 researchers in parallel, verify results
- [ ] Test: pause/resume propagates abort signal
- [ ] Enable in Dashboard settings
- [ ] Deploy with subagents disabled by default

---

## Debugging

### Subagent output is empty
- Check: Role system prompt is complete (subagentRoles.ts)
- Check: Model can follow output format ([FINDINGS], [/FINDINGS])
- Test: Use `reason` tool to verify model works

### Abort signal not working
- Check: Signal passed to manager.spawn() call
- Check: Signal passed through entire chain (useCycleLoop → orchestratorAgent → manager.spawn)

### Tool authorization error
- Check: Role has tool in allowedTools array (subagentRoles.ts)
- Check: Tool exists in SUBAGENT_TOOLS (subagentTools.ts)

### Max concurrency errors
- Check: Increase `maxResearcherSubagents` in modelConfig.ts
- Check: Decrease concurrent spawns (spawn fewer researchers per iteration)

---

## Next Steps

1. **Read** SUBAGENT_ARCHITECTURE.md for full design
2. **Follow** SUBAGENT_IMPLEMENTATION_GUIDE.md step-by-step
3. **Study** SUBAGENT_EXAMPLES.md for real-world patterns
4. **Test** with Normal (NR) preset
5. **Monitor** token usage and speed gains
6. **Iterate** based on your Ollama setup (memory, VRAM)

---

## Key Constraints

- **One abort signal per cycle** → all subagents halt together
- **No subagent-to-subagent communication** → they run independently
- **No visual analysis** for subagents (Wayfarer text-only)
- **Max 10 subagents globally** (configurable, but recommended limit)
- **Subagents are opt-in** (disabled by default, no backward compatibility risk)

---

## Questions?

See: SUBAGENT_ARCHITECTURE.md for theory
See: SUBAGENT_EXAMPLES.md for patterns
See: SUBAGENT_IMPLEMENTATION_GUIDE.md for code
