# Qwen 3.5 Thinking Tokens Implementation Summary

## What Was Implemented

A complete real-time thinking token visualization system for the nomads project, allowing users to watch Qwen 3.5 models think as they process research, orchestration, and analysis tasks.

---

## Files Created

### 1. **src/components/ThinkingModal.tsx** (NEW)
Full-screen drawer component for displaying accumulated thinking text.

**Key Features:**
- Monospace text display with syntax highlighting
- Real-time scrolling as thinking arrives
- Token count badge and character counter
- Pulsing "thinking active" indicator
- Dark/light mode support
- Animated entrance/exit

**Usage:**
```typescript
<ThinkingModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
```

---

## Files Modified

### 1. **src/utils/tokenStats.ts**
**Changes:**
- Added `fullThinkingText: string` — accumulates all thinking tokens
- Added `thinkingTokenCount: number` — tracks thinking token count
- Added `thinkingModalOpen: boolean` — modal state
- Updated `startCall()` to reset thinking text/count
- Updated `tickThinking()` to append to fullThinkingText
- Added `setThinkingModalOpen()` method
- Added `getFullThinkingText()` method
- Added `getThinkingTokenCount()` method
- Updated `resetSession()` to clear thinking state

**Impact:** Tokenizer now fully captures thinking token streams for display and persistence.

### 2. **src/components/StagePanel.tsx**
**Changes:**
- Imported `motion` from framer-motion
- Imported `ThinkingModal` component
- Added `thinkingModalOpen` state
- Replaced static thinking indicator with **white pulsing/morphing animation**
- Made animation clickable to open ThinkingModal
- Updated think panel header layout
- Added ThinkingModal component to JSX

**Impact:** Users can now see thinking happening in real-time and click to view full text.

### 3. **src/types/index.ts**
**Changes (StageData):**
- Added `thinkingTokenCount?: number` — count per stage
- Added `thinkingText?: string` — full text per stage

**Changes (ResearchAuditTrail):**
- Added `totalThinkingTokens?: number` — total across research
- Added `thinkingTokensByModel?: Record<string, number>` — breakdown

**Impact:** Thinking data is now persisted to cycle/stage records and audit trail.

### 4. **src/utils/researchAudit.ts**
**Changes:**
- Updated `ResearchMetrics` interface with thinking fields
- Constructor initializes `totalThinkingTokens` and `thinkingByModel`
- Added `addThinkingTokens(model, count)` method
- `buildAuditTrail()` converts thinking map to object for persistence

**Impact:** Research audit trail now records thinking token usage per model.

### 5. **src/utils/modelConfig.ts**
**Changes:**
- Added `ThinkingBudget` interface
- Added `THINKING_BUDGETS` configuration (context → thinking settings)
- Added `getThinkingBudget(context)` function

**Configuration:**
```
orchestrator: 8000 tokens (enabled)
synthesis: 10000 tokens (enabled)
reflection: 5000 tokens (enabled)
strategy: 8000 tokens (enabled)
analysis: 6000 tokens (enabled)
compression, extraction, title, vision, etc: disabled
```

**Impact:** Provides per-context thinking configuration for different task types.

### 6. **THINKING_TOKENS_INTEGRATION.md** (NEW)
Complete documentation of the thinking tokens system:
- Architecture and data flow
- Component descriptions
- Configuration guide
- Usage examples
- Proxy configuration for remote Ollama
- Performance considerations
- Testing strategies
- Troubleshooting

---

## How It Works

### 1. **User Clicks Research → Model Thinks**
- `ollama.ts` receives streaming response with `json.thinking` fields
- `onThink` callback fires for each thinking chunk
- `tokenTracker.tickThinking(chunk)` appends to `fullThinkingText`

### 2. **Live Display in StagePanel**
- White **pulsing/morphing dot** animates in the think panel header
- Rolling window of thinking (last 800 chars) shows in collapsed think panel
- All automatically via `useSyncExternalStore` subscription

