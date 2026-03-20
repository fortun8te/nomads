# LiveMetricsPanel — Real-Time Pipeline Metrics

A production-quality React component that displays real-time metrics during the ad agent pipeline execution. Shows watchdog status, orchestration state, token usage, research progress, and active researchers in a glass-morphic dark theme panel.

## Files Created

### Components & Hooks
- **`src/components/LiveMetricsPanel.tsx`** — Main metrics panel component
- **`src/hooks/useMetrics.ts`** — Hook to aggregate metrics from Cycle
- **`src/components/LiveMetricsPanelExample.tsx`** — 5 integration examples
- **`src/components/LiveMetricsPanelIntegration.md`** — Integration guide
- **`src/types/metricsTypes.ts`** — Type definitions and helpers

## Quick Start

### 1. Add metrics hook to your Dashboard component

```typescript
import { LiveMetricsPanel } from './components/LiveMetricsPanel';
import { useMetrics } from './hooks/useMetrics';
import { useCampaign } from './context/CampaignContext';

export function Dashboard() {
  const { currentCycle, isRunning } = useCampaign();
  const metricsInput = useMetrics(currentCycle, isRunning);

  return (
    <div>
      {/* Your content */}
      {isRunning && <LiveMetricsPanel {...metricsInput} />}
    </div>
  );
}
```

### 2. Ensure your Cycle object includes metric fields

When recording research progress, update these fields on the Cycle:

```typescript
import type { CycleWithMetrics } from './types/metricsTypes';
import { setOrchestrationMetrics, setWatchdogMetrics } from './types/metricsTypes';

// During orchestration iteration
setOrchestrationMetrics(cycle, {
  iteration: 8,
  maxIterations: 30,
  coveragePercent: 68,
  coverageDimensions: ['market', 'competitors', ...],
  coverageDimensionCounts: { market: 12, competitors: 8, ... },
});

// After watchdog evaluation
setWatchdogMetrics(cycle, {
  tokensUsed: 127000,
  tokenBudget: 500000,
  iterationsRemaining: 22,
  stagnationRounds: 0,
  queryRepeatCount: {},
  shouldKill: false,
});

await saveCycle(cycle);
```

## Component Sections

### 1. Watchdog Status
Real-time budget monitoring:
- **Budget Bar**: Token consumption with color-coded indicator (green ≤60%, yellow 60-80%, red >80%)
- **Query Repeats**: Loop detection counter
- **Stagnation**: Coverage improvement tracking
- **Kill Signal**: Alerts when watchdog is about to terminate

### 2. Orchestration
Coverage progress and orchestrator decisions:
- **Coverage Bar**: Visual progress (0-100%)
- **Dimensions Grid**: 8 key dimensions with green/gray indicators
- **Model Badge**: Current model with status
- **Expandable**: Full decision history and reflection feedback

### 3. Time & Tokens
Stage performance metrics:
- **Stage Duration**: Formatted elapsed time (5h 23m)
- **Est. Remaining**: Based on token burn rate
- **Token Rate**: Tokens/second
- **Thinking Tokens**: If extended thinking is enabled

### 4. Research Insights
Data gathering summary:
- **Pages Scanned**: Total pages processed by Wayfarer
- **URLs Processed**: Unique competitor URLs
- **Facts Extracted**: Objections, pricing points, etc.
- **Visual Screenshots**: From Wayfarer Plus analysis

### 5. Active Researchers
Live researcher status grid:
- **Query Snippet**: First 40 chars of search query
- **Progress Bar**: Individual progress (0-100%)
- **Status Indicator**: Color-coded (pending, running, complete, error)
- **Hover Details**: Full query on hover

### 6. Model Status
Current model and fallbacks:
- **Primary Model**: Active model (e.g., qwen3.5:4b)
- **Vision Model**: Screenshot analysis status
- **Fallback**: Standby model for workload balancing

