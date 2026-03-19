/**
 * Plan-Act Agent — Two-agent pattern for browser automation.
 *
 * Planner (big model, 9b): Decomposes goal into ordered steps.
 * Executor (small model, 0.8b): Runs one action per loop iteration.
 *
 * Flow:
 *   Planner creates plan → Executor runs actions → Planner revises → loop
 *
 * Supports:
 *   - Multi-prompt conversation (follow-up instructions mid-run)
 *   - Tab management (open, switch, close tabs)
 *   - User-interaction detection (pause when user takes control)
 *   - Element scoring for smarter target selection
 */

import { ollamaService } from './ollama';
import { getThinkMode } from './modelConfig';
import { MachineClient, machinePool } from './sandboxService';
import type { ViewResult } from './sandboxService';
import { shouldVerify, verifyAction } from './visualVerifier';
import type { VerificationResult } from './visualVerifier';
import { diagnoseAndRecover } from './errorRecovery';
import type { RecoveryContext, RecoveryStrategy } from './errorRecovery';
import { typeText, pressKey as kbPressKey, pressCombo, fillField, parseKeyboardAction } from './keyboardService';
import type { KeyCombo } from './keyboardService';
import { extractAccessibilityTree, formatTreeForPlanner } from './domExtractor';
import { checkPageReadiness, waitForReady } from './pageReadiness';
import { ensurePageClear } from './popupDismisser';

// ── Types ──

export interface PlanStep {
  step: number;
  description: string;
  status: 'pending' | 'active' | 'done' | 'failed';
  targetElement?: string; // description of the element being targeted
}

export interface AgentPlan {
  steps: PlanStep[];
  currentStep: number;
  summary?: string;
}

export interface ExecutorAction {
  action: 'click' | 'input' | 'type' | 'fill_field' | 'scroll_down' | 'scroll_up' | 'navigate' | 'press_key' | 'back' | 'done' | 'ask_user' | 'open_tab' | 'switch_tab' | 'close_tab';
  index?: number;
  text?: string;
  url?: string;
  key?: string;
  question?: string;
  options?: string[];
  reason?: string;
  tabIndex?: number; // for switch_tab
  targetDescription?: string; // human-readable description of what we're targeting
}

// ── Conversation context for multi-prompt support ──

export interface ConversationMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
}

