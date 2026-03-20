# LiveMetricsPanel — Documentation Index

## Quick Navigation

| Need | Document |
|------|----------|
| **Get started in 5 min** | [LIVEMETRICS_QUICKSTART.md](./LIVEMETRICS_QUICKSTART.md) |
| **Full component overview** | [LIVEMETRICS_README.md](./LIVEMETRICS_README.md) |
| **Integration patterns** | [src/components/LiveMetricsPanelIntegration.md](./src/components/LiveMetricsPanelIntegration.md) |
| **5 code examples** | [src/components/LiveMetricsPanelExample.tsx](./src/components/LiveMetricsPanelExample.tsx) |
| **Technical specs** | [LIVEMETRICS_DELIVERABLES.md](./LIVEMETRICS_DELIVERABLES.md) |

---

## Files Overview

### Core Component
- **`src/components/LiveMetricsPanel.tsx`** (526 lines)
  - Main React component
  - 7 collapsible sections
  - Smooth animations with Framer Motion
  - Responsive mobile compact mode
  - Dark theme with cyan accents

### Data Layer
- **`src/hooks/useMetrics.ts`** (274 lines)
  - Aggregates metrics from Cycle
  - Provides defaults for missing data
  - Memoized re-render prevention
  - Mock data support for testing

### Types & Utilities
- **`src/types/metricsTypes.ts`** (235 lines)
  - Type definitions for all metrics
  - Helper functions for updating Cycle
  - CycleWithMetrics extended type
  - Metrics event bus interface

- **`src/utils/metricsEmitter.ts`** (232 lines)
  - Real-time event bus (alternative to polling)
  - Emit helpers for each metric type
  - React hook for subscription
  - Perfect for streaming updates

### Examples & Documentation
- **`src/components/LiveMetricsPanelExample.tsx`** (318 lines)
  - 5 complete integration patterns
  - Basic, responsive, custom actions, mock data, detailed layouts
  - Copy-paste ready
  - Production-quality code

- **`src/components/LiveMetricsPanelIntegration.md`** (250 lines)
  - Step-by-step integration guide
  - Data flow documentation
  - Advanced usage patterns
  - Troubleshooting section

---

## Documentation Files

### `LIVEMETRICS_QUICKSTART.md` (This is where to start!)
- 5-minute setup guide
- Minimal required fields
- Common use cases
- Copy-paste snippets

### `LIVEMETRICS_README.md` (Full reference)
- Complete feature overview
- Section descriptions
- Data structure docs
- Performance considerations
- Styling guide
- Testing approach

### `LIVEMETRICS_DELIVERABLES.md` (Technical summary)
- Complete deliverables checklist
- File descriptions
- Feature matrix
- Integration checklist
- Performance metrics
- Browser compatibility

### `LIVEMETRICS_INDEX.md` (This file)
- Navigation guide
- File organization
- Quick reference

---

## Component Sections

The panel includes 7 collapsible sections:

1. **Watchdog Status** — Budget enforcement, loop detection, stagnation tracking
2. **Orchestration** — Iteration progress, coverage %, dimension grid, model
3. **Time & Tokens** — Stage duration, token burn rate, time estimates
4. **Research Insights** — Pages scanned, URLs processed, facts, screenshots
5. **Active Researchers** — Live researcher status with individual progress bars
6. **Model Status** — Primary + fallback models, vision model status
7. **Actions** — Abort/Pause/Show Thinking buttons

Each section is expandable and includes live animations and color-coded indicators.

---

## Integration Patterns

### Pattern 1: Basic (Simplest)
```typescript
const metricsInput = useMetrics(currentCycle, isRunning);
{isRunning && <LiveMetricsPanel {...metricsInput} />}
```

### Pattern 2: Responsive
```typescript
<LiveMetricsPanel {...metricsInput} compact={windowWidth < 768} />
```

### Pattern 3: With Actions
```typescript
<LiveMetricsPanel
  {...metricsInput}
  onAbort={handleAbort}
  onPause={handlePause}
  onShowThinking={showThinking}
/>
```

### Pattern 4: Real-time Events
```typescript
import { emitOrchestrationUpdate } from './utils/metricsEmitter';
// In orchestrator: emitOrchestrationUpdate(cycleId, { iteration, ... })
```

### Pattern 5: Mock Testing
```typescript
const mockMetrics = buildMetrics(null, true, { iteration: 8, ... });
<LiveMetricsPanel {...mockMetrics} />
```

See `LiveMetricsPanelExample.tsx` for full implementations.

---

## Data Flow

```
Orchestrator/Research Loop
        ↓
Updates Cycle fields:
  - orchestrationData (iteration, coverage, dimensions)
  - watchdogState (tokens, budget, stagnation)
  - stageMetrics (elapsed, model, thinking tokens)
  - researchFindings (pages, URLs, facts)
  - activeResearchers (researcher status)
        ↓
saveCycle(cycle)
        ↓
CampaignContext updated
        ↓
useMetrics(currentCycle) extracts & normalizes
        ↓
LiveMetricsPanel renders with smooth animations
```

