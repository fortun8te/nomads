/**
 * Planner Agent -- creates and revises plans for browser automation.
 *
 * Two entry points:
 *   createPlan()  -- generate an initial plan from a user goal + screen state
 *   checkPlan()   -- after each step, decide whether to continue, replan, or stop
 *
 * Dedicated model: gpt-oss-20b (resident GPU model).
 */

import { ollamaService } from '../ollama';

// ── Types ──

export interface PlanStep {
  stepNumber: number;
  description: string;
  expectedOutcome: string;
}

export interface AgentPlan {
  steps: PlanStep[];
  reasoning: string;
}

export interface StepSummary {
  stepNumber: number;
  description: string;
  status: 'done' | 'failed' | 'stuck';
  summary: string;
  actionsCount: number;
}

export interface PlanRevision {
  action: 'continue' | 'replan' | 'done' | 'abort';
  updatedSteps?: PlanStep[];
  reason: string;
  goalAchieved?: boolean;
}

// ── Constants ──

const PLANNER_MODEL = 'gpt-oss-20b';

// ── Helpers ──

/** Strip <think>...</think> tags that some models emit. */
function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Extract the first JSON object from a string. */
function extractJSON(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

/** Attempt to clean and parse JSON, handling common LLM quirks. */
function cleanAndParseJSON<T>(raw: string): T | null {
  const cleaned = stripThinkingTags(raw);
  const jsonStr = extractJSON(cleaned);
  if (!jsonStr) return null;

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Try fixing trailing commas
    try {
      const fixed = jsonStr.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(fixed) as T;
    } catch {
      return null;
    }
  }
}

// ── System Prompts ──

const CREATE_PLAN_SYSTEM = `You are a browser automation planner. Given a user's goal and current screen state, break the goal into 3-8 clear, actionable steps. Each step should be one logical action (navigate, search, click, fill form, etc.).

Output JSON only -- no markdown fences, no explanation outside the JSON.

Format:
{
  "steps": [
    {"stepNumber": 1, "description": "Navigate to example.com", "expectedOutcome": "Example.com homepage loads"},
    {"stepNumber": 2, "description": "Click the search box", "expectedOutcome": "Search box is focused and ready for input"}
  ],
  "reasoning": "Brief explanation of your approach"
}

Rules:
- Only reference elements visible in the element list or screen description. If a target is not visible, add a scroll or navigate step first.
- Be specific: "Click the 'Add to Cart' button" not "Add item". Quote exact text when possible.
- Each step = one user-visible action. Do not combine multiple actions into one step.
- If already on the right page, skip navigation.
- Prefer the shortest path to the goal.`;

const CHECK_PLAN_SYSTEM = `You are reviewing progress on a browser automation task. Given the goal, original plan, completed steps, and current screen state, decide what to do next.

Output JSON only -- no markdown fences, no explanation outside the JSON.

Format:
{
  "action": "continue" | "replan" | "done" | "abort",
  "updatedSteps": [{"stepNumber": 1, "description": "...", "expectedOutcome": "..."}],
  "reason": "Why you chose this action",
  "goalAchieved": true | false
}

Actions:
- "continue": remaining steps in the original plan are still valid, proceed with the next one.
- "replan": the situation changed -- provide new updatedSteps for the remaining work.
- "done": the goal has been fully achieved, stop execution. Set goalAchieved to true.
- "abort": the goal is impossible or blocked, give up. Set goalAchieved to false.

Only include updatedSteps when action is "replan".`;

// ── Main Functions ──

/**
 * Create an initial plan from a user goal and current screen state.
 */
