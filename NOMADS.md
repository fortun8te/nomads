# NOMADS - AD CREATIVE AGENT

## Project Overview

**NOMADS** is an autonomous creative advertising agent that generates full ad campaigns through a multi-stage cycle. It researches markets, defines creative taste/direction, generates visual assets, tests concepts, and archives learnings.

**Location:** `/Users/mk/Downloads/ad-agent`

---

## Current Status

### Phase Completion
- ✅ **Phase 1**: Project setup (Vite, React, TypeScript, Tailwind, IndexedDB)
- ✅ **Phase 2**: Core state management (CampaignContext, Ollama hooks, storage, cycle loop)
- ✅ **Phase 3**: Dashboard UI components built
- ✅ **Phase 4**: Research & Taste stages functional with streaming output
- 🔄 **Phase 5**: Figma MCP integration (in progress)
- ⏳ **Phase 6**: Polish & refinement (pending)

### What's Working
- Dashboard displays campaigns and controls
- Cycle loop executes through all 5 stages
- Research & Taste stages generate output via Ollama
- Real-time streaming of stage outputs
- Data persists across browser reloads via IndexedDB
- Pause button works correctly during execution
- Campaign preset templates available

### Known Blockers
- **Figma MCP Dev Mode**: Requires paid Figma seat with Dev Mode enabled
- **Make Stage**: Needs Figma MCP integration to generate designs
- **Test Stage**: Needs Vision LLM for visual evaluation
- **Claude CLI**: Installed but `claude mcp` commands not fully operational

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS v4 |
| **Storage** | IndexedDB (via idb-keyval) |
| **AI Backend** | Local Ollama (http://localhost:11434) |
| **Architecture** | React Context + Hooks |
| **Design Tools** | Figma MCP Server (remote: https://mcp.figma.com/mcp) |

---

## Architecture

### Core Data Flow

```
Campaign Creation
    ↓
START CYCLE
    ↓
RESEARCH → analyze market & competitors
    ↓
TASTE → define creative direction
    ↓
MAKE → generate visual assets (Figma)
    ↓
TEST → evaluate concepts (Vision LLM)
    ↓
MEMORIES → archive learnings
    ↓
Store in IndexedDB
```

### Key Systems

#### 1. **CampaignContext** (`src/context/CampaignContext.tsx`)
- Centralized state management for all campaigns
- Tracks: active campaign, current cycle, stage progress
- Methods: `createCampaign()`, `startCycle()`, `updateStage()`
- Syncs with IndexedDB on changes

#### 2. **Cycle Loop** (`src/hooks/useCycleLoop.ts`)
- Orchestrates execution through 5 stages
- Handles state updates and progression
- **Critical fix**: Simplified `refreshCycleReference()` to `{ ...cycle, stages: { ...cycle.stages } }`
- Uses AbortController for pause functionality
- Auto-transitions between stages on completion

#### 3. **Ollama Integration** (`src/hooks/useOllama.ts`)
- Connects to local Ollama server
- Methods: `generate()`, `generateWithCallback()`
- Supports streaming via `onChunk` callback
- Graceful error handling with user feedback

#### 4. **Storage** (`src/hooks/useStorage.ts`)
- IndexedDB wrapper using idb-keyval
- Persistent storage of campaigns and cycles
- Automatic sync on context changes

#### 5. **Prompts** (`src/utils/prompts.ts`)
- **Research**: Analyzes market, audience, competitive landscape
  - Output: Market insights, competitor analysis, creative hooks
- **Taste**: Defines creative direction as competitive weapon
  - Output: Visual style, tone, pacing, unique selling points
- **Make**: (Pending Figma integration) Generate design assets
- **Test**: (Pending Vision LLM) Evaluate designs
- **Memories**: Archive learnings from cycle

---

## Folder Structure

```
ad-agent/
├── src/
│   ├── components/          # UI components
│   │   ├── CampaignSelector.tsx
│   │   ├── CycleTimeline.tsx
│   │   ├── ControlPanel.tsx
│   │   └── StagePanel.tsx
│   ├── context/
│   │   └── CampaignContext.tsx (✅ State management)
│   ├── hooks/
│   │   ├── useCycleLoop.ts (✅ CRITICAL - cycle orchestration)
│   │   ├── useOllama.ts (✅ LLM integration)
│   │   ├── useStorage.ts (✅ IndexedDB sync)
│   │   └── usePrompts.ts
│   ├── utils/
│   │   ├── prompts.ts (✅ Upgraded with competitor analysis)
│   │   ├── ollama.ts (✅ Streaming support)
│   │   └── storage.ts
│   ├── App.tsx
│   └── main.tsx
├── .claude/
│   └── launch.json (✅ Dev server config)
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## How to Run

### Prerequisites
- Node.js 18+
- Ollama running locally (`http://localhost:11434`)
  - Models needed: `mistral` or `neural-chat` (for Research/Taste)

### Setup
```bash
cd /Users/mk/Downloads/ad-agent
npm install
npm run dev
```

Server runs at `http://localhost:5173`

### Development
```bash
npm run dev        # Start dev server with HMR
npm run build      # Production build
npm run preview    # Preview production build
```

---

## Key Files & Important Details

### 1. `src/hooks/useCycleLoop.ts` ⭐ CRITICAL
**Status**: ✅ Working (recently fixed)
**Fix Applied**: Simplified state reference creation to trigger React re-renders properly
```typescript
// BEFORE (broken): Created unnecessary nested objects
function refreshCycleReference(cycle) {
  return {
    ...cycle,
    stages: {
      ...cycle.stages,
      research: { ...cycle.stages.research }, // ❌ Unnecessary nesting
      // ... for each stage
    }
  };
}

// AFTER (working): Just refresh cycle and stages objects
function refreshCycleReference(cycle) {
  return {
    ...cycle,
    stages: { ...cycle.stages } // ✅ Minimal, triggers re-render
  };
}
```

### 2. `src/hooks/useOllama.ts`
**Status**: ✅ Working with streaming
**Methods**:
- `generate(prompt, systemPrompt, options)` - Default streaming
- `generateWithCallback(prompt, systemPrompt, onChunk)` - Explicit callback

### 3. `src/utils/prompts.ts`
**Status**: ✅ Upgraded to competitor-focused
**Key prompts**:
- **RESEARCH_PROMPT**: Analyzes market dynamics, competitor strategies, creative hooks
- **TASTE_PROMPT**: Defines creative direction based on competitive analysis
- Both use hierarchical formatting with `§` section markers

### 4. `src/context/CampaignContext.tsx`
**Status**: ✅ Stable
**Key states**:
- `campaigns` - All created campaigns
- `activeCampaignId` - Current campaign
- `currentCycle` - Running cycle with all stages

---

## Ollama Setup

### Check Local Server
```bash
curl http://localhost:11434/api/tags
```

### Pull Models (if needed)
```bash
ollama pull mistral
ollama pull neural-chat
```

### Run Ollama
```bash
ollama serve
```

---

## Stage Details

### RESEARCH
- **Purpose**: Market analysis & competitive intelligence
- **Input**: Campaign brief, target market, competitors
- **Output**: Market insights, competitor tactics, creative hooks
- **Time**: ~30-60 seconds
- **Status**: ✅ Working

### TASTE
- **Purpose**: Define creative direction
- **Input**: Research output, campaign brief
- **Output**: Visual style guide, tone, pacing, USP
- **Time**: ~20-40 seconds
- **Status**: ✅ Working

### MAKE
- **Purpose**: Generate design assets
- **Input**: Taste output, campaign details
- **Output**: Figma frames/components
- **Time**: ~2-5 minutes
- **Status**: ⏳ Pending Figma MCP integration
- **Blocker**: Figma MCP `generate_figma_design` tool only available in Claude Code

### TEST
- **Purpose**: Evaluate design concepts
- **Input**: Make output (designs)
- **Output**: Performance predictions, feedback
- **Time**: ~1-2 minutes
- **Status**: ⏳ Pending Vision LLM integration

### MEMORIES
- **Purpose**: Archive learnings
- **Input**: All previous outputs
- **Output**: Learnings for future campaigns
- **Time**: ~10-20 seconds
- **Status**: ✅ Working (stores in IndexedDB)

---

## Environment Variables

Currently using hardcoded defaults:
- `OLLAMA_BASE_URL`: `http://localhost:11434`
- `MODEL`: `mistral` (can be changed to `neural-chat`)

### To Use Environment Variables
Create `.env.local`:
```
VITE_OLLAMA_URL=http://localhost:11434
VITE_MODEL=mistral
```

---

## Recent Fixes & Improvements

### ✅ Output Display Fix (Session 4)
- **Issue**: Cycles weren't showing output or weren't executing
- **Cause**: `refreshCycleReference()` had overly complex nested object creation
- **Fix**: Simplified to single shallow spread of stages object
- **Result**: Cycles now execute and display output properly

### ✅ Competitor-Focused Prompts (Session 4)
- **Change**: Upgraded Research & Taste prompts to analyze competitors
- **Impact**: More strategic, differentiated creative direction
- **Format**: Uses § section markers and → sub-steps

### ✅ Real-Time Streaming (Session 4)
- **Feature**: Added `onChunk` callbacks for character-by-character output
- **Status**: Implemented but UI shows full output on completion (acceptable)

---

## Figma MCP Integration

### Status
- ✅ Remote MCP endpoint is connected and responding
- ✅ Can read Figma designs and generate React code FROM them
- ❌ Cannot CREATE designs in Figma (limitation of available tools)

### What Works
```typescript
// Can read designs and generate code
get_design_context(nodeId="329:266")
// Returns React + Tailwind code

get_screenshot(nodeId="329:266")
// Returns visual reference
```

### What Doesn't Work
- `generate_figma_design` tool (only in Claude Code, not available here)
- Creating designs programmatically in Figma

### Next Steps for Figma
1. Either: Manually create dashboard frames in Figma, then have MCP read/generate code
2. Or: Use Claude Code's `generate_figma_design` to capture running app → Figma

---

## Data Structure: Campaign

```typescript
interface Campaign {
  id: string;
  name: string;
  brief: string;
  targetMarket: string;
  competitors: string[];
  currentCycle: Cycle | null;
  completedCycles: Cycle[];
  createdAt: string;
  updatedAt: string;
}

interface Cycle {
  id: string;
  campaignId: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  currentStage: StageType;
  stages: {
    research: Stage;
    taste: Stage;
    make: Stage;
    test: Stage;
    memories: Stage;
  };
  createdAt: string;
}

interface Stage {
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR';
  output: string;
  error?: string;
}
```

---

## Debugging Tips

### Cycle Not Executing
- Check: Is Ollama running? (`curl http://localhost:11434/api/tags`)
- Check: Is the model available? (`ollama pull mistral`)
- Check: Browser console for errors
- Check: CampaignContext state is updating

### Output Not Showing
- Check: `onChunk` callback is being called
- Check: Component re-renders when output updates
- Look at: `StagePanel.tsx` for display logic

### Storage Not Persisting
- Check: IndexedDB in DevTools → Storage
- Try: Clear IndexedDB and reload
- Check: `useStorage` hook is syncing properly

### Ollama Connection Issues
- Restart Ollama: `killall ollama && ollama serve`
- Check logs: `curl http://localhost:11434/api/tags`

---

## Known Issues & Limitations

1. **Dev Mode MCP Requirement**: Figma MCP Dev Mode needs paid Figma seat
2. **Claude CLI**: `claude mcp` commands not working from terminal (binary is just app launcher)
3. **Make Stage**: Can't generate designs until Figma integration complete
4. **Test Stage**: Needs Vision LLM (Claude 4V or similar)
5. **Streaming Display**: Full output shows on completion, not character-by-character

---

## Next Steps (Priority Order)

### Short Term (This Week)
1. ✅ Fix output display - DONE
2. ✅ Test Research/Taste with Ollama - DONE
3. ⏳ Get Figma MCP working properly (need Dev seat or alternative)
4. Implement Make stage (Figma design generation)

### Medium Term (Next Week)
1. Integrate Vision LLM for Test stage
2. Add campaign history visualization
3. Improve error handling & recovery
4. Add campaign sharing/export

### Long Term
1. Deploy to cloud (Vercel)
2. Use Anthropic API instead of local Ollama
3. Add multi-user support
4. Real design asset generation pipeline

---

## Testing Checklist

- [ ] Create campaign from preset
- [ ] Start cycle and watch through all stages
- [ ] Pause cycle mid-execution
- [ ] Resume cycle
- [ ] Check output displays correctly
- [ ] Reload page - data persists
- [ ] Create second campaign
- [ ] View history of completed cycles
- [ ] Test different models in Research/Taste

---

## Resources & References

- **Ollama**: https://ollama.ai
- **Figma MCP**: https://mcp.figma.com
- **React Context**: https://react.dev/reference/react/useContext
- **IndexedDB**: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- **Tailwind CSS**: https://tailwindcss.com

---

## Contact & Support

If you're reading this and need to continue work on NOMADS:
1. Read this file completely
2. Check the "How to Run" section
3. Review the "Status" section for current blockers
4. Look at "Recent Fixes" to understand what works
5. Check "Next Steps" for what to do next

**Key person to ask**: Claude (provide this folder)

---

**Last Updated**: February 26, 2026
**Status**: Phase 4 - Research/Taste stages functional, Figma integration in progress
