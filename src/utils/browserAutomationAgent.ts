/**
 * browserAutomationAgent — Wayfarer Plus stateful browser session controller.
 *
 * Flow:
 *   1. Qwen 9B planner: reads the goal and produces a step-by-step plan.
 *   2. Qwen 4B executor loop:
 *      a. POST /session/open → { sessionId }
 *      b. POST /session/action { sessionId, action, ...params } per step
 *      c. After each 'screenshot' action, run vision model on base64 image
 *      d. Decisions driven by last screenshot + page state
 *      e. POST /session/close { sessionId }
 *   3. Returns a final summary string with all findings.
 *
 * Wayfarer Plus session endpoints (all POST, JSON body):
 *   /session/open          → { sessionId: string }
 *   /session/action        → { sessionId, action, url?, selector?, text?, script?, quality? }
 *   /session/close         → { ok: boolean }
 *
 * Supported action types:
 *   navigate   — { url: string }
 *   click      — { selector: string }
 *   type       — { selector: string, text: string }
 *   scroll     — { direction?: 'down'|'up', pixels?: number }
 *   screenshot — {} → { image_base64: string, width: number, height: number }
 *   eval       — { script: string } → { result: unknown }
 */

import { ollamaService } from './ollama';
import { getModelForStage } from './modelConfig';
import { INFRASTRUCTURE } from '../config/infrastructure';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type BrowserAction =
  | 'navigate'
  | 'click'
  | 'type'
  | 'scroll'
  | 'screenshot'
  | 'eval'
  | 'evaluate'
  | 'extract_text'
  | 'find'
  | 'hover'
  | 'back'
  | 'forward'
  | 'reload';

/** Matches the Wayfarer server SessionActionRequest (snake_case) exactly. */
interface SessionActionParams {
  session_id: string;
  action: BrowserAction;
  /** CSS selector for click/find; also used as type target */
  selector?: string;
  /** URL for navigate, JS expression for evaluate/eval, text for type action */
  js?: string;
  /** Pixels to scroll (positive = down) */
  scroll_y?: number;
  /** Viewport X coordinate for click/hover (-1 = use selector) */
  click_x?: number;
  /** Viewport Y coordinate for click/hover (-1 = use selector) */
  click_y?: number;
  quality?: number;
}

interface SessionActionResult {
  ok?: boolean;
  error?: string;
  image_base64?: string;
  width?: number;
  height?: number;
  result?: unknown;
  title?: string;
  url?: string;
}

interface StepResult {
  action: BrowserAction;
  success: boolean;
  description: string;
  screenshot?: string;
  visionAnalysis?: string;
}

interface BrowserAutomationOptions {
  signal?: AbortSignal;
  onStep?: (description: string) => void;
  maxSteps?: number;
}

// ─────────────────────────────────────────────────────────────
// Wayfarer Plus HTTP helpers
// ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;

async function wayfarerPost<T>(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${INFRASTRUCTURE.wayfarerUrl}${path}`;
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }

      return (await resp.json()) as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function openSession(url: string, signal?: AbortSignal): Promise<string> {
  // Server requires url + optional viewport dims. Returns session_id (snake_case).
  const result = await wayfarerPost<{ session_id: string }>('/session/open', {
    url,
    viewport_width: 1280,
    viewport_height: 900,
  }, signal);
  if (!result.session_id) throw new Error('Wayfarer Plus did not return a session_id');
  return result.session_id;
}

async function closeSession(sessionId: string): Promise<void> {
  try {
    // Server accepts session_id as a query param on POST /session/close
    const resp = await fetch(`${INFRASTRUCTURE.wayfarerUrl}/session/close?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'POST',
    });
    if (!resp.ok) {
      // Non-fatal — best effort
    }
  } catch {
    // Best-effort — don't throw on close failure
  }
}

async function sessionAction(
  params: SessionActionParams,
  signal?: AbortSignal,
): Promise<SessionActionResult> {
  return wayfarerPost<SessionActionResult>('/session/action', params as unknown as Record<string, unknown>, signal);
}

// ─────────────────────────────────────────────────────────────
// LLM helpers
// ─────────────────────────────────────────────────────────────

