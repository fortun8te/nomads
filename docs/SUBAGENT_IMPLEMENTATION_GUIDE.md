# Subagent Implementation Guide — Step-by-Step

This guide walks you through integrating subagents into the existing nomads research pipeline.

---

## Phase 1: Core Files (Already Created)

### ✅ Files Created
1. **src/utils/subagentRoles.ts** — 7 role definitions with system prompts
2. **src/utils/subagentTools.ts** — Filtered tool set (search, analyze, reason)
3. **src/utils/subagentManager.ts** — Lifecycle management (spawn, monitor, abort)
4. **src/types/index.ts** — Updated with SubagentTask + SubagentTaskResult types

### ✅ Next: Integrate into researchAgents.ts

---

## Phase 2: Integrate Subagent Spawning into Orchestrator

### File: src/utils/researchAgents.ts

#### Step 1: Import subagent modules at the top

```typescript
import { createSubagentManager, type SubagentManager, type SubagentResult } from './subagentManager';
import type { SubagentRole } from './subagentRoles';
```

#### Step 2: Update the orchestratorAgent function

Find this section (around line 350):
```typescript
export async function orchestratorAgent(
  state: OrchestratorState,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<ResearchResult> {
  // ... existing code
}
```

Modify it to support subagent spawning:

```typescript
export async function orchestratorAgent(
  state: OrchestratorState,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  enableSubagents: boolean = false,  // NEW: feature flag
  maxResearchers: number = 3,         // NEW: concurrency limit
): Promise<ResearchResult> {
  const limits = getResearchLimits();

  if (!enableSubagents) {
    // Fall back to original sequential logic
    return orchestratorAgentSequential(state, onChunk, signal);
  }

  // NEW: Subagent-enabled path
  return orchestratorAgentWithSubagents(state, onChunk, signal, maxResearchers);
}
```

#### Step 3: Create new orchestratorAgentWithSubagents function

Add after orchestratorAgent:

```typescript
async function orchestratorAgentWithSubagents(
  state: OrchestratorState,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  maxResearchers: number = 3,
): Promise<ResearchResult> {
  const manager = createSubagentManager();
  manager.setMaxConcurrentGlobal(maxResearchers);

  // Stream: "Spawning researchers..."
  onChunk?.('[orchestrator] Spawning researchers for these clusters:\n');

  // Orchestrator decides what to research (same as before)
  const orchestratorPrompt = `... [existing prompt] ...`;
  const decision = await ollamaService.generateStream(
    orchestratorPrompt,
    getSystemPrompt('orchestrator'),
    { model: getResearchModelConfig().orchestratorModel, signal }
  );

  // Parse decision to extract research topics
  // E.g.: "RESEARCH: customer objections, competitor pricing, market growth"
  const topics = parseOrchestrationDecision(decision);
  onChunk?.(`Identified ${topics.length} research topics.\n`);

  // Spawn N researchers in parallel (one per topic)
  const researcherTasks = topics.slice(0, maxResearchers).map((topic, i) => ({
    id: `researcher-${i}`,
    role: 'researcher' as SubagentRole,
    task: `Research: ${topic}`,
    context: buildOrchestratorBrandContext(state.campaign),
    input: topic,  // Could be a query or cluster of queries
    signal,
  }));

  onChunk?.(`[orchestrator] Starting ${researcherTasks.length} researchers...\n`);

  // Spawn all researchers
  const researcherPromises = researcherTasks.map(task => manager.spawn(task));

  // Wait for all researchers to complete
  const researcherResults: SubagentResult[] = [];
  for (const promise of researcherPromises) {
    try {
      const result = await promise;
      researcherResults.push(result);
      onChunk?.(`[researcher-${result.subagentId}] Complete: ${result.output.slice(0, 100)}...\n`);
    } catch (err) {
      onChunk?.(`[researcher] Error: ${err}\n`);
    }
  }

  // Now synthesize findings
  onChunk?.(`[orchestrator] Synthesizing findings from ${researcherResults.length} researchers...\n`);

  const synthesisInput = researcherResults.map(r => r.output).join('\n---\n');
  const synthesisResult = await manager.spawn({
    id: 'synthesizer-1',
    role: 'synthesizer',
    task: 'Merge and deduplicate findings',
    context: buildOrchestratorBrandContext(state.campaign),
    input: synthesisInput,
    signal,
  });

  onChunk?.(`[synthesizer] Complete\n`);

  // Optionally validate
  const validatorResult = await manager.spawn({
    id: 'validator-1',
    role: 'validator',
    task: 'Check coverage and identify gaps',
    context: buildOrchestratorBrandContext(state.campaign),
    input: synthesisResult.output,
    signal,
  });

  onChunk?.(`[validator] Complete\n`);

  // Compile findings into ResearchResult
  const combinedOutput = [
    decision,
    `\n[RESEARCHER OUTPUTS]\n${researcherResults.map(r => r.output).join('\n---\n')}`,
    `\n[SYNTHESIS]\n${synthesisResult.output}`,
    `\n[VALIDATION]\n${validatorResult.output}`,
  ].join('\n');

  return {
    query: `Multi-topic research (${topics.length} clusters)`,
    findings: combinedOutput,
    sources: [],  // Could extract from researcher results
    coverage_graph: {},  // TODO: parse validator output for coverage
  };
}
```

