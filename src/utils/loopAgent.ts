/**
 * Loop Agent — Plan-Act-Observe-Evaluate state machine for browser automation.
 *
 * State machine: IDLE → PLANNING → ACTING → OBSERVING → EVALUATING → DONE/ERROR/REPLANNING
 *
 * Differences from runPlanAct (which this complements):
 *   - Finer-grained state machine with explicit OBSERVING + EVALUATING phases
 *   - Per-iteration replanning (not every N steps) — driven by stuck-detection
 *   - Configurable via LoopAgentConfig instead of positional args
 *   - onStateChange + onAction callbacks for rich UI integration
 *   - Abort signal checked at every async boundary
 *   - 15s per-action timeout enforced
 *
 * runPlanAct (planActAgent.ts) is kept intact for backward compatibility.
 * This module exports runLoopAgent as the new preferred entry point.
 */

import { ollamaService } from './ollama';
import { getPlannerModel, getExecutorModel } from './modelConfig';
import { machinePool } from './sandboxService';
import type { ViewResult } from './sandboxService';
import { extractAccessibilityTree, formatTreeForPlanner } from './domExtractor';
import { checkPageReadiness, waitForReady } from './pageReadiness';
import { ensurePageClear } from './popupDismisser';

// ── State Machine ──

export type LoopState =
  | 'idle'
  | 'planning'
  | 'acting'
  | 'observing'
  | 'evaluating'
  | 'replanning'
  | 'done'
  | 'error';

// ── Action / Result Types ──

export interface AgentAction {
  action:
    | 'click'
    | 'type'
    | 'fill_field'
    | 'scroll_down'
    | 'scroll_up'
    | 'navigate'
    | 'press_key'
    | 'back'
    | 'extract'
    | 'done';
  /** Element index (from accessibility tree) */
  index?: number;
  /** Text to type / value for fill_field */
  value?: string;
  /** URL for navigate */
  target?: string;
  /** Key name for press_key */
  key?: string;
  /** Human-readable reason / description */
  reason?: string;
}

export interface ActionResult {
  ok: boolean;
  output: string;
  /** ISO timestamp */
  timestamp: string;
  /** Duration in ms */
  durationMs: number;
}

// ── Context ──

export interface LoopContext {
  goal: string;
  /** Ordered plan steps (may be revised mid-run) */
  plan: string[];
  currentStep: number;
  completedSteps: string[];
  actionHistory: Array<{ action: AgentAction; result: ActionResult }>;
  iteration: number;
  replanCount: number;
  /** Last screenshot captured (raw base64, no data: prefix) */
  lastScreenshot?: string;
  pageTitle?: string;
  pageUrl?: string;
}

// ── Config ──

export interface LoopAgentConfig {
  goal: string;
  /** Maximum loop iterations (default: 20) */
  maxIterations?: number;
  /** Maximum times the agent may replan (default: 3) */
  maxReplans?: number;
  /** Overall timeout in ms (default: 120 000) */
  timeoutMs?: number;
  /** Planning model — defaults to configured planner model (qwen3.5:4b) */
  model?: string;
  /** Abort signal — checked at every async boundary */
  signal?: AbortSignal;
  /** Called whenever the state machine transitions */
  onStateChange?: (state: LoopState, context: LoopContext) => void;
  /** Called after every action with the result */
  onAction?: (action: AgentAction, result: ActionResult) => void;
  /** Called when a fresh screenshot is available */
  onScreenshot?: (base64: string, url: string) => void;
}

// ── Result ──

export interface LoopResult {
  success: boolean;
  finalState: LoopState;
  completedSteps: string[];
  totalIterations: number;
  totalActions: number;
  summary: string;
  error?: string;
}

// ── Internal helpers ──

const ACTION_TIMEOUT_MS = 15_000;

