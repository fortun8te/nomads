# Computer-Use AI Agents: Research Report

*Researched 2026-03-20. Sources: Anthropic official docs, anthropic-quickstarts source code (loop.py, computer.py, browser.py), browser-use framework, WebArena benchmark, UFO/UFO2, OpenCUA, open-computer-use, trycua/cua, OpenAdapt.*

---

## 1. How Anthropic Structures the Screenshot-Action Loop

### The Core Pattern

Anthropic's computer use is not a special protocol — it is standard tool-use. The model receives a screenshot as a base64 PNG image embedded in a `tool_result` message, reasons about what to do next, and emits a `tool_use` response with a single action. Your application executes that action and feeds the result back. This repeats until the model stops requesting tools.

```
User prompt
  → [Claude API] → tool_use: { action: "screenshot" }
  → [Your code takes screenshot] → tool_result: { image_base64: "..." }
  → [Claude API] → tool_use: { action: "left_click", coordinate: [450, 320] }
  → [Your code clicks] → tool_result: { ok: true }
  → [Claude API] → tool_use: { action: "screenshot" }  ← verify the click worked
  ...
  → [Claude API] → text response (no tool_use) ← task done
```

The loop terminates when the model's response contains no `tool_use` block, or when you hit your `max_iterations` safeguard.

### Key Implementation Details from `loop.py`

- The conversation history (`messages[]`) is the entire state: every screenshot + every action lives in there as structured message blocks.
- **Prompt caching** is injected on the 3 most recent `user` turns. When caching is active, image truncation is disabled (cached reads are cheap; breaking the cache is expensive).
- **Image truncation** (`only_n_most_recent_images`): By default, old screenshots are pruned from the message history to control token cost. Images from prior turns have diminishing value.
- **Screenshot delay** is 2.0 seconds after every action — intentional settle time before capturing the next state.
- **Thinking** (`budget_tokens`) can be enabled; thinking blocks are passed through verbatim with their `signature` field so the model can chain reasoning across turns.
- The loop has max_retries=4 on the API client and a configurable `max_iterations` guard (default example: 10, real sessions often go 20-50).

### System Prompt Pattern

Anthropic provides a canonical system prompt that establishes environment context:
- What OS / architecture the agent is in
- What applications are available
- Explicit instruction: take a screenshot after each step and verify the outcome before proceeding
- Instruction to use keyboard shortcuts when dropdowns/scrollbars are tricky
- Date injection for temporal grounding

---

## 2. The Full Action Space (All Tool Versions)

### `computer_20241022` (original)
```
screenshot, key, type, mouse_move,
left_click, left_click_drag,
right_click, middle_click, double_click,
cursor_position
```

### `computer_20250124` (Claude 4 / Sonnet 3.7)
Adds:
```
scroll           — direction: up/down/left/right, amount: N clicks
left_mouse_down  — fine drag control
left_mouse_up
hold_key         — hold a key for duration (seconds)
triple_click
wait             — pause N seconds, return screenshot
```

### `computer_20251124` (Opus 4.5+)
Adds:
```
zoom             — crop a region [x0, y0, x1, y1] from the screen at full res
                   Requires enable_zoom: true in tool definition.
                   Returns a zoomed PNG so the model can read small text.
```

Modifier keys (shift/ctrl/alt/super) can be held during any click or scroll by passing `"text": "shift"` on the action.

**Low-level vs. high-level**: Anthropic chose raw coordinate actions. The model must locate elements visually. There is no "click button X by name" — you click at pixel (450, 320). This is compensated by the `zoom` action for reading small UI details.

---

## 3. Optimal Screenshot Resolution

### Anthropic's Recommendation

**XGA (1024x768) or WXGA (1280x800)** — these are the MAX_SCALING_TARGETS in the reference implementation. You should not exceed these.

Reason: The API constrains images to 1568px on the longest edge and ~1.15 megapixels. A 1512x982 screen is downsampled to ~1330x864 before the model sees it. The model returns coordinates in the downsampled space, but your code executes clicks in the original space. Unless you handle the scaling math yourself, clicks miss their targets.

