# NOMADS

autonomous ad creative engine. give it a product, it researches the market, figures out the angle, generates the ads, tests them, and remembers what worked for next time.

runs fully local — your LLMs, your data, no cloud, no API keys, no monthly bills.

---

## project status

**Current Phase: 8** (Phase 8 complete; Phase 9 planning)

| Phase | Status | Focus |
|-------|--------|-------|
| 1 | ✅ | Project setup with Vite, React, TypeScript, Tailwind, IndexedDB |
| 2 | ✅ | Core state management, Ollama hooks, storage, cycle loop |
| 3 | ✅ | Dashboard UI components |
| 4 | ✅ | Research orchestration + agentic system |
| 5 | ✅ | Wayfarer web scraping + SearXNG integration |
| 6 | ✅ | Bug fixes, abort signals, UI polish, live streaming |
| 7 | ✅ | End-to-end cycle (research → memories → cycle 2), JSON streaming |
| 8 | ✅ | UI polish, research presets (5 tiers), audit trail, visual scouting |
| 9 | 📋 | Figma MCP integration for Make stage |
| 10+ | 📋 | Auto-start infrastructure, test loop refinement, scalability |

**Build Status:** 60+ TypeScript errors (mainly in MakeStudio.tsx, MakeTestPanel.tsx)
- Missing type definitions: `StoredImage`, `AdDescription`, `VisionRound`, `AspectRatioType`
- Unused variable cleanup needed
- Type annotation fixes in useAmbientSound.ts, councilEvaluator.ts

---

## what it does

you describe a product. NOMADS runs a full cycle:

1. **research** — deploys parallel AI agents to scrape the web, map customer desires, find competitor gaps, and build a real picture of the market
2. **objections** — figures out why people *don't* buy, then writes copy that handles each objection
3. **taste** — defines the creative direction: colors, tone, positioning, visual style
4. **make** — generates actual ad creatives (HTML ads rendered to images, or Freepik image generation)
5. **test** — evaluates the concepts, ranks them, picks a winner
6. **memories** — archives what worked so the next cycle is smarter

the whole thing streams in real-time. you watch it think.

the UI is Manus-inspired — single-column action feed with collapsible task groups, dark pill-style action chips, morphing blob "Thinking" indicator, and live streaming output. narrow left panel has pipeline controls + brand hub; full-height right panel shows the research feed. always-on token counter tracks model loading / thinking / generating states and tokens-per-second.

---

## the stack

| layer | what |
|-------|------|
| frontend | React 19 + TypeScript + Vite + Tailwind v4 |
| storage | IndexedDB (idb-keyval) — everything persists locally |
| LLMs | remote Ollama via Wayfarer proxy — GLM-4.7 (orchestrator), LFM-2.5 (researchers), gpt-oss:20b (creative) |
| web search | SearXNG (Docker) for search queries, Wayfarer for fetching + scraping |
| image gen | Freepik Pikaso via Playwright automation, or HTML-to-image pipeline |
| screenshots | Playwright headless Chromium (lives inside Wayfarer) |

---

## wayfarer

wayfarer is the backend. it's a FastAPI server that handles everything the browser can't do directly:

**web research** — takes a search query, hits SearXNG for results, then async-fetches all the pages in parallel using pvl-webtools. extracts clean article text. a query like "collagen supplement trends 2025" returns ~60K chars of scraped content in under 5 seconds.

**ollama proxy** — the browser can't talk to a remote Ollama instance directly (CORS). wayfarer proxies all `/ollama/*` requests to the remote machine, streaming responses back as NDJSON.

**screenshots** — spins up headless Chromium, navigates to a URL, auto-dismisses cookie banners / popups / modals, and returns a JPEG screenshot as base64. has a smart mode where you can pass custom JS to run before capture.

**page analysis** — combined scrape + screenshot in one call. extracts structured data (title, price, description, ingredients, JSON-LD) plus a visual screenshot.