function abortedOrTimedOut(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

/** Abort-aware sleep */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Wrap a promise with a per-action timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.then(
      (v) => { clearTimeout(timerId); return v; },
      (e) => { clearTimeout(timerId); throw e; },
    ),
    new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error(`Action timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/** Get enriched element list from accessibility tree, with fallback */
async function getElements(viewResult: ViewResult): Promise<string> {
  const sb = machinePool.getDefault();
  try {
    const tree = await extractAccessibilityTree();
    if (tree.elements.length > 0) {
      return formatTreeForPlanner(tree);
    }
  } catch {
    // silently fall through to basic elements
  }
  return sb.formatElements(viewResult.elements);
}

// ── Planner ──

const LOOP_PLANNER_SYSTEM = `You are a precise web automation planner.
Given a goal and the current page state, output an ordered list of steps to accomplish the goal.
Be specific: reference exact button text, field labels, and URLs.
Output JSON only — no markdown, no prose.
Format: {"steps": ["Step 1 description", "Step 2 description", ...]}`;

async function buildPlan(
  goal: string,
  pageTitle: string,
  pageUrl: string,
  elements: string,
  pageText: string,
  history: string,
  model: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (abortedOrTimedOut(signal)) return [goal];

  const prompt = [
    `GOAL: ${goal}`,
    `PAGE: "${pageTitle}" [${pageUrl}]`,
    elements ? `VISIBLE ELEMENTS:\n${elements.slice(0, 2000)}` : '',
    pageText ? `PAGE TEXT:\n${pageText.slice(0, 1000)}` : '',
    history ? `HISTORY:\n${history}` : '',
    'Create a concise, ordered plan.',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  await ollamaService.generateStream(prompt, LOOP_PLANNER_SYSTEM, {
    model,
    temperature: 0.3,
    num_predict: 400,
    signal,
    onChunk: (c: string) => { raw += c; },
  });

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [goal];

  try {
    const parsed = JSON.parse(match[0]);
    const steps: string[] = parsed.steps ?? [];
    return steps.length > 0 ? steps : [goal];
  } catch {
    return [goal];
  }
}

// ── Action Planner ──

const LOOP_ACTOR_SYSTEM = `You are a precise browser executor. Output ONE action as JSON.
Format: {"action":"click","index":3,"reason":"Click the Search button"}

Actions:
- click: {"action":"click","index":N,"reason":"..."}
- type: {"action":"type","index":N,"value":"text to type","reason":"..."}
- fill_field: {"action":"fill_field","index":N,"value":"text","reason":"..."}
- scroll_down: {"action":"scroll_down","reason":"..."}
- scroll_up: {"action":"scroll_up","reason":"..."}
- navigate: {"action":"navigate","target":"https://...","reason":"..."}
- press_key: {"action":"press_key","key":"Enter","reason":"..."}
- back: {"action":"back","reason":"..."}
- extract: {"action":"extract","reason":"Extract information from the page"}
- done: {"action":"done","reason":"Goal accomplished"}

Rules:
- If the target element is visible, act NOW — do not scroll first.
- Never click disabled or hidden elements.
- Do not scroll more than 3 times in a row without clicking something.
- Output ONLY the JSON object. No markdown, no prose.`;

async function planNextAction(
  step: string,
  pageTitle: string,
  pageUrl: string,
  elements: string,
  pageText: string,
  recentHistory: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentAction> {
  if (abortedOrTimedOut(signal)) {
    return { action: 'done', reason: 'Aborted' };
  }

  const prompt = [
    `CURRENT STEP: ${step}`,
    `PAGE: "${pageTitle}" [${pageUrl}]`,
    elements ? `VISIBLE ELEMENTS:\n${elements}` : 'No interactive elements found.',
    pageText ? `TEXT:\n${pageText.slice(0, 800)}` : '',
    recentHistory ? `RECENT ACTIONS:\n${recentHistory}` : '',
    'Output ONE action as JSON.',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  await ollamaService.generateStream(prompt, LOOP_ACTOR_SYSTEM, {
    model,
    temperature: 0.1,
    num_predict: 100,
    signal,
    onChunk: (c: string) => { raw += c; },
  });

  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) {
    return { action: 'scroll_down', reason: 'Parse failed — scrolling to find target' };
  }

  try {
    return JSON.parse(match[0]) as AgentAction;
  } catch {
    if (raw.toLowerCase().includes('done')) return { action: 'done', reason: 'Step complete' };
    return { action: 'scroll_down', reason: 'Parse error — scrolling' };
  }
}

// ── Evaluator ──

const LOOP_EVALUATOR_SYSTEM = `You are a progress evaluator for a browser automation agent.
Given the goal, completed steps, and latest page state, decide:
1. Is the goal DONE?
2. Is the agent STUCK (looping without progress)?
3. Should it CONTINUE with the current plan?

Output JSON only:
{"done": true|false, "stuck": true|false, "continue": true|false, "reason": "brief explanation"}`;

interface Evaluation {
  done: boolean;
  stuck: boolean;
  continueLoop: boolean;
  reason: string;
}

async function evaluate(
  context: LoopContext,
  pageTitle: string,
  pageUrl: string,
  pageText: string,
  model: string,
  signal?: AbortSignal,
): Promise<Evaluation> {
  if (abortedOrTimedOut(signal)) {
    return { done: false, stuck: false, continueLoop: false, reason: 'Aborted' };
  }

  const recentActions = context.actionHistory
    .slice(-5)
    .map(h => `${h.action.action}: ${h.action.reason || ''} → ${h.result.output}`)
    .join('\n');

  const prompt = [
    `GOAL: ${context.goal}`,
    `PLAN STEPS: ${context.plan.join(' | ')}`,
    `COMPLETED: ${context.completedSteps.join(', ') || 'none'}`,
    `CURRENT STEP: ${context.plan[context.currentStep] ?? '(end of plan)'}`,
    `PAGE: "${pageTitle}" [${pageUrl}]`,
    pageText ? `PAGE TEXT:\n${pageText.slice(0, 600)}` : '',
    recentActions ? `RECENT ACTIONS:\n${recentActions}` : '',
    `ITERATION: ${context.iteration}`,
    'Evaluate: done? stuck? continue?',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  await ollamaService.generateStream(prompt, LOOP_EVALUATOR_SYSTEM, {
    model,
    temperature: 0.1,
    num_predict: 120,
    signal,
    onChunk: (c: string) => { raw += c; },
  });

  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) {
    return { done: false, stuck: false, continueLoop: true, reason: 'Evaluation parse failed' };
  }

  try {
    const parsed = JSON.parse(match[0]);
    return {
      done: parsed.done ?? false,
      stuck: parsed.stuck ?? false,
      continueLoop: parsed.continue ?? true,
      reason: parsed.reason ?? '',
    };
  } catch {
    return { done: false, stuck: false, continueLoop: true, reason: 'Evaluation JSON invalid' };
  }
}

// ── Action Executor ──

async function executeAction(action: AgentAction): Promise<string> {
  const sb = machinePool.getDefault();

  switch (action.action) {
    case 'click':
      if (action.index != null) {
        await sb.click(action.index);
        await waitForReady({ timeout: 5000, minScore: 60 });
        return `Clicked element [${action.index}]`;
      }
      return 'click: no index provided';

    case 'type':
      if (action.index != null && action.value) {
        await sb.input(action.index, action.value, false);
        return `Typed "${action.value}" into element [${action.index}]`;
      }
      return 'type: missing index or value';

    case 'fill_field':
      if (action.index != null && action.value) {
        // Clear existing value then type new value
        await sb.consoleExec(
          `(function(){var el=document.querySelectorAll('[data-idx="${action.index}"]')[0]||document.querySelectorAll('input,textarea,select')[${action.index}];if(el){el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));}})()`
        );
        await sb.input(action.index, action.value, false);
        return `Filled element [${action.index}] with "${action.value}"`;
      }
      return 'fill_field: missing index or value';

    case 'scroll_down':
      await sb.scroll('down', 500);
      return 'Scrolled down';

    case 'scroll_up':
      await sb.scroll('up', 500);
      return 'Scrolled up';

    case 'navigate':
      if (action.target) {
        await sb.navigate(action.target);
        await waitForReady({ timeout: 8000, minScore: 70 });
        try { await ensurePageClear(); } catch { /* best-effort popup dismiss */ }
        return `Navigated to ${action.target}`;
      }
      return 'navigate: no target URL';

    case 'press_key':
      if (action.key) {
        await sb.consoleExec(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'${action.key}',bubbles:true}))`);
        return `Pressed key ${action.key}`;
      }
      return 'press_key: no key specified';

    case 'back':
      await sb.back();
      await waitForReady({ timeout: 5000, minScore: 60 });
      return 'Navigated back';

    case 'extract': {
      // Capture visible page text as the "extracted" output
      const view = await sb.view();
      return `Extracted: ${(view.pageText || '').slice(0, 500)}`;
    }

    case 'done':
      return 'Goal accomplished';

    default:
      return `Unknown action: ${(action as AgentAction).action}`;
  }
}

