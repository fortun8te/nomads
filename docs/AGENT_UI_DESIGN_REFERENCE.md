# Agent UI — Design Reference & Component Guide

## Visual Design System

### Color Palette

```
PRIMARY BACKGROUND
  #0a0a0e (Dark gray, almost black)

TEXT COLORS
  Primary (Active):     rgba(255,255,255,0.85) - Main step titles
  Secondary (Normal):   rgba(255,255,255,0.5)  - Descriptions, labels
  Tertiary (Inactive):  rgba(255,255,255,0.3)  - Pending items
  Dim (Fine Print):     rgba(255,255,255,0.2)  - Borders, icons
  Subtle:               rgba(255,255,255,0.06) - Minimal elements

ACCENT COLORS
  Blue:     #2B79FF   - Primary action, active indicators
  Green:    #22c55e   - Success, completed checkmarks
  White:    #FFFFFF   - Thinking animation, emphasis

COMPONENT BACKGROUNDS
  Raised:   rgba(255,255,255,0.04) - Card backgrounds
  Border:   rgba(255,255,255,0.06) - Dividers, edges
  Hover:    rgba(255,255,255,0.02) - Interactive states
  Deep:     rgba(10,10,14,0.97)    - Glass effect
```

### Typography Scale

```
NAME          SIZE    WEIGHT    USAGE
─────────────────────────────────────────
Display       17px    bold      Main headers
Title         15px    semibold  Section headers
Heading       14px    semibold  Step titles
Subtitle      13px    regular   Task descriptions
Body          12px    regular   Sub-items, content
Caption       11px    regular   Meta info, hints
Small         10px    regular   Timestamps, sizes
Tiny          9px     regular   Secondary labels

FONT FAMILIES
  Headings:   Default system font (sans-serif)
  Body:       Default system font (sans-serif)
  Monospace:  monospace for thinking output
```

### Spacing System

```
UNIT    SIZE      USED FOR
─────────────────────────────────────────
xs      2px       Micro spacing
sm      4px       Step gaps, tight spacing
md      8px       Component padding, gaps
lg      12px      Section margins
xl      16px      Header/footer padding
2xl     24px      Large spacing
3xl     32px      Layout sections
```

### Border Radius

```
Buttons/Cards:  4-8px (rounded-lg)
Icons:          3-4px (rounded)
Full:           50% (circles)
```

## Component Specifications

### AgentStep Component

```
┌─────────────────────────────────────────┐
│ [●] Title                          [▼]  │  ← Clickable header
│     Description (optional, dim)         │
├─────────────────────────────────────────┤
│                                         │  ← Expandable content
│  🔍 Sub-item query                      │
│  ✓ Sub-item completed                   │
│  ○ Sub-item pending                     │
│                                         │
│  Live thinking text (if active)...      │
└─────────────────────────────────────────┘

DIMENSIONS
  Min Height:   48px (collapsed)
  Max Height:   Auto (expanded)
  Padding:      8px vert, 12px horiz
  Border:       1px solid rgba(255,255,255,0.06)

INTERACTIVE
  Hover:        Background: rgba(255,255,255,0.02)
  Expanded:     Chevron rotates 180°
  Transition:   150ms ease, all properties
```

### Status Icons

```
PENDING CIRCLE
  Size:     4px diameter
  Color:    rgba(255,255,255,0.3)
  Style:    Filled circle

ACTIVE DOT
  Size:     8px diameter
  Color:    White (rgba(255,255,255,0.9))
  Animation: Scale 0.8→1.2→0.8 (1.2s loop)
  Effect:   Pulsing glow

COMPLETED CHECKMARK
  Size:     14x14px container
  Color:    #22c55e (green)
  Icon:     SVG path (20 6 9 17 4 12)
  BG:       rgba(34,197,94,0.12)
  Border:   1px solid rgba(34,197,94,0.25)
```

### Sub-Item Icons

