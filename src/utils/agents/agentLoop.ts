/**
 * Agent Loop -- main orchestration for the 3-agent computer use system.
 *
 * Flow:
 *   1. Vision agent analyzes initial screen
 *   2. Planner agent creates a step-by-step plan (gpt-oss-20b with thinking)
 *   3. For each step:
 *      a. Executor agent runs the step (vision-action loop internally)
 *      b. Planner agent checks in: continue / replan / done / abort
 *   4. Loop until goal achieved, aborted, or limits exceeded
 *
 * Replaces the old runPlanAct() with a proper multi-agent architecture.
 */

import { analyzeScreen, quickScreenCheck } from './visionAgent';
import type { ScreenState } from './visionAgent';
import { createPlan, checkPlan } from './plannerAgent';
import type { AgentPlan, PlanStep, StepSummary, PlanRevision } from './plannerAgent';
import { executeStep } from './executorAgent';
import type { StepResult, ExecutorAction, ActionRecord } from './executorAgent';

// Re-export types for consumers
export type { ScreenState, AgentPlan, PlanStep, StepSummary, PlanRevision, StepResult, ExecutorAction, ActionRecord };

// ── Types ──

export type StreamEventType =
  | 'vision_start' | 'vision_result'
  | 'plan_created' | 'step_start' | 'step_complete' | 'step_checkin'
  | 'replan' | 'action' | 'screenshot'
  | 'done' | 'error' | 'user_paused' | 'user_resumed';

export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  step?: PlanStep;
  plan?: AgentPlan;
  action?: ExecutorAction;
  result?: string;
  screenState?: ScreenState;
  revision?: PlanRevision;
  error?: string;
  progress?: { completedSteps: number; totalSteps: number; totalActions: number };
}

export interface AgentLoopCallbacks {
  onPlan?: (plan: AgentPlan) => void;
  onStepStart?: (step: PlanStep) => void;
  onAction?: (action: ExecutorAction, result: string) => void;
  onScreenshot?: (base64: string, url: string) => void;
  onStepComplete?: (step: PlanStep & { status: string }) => void;
  onThinking?: (text: string) => void;
  onVision?: (screenState: ScreenState, screenshotB64?: string) => void;
  onDone?: (summary: string) => void;
  onError?: (error: string) => void;
  onStream?: (event: StreamEvent) => void;
  onAskUser?: (question: string, options: string[]) => Promise<string>;
  /** Called after each action with iteration count, action description, result */
  onProgress?: (iteration: number, action: string, result: string) => void;
}

interface AgentLoopOptions {
  maxTotalActions?: number;   // default 50
  maxReplans?: number;        // default 3
  machineId?: string;
}

// ── Constants ──

const DEFAULT_MAX_ACTIONS = 50;
const DEFAULT_MAX_REPLANS = 3;

// ── Helpers ──

function emit(callbacks: AgentLoopCallbacks, event: Omit<StreamEvent, 'timestamp'>) {
  callbacks.onStream?.({ ...event, timestamp: Date.now() } as StreamEvent);
}

function buildStepsSummary(completedSteps: StepSummary[]): string {
  if (completedSteps.length === 0) return '';
  const recent = completedSteps.slice(-3);
  const older = completedSteps.length - recent.length;
  const lines = recent.map(
    s => `Step ${s.stepNumber} [${s.status}]: ${s.description} -- ${s.summary}`
  );
  if (older > 0) lines.unshift(`(${older} earlier steps completed)`);
  return lines.join('\n');
}

// ── Main Loop ──

