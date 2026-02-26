# NOMADS - Autonomous Creative Advertising Agent

NOMADS is an AI system that generates complete advertising campaigns independently. Give it a brief and target market, and it will research the space, define creative strategy, generate designs, evaluate them, and archive the learnings for the next campaign.

The system works through a 5-stage cycle that mimics how professional creative teams operate, but executes in minutes instead of weeks.

---

## How It Works: The Framework

NOMADS creates ads through an intelligent 5-stage cycle. Each stage builds on the previous one. The entire process runs autonomously without human input.

### Stage 1: Research (30-60 seconds)

The system becomes a competitive intelligence analyst. It analyzes your target market and competitors to find opportunities.

Input: Campaign brief, target market, competitor list
Output: Market analysis, audience insights, competitive gaps

What it discovers:
- Who your audience is and what they care about
- What competitors are doing well vs what they're missing
- What messages and tactics are working
- Where the opportunity gap is
- What you could say that competitors aren't

Example: "Women 25-45 want effective skincare AND natural ingredients, but no brand is successfully combining scientific credibility with a natural story. That's your gap."

### Stage 2: Taste (20-40 seconds)

Now that we understand the market, the system defines the creative direction. This is the personality, visual style, and messaging strategy for your brand.

Input: Research insights, campaign brief
Output: Creative direction, visual identity, messaging strategy

What it defines:
- Visual identity (colors, photography style, typography)
- Tone of voice (how should we talk to the audience)
- Key messages to emphasize
- Emotional strategy (what feeling should we create)
- Unique competitive angle
- Execution framework (format, pacing, proof points)

Example: "Use forest green and gold. Photography style: botanical but real skin. Tone: knowledgeable but warm. Message: effective + natural + conscious choice. Emotional hook: empowered confidence."

### Stage 3: Make (2-5 minutes) [PENDING]

The system generates actual visual designs using the creative direction. Multiple variations are created, each testing a different angle or message.

Input: Creative direction, campaign brief, asset library
Output: 4-8 design variations in multiple formats

What it creates:
- Instagram feeds, stories, reels
- Facebook ads
- Email headers
- Website banners
- Mobile versions
- Each variant tests a different message angle

Each design follows the creative strategy but emphasizes different angles (results angle, values angle, science angle, community angle, etc).

Status: Waiting for Figma MCP integration to generate designs programmatically.

### Stage 4: Test (1-2 minutes) [PENDING]

The system evaluates each design variation to predict which will perform best. It acts like a design critic and performance analyst.

Input: Design variations, creative brief
Output: Performance predictions, ranked designs, improvement suggestions

What it evaluates:
- Design quality and professional execution
- Message clarity and impact
- Predicted click-through rate
- Predicted conversion rate
- Which variation performs best
- What elements are most effective
- What could be improved

Example: "Results variation (before/after) scores 9/10 CTR prediction. Values variation scores 8.5/10. Results variation is more persuasive. Recommend allocating 80% budget there."

Status: Waiting for Vision LLM (Claude 4V or similar) to evaluate designs visually.

### Stage 5: Memories (10-20 seconds)

The system archives everything and extracts learnings. This creates a knowledge base that makes future campaigns smarter.

Input: All outputs from previous stages
Output: Archived cycle, learnings summary, reusable assets

What it preserves:
- Campaign summary
- Research insights (what did we learn about the audience)
- Creative direction that worked
- Which designs performed best
- Why they performed best
- What to do next time
- Reusable templates and frameworks

Example: "Forest green + gold palette works. Before/after results format wins every time. Botanical imagery paired with real skin texture resonates. Messaging formula: efficacy + natural source + conscious choice."

---

## The Process Flow

```
USER INPUT
Campaign brief + target market + competitors
     |
     v
RESEARCH STAGE
Analyze market, study competitors, find gaps
     |
     v
TASTE STAGE
Define creative direction, visual style, messaging
     |
     v
MAKE STAGE
Generate 4-8 design variations [PENDING]
     |
     v
TEST STAGE
Evaluate designs, predict performance [PENDING]
     |
     v
MEMORIES STAGE
Archive learnings, extract insights
     |
     v
OUTPUT
Complete campaign: insights + strategy + designs + learnings
```

---

## Why This Works

