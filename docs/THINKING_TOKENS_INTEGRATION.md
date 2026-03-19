# Qwen 3.5 Thinking Tokens Integration

Complete implementation of thinking token visualization and streaming for the nomads ad research pipeline.

## Overview

This integration captures and displays Qwen 3.5 model thinking tokens in real-time, allowing users to see the model's internal reasoning process while research, orchestration, and analysis stages run.

### Key Features

- **Live Thinking Display**: Real-time visualization of thinking tokens in a dedicated modal
- **Thinking Animation**: White pulsing/morphing dot in the stage panel header (clickable to open modal)
- **Full Text Accumulation**: Complete thinking text persisted to cycle audit trail
- **Token Counting**: Tracks thinking vs. response tokens separately
- **Context-Aware Thinking**: Automatic enabling/disabling based on task type
- **Streaming Integration**: Fully threaded through ollama.ts streaming pipeline

---

## Architecture

### Data Flow

```
ollama.ts
  ├─ generateStream() receives onThink callback
  ├─ Parses json.thinking from Ollama response
  └─> tokenTracker.tickThinking(text)
        ├─ Updates fullThinkingText
        ├─ Updates liveThinkSnippet (rolling window)
        ├─ Updates thinkingTokenCount
        └─> Notifies subscribers (useSyncExternalStore)
              └─> StagePanel re-renders
                    ├─ Thinking animation updates
                    ├─ ResearchOutput displays thinking sections
                    └─> ThinkingModal streams live text
```

### Storage

Thinking tokens are persisted at two levels:

1. **StageData** (types/index.ts):
   ```typescript
   thinkingTokenCount?: number;  // count for this stage
   thinkingText?: string;        // full text for this stage
   ```

2. **ResearchAuditTrail** (types/index.ts):
   ```typescript
   totalThinkingTokens?: number;              // total across research
   thinkingTokensByModel?: Record<string, number>;
   ```

---

## Components

### 1. **ThinkingModal.tsx** (NEW)

Full-screen drawer component showing accumulated thinking text.

**Features:**
- Monospace text display (gray on dark background)
- Token count badge
- Character count display
- Auto-scroll to bottom as thinking arrives
- Pulsing activity indicator when model is thinking

**Usage:**
```typescript
<ThinkingModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
```

**Props:**
- `isOpen: boolean` — whether modal is visible
- `onClose: () => void` — close callback

### 2. **StagePanel.tsx** (UPDATED)

Enhanced stage panel with thinking controls.

**New Elements:**
- **Thinking Animation Dot** (left of "Model Thinking" label)
  - White pulsing/morphing animation when thinking
  - Clickable to open ThinkingModal
  - Shows thinking is active

- **Think Panel Toggle** (collapsible section)
  - Shows rolling window of thinking + response tokens
  - Toggle between expanded/collapsed
  - Auto-expands when thinking starts
  - Auto-collapses after thinking ends (1.8s delay)

**Changes:**
- Added `thinkingModalOpen` state
- Imported `motion` from framer-motion for animation
- Imported `ThinkingModal` component
- Updated think panel header with clickable animation button

### 3. **tokenStats.ts** (UPDATED)

Enhanced token tracking with thinking accumulation.

**New Fields in TokenInfo:**
```typescript
fullThinkingText: string;       // all thinking concatenated
thinkingTokenCount: number;     // count of thinking tokens
thinkingModalOpen: boolean;     // modal visibility state
```

**New Methods:**
```typescript
setThinkingModalOpen(open: boolean): void
getFullThinkingText(): string
getThinkingTokenCount(): number
```

**Updated Methods:**
- `startCall()` — clears thinking text/count on new call
- `tickThinking(text)` — appends to fullThinkingText, updates snippet
- `resetSession()` — clears thinking state

### 4. **ollama.ts** (ALREADY IMPLEMENTED)

The streaming client already supports thinking tokens:

```typescript
onThink?: (chunk: string) => void;  // callback for thinking tokens

// In generateStream() response parsing:
if (json.thinking) {
  tokenTracker.tickThinking(json.thinking);
  onThink?.(json.thinking);
}
```

No changes needed — already integrated.

---

## Configuration

### Thinking Token Budget (modelConfig.ts)

Define which tasks enable thinking and how many tokens to budget:

```typescript
const THINKING_BUDGETS: Record<ThinkContext, ThinkingBudget> = {
  orchestrator: { enabled: true, maxThinkingTokens: 8000 },
  synthesis: { enabled: true, maxThinkingTokens: 10000 },
  reflection: { enabled: true, maxThinkingTokens: 5000 },
  strategy: { enabled: true, maxThinkingTokens: 8000 },
  analysis: { enabled: true, maxThinkingTokens: 6000 },
  compression: { enabled: false },  // no thinking for fast models
  extraction: { enabled: false },
  title: { enabled: false },
  vision: { enabled: false },
  fast: { enabled: false },
  executor: { enabled: false },
  chat: { enabled: false },
};
```

**Get budget for a context:**
```typescript
const budget = getThinkingBudget('orchestrator');
// Returns: { enabled: true, maxThinkingTokens: 8000 }
```

### Models Supporting Thinking

- **Qwen 3.5 27B+** — Full reasoning support
- **Qwen 3.5 9B** — Supported
- **Qwen 3.5 4B** — Limited but supported
- **Qwen 3.5 0.8b/2b** — Not recommended (too small)

---

## Usage

### In Streaming Calls

Pass `think: true` and `onThink` callback:

```typescript
const result = await ollamaService.generateStream(
  prompt,
  systemPrompt,
  {
    model: 'qwen3.5:9b',
    think: true,  // enable thinking
    onThink: (chunk) => {
      console.log('Thinking:', chunk);
      // Already handled by tokenTracker
    },
    onChunk: (chunk) => {
      // Response tokens
    },
  }
);
```

### In Research/Analysis Stages

The `useOrchestratedResearch` hook automatically enables thinking for appropriate contexts:

```typescript
// In researchAgents.ts or similar
const thinkingEnabled = getThinkMode('orchestrator');
const budget = getThinkingBudget('orchestrator');

const response = await ollamaService.generateStream(
  prompt,
  systemPrompt,
  {
    model: getModelForStage('research'),
    think: thinkingEnabled,
    num_predict: budget.maxThinkingTokens,
  }
);
```

---

## UI Behavior

### Thinking Animation States

| State | Animation | Color |
|-------|-----------|-------|
| No thinking | Static gray dot | #3f3f46 (dark) / #d4d4d8 (light) |
| Thinking active | Pulsing white dot, morphing ring | white + rgba(255,255,255,0.3) |
| After thinking | Fade out over 1.8s | — |

### Modal

- **Opens** when user clicks the thinking animation dot
- **Shows** full accumulated thinking text in monospace
- **Scrolls** automatically to bottom as new thinking arrives
- **Displays** thinking token count and character count
- **Closes** on ESC or click outside

### Think Panel (collapsible)

- **Shows** live rolling windows of thinking + response tokens
- **Auto-expands** when thinking starts
- **Auto-collapses** 1.8s after thinking ends
- **Height** fixed at 160px when expanded
- **Scrollable** with fade-to-transparent effect at bottom

---

## Proxy Configuration

### Tailscale / Remote Ollama

The Qwen guide recommends these proxy settings for extended thinking:

**Nginx (if using proxy):**
```nginx
location /api/ {
    proxy_pass http://localhost:11434;
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
    proxy_read_timeout 3600s;      # 1 hour — allow long thinking
    proxy_send_timeout 3600s;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
}
```

**Caddy (if using proxy):**
```caddyfile
your-machine.tailnet-name.ts.net {
    reverse_proxy localhost:11434 {
        flush_interval -1  # disable buffering
    }
}
```

**Ollama CORS (remote machine):**
```bash
sudo systemctl edit ollama.service
# Add:
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_ORIGINS=*"

sudo systemctl daemon-reload && sudo systemctl restart ollama
```

**Direct Tailscale (no proxy):**
- Just use `http://100.x.y.z:11434` — Tailscale doesn't buffer

---

## Audit Trail Integration

### Recording Thinking Tokens

In research agents / orchestrator calls:

```typescript
import { tokenTracker } from '../utils/tokenStats';
import { createResearchAudit } from '../utils/researchAudit';

const auditCollector = createResearchAudit();

// After each generateStream call:
const thinkCount = tokenTracker.getThinkingTokenCount();
auditCollector.addThinkingTokens('qwen3.5:9b', thinkCount);

// Build final audit trail:
const auditTrail = auditCollector.buildAuditTrail();
// auditTrail.totalThinkingTokens — total across all calls
// auditTrail.thinkingTokensByModel — breakdown per model
```

### In Cycle Data

After research completes:

```typescript
cycle.researchFindings!.auditTrail = {
  ...auditTrail,
  totalThinkingTokens: 15000,
  thinkingTokensByModel: {
    'qwen3.5:9b': 12000,
    'qwen3.5:4b': 3000,
  },
};
```

---

## Monitoring & Debugging

### Console Logs

Enable thinking debugging in browser console:

```javascript
// See thinking tokens in real-time
tokenTracker.subscribe(() => {
  const info = tokenTracker.getSnapshot();
  if (info.isThinking) {
    console.log(`Thinking: ${info.thinkingTokenCount} tokens`);
  }
});
```

### Network Inspector

In browser DevTools → Network:
1. Filter for `/api/generate` requests
2. Click a request → Response tab
3. Look for `"thinking": "..."` fields in the streamed JSON

### Metrics

**Display thinking stats in UI:**
```typescript
const info = tokenTracker.getSnapshot();
console.log({
  isThinking: info.isThinking,
  thinkingTokens: info.thinkingTokenCount,
  responseTokens: info.responseTokens,
  fullThinkingLength: info.fullThinkingText.length,
});
```

---

## Performance Considerations

### Token Budget Trade-offs

| Budget | Latency | Quality | Use Case |
|--------|---------|---------|----------|
| 0 (disabled) | Fast | Lower | Extraction, compression |
| 1000 | Fast | Good | Synthesis |
| 5000 | Medium | Better | Analysis, reflection |
| 8000+ | Slow | Best | Complex reasoning, orchestrator |

### Streaming Performance

- **Thinking tokens** are typically slower than response tokens (1-3 tokens/sec vs. 5-10 tokens/sec)
- **Buffering** disabled on proxy = smooth streaming but more network packets
- **UI updates** throttled at 80ms intervals to avoid excessive re-renders

### Browser Memory

- **fullThinkingText** grows unbounded — consider a cap for very long thinking sessions
- Currently persisted to IndexedDB per cycle/stage
- Practical limit: 50-100K characters before UI slowdown

---

## Testing

### Unit Test Example

```typescript
import { tokenTracker } from '../utils/tokenStats';

test('thinking tokens accumulate correctly', () => {
  tokenTracker.resetSession();
  tokenTracker.startCall('qwen3.5:9b');

  tokenTracker.tickThinking('Let me think about this...');
  tokenTracker.tickThinking('This is a complex problem.');

  const info = tokenTracker.getSnapshot();
  expect(info.thinkingTokenCount).toBe(2);
  expect(info.fullThinkingText).toContain('Let me think');
});
```

### Manual Testing

1. **Start a research cycle** with a model that supports thinking (e.g. qwen3.5:9b)
2. **Watch the white pulsing dot** in the stage panel
3. **Click the dot** to open the ThinkingModal
4. **See thinking text** stream in real-time in monospace
5. **Monitor token count** — should increase as thinking progresses
6. **Close modal** when complete — thinking text is preserved in audit trail

---

## Known Limitations

1. **Small Models** (0.8b, 2b): Thinking tokens work but quality is lower
2. **Thinking Text Size**: Very long thinking (>100K chars) may cause UI slowdown
3. **Proxy Buffering**: Must disable buffering on reverse proxies or streaming breaks
4. **Cold Start**: First call to 27B model may take 60s+ before any thinking appears
5. **Token Budget**: Sending too many thinking tokens can cause timeouts on slow machines

---

## Future Enhancements

- [ ] Thinking token capping (auto-stop at budget)
- [ ] Thinking quality metrics (semantic clustering of reasoning)
- [ ] Comparison UI (show different models' thinking side-by-side)
- [ ] Thinking compression (summarize long thinking chains)
- [ ] PDF export with thinking tokens preserved
- [ ] Thinking token usage analytics dashboard

---

## Files Modified

1. **src/utils/tokenStats.ts** — Enhanced token tracking
2. **src/components/StagePanel.tsx** — Added thinking animation + modal integration
3. **src/components/ThinkingModal.tsx** — NEW component
4. **src/types/index.ts** — Added thinking fields to StageData + ResearchAuditTrail
5. **src/utils/researchAudit.ts** — Added thinking token recording
6. **src/utils/modelConfig.ts** — Added thinking budget configuration

---

## References

- [Ollama Thinking Tokens Blog](https://ollama.com/blog/thinking)
- [Qwen 3.5 Documentation](https://github.com/QwenLM/Qwen3.5)
- [Tailscale Proxy Configuration](https://tailscale.com/docs/)
