# NOMADS - Technical Architecture

## Component Hierarchy

```
<App>
  └─ <CampaignProvider>
      ├─ <CampaignSelector>
      │   └─ Campaign list, creation, presets
      ├─ <ControlPanel>
      │   └─ START/PAUSE buttons, settings
      ├─ <CycleTimeline>
      │   └─ Visual timeline of cycle stages
      └─ <StagePanel>
          └─ Current stage output display
```

---

## State Management Flow

### Data Hierarchy
```
CampaignContext (global)
  ├─ campaigns[] (all created campaigns)
  ├─ activeCampaignId (current campaign)
  ├─ currentCycle (active cycle)
  │   ├─ id
  │   ├─ status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
  │   ├─ currentStage: 'research' | 'taste' | 'make' | 'test' | 'memories'
  │   └─ stages: { research: Stage, taste: Stage, ... }
  │       └─ Stage: { status, output, error }
  └─ completedCycles[]
```

### Context Methods
```typescript
// Create new campaign
createCampaign(data: CampaignData): Campaign

// Start cycle on campaign
startCycle(campaignId: string): void

// Update current cycle
updateCycle(cycle: Cycle): void

// Update specific stage
updateStageOutput(stageName: string, output: string): void

// Pause/resume
pauseCycle(): void
resumeCycle(): void
```

---

## Hooks & Their Responsibilities

### `useCycleLoop` 🔑 CRITICAL
**File**: `src/hooks/useCycleLoop.ts`

**Responsibility**: Orchestrate the 5-stage cycle execution

**Key Logic**:
```typescript
export function useCycleLoop(campaign: Campaign, cycle: Cycle) {
  const { updateCycle, updateStageOutput } = useContext(CampaignContext);
  const ollama = useOllama();

  // 1. Listen for cycle start
  // 2. Execute stages in order
  // 3. Handle pause/resume
  // 4. Update UI on each stage
  // 5. Auto-transition to next stage

  // CRITICAL: refreshCycleReference keeps state in sync
}
```

**Critical Fix** (Feb 26):
The `refreshCycleReference` function was causing state updates to not trigger re-renders:
```typescript
// ❌ BROKEN: Over-complicated
function refreshCycleReference(cycle: Cycle): Cycle {
  return {
    ...cycle,
    stages: {
      ...cycle.stages,
      research: { ...cycle.stages.research },
      taste: { ...cycle.stages.taste },
      // ... 3 more stages - unnecessary nesting!
    },
  };
}

// ✅ FIXED: Minimal object spreading
function refreshCycleReference(cycle: Cycle): Cycle {
  return {
    ...cycle,
    stages: { ...cycle.stages },
  };
}
```

**Why it matters**:
React only re-renders if object references change. Deep nesting can break this. Shallow spread of just the changed objects (cycle and stages) is sufficient.

### `useOllama`
**File**: `src/hooks/useOllama.ts`

**Responsibility**: Connect to Ollama and generate text

**Methods**:
```typescript
// Standard usage with default streaming
const { response } = await generate(prompt, systemPrompt);

// Callback-based streaming for real-time output
const { response } = await generate(prompt, systemPrompt, {
  onChunk: (chunk: string) => updateUI(chunk)
});

// Alternative explicit method
await generateWithCallback(prompt, systemPrompt, onChunk);
```

**Error Handling**:
- Catches network errors → shows user message
- Returns empty string on failure
- No throwing errors (fail gracefully)

### `useStorage`
**File**: `src/hooks/useStorage.ts`

**Responsibility**: Persist campaigns to IndexedDB

**Methods**:
```typescript
// Get all campaigns
const campaigns = await getSavedCampaigns();

// Save/update campaign
await saveCampaign(campaign);

// Save cycle
await saveCycle(campaignId, cycle);

// Clear all data
await clearAllData();
```

**How it syncs**:
- CampaignContext triggers update on save
- Storage hook listens for context changes
- IndexedDB automatically syncs

---

## Data Flow: Starting a Cycle

### Step 1: User clicks START
```
ControlPanel.tsx (START button)
  → onClick handler calls context.startCycle(campaignId)
```

### Step 2: Context creates cycle object
```typescript
// CampaignContext.tsx
const newCycle: Cycle = {
  id: generateId(),
  campaignId,
  status: 'RUNNING',
  currentStage: 'research',
  stages: {
    research: { status: 'RUNNING', output: '' },
    taste: { status: 'IDLE', output: '' },
    make: { status: 'IDLE', output: '' },
    test: { status: 'IDLE', output: '' },
    memories: { status: 'IDLE', output: '' },
  },
};

setCycle(newCycle);
```

### Step 3: useCycleLoop detects cycle change
```typescript
// useCycleLoop.ts
useEffect(() => {
  if (cycle?.status === 'RUNNING') {
    executeCycle(); // Start execution
  }
}, [cycle]);
```

### Step 4: Execute each stage
```typescript
async function executeStage(stageName: StageType) {
  // 1. Update UI: "RUNNING"
  updateCycle({ ...cycle, currentStage: stageName, ... });

  // 2. Get prompt
  const prompt = getPrompt(stageName, campaign);

  // 3. Call Ollama with streaming
  const output = await ollama.generate(prompt, systemPrompt, {
    onChunk: (chunk) => {
      // Real-time output update (if UI supports it)
      updateStageOutput(stageName, previousOutput + chunk);
    }
  });

  // 4. Final output
  updateStageOutput(stageName, output);

  // 5. Mark complete
  updateCycle({ ...cycle, stages: { ...stages, [stageName]: COMPLETED } });

  // 6. Move to next stage
  executeStage(nextStageName);
}
```