### 7. Actions
Control buttons:
- **Abort** (red): Stop the cycle immediately
- **Pause** (yellow): Pause execution (if supported)
- **Show Thinking** (purple): Expand thinking tokens modal

## Data Structure

### Input Props

```typescript
interface LiveMetricsInput {
  // Cycle context
  cycle: Cycle | null;
  isRunning: boolean;
  currentStage: string;

  // Orchestrator state
  iteration: number;
  maxIterations: number;
  coveragePercent: number;
  coverageDimensions: string[];
  coverageDimensionCounts: Record<string, number>;

  // Watchdog state
  watchdogStatus: {
    tokensUsed: number;
    tokenBudget: number;
    iterationsRemaining: number;
    stagnationRounds: number;
    queryRepeatCount: Record<string, number>;
    shouldKill: boolean;
    killReason?: string;
  };

  // Execution metrics
  elapsedMs: number;
  currentModel: string;
  thinkingTokens?: number;

  // Research progress
  activeResearchers: Array<{
    query: string;
    progress: number;
    status: 'pending' | 'running' | 'complete' | 'error';
  }>;
  pagesScanned: number;
  urlsProcessed: number;
  keyFactsExtracted: number;
  visualScreenshots?: number;

  // Actions & callbacks
  onAbort?: () => void;
  onPause?: () => void;
  lastError?: string;
  thinkingContent?: string;
  onShowThinking?: () => void;

  // Responsive mode
  compact?: boolean;
}
```

## Styling & Theme