The reference implementation solves this with bidirectional coordinate scaling:
- Before sending: scale the screenshot DOWN to XGA
- Claude returns coordinates in XGA space
- Before clicking: scale coordinates UP to actual screen resolution

For resolutions smaller than XGA, the demo pads with black borders to reach exactly 1024x768.

### For the Browser-Use Demo (Playwright)
Viewport is fixed at **1920x1080**, but Claude processes images at **1456x819** (16:9 scaled down). The tool uses `CoordinateScaler` to map 1456x819 coordinates back to 1920x1080 before executing clicks.

### Key Insight: JPEG vs PNG
Anthropic's demo uses PNG (lossless). Wayfarer/our code uses JPEG quality 60-70. For coordinate accuracy, PNG is safer — JPEG artifacts can confuse the model about button edges and text. For throughput-sensitive research scraping (where you're reading text, not clicking precisely), JPEG quality 70 is an acceptable tradeoff.

---

## 4. How Edge Cases Are Handled

### Popups and Dialogs
- **Anthropic's approach**: System prompt explicitly says to ignore startup wizards (e.g., Firefox first-run). The model is trained to skip/dismiss common popups.
- **Browser-use demo**: `wait_until="domcontentloaded"` + a 2-second sleep after navigation. Popups that appear after DOM load may not be handled automatically.
- **Wayfarer (our code)**: Playwright's `page.dismiss()` and custom popup-dismissal logic in `wayfarer.py`. This is a real strength of our implementation.
- **General pattern**: Return an error in `tool_result` if an element is blocked, let the model decide how to recover.

### CAPTCHAs
- None of the reference implementations solve CAPTCHAs automatically.
- Anthropic's guidance: human-in-the-loop confirmation for consequential actions. CAPTCHAs implicitly fall into this category.
- Browser-use (commercial): mentions "stealth browser fingerprinting" in their cloud service, which is the practical solution (delay detection, not bypass).
- Open-source workarounds: use residential proxies + real user-agent + random delays between actions.
- Our code: no CAPTCHA handling. This is a hard gap for any production use.

### Dynamic Content / SPA Rendering
- Anthropic demo: fixed 2-second `_screenshot_delay` after every action. Simple but blunt.
- Browser-use demo: `wait_until="domcontentloaded"` + 2s sleep after navigate. Also not adaptive.
- Best practice (not implemented anywhere in reference code): wait for network idle (`wait_until="networkidle"`) or watch for a specific DOM selector to appear, with timeout.
- Our `browserAutomationAgent.ts`: same blunt approach — takes a screenshot after navigate and lets the vision model tell it what loaded.

### Auth Flows / Session State
- **Anthropic's approach**: Provide username + password in the system prompt inside XML tags (`<robot_credentials>`). The model reads them and types them. Cookies persist within a session via Playwright's context.
- **Browser-use demo**: Playwright context maintains cookies and localStorage automatically. The demo supports reusing a Chrome profile with existing logins.
- **Our code**: Wayfarer opens a fresh session per `session/open`. No cookie persistence across sessions. No support for reusing an existing authenticated browser profile.

### Prompt Injection from Web Content
- Anthropic added automatic classifiers that scan screenshots for prompt injection attempts. When triggered, the model is steered to ask for human confirmation before acting.
- This can be opted out of by contacting Anthropic support.
- For our use case (ad research on e-commerce sites), prompt injection risk is low but non-zero — competitor sites could theoretically embed invisible instructions.

---

## 5. Action Space: High-Level vs. Low-Level

### What the Research Shows

WebArena evaluated two approaches:
1. **Playwright actions** (high-level): `page.click("button#submit")`, `page.fill("input[name=q]", "text")` — element-targeted
2. **ID-based accessibility tree actions**: click by element ID from a parsed DOM tree — semantic

Human task success: **78.24%**. Best GPT-4 agent: **14.41%**. This gap exists regardless of action space; it is primarily a reasoning and multi-step planning problem, not an action representation problem.

### Anthropic's Practical Guidance
- Low-level (pixel coordinates) works but requires the model to have good spatial reasoning.
- High-level (DOM selectors) is more reliable for web automation specifically.
- Anthropic's **browser-use demo** uses a hybrid: pixel coordinates for clicks, but DOM `ref` IDs for form_input and scroll_to. This is the current state-of-the-art for web tasks.