### Step 5: Cycle completes
```typescript
// After memories stage completes
const completedCycle = { ...cycle, status: 'COMPLETED' };
updateCycle(completedCycle);

// Save to IndexedDB via storage hook
// UI updates to show "COMPLETED"
```

---

## Prompt System

### Location: `src/utils/prompts.ts`

### Research Prompt Structure
```
SYSTEM: You are a competitive intelligence analyst for creative advertising.

USER: [Campaign brief, target market, competitors]

OUTPUT:
§ Market Analysis
  → Audience demographics, behaviors, needs
  → Market size and growth potential

§ Competitor Creative
  → Competitor A: [tactics, hooks, styles]
  → Competitor B: [tactics, hooks, styles]

§ Creative Opportunities
  → Hook types that resonate
  → Untapped angles vs competitors
  → Unique messaging angles
```

### Taste Prompt Structure
```
SYSTEM: Define creative direction as a competitive weapon.

INPUT: [Research output + campaign brief]

OUTPUT:
§ Visual Identity
  → Color palette with rationale
  → Typography and mood
  → Photography/illustration style

§ Messaging Tone
  → Voice and personality
  → Pacing and rhythm
  → Emotional appeals

§ Competitive Differentiation
  → What makes this unique vs. competitors
  → How this wins in the market
```

---

## State Updates: React Patterns Used

### 1. Context + useContext
```typescript
const { campaigns, updateCycle } = useContext(CampaignContext);
```

### 2. useEffect for side effects
```typescript
useEffect(() => {
  if (cycle?.status === 'RUNNING') {
    executeCycle();
  }
}, [cycle?.status]);
```

### 3. useCallback for function memoization
```typescript
const updateStageOutput = useCallback((stage, output) => {
  setCycle(prev => ({
    ...prev,
    stages: { ...prev.stages, [stage]: { ...prev.stages[stage], output } }
  }));
}, []);
```

### 4. useRef for AbortController (pause/resume)
```typescript
const abortControllerRef = useRef<AbortController | null>(null);

function pauseCycle() {
  abortControllerRef.current?.abort();
}

function resumeCycle() {
  abortControllerRef.current = new AbortController();
  executeCycle();
}
```

---

## Error Handling Strategy

### Approach: Fail Gracefully
- Don't throw errors that break the app
- Show user-friendly error messages
- Suggest recovery steps

### Implementation
```typescript
// useCycleLoop.ts
try {
  const output = await ollama.generate(prompt, systemPrompt);
  updateStageOutput(stageName, output);
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';
  updateCycle({
    ...cycle,
    stages: { ...stages, [stageName]: { status: 'ERROR', error: errorMsg } }
  });
}
```

### Specific Errors Handled
- Ollama connection timeout
- Model not found
- Network errors
- Invalid prompt format

---

## Performance Considerations

### React Rendering
- Context updates cause full re-render of provider
- Use `useCallback` to prevent dependency re-creation
- Memoize expensive computations

### Storage
- IndexedDB is async - don't block UI
- Batch writes when possible
- Clear old cycles periodically

### Ollama
- Streaming responses for real-time feedback
- Abort long-running requests with AbortController
- Don't parallel-run multiple stages (sequential for simplicity)

---

## Testing Flow

### Manual Testing Checklist
1. ✅ Create campaign
2. ✅ Start cycle
3. ✅ Watch Research stage
4. ✅ Watch Taste stage
5. ✅ Pause during execution
6. ✅ Resume
7. ✅ Complete all stages
8. ✅ Reload page - data persists
9. ✅ Create second campaign
10. ✅ Verify independent state

### Browser DevTools Checks
- **React DevTools**: Inspect CampaignContext values
- **Network**: Verify Ollama requests to localhost:11434
- **IndexedDB**: Check stored campaigns in Storage tab
- **Console**: No errors during execution

---

## Future Architecture Changes

### When Adding Vision LLM (Test Stage)
1. Add new hook: `useVision`
2. Import Claude API or Vision service
3. Pass Make stage output to Vision
4. Return evaluation feedback

### When Adding Figma Integration (Make Stage)
1. Use Figma MCP `get_design_context`
2. Or use Claude Code's `generate_figma_design`
3. Parse output into Figma frame structure
4. Return design asset references

### When Multi-Tenant
1. Add Auth layer
2. Namespace storage by user
3. Add campaign sharing
4. Implement permissions

---

## Code Style & Conventions

- **Components**: PascalCase, one per file
- **Hooks**: camelCase, start with `use`
- **Utils**: camelCase, functional approach
- **Types**: PascalCase, in separate types file or inline
- **Constants**: UPPER_SNAKE_CASE
- **CSS**: Tailwind classes, rarely custom CSS

---

## Key Takeaways

1. **CycleLoop is the heart**: Everything orchestrates through this
2. **Simple state refresh**: `{ ...cycle, stages: { ...cycle.stages } }` is enough
3. **Fail gracefully**: Show errors to user, don't crash
4. **Storage is automatic**: Context → Storage hook → IndexedDB
5. **Streaming works**: UI updates happen via onChunk callbacks