**crawling** — navigates to a page with Playwright, scrolls to trigger lazy loading, extracts all links. useful for mapping out competitor product catalogs.

```
POST /research        — search + scrape (batch of pages)
POST /batch           — multiple queries in parallel
POST /screenshot      — single URL screenshot
POST /screenshot/batch — multiple URLs
POST /screenshot/smart — screenshot with custom JS pre-execution
POST /analyze-page    — text extraction + screenshot combo
POST /crawl           — extract all links from a page
/ollama/*             — transparent proxy to remote Ollama
```

runs on port 8889. needs SearXNG on port 8888 and Python 3.11.

---

## architecture overview

### research pipeline (8-stage cycle)

```
Input (product brief)
    ↓
[1] Research — Two-phase market intel (Phase 1 + Phase 2)
    ↓
[2] Brand DNA — Consolidated hero positioning + 3 tabs (DNA, Persona, Strategy)
    ↓
[3] Personas — Deep audience segmentation
    ↓
[4] Angles — Creative positioning + positioning gaps
    ↓
[5] Strategy — Objection handling, proof points, messaging blocks
    ↓
[6] Copywriting — Ad copy variations (desire/objection/social proof)
    ↓
[7] Production (Figma/HTML) — Ad creative generation + Freepik images
    ↓
[8] Test — Concept ranking + winner selection via Council of Brains
    ↓
Memories → next cycle smarter
```

### research system: two-phase architecture

