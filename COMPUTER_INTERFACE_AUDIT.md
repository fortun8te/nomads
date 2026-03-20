# Computer / Browser Control Interface — Audit Report

**Date:** 2026-03-20
**Scope:** `src/utils/browserAutomationAgent.ts`, `src/utils/agentEngine.ts` (`use_computer` + `browse` + `browser_screenshot` tools), `src/components/AgentPanel.tsx` (display layer), `wayfarer_server.py` (backend session API), `wayfarer.py` (text scraping base)

---

## 1. Current Capabilities

### Backend (`wayfarer_server.py`) — what the server actually supports

| Session Action | Endpoint | Notes |
|---|---|---|
| `navigate` | `POST /session/action` | Navigates, dismisses popups, auto-screenshots, returns `current_url` + `title` |
| `click` | `POST /session/action` | CSS selector OR (x, y) coordinates |
| `hover` | `POST /session/action` | Coordinates only (selector not supported) |
| `type` | `POST /session/action` | `keyboard.type()` — no selector focus step built in |
| `keypress` | `POST /session/action` | Special keys: Enter, Tab, Escape, Backspace |
| `scroll` | `POST /session/action` | Pixel-based `window.scrollBy`, auto-screenshots after |
| `screenshot` | `POST /session/action` | Returns `image_base64` + `scroll_y` + `page_height` |
| `evaluate` | `POST /session/action` | Arbitrary JS, returns result, NO screenshot |
| `extract_text` | `POST /session/action` | Title + H1 + meta description + 8000 chars body text |
| `find` | `POST /session/action` | CSS selector → array of `{tag, text, href, rect}` for up to 20 elements |
| `back` | `POST /session/action` | Browser history back, auto-screenshots |
| `forward` | `POST /session/action` | Browser history forward, auto-screenshots |
| `reload` | `POST /session/action` | Full page reload, dismisses popups, auto-screenshots |
| Open session | `POST /session/open` | Launches page, returns initial screenshot + `session_id` |
| Close session | `POST /session/close` | Query param `?session_id=` |

**Standalone endpoints (stateless):**
- `POST /screenshot` — single URL screenshot
- `POST /screenshot/batch` — multiple URLs, concurrency 3
- `POST /analyze-page` — text + screenshot combo
- `GET /smart-screenshot` — screenshot with custom popup-dismissal JS
- `POST /research` — web search + scrape via SearXNG
- `POST /batch` — parallel research queries

### TypeScript agent tools (`agentEngine.ts`)

| Tool | Description |
|---|---|
| `use_computer` | Full Wayfarer Plus session loop (plan → execute → vision feedback) |
| `browse` | URL + goal → Wayfarer Plus session or scrape fallback |
| `browser_screenshot` | Navigate + vision description of a URL |
| `scrape_page` | Text extraction only, no interaction |
| `analyze_page` | Screenshot + text in one call |
| `web_search` | SearXNG → Wayfarer research → text summary |

### LLM-driven executor actions (`browserAutomationAgent.ts`)

The LLM executor can decide: `navigate`, `click`, `type`, `scroll`, `screenshot`, `evaluate`, `extract_text`, `find`, `hover`, `back`, `forward`, `reload`.

---

## 2. Bugs

### BUG-01 — `browserScreenshot` field is declared but never populated (CRITICAL)

**Files:** `AgentPanel.tsx` lines 117, 1058–1060, 1091–1092

The `StepCard` interface has a `browserScreenshot?: string` field. The browser thumbnail UI at line 1058 renders an `<img>` from it. The sticky progress bar at line 1091 looks for it. **But there is no code path anywhere in AgentPanel that ever assigns a value to this field.** The `tool_done` handler (lines 2200–2243) only updates `actions` and `entries`. The `tool_start` handler (lines 2162–2198) only sets `browserUrl`.

Result: the screenshot thumbnail in every step card is permanently blank. The sticky progress bar's `browserThumb` is always `null`. The UI elements for displaying screenshots exist but are entirely dead.

**Root cause:** When `tool_done` fires for `browse`, `browser_screenshot`, or `use_computer`, the screenshot base64 from `result.data` is never extracted and written into `updateCurrentStep({ browserScreenshot: ... })`.

---

