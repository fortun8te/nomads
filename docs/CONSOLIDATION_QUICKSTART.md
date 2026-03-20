# Memory Consolidation — Quick Start Guide

## Files Overview

| File | Purpose | Lines |
|------|---------|-------|
| `/src/utils/consolidationService.ts` | Core consolidation engine | 430 |
| `/src/hooks/useConsolidation.ts` | React hook for UI integration | 85 |
| `/src/types/consolidationTypes.ts` | TypeScript type definitions | 130 |
| `/docs/CONSOLIDATION_DESIGN.md` | Full design + pseudocode + edge cases | 650+ |
| `/docs/CONSOLIDATION_IMPLEMENTATION_SUMMARY.md` | Implementation summary + decisions | 300+ |

---

## 30-Second Overview

**Problem:** Episodic memories accumulate, bloating context.

**Solution:** Weekly consolidation compresses 5–10 related episodic memories into 1 semantic memory.

**How it works:**
1. Group episodic memories by tag
2. For each group, call qwen3.5:2b with prompt: "Synthesize these 5 memories into 1 key insight"
3. Archive originals (keep for audit), add new semantic memory
4. Result: ~50% context reduction

**Trigger:** Manual button / weekly schedule / 50+ episodic memories threshold

---

## API Quick Reference

### ConsolidationService (static methods)

```typescript
// Check if consolidation should trigger
const { should, reason } = ConsolidationService.shouldTriggerConsolidation(allMemories);
// reason: 'schedule' | 'threshold' | undefined

// Run consolidation
const result = await ConsolidationService.consolidateWeekly(
  allMemories,
  'manual', // or 'schedule' | 'threshold'
  cycleId
);
// result: ConsolidationResult { successfulCompressions, contextReductionPercent, ... }

// Group episodic memories (Phase 1)
const groups = ConsolidationService.groupEpisodicMemories(episodic);
// groups: MemoryGroup[] — ready for compression

// Compress a single group (Phase 2)
const result = await ConsolidationService.compressGroup(group);
// result: CompressionResult { success, semantic, archivedIds, ... }

// Archive a memory (Phase 3)
const updated = ConsolidationService.archiveEpisodicMemory(id, allMemories);
```

### useConsolidation Hook

```typescript
const {
  consolidationState,  // { isRunning, result, error, progress }
  triggerConsolidation, // (manual?: boolean) => Promise<void>
  resetState,           // () => void
  shouldAutoTrigger     // boolean
} = useConsolidation();

// Usage in component
<button onClick={() => triggerConsolidation(true)} disabled={consolidationState.isRunning}>
  {consolidationState.isRunning ? 'Consolidating...' : 'Consolidate Now'}
</button>

{consolidationState.result && (
  <div>
    Context reduced by {consolidationState.result.contextReductionPercent}%
    Archived {consolidationState.result.totalEpisodicArchived} memories
    Created {consolidationState.result.newSemanticMemoriesCreated} semantic insights
  </div>
)}
```

---

## Configuration Constants

Edit in `/src/utils/consolidationService.ts`:

```typescript
const MIN_GROUP_SIZE = 2;           // Don't consolidate < 2 memories
const MAX_GROUP_SIZE = 10;          // Split groups > 10
const EPISODIC_THRESHOLD = 50;      // Auto-trigger at 50+ episodic
const MIN_CONFIDENCE_THRESHOLD = 0.4; // Reject if confidence < 40%
const COMPRESSION_MODEL = 'qwen3.5:2b'; // Fast compression model
const CONSOLIDATION_STORAGE_KEY = 'nomad_consolidation_history';
```

---

## Trigger Conditions

**Manual:** User clicks "Consolidate Now" button

**Threshold:** >= 50 episodic memories (non-seed, non-archived)

**Schedule:** 7+ days since last consolidation

**Check via:**
```typescript
const { should, reason } = ConsolidationService.shouldTriggerConsolidation(allMemories);
// should: boolean
// reason: 'schedule' | 'threshold' | undefined
```

---

## Confidence Scoring

Semantic memory rejected if confidence < 0.4.

**Formula:**
- Base: 0.5
- Evidence boost: +min(groupSize * 0.1, 0.4)
- Summary quality: +0.05 if 30–500 chars, else penalty
- Tag consistency: +0.05 if 2+ tags
- Clamp: [0, 1]

**Examples:**
- 2 memories, good summary: ~0.75 ✓
- 5 memories, excellent summary: ~0.95 ✓
- 2 memories, empty summary: ~0.6 (borderline)

---

## Integration Pattern

### In CampaignContext (cycle end)

```typescript
useEffect(() => {
  if (!cycleLoopCycle || cycleLoopCycle.status !== 'complete') return;

  // After cycle completes, optionally consolidate
  const { triggerConsolidation, shouldAutoTrigger } = useConsolidation();
  if (shouldAutoTrigger) {
    triggerConsolidation(false); // Auto-trigger if threshold met
  }
}, [cycleLoopCycle?.status]);
```

### In Dashboard / Settings

```typescript
export function ConsolidationPanel() {
  const { consolidationState, triggerConsolidation } = useConsolidation();

  return (
    <div className="consolidation-panel">
      <h3>Memory Management</h3>
      <button
        onClick={() => triggerConsolidation(true)}
        disabled={consolidationState.isRunning}
      >
        {consolidationState.isRunning ? 'Consolidating...' : 'Consolidate Now'}
      </button>

      {consolidationState.result && (
        <div className="result">
          <p>Context reduction: {consolidationState.result.contextReductionPercent}%</p>
          <p>Archived: {consolidationState.result.totalEpisodicArchived}</p>
          <p>Created: {consolidationState.result.newSemanticMemoriesCreated} semantic memories</p>
        </div>
      )}

      {consolidationState.error && (
        <p className="error">{consolidationState.error}</p>
      )}
    </div>
  );
}
```