**Phase 1 — Desire-Driven Analysis** (GLM-4.7, 4 steps):
1. Map deep customer desires (what do they *actually* want)
2. Identify purchase objections (why they don't buy)
3. Research audience behavior and language
4. Map competitor landscape and positioning gaps

Outputs: JSON-formatted intelligence used by Phase 2 and all downstream stages.

**Phase 2 — Web Research Orchestration** (GLM orchestrator + LFM-2.5 researchers):
- Orchestrator evaluates what's missing, generates search queries
- Deploys up to 3 parallel researcher agents per round
- Each researcher: Wayfarer search → LFM compression → LFM synthesis
- Reflection agent checks coverage (80% threshold across 10 dimensions)
- Search queries and decisions visible in real-time UI

**Coverage dimensions:** Market size, competitors, objections, trends, regional insights, pricing, channels, positioning, psychology, media patterns.

### research depth presets

Five configurable tiers for different research thoroughness:

| Preset | Duration | Iterations | Sources | Features |
|--------|----------|-----------|---------|----------|
| **SQ** (Super Quick) | ~5 min | 5 | 8 | Basic research |
| **QK** (Quick) | ~30 min | 12 | 25 | — |
| **NR** (Normal) | ~90 min | 30 | 75 | — |
| **EX** (Extended) | ~2 hrs | 45 | 200 | Cross-validation, community insights, ad scraping (visual) |
| **MX** (Maximum) | ~5 hrs | 100 | 400 | All features + deep visual scouting |

**Key bottleneck:** LLM compression (80% of time). Wayfarer scraping is negligible (~4s for 20 pages). Higher presets parallelize compression (up to 4x on Max) and enable visual scouting.

### visual intelligence system

**Playwright + minicpm-v vision analysis pipeline:**
- Orchestrator or reflection agent outputs `VISUAL_SCOUT: [urls]` when strategic
- Wayfarer screenshots competitor pages (Playwright + cookie/popup auto-dismiss)
- minicpm-v:8b analyzes: colors, layout, tone, CTA patterns, visual hierarchy
- qwen3.5:9b synthesizes patterns and identifies visual differentiation gaps
- Findings stored in `researchFindings.visualFindings` → available to all downstream stages

**Three screenshot modes:**
- Single (`/screenshot`) — one URL
- Batch (`/screenshot/batch`) — parallel (concurrency 3)
- Smart (`/screenshot/smart`) — screenshot with custom JS pre-execution

### council of marketing brains

Multi-specialist evaluation system for the Test stage:
- Each evaluator: specialized persona (Brand Guardian, Copy Analyst, Market Strategist, etc.)
- Scores concepts on 5-10 dimensions per specialist
- Derives aggregated ranking + detailed reasoning
- Picks winner with explainable scoring

(See `COUNCIL_SYSTEM.md` for full details)

---

## how the ads get made

two pipelines depending on what you want:

**HTML ads** — LLM writes a full HTML document (ad creative with layout, copy, images). gets rendered in a headless iframe and screenshotted to PNG. you can refine these by chatting — "make the CTA bigger", "change the background to dark" — and the LLM edits the HTML directly.

**Freepik images** — prompts get sent to Freepik's Pikaso via Playwright automation. supports multiple models (Nano Banana 2, Flux Pro, Seedream, etc). pulls your Chrome cookies so no login needed. streams progress events back to the UI.

you upload product photos and optionally one layout reference. product images get embedded directly into the HTML ads. layout references guide the composition style.

there's also an ad library with ~250 pre-analyzed real ads you can browse for inspiration. click "reference this layout" and it gets injected as a reference for the next generation.

---

## getting started

### prerequisites

1. **Ollama** — Running remotely with models pulled:
   - `glm-4.7-flash:q4_K_M` (19GB, 30B) — orchestrator + analysis
   - `lfm-2.5:q4_K_M` (730MB, 1.2B) — fast research + compression
   - `gpt-oss:20b` (13GB) — Make + Test stages
   - Default: `http://100.74.135.83:11434` (Tailscale). Change `OLLAMA_HOST` in wayfarer_server.py if different.

2. **Python 3.11** — Required for Wayfarer (pvlwebtools dependency)
   - Homebrew: `/opt/homebrew/bin/python3.11`

3. **Node 18+** — For the frontend dev server

### startup sequence

```bash
# 1. Start Docker (if not running)
open -a Docker

# 2. Start SearXNG (or check if already running)
cd /Users/mk/Downloads/nomads && docker-compose up -d

# 3. Start Wayfarer (IMPORTANT: use python3.11, set SEARXNG_URL)
cd /Users/mk/Downloads/nomads
SEARXNG_URL=http://localhost:8888 /opt/homebrew/bin/python3.11 -m uvicorn wayfarer_server:app --host 0.0.0.0 --port 8889

# 4. Start the frontend dev server (in another terminal)
cd /Users/mk/Downloads/nomads && npm run dev
```

Then open **http://localhost:5173** in your browser.

### troubleshooting startup

- **Wayfarer won't start:** Verify `SEARXNG_URL=http://localhost:8888` is set. Check `docker ps` to ensure SearXNG is running.
- **Ollama timeout:** Ensure remote Ollama machine is reachable. Test: `curl http://100.74.135.83:11434/api/tags`
- **TypeScript errors on build:** See "Known Issues" section below. Build currently has 60+ errors that need fixing before production deployment.
- **Port conflicts:** SearXNG (8888), Wayfarer (8889), Dev server (5173). Adjust docker-compose.yml and vite.config.ts if different ports needed.

---

## known issues

### build errors (60+ TypeScript)

**Critical blocking issues in Make/Test stages:**
- `MakeStudio.tsx` (35+ errors): Missing type definitions `StoredImage`, `VisionRound`, `AdDescription`
- `MakeTestPanel.tsx` (8+ errors): Missing type `AspectRatioType`. Ad template union type mismatch.
- `useAmbientSound.ts`: Type cast issues (AudioBufferSourceNode ↔ OscillatorNode)
- `councilEvaluator.ts`: Function signature mismatch (expected 2-3 args, got 5)
- Unused variable cleanup: 15+ declared-but-never-used variables

**Action:** Fix type definitions in Make/Test pipelines before Phase 9 (Figma integration).

### production stage

Currently a stub. Phase 8 setup created infrastructure for:
- HTML ad rendering + screenshot pipeline
- Freepik image generation via Playwright
- Ad template system (Hero, Features, Before/After, Testimonial)

Needs completion in Phase 9.

### figma integration missing

Phase 9 task: integrate Figma MCP for Make stage output.
- Repo reference: https://github.com/arinspunk/claude-talk-to-figma-mcp
- Goal: Generate Figma components from ad concepts instead of (or alongside) HTML ads

### infrastructure

- **Wayfarer auto-start:** Must be manually launched. No UI button or daemon mode yet.
- **Hard-coded endpoints:** Ollama host, SearXNG URL, Wayfarer port are environment-based. Would benefit from UI config panel.
- **Python dependency:** Wayfarer requires Python 3.11 (pvlwebtools). Should document or vendor.
- **Cold start latency:** gpt-oss:20b can take ~60s on first request. Consider model warming or async queuing.

---

## project structure

```
src/
  components/
    MakeStudio.tsx              ad generation engine, gallery, modal (60+ TS errors)
    MakeTestPanel.tsx           concept testing UI (8+ TS errors)
    Dashboard.tsx               Manus-style split pane: left + right panels
    AdLibraryBrowser.tsx        browse 250 pre-analyzed real ads
    ResearchOutput.tsx          Manus-style action feed — collapsible, streaming
    StagePanel.tsx              right panel with live token counter
    BrandHubDrawer.tsx          4-tab brand intelligence (DNA, Persona, Strategy, Chat)
    CycleTimeline.tsx           stage tabs with status dots + elapsed timers
    SettingsModal.tsx           model config, ambient sound, debug tools
    SidebarGradient.tsx         animated SVG gradient background
    AgentPanel.tsx              multi-tool agent UI (browser, computer, file ops)
    ComputerDesktop.tsx         headless browser sandbox UI
    MultiComputerUI.tsx         multi-agent browser grid

  hooks/
    useCycleLoop.ts             8-stage cycle orchestrator, streams via onChunk
    useOrchestratedResearch.ts  Phase 1 + 2 research pipeline
    useResearchAgent.ts         Desire-driven analysis (4 steps)
    useAmbientSound.ts          Web Audio procedural pad generation
    useTestStageWithCouncil.ts  Council evaluator integration

  utils/
    researchAgents.ts           Orchestrator, Researcher, Reflection agents
    visualScoutAgent.ts         Playwright + minicpm-v vision analysis
    ollamaService.ts            Streaming Ollama client (via Wayfarer proxy)
    wayfarer.ts                 TypeScript client for Wayfarer API + screenshots
    freepikService.ts           NDJSON streaming for Freepik Pikaso
    councilEvaluator.ts         Multi-specialist evaluation system
    adLibraryLoader.ts          Ad library cache + search
    modelConfig.ts              Model assignments per stage + preset system
    researchAudit.ts            Audit trail collection (URLs, tokens, timing)
    agentTools.ts               Computer control, DOM extraction, error recovery
    chatHistory.ts              Conversation persistence
    domExtractor.ts             Page structure parsing
    errorRecovery.ts            Retry logic + fallback handling
    sandboxService.ts           Multi-machine browser sandbox
    workspace.ts                Session file organization

  context/
    CampaignContext.tsx         Global state for cycles, research, brand data

  types/
    index.ts                    Shared TypeScript definitions

backend/
  wayfarer.py                 Async web research (pvlwebtools + SearXNG + Playwright)
  wayfarer_server.py          FastAPI: research, screenshots, Ollama proxy
  freepik_server.py           Playwright automation for Freepik Pikaso generation

docs/
  COUNCIL_SYSTEM.md           Council of Marketing Brains specification
  COUNCIL_IMPLEMENTATION_SUMMARY.md  Implementation details
  HOW_WE_MAKE_ADS.md          Ad generation pipeline
  PROJECT_VISION.md           Long-term vision + design principles
  ARCHITECTURE.md             System architecture deep dive
  PERFORMANCE_ANALYSIS.md     Benchmarks + optimization notes
```

---

## tech stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| **Storage** | IndexedDB (idb-keyval) — all data persists locally |
| **LLM Backend** | Remote Ollama (GLM-4.7, LFM-2.5, gpt-oss:20b) |
| **Web Search** | SearXNG (Docker) + Wayfarer (FastAPI) |
| **Scraping** | pvlwebtools + Playwright headless Chromium |
| **Vision** | minicpm-v:8b (screenshot analysis) |
| **Image Gen** | Freepik Pikaso via Playwright automation |
| **Streaming** | NDJSON for LLM responses + event-based UI updates |
| **State** | React Context + Hooks pattern |
| **Build** | TypeScript, Vite, ESM |

---

## features & highlights

**UI/UX:**
- Dark mode throughout
- Manus-inspired single-column action feed with collapsible task groups
- Morphing blob "Thinking" indicator during generation
- Always-on token counter (model loading/thinking/generating states, tokens/sec)
- Configurable gallery grid (6-20 columns)
- Ambient sound engine: procedural Web Audio synth pad (toggleable)
- Animated gradient sidebar with SVG blur effects

**Research:**
- Real-time streaming of orchestrator decisions + search queries
- 5 depth presets (SQ/QK/NR/EX/MX) controlling thoroughness
- Visual scouting: Playwright + minicpm-v competitor analysis
- Audit trail: all URLs, tokens, models, timing persisted per cycle
- Coverage tracking across 10 research dimensions

**Generation & Collaboration:**
- Multi-specialist Council of Marketing Brains for concept evaluation
- Streaming JSON output during analysis (visible in UI)
- Abort signal threaded through entire pipeline — pause/resume mid-cycle
- Brand Hub: 4-tab system (DNA, Persona, Strategy, Edit chat)
- Ad Library: 250+ pre-analyzed real ads for inspiration + reference injection

**Data:**
- All data in IndexedDB — survives page refreshes
- PDF upload support (pages extracted as reference images)
- JSON export of research findings
- Cycle history browsing

**Agents & Sandbox:**
- Multi-agent browser sandbox (computer control, DOM extraction)
- Error recovery + retry logic for resilience
- Session file organization + chat history persistence

---

## next phases (roadmap)

### Phase 9: Figma MCP Integration
- Integrate Figma Code Connect for Make stage
- Generate Figma components directly from ad concepts
- Real-time Figma design preview + editing

### Phase 10: Auto-Start Infrastructure
- Docker daemon for SearXNG auto-startup
- Wayfarer daemon mode with UI button
- Hard-coded endpoint → environment config UI panel
- Model warming + async queue for cold starts

### Phase 11: Test Loop Refinement
- A/B testing framework (actual ad metrics if available)
- Variant generation strategies
- Winner feedback loop to memories

### Phase 12: Scalability
- Batch cycle processing (multiple products in parallel)
- Redis caching for research results
- Distributed agent orchestration
- API endpoint for headless operation

---

## documentation

Comprehensive analysis and reference documents:

- **COUNCIL_SYSTEM.md** — Council of Marketing Brains evaluation system
- **COUNCIL_IMPLEMENTATION_SUMMARY.md** — Implementation patterns and examples
- **HOW_WE_MAKE_ADS.md** — End-to-end ad generation pipeline
- **PROJECT_VISION.md** — Long-term vision, design principles, philosophy
- **ARCHITECTURE.md** — System architecture, data flow, component relationships
- **PERFORMANCE_ANALYSIS.md** — Bottleneck analysis, benchmarks, optimization notes
- **NOMADS.md** — Historical project overview

---

## license & attribution

Built with inspiration from:
- Manus (UI/UX patterns)
- Creative Ad Agent (https://github.com/DV0x/creative-ad-agent)
- Webtester (https://github.com/mraid/webtester)
- Figma MCP (https://github.com/arinspunk/claude-talk-to-figma-mcp)