/** Use vision model to analyse a base64 screenshot. */
async function analyzeScreenshot(
  imageBase64: string,
  context: string,
  signal?: AbortSignal,
): Promise<string> {
  // Qwen 3.5 vision — attach image as base64 to the prompt
  // The Ollama API accepts images via the `images` field
  let analysis = '';
  await ollamaService.generateStream(
    `Analyze this screenshot. Context: ${context}\n\nDescribe: what is visible, any relevant text, buttons, forms, errors, prices, or content that matters for the task.`,
    'Concise visual analysis. Extract actionable information only.',
    {
      model: getModelForStage('vision'),
      temperature: 0.2,
      num_predict: 400,
      signal,
      images: [imageBase64],
      onChunk: (c) => { analysis += c; },
    },
  );
  return analysis || '(no analysis)';
}

/** Planner: produce a step-by-step action plan for the goal. */
async function planSteps(
  goal: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const plannerSystemPrompt = `You are a browser automation planner.
Given a goal, output a numbered list of concrete browser actions.
Each action must be one of: navigate(url), click(selector), type(selector, text), scroll(down|up), screenshot, eval(script).
Keep steps minimal — 3 to 8 steps maximum. No explanations, just the action list.

Example for "find pricing on example.com":
1. navigate(https://example.com)
2. screenshot
3. click(a[href*="pricing"], .pricing, #pricing)
4. screenshot
5. eval(document.title)`;

  let planText = '';
  await ollamaService.generateStream(
    `Goal: ${goal}`,
    plannerSystemPrompt,
    {
      model: getModelForStage('production'),
      temperature: 0.3,
      num_predict: 400,
      signal,
      onChunk: (c) => { planText += c; },
    },
  );

  // Parse numbered list
  const steps = planText
    .split('\n')
    .filter((l) => /^\d+\.\s+/.test(l.trim()))
    .map((l) => l.replace(/^\d+\.\s+/, '').trim())
    .filter((l) => l.length > 3);

  return steps;
}

/** Friendly action shape the LLM produces (human-readable field names). */
interface LLMActionDecision {
  action: BrowserAction;
  /** URL for navigate, JS expression for evaluate, text for type */
  value?: string;
  selector?: string;
  /** Pixels to scroll — positive = down */
  scroll_pixels?: number;
  done: boolean;
  reasoning: string;
}

/** Map the LLM's friendly decision to a Wayfarer SessionActionRequest body. */
function mapToServerParams(sessionId: string, decision: LLMActionDecision): SessionActionParams {
  const base: SessionActionParams = {
    session_id: sessionId,
    action: decision.action,
    selector: decision.selector ?? '',
  };

  switch (decision.action) {
    case 'navigate':
    case 'evaluate':
    case 'eval':
    case 'type':
      // Server uses 'js' for navigate URL, eval script, and type text
      base.js = decision.value ?? '';
      break;
    case 'scroll':
      base.scroll_y = decision.scroll_pixels ?? 300;
      break;
    case 'click':
    case 'hover':
      // selector already set above; coordinates default to -1 (use selector)
      base.click_x = -1;
      base.click_y = -1;
      break;
    default:
      break;
  }

  return base;
}

/**
 * Improvement 6 & 7: Executor with visual feedback loop.
 * When a screenshot is available, it is injected as a base64 image into the LLM call
 * so the model can directly SEE the current page state (not just a text description).
 * This enables reliable navigate → screenshot → extract → act chaining.
 */