- **Colors**: Cyan accents (#00FFFF), blue backgrounds, gradient progress bars
- **Dark Theme**: Built on slate-900/950 base with glass effect (backdrop blur)
- **Responsive**: Fixed bottom-right on desktop, compact badge on mobile (<600px)
- **Animations**: Smooth number transitions (400ms cubic easing), progress bar animations, pulsing status dots
- **Accessibility**: All text is readable by screen readers, no color-only indicators

## Integration Examples

### Basic (copy-paste ready)

```typescript
import { LiveMetricsPanel } from './components/LiveMetricsPanel';
import { useMetrics } from './hooks/useMetrics';
import { useCampaign } from './context/CampaignContext';

function MyDashboard() {
  const { currentCycle, isRunning } = useCampaign();
  const metricsInput = useMetrics(currentCycle, isRunning);

  return (
    <div>
      {/* content */}
      {isRunning && <LiveMetricsPanel {...metricsInput} />}
    </div>
  );
}
```

### With Custom Actions

```typescript
<LiveMetricsPanel
  {...metricsInput}
  onAbort={() => {
    if (window.confirm('Abort cycle?')) {
      stop();
    }
  }}
  onPause={() => pauseCycle()}
  onShowThinking={() => setShowThinkingModal(true)}
/>
```

### With Responsive Compact Mode

```typescript
const [windowWidth, setWindowWidth] = useState(window.innerWidth);

useEffect(() => {
  const handleResize = () => setWindowWidth(window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);

<LiveMetricsPanel
  {...metricsInput}
  compact={windowWidth < 768}
/>
```

## Updating Metrics During Execution

### In your Orchestrator

```typescript
import { setOrchestrationMetrics } from './types/metricsTypes';

// Each iteration
setOrchestrationMetrics(cycle, {
  iteration: currentIteration,
  maxIterations: limits.maxIterations,
  coveragePercent: computeCoveragePercent(dimensions),
  coverageDimensions: allDimensions,
  coverageDimensionCounts: countCoveredDimensions(),
  lastDecision: orchestratorOutput,
});

// Save to persist
await saveCycle(cycle);
```

### In your Watchdog

```typescript
import { setWatchdogMetrics } from './types/metricsTypes';

setWatchdogMetrics(cycle, {
  tokensUsed: totalTokens,
  tokenBudget: BUDGET.maxTokens,
  iterationsRemaining: Math.max(0, maxIter - iteration),
  stagnationRounds,
  queryRepeatCount: watchdog.queryCounts,
  shouldKill: !!killReason,
  killReason,
});
```

### In your Researchers

```typescript
import { recordActiveResearcher } from './types/metricsTypes';

recordActiveResearcher(cycle, {
  query: 'competitor pricing strategy',
  progress: 45,
  status: 'running',
  tokensUsed: 2400,
  pagesProcessed: 12,
});
```

## Performance Considerations

- **Re-renders**: Memoized calculations prevent unnecessary updates
- **Animations**: Smooth transitions use Framer Motion (hardware-accelerated)
- **Scrolling**: Internal scroll container doesn't block main layout
- **Mobile**: Compact mode reduces visual footprint (<280px width)
- **Memory**: Collapsed sections don't render hidden content
- **Updates**: Batched via single `cycle` prop update; no polling

## Testing

### With Mock Data

```typescript
import { buildMetrics } from './hooks/useMetrics';

const mockMetrics = buildMetrics(null, true, {
  iteration: 8,
  maxIterations: 30,
  coveragePercent: 68,
  tokensUsed: 127000,
  tokenBudget: 500000,
  currentModel: 'qwen3.5:4b',
  pagesScanned: 127,
  urlsProcessed: 34,
  keyFactsExtracted: 68,
  activeResearchers: [
    { query: 'competitor pricing', progress: 45, status: 'running' },
    { query: 'customer objections', progress: 78, status: 'running' },
  ],
});

<LiveMetricsPanel {...mockMetrics} />
```

## Troubleshooting

**Metrics not updating?**
- Ensure `Cycle` has `orchestrationData`, `watchdogState`, and `stageMetrics` fields
- Verify `currentCycle` changes when Cycle is saved
- Check that `isRunning` is `true`

**Progress bars stuck?**
- Values must be 0-100 for percentages
- Researcher `progress` should increment smoothly
- Check Framer Motion is installed

**Compact mode not triggering?**
- Set `compact={true}` manually if needed
- Check viewport width is actually <600px
- On mobile, test with browser DevTools

**Colors look wrong?**
- Verify Tailwind is configured (should inherit from project)
- Check dark mode isn't inverted in your theme
- Ensure `backdrop-blur-md` is in Tailwind config

## Future Enhancements

- [ ] Export metrics to CSV/JSON
- [ ] Real-time WebSocket streaming (vs polling)
- [ ] Metrics history graph (token usage over time)
- [ ] Cost calculation (tokens → API cost)
- [ ] Researcher queue visualization
- [ ] Performance profiling (model speed, researcher efficiency)
- [ ] Custom metric thresholds/alerts
- [ ] Integration with monitoring dashboards (Datadog, etc.)

## Files Reference

### Component
- **LiveMetricsPanel.tsx** (500 lines)
  - 7 collapsible sections (Watchdog, Orchestration, Time, Research, Researchers, Model, Errors)
  - Smooth animations and transitions
  - Responsive mobile compact mode
  - Accessibility-first design

### Hook
- **useMetrics.ts** (250 lines)
  - Extracts metrics from Cycle object
  - Provides defaults for missing data
  - Normalizes data for component input
  - Simulates researcher progress updates

### Types
- **metricsTypes.ts** (300 lines)
  - Type definitions for all metric structures
  - Helper functions to update Cycle fields
  - Metrics emitter interface (for future WebSocket streaming)
  - CycleWithMetrics extended type

### Examples
- **LiveMetricsPanelExample.tsx** (400 lines)
  - 5 complete integration patterns
  - Mock data for testing
  - Responsive behavior examples
  - Custom action handlers

### Documentation
- **LiveMetricsPanelIntegration.md** — Detailed integration guide
- **LIVEMETRICS_README.md** (this file) — Component overview

## License

Part of the Nomads Ad Agent project. Developed for internal use.

## Support

For issues or questions:
1. Check the integration guide (LiveMetricsPanelIntegration.md)
2. Review the examples (LiveMetricsPanelExample.tsx)
3. See troubleshooting section above
4. Check console for TypeScript errors or React warnings
