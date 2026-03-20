# LiveMetricsPanel Integration Guide

The `LiveMetricsPanel` component displays real-time metrics during pipeline execution. Here's how to integrate it into your application.

## Basic Setup

### 1. Import the component and hook

```typescript
import { LiveMetricsPanel } from './LiveMetricsPanel';
import { useMetrics } from '../hooks/useMetrics';
import { useCampaign } from '../context/CampaignContext';
```

### 2. Use the metrics hook in your container component

```typescript
export function Dashboard() {
  const { currentCycle, isRunning } = useCampaign();
  const metricsInput = useMetrics(currentCycle, isRunning);

  return (
    <div className="flex gap-4">
      {/* Main content */}
      <div className="flex-1">
        {/* ... */}
      </div>

      {/* Live metrics panel (fixed position bottom-right) */}
      <LiveMetricsPanel {...metricsInput} />
    </div>
  );
}
```

## Advanced Usage

### Override or augment metrics

If you have custom sources of metrics data:

```typescript
const metricsInput = useMetrics(currentCycle, isRunning, {
  tokensUsed: customTokenCount,
  activeResearchers: myResearcherList,
  pagesScanned: myPageCount,
});
```

### Provide action callbacks

```typescript
<LiveMetricsPanel
  {...metricsInput}
  onAbort={() => {
    currentCycle?.abort?.();
    // ... custom abort logic
  }}
  onPause={() => {
    currentCycle?.pause?.();
    // ... custom pause logic
  }}
  onShowThinking={() => {
    setShowThinkingModal(true);
  }}
/>
```

### Mobile compact mode

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

## Data Flow from Orchestrator

For the panel to show real-time updates, ensure your `Cycle` object includes:

```typescript
interface CycleWithMetrics extends Cycle {
  orchestrationData?: {
    iteration: number;
    maxIterations: number;
    coveragePercent: number;
    coverageDimensions: string[];
    coverageDimensionCounts: Record<string, number>;
    lastDecision?: string;
    reflectionFeedback?: string;
  };

  watchdogState?: {
    tokensUsed: number;
    tokenBudget: number;
    iterationsRemaining: number;
    stagnationRounds: number;
    queryRepeatCount: Record<string, number>;
    shouldKill: boolean;
    killReason?: string;
  };

  stageMetrics?: {
    currentStage: string;
    elapsedMs: number;
    currentModel: string;
    thinkingTokens: number;
  };

  researchFindings?: {
    pagesScanned: number;
    urlsProcessed: number;
    keyFactsExtracted: number;
    visualFindings?: {
      competitorVisuals: any[];
    };
  };
}
```

## Updating Metrics During Research

In your research orchestrator or stage execution:

```typescript
// When orchestration iterates
cycle.orchestrationData = {
  iteration: currentIter,
  maxIterations: limits.maxIterations,
  coveragePercent: (coveredDims / totalDims) * 100,
  coverageDimensions: allDimensions,
  coverageDimensionCounts: dimCounts,
  lastDecision: orchestratorOutput,
};

// When watchdog evaluates
cycle.watchdogState = {
  tokensUsed,
  tokenBudget: budget.maxTokens,
  iterationsRemaining: Math.max(0, budget.maxIterations - iteration),
  stagnationRounds: watchdog.getStatus().coverageHistory.length - newImprovements,
  queryRepeatCount: watchdog.queryCounts,
  shouldKill: !!killReason,
  killReason,
};

// When a stage executes
cycle.stageMetrics = {
  currentStage: stageName,
  elapsedMs: Date.now() - stageStartTime,
  currentModel: modelName,
  thinkingTokens: extractedThinkingTokens,
};

// After web research completes
cycle.researchFindings = {
  pagesScanned: results.length,
  urlsProcessed: results.filter(r => r.url).length,
  keyFactsExtracted: extractedFacts.length,
  visualFindings: visualResults,
  // ... other findings
};

// Save to persist
await saveCycle(cycle);
```

## Styling & Theming

The panel uses Tailwind classes and integrates with the Nomad dark theme:

- **Colors**: Cyan accents (`cyan-400`), blue backgrounds, gradient progress bars
- **Glass effect**: `backdrop-blur-md` with semi-transparent backgrounds
- **Responsive**: Fixed position bottom-right on desktop, compact badge on mobile (<768px)
- **Animation**: Framer Motion for smooth transitions and number counters

### Dark mode compatibility

The panel automatically adapts to the theme context. No additional dark mode setup needed.

## Sections Overview

### Watchdog Status
- Token budget progress bar
- Query repeat count (loop detection)
- Stagnation tracking
- Kill signal status
- Expandable for detailed query breakdown

### Orchestration
- Coverage % with progress bar
- Dimension coverage grid (8 key dimensions)
- Current model badge
- Expandable for full decision history

### Time & Tokens
- Stage duration (formatted: 5h 23m)
- Estimated time remaining (based on token burn rate)
- Token consumption rate (tokens/sec)
- Thinking tokens (if enabled)

### Research Insights
- Pages scanned by Wayfarer
- Unique URLs processed
- Facts/objections extracted
- Visual Plus screenshot count

### Active Researchers
- Live researcher status grid
- Query snippets (truncated)
- Individual progress bars
- Status indicators (pending, running, complete, error)

### Model Status
- Primary model with status
- Fallback model availability
- Vision model status
- Thinking mode status

### Errors & Actions
- Last error message (if any)
- Abort button (red)
- Pause button (yellow)
- Show Thinking button (purple)

## Testing

### Mock data for development

```typescript
const mockMetrics = buildMetrics(null, true, {
  iteration: 8,
  maxIterations: 30,
  coveragePercent: 68,
  coverageDimensions: ['market', 'competitors', 'objections', 'pricing'],
  tokensUsed: 127000,
  tokenBudget: 500000,
  currentStage: 'research',
  currentModel: 'qwen3.5:4b',
  pagesScanned: 127,
  urlsProcessed: 34,
  keyFactsExtracted: 68,
  activeResearchers: [
    { query: 'competitor pricing strategy', progress: 45, status: 'running' },
    { query: 'customer objections Reddit', progress: 78, status: 'running' },
  ],
});

<LiveMetricsPanel {...mockMetrics} />
```

## Performance Considerations

- **Re-renders**: Panel uses `useMemo` to prevent unnecessary re-renders
- **Animations**: Smooth number transitions (400ms duration, cubic easing)
- **Scrolling**: Internal scroll within fixed max-height, doesn't block main layout
- **Mobile**: Auto-compact mode at <600px for reduced visual footprint
- **Memory**: Collapsible sections don't mount hidden content (via AnimatePresence)

## Common Issues

### Metrics not updating
- Ensure `Cycle` object has `orchestrationData`, `watchdogState`, and `stageMetrics` fields
- Hook depends on `cycle` and `isRunning` — check that these change
- Try passing explicit overrides to `useMetrics()` to debug

### Progress bars stuck
- Progress animations require numbers in 0-100 range
- Ensure researcher `progress` and coverage `%` values are valid
- Check that Framer Motion animations are enabled in your theme

### Compact mode not triggering
- Set `compact={true}` manually if auto-detection isn't working
- Default threshold is 600px viewport width
- On mobile, consider hiding other panels to reduce clutter

## Future Enhancements

- [ ] Export metrics to JSON for analysis
- [ ] Real-time WebSocket updates (instead of polling Cycle)
- [ ] Metrics history graph (token usage over time)
- [ ] Researcher queue visualization
- [ ] Cost estimation (tokens → API cost)
- [ ] Performance profiling (model speed, researcher efficiency)