async function decideNextAction(
  goal: string,
  stepsCompleted: StepResult[],
  lastScreenshotAnalysis: string,
  remainingSteps: string[],
  signal?: AbortSignal,
  lastScreenshotBase64?: string,
): Promise<LLMActionDecision> {
  const executorSystemPrompt = `You are a browser automation executor.
Output ONLY a JSON object with this exact shape:
{
  "action": "navigate|click|type|scroll|screenshot|evaluate|extract_text|find",
  "value": "URL for navigate, JS for evaluate, text to type (omit for other actions)",
  "selector": "CSS selector for click/type/find (omit if not needed)",
  "scroll_pixels": 300,
  "done": false,
  "reasoning": "brief reason"
}
Set "done": true ONLY when the goal is fully achieved.
For navigate: set action="navigate" and value="https://url".
For type into a field: set action="type", selector="input[name=q]", value="search text".
For evaluate JS: set action="evaluate", value="document.title".
After every navigate or significant action, take a screenshot to observe the result before acting further.`;

  const historySummary = stepsCompleted
    .slice(-5)
    .map((s, i) => `${i + 1}. ${s.action}: ${s.description}`)
    .join('\n');

  // Improvement 6: include the raw screenshot image when available so the model sees the page directly
  const screenshotNote = lastScreenshotBase64
    ? 'A screenshot of the current page is attached — use it to determine what is visible.'
    : `Last screenshot analysis: ${lastScreenshotAnalysis.slice(0, 600)}`;

  const prompt = `Goal: ${goal}
${screenshotNote}
Steps done: ${historySummary || 'none'}
Planned remaining: ${remainingSteps.slice(0, 3).join(', ') || 'none'}

What is the single next browser action?`;

  let responseText = '';
  await ollamaService.generateStream(
    prompt,
    executorSystemPrompt,
    {
      model: getModelForStage('vision'),
      temperature: 0.2,
      num_predict: 300,
      signal,
      // Inject the actual screenshot image when available — the model sees the page directly
      ...(lastScreenshotBase64 ? { images: [lastScreenshotBase64] } : {}),
      onChunk: (c) => { responseText += c; },
    },
  );

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as LLMActionDecision;
    }
  } catch {
    // Fall through
  }

  // Fallback: if parsing failed, take a screenshot to re-assess
  return {
    action: 'screenshot',
    done: false,
    reasoning: 'Could not parse executor decision -- taking screenshot to re-assess',
  };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Run a full browser automation session against a goal.
 *
 * Uses Wayfarer Plus stateful session endpoints:
 *   /session/open → /session/action (loop) → /session/close
 *
 * After each screenshot, the vision model analyses the image to guide
 * the next action. The loop continues until the goal is achieved or
 * maxSteps is reached.
 *
 * @param goal     Natural-language goal (e.g. "Find all product prices on example.com").
 * @param options  abort signal, step callback, max steps.
 * @returns        Summary string with all findings.
 */