### BUG-02 — `type` action does not focus the target element before typing

**File:** `wayfarer_server.py` lines 546–555

The `type` action calls `page.keyboard.type(req.js, delay=30)` which types into whatever element currently has focus. It ignores the `selector` field entirely. If the LLM decides to type into `input[name=email]`, the text goes nowhere useful unless focus happens to already be on that element. This will cause silent wrong-element typing failures in form fill scenarios.

**Fix needed:** The action should call `page.click(req.selector)` (or `page.focus(req.selector)`) before calling `page.keyboard.type()` when a selector is provided.

---

### BUG-03 — `navigate` field name discrepancy between client and server

**Files:** `browserAutomationAgent.ts` line 262, `wayfarer_server.py` line 494

The server comment in `browserAutomationAgent.ts` (lines 14–17) says `/session/action` accepts `url?` as a field name. The actual `SessionActionParams` TypeScript interface uses `js` for the navigate URL (line 58). The server also reuses `js` for navigate URL (line 495: `if not req.js`). The doc comment is wrong, which will confuse anyone extending this. More importantly, the executor system prompt (lines 288–301) tells the LLM to set `value="https://url"` for navigate, but `mapToServerParams` correctly maps this to `base.js`. This chain works but is extremely fragile — any LLM that sets `url` instead of `value` will silently navigate to nothing.

---

### BUG-04 — `use_computer` screenshots are never surfaced to the LLM or the UI during execution

**File:** `agentEngine.ts` lines 800–815

`runBrowserAutomation` is called with only `onStep` (a string logger). The function internally runs a vision loop (analyzeScreenshot → `lastScreenshotAnalysis`) but the actual `image_base64` data from each step is discarded — the final `return` is a text summary string only (`data: { goal, startUrl, steps: stepLog.length }`). The calling `use_computer` tool returns `{ success, output: result, data: { goal, startUrl, steps } }`. There is no `image_base64` in `data`.

As a result:
1. The LLM calling `use_computer` only sees a text summary after the entire session ends — it cannot observe intermediate screenshots.
2. The UI `tool_done` handler has no screenshot to display even if it wanted to.
3. The vision feedback loop exists inside `browserAutomationAgent.ts` but is entirely invisible to the outer agent loop.

---

### BUG-05 — Old screenshots are actively deleted during the session loop

**File:** `browserAutomationAgent.ts` lines 452–456

```typescript
if (result.image_base64 && steps.length > 0) {
  for (const prev of steps) {
    delete prev.screenshot;
  }
}
```

This runs on every screenshot action, deleting all previous screenshots from prior steps. This means the final summary at lines 488–509 includes only the very last screenshot in `StepResult[]`. If someone wanted to expose intermediate page states to the UI or return them for further analysis, this mutation prevents it.

---

### BUG-06 — Session open returns `image_base64` for the initial page load, but the client ignores it

**Files:** `wayfarer_server.py` lines 371–387, `browserAutomationAgent.ts` lines 136–145

`POST /session/open` returns a full `image_base64` of the initial page state. The `openSession()` function in the TypeScript client only extracts `session_id` and throws away the screenshot, title, and current_url. This is a missed opportunity — the agent could observe the landing page before deciding its first action.

---

### BUG-07 — `browse` tool's `browserUrl` is set at `tool_start` but only reads `args.url` or `args.start_url`

**File:** `AgentPanel.tsx` line 2168

```typescript
const url = isBrowser ? String(tc.args.url || tc.args.start_url || '') : undefined;
```

`use_computer` uses `start_url` as its parameter name. `browse` uses `url`. `browser_screenshot` uses `url`. This works. However the URL shown in the browser chip while `use_computer` is running is only the **starting** URL — it never updates as the session navigates through pages. The UI shows a static starting URL even after the agent has navigated many pages deep.

---

### BUG-08 — Session idle reaper shares a single context across all sessions

**File:** `wayfarer_server.py` lines 22–23, 46–50

```python
_context = None  # Persistent context for page reuse
```

All sessions share one persistent Playwright `BrowserContext`. This means cookies, localStorage, and authentication state from one session leak into the next. If session A logs into a site, session B in the same context will inherit that login. There is no context-level isolation between concurrent or sequential sessions.