---

## Handling Results

```typescript
const result = await ConsolidationService.consolidateWeekly(allMemories, 'manual');

if (result.error) {
  console.error('Consolidation failed:', result.error);
  // Handle error gracefully
}

if (result.successfulCompressions > 0) {
  console.log(
    `✓ Consolidated ${result.totalEpisodicArchived} memories into ` +
    `${result.newSemanticMemoriesCreated} insights. ` +
    `Context reduced by ${result.contextReductionPercent}%.`
  );
}

// Inspect per-group results
result.compressionResults.forEach(cr => {
  if (!cr.success) {
    console.warn(`Group "${cr.group.tag}" failed:`, cr.error);
  } else {
    console.log(`Group "${cr.group.tag}" → "${cr.semantic?.content?.slice(0, 50)}..."`);
  }
});
```

---

## Troubleshooting

### Consolidation not triggering

**Check:**
1. `shouldTriggerConsolidation()` returns false?
   - Episodic count < 50? (Check `filterEpisodicMemories()`)
   - < 7 days since last run? (Check `getLastConsolidationTime()`)

2. `consolidateWeekly()` called but no result?
   - Check browser console for errors
   - Verify qwen3.5:2b model is loaded (Ollama health check)

3. Manual button not working?
   - Check that `triggerConsolidation()` is called with no args or `manual: true`
   - Verify `consolidationState.isRunning` is false before next trigger

### Low confidence rejections

**If many compressions are rejected for low confidence:**
1. Lower `MIN_CONFIDENCE_THRESHOLD` (currently 0.4) to 0.3
2. Check that group sizes are reasonable (2–10 memories)
3. Verify summary quality (length 30–500 chars is ideal)

### LLM compression timeouts

**If `compressGroup()` fails with timeout:**
1. Check Ollama is running: `curl http://localhost:11440/api/tags`
2. Check qwen3.5:2b is loaded: `ollama list | grep qwen`
3. Try restarting Ollama: `pkill ollama && ollama serve`

---

## Testing Consolidation

### Manual test in browser console

```javascript
// Import the service
import { ConsolidationService } from './src/utils/consolidationService.ts';

// Get current memories
const allMemories = // ... from memoryStore

// Check trigger
const { should, reason } = ConsolidationService.shouldTriggerConsolidation(allMemories);
console.log('Should trigger?', should, reason);

// Group them
const groups = ConsolidationService.groupEpisodicMemories(
  allMemories.filter(m => !m.id.startsWith('seed-'))
);
console.log('Groups:', groups.map(g => g.tag));

// Run full consolidation
const result = await ConsolidationService.consolidateWeekly(allMemories, 'manual');
console.log('Result:', result);
```

### Unit test template

```typescript
import { ConsolidationService } from '../consolidationService';

describe('ConsolidationService', () => {
  test('groups memories by tag', () => {
    const mems = [
      { id: '1', tags: ['supplement-angles'], content: 'A' },
      { id: '2', tags: ['supplement-angles'], content: 'B' },
      { id: '3', tags: ['other'], content: 'C' },
    ];
    const groups = ConsolidationService.groupEpisodicMemories(mems);
    expect(groups.length).toBe(1);
    expect(groups[0].tag).toBe('supplement-angles');
    expect(groups[0].primaryMemories.length).toBe(2);
  });

  test('calculates confidence correctly', () => {
    const conf = ConsolidationService['calculateConfidence'](5, 200, ['tag1', 'tag2']);
    expect(conf).toBeGreaterThan(0.7);
  });
});
```

---

## Edge Case Checklists

### When consolidation is about to run

- [ ] Check: Are there 2+ episodic memories? (MIN_GROUP_SIZE)
- [ ] Check: Is Ollama running?
- [ ] Check: Is qwen3.5:2b model loaded?
- [ ] Check: No active cycle (optional; consolidation is async-safe)

### If consolidation fails

- [ ] Don't panic! Original memories are NOT deleted.
- [ ] Check error message in `consolidationState.error`
- [ ] Retry manually: click "Consolidate Now" again
- [ ] If persistent: check Ollama logs

### After successful consolidation

- [ ] Verify context reduction % is positive
- [ ] Check that archived memories have 'archived' tag
- [ ] Inspect new semantic memories in Memory panel
- [ ] Optional: Click to view compression audit trail

---

## Next Steps (After Integration)

1. **Add ConsolidationPanel to Dashboard**
   - Show episodic vs. semantic count
   - Manual trigger button
   - Last result display

2. **Wire into CampaignContext**
   - Check `shouldAutoTrigger` after cycle completes
   - Optionally auto-trigger consolidation

3. **Add Memory archival UI**
   - View archived memories
   - Restore if needed

4. **Add audit trail viewer**
   - History of consolidation runs
   - Which memories were consolidated

5. **Phase 2: Embeddings-based clustering**
   - Add vector embeddings for semantic similarity
   - Replace alphabetic bucketing with cosine distance

---

## Key Files

- **Service:** `/src/utils/consolidationService.ts`
- **Hook:** `/src/hooks/useConsolidation.ts`
- **Types:** `/src/types/consolidationTypes.ts`
- **Design:** `/docs/CONSOLIDATION_DESIGN.md` (full reference)
- **Summary:** `/docs/CONSOLIDATION_IMPLEMENTATION_SUMMARY.md` (overview)
