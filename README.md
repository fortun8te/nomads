# Nomad

> Local-first multi-agent AI system for creative professionals.

## What is Nomad?

Nomad is a personal AI that runs entirely on your own hardware. It orchestrates multiple specialized agents to handle deep web research, ad campaign generation, competitor analysis, and creative work — with no data leaving your machine. Built for the creative nomad who needs marketing intelligence without a cloud subscription.

## Architecture (v0.2)

Requests are classified by a zero-LLM heuristic router and handed off to the appropriate layer: a user-facing middle agent (always responsive), background orchestrators that break tasks into plans, and a pool of worker agents that execute individual steps. A watchdog enforces per-model budgets and detects runaway loops.

```
User message
    │
    ▼
Router (heuristic, 0 LLM calls)
    │   CHAT / DIRECT / QUICK / MEDIUM / COMPLEX / INTERRUPT
    ▼
Middle Agent (qwen3.5:9b)  ◄─── always responds to user
    │
    ├─► Direct Executor     (single-shot, DIRECT tasks)
    ├─► Orchestrator Medium (qwen3.5:4b, 2-10 step plans)
    └─► Orchestrator Complex (qwen3.5:9b, multi-phase, checkpoints)
            │
            └─► Worker Agents (code / file / vision / deploy / wayfayer)
```

### Agent Roles

| Agent | Model | Role |
|-------|-------|------|
| Middle Agent | qwen3.5:9b | User-facing relay; handles chat, status updates, interrupt routing |
| Orchestrator Medium | qwen3.5:4b | Breaks medium tasks into JSON step plans; sequential worker dispatch |
| Orchestrator Complex | qwen3.5:9b | Multi-phase plans with checkpoints; handles research + campaign cycles |
| Direct Executor | qwen3.5:2b | Single-step execution (write file, send message, set reminder) |
| Code Agent | qwen3.5:4b | Generates and optionally executes code via sandbox |
| File Agent | qwen3.5:2b | Reads, writes, and transforms files |
| Vision Agent | qwen3.5:9b | Analyzes screenshots and images (Playwright + vision model) |
| Deploy Agent | qwen3.5:4b | Handles build/deploy commands |
| Compression Agent | qwen3.5:2b | Compresses web pages and long context into key facts |

### VRAM Strategy (RTX 5080 16GB)

One model stays resident; others hot-swap as needed. The watchdog tracks live VRAM usage from the table below and blocks swaps that would exceed the 16 GB ceiling.

| Model | VRAM |
|-------|------|
| qwen3.5:2b | ~1.5 GB |
| qwen3.5:4b | ~2.5 GB |
| qwen3.5:9b | ~5.5 GB |
| qwen3.5:27b | ~15.0 GB |

## Features

- Multi-agent orchestration (router → middle agent → background orchestrators → workers)
- Deep web research (up to 400 sources, visual scouting with Playwright)
- Ad campaign generation (desire analysis → objections → creative → testing → memories)
- Visual competitor analysis (screenshots + vision model extracts colors, layout, CTA patterns)
- Cross-cycle learning and memory archiving
- Research depth presets (5 tiers: SQ / QK / NR / EX / MX)
- Live streaming UI for all pipeline stages
- Complete research audit trail (URLs, tokens, models, timing)
- Telegram remote access (planned)

## Research Depth Presets

| Preset | Approx. Time | Iterations | Max Sources | Extra Features |
|--------|-------------|-----------|-------------|---------------|
| **SQ** (Super Quick) | ~5 min | 5 | 8 | — |
| **QK** (Quick) | ~30 min | 12 | 25 | — |
| **NR** (Normal) | ~90 min | 30 | 75 | — |
| **EX** (Extended) | ~2 hrs | 45 | 200 | Cross-validation, community scrape, ad scrape (visual) |
| **MX** (Maximum) | ~5 hrs | 100 | 400 | All 6 features + deep visual analysis |

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS v4
- **AI**: Ollama with Qwen 3.5 family (0.8b → 27b), accessed over Tailscale
- **Web research**: SearXNG (Docker) + Wayfarer (FastAPI + Playwright)
- **Storage**: IndexedDB via idb-keyval (all data stays local)