export async function runAgentLoop(
  goal: string,
  callbacks: AgentLoopCallbacks,
  options?: AgentLoopOptions,
  signal?: AbortSignal,
): Promise<void> {
  const maxActions = options?.maxTotalActions ?? DEFAULT_MAX_ACTIONS;
  const maxReplans = options?.maxReplans ?? DEFAULT_MAX_REPLANS;
  const machineId = options?.machineId;
  let totalActions = 0;
  let replanCount = 0;
  const completedSteps: StepSummary[] = [];
  // Stagnation detection: track last 3 action descriptions
  const recentActionDescs: string[] = [];

  // ── 1. Get initial screen state ──
  emit(callbacks, { type: 'vision_start' });
  callbacks.onThinking?.('Analyzing current screen...');

  let initialScreen: ScreenState;
  let elementsText = '';

  try {
    const [screen, quick] = await Promise.all([
      analyzeScreen(goal, 'Initial screen analysis', machineId, signal),
      quickScreenCheck(machineId, signal),
    ]);
    initialScreen = screen;
    elementsText = quick.elements;

    emit(callbacks, { type: 'vision_result', screenState: screen });
    callbacks.onVision?.(screen, screen.screenshotBase64);
    if (screen.screenshotBase64) {
      callbacks.onScreenshot?.(screen.screenshotBase64, '');
    }
  } catch (err) {
    if (signal?.aborted) return;
    const msg = `Failed to analyze screen: ${err}`;
    emit(callbacks, { type: 'error', error: msg });
    callbacks.onError?.(msg);
    return;
  }

  if (signal?.aborted) return;

  // ── 2. Create plan ──
  callbacks.onThinking?.('Creating plan with gpt-oss-20b...');

  let plan: AgentPlan;
  try {
    plan = await createPlan(goal, initialScreen.description, elementsText, signal);
  } catch (err) {
    if (signal?.aborted) return;
    const msg = `Planner failed: ${err}`;
    emit(callbacks, { type: 'error', error: msg });
    callbacks.onError?.(msg);
    return;
  }

  if (plan.steps.length === 0) {
    emit(callbacks, { type: 'error', error: 'Planner returned empty plan' });
    callbacks.onError?.('Planner returned empty plan');
    return;
  }

  emit(callbacks, { type: 'plan_created', plan });
  callbacks.onPlan?.(plan);
  callbacks.onThinking?.(`Plan: ${plan.steps.length} steps -- ${plan.reasoning}`);

  // ── 3. Execute steps ──
  let currentSteps = [...plan.steps];

  for (let stepIdx = 0; stepIdx < currentSteps.length; stepIdx++) {
    if (signal?.aborted) break;
    if (totalActions >= maxActions) {
      emit(callbacks, { type: 'error', error: `Hit max actions limit (${maxActions})` });
      callbacks.onError?.(`Reached maximum of ${maxActions} actions`);
      break;
    }

    const step = currentSteps[stepIdx];

    // ── 3a. Emit step start ──
    emit(callbacks, {
      type: 'step_start',
      step,
      progress: { completedSteps: completedSteps.length, totalSteps: currentSteps.length, totalActions },
    });
    callbacks.onStepStart?.(step);
    callbacks.onThinking?.(`Step ${step.stepNumber}: ${step.description}`);

    // ── 3b. Execute step via executor agent ──
    let stepResult: StepResult;
    try {
      stepResult = await executeStep(
        step,
        goal,
        buildStepsSummary(completedSteps),
        {
          onAction: (action, record) => {
            totalActions++;
            const result = record.succeeded ? 'OK' : `Failed: ${record.error || 'unknown'}`;
            const actionDesc = `${action.type}: ${action.reason}`;

            // Stagnation detection: if last 3 actions are identical, force replan
            recentActionDescs.push(actionDesc);
            if (recentActionDescs.length > 3) recentActionDescs.shift();
            const isStagnant = recentActionDescs.length === 3
              && recentActionDescs.every(d => d === recentActionDescs[0]);
            if (isStagnant) {
              emit(callbacks, { type: 'error', error: `Stagnation detected: 3 identical actions in a row (${action.type})` });
              // Don't abort -- let the planner check-in handle it; just warn
              console.warn('[agentLoop] Stagnation detected:', actionDesc);
            }

            callbacks.onAction?.(action, result);
            callbacks.onProgress?.(totalActions, actionDesc, result);
            emit(callbacks, { type: 'action', action, result });
          },
          onVision: (screenState, b64) => {
            callbacks.onVision?.(screenState, b64);
            if (b64) callbacks.onScreenshot?.(b64, '');
            emit(callbacks, { type: 'vision_result', screenState });
          },
          onStream: (text) => {
            callbacks.onThinking?.(text);
          },
        },
        machineId,
        signal,
      );
    } catch (err) {
      if (signal?.aborted) break;
      stepResult = {
        status: 'failed',
        actionsTaken: [],
        summary: `Exception: ${err}`,
        finalScreenDescription: '',
      };
    }

    // ── 3c. Record step result ──
    const stepSummary: StepSummary = {
      stepNumber: step.stepNumber,
      description: step.description,
      status: stepResult.status,
      summary: stepResult.summary,
      actionsCount: stepResult.actionsTaken.length,
    };
    completedSteps.push(stepSummary);

    emit(callbacks, {
      type: 'step_complete',
      step: { ...step },
      result: stepResult.summary,
      progress: { completedSteps: completedSteps.length, totalSteps: currentSteps.length, totalActions },
    });
    callbacks.onStepComplete?.({ ...step, status: stepResult.status });

    if (signal?.aborted) break;

    // ── 3d. Planner check-in ──
    callbacks.onThinking?.('Planner reviewing progress...');

    let revision: PlanRevision;
    try {
      revision = await checkPlan(
        goal,
        plan,
        completedSteps,
        stepSummary,
        stepResult.finalScreenDescription,
        signal,
      );
    } catch (err) {
      if (signal?.aborted) break;
      // If check-in fails, just continue with current plan
      revision = { action: 'continue', reason: 'Check-in failed, continuing' };
    }

    emit(callbacks, { type: 'step_checkin', revision });

    switch (revision.action) {
      case 'done':
        callbacks.onThinking?.(`Goal achieved: ${revision.reason}`);
        emit(callbacks, { type: 'done', result: revision.reason });
        callbacks.onDone?.(buildFinalSummary(goal, completedSteps, revision.reason));
        return;

      case 'abort':
        callbacks.onThinking?.(`Aborting: ${revision.reason}`);
        emit(callbacks, { type: 'error', error: `Planner aborted: ${revision.reason}` });
        callbacks.onError?.(`Planner aborted: ${revision.reason}`);
        return;

      case 'replan':
        replanCount++;
        if (replanCount > maxReplans) {
          emit(callbacks, { type: 'error', error: 'Too many replans' });
          callbacks.onError?.('Exceeded maximum replan attempts');
          return;
        }
        if (revision.updatedSteps && revision.updatedSteps.length > 0) {
          currentSteps = revision.updatedSteps;
          stepIdx = -1; // restart loop with new steps (incremented to 0 by for-loop)
          plan = { steps: currentSteps, reasoning: `Replanned: ${revision.reason}` };
          emit(callbacks, { type: 'replan', plan });
          callbacks.onPlan?.(plan);
          callbacks.onThinking?.(`Replanned: ${revision.reason}`);
        } else {
          // Planner said 'replan' but provided no steps — treat as 'continue' to avoid stall
          console.warn('[agentLoop] Replan with no updatedSteps — continuing current plan. Reason:', revision.reason);
        }
        break;

      case 'continue':
      default:
        // Nothing to do, loop continues to next step
        break;
    }
  }

  // ── 4. Done (all steps exhausted) ──
  if (!signal?.aborted) {
    const summary = buildFinalSummary(goal, completedSteps, 'All planned steps executed');
    emit(callbacks, { type: 'done', result: summary });
    callbacks.onDone?.(summary);
  }
}

// ── Summary Builder ──

function buildFinalSummary(goal: string, steps: StepSummary[], conclusion: string): string {
  const succeeded = steps.filter(s => s.status === 'done').length;
  const failed = steps.filter(s => s.status !== 'done').length;
  const totalActions = steps.reduce((sum, s) => sum + s.actionsCount, 0);

  const lines = [
    `Goal: ${goal}`,
    `Result: ${conclusion}`,
    `Steps: ${succeeded} succeeded, ${failed} failed (${totalActions} total actions)`,
    '',
    ...steps.map(s => `  Step ${s.stepNumber} [${s.status}]: ${s.summary}`),
  ];

  return lines.join('\n');
}