#### Step 4: Parse orchestration decisions

Add helper function:

```typescript
function parseOrchestrationDecision(decisionText: string): string[] {
  // Extract topics from orchestrator output
  // E.g., "RESEARCH: customer objections, competitor pricing, market trends"
  const match = decisionText.match(/RESEARCH:\s*([^\n]+)/i);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, 10);  // Max 10 topics
}
```

---

## Phase 3: Update useOrchestratedResearch Hook

### File: src/hooks/useOrchestratedResearch.ts

Find where orchestratorAgent is called:

```typescript
// BEFORE
const orchestratorResult = await orchestratorAgent(state, onChunk, signal);

// AFTER
const enableSubagents = getResearchLimits().enableSubagents ?? false;
const maxResearchers = getResearchLimits().maxResearcherSubagents ?? 3;

const orchestratorResult = await orchestratorAgent(
  state,
  onChunk,
  signal,
  enableSubagents,
  maxResearchers,
);
```

---

## Phase 4: Update modelConfig.ts

### File: src/utils/modelConfig.ts

Add new flags to ResearchLimits interface:

```typescript
export interface ResearchLimits {
  // ... existing fields
  enableSubagents: boolean;           // NEW: master toggle
  enableSubagentResearch: boolean;    // NEW: spawn researchers
  enableSubagentValidation: boolean;  // NEW: spawn validators
  enableSubagentAnalysis: boolean;    // NEW: spawn analyzers
  maxResearcherSubagents: number;     // NEW: max concurrent researchers
  maxSynthesizerSubagents: number;    // NEW: max concurrent synthesizers
}
```

Add to LIMITS_DEFAULTS:

```typescript
const LIMITS_DEFAULTS: ResearchLimits = {
  // ... existing
  enableSubagents: false,
  enableSubagentResearch: false,
  enableSubagentValidation: false,
  enableSubagentAnalysis: false,
  maxResearcherSubagents: 3,
  maxSynthesizerSubagents: 1,
};
```

Update RESEARCH_PRESETS:

```typescript
const RESEARCH_PRESETS: ResearchPresetDef[] = [
  {
    id: 'super-quick',
    limits: {
      // ... existing
      enableSubagents: false,
    },
  },
  {
    id: 'quick',
    limits: {
      // ... existing
      enableSubagents: false,
    },
  },
  {
    id: 'normal',
    limits: {
      // ... existing
      enableSubagents: true,
      enableSubagentResearch: true,
      enableSubagentValidation: true,
      enableSubagentAnalysis: false,
      maxResearcherSubagents: 3,
    },
  },
  {
    id: 'extended',
    limits: {
      // ... existing
      enableSubagents: true,
      enableSubagentResearch: true,
      enableSubagentValidation: true,
      enableSubagentAnalysis: true,
      maxResearcherSubagents: 4,
    },
  },
  {
    id: 'max',
    limits: {
      // ... existing
      enableSubagents: true,
      enableSubagentResearch: true,
      enableSubagentValidation: true,
      enableSubagentAnalysis: true,
      maxResearcherSubagents: 5,
    },
  },
];
```

Update getResearchLimits() function:

```typescript
export function getResearchLimits(): ResearchLimits {
  // ... existing code
  return {
    // ... existing fields
    enableSubagents: getBool('enable_subagents', LIMITS_DEFAULTS.enableSubagents),
    enableSubagentResearch: getBool('enable_subagent_research', LIMITS_DEFAULTS.enableSubagentResearch),
    enableSubagentValidation: getBool('enable_subagent_validation', LIMITS_DEFAULTS.enableSubagentValidation),
    enableSubagentAnalysis: getBool('enable_subagent_analysis', LIMITS_DEFAULTS.enableSubagentAnalysis),
    maxResearcherSubagents: getInt('max_researcher_subagents', LIMITS_DEFAULTS.maxResearcherSubagents),
    maxSynthesizerSubagents: getInt('max_synthesizer_subagents', LIMITS_DEFAULTS.maxSynthesizerSubagents),
  };
}
```

---

## Phase 5: Update ResearchOutput.tsx for Subagent Display

### File: src/components/ResearchOutput.tsx

Add new section type for subagents:

```typescript
type ResearchOutputSection =
  | /* existing types */
  | { type: 'subagent-spawn'; subagentId: string; role: string; task: string }
  | { type: 'subagent-progress'; subagentId: string; role: string; progress: number }
  | { type: 'subagent-complete'; subagentId: string; role: string; output: string; tokensUsed: number };
```

Add rendering for subagent sections:

```typescript
case 'subagent-spawn':
  return (
    <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-2">
      <div className="text-xs font-semibold text-blue-800">
        Spawning {section.role}: {section.task}
      </div>
    </div>
  );

case 'subagent-progress':
  return (
    <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-blue-800">
          {section.role} — {section.progress}%
        </span>
        <div className="w-24 bg-blue-200 rounded-full h-1">
          <div
            className="bg-blue-600 h-1 rounded-full transition-all"
            style={{ width: `${section.progress}%` }}
          />
        </div>
      </div>
    </div>
  );

case 'subagent-complete':
  return (
    <div className="bg-green-50 border-l-4 border-green-400 p-3 mb-2">
      <div className="text-xs font-semibold text-green-800 mb-1">
        ✓ {section.role} complete ({section.tokensUsed} tokens)
      </div>
      <div className="text-xs text-gray-700 whitespace-pre-wrap">
        {section.output.slice(0, 200)}...
      </div>
    </div>
  );
```

---

## Phase 6: Update Audit Trail Integration

### File: src/utils/researchAudit.ts

Add subagent tracking to ResearchMetrics:

```typescript
export interface ResearchMetrics {
  // ... existing fields
  subagentCount?: number;
  subagentsByRole?: Record<string, number>;
  subagentTokens?: number;
}
```

---

## Phase 7: Add Abort Signal Threading

### File: src/hooks/useCycleLoop.ts

Ensure abort signal is passed through entire chain:

```typescript
const abortController = new AbortController();

// Pass to orchestrated research
await executeOrchestratedResearch(
  // ...
  abortSignal: abortController.signal,  // ← Make sure this exists
);
```

And in useOrchestratedResearch.ts, ensure it's passed to orchestratorAgent:

```typescript
const orchestratorResult = await orchestratorAgent(
  state,
  onChunk,
  signal,  // ← This is the abortSignal
  enableSubagents,
  maxResearchers,
);
```

---

## Phase 8: Testing

### Test Cases

1. **Basic Spawn**: Create manager, spawn single researcher, verify output
   ```typescript
   const manager = createSubagentManager();
   const result = await manager.spawn({
     id: 'test-1',
     role: 'researcher',
     task: 'Find market size',
     context: 'Product: collagen',
     input: 'market size',
   });
   expect(result.status).toBe('success');
   expect(result.output.length).toBeGreaterThan(0);
   ```

2. **Parallel Spawn**: Create manager, spawn 3 researchers, verify all complete
   ```typescript
   const results = await Promise.all([
     manager.spawn({ ... }),
     manager.spawn({ ... }),
     manager.spawn({ ... }),
   ]);
   expect(results).toHaveLength(3);
   expect(results.every(r => r.status === 'success')).toBe(true);
   ```