---

### BUG-09 — `checkWayfarerPlusAvailable` opens a real session to `about:blank` on every tool call

**Files:** `agentEngine.ts` lines 244–246, 344–346, `browserAutomationAgent.ts` lines 523–530

The `browse`, `browser_screenshot`, and `use_computer` tools each call `checkWayfarerPlusAvailable()` before using the session API. This function opens a real Playwright page to `about:blank`, then closes it — a full round-trip per availability check. With three browser-related tools and the check happening on every call, this adds ~200–500ms of latency per tool invocation and generates unnecessary session churn.

---

### BUG-10 — `hover` action requires coordinates but the LLM executor prompt never teaches coordinate usage

**Files:** `wayfarer_server.py` lines 447–454, `browserAutomationAgent.ts` lines 288–301

The executor system prompt teaches `click(selector)` and `evaluate(script)` patterns but never mentions that hover requires numeric `click_x`/`click_y` coordinates. The LLM will attempt `hover` with a selector, the server returns `{"error": "coordinates required for hover"}`, and the executor loop treats this as a recoverable error and takes a screenshot to re-assess — spending an extra LLM call and browser round-trip on a predictable failure.

---

### BUG-11 — `evaluate` and `extract_text` return no screenshot, breaking the vision feedback loop

**File:** `wayfarer_server.py` lines 456–492

After an `evaluate` or `extract_text` action, `image_base64` is `""` in the response. In `browserAutomationAgent.ts` line 433:

```typescript
if (decision.action === 'screenshot' && result.image_base64) {
```

The vision analysis only runs on explicit `screenshot` actions. After an `evaluate` call, `lastScreenshotAnalysis` is stale — the LLM executor will make its next decision based on the page state from whenever it last took a screenshot, which may be several actions ago.

---

### BUG-12 — Plan parsing is brittle: non-numbered plan text silently returns zero steps

**File:** `browserAutomationAgent.ts` lines 227–233

If the planner model returns steps in any format other than `1. action`, `2. action`, etc. (e.g., with leading spaces, bullet points, or a preamble paragraph), the regex `/^\d+\.\s+/` matches zero lines and `plannedSteps` is empty. The executor then runs with `remainingPlanned = []`, so the `decideNextAction` context shows `"Planned remaining: none"` from step 1 — the plan is completely ignored. No error is logged.

---

### BUG-13 — `sandboxService.navigate` is called in the `browse` fallback path but the sandbox service may not relate to Playwright at all

**File:** `agentEngine.ts` lines 259–269

In `browse`'s fallback chain (when Wayfarer Plus is unavailable), the code calls `sandboxService.navigate(url)` followed by `runPlanAct(goal, ...)`. This appears to use a different browser sandbox system entirely. If both Wayfarer Plus and the sandbox are unavailable, it falls through to `screenshotService.analyzePage(url)` — a stateless scrape with no interaction. The user gets no warning that the goal (which may require clicking) will not be fulfilled.

---

## 3. Missing Features (Prioritized)

### HIGH

**MF-01 — Screenshot visibility in chat (closes BUG-01 + BUG-04)**
The single highest-impact change. Wire `tool_done` to extract `event.toolCall.result.data?.image_base64` and call `updateCurrentStep({ browserScreenshot })`. Add an event type `screenshot_ready` in `agentEngine.ts` to pass screenshots out of the `runBrowserAutomation` loop mid-session via `onEvent` rather than only at the end.

**MF-02 — Real-time URL tracking during session**
The `onStep` callback in `runBrowserAutomation` fires string messages. Extend it to pass structured updates: `{ url: string, screenshot?: string, action: string }`. AgentPanel can then update `step.browserUrl` live as the agent navigates.

**MF-03 — Click-on-screenshot UI (coordinate click)**
The server already supports `click_x`/`click_y` coordinate clicks (wayfarer_server.py line 425–434). The missing piece is a UI in AgentPanel where the user can click on a displayed screenshot thumbnail to issue a coordinate click to the live session. This enables human-in-the-loop browser control.

**MF-04 — Type-into-field: click-before-type fix (closes BUG-02)**
The `type` action must focus the target element. The server needs to call `page.click(selector)` before `page.keyboard.type()` when `selector` is non-empty. This makes form filling actually work.

