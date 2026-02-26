# NOMADS - Project Vision & Description

## What Is NOMADS?

**NOMADS** is an **autonomous creative advertising agent** that generates complete ad campaigns through an intelligent multi-stage cycle. It researches markets, defines creative strategy, generates visual designs, tests concepts, and learns from results—all without human intervention.

Think of it as a creative AI partner that can independently develop advertising campaigns from brief to finished designs.

---

## The Problem It Solves

**Creating ads is slow and expensive:**
- 💰 Hiring creatives costs thousands
- ⏱️ Campaigns take weeks to develop
- 🔄 Multiple iterations and feedback loops
- 🎯 Hard to test different approaches quickly
- 📊 Learnings get lost between projects

**NOMADS solves this by automating the entire creative process.**

---

## How It Works: The 5-Stage Cycle

```
┌─────────────────────────────────────────────────┐
│  CREATE CAMPAIGN (brief + target + competitors)  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ 📊 RESEARCH STAGE   │
         │ (30-60 seconds)     │
         └──────────┬──────────┘
                    │
        • Analyze target market
        • Study competitor strategies
        • Identify creative hooks & gaps
        • Output: Market insights
                    │
                    ▼
         ┌─────────────────────┐
         │ 🎨 TASTE STAGE      │
         │ (20-40 seconds)     │
         └──────────┬──────────┘
                    │
        • Define creative direction
        • Choose visual style & tone
        • Set pacing & messaging
        • Output: Creative brief
                    │
                    ▼
         ┌─────────────────────┐
         │ 🎬 MAKE STAGE       │
         │ (2-5 minutes)       │
         │ ⏳ [PENDING]        │
         └──────────┬──────────┘
                    │
        • Generate design concepts
        • Create Figma frames
        • Build visual assets
        • Output: Design files
                    │
                    ▼
         ┌─────────────────────┐
         │ ✅ TEST STAGE       │
         │ (1-2 minutes)       │
         │ ⏳ [PENDING]        │
         └──────────┬──────────┘
                    │
        • Evaluate designs visually
        • Predict performance
        • Get feedback insights
        • Output: Test results
                    │
                    ▼
         ┌─────────────────────┐
         │ 💾 MEMORIES STAGE   │
         │ (10-20 seconds)     │
         └──────────┬──────────┘
                    │
        • Archive all outputs
        • Extract learnings
        • Store for future reference
        • Output: Archived cycle
                    │
                    ▼
         ┌─────────────────────────┐
         │ CYCLE COMPLETE          │
         │ (Total: ~2-3 min now)   │
         │ (~10+ min when complete)│
         └─────────────────────────┘
```

---

## Stage Details

### 🔍 RESEARCH STAGE
**What it does**: Deep competitive analysis and market intelligence