3. **Abort Signal**: Spawn, abort after 1s, verify status is 'aborted'
   ```typescript
   const controller = new AbortController();
   setTimeout(() => controller.abort(), 1000);
   const result = await manager.spawn({
     // ...
     signal: controller.signal,
   });
   expect(result.status).toBe('aborted');
   ```

4. **Concurrency Limit**: Spawn 10 researchers with max 3, verify queue works
   ```typescript
   manager.setMaxConcurrentGlobal(3);
   // Spawn 10...
   expect(manager.getActiveCount()).toBeLessThanOrEqual(3);
   ```

---

## Phase 9: Configuration & Enablement

### Default: Disabled

Subagents are OFF by default (backward compatible):

```typescript
localStorage.setItem('enable_subagents', 'false');
```

### Enable via Dashboard

Add toggle to Settings UI:

```tsx
<label>
  <input
    type="checkbox"
    checked={enableSubagents}
    onChange={(e) => {
      localStorage.setItem('enable_subagents', String(e.target.checked));
      window.location.reload();
    }}
  />
  Enable Subagents
</label>

{enableSubagents && (
  <input
    type="number"
    min="1"
    max="5"
    value={maxResearchers}
    onChange={(e) => {
      localStorage.setItem('max_researcher_subagents', e.target.value);
    }}
    placeholder="Max researchers"
  />
)}
```

### Or Enable via Preset

```typescript
// In Dashboard.tsx
function applyPreset(presetId: ResearchDepthPreset) {
  applyResearchPreset(presetId);
  // Subagents are now enabled for NR/EX/MX, disabled for SQ/QK
}
```

---

## Phase 10: Verify Integration

### Checklist

- [ ] All 3 new files created (subagentRoles.ts, subagentTools.ts, subagentManager.ts)
- [ ] types/index.ts updated with SubagentTask types
- [ ] researchAgents.ts: orchestratorAgent function accepts enableSubagents flag
- [ ] useOrchestratedResearch.ts: passes enableSubagents and maxResearchers
- [ ] modelConfig.ts: added subagent flags to ResearchLimits
- [ ] ResearchOutput.tsx: renders subagent spawn/progress/complete sections
- [ ] useCycleLoop.ts: abort signal threaded through entire chain
- [ ] researchAudit.ts: tracks subagent work
- [ ] Dashboard.tsx: has toggle to enable subagents
- [ ] Tests pass (spawn, parallel, abort, concurrency)

---

## Phase 11: Gradual Rollout

### Stage 1: Research Phase Only (Week 1)
Enable subagents in orchestrator/researcher phases only:
```typescript
enableSubagents: true,
enableSubagentResearch: true,
enableSubagentValidation: false,  // ← disabled
enableSubagentAnalysis: false,    // ← disabled
```

### Stage 2: Add Validation (Week 2)
```typescript
enableSubagentValidation: true,  // ← enabled
```

### Stage 3: Add Analysis (Week 3)
```typescript
enableSubagentAnalysis: true,  // ← enabled
```

### Stage 4: Full Suite (Week 4)
All enabled for MX preset. Optional for others.

---

## Common Integration Issues & Fixes

### Issue: "Subagent spawning but output is empty"
**Cause**: Subagent role system prompt incomplete or model can't follow format
**Fix**: Check system prompt in subagentRoles.ts, test with `reason` tool directly

### Issue: "Abort signal not propagating"
**Cause**: Signal not passed to SubagentSpawnRequest
**Fix**: Ensure `signal: abortSignal` is in spawn call

### Issue: "Tool authorization error"
**Cause**: Role trying to use tool it doesn't have access to
**Fix**: Check subagentRoles.ts allowedTools array for that role

### Issue: "Max concurrency exceeded" errors
**Cause**: Too many researchers spawned at once
**Fix**: Increase `maxResearcherSubagents` or use SQ/QK preset

### Issue: "Research takes longer with subagents"
**Cause**: Overhead of spawning multiple LLM instances
**Fix**: This is expected for very short research. Better on larger cycles (NR+)

---

## Performance Tips

1. **Use subagents for 30+ min research runs** — overhead paid back by parallelization
2. **Adjust maxResearchers based on Ollama VRAM** — each model copy uses memory
3. **Enable validation only for Extended/Max presets** — adds small overhead for small runs
4. **Monitor token usage** — subagents may use more total tokens (but faster wall-clock time)