Or for real-time updates:
```
Orchestrator
        ↓
emitOrchestrationUpdate(cycleId, metrics)
        ↓
metricsEmitter.emit() → broadcasts to all listeners
        ↓
Component re-renders instantly (no save needed)
```

---

## Getting Started

### 1. Read This First
- [LIVEMETRICS_QUICKSTART.md](./LIVEMETRICS_QUICKSTART.md) — 5 minute overview

### 2. Then Read
- [LIVEMETRICS_README.md](./LIVEMETRICS_README.md) — Complete reference

### 3. Look at Code Examples
- [src/components/LiveMetricsPanelExample.tsx](./src/components/LiveMetricsPanelExample.tsx) — 5 patterns

### 4. Deep Dive (if needed)
- [src/components/LiveMetricsPanelIntegration.md](./src/components/LiveMetricsPanelIntegration.md) — Integration guide
- [LIVEMETRICS_DELIVERABLES.md](./LIVEMETRICS_DELIVERABLES.md) — Technical specs

---

## Key Features

✅ **Production Quality**
- Full TypeScript, zero errors
- Comprehensive documentation
- 5 integration examples
- Ready to drop in

✅ **Real-time Metrics**
- 7 metric sections
- Smooth animations
- Live progress bars
- Color-coded status indicators

✅ **Responsive Design**
- Desktop: Fixed bottom-right panel (520px × 85vh)
- Mobile: Compact badge (<600px)
- Accessible: No color-only indicators

✅ **Extensible**
- Real-time event bus (metricsEmitter)
- Type-safe helpers
- Support for custom metrics
- Mock data for testing

✅ **Easy Integration**
- Drop-in component
- Single hook call
- No configuration needed
- Works with existing code

---

## Checklist for Implementation

- [ ] Copy files to `src/`
- [ ] Import `LiveMetricsPanel` and `useMetrics` in Dashboard
- [ ] Call `useMetrics(currentCycle, isRunning)` hook
- [ ] Render panel when `isRunning === true`
- [ ] Update Cycle metrics in orchestrator
- [ ] Test with mock data using `buildMetrics()`
- [ ] Add action handlers (onAbort, onPause)
- [ ] Test responsive behavior on mobile
- [ ] Deploy! 🚀

---

## Support & Debugging

**Problem** | **Solution**
-----------|------------
Panel not showing | Check `isRunning === true` and Cycle has `orchestrationData`
Metrics stuck | Verify `saveCycle()` is called, check `currentCycle` changes
Wrong numbers | Check values are absolute (not thousands), coverage 0-100
Colors weird | Check Tailwind is loaded, verify dark mode isn't inverted
TypeScript errors | All files are 100% typed, copy files exactly as-is

See troubleshooting sections in documentation for more details.

---

## File Sizes

| File | Lines | Size |
|------|-------|------|
| LiveMetricsPanel.tsx | 526 | ~20 KB |
| useMetrics.ts | 274 | ~9 KB |
| metricsTypes.ts | 235 | ~8 KB |
| metricsEmitter.ts | 232 | ~7 KB |
| LiveMetricsPanelExample.tsx | 318 | ~12 KB |
| **Total** | **1,585** | **~56 KB** |

Minified: ~8-10 KB (with Tailwind + Framer Motion tree-shaking)

---

## Technology Stack

- **React 18+** — Component framework
- **TypeScript** — Type safety
- **Framer Motion** — Animations & transitions
- **Tailwind CSS v4** — Styling
- **No external dependencies** (beyond Framer Motion for animations)

---

## What's Next?

1. **Basic Integration** — Get the panel showing
2. **Data Wiring** — Update Cycle metrics during research
3. **Action Handlers** — Wire up onAbort, onPause callbacks
4. **Real-time Events** — Switch to emitter for snappy updates
5. **Customization** — Adjust colors, spacing, sections

See the integration guide for detailed steps on each.

---

## References

- **Watchdog Logic**: See `src/utils/watchdog.ts` (budget enforcement, loop detection)
- **Orchestrator**: See `src/utils/researchAgents.ts` (orchestration state)
- **Campaign Context**: See `src/context/CampaignContext.tsx` (cycle management)
- **Types**: See `src/types/index.ts` (Cycle, Campaign, etc.)

---

## Questions?

1. Check the **Quick Start** for basic setup
2. Check the **README** for feature overview
3. Check the **Integration Guide** for data wiring
4. Check the **Examples** for code patterns
5. Check the **Troubleshooting** section if things aren't working

---

**Happy monitoring! 📊**

Created with production quality, comprehensive documentation, and zero TypeScript errors. Ready to integrate into your Nomads Ad Agent pipeline.