export async function createPlan(
  goal: string,
  screenDescription: string,
  elementsText: string,
  signal?: AbortSignal,
): Promise<AgentPlan> {
  const prompt = [
    `GOAL: ${goal}`,
    screenDescription ? `CURRENT SCREEN:\n${screenDescription}` : '',
    elementsText ? `VISIBLE ELEMENTS:\n${elementsText.slice(0, 3000)}` : 'No interactive elements detected.',
    'Create a step-by-step plan.',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  await ollamaService.generateStream(prompt, CREATE_PLAN_SYSTEM, {
    model: PLANNER_MODEL,
    temperature: 0.4,
    num_predict: 800,
    think: true,
    signal,
    onChunk: (c: string) => { raw += c; },
  });

  if (signal?.aborted) {
    return { steps: [], reasoning: 'Aborted' };
  }

  // Parse response
  const parsed = cleanAndParseJSON<{ steps: Array<{ stepNumber?: number; description: string; expectedOutcome?: string }>; reasoning?: string }>(raw);

  if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
    const steps: PlanStep[] = parsed.steps.map((s, i) => ({
      stepNumber: s.stepNumber ?? i + 1,
      description: s.description,
      expectedOutcome: s.expectedOutcome ?? '',
    }));
    return {
      steps,
      reasoning: parsed.reasoning ?? '',
    };
  }

  // Fallback: single-step plan using the goal directly
  console.error('[plannerAgent] Failed to parse plan JSON, using fallback. Raw:', raw.slice(0, 200));
  return {
    steps: [{ stepNumber: 1, description: goal, expectedOutcome: 'Goal completed' }],
    reasoning: 'Fallback -- could not parse planner response',
  };
}

/**
 * After-step check-in: review progress and decide next action.
 */
export async function checkPlan(
  goal: string,
  originalPlan: AgentPlan,
  completedSteps: StepSummary[],
  latestStepResult: StepSummary,
  screenDescription: string,
  signal?: AbortSignal,
): Promise<PlanRevision> {
  const completedSummary = completedSteps
    .map(s => `Step ${s.stepNumber} [${s.status}]: ${s.description} -- ${s.summary} (${s.actionsCount} actions)`)
    .join('\n');

  const remainingSteps = originalPlan.steps
    .filter(s => s.stepNumber > latestStepResult.stepNumber)
    .map(s => `Step ${s.stepNumber}: ${s.description} (expected: ${s.expectedOutcome})`)
    .join('\n');

  const prompt = [
    `GOAL: ${goal}`,
    `ORIGINAL PLAN:\n${originalPlan.steps.map(s => `Step ${s.stepNumber}: ${s.description}`).join('\n')}`,
    `COMPLETED STEPS:\n${completedSummary}`,
    `LATEST RESULT:\nStep ${latestStepResult.stepNumber} [${latestStepResult.status}]: ${latestStepResult.description}\nSummary: ${latestStepResult.summary}`,
    remainingSteps ? `REMAINING STEPS:\n${remainingSteps}` : 'No remaining steps.',
    screenDescription ? `CURRENT SCREEN:\n${screenDescription}` : '',
    'Decide what to do next.',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  await ollamaService.generateStream(prompt, CHECK_PLAN_SYSTEM, {
    model: PLANNER_MODEL,
    temperature: 0.3,
    num_predict: 600,
    think: true,
    signal,
    onChunk: (c: string) => { raw += c; },
  });

  if (signal?.aborted) {
    return { action: 'abort', reason: 'Aborted' };
  }

  // Parse response
  const parsed = cleanAndParseJSON<{
    action?: string;
    updatedSteps?: Array<{ stepNumber?: number; description: string; expectedOutcome?: string }>;
    reason?: string;
    goalAchieved?: boolean;
  }>(raw);

  if (parsed && parsed.action) {
    const action = (['continue', 'replan', 'done', 'abort'].includes(parsed.action)
      ? parsed.action
      : 'continue') as PlanRevision['action'];

    const revision: PlanRevision = {
      action,
      reason: parsed.reason ?? '',
      goalAchieved: parsed.goalAchieved,
    };

    if (action === 'replan' && Array.isArray(parsed.updatedSteps) && parsed.updatedSteps.length > 0) {
      revision.updatedSteps = parsed.updatedSteps.map((s, i) => ({
        stepNumber: s.stepNumber ?? i + 1,
        description: s.description,
        expectedOutcome: s.expectedOutcome ?? '',
      }));
    }

    return revision;
  }

  // Fallback: assume continue
  console.error('[plannerAgent] Failed to parse check-plan JSON, defaulting to continue. Raw:', raw.slice(0, 200));
  return {
    action: 'continue',
    reason: 'Fallback -- could not parse planner response, continuing with current plan',
  };
}