### The `ref` System (Browser-Use Demo)
JavaScript generates an accessibility tree from the DOM, assigning stable `ref` identifiers to interactive elements. The model can:
- Call `read_page` to get the DOM tree with refs
- Use a ref directly in `form_input` or `scroll_to` without needing to know pixel coordinates
- Fall back to coordinate-based clicks for non-standard elements

This is significantly more reliable than pure pixel targeting, especially across different viewport sizes.

---

## 6. Spatial Awareness

### How Anthropic Gives the Model Spatial Awareness

1. **Declare display dimensions** in the tool definition: `display_width_px: 1024, display_height_px: 768`. The model knows the coordinate space.
2. **Screenshots as context**: Every screenshot is the ground truth. The model reasons about what it sees.
3. **`zoom` action** (v20251124): Crop a region to full resolution for reading small text, checking checkbox states, verifying form values.
4. **`cursor_position`**: Returns current cursor X,Y so the model can confirm where the cursor ended up.
5. **Prompt guidance**: System prompt tells the model to verify each step via screenshot.

### What's Missing
- No element labels or overlays (unlike some open-source approaches that draw numbered boxes on screenshots)
- No DOM accessibility tree injected alongside screenshots (unlike browser-use demo which combines both)
- No spatial memory across turns beyond what's in the screenshot

### Open-Source Enhancement: SOM (Set-of-Marks)
Several research projects (SeeAct, OmniAct) overlay numbered marks on screenshots for every clickable element. The model then outputs a mark number rather than coordinates. This dramatically improves targeting accuracy for dense UIs. Not in any reference implementation.

---

## 7. Latency Profile

### Per-Step Breakdown

A single iteration of the loop has this latency stack:

| Component | Typical Time |
|-----------|-------------|
| Screenshot capture (gnome-screenshot / scrot) | 200-500ms |
| Screenshot scaling (ImageMagick) | 50-200ms |
| Screenshot delay (hardcoded settle time) | 2000ms |
| Claude API call (Sonnet 4 class) | 2000-8000ms |
| Action execution (xdotool click/type) | 100-500ms |
| **Total per iteration** | **~5-10 seconds** |

Multiply by number of iterations. A simple web task (navigate, find element, extract info) takes 3-6 iterations = **15-60 seconds**. A complex multi-step task may take 20-50 iterations = **2-8 minutes**.

### Latency Optimization Techniques Used

- **Prompt caching**: Anthropic's loop caches the system prompt + recent 3 turns. Cached reads cost 10% of normal input tokens.
- **Image truncation**: Prune old screenshots when not using caching. Keep only N most recent.
- **Action batching**: System prompt encourages the model to "chain multiple function calls into one request" — e.g., type a URL and press Enter as separate actions in the same API call. In practice the model issues one action per API call.
- **Thinking budget**: Allocate only what's needed. 1024 budget_tokens adds ~1-3s latency.

### Screenshots Per Task (Research Data)
- Simple tasks (navigate + read 1 page): 3-8 screenshots
- Medium tasks (form fill, multi-page): 8-20 screenshots
- Complex tasks (multi-app, multi-session): 20-80+ screenshots
- WebArena tasks averaged ~15-25 steps for successful completions

---

## 8. Session State: Cookies, localStorage, Auth

### Playwright's Native Approach (Browser-Use Demo)
```python
self._context = await self._browser.new_context(
    viewport={"width": 1920, "height": 1080},
    user_agent="Mozilla/5.0 ..."
)
```
- Cookies persist within a context automatically
- localStorage/sessionStorage accessible via `execute_js`
- Context can be serialized with `context.storage_state()` → JSON → reload later
- Browser profiles (existing Chrome data) can be loaded: `browser.new_context(storage_state="state.json")`

### Typical Session Persistence Pattern
```python
# Save state after login
state = await context.storage_state(path="auth_state.json")

# Load state in next session
context = await browser.new_context(storage_state="auth_state.json")
```

None of the reference implementations demonstrate this. It's a known gap.