**MF-05 — Auth/cookie session persistence**
Provide a `session_profile` concept: a named Playwright storage state (`page.context().storage_state()`) that can be saved to disk and reloaded. This enables "log into site X once, reuse credentials across sessions" without re-authenticating every time. Currently all auth state is lost when a session closes (except the shared-context leak in BUG-08).

### MEDIUM

**MF-06 — DOM element inspection tool**
A new `inspect_element` action that takes a selector and returns computed styles, ARIA attributes, bounding box, visibility status, and the element's full HTML. Essential for debugging why a click doesn't work and for building reliable selectors.

**MF-07 — Multi-step macro recording**
Record a sequence of browser actions (navigate, click, type, submit) and save it as a named macro to workspace. Replay with `run_macro`. Useful for repetitive login flows or form submissions.

**MF-08 — File download handling**
Playwright supports intercepting downloads. Add a `download` action or a route handler in the session that captures downloaded files to `~/Documents/Nomad Agent/downloads/`. Pair with `sandbox_pull` to move into workspace. Currently there is no way for the agent to download files from the browser.

**MF-09 — PDF generation from page**
Add `POST /session/pdf` that calls `page.pdf()` (Chromium only). Returns a base64 PDF. Useful for generating PDFs of web-rendered content (reports, receipts, invoices). Playwright supports this natively.

**MF-10 — Network request inspection**
Add `POST /session/network` that returns the last N network requests/responses for the page. Useful for finding hidden APIs (e.g., a site loads product prices via an XHR that is easier to call directly than scraping the DOM).

**MF-11 — Wait-for-selector / wait-for-navigation**
Add a `wait` action to `SessionActionRequest`: `{"action": "wait", "selector": ".checkout-complete", "timeout": 5000}`. Currently the executor must guess sleep times or take blind screenshots hoping content has loaded.

**MF-12 — Context isolation between sessions (closes BUG-08)**
Create a new `BrowserContext` per session (with `browser.new_context()`) rather than sharing `_context` globally. Optionally accept a `storage_state` path in `SessionOpenRequest` to pre-seed auth.

### LOW

**MF-13 — Live browser panel (side-by-side with chat)**
A resizable pane in the AgentPanel layout that shows a live-updating MJPEG or polling screenshot stream. The session backend would serve `GET /session/{id}/stream` as periodic JPEG frames. The frontend polls every 500ms while a session is active.

**MF-14 — Step-by-step action history display**
Instead of the current single-URL chip, show a vertical timeline of actions taken within a `use_computer` session: each action as a row with action type, selector/URL, result status, and a thumbnail. Collapsible by default.

**MF-15 — Accessibility tree extraction**
Add `extract_accessibility` action that calls `page.accessibility.snapshot()`. Returns a structured ARIA tree — more reliable than CSS selectors for dynamic pages and provides richer context for the vision model.

**MF-16 — Proxy / stealth mode option**
Some target sites block headless Chromium. Add optional `stealth: true` to `SessionOpenRequest` that loads playwright-extra's stealth plugin. Expose this as a `use_computer` parameter.

**MF-17 — Viewport screenshot grid for tall pages**
Add a `screenshot_full` action that tiles the full page height into strips (scroll + screenshot × N) and returns all strips. The vision model can then analyze the full page content rather than just the visible viewport.

---

## 4. UI Gaps

### Current state

- **Browser chip:** Shows only `step.browserUrl` (the starting URL), a truncated label, and an "open" link. Screenshot area (`step.browserScreenshot`) is always empty due to BUG-01.
- **Sticky progress bar:** Has `browserThumb` logic but it is always `null` (BUG-01).
- **Action pill:** Shows tool name and truncated args. Result shown as 500-char text clip after completion. No visual differentiation for browser tools vs file tools.
- **No live feedback:** The user sees nothing between `use_computer` firing and the final text result returning. The session can take 30–120 seconds with zero visual output.

### Recommended UI layout

**1. Inline screenshot strip (highest value, low implementation cost)**
In the step card browser chip, as each screenshot becomes available during session execution, append it as a horizontal strip below the URL bar. Each strip is `max-height: 120px`, `objectFit: cover`, and clicking it opens a full-size lightbox. Labels show the action that produced it (`navigate`, `click .btn-checkout`, etc.).