**Input**:
- Campaign brief (what to advertise)
- Target market (who to reach)
- Competitor list (who you're competing against)

**Process**:
- Analyzes target audience demographics, behaviors, needs
- Studies competitor creative strategies in detail
- Identifies successful hooks and messaging approaches
- Finds creative gaps and opportunities
- Determines unique angles vs competitors

**Output**: Market analysis report with:
- Audience insights
- Competitor tactics breakdown
- Creative opportunities
- Unique selling angles

**Current Status**: ✅ **WORKING**

---

### 🎨 TASTE STAGE
**What it does**: Defines the creative direction as a competitive weapon

**Input**:
- Research output from stage above
- Campaign brief and details

**Process**:
- Analyzes what competitors do well vs poorly
- Defines unique visual identity
- Sets tone, voice, and messaging style
- Determines pacing and rhythm
- Creates a competitive differentiation strategy

**Output**: Creative direction with:
- Color palette with rationale
- Typography and mood
- Photography/illustration style
- Messaging tone and voice
- Emotional appeals
- Competitive differentiation

**Current Status**: ✅ **WORKING**

---

### 🎬 MAKE STAGE
**What it does**: Generates actual visual design assets

**Input**:
- Creative direction from Taste stage
- Campaign details and brief

**Process**:
- Generates design concepts
- Creates Figma frames/components
- Builds visual hierarchy
- Applies styling and layout
- Produces polished design assets

**Output**:
- Figma design files
- Visual asset components
- Design system integration

**Current Status**: ⏳ **PENDING** - Waiting for:
- Figma MCP integration for design generation
- Or alternative design API

---

### ✅ TEST STAGE
**What it does**: Evaluates and improves designs

**Input**:
- Visual designs from Make stage

**Process**:
- Analyzes design visually (Vision LLM)
- Predicts performance metrics
- Identifies strengths and weaknesses
- Suggests improvements
- Compares against competitive benchmarks

**Output**:
- Performance predictions
- Design feedback
- Improvement suggestions
- Test results report

**Current Status**: ⏳ **PENDING** - Waiting for:
- Vision LLM integration (Claude 4V or similar)

---

### 💾 MEMORIES STAGE
**What it does**: Archives and extracts learnings

**Input**:
- All outputs from previous 4 stages

**Process**:
- Consolidates results
- Extracts key learnings
- Stores for future campaigns
- Builds knowledge base
- Enables learning across projects

**Output**:
- Complete cycle archive
- Learning summary
- Reusable insights
- Future reference material

**Current Status**: ✅ **WORKING**

---

## User Interface & Features

### Dashboard
A clean, dark interface showing:

**Left Panel - Campaign Management**
- Campaign selector dropdown
- Preset campaign templates
  - Natural Skincare Brand
  - Tech SaaS Product
  - E-commerce Store
  - And more...
- Campaign creation form
- Cycle history

**Center Panel - Control**
- Big **START** button to begin cycle
- **PAUSE** button during execution
- Status indicator (IDLE, RUNNING, COMPLETED)
- Current cycle progress

**Right Panel - Output**
- Cycle timeline showing all 5 stages
- Current stage indicator
- Real-time output display
- Results from each completed stage

### Features
- ✅ Create campaigns from presets or custom brief
- ✅ Start/pause/resume cycles
- ✅ View real-time stage execution
- ✅ See output after each stage completes
- ✅ Browse completed cycles and history
- ✅ Data persists across browser reloads
- ✅ No login required (local-first design)

---

## How to Use It

### Basic Workflow

**Step 1: Create Campaign**
```
1. Go to dashboard
2. Click "Use This Preset" (or fill custom form)
3. Give campaign a name/brief
4. Specify target market
5. List competitors
```

**Step 2: Start Cycle**
```
1. Click the big START button
2. Watch Research stage run (~45 seconds)
3. See output displayed in real-time
4. Watch Taste stage run (~30 seconds)
5. See creative direction output
```

**Step 3: Review Results**
```
1. Read through all outputs
2. See what market insights were discovered
3. Review creative direction defined
4. (Make & Test stages: when implemented)
```

**Step 4: Learn & Iterate**
```
1. Use insights for next campaign
2. Create new campaign with learnings
3. Run cycle again
4. Refine approaches over time
```

---

## Technology Stack

| Layer | Tech |
|-------|------|
| **Frontend** | React 18 + TypeScript |
| **Styling** | Tailwind CSS v4 |
| **State Management** | React Context |
| **Storage** | IndexedDB (local, persistent) |
| **AI Model** | Local Ollama (mistral/neural-chat) |
| **Design** | Figma MCP (when integrated) |

### Why These Choices?

- **Local-first**: All data stays on your machine
- **Privacy**: No cloud uploads
- **Offline**: Works without internet
- **Fast**: Local inference, instant UI updates
- **Cost**: Free (except Ollama compute)
- **Flexible**: Easy to swap AI backends

---

## Key Capabilities

### ✅ Currently Working
- Research market and competitors
- Generate competitive intelligence
- Define creative direction
- Pause/resume execution mid-cycle
- Persistent storage
- Streaming output display
- Campaign presets
- Cycle history

### ⏳ Coming Soon (Blocked)
- Generate visual designs in Figma
- Evaluate designs with Vision LLM
- Multiple design iterations
- Performance predictions
- A/B testing suggestions

### 🔮 Future Vision
- Cloud deployment
- Multi-user collaboration
- Campaign sharing
- Real analytics integration
- Design asset library
- Template marketplace
- API for integrations

---

## Real-World Example

### Scenario: Skincare Brand Campaign

**Step 1: Create Campaign**
```
Name: "Natural Skincare Q1 Launch"
Target: Women 25-45, eco-conscious
Competitors: Drunk Elephant, The Ordinary, Neutrogena
```

**Step 2: Run Cycle**
- **Research** discovers:
  - Competitors focus on ingredients
  - Younger audience wants sustainability messaging
  - Unmet need: luxury + eco-friendly combo

- **Taste** creates:
  - Visual style: minimalist, botanical photography
  - Tone: aspirational but accessible
  - Hook: "Science meets nature"

**Step 3: Results**
```
Market insights → Creative direction → Design concepts → Test feedback → Learnings

This campaign performed well. Next campaign builds on these learnings...
```

---

## Problem Solving

### What makes NOMADS different?

**vs. Traditional Agencies**
- 🚀 10x faster (hours vs weeks)
- 💰 1/100th cost (free vs $5,000+)
- 🔄 Unlimited iterations
- 📊 Data-driven insights
- ✅ Consistent quality

**vs. Generic AI Tools**
- 🎯 Built for advertising specifically
- 📚 Multi-stage intelligence (not just prompting)
- 🔍 Competitive analysis, not generic content
- 🎨 Design-integrated (Figma, not text-only)
- 💾 Learning memory across campaigns

**vs. Human Creatives**
- ⚡ Instant (no scheduling, waiting)
- ♻️ Always available (24/7)
- 🎯 Zero ego (no designer defensiveness)
- 📈 Scalable (infinite iterations)
- 💰 Free to run

---

## The Bigger Picture

### Vision
In the future, ad agencies won't have 50 creatives. They'll have:
- 1-2 humans to approve ideas
- AI agents doing the heavy creative lifting
- Faster, cheaper, better ads for everyone

### Mission
Democratize creative advertising so anyone can:
- Create professional campaigns
- Compete with major brands
- Iterate rapidly
- Learn continuously

### Impact
```
Before NOMADS:
Only big brands can afford great ads
Creatives gate-keep the skill
Takes weeks and thousands

After NOMADS:
Anyone can create ads
Skill is optional
Takes minutes and costs free
```

---

## Current Limitations

### Hardware
- Needs local Ollama running
- Models are ~7GB each
- Inference is slower than cloud

### Features
- Make & Test stages not yet implemented
- No design asset generation yet
- No Vision LLM integration yet
- Single-user only (no collaboration)

### Data
- Stores locally only (no backup)
- No cloud sync
- No sharing between devices
- No team features

---

## How to Get Started

1. **Read**: `QUICK_START.md` (5 min)
2. **Run**: `npm run dev` (3 min)
3. **Try**: Create a campaign and run a cycle (5 min)
4. **Learn**: Read `NOMADS.md` for full context (20 min)

**Total time to productivity: ~30 minutes**

---

## Contributing

Help make NOMADS better by:
- Fixing blockers (Make & Test stages)
- Adding new campaign templates
- Improving prompts for better outputs
- Testing with different Ollama models
- Adding new features

See `BLOCKERS.md` for what's needed.

---

## The Philosophy

NOMADS is built on these principles:

1. **Autonomy** - AI should work independently
2. **Intelligence** - Multi-stage reasoning, not just prompting
3. **Creativity** - Real creative thinking, not templates
4. **Learning** - Systems should improve over time
5. **Accessibility** - Anyone can use it
6. **Privacy** - Data stays local
7. **Speed** - Instant results
8. **Quality** - Professional-grade output

---

## In One Sentence

> NOMADS is an autonomous AI agent that generates complete advertising campaigns through intelligent competitive analysis, creative direction, design generation, and performance testing.

---

**Status**: Phase 4 - Research & Taste working, Make & Test pending
**Author**: Built with Claude AI
**License**: MIT (shared on GitHub)
**Try it**: https://github.com/fortun8te/nomads