### Our `browserAutomationAgent.ts`
- Wayfarer opens a fresh Playwright session per `/session/open`
- Each session is a clean slate — no cookie persistence, no profile reuse
- localStorage is accessible via the `eval` action but not persisted

---

## 9. Open-Source Implementations Comparison

### Anthropic Computer Use Demo
- **Language**: Python
- **Backend**: xdotool + gnome-screenshot (Linux only, Xvfb)
- **Target**: Full desktop (not browser-specific)
- **Strengths**: Official reference, complete loop, prompt caching, image truncation
- **Weaknesses**: Linux-only, requires Docker, no DOM access, pure coordinate-based

### Anthropic Browser-Use Demo
- **Language**: Python + JavaScript (DOM scripts)
- **Backend**: Playwright + Chromium
- **Target**: Web only
- **Strengths**: DOM refs for reliable targeting, form_input, get_page_text, navigate, execute_js
- **Action space**: Hybrid — coordinates + semantic refs
- **Weakness**: Web-only, no desktop control

### browser-use (community framework)
- **Stars**: Very popular (~20k+)
- **Models**: Any LLM (OpenAI, Anthropic, Google, local)
- **State**: Chrome profile support, cookie persistence built-in
- **Key feature**: Action reduction — collapses low-level events into semantic operations
- **Production**: Cloud service for parallel execution, proxy rotation, fingerprint stealth

### trycua/cua (~13k stars)
- Focused on macOS sandbox environments (Apple Virtualization.Framework)
- Provides SDK for desktop control: screenshot, click at x/y, type
- Targets AI coding use cases more than general web automation

### open-computer-use (coasty-ai, 82% OSWorld)
- Docker + Ubuntu 22.04 + XFCE
- Multi-agent: Planner → Specialist agents (browser/terminal/desktop)
- Uses Selenium for browser, xdotool for desktop
- Zustand for frontend state, FastAPI + WebSocket for agent communication

### OpenCUA
- Focus: training data + model weights, not just an agent framework
- 22,600 human-annotated trajectories (AgentNet dataset)
- Action reduction: collapses raw events into semantic operations
- Reflective chain-of-thought: model explains action before executing

### UFO2 (Microsoft)
- Windows-specific, uses UIA + Win32 APIs + WinCOM
- Dual-agent: HostAgent (OS level) + AppAgent (per application)
- RAG on execution traces for recovery from errors
- Relevant if targeting Windows desktop apps specifically

### OpenAdapt
- Demo → Learn → Execute pipeline
- Records human demonstrations, trains/prompts VLMs from them
- Trajectory-conditioned: conditions VLM on recorded examples
- 100% first-action accuracy on guided tasks vs 46.7% zero-shot
- Not real-time — requires prior recording session

---

## 10. Analysis of Our `browserAutomationAgent.ts`

### What We're Doing Well
1. **Planner + Executor split**: The two-phase structure (plan then execute) is aligned with how top implementations work. OpenCUA and open-computer-use both use a planner agent.
2. **Vision model for screenshot analysis**: Injecting the raw screenshot base64 into the executor LLM call (`images: [lastScreenshotBase64]`) is the right approach. Text-only description of screenshots is significantly weaker.
3. **Auto-screenshot after navigate**: Taking a screenshot immediately after every `navigate` action mirrors Anthropic's "verify after every step" guidance.
4. **Session management**: Open/close session lifecycle with `finally` block is correct.
5. **Abort signal threading**: Full cancellation support throughout the loop.
6. **Retry logic**: `MAX_RETRIES = 2` on Wayfarer calls with exponential backoff.

### What We're Doing Differently / Worse

**1. No DOM access**
The Anthropic browser-use demo has `read_page` (DOM tree with refs), `form_input` (fill by ref), `get_page_text` (full text extraction), `execute_js` (arbitrary JS). Our agent is pure vision — it can only see what's in a screenshot. This makes form filling unreliable (typed text may go to wrong field) and text extraction lossy.

**2. CSS selector-based clicks instead of coordinates or refs**
Our `click` action takes a `selector` string and passes it to Wayfarer. This is actually a reasonable middle ground — more reliable than pixel coordinates for stable selectors. But the LLM has to *guess* CSS selectors from visual inspection, which often fails for dynamically generated class names. The browser-use demo solves this by providing a DOM tree with stable refs to the model first.

