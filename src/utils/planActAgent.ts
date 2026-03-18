/**
 * Plan-Act Agent — Two-agent pattern for browser automation.
 *
 * Planner (big model, 9b): Decomposes goal into ordered steps.
 * Executor (small model, 0.8b): Runs one action per loop iteration.
 *
 * Flow:
 *   Planner creates plan → Executor runs actions → Planner revises → loop
 */

import { ollamaService } from './ollama';
import { sandboxService, type ElementInfo, type ViewResult } from './sandboxService';
import { shouldVerify, verifyAction, type VerificationResult } from './visualVerifier';
import { diagnoseAndRecover, findAlternativeElement, type RecoveryContext, type RecoveryStrategy } from './errorRecovery';
import { typeText, pressKey as kbPressKey, pressCombo, fillField, parseKeyboardAction, type KeyCombo } from './keyboardService';
import { extractAccessibilityTree, formatTreeForPlanner, type AccessibilityTree } from './domExtractor';
import { checkPageReadiness, waitForReady } from './pageReadiness';
import { ensurePageClear } from './popupDismisser';

// ── Types ──

export interface PlanStep {
  step: number;
  description: string;
  status: 'pending' | 'active' | 'done' | 'failed';
}

export interface AgentPlan {
  steps: PlanStep[];
  currentStep: number;
  summary?: string;
}

export interface ExecutorAction {
  action: 'click' | 'input' | 'type' | 'fill_field' | 'scroll_down' | 'scroll_up' | 'navigate' | 'press_key' | 'back' | 'done' | 'ask_user';
  index?: number;
  text?: string;
  url?: string;
  key?: string;
  question?: string;
  options?: string[];
  reason?: string;
}

// ── Live stream event types for real-time UI ──

export type StreamEventType =
  | 'plan_created'
  | 'step_start'
  | 'step_thinking'
  | 'action_decided'
  | 'action_executing'
  | 'action_result'
  | 'verify_start'
  | 'verify_result'
  | 'recovery_start'
  | 'recovery_result'
  | 'step_complete'
  | 'replan'
  | 'done'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  stepIndex?: number;
  step?: PlanStep;
  plan?: AgentPlan;
  action?: ExecutorAction;
  result?: string;
  verification?: VerificationResult;
  recovery?: RecoveryStrategy;
  thinking?: string;
  error?: string;
  progress?: { completedSteps: number; totalSteps: number; totalActions: number };
}

export interface PlanActCallbacks {
  onPlan?: (plan: AgentPlan) => void;
  onStepStart?: (step: PlanStep) => void;
  onAction?: (action: ExecutorAction, result: string) => void;
  onVerify?: (result: VerificationResult, action: ExecutorAction) => void;
  onRecovery?: (strategy: RecoveryStrategy, action: ExecutorAction, error: string) => void;
  onThinking?: (text: string) => void;
  onStepComplete?: (step: PlanStep) => void;
  onDone?: (summary: string) => void;
  onError?: (error: string) => void;
  onAskUser?: (question: string, options: string[]) => Promise<string>;
  /** Unified stream for live UI — receives every event in order */
  onStream?: (event: StreamEvent) => void;
}

// ── Planner Agent ──

const PLANNER_SYSTEM = `You are a task planner for a browser automation agent.

Given a goal and the current page state, create a numbered plan of 3-8 concrete steps.
Each step should be a clear, actionable instruction that a simple executor can follow.

Elements include visibility info (visible/hidden), enabled/disabled state, form groupings, and page headings.
Use this to make smarter plans — target visible, enabled elements and leverage form structure and headings for navigation.

OUTPUT FORMAT (JSON only):
{"steps": ["Navigate to example.com", "Search for product X", "Click Add to Cart", "Verify cart updated"], "current": 1}

RULES:
- Steps should be specific ("Click the search box and type 'sea salt spray'") not vague ("Find the product")
- Include verification steps ("Verify the cart shows 2 items")
- If the page already shows what we need, skip navigation steps
- Prefer interacting with visible, enabled elements — avoid hidden or disabled ones
- Use headings and form groupings to understand page structure
- Max 8 steps. Be efficient.`;