// ── Main Entry Point ──

/**
 * runLoopAgent — the new preferred plan-act loop.
 *
 * Runs a PLANNING → ACTING → OBSERVING → EVALUATING cycle until the goal
 * is met, max iterations reached, or the abort signal fires.
 *
 * This is additive — it does not replace runPlanAct. Both are exported.
 */
export async function runLoopAgent(config: LoopAgentConfig): Promise<LoopResult> {
  const {
    goal,
    maxIterations = 20,
    maxReplans = 3,
    timeoutMs = 120_000,
    signal,
    onStateChange,
    onAction,
    onScreenshot,
  } = config;

  const plannerModel = config.model ?? getPlannerModel();
  // Use a faster/cheaper model for action decisions (executor role)
  const actorModel = getExecutorModel();

  const overallDeadline = Date.now() + timeoutMs;
  const sb = machinePool.getDefault();

  const context: LoopContext = {
    goal,
    plan: [],
    currentStep: 0,
    completedSteps: [],
    actionHistory: [],
    iteration: 0,
    replanCount: 0,
  };

  let state: LoopState = 'idle';
  let consecutiveScrolls = 0;
  const MAX_CONSECUTIVE_SCROLLS = 4;

  const transition = (next: LoopState) => {
    state = next;
    onStateChange?.(state, { ...context });
  };

  // ── Check sandbox availability ──

  let viewResult: ViewResult;
  try {
    viewResult = await sb.view();
  } catch (e) {
    transition('error');
    return {
      success: false,
      finalState: 'error',
      completedSteps: context.completedSteps,
      totalIterations: 0,
      totalActions: 0,
      summary: `Sandbox unavailable: ${e}`,
      error: String(e),
    };
  }

  // Dismiss popups before starting
  try { await ensurePageClear(); } catch { /* best-effort */ }

  // ── Initial PLANNING phase ──

  transition('planning');

  if (abortedOrTimedOut(signal)) {
    transition('done');
    return {
      success: false,
      finalState: 'done',
      completedSteps: [],
      totalIterations: 0,
      totalActions: 0,
      summary: 'Aborted before planning',
    };
  }

  const initElements = await getElements(viewResult);

  context.plan = await buildPlan(
    goal,
    viewResult.title,
    viewResult.url,
    initElements,
    viewResult.pageText,
    '',
    plannerModel,
    signal,
  );
  context.pageTitle = viewResult.title;
  context.pageUrl = viewResult.url;

  // ── Main Loop ──

  while (
    context.iteration < maxIterations &&
    // @ts-expect-error — state is mutated by transition() which TypeScript can't track across the loop
    state !== 'done' &&
    // @ts-expect-error — state is mutated by transition() which TypeScript can't track across the loop
    state !== 'error' &&
    !abortedOrTimedOut(signal) &&
    Date.now() < overallDeadline
  ) {
    context.iteration++;

    const currentPlanStep = context.plan[context.currentStep] ?? goal;

    // ─── ACTING ───────────────────────────────────────────────

    transition('acting');

    if (abortedOrTimedOut(signal)) break;

    // Refresh page state before deciding action
    try {
      const readiness = await checkPageReadiness();
      if (readiness.score < 50) {
        await waitForReady({ timeout: 3000, minScore: 50, signal });
      }
      viewResult = await sb.view();
    } catch {
      // If we can't get page state, mark error
      transition('error');
      break;
    }

    const elements = await getElements(viewResult);
    const recentHistory = context.actionHistory
      .slice(-5)
      .map(h => `[${h.action.action}] ${h.action.reason || ''} → ${h.result.output}`)
      .join('\n');

    const action = await planNextAction(
      currentPlanStep,
      viewResult.title,
      viewResult.url,
      elements,
      viewResult.pageText,
      recentHistory,
      actorModel,
      signal,
    );

    if (abortedOrTimedOut(signal)) break;

    // Execute with 15s timeout
    const actionStart = Date.now();
    let actionOutput = '';
    let actionOk = true;

    try {
      actionOutput = await withTimeout(executeAction(action), ACTION_TIMEOUT_MS);
    } catch (e) {
      actionOutput = `Error: ${e}`;
      actionOk = false;
    }

    const actionResult: ActionResult = {
      ok: actionOk,
      output: actionOutput,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - actionStart,
    };

    context.actionHistory.push({ action, result: actionResult });
    onAction?.(action, actionResult);

    // Track consecutive scrolls
    if (action.action === 'scroll_down' || action.action === 'scroll_up') {
      consecutiveScrolls++;
    } else {
      consecutiveScrolls = 0;
    }

    // Force step advance if scroll limit hit
    if (consecutiveScrolls >= MAX_CONSECUTIVE_SCROLLS) {
      consecutiveScrolls = 0;
      if (context.currentStep < context.plan.length - 1) {
        context.currentStep++;
      }
    }

    // Advance step on 'done' action.
    // Record the completed step and advance the pointer BEFORE transitioning to
    // 'done', so completedSteps is always populated and the transition fires once.
    if (action.action === 'done') {
      context.completedSteps.push(currentPlanStep);
      context.currentStep++;
      if (context.currentStep >= context.plan.length) {
        transition('done');
        break;
      }
    }

    // @ts-expect-error — state is mutated by transition() which TypeScript can't track
    if (state === 'done') break;

    // Fire-and-forget screenshot for UI
    if (onScreenshot && !abortedOrTimedOut(signal)) {
      (async () => {
        try {
          const snap = await sb.screenshot(55);
          if (snap.image_base64) {
            context.lastScreenshot = snap.image_base64;
            onScreenshot(snap.image_base64, snap.url || viewResult.url);
          }
        } catch { /* best-effort */ }
      })();
    }

    // ─── OBSERVING ────────────────────────────────────────────

    transition('observing');

    if (abortedOrTimedOut(signal)) break;

    // Capture fresh page state for evaluation
    try {
      viewResult = await sb.view();
      context.pageTitle = viewResult.title;
      context.pageUrl = viewResult.url;
    } catch { /* use stale view */ }

    // ─── EVALUATING ───────────────────────────────────────────

    transition('evaluating');

    if (abortedOrTimedOut(signal)) break;

    const evaluation = await evaluate(
      context,
      viewResult.title,
      viewResult.url,
      viewResult.pageText,
      plannerModel,
      signal,
    );

    if (evaluation.done) {
      transition('done');
      break;
    }

    if (evaluation.stuck && context.replanCount < maxReplans) {
      // ─── REPLANNING ───────────────────────────────────────

      transition('replanning');
      context.replanCount++;

      if (!abortedOrTimedOut(signal)) {
        const newPlan = await buildPlan(
          goal,
          viewResult.title,
          viewResult.url,
          await getElements(viewResult),
          viewResult.pageText,
          context.actionHistory
            .slice(-8)
            .map(h => `[${h.action.action}] ${h.action.reason || ''} → ${h.result.output}`)
            .join('\n'),
          plannerModel,
          signal,
        );

        if (newPlan.length > 0) {
          context.plan = newPlan;
          context.currentStep = 0;
        }
      }
    }

    // If evaluator says stop but not done/stuck
    if (!evaluation.continueLoop) {
      transition('done');
      break;
    }

    // Small pause between iterations — abort-aware
    try {
      await sleep(200, signal);
    } catch { break; }
  }

  // ── Final state determination ──

  if ((state as LoopState) !== 'done' && (state as LoopState) !== 'error') {
    if (abortedOrTimedOut(signal)) {
      transition('done'); // treat abort as graceful exit; fire onStateChange
    } else if (Date.now() >= overallDeadline) {
      transition('error'); // overall timeout; fire onStateChange
    } else {
      transition('done');
    }
  }

  const totalActions = context.actionHistory.length;
  const summary = `Completed ${context.completedSteps.length}/${context.plan.length} steps in ${context.iteration} iterations (${totalActions} actions)`;

  const isDone: boolean = (state as LoopState) === 'done';
  const isError: boolean = (state as LoopState) === 'error';
  return {
    success: isDone,
    finalState: state,
    completedSteps: context.completedSteps,
    totalIterations: context.iteration,
    totalActions,
    summary,
    error: isError ? 'Agent terminated with error state' : undefined,
  };
}

// Re-export the legacy runPlanAct for consumers that import from this module.
// planActAgent.ts remains the canonical source — this is a convenience re-export.
// @deprecated Use runLoopAgent for new code.
export { runPlanAct } from './planActAgent';
