# NOMADS System Overview - Complete Technical Reference

This document describes exactly how NOMADS works, what each component does, and what's implemented vs pending.

---

## System Architecture at a Glance

```
USER INTERFACE (React Dashboard)
        |
        v
CAMPAIGN CONTEXT (React Context State Management)
        |
        v
CYCLE LOOP (Main Orchestrator)
        |
        ├─ RESEARCH STAGE → Ollama API
        ├─ TASTE STAGE → Ollama API
        ├─ MAKE STAGE → [PENDING] Figma MCP
        ├─ TEST STAGE → [PENDING] Vision LLM
        └─ MEMORIES STAGE → Data Archive
        |
        v
STORAGE LAYER (IndexedDB)
```

---

## The 5 Stages: What Each Does

### Stage 1: RESEARCH (30-60 seconds)

**What it does**: Competitive intelligence analysis

**Input**:
- Campaign brief (what you're advertising)
- Target market (who you're reaching)
- Competitor list (who you're competing against)

**Process**:
1. Calls Ollama with research prompt
2. LLM analyzes market competitively
3. Returns structured analysis

**Output**:
- Competitor analysis (what each competitor does)
- Market patterns (what works)
- Audience reality (what they actually want)
- Opportunities (where to attack)

**How it works**:
```typescript
// In useCycleLoop.ts
const researchPrompt = `Analyze market for ${campaign.name}...`;
const output = await ollama.generate(researchPrompt, systemPrompts.research);
updateStageOutput('research', output);
```

**System prompt**: From `src/utils/prompts.ts` - systemPrompts.research
```
You are a competitive intelligence analyst. Find what actually works in this market.

- Competitor creative analysis (what's winning)
  - For each competitor: dominant hook, visual approach, color palette, pacing, why it works
- Market patterns (what's actually winning)
  - Hook patterns, visual patterns, emotional angle, messaging pattern
- Audience reality (what they actually want)
  - Core pain, hidden desire, decision factor
- Your opportunity (where to attack)
  - For each competitor blind spot: what they're missing, how you exploit it
```

**Status**: ✅ WORKING

---

### Stage 2: TASTE (20-40 seconds)

**What it does**: Creative direction strategy

**Input**:
- Research output (what we learned about the market)
- Campaign brief

**Process**:
1. Takes Research output
2. Calls Ollama with taste prompt
3. LLM creates creative strategy based on research
4. Returns complete creative direction

**Output**:
- Visual identity (colors, aesthetic, photography style)
- Tone of voice (how to talk to audience)
- Key messages
- Production specs (pacing, formats, shot types)
- Competitive angle (why we're different)

**How it works**:
```typescript
// In useCycleLoop.ts
const tasteInput = `Based on this research:\n${researchOutput}\n\nDefine creative direction...`;
const output = await ollama.generate(tasteInput, systemPrompts.taste);
updateStageOutput('taste', output);
```

**System prompt**: From `src/utils/prompts.ts` - systemPrompts.taste
```
You are a creative strategist defining the winning visual direction.

- What competitors are doing RIGHT (and we match)
  - Winning formula they cracked, what we'll borrow, why
- What competitors are doing WRONG (and we exploit)
  - Their blind spots, what we show instead, why it wins
- OUR visual style
  - Color palette (exact colors + psychology)
  - Visual aesthetic (minimalist/bold/cinematic/playful)
  - Pacing & editing (fast/medium/slow)
- OUR tone of voice
  - Brand voice, how we talk, sample lines
- EXACT production specs
  - Aspect ratios, shot types, graphics style, music/sound
```

**Status**: ✅ WORKING

---

### Stage 3: MAKE (2-5 minutes) [PENDING]

**What it does**: Generate visual ad designs

**Input**:
- Creative direction (from Taste stage)
- Campaign brief

**Expected Process**:
1. Takes creative direction
2. Generates 4-8 design variations
3. Each variation tests different message angle
4. All in Figma format

**Expected Output**:
- 4-8 design variations
- Multiple formats (Instagram, Facebook, Email, Web)
- Design specs for each

**Current Status**: ⏳ BLOCKED - Waiting for:
- Figma MCP integration to generate designs programmatically
- OR alternative design API (SVG generation, etc)
- OR manual workflow where user creates frames in Figma

**Where it would integrate**: Figma MCP endpoint
- Would use: `https://mcp.figma.com/mcp` (remote)
- Or: Local Dev Mode MCP Server (if enabled)
- Tools needed: `generate_figma_design` (not available in current MCP)

**Why it's blocked**:
- Figma MCP is read-only (can read designs, generate code FROM designs)
- Does NOT have capability to CREATE designs programmatically
- `generate_figma_design` tool is only in Claude Code, not available here
- Alternative: Need to implement SVG/design generation API

---

### Stage 4: TEST (1-2 minutes) [PENDING]

**What it does**: Evaluate and rank designs

**Input**:
- Design variations (from Make stage)
- Creative brief

**Expected Process**:
1. Takes each design
2. Calls Vision LLM to analyze visually
3. Scores each on: clarity, impact, alignment, differentiation
4. Predicts performance (CTR, conversion rate)
5. Ranks variations

**Expected Output**:
- Performance scores for each design
- Predicted CTR and conversion rate
- Ranked designs (best to worst)
- Improvement suggestions

**Current Status**: ⏳ BLOCKED - Waiting for:
- Vision LLM integration (Claude 4V, GPT-4V, or similar)
- Model API access with authentication
- Image processing capability

**Where it would integrate**: Vision LLM API
- Would use: Claude API with vision capabilities
- Requires: API key for Anthropic Claude API
- Or: Alternative Vision model provider

**System prompt** (when implemented): From `src/utils/prompts.ts` - systemPrompts.test
```
You are an effectiveness analyst. Evaluate creative quality systematically.

- Alignment with research (Does it address pain points? Match audience values?)
- Visual impact (Hierarchy & clarity, stopping power)
- Message clarity (Is benefit obvious? CTA strength)
- Competitive advantage (Stands out? Unique angle?)
- Overall verdict (Score, strengths, weaknesses, next iteration)
```

**Why it's blocked**:
- No Vision LLM connected to the system
- Would need API credentials (Claude, OpenAI, Google, etc)
- Would need to handle image input (convert design to image, send to API)

---

### Stage 5: MEMORIES (10-20 seconds)

**What it does**: Archive learnings for future campaigns

**Input**:
- All outputs from previous 4 stages
- Cycle metadata

**Process**:
1. Takes all cycle outputs
2. Calls Ollama to extract learnings
3. Structures insights for reuse
4. Saves to storage

**Output**:
- What worked well
- What didn't work
- Key insights discovered
- Next cycle improvements
- Patterns to remember

**How it works**:
```typescript
// In useCycleLoop.ts
const memoriesInput = `Archive these learnings...`;
const output = await ollama.generate(memoriesInput, systemPrompts.memories);
saveCycleToStorage(cycle); // Saves with all outputs
```

**System prompt**: From `src/utils/prompts.ts` - systemPrompts.memories
```
You are a learning archivist. Extract patterns from the cycle.

- What worked well (Key success factors, audience resonance)
- What didn't work (Missed opportunities, audience disconnect)
- Key insights discovered (About audience, market, our brand)
- Next cycle improvements (Research, creative, testing focus)
- Patterns to remember (Overall learnings, application)
```

**Status**: ✅ WORKING (stores outputs, could expand learnings extraction)

---

## Core Components: What Each Does

### 1. React Components (UI Layer)

**Location**: `src/components/`

#### Dashboard.tsx
- Main container component
- Renders all sub-components
- Passes props down

#### CampaignSelector.tsx
- Campaign dropdown and list
- Campaign creation form
- Preset templates
- Manages campaign selection

#### ControlPanel.tsx
- START button
- PAUSE button
- Status display
- Controls cycle execution

#### CycleTimeline.tsx
- Visual timeline of 5 stages
- Shows current stage
- Shows stage status (IDLE, RUNNING, COMPLETED)
- Displays timing for each stage

#### StagePanel.tsx
- Shows current stage output
- Displays real-time text from Ollama
- Updates as stage completes
- Shows error messages if stage fails

#### CycleHistory.tsx
- Lists completed cycles
- Shows timestamps
- Allows viewing past outputs

---

### 2. State Management (React Context)

**Location**: `src/context/CampaignContext.tsx`

**What it does**:
- Centralized state for all campaigns
- Tracks active campaign
- Tracks current cycle
- Manages stage states
- Provides update methods

**Key state structure**:
```typescript
interface Campaign {
  id: string;
  name: string;
  brief: string;
  targetMarket: string;
  competitors: string[];
  currentCycle: Cycle | null;
  completedCycles: Cycle[];
}

interface Cycle {
  id: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  currentStage: StageType; // 'research' | 'taste' | 'make' | 'test' | 'memories'
  stages: {
    research: Stage;
    taste: Stage;
    make: Stage;
    test: Stage;
    memories: Stage;
  };
}

interface Stage {
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR';
  output: string;
  error?: string;
}
```

**Key methods**:
```typescript
createCampaign(data) → Creates new campaign
startCycle(campaignId) → Starts cycle on campaign
updateStageOutput(stageName, output) → Updates stage output
updateCycle(cycle) → Updates entire cycle
pauseCycle() → Pauses execution
resumeCycle() → Resumes execution
```

---

### 3. Cycle Loop (Orchestrator)

**Location**: `src/hooks/useCycleLoop.ts`

**What it does**:
- Main orchestrator for the entire process
- Detects when cycle starts
- Executes stages in sequence
- Calls Ollama for each stage
- Updates UI
- Saves to storage
- Handles pause/resume

**How it works**:
```typescript
// Listen for cycle changes
useEffect(() => {
  if (cycle?.status === 'RUNNING') {
    executeCycle();
  }
}, [cycle?.status]);

// Execute each stage
async function executeCycle() {
  for (let stage of ['research', 'taste', 'make', 'test', 'memories']) {
    // 1. Update UI: stage is RUNNING
    updateStage(stage, 'RUNNING', '');

    // 2. Get prompt and system prompt
    const prompt = getPromptForStage(stage, campaign, previousOutputs);
    const systemPrompt = getSystemPrompt(stage);

    // 3. Call Ollama
    const output = await ollama.generate(prompt, systemPrompt, {
      onChunk: (chunk) => {
        // Real-time UI update
        updateStage(stage, 'RUNNING', previousOutput + chunk);
      }
    });

    // 4. Mark complete
    updateStage(stage, 'COMPLETED', output);

    // 5. Move to next stage
  }

  // 6. Mark cycle complete
  updateCycle({...cycle, status: 'COMPLETED'});
}
```

**Critical fix** (Feb 26):
- Simplified `refreshCycleReference()` to trigger React re-renders
- Was: Creating deeply nested stage objects (broken)
- Now: Just `{ ...cycle, stages: { ...cycle.stages } }` (works)

---

### 4. Ollama Integration

**Location**: `src/hooks/useOllama.ts`

**What it does**:
- Connects to local Ollama server
- Sends prompts to LLM
- Handles streaming responses
- Manages errors gracefully

**How it works**:
```typescript
export function useOllama() {
  async function generate(prompt, systemPrompt, options = {}) {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: 'mistral',
        prompt: prompt,
        system: systemPrompt,
        stream: true,
        // ... other options
      })
    });

    // Handle streaming
    let fullOutput = '';
    for await (const chunk of streamReader(response.body)) {
      const data = JSON.parse(chunk);
      fullOutput += data.response;

      // Call onChunk callback for real-time UI updates
      if (options.onChunk) {
        options.onChunk(data.response);
      }
    }

    return fullOutput;
  }

  return { generate };
}
```

**What it connects to**:
- Local Ollama server at `http://localhost:11434`
- Models: `mistral` or `neural-chat` (configurable)
- Streaming enabled for real-time output

**Status**: ✅ WORKING

---

### 5. Storage Layer

**Location**: `src/hooks/useStorage.ts`

**What it does**:
- Persists campaigns and cycles to IndexedDB
- Syncs with Context changes
- Loads data on app startup

**How it works**:
```typescript
// When Context updates
useEffect(() => {
  if (campaigns.length > 0) {
    saveCampaigns(campaigns); // → IndexedDB
  }
}, [campaigns]);

// On app load
useEffect(() => {
  loadCampaigns(); // ← IndexedDB
}, []);
```

**Storage schema**:
- Database: 'nomads-db'
- Store: 'campaigns'
- Store: 'cycles'
- Each campaign and cycle is a separate record

**Status**: ✅ WORKING

---

### 6. Prompts System

**Location**: `src/utils/prompts.ts`

**What it does**:
- Defines system prompts for each stage
- Structures output format
- Guides LLM behavior

**Prompts**:
1. **research** - Competitive intelligence
2. **taste** - Creative direction
3. **make** - Design generation (pending)
4. **test** - Design evaluation (pending)
5. **memories** - Learning extraction

**How they're used**:
```typescript
// In useCycleLoop.ts
const systemPrompt = getSystemPrompt(stageName);
const output = await ollama.generate(userPrompt, systemPrompt);
```

**Status**: ✅ WORKING (Research & Taste prompts refined)

---

## Data Flow: Step by Step

### When User Clicks START

```
1. USER CLICKS START BUTTON
   └─ ControlPanel.tsx onClick handler

2. CONTEXT CREATES CYCLE OBJECT
   └─ CampaignContext.startCycle(campaignId)
   └─ Sets cycle.status = 'RUNNING'
   └─ Sets currentStage = 'research'

3. USECYCLELOOP DETECTS CHANGE
   └─ useEffect([cycle.status])
   └─ Calls executeCycle()

4. EXECUTE RESEARCH STAGE
   a. Update UI: status = RUNNING
   b. Get prompt: getPromptForStage('research', campaign)
   c. Get system prompt: getSystemPrompt('research')
   d. Call Ollama: ollama.generate(prompt, systemPrompt)
   e. Stream response: onChunk updates UI in real-time
   f. Save output: updateStageOutput('research', output)
   g. Update storage: useStorage saves to IndexedDB

5. EXECUTE TASTE STAGE
   a-g. Same process, but:
   b. Prompt includes research output as input
   c. Takes ~20-40 seconds

6. EXECUTE MAKE STAGE [PENDING]
   - Would use Figma MCP
   - Would generate 4-8 designs
   - Would save design references

7. EXECUTE TEST STAGE [PENDING]
   - Would use Vision LLM
   - Would score each design
   - Would predict performance

8. EXECUTE MEMORIES STAGE
   a-g. Same process
   b. Input is all previous outputs
   c. Creates learning summary

9. CYCLE COMPLETE
   └─ cycle.status = 'COMPLETED'
   └─ Data persisted to IndexedDB
   └─ User sees all outputs
```

---

## Integration Points: Where External Systems Connect

### Current Integrations

#### 1. Ollama (Implemented)
- **What**: Local LLM inference
- **Connection**: HTTP to `http://localhost:11434`
- **Used in**: Research, Taste, Make (when done), Memories stages
- **Status**: ✅ WORKING
- **File**: `src/hooks/useOllama.ts`

#### 2. IndexedDB (Implemented)
- **What**: Local browser database
- **Connection**: Built-in browser API
- **Used in**: Storage of all campaigns and cycles
- **Status**: ✅ WORKING
- **File**: `src/hooks/useStorage.ts`

---

### Pending Integrations

#### 1. Figma MCP (For Make Stage)
- **What**: Design generation
- **Connection**: Would use Figma MCP API
- **Endpoint**: `https://mcp.figma.com/mcp` (remote) or Dev Mode local
- **Tools needed**: `generate_figma_design` (not available in current MCP)
- **Status**: ⏳ BLOCKED
- **Issue**: Current Figma MCP is read-only (can't create designs)
- **Alternative approaches**:
  - Use Claude Code's Code to Canvas feature
  - Implement SVG/HTML design generation API
  - Manual workflow (user creates frames in Figma)

#### 2. Vision LLM (For Test Stage)
- **What**: Visual design evaluation
- **Options**:
  - Claude API (Claude 4V)
  - OpenAI API (GPT-4V)
  - Google API (Gemini Vision)
- **Status**: ⏳ BLOCKED
- **Issue**: No Vision model connected
- **What's needed**:
  - API key from chosen provider
  - Image input handling (convert design to image)
  - Integration code in `src/hooks/useVision.ts`

#### 3. WebFetch (Not Currently Used)
- **Current status**: NOT USED
- **Could be used for**:
  - Fetching competitor websites for analysis
  - Getting market data from APIs
  - Pulling reference images
- **If implemented**: Would add in Research stage
- **Current approach**: All data from user input, no external fetching

---

## What's Done vs What's Pending

### DONE (Fully Implemented & Working)

✅ **Research Stage**
- Competitive intelligence analysis
- Market opportunity finding
- Prompts optimized for competitor analysis
- Outputs structured and useful

✅ **Taste Stage**
- Creative direction strategy
- Visual identity definition
- Tone/messaging framework
- Production specs
- Prompts optimized for strategy creation

✅ **Dashboard UI**
- Campaign management
- Cycle controls (START, PAUSE)
- Output display
- Timeline visualization
- History viewing

✅ **State Management**
- React Context for all state
- Proper state updates triggering re-renders
- Campaign and cycle management
- Stage tracking

✅ **Storage & Persistence**
- IndexedDB integration
- Data survives reload
- Campaigns auto-save
- Cycles auto-save

✅ **Ollama Integration**
- Local LLM connection
- Streaming output
- Real-time UI updates
- Error handling

✅ **Memories Stage**
- Learning extraction
- Cycle archiving
- Pattern identification
- Future reference storage

---

### PENDING (Not Yet Implemented)

⏳ **Make Stage** (50% designed, 0% implemented)
- Design generation
- Figma integration needed
- Multiple variations required
- Design specs

⏳ **Test Stage** (50% designed, 0% implemented)
- Design evaluation
- Vision LLM needed
- Performance prediction
- Design ranking

⏳ **Vision LLM Integration**
- Not connected to any API
- Would require:
  - API key setup
  - Image processing
  - New hook: `useVision.ts`
  - Integration in useCycleLoop.ts

⏳ **Figma MCP Design Creation**
- Current MCP is read-only
- Would need:
  - Alternative design API
  - OR Claude Code integration
  - OR manual workflow support

⏳ **WebFetch Integration**
- Not implemented
- Could fetch:
  - Competitor websites
  - Market data
  - Reference images
  - External sources

⏳ **Advanced Features**
- Multi-campaign batch processing
- A/B testing automation
- Real analytics integration
- Campaign sharing
- Team collaboration
- Cloud deployment

---

## What Needs to Be Done: Priority Order

### Priority 1 (Critical Path)

1. **Implement Make Stage with Figma Integration**
   - Design generation system
   - Figma frame creation
   - Multiple variations
   - Design specs output

2. **Integrate Vision LLM (Test Stage)**
   - Vision model API connection
   - Image evaluation
   - Performance prediction
   - Design ranking

### Priority 2 (High Value)

3. **Expand Memories Stage**
   - More granular learning extraction
   - Template generation
   - Pattern libraries
   - Reusable frameworks

4. **Error Handling & Resilience**
   - Better error messages
   - Recovery mechanisms
   - Timeout handling
   - Retry logic

### Priority 3 (Nice to Have)

5. **Performance Optimization**
   - Faster inference (cloud Ollama?)
   - Caching strategy
   - Batch processing
   - Parallel execution

6. **Advanced Features**
   - WebFetch for market research
   - Real analytics integration
   - Multi-variant testing
   - Campaign sharing

---

## Testing the System

### How to Test

1. **Start Ollama**
   ```bash
   ollama serve
   ```

2. **Start app**
   ```bash
   npm run dev
   ```

3. **Create campaign**
   - Use preset or custom form

4. **Click START**
   - Watch Research run (~45 sec)
   - Watch Taste run (~30 sec)
   - See outputs displayed

5. **Check data**
   - Reload page → data persists
   - Open DevTools → IndexedDB tab
   - See campaigns and cycles stored

### Manual Testing Checklist

- [ ] Create campaign from preset
- [ ] Click START button
- [ ] Research stage completes with output
- [ ] Taste stage completes with output
- [ ] Pause cycle mid-execution
- [ ] Resume cycle
- [ ] Cycle completes
- [ ] Data persists after reload
- [ ] View completed cycle history
- [ ] Create second campaign
- [ ] Run second campaign
- [ ] Verify independent state

---

## System Limits & Constraints

### Performance

- **Cycle time**: 2-3 minutes (Research + Taste)
- **Full cycle time** (when complete): 5-10 minutes
- **Ollama model time**: Depends on hardware
- **Network**: Localhost only (no remote Ollama yet)

### Storage

- **IndexedDB limit**: 50MB+ per domain
- **Campaign size**: ~50KB per campaign
- **Max campaigns**: ~1000 per domain
- **Persistence**: Until user clears browser data

### Scaling

- **Current**: Single-user, single-machine
- **Limitation**: No cloud sync, no multi-device
- **Limitation**: No team collaboration
- **Limitation**: No API access

---

## Debug Guide

### If cycles won't execute

1. Check Ollama is running
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. Check model is available
   ```bash
   ollama list
   ```

3. Check browser console for errors (F12)

4. Check network tab for API calls

### If output isn't showing

1. Check StagePanel.tsx renders
2. Check updateStageOutput is called
3. Check Context updates are triggered
4. Check IndexedDB is saving

### If data disappears

1. Check IndexedDB in DevTools
2. Check usStorage.ts is working
3. Try clearing IndexedDB and restarting
4. Check browser privacy settings

---

## Code Quality Notes

### Recent Improvements

- Simplified `refreshCycleReference()` (Feb 26 fix)
- Upgraded Research prompt (competitor-focused)
- Upgraded Taste prompt (strategic)
- Proper streaming support
- Real-time output updates

### Architecture Patterns

- React Context for state (centralized)
- Custom hooks for logic (useCycleLoop, useOllama, useStorage)
- Separation of concerns (UI, state, logic, data)
- Functional components (modern React)
- TypeScript for type safety

### Known Code Issues

- Make stage prompt exists but can't execute (no Figma API)
- Test stage prompt exists but can't execute (no Vision LLM)
- Memories stage could extract more insights
- Error messages could be more helpful
- No loading spinner during execution

---

**Status**: Phase 4 - Research & Taste working, Make & Test blocked on external integrations
**Last Updated**: February 26, 2026