export interface ConversationContext {
  messages: ConversationMessage[];
  actionHistory: string[];
  currentUrl: string;
  currentTitle: string;
  tabCount: number;
  activeTabIndex: number;
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
  | 'error'
  | 'user_paused'
  | 'user_resumed'
  | 'tab_changed'
  | 'waiting_for_input';

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
  targetElement?: string;
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

// ── User Interaction Detection ──

export interface UserInteractionState {
  isPaused: boolean;
  lastUserAction: number;
  pauseReason?: string;
}

let _userInteractionState: UserInteractionState = {
  isPaused: false,
  lastUserAction: 0,
};

/** Called by UI when user clicks/interacts with the browser */
export function notifyUserInteraction(): void {
  _userInteractionState.lastUserAction = Date.now();
  _userInteractionState.isPaused = true;
  _userInteractionState.pauseReason = 'User interaction detected';
}

/** Called when user stops interacting — auto-resume after delay */
export function clearUserInteraction(): void {
  _userInteractionState.isPaused = false;
  _userInteractionState.pauseReason = undefined;
}

export function getUserInteractionState(): UserInteractionState {
  return { ..._userInteractionState };
}

// Auto-resume after 3 seconds of no user activity
async function waitForUserToFinish(signal?: AbortSignal): Promise<void> {
  const RESUME_DELAY = 3000;
  while (_userInteractionState.isPaused && !signal?.aborted) {
    const elapsed = Date.now() - _userInteractionState.lastUserAction;
    if (elapsed >= RESUME_DELAY) {
      clearUserInteraction();
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── Planner Agent ──

const PLANNER_SYSTEM = `Browser automation planner. Create 3-8 step plan from goal + page state.

Rules:
- Only reference elements currently VISIBLE in the element list. If the target is not listed, add a scroll step first.
- Be specific: "Click the 'Add to Cart' button" not "Add item". Quote exact text from the element list.
- Each step = one user-visible action. Don't combine "navigate and click" into one step.
- If already on the right page, skip navigation. Check the CURRENT PAGE url first.
- Prefer the shortest path. Don't add verify/confirm steps unless the goal requires checking a result.
- Multi-tab: use open_tab/switch_tab steps when needed.

Output JSON only:
{"steps": ["Navigate to example.com", "Click the search box", "Type 'sea salt spray'", "Click Search button"], "current": 1}`;

async function createPlan(
  goal: string,
  pageTitle: string,
  pageUrl: string,
  elements: string,
  pageText: string,
  history: string,
  plannerModel: string,
  conversation?: ConversationContext,
  signal?: AbortSignal,
): Promise<AgentPlan> {
  const conversationCtx = conversation?.messages.length
    ? `CONVERSATION:\n${conversation.messages.slice(-5).map(m => `[${m.role}] ${m.content}`).join('\n')}`
    : '';

  const prompt = [
    `GOAL: ${goal}`,
    `CURRENT PAGE: "${pageTitle}" [${pageUrl}]`,
    elements ? `VISIBLE ELEMENTS:\n${elements.slice(0, 2000)}` : '',
    pageText ? `PAGE TEXT:\n${pageText.slice(0, 1500)}` : '',
    history ? `EXECUTION HISTORY:\n${history}` : '',
    conversationCtx,
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

const EXECUTOR_SYSTEM = `Browser executor. One action per turn. JSON only, no markdown.

Format: {"action":"click","index":3,"reason":"Add to Cart"}

Actions: click, input, type, fill_field, scroll_down, scroll_up, navigate, press_key, back, open_tab, switch_tab, close_tab, done, ask_user

- click/input/fill_field: need "index" + optional "text"
- navigate/open_tab: need "url"
- press_key: need "key"
- ask_user: need "question" + "options"
- done: task complete

Element matching rules:
- Match by EXACT text first, then aria-label, then role. Prefer the element whose text most closely matches the task.
- Buttons/links with the right label > generic divs/spans with similar text.
- If multiple elements match, pick the one with role=button or role=link over role=generic.
- NEVER click an element marked (disabled) or (aria-disabled).
- NEVER click hidden or zero-size elements.

Common mistakes to avoid:
- Do NOT scroll if the target element is already in the visible list — click it immediately.
- Do NOT keep scrolling in the same direction more than 3 times. Try scroll_up or a different approach.
- Do NOT pick a parent container when a child button/link is the actual target.
- Do NOT use navigate when you just need to click a link on the current page.
- If RECENT actions show you already scrolled 2+ times, stop scrolling and act on what is visible or report done.

Rules:
- If target visible, act NOW.
- ask_user only for real choices, not confirmation.`;

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
    `TASK: ${stepDescription}`,
    `PAGE: "${pageTitle}" [${pageUrl}]`,
    elements ? `VISIBLE ELEMENTS:\n${elements}` : 'No interactive elements found.',
    pageText ? `TEXT (truncated):\n${pageText.slice(0, 800)}` : '',
    recentActions ? `RECENT:\n${recentActions}` : '',
    'One action. JSON only.',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  await ollamaService.generateStream(prompt, EXECUTOR_SYSTEM, {
    model: executorModel,
    temperature: 0.1,
    num_predict: 80,
    think: getThinkMode('executor'), // small model — auto off
    signal,
    onChunk: (c: string) => { raw += c; onThinking?.(raw); },
  });

  // Parse JSON
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    return { action: 'scroll_down', reason: 'Could not parse action, scrolling to find target' };
  }

  try {
    return JSON.parse(jsonMatch[0]) as ExecutorAction;
  } catch {
    if (raw.toLowerCase().includes('done')) return { action: 'done', reason: 'step complete' };
    if (raw.toLowerCase().includes('scroll')) return { action: 'scroll_down', reason: 'scrolling to find target' };
    return { action: 'scroll_down', reason: 'parse error, scrolling' };
  }
}

// ── Action Execution Helper ──

async function executeAction(action: ExecutorAction, machine?: MachineClient): Promise<string> {
  const sb = machine ?? machinePool.getDefault();
  switch (action.action) {
    case 'click':
      if (action.index != null) {
        await sb.click(action.index);
        await waitForReady({ timeout: 5000, minScore: 60 });
        return `Clicked element ${action.index}`;
      }
      return 'No index for click';
    case 'input':
      if (action.index != null && action.text) {
        await sb.input(action.index, action.text, false);
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
      await sb.scroll('down', 500);
      return 'Scrolled down';
    case 'scroll_up':
      await sb.scroll('up', 500);
      return 'Scrolled up';
    case 'navigate':
      if (action.url) {
        await sb.navigate(action.url);
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
      await sb.back();
      await waitForReady({ timeout: 5000, minScore: 60 });
      return 'Went back';
    case 'open_tab':
      if (action.url) {
        await sb.consoleExec(`window.open("${action.url}", "_blank")`);
        await waitForReady({ timeout: 5000, minScore: 50 });
        return `Opened new tab: ${action.url}`;
      }
      return 'No URL for open_tab';
    case 'switch_tab':
      if (action.tabIndex != null) {
        const tabNum = Math.min(Math.max(action.tabIndex + 1, 1), 9);
        await kbPressKey(`ctrl+${tabNum}`);
        await waitForReady({ timeout: 3000, minScore: 50 });
        return `Switched to tab ${action.tabIndex}`;
      }
      return 'No tabIndex for switch_tab';
    case 'close_tab':
      await kbPressKey('ctrl+w');
      await waitForReady({ timeout: 3000, minScore: 50 });
      return 'Closed current tab';
    case 'done':
      return 'Step complete';
    default:
      return `Unknown action: ${action.action}`;
  }
}

// ── Accessibility Tree Helper ──

async function getEnrichedElements(viewResult: ViewResult, machine?: MachineClient): Promise<string> {
  const sb = machine ?? machinePool.getDefault();
  try {
    const tree = await extractAccessibilityTree();
    if (tree.elements.length > 0) {
      return formatTreeForPlanner(tree);
    }
  } catch (err) {
    console.warn('[planActAgent] Accessibility tree extraction failed, using basic elements:', err);
  }
  return sb.formatElements(viewResult.elements);
}

// ── Main Plan-Act Loop ──

export async function runPlanAct(
  goal: string,
  plannerModel: string,
  executorModel: string,
  callbacks: PlanActCallbacks,
  maxActions: number = 30,
  signal?: AbortSignal,
  conversation?: ConversationContext,
  machine?: MachineClient,
): Promise<void> {
  const sb = machine ?? machinePool.getDefault();

  // Stream helper
  const emit = (event: Omit<StreamEvent, 'timestamp'>) => {
    callbacks.onStream?.({ ...event, timestamp: Date.now() } as StreamEvent);
  };

  // Get initial page state
  let viewResult: ViewResult;
  try {
    viewResult = await sb.view();
  } catch (e) {
    emit({ type: 'error', error: `Sandbox not available: ${e}` });
    callbacks.onError?.(`Sandbox not available: ${e}`);
    return;
  }

  // Auto-dismiss any popups/cookie banners before we start
  try { await ensurePageClear(); } catch {}

  const elementsText = await getEnrichedElements(viewResult, sb);
  const actionLog: string[] = [];

  // Add conversation context
  if (conversation) {
    conversation.currentUrl = viewResult.url;
    conversation.currentTitle = viewResult.title;
  }

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
    conversation,
    signal,
  );
  callbacks.onPlan?.(plan);
  emit({ type: 'plan_created', plan, progress: { completedSteps: 0, totalSteps: plan.steps.length, totalActions: 0 } });

  if (signal?.aborted) return;

  // Phase 2: Execute steps
  let totalActions = 0;
  let consecutiveScrolls = 0;
  const MAX_CONSECUTIVE_SCROLLS = 4;

  for (let stepIdx = 0; stepIdx < plan.steps.length; stepIdx++) {
    if (signal?.aborted) break;
    if (totalActions >= maxActions) break;

    // Check for user interaction — pause if needed
    if (_userInteractionState.isPaused) {
      emit({ type: 'user_paused', result: 'User interaction detected, pausing...' });
      await waitForUserToFinish(signal);
      emit({ type: 'user_resumed', result: 'Resuming after user interaction' });
      // Refresh page state after user interaction
      try { viewResult = await sb.view(); } catch { break; }
    }

    const step = plan.steps[stepIdx];
    step.status = 'active';
    callbacks.onStepStart?.(step);
    emit({ type: 'step_start', stepIndex: stepIdx, step, progress: { completedSteps: stepIdx, totalSteps: plan.steps.length, totalActions } });

    // Execute actions for this step (max 8 actions per step)
    let stepDone = false;
    for (let actionNum = 0; actionNum < 8 && !stepDone; actionNum++) {
      if (signal?.aborted) break;
      if (totalActions >= maxActions) break;

      // Check for user interaction mid-step
      if (_userInteractionState.isPaused) {
        emit({ type: 'user_paused', result: 'User interaction detected, pausing...' });
        await waitForUserToFinish(signal);
        emit({ type: 'user_resumed', result: 'Resuming after user interaction' });
      }

      // Check page readiness
      try {
        const preViewReadiness = await checkPageReadiness();
        if (preViewReadiness.score < 50) {
          await waitForReady({ timeout: 3000, minScore: 50, signal });
        }
      } catch {}

      // Refresh page state
      try {
        viewResult = await sb.view();
      } catch {
        break;
      }

      const currentElements = await getEnrichedElements(viewResult, sb);
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

      // Handle ask_user
      if (action.action === 'ask_user') {
        if (callbacks.onAskUser && action.question && action.options?.length) {
          const answer = await callbacks.onAskUser(action.question, action.options);
          actionLog.push(`[ask_user] ${action.question} -> User chose: ${answer}`);
          callbacks.onAction?.(action, `User chose: ${answer}`);
          totalActions++;
          consecutiveScrolls = 0;
        }
        continue;
      }

      // Emit target element info for UI display
      const targetDesc = action.reason || (action.index != null ? `element [${action.index}]` : action.action);
      emit({ type: 'action_decided', stepIndex: stepIdx, action, targetElement: targetDesc });
      emit({ type: 'action_executing', stepIndex: stepIdx, action });

      let result = '';
      let actionFailed = false;
      try {
        result = await executeAction(action, sb);
        if (action.action === 'done') stepDone = true;

        // Track consecutive scrolls with enforced limit
        if (action.action === 'scroll_down' || action.action === 'scroll_up') {
          consecutiveScrolls++;
          if (consecutiveScrolls >= MAX_CONSECUTIVE_SCROLLS) {
            result += ` (LIMIT: scrolled ${consecutiveScrolls}x without clicking — stopping scroll)`;
          }
        } else {
          consecutiveScrolls = 0;
        }
      } catch (e) {
        result = `Error: ${e}`;
        actionFailed = true;
      }

      actionLog.push(`[${action.action}] ${action.reason || ''} -> ${result}`);
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
            actionFailed = true;
            result = `Verification failed: ${verification.observation}`;
            actionLog.push(`[verify] FAILED -- ${verification.observation}${verification.suggestion ? ' | Suggestion: ' + verification.suggestion : ''}`);
          }
        } catch {}
      }

      // ── Error Recovery ──
      if (actionFailed && !signal?.aborted) {
        let freshView: ViewResult | null = null;
        try { freshView = await sb.view(); } catch {}

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

        for (const strategy of strategies.slice(0, 2)) {
          if (signal?.aborted) break;
          callbacks.onRecovery?.(strategy, action, result);
          emit({ type: 'recovery_start', stepIndex: stepIdx, action, recovery: strategy });

          try {
            if (strategy.type === 'wait_and_retry') {
              await new Promise(r => setTimeout(r, strategy.delay || 500));
              await executeAction(action, sb);
              recovered = true;
            } else if (strategy.type === 'scroll_and_retry') {
              await sb.scroll('down', 400);
              await new Promise(r => setTimeout(r, 200));
              await executeAction(action, sb);
              recovered = true;
            } else if (strategy.type === 'alternative_element' && strategy.action?.index != null) {
              const altAction = { ...action, index: strategy.action.index as number };
              await executeAction(altAction, sb);
              recovered = true;
            } else if (strategy.type === 'refresh') {
              await sb.navigate(viewResult.url);
              recovered = true;
            } else if (strategy.type === 'navigate_back') {
              await sb.back();
              recovered = true;
            } else if (strategy.type === 'skip') {
              stepDone = true;
              recovered = true;
            }
          } catch {
            continue;
          }

          if (recovered) {
            actionLog.push(`[recovery] ${strategy.type}: ${strategy.description}`);
            emit({ type: 'recovery_result', stepIndex: stepIdx, recovery: strategy, result: 'recovered' });
            break;
          }
        }
      }

      // Safety: enforced scroll limit
      if (consecutiveScrolls >= MAX_CONSECUTIVE_SCROLLS) {
        stepDone = true;
        consecutiveScrolls = 0;
        actionLog.push('[scroll_limit] Hit scroll limit, moving to next step');
      }
    }

    step.status = stepDone ? 'done' : 'failed';
    callbacks.onStepComplete?.(step);
    emit({ type: 'step_complete', stepIndex: stepIdx, step, progress: { completedSteps: plan.steps.filter(s => s.status === 'done').length, totalSteps: plan.steps.length, totalActions } });

    // Re-plan every 3 completed steps
    if ((stepIdx + 1) % 3 === 0 && stepIdx < plan.steps.length - 1) {
      callbacks.onThinking?.('Re-evaluating plan...');
      try {
        viewResult = await sb.view();
        const replanElements = await getEnrichedElements(viewResult, sb);
        const updatedPlan = await createPlan(
          goal,
          viewResult.title,
          viewResult.url,
          replanElements,
          viewResult.pageText,
          actionLog.slice(-10).join('\n'),
          plannerModel,
          conversation,
          signal,
        );
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

// ── Follow-up: handle a new user message during or after execution ──

export async function handleFollowUp(
  message: string,
  conversation: ConversationContext,
  plannerModel: string,
  executorModel: string,
  callbacks: PlanActCallbacks,
  maxActions: number = 30,
  signal?: AbortSignal,
  machine?: MachineClient,
): Promise<void> {
  // Add user message to conversation
  conversation.messages.push({
    role: 'user',
    content: message,
    timestamp: Date.now(),
  });

  // Run plan-act with conversation context
  await runPlanAct(
    message,
    plannerModel,
    executorModel,
    callbacks,
    maxActions,
    signal,
    conversation,
    machine,
  );

  // Add completion to conversation
  conversation.messages.push({
    role: 'agent',
    content: `Completed task: ${message}`,
    timestamp: Date.now(),
  });
}