```
QUERY/SEARCH
  Icon:     Magnifying glass
  Size:     12x12px
  Stroke:   1.5px
  Color:    rgba(255,255,255,0.4)

COMPLETED
  Icon:     Checkmark
  Size:     14x14px
  Stroke:   2.5px
  Color:    #22c55e (green)

PENDING
  Icon:     Circle
  Size:     2x2px
  Color:    rgba(255,255,255,0.3)
```

### Thinking Indicator (Bottom)

```
┌─────────────────────────────────────────┐
│ [●] Thinking...                    [▼]  │  ← Expandable button
├─────────────────────────────────────────┤
│                                         │  ← Content area
│ Searching for market data...            │  (max 200px height)
│ Found 12 trending topics                │  (monospace font)
│ Processing competitor analysis...       │  (35% opacity)
│                                         │
└─────────────────────────────────────────┘

THINKING DOT
  Size:     8px
  Color:    White
  Animation: Same as active indicator above
```

### Header Section

```
┌─────────────────────────────────────────┐
│ [m] manus | Lite                        │
│ Create high-performing ads for a        │
│ vitamin supplement brand targeting      │
│ health-conscious millennials             │
└─────────────────────────────────────────┘

MANUS ICON
  Size:     24x24px
  Style:    Rounded square (4px radius)
  BG:       Linear gradient(135deg, #2B79FF, #4d9aff)
  Content:  "m" text, white, 12px, bold

BRANDING TEXT
  Font:     semibold, 14px
  Color:    Primary white (85%)
  Format:   "manus | Lite"

DESCRIPTION
  Font:     regular, 14px
  Color:    Secondary white (50%)
  Max Width: Full container
  Line Height: 1.5
```

## Animation Specifications

### Chevron Rotation
```
State:      Collapsed → Expanded
Duration:   150ms
Easing:     ease-in-out
Rotation:   0° → 180°
Timing:     Simultaneous with height
```

### Height/Opacity Transition
```
State:      Collapsed → Expanded
Duration:   150ms
Easing:     ease-in-out
Height:     0 → auto
Opacity:    0 → 1
Properties: All properties except transform
```

### Thinking Dot Animation
```
Loop:       Infinite
Duration:   1200ms per cycle
Easing:     easeInOut

Keyframes:
  0%:   scale(0.8), opacity(0.6)
  50%:  scale(1.2), opacity(1.0)
  100%: scale(0.8), opacity(0.6)

Box Shadow:
  0%:   0 0 12px rgba(255,255,255,0.2)
  50%:  0 0 24px rgba(255,255,255,0.35)
  100%: 0 0 12px rgba(255,255,255,0.2)
```

### Live Output Typewriter
```
Mode:       Typewriter (character by character)
Speed:      90ms per character
Chunk Size: 3 characters at a time
Total Time: Dynamic based on content length
```

## Layout Grid

```
CONTAINER STRUCTURE
┌─ Wrapper (full height, dark bg)
│
├─ Header Section (border-bottom)
│  ├─ Branding row (icon + title)
│  └─ Description text
│
├─ Steps Container (flex-1, scrollable)
│  ├─ Step 1
│  ├─ Step 2
│  ├─ Step 3
│  └─ Step 4
│
└─ Footer Section (border-top)
   ├─ Thinking Button (sticky)
   └─ Thinking Output (conditional)

DIMENSIONS
  Header Height:     ~80-100px (dynamic)
  Footer Min Height: 44px
  Step Min Height:   48px each
  Max Output Height: 200px
```

## Responsive Behavior

### Desktop (1024px+)
- Full-height layout
- All text visible
- Smooth scrolling
- Animated transitions

### Tablet (768px)
- Full-height layout
- Text truncation at word boundaries
- Touch-friendly tap targets (48px min)
- Smooth scrolling

### Mobile (375px)
- Full-height layout
- Condensed spacing (reduce by 25%)
- Larger tap targets
- Text wrapping at shorter length