## Setup

### Prerequisites

- Node.js 18+
- Python 3.11+ (Homebrew: `/opt/homebrew/bin/python3.11`)
- Ollama running with Qwen 3.5 models pulled
- Docker Desktop (for SearXNG)

### Start everything

```bash
# 1. Start Docker (if not running)
open -a Docker

# 2. Start SearXNG
cd /path/to/nomads && docker-compose up -d

# 3. Start Wayfarer (must use Python 3.11)
SEARXNG_URL=http://localhost:8888 /opt/homebrew/bin/python3.11 -m uvicorn wayfarer_server:app --host 0.0.0.0 --port 8889

# 4. Start the dev server
npm run dev
```

### Environment variables

Copy `.env.example` to `.env` and adjust:

```bash
# Remote Ollama server (Tailscale IP or local)
VITE_OLLAMA_URL=http://100.74.135.83:11440

# Wayfarer web research proxy (local FastAPI)
VITE_WAYFARER_URL=http://localhost:8889

# SearXNG search engine (local Docker)
VITE_SEARXNG_URL=http://localhost:8888

# Optional: Meta Ad Library credentials
# VITE_META_APP_ID=your_app_id
# VITE_META_APP_SECRET=your_app_secret
```

All URLs flow through `src/config/infrastructure.ts` — no hard-coded strings in the codebase.

## Project Structure

```
nomads/
├── src/
│   ├── agents/               # v0.2 agent layer
│   │   ├── middleAgent.ts    # User-facing agent (qwen3.5:9b)
│   │   ├── orchestratorMedium.ts   # Medium task orchestrator (qwen3.5:4b)
│   │   ├── orchestratorComplex.ts  # Complex multi-phase orchestrator (qwen3.5:9b)
│   │   └── workerAgents.ts   # Code / file / vision / deploy / direct workers
│   ├── utils/
│   │   ├── router.ts         # Heuristic router (0 LLM calls)
│   │   ├── watchdog.ts       # Budget enforcement + VRAM tracking
│   │   ├── contextManager.ts # Rolling context compression + phase transitions
│   │   ├── workingMemory.ts  # In-RAM TaskRegistry
│   │   ├── researchAgents.ts # Orchestrator / researcher / reflection agents
│   │   ├── visualScoutAgent.ts # Playwright screenshot + vision analysis
│   │   ├── wayfayer.ts       # TypeScript client for Wayfarer API
│   │   ├── modelConfig.ts    # Model assignments + research depth presets
│   │   ├── researchAudit.ts  # Complete audit trail collection
│   │   └── ollama.ts         # Ollama streaming client
│   ├── components/           # React UI components
│   ├── hooks/                # useCycleLoop, useOrchestratedResearch, etc.
│   └── config/
│       └── infrastructure.ts # Central service URL config (env-var overrideable)
├── prompts/                  # Markdown prompt library
│   ├── agents/               # Per-agent system prompts
│   ├── core/                 # Identity + middle-agent prompts
│   ├── orchestration/        # Orchestrator prompts
│   ├── memory/               # Compression + memory prompts
│   ├── research/             # Research pipeline prompts
│   └── wayfayer/             # Wayfarer-specific prompts
├── wayfarer_server.py        # FastAPI server (web research proxy)
├── wayfarer.py               # Async scraping (pvlwebtools + SearXNG + Playwright)
├── docker-compose.yml        # SearXNG container
└── .env.example              # Environment variable reference
```

## Status

- **v0.1**: Complete — single-agent research + full campaign pipeline (research → objections → taste → make → test → memories)
- **v0.2**: In progress — multi-agent architecture (router, orchestrators, workers, middle agent, watchdog)
- **v0.3**: Planned — Telegram integration, scheduled tasks, RAG, Figma MCP for Make stage

---

*Built for the creative nomad. Runs locally. No data leaves your machine.*