**3. No coordinate scaling**
We open sessions at 1280x900. If Wayfarer screenshots are returned at a different resolution, no scaling math is applied. Any coordinate-based click will miss. The Anthropic code is very explicit about this: you must do the scaling yourself.

**4. Planner uses CSS selector syntax in output**
The planner prompt produces steps like `click(a[href*="pricing"], .pricing, #pricing)` — a human-readable multi-option selector. The executor then has to pick one. This is fragile. Better: give the executor the DOM tree and let it choose a ref.

**5. No session state persistence**
Each `runBrowserAutomation` call starts a fresh session. No cookies carry over. For ad research tasks (e.g., checking logged-in pricing, seeing personalized content), this is a hard limitation.

**6. Screenshot only on explicit `screenshot` action**
The Anthropic demo takes a screenshot after EVERY action (with a 2s delay). Our executor only gets visual feedback when it explicitly requests a screenshot action. Between actions, it's flying blind. This increases failure rate on actions that don't produce immediately visible changes.

**7. maxSteps=20, no adaptive stopping**
Anthropic's loop terminates when the model stops using tools. Our loop terminates when the executor sets `done: true` in JSON or hits 20 steps. JSON parse failures fall back to another screenshot, which is good, but the model has no reliable way to signal task completion other than setting a JSON field correctly.

**8. No popup/modal dismissal strategy**
No pre-configured handling for cookie banners, newsletter popups, age gates. Wayfarer has some dismissal logic in the scraping path, but the stateful session path may not inherit it.

**9. Single-threaded, no parallelism**
The executor loop is strictly sequential: one action, wait, next action. Top implementations (open-computer-use, browser-use cloud) run multiple agent sessions in parallel.

**10. No zoom / detailed inspection**
We cannot crop a screen region for detailed inspection. If a price appears in 8px text, the vision model may misread it.

---

## 11. What's Missing Entirely

### Critical Gaps

| Feature | Anthropic Demo | Browser-Use Demo | Our Code |
|---------|---------------|-----------------|----------|
| DOM tree access | No | Yes (read_page + refs) | No |
| Form fill by element ID | No | Yes (form_input) | Via selector only |
| Cookie persistence | N/A (desktop) | Yes (context) | No |
| Auth profile reuse | No | Yes (storage_state) | No |
| Screenshot after every action | Yes | Yes | No (only on explicit request) |
| Coordinate scaling | Yes | Yes | No |
| Zoom / region crop | Yes (v3) | Yes | No |
| CAPTCHA handling | No | No (cloud: fingerprint) | No |
| Adaptive wait (network idle) | No | No | No |
| DOM text extraction | Bash tool | get_page_text | Via eval only |
| Popup dismissal | Prompt instruction | 2s sleep | Wayfarer (scrape path) |
| SOM (numbered element overlays) | No | No | No |
| Session recording / replay | No | No | No |
| Parallel sessions | No | No (cloud: yes) | No |

### Nice-to-Have (Research-Grade)
- **Set-of-Marks (SOM)**: Draw numbered boxes over every clickable element. Model selects a number, not coordinates. ~20-30% improvement in targeting accuracy on complex UIs.
- **Accessibility tree alongside screenshot**: Dual perception (visual + semantic). Browser-use does this.
- **Trajectory recording**: Store action sequences for replay/fine-tuning later (OpenAdapt approach).
- **Cross-session memory**: Remember what worked/failed on a given domain.

---

## 12. Fastest Path to Making Our Computer Use Actually Useful

### Priority 1 (immediate, high ROI): Screenshot After Every Action

Add a post-action screenshot to every action type, not just `screenshot`. This is the single biggest reliability improvement. Pattern from Anthropic:
```typescript
// After every action, if not already a screenshot:
if (decision.action !== 'screenshot') {
  const verify = await sessionAction({ session_id, action: 'screenshot' });
  if (verify.image_base64) lastScreenshotBase64 = verify.image_base64;
}
```

### Priority 2: Add `get_page_text` and `eval` as First-Class Data Sources