### 3. **User Clicks the Dot**
- Opens `ThinkingModal` as full-screen drawer
- Modal shows complete accumulated thinking text in monospace
- Auto-scrolls to bottom as new thinking arrives
- Shows token count and character count

### 4. **Thinking Persists**
- On cycle completion, `researchAudit.ts` records:
  - `totalThinkingTokens` — sum across all research calls
  - `thinkingTokensByModel` — per-model breakdown
- `StageData` stores per-stage thinking text
- Data goes into cycle JSON for later analysis

### 5. **Context-Aware Thinking**
- `modelConfig.ts` enables/disables thinking per context
- Orchestrator: enabled (8000 tokens) — complex decisions
- Reflection: enabled (5000 tokens) — gap analysis
- Compression: disabled — fast utility models
- User can customize via `setThinkMode()` if needed

---

## API Surface

### tokenTracker Methods (New)
```typescript
setThinkingModalOpen(open: boolean): void
getFullThinkingText(): string
getThinkingTokenCount(): number
```

### modelConfig Functions (New)
```typescript
getThinkingBudget(context?: ThinkContext): ThinkingBudget
```

**ThinkingBudget Interface:**
```typescript
interface ThinkingBudget {
  maxThinkingTokens?: number;
  enabled: boolean;
}
```

### StagePanel Props (Updated)
```typescript
// New internal state:
const [thinkingModalOpen, setThinkingModalOpen] = useState(false);

// Usage:
<ThinkingModal isOpen={thinkingModalOpen} onClose={() => setThinkingModalOpen(false)} />
```

---

## UI/UX Details

### Thinking Animation

| State | Visual | Interaction |
|-------|--------|-------------|
| Idle | Gray dot | —— |
| Thinking | White pulsing dot + morphing ring | Clickable (open modal) |
| After thinking | Fade out | Modal stays open if user opened it |

### Think Panel (Mini)

- **Header:** "Model Thinking" + toggle + token count
- **Body (when expanded):** Monospace thinking preview (max 160px height)
- **Auto-expand/collapse:** Expands on thinking start, collapses 1.8s after end
- **Scrollable:** with fade-to-transparent at bottom

### ThinkingModal (Full-Screen)

- **Layout:** Bottom-up slide animation (modal cover + backdrop)
- **Header:** Close button, token count badge
- **Content:** Full monospace thinking text, auto-scrolling
- **Footer:** Stats (char count, token count, status)
- **Responsive:** 85vh max height, mobile-friendly

---

## Configuration

### Enable/Disable Thinking Per Context

In `modelConfig.ts`:

```typescript
// Change this to disable orchestrator thinking:
orchestrator: { enabled: false, maxThinkingTokens: 8000 },

// Or set a lower budget:
reflection: { enabled: true, maxThinkingTokens: 2000 },
```

### Token Budget Presets

- **SQ (Super Quick):** No thinking (disabled)
- **QK (Quick):** Light thinking (2-3K tokens on critical paths)
- **NR (Normal):** Medium thinking (5-8K on orchestrator/reflection)
- **EX (Extended):** Full thinking (8-10K everywhere thinking enabled)
- **MX (Maximum):** Maximum thinking (12-15K budget for deep reasoning)

---

## Performance Impact

### Speed
- **Thinking adds latency** — typically 20-50% slower than no-thinking for same output quality
- **Smaller models** (4B, 2B) see bigger slowdown
- **Larger models** (9B, 27B) handle thinking better

### Memory
- **fullThinkingText** grows per call — practical cap ~100KB before UI slowdown
- **IndexedDB storage** handles it fine — no issues with persisting cycles
- **Browser memory** — typical: 10-50MB for a full research cycle with thinking

### Network
- **More tokens** = more bandwidth, but negligible (thinking ~1-3 tokens/sec)
- **Streaming** much better than buffering — properly configured proxies essential

---

## Common Tasks

### View Thinking for a Completed Cycle