## Dark Mode Considerations

All colors are designed for dark mode.
No light mode equivalent currently specified.

If light mode needed, map:
```
#0a0a0e      → #ffffff (backgrounds)
White 85%    → Black 85%
White 50%    → Black 50%
White 30%    → Black 30%
#2B79FF      → #1565C0 (slightly darker blue)
#22c55e      → #16a34a (slightly darker green)
```

## State Transitions

### Step States
```
PENDING
  Icon:     Light circle
  Text:     Dim (30% opacity)
  BG:       Transparent
  Expanded: No

ACTIVE
  Icon:     White animated dot
  Text:     Bright (85% opacity)
  BG:       Slight highlight on hover
  Expanded: Auto-expand on activation

COMPLETED
  Icon:     Green checkmark box
  Text:     Medium (50% opacity)
  BG:       Transparent
  Expanded: Auto-collapse on completion
```

### Button States
```
DEFAULT
  BG:       Transparent
  Border:   None
  Text:     Normal opacity

HOVER
  BG:       rgba(255,255,255,0.02)
  Border:   None
  Text:     Slightly brighter

ACTIVE/PRESSED
  BG:       rgba(255,255,255,0.04)
  Border:   None
  Text:     Bright
  Duration: Instant
```

## Accessibility

### Color Contrast
- All text meets WCAG AA standards (4.5:1 minimum)
- Status indicators include redundant icons (not just color)
- Thinking animation includes text label

### Keyboard Support
- Tab navigation between steps
- Enter to expand/collapse
- Proper focus states with visible outlines

### Screen Readers
- Semantic HTML (button, heading, list)
- ARIA labels on interactive elements
- Proper heading hierarchy (h2, h3, h4)

## Performance Metrics

### Render Performance
- First Paint:     < 100ms
- Largest Paint:   < 500ms
- Cumulative Layout Shift: < 0.1
- Time to Interactive: < 1s

### Animation Performance
- 60 FPS target
- GPU acceleration via transform
- No layout thrashing
- Efficient DOM mutations

## File Assets Needed

```
/public/icons/
  ├─ agent.png (for Manus icon reference)
  └─ (fallback emoji if needed)
```

## CSS Classes Used

From Tailwind CSS:
```
Layout:      flex, flex-1, h-full, w-full
Spacing:     px-*, py-*, gap-*, mt-*, ml-*
Typography:  text-*, font-*, leading-*
Colors:      text-white, opacity-*
Animations:  animate-pulse
Shadows:     shadow-*, drop-shadow-*
Borders:     border-*, rounded-*
Display:     hidden, block, inline-flex
```

## Component Dependencies

```
React:           18+
Framer Motion:   10+
TypeScript:      5+
Tailwind CSS:    4+
```

## Code Quality Standards

- **TypeScript**: Strict mode enabled
- **Linting**: ESLint (strict config)
- **Format**: Prettier (2-space indent)
- **Props**: Fully typed interfaces
- **Comments**: JSDoc style for exports

## Example Integration

```tsx
<AgentUIWrapper
  taskDescription="Create ads for vitamin supplements"
  steps={[
    {
      id: 'research',
      title: 'Market Research',
      description: 'Analyzing trends and competitors',
      status: 'active',
      isThinking: true,
      liveThinkingText: 'Searching market data...',
      subItems: [
        { id: '1', type: 'query', label: 'Supplement market 2025' },
        { id: '2', type: 'pending', label: 'Competitor pricing' },
      ],
    },
  ]}
  isThinking={true}
  liveThinkingOutput="Found 12 trending topics..."
/>
```

## References

- Manus.ai interface patterns
- Anthropic Claude design language
- Material Design 3 (for spacing/typography)
- WebAIM (for accessibility)

---

**Document Version**: 1.0
**Last Updated**: 2026-03-19
**Status**: Ready for Implementation
