/**
 * Executor Agent -- runs a single step from the plan using a vision-action loop.
 *
 * For each step, iterates up to MAX_ITERATIONS times:
 *   1. Optionally analyze the screen (vision) for context
 *   2. Get the element list from sandbox.view()
 *   3. Ask the LLM to decide the next action
 *   4. Execute the action via sandbox
 *   5. Post-action vision check
 *   6. Record results, detect stuck states
 */

import { ollamaService } from '../ollama';
import { analyzeScreen } from './visionAgent';
import type { ScreenState } from './visionAgent';
import { MachineClient, machinePool } from '../sandboxService';

// ── Constants ──

const MAX_ITERATIONS = 10;
const EXECUTOR_MODEL = 'qwen3.5:4b';
const EXECUTOR_TEMPERATURE = 0.2;
const EXECUTOR_MAX_TOKENS = 200;
const ACTION_TIMEOUT_MS = 15000;

/** Actions that need a vision pass before executing */
const NEEDS_VISION: Set<string> = new Set(['click', 'type', 'navigate']);

// ── Types ──

export interface ExecutorAction {
  type: 'click' | 'type' | 'scroll' | 'navigate' | 'press_key' | 'wait' | 'done';
  index?: number;
  text?: string;
  direction?: 'up' | 'down';
  reason: string;
}

export interface ActionRecord {
  action: ExecutorAction;
  visionBefore?: string;
  visionAfter?: string;
  succeeded: boolean;
  error?: string;
}

export interface StepResult {
  status: 'done' | 'failed' | 'stuck';
  actionsTaken: ActionRecord[];
  summary: string;
  finalScreenDescription: string;
}

export interface StepCallbacks {
  onAction?: (action: ExecutorAction, record: ActionRecord) => void;
  onVision?: (screenState: ScreenState, screenshotB64?: string) => void;
  onStream?: (text: string) => void;
}

// ── Executor System Prompt ──

const EXECUTOR_SYSTEM = `You are a browser automation executor. Given the current step, screen description, and available elements, decide the next action.

Output JSON only, no markdown fences:
{"type":"click","index":3,"reason":"Click the search box"}

Action types:
- click: click element by index. Requires "index".
- type: type text into element by index. Requires "index" and "text".
- scroll: scroll the page. Requires "direction" ("up" or "down").
- navigate: go to a URL. Requires "text" (the URL).
- press_key: press a keyboard key. Requires "text" (the key name, e.g. "Enter", "Tab", "Escape").
- wait: pause briefly. No extra fields needed.
- done: the step is complete. Use when the expected outcome is achieved.

Rules:
- If the target element is visible in the element list, act on it immediately.
- If the target is not visible, scroll to find it.
- Use "done" as soon as the step's expected outcome is met.
- Always include a "reason" explaining why you chose this action.`;

// ── Helpers ──

/** Strip <think>...</think> blocks from LLM output */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Parse JSON from LLM response, tolerating surrounding text */
function parseAction(raw: string): ExecutorAction | null {
  const cleaned = stripThinking(raw);
  const match = cleaned.match(/\{[\s\S]*?\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed.type) return null;
    return {
      type: parsed.type,
      index: parsed.index,
      text: parsed.text,
      direction: parsed.direction,
      reason: parsed.reason || 'no reason given',
    };
  } catch {
    return null;
  }
}

/** Get a sandbox client -- use provided machineId or fall back to default */
function getSandbox(machineId?: string): MachineClient {
  if (machineId) {
    const machine = machinePool.get(machineId);
    if (machine) return machine;
  }
  return machinePool.getDefault();
}

// ── Main Step Executor ──

