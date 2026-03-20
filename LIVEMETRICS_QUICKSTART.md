# LiveMetricsPanel — 5-Minute Quick Start

## What You Get

A real-time metrics panel showing:
- Watchdog budget status (tokens, iterations, loops)
- Orchestration coverage % & dimensions
- Token burn rate & time estimates
- Research progress (pages, URLs, facts)
- Active researchers with individual progress
- Model status & thinking tokens
- Abort/pause/show-thinking buttons

## Installation (2 minutes)

### Prerequisites
```bash
npm install framer-motion  # If not already installed
```

### Copy Files
```bash
# Component + hook + types + utilities + examples + docs
src/components/LiveMetricsPanel.tsx
src/hooks/useMetrics.ts
src/types/metricsTypes.ts
src/utils/metricsEmitter.ts
src/components/LiveMetricsPanelExample.tsx  # (optional, for reference)
```

## Setup (3 minutes)

### Step 1: Import in Dashboard

```typescript
import { LiveMetricsPanel } from './components/LiveMetricsPanel';
import { useMetrics } from './hooks/useMetrics';
import { useCampaign } from './context/CampaignContext';
```

### Step 2: Use the Hook

```typescript
export function Dashboard() {
  const { currentCycle, isRunning } = useCampaign();
  const metricsInput = useMetrics(currentCycle, isRunning);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      {/* Your dashboard content */}
      <div className="flex-1 overflow-auto">
        {/* ... */}
      </div>

      {/* Add the panel */}
      {isRunning && <LiveMetricsPanel {...metricsInput} />}
    </div>
  );
}
```

### Step 3: Run It

```bash
npm run dev
```

**Done!** Panel appears when `isRunning === true` (fixed bottom-right)

---

## Keep It Simple (Get Data Flowing)

Your Cycle just needs these fields populated during research:

```typescript
// Minimal required fields
cycle.orchestrationData = {
  iteration: 8,
  maxIterations: 30,
  coveragePercent: 68,
  coverageDimensions: ['market', 'competitors', 'objections'],
  coverageDimensionCounts: { market: 12, competitors: 8, objections: 5 },
};

cycle.watchdogState = {
  tokensUsed: 127000,
  tokenBudget: 500000,
  iterationsRemaining: 22,
  stagnationRounds: 0,
  queryRepeatCount: {},
  shouldKill: false,
};

cycle.stageMetrics = {
  currentStage: 'research',
  elapsedMs: 854000,
  currentModel: 'qwen3.5:4b',
  thinkingTokens: 0,
};

cycle.researchFindings = {
  pagesScanned: 127,
  urlsProcessed: 34,
  keyFactsExtracted: 68,
};
```

Then save:
```typescript
await saveCycle(cycle);
```

Panel updates automatically! 🎉

---

## Common Use Cases

### Show/Hide Panel
```typescript
{isRunning && <LiveMetricsPanel {...metricsInput} />}
```

### Add Abort Button
```typescript
<LiveMetricsPanel
  {...metricsInput}
  onAbort={() => {
    stop();  // from useCampaign()
  }}
/>
```

### Mobile Responsive
```typescript
const [windowWidth, setWindowWidth] = useState(window.innerWidth);

useEffect(() => {
  const h = () => setWindowWidth(window.innerWidth);
  window.addEventListener('resize', h);
  return () => window.removeEventListener('resize', h);
}, []);

<LiveMetricsPanel
  {...metricsInput}
  compact={windowWidth < 768}
/>
```

### Test with Mock Data
```typescript
import { buildMetrics } from './hooks/useMetrics';

const mockMetrics = buildMetrics(null, true, {
  iteration: 8,
  maxIterations: 30,
  coveragePercent: 68,
  tokensUsed: 127000,
  tokenBudget: 500000,
  pagesScanned: 127,
  urlsProcessed: 34,
});

<LiveMetricsPanel {...mockMetrics} />
```

---

## Sections at a Glance

