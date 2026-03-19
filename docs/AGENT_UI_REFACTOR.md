# Agent UI Refactor — Manus Lite Design Pattern

## Overview

The Agent UI has been refactored to match the **Manus Lite** design pattern, providing a clean, professional interface for displaying autonomous agent progress with:

- **Collapsible step cards** with smooth animations
- **Status indicators** (pending circle, active dot, completed checkmark)
- **Live thinking output** (expandable at bottom)
- **Clean typography hierarchy** with proper spacing
- **Dark theme** with refined color palette
- **White thinking animation** (not blue)

## Components

### 1. `AgentStep.tsx` — Individual Step Component

A reusable step card that displays a single task/subtask with:

```tsx
interface StepConfig {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'completed';
  subItems?: SubItem[];
  isThinking?: boolean;
  liveThinkingText?: string;
}

interface SubItem {
  id: string;
  type: 'query' | 'completed' | 'pending';
  label: string;
}
```

**Features:**
- Click to expand/collapse
- Shows title + optional description
- Sub-items with icons:
  - 🔍 for queries/searches
  - ✓ for completed items
  - ○ for pending items
- Live thinking text (when active)
- Smooth animations

**Usage:**

```tsx
<AgentStep
  step={{
    id: 'step-1',
    title: 'Analyze Campaign Brief',
    description: 'Reviewing product details and market context',
    status: 'completed',
    subItems: [
      { id: 'sub-1', type: 'completed', label: 'Parsed product features' },
      { id: 'sub-2', type: 'query', label: 'Searching market data' },
    ],
  }}
  onStatusChange={(stepId, expanded) => console.log(stepId, expanded)}
/>
```

### 2. `AgentUIWrapper.tsx` — Main Container Component

The top-level wrapper that manages the full UI layout:

```tsx
interface AgentUIWrapperProps {
  taskDescription: string;
  steps: StepConfig[];
  isThinking: boolean;
  liveThinkingOutput?: string;
  onStepToggle?: (stepId: string, expanded: boolean) => void;
}
```

**Structure:**
```
┌─────────────────────────────────────────┐
│ Header (Manus icon + description)       │
├─────────────────────────────────────────┤
│                                         │
│  Step 1 (Collapsible)                  │
│  Step 2 (Collapsible)                  │
│  Step 3 (Collapsible)                  │
│  Step 4 (Collapsible)                  │
│                                         │ (scrollable)
├─────────────────────────────────────────┤
│ Thinking... | [Expand ▼]                │
│ (Live output when expanded)             │
└─────────────────────────────────────────┘
```

**Usage:**

```tsx
<AgentUIWrapper
  taskDescription="Create high-performing ads for a vitamin supplement brand"
  steps={steps}
  isThinking={isThinking}
  liveThinkingOutput={liveThinkingText}
  onStepToggle={(stepId, expanded) => {
    // Handle step expansion
  }}
/>
```

### 3. `AgentUIDemo.tsx` — Example Implementation

A complete example showing:
- How to structure step configurations
- State management for thinking indicators
- Dynamic updates
- Simulated thinking behavior

## Design System

### Colors & Theme

```css
Background: #0a0a0e (dark gray)
Text Primary: rgba(255,255,255,0.85) (active steps)
Text Secondary: rgba(255,255,255,0.5) (normal)
Text Tertiary: rgba(255,255,255,0.3) (pending/inactive)
Accent: #2B79FF (blue)
Success: #22c55e (green)
Border: rgba(255,255,255,0.06)
```

### Animations

- **Thinking Dot**: Morphs with white color, scales 0.8→1.2→0.8
- **Expand/Collapse**: 150ms smooth height + opacity transition
- **Chevron**: Rotates 0→180° on toggle
- **Live Output**: Typewriter effect at 90ms speed

### Typography

```
Header Title: 14px, font-semibold
Step Title: 14px, font-semibold
Step Description: 12px, regular, 50% opacity
Sub-items: 12px, regular, 50% opacity
Thinking Output: 12px, monospace, 35% opacity
```

### Spacing

```
Header padding: 16px (1rem)
Step padding: 8px (0.5rem) vertical, 12px (0.75rem) horizontal
Sub-item gap: 8px
Steps container gap: 4px
Bottom section padding: 10px (0.625rem)
```

## Integration Guide

### Step 1: Replace AgentPanel Usage

If you're currently using the old `AgentPanel`, replace it with:

```tsx
import { AgentUIWrapper } from './components/AgentUIWrapper';

// In your component:
<AgentUIWrapper
  taskDescription="Your task description here"
  steps={stepsData}
  isThinking={thinking}
  liveThinkingOutput={thinkingText}
/>
```

### Step 2: Structure Your Step Data

Before rendering, format your data:

```tsx
const steps: StepConfig[] = [
  {
    id: 'analysis',
    title: 'Market Analysis',
    description: 'Gathering insights',
    status: 'completed',
    subItems: [
      { id: 'sub-1', type: 'completed', label: 'Trend analysis' },
      { id: 'sub-2', type: 'completed', label: 'Competitor review' },
    ],
  },
  {
    id: 'research',
    title: 'Web Research',
    description: 'Searching for data',
    status: 'active',
    isThinking: true,
    liveThinkingText: 'Currently searching...',
    subItems: [
      { id: 'sub-3', type: 'query', label: 'Search: market trends' },
      { id: 'sub-4', type: 'pending', label: 'Fetching pages' },
    ],
  },
];
```

### Step 3: Connect to Your Agent Logic

```tsx
// Listen to step changes
const handleStepToggle = (stepId: string, expanded: boolean) => {
  // Perform any UI logic when a step is toggled
};

// Update thinking state
const [isThinking, setIsThinking] = useState(false);
const [liveOutput, setLiveOutput] = useState('');

// When agent emits thinking:
agent.on('thinking', (text) => {
  setIsThinking(true);
  setLiveOutput(text);
});

// When agent completes:
agent.on('complete', () => {
  setIsThinking(false);
});
```

## Key Features

### 1. Collapsible Steps

- Click on any step to expand/collapse
- Auto-expands when step becomes active
- Sub-items only shown when expanded
- Smooth height transition (150ms)

### 2. Status Indicators

- **Pending**: Light gray circle
- **Active**: Animated white dot (morphing scale + opacity)
- **Completed**: Green checkmark in rounded box

### 3. Sub-Items

Each sub-item has an icon based on type:
- **query**: 🔍 (search icon)
- **completed**: ✓ (checkmark)
- **pending**: ○ (small circle)

### 4. Live Thinking

- Always visible at bottom with "Thinking..." or "Completed"
- Click to expand/collapse
- Shows real-time output in monospace font
- Maximum height 200px with scrolling
- Dim text (35% opacity)

### 5. Header

- Manus icon (blue gradient square with "m")
- "manus | Lite" branding
- Task description (brief context)

## Styling Notes

All components use:
- **Tailwind CSS** for utility classes
- **Inline styles** for dynamic colors and animations
- **Framer Motion** for smooth animations
- **CSS custom properties** for theming flexibility

### Adding Custom Styles

If you want to customize colors/spacing, edit:

1. **AgentStep.tsx**: Status icon colors, sub-item spacing
2. **AgentUIWrapper.tsx**: Header background, border colors
3. **Global CSS**: Add to `src/styles/` for theme-wide changes

Example theme customization:

```tsx
// In AgentUIWrapper header:
style={{
  background: 'var(--agent-header-bg, rgba(255,255,255,0.01))',
  borderColor: 'var(--agent-border, rgba(255,255,255,0.06))',
}}
```

## Migration from Old AgentPanel

### Before:
```tsx
<AgentPanel {...oldProps} />
// Complex prop interface with many internal states
```

### After:
```tsx
<AgentUIWrapper
  taskDescription={title}
  steps={formattedSteps}
  isThinking={thinking}
  liveThinkingOutput={output}
  onStepToggle={handleToggle}
/>
// Clean, declarative interface
```

## Testing

Use the `AgentUIDemo.tsx` component to:
1. Test step expansion/collapse
2. Verify thinking animation
3. Check live output display
4. Validate responsive behavior
5. Test dark mode appearance

## Performance

- **Lightweight**: No unnecessary re-renders
- **Smooth animations**: Uses Framer Motion's optimized rendering
- **Scrollable content**: Handles large step lists efficiently
- **Thinking output**: Virtualized for long text streams

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 15+
- All modern browsers with CSS Grid + Flexbox support

## Future Enhancements

Potential features to add:
1. **Copy thinking output** button
2. **Export step results** as JSON/markdown
3. **Step time tracking** (elapsed time per step)
4. **Token counting** display
5. **Dark/light theme toggle**
6. **Customizable step templates**
7. **Keyboard shortcuts** (e.g., Cmd+E to expand all)

## Troubleshooting

### Steps not expanding
- Check `status` property is one of: 'pending', 'active', 'completed'
- Ensure `subItems` array is defined

### Thinking animation not showing
- Set `isThinking={true}` on wrapper
- Provide `liveThinkingOutput` content
- Verify ThinkingDot component renders

### Colors not applying
- Check inline `style` prop overrides
- Verify parent background doesn't interfere
- Use browser DevTools to inspect computed styles

## Files Modified/Created

- ✅ `src/components/AgentStep.tsx` — NEW
- ✅ `src/components/AgentUIWrapper.tsx` — NEW
- ✅ `src/components/AgentUIDemo.tsx` — NEW
- ✅ `src/components/AgentPanel.tsx` — MODIFIED (ThinkingMorph changed to white)
- ✅ `AGENT_UI_REFACTOR.md` — THIS FILE

## Next Steps

1. Import `AgentUIWrapper` in your main agent component
2. Convert your step data to `StepConfig` format
3. Connect agent events to state updates
4. Test with the demo component
5. Customize colors/spacing as needed
6. Remove references to old AgentPanel