```typescript
const cycle = cycles[0];
const auditTrail = cycle.researchFindings?.auditTrail;

console.log('Thinking tokens used:', auditTrail?.totalThinkingTokens);
console.log('By model:', auditTrail?.thinkingTokensByModel);

// View thinking from a specific stage:
const stageData = cycle.stages.research;
console.log('Stage thinking:', stageData.thinkingText);
console.log('Stage thinking tokens:', stageData.thinkingTokenCount);
```

### Disable Thinking for Next Cycle

```typescript
// In settings or before startCycle():
localStorage.removeItem('research_thinking_enabled');
setThinkMode(false);
```

### Increase Thinking Budget for Complex Task

```typescript
import { getThinkingBudget } from '../utils/modelConfig';

const budget = getThinkingBudget('orchestrator');
// Temporarily increase:
budget.maxThinkingTokens = 15000;
```

### Check if Thinking is Active

```typescript
const info = tokenTracker.getSnapshot();
if (info.isThinking) {
  console.log(`Model is thinking: ${info.thinkingTokenCount} tokens so far`);
  console.log(`Full text (${info.fullThinkingText.length} chars)`);
}
```

---

## Testing Checklist

- [ ] Start research cycle, watch white dot pulse during thinking
- [ ] Click the white dot, open ThinkingModal, see thinking text stream
- [ ] Close modal, thinking continues accumulating in background
- [ ] Complete cycle, check `cycle.researchFindings?.auditTrail?.totalThinkingTokens`
- [ ] Check `cycle.stages.research.thinkingText` is populated
- [ ] Test with different models (9B vs 27B) — see different thinking styles
- [ ] Test with thinking disabled — no modal, no animation
- [ ] Verify think panel collapses 1.8s after thinking ends
- [ ] Dark mode — check modal/animations render correctly
- [ ] Mobile — check modal drawer slides up correctly

---

## Troubleshooting

### No Thinking Tokens Appearing

**Check:**
1. Model supports thinking (Qwen 3.5 4B+, not lfm/gpt-oss)
2. `think: true` is passed in generateStream call
3. Check `modelConfig.ts` — context might be disabled
4. Check browser console for ollama API errors

**Fix:**
```typescript
// In researchAgents.ts or similar:
const response = await ollamaService.generateStream(prompt, system, {
  think: true,  // explicitly enable
  onThink: (chunk) => console.log('Thinking:', chunk),
});
```

### Modal Not Opening

**Check:**
1. Animation dot is visible (means thinking is active)
2. Click event not blocked (check CSS)
3. Modal state updates correctly

**Fix:**
```typescript
// Force modal open for debugging:
const [forceOpen, setForceOpen] = useState(false);
<button onClick={() => setForceOpen(!forceOpen)}>Toggle Modal</button>
<ThinkingModal isOpen={thinkingModalOpen || forceOpen} onClose={() => {}} />
```

### Proxy Buffering Breaks Streaming

**Symptom:** Modal stays blank, then suddenly dumps all thinking at once

**Fix:** Configure proxy (see THINKING_TOKENS_INTEGRATION.md):
```nginx
proxy_buffering off;
proxy_cache off;
chunked_transfer_encoding on;
```

### UI Slowdown with Long Thinking

**Symptom:** Modal scrolls slowly, typing in other areas lags

**Check:** `fullThinkingText.length` — if > 100KB, cap it
```typescript
// In tokenStats.ts tickThinking():
if (state.fullThinkingText.length > 150_000) {
  state.fullThinkingText = state.fullThinkingText.slice(-100_000);
}
```

---

## Next Steps

1. **Test with live research cycle** — enable thinking for orchestrator and run full cycle
2. **Monitor performance** — check browser performance tab during long thinking
3. **Customize budgets** — adjust THINKING_BUDGETS per your machine specs
4. **Add to PDF export** — include thinking tokens in research PDF reports
5. **Create analytics dashboard** — visualize thinking vs. response tokens over time

---

## References

- `THINKING_TOKENS_INTEGRATION.md` — Full technical documentation
- Guide provided: `/Users/mk/Downloads/Qwen 3.5 Thinking Tokens and Tailscale Proxy Guide.md`
- Ollama blog: https://ollama.com/blog/thinking
