# NOMADS

autonomous ad creative engine. give it a product, it researches the market, figures out the angle, generates the ads, tests them, and remembers what worked for next time.

runs fully local — your LLMs, your data, no cloud, no API keys, no monthly bills.

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

## how the research works

two-phase system:

**phase 1 — desire-driven analysis** (runs on GLM-4.7, 4 steps):
- map deep customer desires (what do they *actually* want)
- identify purchase objections (why they don't buy)
- research audience behavior and language
- map competitor landscape and positioning gaps

**phase 2 — web research orchestration** (GLM orchestrator + LFM-2.5 field agents):
- orchestrator evaluates what's missing, picks search queries
- deploys up to 3 parallel researcher agents per round
- each researcher: wayfarer search → LFM compression → LFM synthesis
- reflection agent checks coverage after each round
- stops when 80% coverage across 10 dimensions (market size, competitors, objections, trends, regional, pricing, channels, positioning, psychology, media patterns)

the whole thing is visible in the UI — you see the orchestrator's decisions, the search queries it picks, each researcher's findings streaming in.

---

## how the ads get made

two pipelines depending on what you want:

**HTML ads** — LLM writes a full HTML document (ad creative with layout, copy, images). gets rendered in a headless iframe and screenshotted to PNG. you can refine these by chatting — "make the CTA bigger", "change the background to dark" — and the LLM edits the HTML directly.

**Freepik images** — prompts get sent to Freepik's Pikaso via Playwright automation. supports multiple models (Nano Banana 2, Flux Pro, Seedream, etc). pulls your Chrome cookies so no login needed. streams progress events back to the UI.

you upload product photos and optionally one layout reference. product images get embedded directly into the HTML ads. layout references guide the composition style.

there's also an ad library with ~250 pre-analyzed real ads you can browse for inspiration. click "reference this layout" and it gets injected as a reference for the next generation.

---

## getting started

```bash
# 1. start Docker (for SearXNG)
open -a Docker

# 2. start SearXNG
cd /path/to/nomads && docker-compose up -d

# 3. start Wayfarer (needs python 3.11)
SEARXNG_URL=http://localhost:8888 python3.11 -m uvicorn wayfarer_server:app --host 0.0.0.0 --port 8889

# 4. start the app (also starts Freepik server)
npm run dev
```

open http://localhost:5173

you'll need Ollama running somewhere with GLM-4.7-flash, LFM-2.5, and gpt-oss:20b pulled. the default points to a Tailscale IP — change `OLLAMA_HOST` in wayfarer_server.py if yours is different.

---

## project structure

```
src/
  components/
    MakeStudio.tsx          the big one — ad generation engine, gallery, detail modal, settings
    Dashboard.tsx           main layout shell
    AdLibraryBrowser.tsx    browse 250 pre-analyzed real ads for inspo
    ResearchOutput.tsx      collapsible streaming research UI
    SettingsModal.tsx       model config, debug tools, kill LLM button
    OrbitalLoader.tsx       the loading animation
    CycleTimeline.tsx       clickable stage tabs

  hooks/
    useCycleLoop.ts         orchestrates all stages, streams via onChunk
    useOrchestratedResearch.ts  phase 1 + phase 2 research
    useResearchAgent.ts     desire-driven analysis (4 steps)

  utils/
    researchAgents.ts       orchestrator, researcher, reflection agents
    ollama.ts               streaming Ollama client (via Wayfarer proxy)
    wayfarer.ts             TypeScript client for Wayfarer API
    freepikService.ts       NDJSON streaming client for Freepik server
    adLibraryLoader.ts      loads + caches the ad library
    modelConfig.ts          which model runs which stage

wayfarer.py               async web research (pvlwebtools + SearXNG)
wayfarer_server.py        FastAPI server — research, screenshots, Ollama proxy
freepik_server.py         Playwright automation for Freepik Pikaso
```

---

## misc

- dark mode support throughout
- everything streams in real-time with token tracking (model loading / thinking / streaming states)
- fun rotating status words while generating ("combobulating...", "pondering...", "waking up neurons...")
- abort signal threaded through the entire pipeline — pause mid-generation, resume later
- all data in IndexedDB, survives refreshes
- PDF upload support (pages get extracted as reference images)
- configurable grid columns (6-20) for the gallery view