Before any interaction, extract the full page text and inject it into the executor prompt alongside the screenshot. The LLM can then use text to find prices/buttons rather than relying purely on vision. This is essentially what `get_page_text` does in the browser-use demo. Wayfarer's `/analyze-page` endpoint returns both text + screenshot — we should use this more.

### Priority 3: Coordinate Scaling

Confirm what resolution Wayfarer sessions return screenshots at. If it is not 1280x900 (the declared viewport), implement the scaling math from the Anthropic reference. A 1-2% coordinate miss causes 100% click failure rate on small buttons.

### Priority 4: DOM Refs via JavaScript Injection

Add a `read_dom` action that runs JavaScript in the session to extract interactive elements with stable identifiers (text, ARIA labels, element type). Pass this to the executor as structured data. Stop asking the LLM to guess CSS selectors.

```typescript
// New action type
case 'read_dom':
  result = await sessionAction({
    session_id, action: 'eval',
    js: `JSON.stringify([...document.querySelectorAll('a,button,input,select,textarea')]
      .map((el,i) => ({ id: i, tag: el.tagName, text: el.textContent?.slice(0,50),
        type: el.type, href: el.href, name: el.name })))`
  });
```

### Priority 5: Cookie Persistence Between Runs

Store `document.cookie` + localStorage after session close. Restore at session open. Required for any site that personalizes content or requires login.

### Priority 6: Popup Auto-Dismissal

After every navigation, inject a small JS snippet that clicks the most common popup dismiss patterns: `[aria-label="close"]`, `button.cookie-accept`, modal X buttons, etc. Run before any other action.

### Priority 7: Task-Specific System Prompts

Instead of one generic planner, write domain-specific system prompts per use case:
- `ad_research`: "You are analyzing competitor ad landing pages. Look for: price points, CTA text, headline copy, social proof elements."
- `pricing_check`: "Navigate to pricing page. Extract plan names, prices, and feature differences."

The Anthropic docs strongly recommend this: the more specific the task context, the better the model performs.

---

## 13. Reference Architecture (What Best-in-Class Looks Like)

```
User goal
  │
  ▼
Planner agent (reads goal + page context → step-by-step plan)
  │
  ▼
  ┌─────────────────────────────────────────────────────┐
  │  Executor loop                                       │
  │                                                      │
  │  1. read_dom → get element IDs                       │
  │  2. screenshot → vision perception                   │
  │  3. LLM decision (given: goal, DOM tree, screenshot, │
  │     action history, cookie state)                    │
  │  4. Execute action (click by ID, type, navigate)     │
  │  5. Auto-screenshot to verify                        │
  │  6. Dismiss popups if any appeared                   │
  │  7. Check: done? → exit | continue → back to 1       │
  └─────────────────────────────────────────────────────┘
  │
  ▼
Synthesizer agent (distills findings from action log + vision analyses)
  │
  ▼
Structured output (prices, copy, CTAs, etc.)
```

This matches what the Anthropic browser-use demo + open-computer-use implementations do. Our code has most of the outer structure but is missing steps 1 (DOM read), 5 (auto verify screenshot), and 6 (popup dismissal).

---

## Sources

- Anthropic official docs: `https://platform.claude.com/docs/en/docs/build-with-claude/computer-use`
- `computer.py`: `https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/computer_use_demo/tools/computer.py`
- `loop.py`: `https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/computer_use_demo/loop.py`
- `browser.py`: `https://github.com/anthropics/anthropic-quickstarts/blob/main/browser-use-demo/browser_use_demo/tools/browser.py`
- browser-use framework: `https://github.com/browser-use/browser-use`
- WebArena paper: `https://arxiv.org/abs/2307.13854`
- UFO2: `https://github.com/microsoft/UFO`
- OpenCUA: `https://github.com/xlang-ai/OpenCUA`
- open-computer-use (82% OSWorld): `https://github.com/coasty-ai/open-computer-use`
- trycua/cua: `https://github.com/trycua/cua`
- OpenAdapt: `https://github.com/OpenAdaptAI/OpenAdapt`
- Our code: `/Users/mk/Downloads/nomads/src/utils/browserAutomationAgent.ts`