async function createPlan(
  goal: string,
  pageTitle: string,
  pageUrl: string,
  elements: string,
  pageText: string,
  history: string,
  plannerModel: string,
  signal?: AbortSignal,
): Promise<AgentPlan> {
  const prompt = [
    `GOAL: ${goal}`,
    `CURRENT PAGE: "${pageTitle}" [${pageUrl}]`,
    elements ? `ELEMENTS ON PAGE:\n${elements.slice(0, 2000)}` : '',
    pageText ? `PAGE TEXT:\n${pageText.slice(0, 1500)}` : '',
    history ? `EXECUTION HISTORY:\n${history}` : '',
    'Create a step-by-step plan.',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  await ollamaService.generateStream(prompt, PLANNER_SYSTEM, {
    model: plannerModel,
    temperature: 0.3,
    num_predict: 300,
    signal,
    onChunk: (c: string) => { raw += c; },
  });

  // Parse JSON from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback: single step plan
    return {
      steps: [{ step: 1, description: goal, status: 'pending' }],
      currentStep: 1,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const steps: PlanStep[] = (parsed.steps || []).map((desc: string, i: number) => ({
      step: i + 1,
      description: desc,
      status: i === 0 ? 'active' as const : 'pending' as const,
    }));
    return { steps, currentStep: parsed.current || 1 };
  } catch {
    return {
      steps: [{ step: 1, description: goal, status: 'pending' }],
      currentStep: 1,
    };
  }
}

// ── Executor Agent ──

const EXECUTOR_SYSTEM = `You are a browser action executor. Given a task step and the page elements, output ONE action.

OUTPUT FORMAT (JSON only, no markdown):
{"action":"click","index":3,"reason":"clicking Add to Cart button"}

ACTIONS:
- click: {"action":"click","index":N,"reason":"..."}
- input: {"action":"input","index":N,"text":"...","reason":"..."} — type into a specific element by index
- type: {"action":"type","text":"...","reason":"..."} — type text into the currently focused element (no index needed)
- fill_field: {"action":"fill_field","index":N,"text":"...","reason":"..."} — click field, clear it, then type new value
- scroll_down: {"action":"scroll_down","reason":"..."}
- scroll_up: {"action":"scroll_up","reason":"..."}
- navigate: {"action":"navigate","url":"https://...","reason":"..."}
- press_key: {"action":"press_key","key":"Enter","reason":"..."} — supports combos like "ctrl+a", "ctrl+c", "shift+Tab"
- back: {"action":"back","reason":"..."}
- done: {"action":"done","reason":"step complete"}
- ask_user: {"action":"ask_user","question":"...","options":["A","B"],"reason":"need user choice"}

RULES:
- Pick elements by their [index] number
- Elements may have markers: (disabled), (focused). Only visible elements are listed; hidden ones are omitted.
- Always prefer enabled elements — never try to interact with disabled ones
- If the target element is visible, click it immediately
- If not visible, scroll to find it
- Output done when the current step is complete
- ask_user ONLY for real choices (size, color, variant) — never for confirmation`;

async function executeStep(
  stepDescription: string,
  pageTitle: string,
  pageUrl: string,
  elements: string,
  pageText: string,
  recentActions: string,
  executorModel: string,
  signal?: AbortSignal,
  onThinking?: (text: string) => void,
): Promise<ExecutorAction> {
  const prompt = [
    `CURRENT TASK: ${stepDescription}`,
    `PAGE: "${pageTitle}" [${pageUrl}]`,
    elements ? `ELEMENTS:\n${elements}` : 'No interactive elements found.',
    pageText ? `PAGE TEXT (truncated):\n${pageText.slice(0, 1000)}` : '',
    recentActions ? `RECENT ACTIONS:\n${recentActions}` : '',
    'What ONE action completes or advances this task?',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  await ollamaService.generateStream(prompt, EXECUTOR_SYSTEM, {
    model: executorModel,
    temperature: 0.1,
    num_predict: 100,
    signal,
    onChunk: (c: string) => { raw += c; onThinking?.(raw); },
  });

  // Parse JSON
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    // Fallback: scroll down if nothing parsed
    return { action: 'scroll_down', reason: 'Could not parse action, scrolling to find target' };
  }

  try {
    return JSON.parse(jsonMatch[0]) as ExecutorAction;
  } catch {
    // Check for common keywords
    if (raw.toLowerCase().includes('done')) return { action: 'done', reason: 'step complete' };
    if (raw.toLowerCase().includes('scroll')) return { action: 'scroll_down', reason: 'scrolling to find target' };
    return { action: 'scroll_down', reason: 'parse error, scrolling' };
  }
}

// ── Action Execution Helper ──

async function executeAction(action: ExecutorAction): Promise<string> {
  switch (action.action) {
    case 'click':
      if (action.index != null) {
        await sandboxService.click(action.index);
        // Brief wait — clicks on links/buttons often trigger navigation or loading
        await waitForReady({ timeout: 5000, minScore: 60 });
        return `Clicked element ${action.index}`;
      }
      return 'No index for click';
    case 'input':
      if (action.index != null && action.text) {
        await sandboxService.input(action.index, action.text, false);
        return `Typed "${action.text}" into element ${action.index}`;
      }
      return 'No index/text for input';
    case 'type':
      if (action.text) {
        await typeText(action.text, { index: action.index });
        return action.index != null
          ? `Typed "${action.text}" into element ${action.index}`
          : `Typed "${action.text}" into focused element`;
      }
      return 'No text for type';
    case 'fill_field':
      if (action.index != null && action.text) {
        await fillField(String(action.index), action.text);
        return `Cleared and filled element ${action.index} with "${action.text}"`;
      }
      return 'No index/text for fill_field';
    case 'scroll_down':
      await sandboxService.scroll('down', 500);
      return 'Scrolled down';
    case 'scroll_up':
      await sandboxService.scroll('up', 500);
      return 'Scrolled up';
    case 'navigate':
      if (action.url) {
        await sandboxService.navigate(action.url);
        const navReadiness = await waitForReady({ timeout: 8000, minScore: 70 });
        try { await ensurePageClear(); } catch {} // dismiss popups on new page
        return `Navigated to ${action.url} (readiness: ${navReadiness.score}/100)`;
      }
      return 'No URL for navigate';
    case 'press_key':
      if (action.key) {
        const parsed = parseKeyboardAction(action.key);
        if (parsed && typeof parsed === 'object') {
          await pressCombo(parsed as KeyCombo);
        } else {
          await kbPressKey(action.key);
        }
        return `Pressed ${action.key}`;
      }
      return 'No key specified';
    case 'back':
      await sandboxService.back();
      await waitForReady({ timeout: 5000, minScore: 60 });
      return 'Went back';
    case 'done':
      return 'Step complete';
    default:
      return `Unknown action: ${action.action}`;
  }
}

// ── Accessibility Tree Helper ──

/**
 * Try to get the rich accessibility tree from domExtractor.
 * Falls back to basic sandboxService.formatElements() if extraction fails.
 */
async function getEnrichedElements(viewResult: ViewResult): Promise<string> {
  try {
    const tree = await extractAccessibilityTree();
    if (tree.elements.length > 0) {
      return formatTreeForPlanner(tree);
    }
  } catch (err) {
    console.warn('[planActAgent] Accessibility tree extraction failed, using basic elements:', err);
  }
  // Fallback to basic element formatting
  return sandboxService.formatElements(viewResult.elements);
}

// ── Main Plan-Act Loop ──

export async function runPlanAct(
  goal: string,
  plannerModel: string,
  executorModel: string,
  callbacks: PlanActCallbacks,
  maxActions: number = 30,
  signal?: AbortSignal,
): Promise<void> {
  // Stream helper — emits to both legacy callbacks and unified stream
  const emit = (event: Omit<StreamEvent, 'timestamp'>) => {
    callbacks.onStream?.({ ...event, timestamp: Date.now() } as StreamEvent);
  };

  // Get initial page state
  let viewResult: ViewResult;
  try {
    viewResult = await sandboxService.view();
  } catch (e) {
    emit({ type: 'error', error: `Sandbox not available: ${e}` });
    callbacks.onError?.(`Sandbox not available: ${e}`);
    return;
  }

  // Auto-dismiss any popups/cookie banners before we start
  try { await ensurePageClear(); } catch {}

  // Try accessibility tree first, fall back to basic elements
  const elementsText = await getEnrichedElements(viewResult);
  const actionLog: string[] = [];

  // Phase 1: Create plan
  callbacks.onThinking?.('Planning...');
  const plan = await createPlan(
    goal,
    viewResult.title,
    viewResult.url,
    elementsText,
    viewResult.pageText,
    '',
    plannerModel,
    signal,
  );
  callbacks.onPlan?.(plan);
  emit({ type: 'plan_created', plan, progress: { completedSteps: 0, totalSteps: plan.steps.length, totalActions: 0 } });

  if (signal?.aborted) return;

  // Phase 2: Execute steps
  let totalActions = 0;
  let consecutiveScrolls = 0;

  for (let stepIdx = 0; stepIdx < plan.steps.length; stepIdx++) {
    if (signal?.aborted) break;
    if (totalActions >= maxActions) break;

    const step = plan.steps[stepIdx];
    step.status = 'active';
    callbacks.onStepStart?.(step);
    emit({ type: 'step_start', stepIndex: stepIdx, step, progress: { completedSteps: stepIdx, totalSteps: plan.steps.length, totalActions } });

    // Execute actions for this step (max 8 actions per step)
    let stepDone = false;
    for (let actionNum = 0; actionNum < 8 && !stepDone; actionNum++) {
      if (signal?.aborted) break;
      if (totalActions >= maxActions) break;

      // Check page readiness before refreshing state
      try {
        const preViewReadiness = await checkPageReadiness();
        if (preViewReadiness.score < 50) {
          await waitForReady({ timeout: 3000, minScore: 50, signal });
        }
      } catch {
        // readiness check failed, proceed anyway
      }

      // Refresh page state
      try {
        viewResult = await sandboxService.view();
      } catch {
        break;
      }

      const currentElements = await getEnrichedElements(viewResult);
      const recentLog = actionLog.slice(-5).join('\n');

      // Get action from executor
      const action = await executeStep(
        step.description,
        viewResult.title,
        viewResult.url,
        currentElements,
        viewResult.pageText,
        recentLog,
        executorModel,
        signal,
        callbacks.onThinking,
      );

      if (signal?.aborted) break;

      // Handle ask_user separately (needs callback)
      if (action.action === 'ask_user') {
        if (callbacks.onAskUser && action.question && action.options?.length) {
          const answer = await callbacks.onAskUser(action.question, action.options);
          actionLog.push(`[ask_user] ${action.question} → User chose: ${answer}`);
          callbacks.onAction?.(action, `User chose: ${answer}`);
          totalActions++;
          consecutiveScrolls = 0;
        }
        continue;
      }

      // Execute the action with verification + error recovery
      emit({ type: 'action_decided', stepIndex: stepIdx, action });
      emit({ type: 'action_executing', stepIndex: stepIdx, action });
      let result = '';
      let actionFailed = false;
      try {
        result = await executeAction(action);
        if (action.action === 'done') stepDone = true;
        if (action.action === 'scroll_down' || action.action === 'scroll_up') {
          consecutiveScrolls++;
        } else {
          consecutiveScrolls = 0;
        }
      } catch (e) {
        result = `Error: ${e}`;
        actionFailed = true;
      }

      actionLog.push(`[${action.action}] ${action.reason || ''} → ${result}`);
      callbacks.onAction?.(action, result);
      emit({ type: 'action_result', stepIndex: stepIdx, action, result, progress: { completedSteps: stepIdx, totalSteps: plan.steps.length, totalActions } });
      totalActions++;

      // ── Visual Verification ──
      if (!actionFailed && !stepDone && shouldVerify(action.action) && !signal?.aborted) {
        emit({ type: 'verify_start', stepIndex: stepIdx, action });
        try {
          const verification = await verifyAction(
            `${action.action}${action.reason ? ': ' + action.reason : ''}`,
            'vnc',
            { expectedOutcome: step.description, signal },
          );
          callbacks.onVerify?.(verification, action);
          emit({ type: 'verify_result', stepIndex: stepIdx, action, verification });

          if (!verification.success && verification.confidence > 0.6) {
            // Verification says action didn't work — treat as failure
            actionFailed = true;
            result = `Verification failed: ${verification.observation}`;
            actionLog.push(`[verify] FAILED — ${verification.observation}${verification.suggestion ? ' | Suggestion: ' + verification.suggestion : ''}`);
          }
        } catch {
          // Verification failed to run — continue anyway
        }
      }

      // ── Error Recovery ──
      if (actionFailed && !signal?.aborted) {
        let freshView: ViewResult | null = null;
        try { freshView = await sandboxService.view(); } catch {}

        const recoveryCtx: RecoveryContext = {
          action: action.action,
          targetIndex: action.index,
          targetText: action.reason || '',
          error: result,
          pageUrl: freshView?.url || viewResult.url,
          pageTitle: freshView?.title || viewResult.title,
          attemptCount: 0,
          elements: freshView?.elements,
        };

        const strategies = diagnoseAndRecover(recoveryCtx);
        let recovered = false;

        for (const strategy of strategies.slice(0, 2)) { // try top 2 strategies
          if (signal?.aborted) break;
          callbacks.onRecovery?.(strategy, action, result);
          emit({ type: 'recovery_start', stepIndex: stepIdx, action, recovery: strategy });

          try {
            if (strategy.type === 'wait_and_retry') {
              await new Promise(r => setTimeout(r, strategy.delay || 500));
              await executeAction(action);
              recovered = true;
            } else if (strategy.type === 'scroll_and_retry') {
              await sandboxService.scroll('down', 400);
              await new Promise(r => setTimeout(r, 200));
              await executeAction(action);
              recovered = true;
            } else if (strategy.type === 'alternative_element' && strategy.action?.index != null) {
              const altAction = { ...action, index: strategy.action.index };
              await executeAction(altAction);
              recovered = true;
            } else if (strategy.type === 'refresh') {
              await sandboxService.navigate(viewResult.url);
              recovered = true; // page refreshed, let next iteration retry
            } else if (strategy.type === 'navigate_back') {
              await sandboxService.back();
              recovered = true;
            } else if (strategy.type === 'skip') {
              stepDone = true;
              recovered = true;
            }
          } catch {
            continue; // recovery strategy failed, try next
          }

          if (recovered) {
            actionLog.push(`[recovery] ${strategy.type}: ${strategy.description}`);
            break;
          }
        }
      }

      // Safety: if scrolled 4+ times without clicking, mark step done
      if (consecutiveScrolls >= 4) {
        stepDone = true;
        consecutiveScrolls = 0;
      }
    }

    step.status = stepDone ? 'done' : 'failed';
    callbacks.onStepComplete?.(step);
    emit({ type: 'step_complete', stepIndex: stepIdx, step, progress: { completedSteps: plan.steps.filter(s => s.status === 'done').length, totalSteps: plan.steps.length, totalActions } });

    // Re-plan every 3 completed steps
    if ((stepIdx + 1) % 3 === 0 && stepIdx < plan.steps.length - 1) {
      callbacks.onThinking?.('Re-evaluating plan...');
      try {
        viewResult = await sandboxService.view();
        const replanElements = await getEnrichedElements(viewResult);
        const updatedPlan = await createPlan(
          goal,
          viewResult.title,
          viewResult.url,
          replanElements,
          viewResult.pageText,
          actionLog.slice(-10).join('\n'),
          plannerModel,
          signal,
        );
        // Replace remaining steps
        for (let i = stepIdx + 1; i < plan.steps.length; i++) {
          const newIdx = i - stepIdx - 1;
          if (newIdx < updatedPlan.steps.length) {
            plan.steps[i] = {
              ...updatedPlan.steps[newIdx],
              step: i + 1,
            };
          }
        }
        callbacks.onPlan?.(plan);
        emit({ type: 'replan', plan, progress: { completedSteps: plan.steps.filter(s => s.status === 'done').length, totalSteps: plan.steps.length, totalActions } });
      } catch {}
    }
  }

  const summary = `Completed ${totalActions} actions across ${plan.steps.filter(s => s.status === 'done').length}/${plan.steps.length} steps`;
  emit({ type: 'done', result: summary, progress: { completedSteps: plan.steps.filter(s => s.status === 'done').length, totalSteps: plan.steps.length, totalActions } });
  callbacks.onDone?.(summary);
}