| Section | Shows |
|---------|-------|
| **Watchdog** | Token %, loops, stagnation, kill signal |
| **Orchestration** | Iteration progress, coverage %, dimension grid, model |
| **Time & Tokens** | Stage duration, burn rate, time remaining |
| **Research** | Pages, URLs, facts, screenshots |
| **Researchers** | Query, progress, status (pending/running/complete/error) |
| **Model Status** | Primary + fallback models, vision status |
| **Actions** | Abort, Pause, Show Thinking buttons |

---

## Styling

Already styled dark theme (cyan accents, gradient bars). No additional CSS needed.

To customize colors, edit the Tailwind classes in `LiveMetricsPanel.tsx`:
- `text-cyan-300` → change accent color
- `bg-slate-900/95` → change background
- `from-purple-400 to-pink-400` → change progress bar gradient

---

## Troubleshooting

**Panel not showing?**
- Check `isRunning === true`
- Check Cycle has `orchestrationData` field
- Open DevTools console for errors

**Metrics stuck?**
- Verify you're calling `saveCycle()` after updating fields
- Check `useMetrics(currentCycle, ...)` — does `currentCycle` change?
- Try `useMetricsFromCycle()` instead of `useMetrics()`

**Numbers wrong?**
- Token values are absolute (not thousands)
- Coverage % should be 0-100
- Iteration should be ≤ maxIterations

**Colors look weird?**
- Ensure Tailwind is loaded
- Check dark mode isn't inverted
- Verify `text-white` works in your theme

---

## What's in the Box

```
src/components/
  ├─ LiveMetricsPanel.tsx          (526 lines) — Main component
  ├─ LiveMetricsPanelExample.tsx    (318 lines) — 5 integration examples
  └─ LiveMetricsPanelIntegration.md — Detailed integration guide

src/hooks/
  └─ useMetrics.ts                 (274 lines) — Data aggregation hook

src/types/
  └─ metricsTypes.ts               (235 lines) — Type definitions

src/utils/
  └─ metricsEmitter.ts             (232 lines) — Real-time event bus

Documentation/
  ├─ LIVEMETRICS_README.md         — Complete overview
  ├─ LIVEMETRICS_QUICKSTART.md     — This file
  └─ LIVEMETRICS_DELIVERABLES.md   — Technical summary
```

---

## Next Steps

1. ✅ **Done**: Panel is rendering
2. 🔄 **Next**: Wire up your orchestrator to update Cycle fields
3. 🎯 **Then**: Add action handlers (onAbort, onPause, etc.)
4. 🚀 **Finally**: Test with real research data

---

## Pro Tips

- **Real-time updates**: Use `metricsEmitter` instead of polling Cycle:
  ```typescript
  import { emitOrchestrationUpdate } from './utils/metricsEmitter';
  emitOrchestrationUpdate(cycle.id, { iteration: 8, ... });
  ```

- **Expand sections**: Sections expand/collapse via header toggle
- **Hover for details**: Hover over researcher queries to see full text
- **Copy-paste examples**: `LiveMetricsPanelExample.tsx` has 5 ready-to-use patterns
- **Mobile-friendly**: Automatically compact on mobile (<768px)

---

## Questions?

- **Integration guide**: See `LiveMetricsPanelIntegration.md`
- **Examples**: See `LiveMetricsPanelExample.tsx`
- **Types**: See `src/types/metricsTypes.ts`
- **Full overview**: See `LIVEMETRICS_README.md`

---

## TL;DR

```typescript
// 1. Import
import { LiveMetricsPanel } from './components/LiveMetricsPanel';
import { useMetrics } from './hooks/useMetrics';

// 2. Hook
const { currentCycle, isRunning } = useCampaign();
const metricsInput = useMetrics(currentCycle, isRunning);

// 3. Render
{isRunning && <LiveMetricsPanel {...metricsInput} />}

// 4. Update (in orchestrator)
cycle.orchestrationData = { iteration, maxIterations, coverage, ... };
await saveCycle(cycle);

// Done! ✨
```

---

**Ready to go?** Start with the examples in `LiveMetricsPanelExample.tsx`, copy one that matches your layout, and customize from there.