```
┌─────────────────────────────────────────────────┐
│ 🌐 example.com/checkout                    open  │
│ [navigate] ──────────────────────────────────── │
│ [thumbnail: product page, 160px tall]           │
│ [click .add-to-cart] ───────────────────────── │
│ [thumbnail: cart page, 160px tall]              │
│ [type input[name=email]] ───────────────────── │
│ [thumbnail: form filled, 160px tall]            │
└─────────────────────────────────────────────────┘
```

**2. Action timeline (medium cost)**
Replace the single action pill for `use_computer` with an expandable action list. Collapsed: shows `N steps completed` with a progress bar. Expanded: each action on its own row with status dot (pending / active / done / error), action type badge, selector/URL preview, and elapsed time.

**3. Live browser panel (high cost, highest power)**
Add an optional collapsible right panel (similar to the existing workspace file tree) that shows a continuously updating screenshot of the active session. The panel header shows the current URL, back/forward buttons, and a stop button. The user can click on the screenshot to inject a coordinate click into the session. This makes the agent feel like a shared browser rather than a black box.

---

## 5. Quick Wins (implementable in one agent session)

Listed in order of impact vs. effort:

**QW-01 — Wire `browserScreenshot` in `tool_done` handler**
In `AgentPanel.tsx` around line 2207, when `tcName` is in `['browse', 'use_computer', 'browser_screenshot', 'analyze_page']`, extract `event.toolCall?.result?.data?.image_base64` and call `updateCurrentStep(s => ({ ...s, browserScreenshot: base64 }))`. This immediately makes the existing thumbnail UI functional. Zero backend changes needed.

**QW-02 — Fix `type` action to focus element before typing**
In `wayfarer_server.py` at the `elif req.action == "type":` block, add `await page.click(req.selector)` (with a guard for non-empty selector) before `await page.keyboard.type(...)`. This makes form filling work. Minimal change, high reliability impact.

**QW-03 — Pass initial screenshot from `session/open` into the vision context**
In `browserAutomationAgent.ts` `openSession()`, extend the return type to include `image_base64`. In `runBrowserAutomation`, immediately run `analyzeScreenshot()` on it to populate `lastScreenshotAnalysis`. This eliminates the first `screenshot` action entirely and improves first-action decision quality.

**QW-04 — Cache `checkWayfarerPlusAvailable` result for 30 seconds**
Module-level variable: `let _wayfarerPlusCache: { available: boolean; expiresAt: number } | null = null`. Check cache before opening a test session. This removes the 200–500ms latency tax on every `browse` / `use_computer` / `browser_screenshot` call.

**QW-05 — Add `browserUrl` update on `tool_done` for navigate actions**
In the `tool_done` handler, if the tool result `output` text includes `"navigated to https://..."` (from the navigate action's result string), extract the URL and update `step.browserUrl`. This makes the URL chip track the current page rather than being frozen at the start URL.

**QW-06 — Emit live `onStep` screenshots to UI via a new event type**
In `agentEngine.ts`, add `screenshot_ready` to `AgentEngineEventType`. In `runBrowserAutomation`, extend `BrowserAutomationOptions.onStep` to accept structured objects in addition to strings. When a screenshot action completes, call `onEvent({ type: 'screenshot_ready', data: { base64, url } })`. In `AgentPanel.tsx`, handle this event by appending to `step.browserScreenshot`. This gives live visual feedback during long sessions.

---

## Summary

The core browser automation loop is architecturally sound: Playwright sessions are real, the vision feedback chain works internally, and the server handles all the important action types. The primary failure mode is that **all screenshots are trapped inside `browserAutomationAgent.ts`** and never escape to the UI or the calling agent. Fix BUG-01 (QW-01) and everything else becomes visible.

The second class of issues is reliability: the `type` action without focus (BUG-02), stale vision context after `evaluate` (BUG-11), shared browser context leaking auth (BUG-08), and the brittle plan parser (BUG-12). These cause silent wrong-behavior rather than hard errors.

The UI currently has the structural elements for a great browser-session display (chips, thumbnails, progress bar) but they are all dormant waiting for data that is never piped to them.