export async function runBrowserAutomation(
  goal: string,
  options: BrowserAutomationOptions = {},
): Promise<string> {
  const { signal, onStep, maxSteps = 20 } = options;
  const steps: StepResult[] = [];
  let sessionId: string | null = null;
  let lastScreenshotAnalysis = 'No screenshot yet - starting session.';

  onStep?.(`[Browser] Starting automation: "${goal.slice(0, 80)}"`);

  // Extract a start URL from the goal if present (used for session/open)
  const urlMatch = goal.match(/https?:\/\/[^\s"']+/);
  const startUrl = urlMatch ? urlMatch[0] : 'about:blank';

  try {
    // 1. Generate plan
    onStep?.('[Browser] Planning steps...');
    const plannedSteps = await planSteps(goal, signal);
    onStep?.(`[Browser] Plan: ${plannedSteps.length} steps - ${plannedSteps.slice(0, 3).join(' -> ')}`);

    // 2. Open Wayfarer Plus session (requires url, returns session_id)
    onStep?.('[Browser] Opening session...');
    sessionId = await openSession(startUrl, signal);
    onStep?.(`[Browser] Session opened: ${sessionId}`);

    const remainingPlanned = [...plannedSteps];
    let stepCount = 0;
    // Improvement 6: keep the most recent raw screenshot for visual feedback to the executor
    let lastScreenshotBase64: string | undefined;

    // 3. Executor loop
    while (stepCount < maxSteps) {
      if (signal?.aborted) break;
      stepCount++;

      // Decide next action — pass last screenshot image for visual grounding (Improvement 6)
      const decision = await decideNextAction(
        goal,
        steps,
        lastScreenshotAnalysis,
        remainingPlanned,
        signal,
        lastScreenshotBase64,
      );

      onStep?.(`[Browser] Step ${stepCount}: ${decision.action} - ${decision.reasoning}`);

      if (decision.done) {
        onStep?.('[Browser] Goal achieved - ending session');
        break;
      }

      // Remove the matched planned step if applicable
      if (remainingPlanned.length > 0) remainingPlanned.shift();

      // Map LLM decision to Wayfarer server params (snake_case)
      const actionParams = mapToServerParams(sessionId!, decision);

      // Execute action
      let result: SessionActionResult;
      try {
        result = await sessionAction(actionParams, signal);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        onStep?.(`[Browser] Action failed: ${errMsg}`);
        steps.push({ action: decision.action, success: false, description: `Failed: ${errMsg}` });
        // Continue loop - let executor decide how to recover
        continue;
      }

      // Handle screenshot - run vision analysis AND update raw image for next executor call
      let visionAnalysis: string | undefined;
      if (decision.action === 'screenshot' && result.image_base64) {
        onStep?.('[Browser] Analyzing screenshot with vision model...');
        // Improvement 6: store raw screenshot so executor can see it directly next turn
        lastScreenshotBase64 = result.image_base64;
        visionAnalysis = await analyzeScreenshot(
          result.image_base64,
          goal,
          signal,
        );
        lastScreenshotAnalysis = visionAnalysis;
        onStep?.(`[Browser] Vision: ${visionAnalysis.slice(0, 120)}...`);
      }

      const stepDescription = result.error
        ? `Error: ${result.error}`
        : visionAnalysis
          ? `Screenshot analysed: ${visionAnalysis.slice(0, 100)}`
          : `OK: ${JSON.stringify(result).slice(0, 100)}`;

      // Only keep the most recent screenshot to avoid unbounded memory growth.
      // Vision analysis text is preserved for the final summary.
      if (result.image_base64 && steps.length > 0) {
        for (const prev of steps) {
          delete prev.screenshot;
        }
      }

      steps.push({
        action: decision.action,
        success: !result.error,
        description: stepDescription,
        screenshot: result.image_base64,
        visionAnalysis,
      });

      // Improvement 7: Action sequencing — after navigate, auto-screenshot to ground next decision.
      // The screenshot base64 is stored so the executor sees the new page visually next iteration.
      if (decision.action === 'navigate' && !result.error) {
        const screenshotResult = await sessionAction(
          { session_id: sessionId!, action: 'screenshot' },
          signal,
        );
        if (screenshotResult.image_base64) {
          // Store raw image for visual grounding on next decideNextAction call
          lastScreenshotBase64 = screenshotResult.image_base64;
          const navAnalysis = await analyzeScreenshot(screenshotResult.image_base64, goal, signal);
          lastScreenshotAnalysis = navAnalysis;
          onStep?.(`[Browser] Post-navigate view: ${navAnalysis.slice(0, 100)}`);
          steps.push({
            action: 'screenshot',
            success: true,
            description: `Post-navigate: ${navAnalysis.slice(0, 100)}`,
            screenshot: screenshotResult.image_base64,
            visionAnalysis: navAnalysis,
          });
        }
      }

      // Clear the raw screenshot after non-screenshot actions — the next decideNextAction
      // will only have it if a fresh screenshot was just taken. This prevents the executor
      // from acting on stale visual state after clicks/scrolls that change the page.
      if (decision.action !== 'screenshot' && decision.action !== 'navigate') {
        lastScreenshotBase64 = undefined;
      }
    }

    // 4. Synthesize final summary
    const actionLog = steps
      .map((s, i) => `${i + 1}. ${s.action}: ${s.description}`)
      .join('\n');

    const visionFindings = steps
      .filter((s) => s.visionAnalysis)
      .map((s) => s.visionAnalysis!)
      .join('\n\n');

    const summary = [
      `[Browser Automation] Goal: ${goal}`,
      `Steps completed: ${steps.length}/${maxSteps}`,
      '',
      'Action log:',
      actionLog,
      '',
      visionFindings ? `Visual findings:\n${visionFindings}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return summary;
  } finally {
    // 5. Always close session (no signal - must close even on abort)
    if (sessionId) {
      await closeSession(sessionId);
      onStep?.('[Browser] Session closed');
    }
  }
}

/**
 * Check whether Wayfarer Plus session endpoints are available.
 * Opens a blank session and immediately closes it. Returns true on success.
 */
export async function checkWayfarerPlusAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    const sessionId = await openSession('about:blank', signal);
    await closeSession(sessionId);
    return true;
  } catch {
    return false;
  }
}