Most ad creation skips the hard thinking. Designers jump straight to "making it pretty" without understanding the market. NOMADS does it backwards:

1. Research the market first (not an afterthought)
2. Define strategy before design (not the other way around)
3. Create multiple variations (not just one)
4. Evaluate each one (not just picking a favorite)
5. Learn from results (not throwing insights away)

Result: Better ads, faster, cheaper, and each campaign makes the next one smarter.

---

## Tech Stack

Frontend: React 18, TypeScript, Vite
Styling: Tailwind CSS v4
State: React Context
Storage: IndexedDB (persistent, local)
AI: Local Ollama (mistral or neural-chat)
Design: Figma MCP (when integrated)

All data stays local. Everything runs on your machine. No cloud uploads, no licensing fees, no monthly bills.

---

## Current Status

Working:
- Research stage: generates market analysis and competitive intelligence
- Taste stage: defines creative direction and messaging strategy
- Dashboard: create campaigns, manage cycles, view outputs
- Persistence: data saved to IndexedDB, survives reload
- Pause/Resume: stop and restart execution mid-cycle

Blocked:
- Make stage: needs Figma integration for design generation
- Test stage: needs Vision LLM for design evaluation

Timeline: 2-3 minutes for Research + Taste stages to complete. Full cycle will take 5-10 minutes once Make and Test are implemented.

---

## Getting Started

Requirements: Node.js, npm, Ollama running locally

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start the app
cd /Users/mk/Downloads/ad-agent
npm install
npm run dev
```

Open http://localhost:5173

Create a campaign, click START, watch it research and define creative direction.

---

## Project Structure

```
src/
  components/         UI components
  context/           React Context (state management)
  hooks/
    useCycleLoop.ts  Orchestrates all 5 stages
    useOllama.ts     Connects to local Ollama
    useStorage.ts    Persists to IndexedDB
  utils/
    prompts.ts       Research/Taste prompts
    ollama.ts        Ollama API wrapper
```

Key file: src/hooks/useCycleLoop.ts orchestrates everything. When user clicks START, this file handles:
- Executing each stage in sequence
- Calling Ollama for AI generation
- Updating UI with outputs
- Saving to storage
- Handling pause/resume

---

## Important Concepts

React Context: Centralized state for campaigns, cycles, stages
Cycle: A single execution through all 5 stages
Stage: One of the 5 processes (Research, Taste, Make, Test, Memories)
Campaign: A brand/product being advertised
Output: The text, strategy, or designs generated by a stage

When user creates a campaign and clicks START:
1. Context creates a new cycle object
2. useCycleLoop detects it and starts executing
3. First stage (Research) runs, calls Ollama, gets output
4. Output saved to cycle state and IndexedDB
5. UI re-renders, user sees output
6. Next stage (Taste) runs automatically
7. Process repeats through all 5 stages
8. Cycle marked complete, archived in storage

Data persists across browser reloads via IndexedDB.

---

## Common Commands

```bash
npm run dev              Start development server
npm run build            Production build
ollama serve             Start Ollama AI server
ollama pull mistral      Download mistral model
curl http://localhost:11434/api/tags    Check Ollama status
```

---

## What Needs to Be Done

Make Stage: Implement design generation using Figma MCP or alternative
- Would generate 4-8 design variations based on creative direction
- Each variation tests different message angle
- All in Figma format for easy editing

Test Stage: Integrate Vision LLM for design evaluation
- Would analyze each design's clarity, impact, effectiveness
- Would predict performance (CTR, conversion rate)
- Would rank designs and suggest improvements

Memories Stage: Already working but could be expanded
- Current: Stores outputs
- Future: Extract more granular learnings, build templates

---

## Other Documentation

QUICK_START.md: 5-minute setup
NOMADS.md: Complete project details (tech, folder structure, status)
ARCHITECTURE.md: Code deep dive for developers
BLOCKERS.md: Known issues and fixes
PROJECT_VISION.md: Vision and mission
HOW_WE_MAKE_ADS.md: Detailed breakdown of the ad creation process

Each document is self-contained but interconnected.

---

**Repository**: https://github.com/fortun8te/nomads
**Status**: Phase 4 - Research and Taste stages working, Make and Test pending
**Last Updated**: February 26, 2026