export async function executeStep(
  step: { stepNumber: number; description: string; expectedOutcome: string },
  goal: string,
  previousStepsSummary: string,
  callbacks: StepCallbacks,
  machineId?: string,
  signal?: AbortSignal,
): Promise<StepResult> {
  const sandbox = getSandbox(machineId);
  const actionsTaken: ActionRecord[] = [];
  let consecutiveFailures = 0;
  let lastScreenDescription = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) {
      return {
        status: 'failed',
        actionsTaken,
        summary: 'Aborted by user',
        finalScreenDescription: lastScreenDescription,
      };
    }

    // ── 1. Determine what action the LLM wants (need vision context first?) ──
    // On first iteration or after a meaningful action, get vision context.
    // For subsequent iterations we already have context from the post-action check.
    let visionReport: string | undefined;

    // Get vision on first iteration, or if the last action was a NEEDS_VISION type
    const lastAction = actionsTaken.length > 0 ? actionsTaken[actionsTaken.length - 1].action : null;
    const needsVision = iteration === 0 || !lastAction || NEEDS_VISION.has(lastAction.type);

    if (needsVision) {
      try {
        const screenState = await analyzeScreen(goal, step.description, machineId, signal);
        visionReport = screenState.description;
        lastScreenDescription = screenState.description;
        callbacks.onVision?.(screenState, screenState.screenshotBase64);
      } catch (err) {
        // Vision is helpful but not required -- continue without it
        console.warn('[executorAgent] Vision analysis failed:', err);
      }
    }

    if (signal?.aborted) break;

    // ── 2. Get element list from sandbox ──
    let elementsText = '';
    try {
      const viewResult = await sandbox.view();
      elementsText = sandbox.formatElements(viewResult.elements).slice(0, 3000);
    } catch (err) {
      console.warn('[executorAgent] sandbox.view() failed:', err);
      // If we can't get elements, we can't proceed
      return {
        status: 'failed',
        actionsTaken,
        summary: `sandbox.view() failed: ${err}`,
        finalScreenDescription: lastScreenDescription,
      };
    }

    // ── 3. Build prompt for executor LLM ──
    const previousActionsText = actionsTaken
      .slice(-5)
      .map((r, i) => `  ${i + 1}. [${r.action.type}] ${r.action.reason} -- ${r.succeeded ? 'OK' : 'FAILED' + (r.error ? ': ' + r.error : '')}`)
      .join('\n');

    const prompt = [
      `GOAL: ${goal}`,
      `CURRENT STEP (${step.stepNumber}): ${step.description}`,
      `EXPECTED OUTCOME: ${step.expectedOutcome}`,
      previousStepsSummary ? `PREVIOUS STEPS: ${previousStepsSummary}` : '',
      visionReport ? `SCREEN STATE:\n${visionReport}` : '',
      elementsText ? `VISIBLE ELEMENTS:\n${elementsText}` : 'No interactive elements found.',
      previousActionsText ? `ACTIONS TAKEN THIS STEP:\n${previousActionsText}` : '',
      'Decide the next action. JSON only.',
    ].filter(Boolean).join('\n\n');

    // ── 4. Ask LLM for next action ──
    let raw = '';
    try {
      await ollamaService.generateStream(prompt, EXECUTOR_SYSTEM, {
        model: EXECUTOR_MODEL,
        temperature: EXECUTOR_TEMPERATURE,
        num_predict: EXECUTOR_MAX_TOKENS,
        signal,
        onChunk: (chunk: string) => {
          raw += chunk;
          callbacks.onStream?.(chunk);
        },
      });
    } catch (err) {
      if (signal?.aborted) break;
      console.error('[executorAgent] LLM call failed:', err);
      return {
        status: 'failed',
        actionsTaken,
        summary: `LLM call failed: ${err}`,
        finalScreenDescription: lastScreenDescription,
      };
    }

    // ── 5. Parse the action ──
    const action = parseAction(raw);
    if (!action) {
      // Could not parse -- record as failure and try again
      const record: ActionRecord = {
        action: { type: 'wait', reason: 'Could not parse LLM response' },
        succeeded: false,
        error: 'Failed to parse action JSON from LLM output',
      };
      actionsTaken.push(record);
      callbacks.onAction?.(record.action, record);
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        return {
          status: 'stuck',
          actionsTaken,
          summary: '3 consecutive failures -- agent is stuck',
          finalScreenDescription: lastScreenDescription,
        };
      }
      continue;
    }

    // ── 6. If done, return success ──
    if (action.type === 'done') {
      const record: ActionRecord = { action, succeeded: true };
      actionsTaken.push(record);
      callbacks.onAction?.(action, record);

      const summary = actionsTaken
        .filter(r => r.action.type !== 'done')
        .map(r => r.action.reason)
        .join(', ');

      return {
        status: 'done',
        actionsTaken,
        summary: summary || 'Step completed',
        finalScreenDescription: lastScreenDescription,
      };
    }

    // ── 7. Execute the action via sandbox (with per-action timeout) ──
    const record: ActionRecord = { action, succeeded: false };

    /** Abort-aware timeout wrapper for a single sandbox call */
    function withTimeout<T>(promise: Promise<T>): Promise<T> {
      let timerId: ReturnType<typeof setTimeout>;
      return Promise.race([
        promise.then(
          (v) => { clearTimeout(timerId); return v; },
          (e) => { clearTimeout(timerId); throw e; },
        ),
        new Promise<never>((_, reject) => {
          timerId = setTimeout(() => reject(new Error(`Action timed out after ${ACTION_TIMEOUT_MS}ms`)), ACTION_TIMEOUT_MS);
          // Cancel the timeout immediately if abort fires
          signal?.addEventListener('abort', () => { clearTimeout(timerId); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
        }),
      ]);
    }

    try {
      switch (action.type) {
        case 'click':
          if (action.index != null) {
            await withTimeout(sandbox.click(action.index));
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            record.succeeded = true;
          } else {
            record.error = 'No index provided for click';
          }
          break;

        case 'type':
          if (action.index != null && action.text) {
            await withTimeout(sandbox.input(action.index, action.text));
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            record.succeeded = true;
          } else {
            record.error = 'Missing index or text for type action';
          }
          break;

        case 'scroll':
          await withTimeout(sandbox.scroll(action.direction || 'down', 3));
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          record.succeeded = true;
          break;

        case 'navigate':
          if (action.text) {
            await withTimeout(sandbox.navigate(action.text));
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            record.succeeded = true;
          } else {
            record.error = 'No URL provided for navigate';
          }
          break;

        case 'press_key':
          if (action.text) {
            await withTimeout(sandbox.pressKey(action.text));
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            record.succeeded = true;
          } else {
            record.error = 'No key specified for press_key';
          }
          break;

        case 'wait':
          await new Promise<void>((resolve, reject) => {
            if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
            const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', onAbort);
              resolve();
            }, 1500);
            signal?.addEventListener('abort', onAbort, { once: true });
          });
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          record.succeeded = true;
          break;

        default:
          record.error = `Unknown action type: ${action.type}`;
          break;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Propagate abort upward -- don't record as a normal failure
        return {
          status: 'failed',
          actionsTaken,
          summary: 'Aborted by user',
          finalScreenDescription: lastScreenDescription,
        };
      }
      record.error = String(err);
      record.succeeded = false;
    }

    // ── 8. Post-action vision check (for click, type, navigate) ──
    if (record.succeeded && NEEDS_VISION.has(action.type) && !signal?.aborted) {
      try {
        const postScreen = await analyzeScreen(goal, step.description, machineId, signal);
        record.visionAfter = postScreen.description;
        lastScreenDescription = postScreen.description;
        callbacks.onVision?.(postScreen, postScreen.screenshotBase64);
      } catch {
        // Non-critical -- continue without post-action vision
      }
    }

    // ── 9. Record the action ──
    actionsTaken.push(record);
    callbacks.onAction?.(action, record);

    // ── 10. Track consecutive failures ──
    if (record.succeeded) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        return {
          status: 'stuck',
          actionsTaken,
          summary: `3 consecutive failures -- last error: ${record.error || 'unknown'}`,
          finalScreenDescription: lastScreenDescription,
        };
      }
    }
  }

  // Exhausted MAX_ITERATIONS without completing
  const summary = actionsTaken
    .filter(r => r.action.type !== 'done')
    .map(r => `${r.action.type}: ${r.action.reason}`)
    .join(', ');

  return {
    status: 'failed',
    actionsTaken,
    summary: `Exhausted ${MAX_ITERATIONS} iterations without completing step. Actions: ${summary}`,
    finalScreenDescription: lastScreenDescription,
  };
}
