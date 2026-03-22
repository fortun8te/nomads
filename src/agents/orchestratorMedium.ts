/**
 * orchestratorMedium.ts — Multi-step task orchestrator (qwen3.5:4b).
 *
 * Breaks a task into 2-10 steps, dispatches to worker agents sequentially,
 * compresses output into working memory after each step, delivers final result.
 *
 * System prompt: prompts/orchestration/orchestrator-medium.md
 * Identity block: prompts/core/identity.md
 */

import { ollamaService } from '../utils/ollama';
import { loadPromptBody } from '../utils/promptLoader';

/**
 * Fill a prompt template by replacing {variable} placeholders.
 * All values are coerced to string. Unknown keys are left as-is.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

// ─────────────────────────────────────────────────────────────
// Model constant
// ─────────────────────────────────────────────────────────────

export const MEDIUM_ORCH_MODEL = 'qwen3.5:4b';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface OrchestrationStep {
  id: number;
  agent: string;   // 'wayfayer' | 'file-agent' | 'code-agent' | 'self' | etc.
  do: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  output?: string;
}

export interface WorkingMemoryData {
  keyFacts: Record<string, unknown>;
  decisions: string[];
  files: Record<string, string>;
  completedSteps: number[];
}

export interface OrchestratorOptions {
  taskId: string;
  taskDescription: string;
  userMemory: string;
  workingMemory: WorkingMemoryData;
  onStep?: (step: OrchestrationStep) => void;
  onStatusEvent?: (event: string) => void;
  onComplete?: (result: string) => void;
  signal?: AbortSignal;
}

// Internal shape returned by the LLM plan
interface RawPlanStep {
  id: number;
  agent: string;
  do: string;
}

interface RawPlan {
  steps: RawPlanStep[];
  output_format?: string;
}

// ─────────────────────────────────────────────────────────────
// Prompt loading
// ─────────────────────────────────────────────────────────────

const IDENTITY_FALLBACK = `You are Neuro, an autonomous AI agent for creative marketing intelligence.
Be direct, concise. No filler. No "Sure!" or "Of course!".`;

const MEDIUM_ORCH_FALLBACK = `{identity_block}

You orchestrate multi-step tasks. Task: {task_description}
Working memory: {working_memory}

Output a JSON plan with 2-10 steps:
{"steps": [{"id": 1, "agent": "wayfayer", "do": "Search for X"}], "output_format": "md"}

Agents: wayfayer, wayfayer-plus, file-agent, code-agent, deploy-agent, vision-agent, self.
After all steps complete, write a concise final result summary.`;

function getIdentityBlock(): string {
  return loadPromptBody('core/identity.txt') || IDENTITY_FALLBACK;
}

function getMediumOrchPrompt(): string {
  return loadPromptBody('orchestration/orchestrator-medium.txt') || MEDIUM_ORCH_FALLBACK;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function serializeWorkingMemory(wm: WorkingMemoryData): string {
  return JSON.stringify(wm, null, 2);
}

/**
 * Extract the first JSON object from a (possibly wrapped) LLM response.
 * Handles ```json ... ``` fences and bare JSON.
 */
function extractJSON(text: string): string {
  // Strip markdown fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Find first { ... } block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

/**
 * Parse the LLM's plan JSON into OrchestrationSteps.
 * Returns null if parsing fails.
 */
function parsePlan(raw: string): OrchestrationStep[] | null {
  try {
    const jsonStr = extractJSON(raw);
    const plan = JSON.parse(jsonStr) as RawPlan;
    if (!Array.isArray(plan.steps)) return null;
    return plan.steps.map(s => ({
      id: s.id,
      agent: s.agent ?? 'self',
      do: s.do ?? '',
      status: 'pending' as const,
    }));
  } catch {
    return null;
  }
}

/**
 * Dispatch a single step to the appropriate agent.
 * Currently stubbed — emits the onStep event and logs.
 * Real dispatch wiring happens in the agent coordinator layer.
 */
async function dispatchStep(
  step: OrchestrationStep,
  _taskId: string,
  onStep?: (step: OrchestrationStep) => void,
  signal?: AbortSignal
): Promise<string> {
  const running: OrchestrationStep = { ...step, status: 'running' };
  onStep?.(running);

  // Dispatching step

  // TODO: Wire to agentCoordinator dispatch when available
  // For now: return a stub output so the orchestrator loop can proceed
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  console.warn('[STUB] dispatchStep not wired to real agent dispatch');
  const stubOutput = `[Step ${step.id} stub] Agent "${step.agent}" completed: ${step.do}`;
  return stubOutput;
}

/**
 * Compress a step output into a short key-fact summary via Qwen 2B.
 * Falls back to a truncated raw string if the model call fails.
 */
async function compressStepOutput(
  stepId: number,
  output: string,
  signal?: AbortSignal
): Promise<string> {
  if (output.length < 500) return output;

  const compressionPrompt = `Summarize the following agent output into 3-5 key facts (bullet points). Be concise.\n\n${output.slice(0, 4000)}`;
  try {
    const summary = await ollamaService.generateStream(
      compressionPrompt,
      'You are a concise summarizer. Output bullet points only.',
      { model: 'qwen3.5:2b', temperature: 0.3, num_predict: 300, signal }
    );
    return `[Step ${stepId} summary]\n${summary.trim()}`;
  } catch {
    // Compression failed — truncate raw output
    return output.slice(0, 500) + (output.length > 500 ? '...[truncated]' : '');
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Run the medium orchestrator for a multi-step task.
 *
 * 1. Calls Qwen 4B to generate a JSON plan (2-10 steps)
 * 2. Executes steps sequentially via dispatchStep (stubbed)
 * 3. After each step: compresses output, updates working memory
 * 4. On error: retries once with a note, then skips
 * 5. Returns final result string
 */
export async function runOrchestratorMedium(options: OrchestratorOptions): Promise<string> {
  const {
    taskId,
    taskDescription,
    userMemory,
    workingMemory,
    onStep,
    onStatusEvent,
    onComplete,
    signal,
  } = options;

  const identityBlock = getIdentityBlock();
  const promptTemplate = getMediumOrchPrompt();

  // Build the system prompt
  const systemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    timeStr: new Date().toISOString(),
    user_memory: userMemory || '(no user profile)',
    task_description: taskDescription,
    working_memory: serializeWorkingMemory(workingMemory),
  });

  // ── Step 1: Generate plan ──────────────────────────────────
  onStatusEvent?.('Planning task...');
  // Generating plan

  let planText = '';
  await ollamaService.generateStream(
    `Task: ${taskDescription}\n\nGenerate the JSON plan now.`,
    systemPrompt,
    {
      model: MEDIUM_ORCH_MODEL,
      temperature: 0.4,
      num_predict: 600,
      onChunk: (chunk) => { planText += chunk; },
      signal,
    }
  );

  const steps = parsePlan(planText);
  if (!steps || steps.length === 0) {
    const errMsg = `Failed to parse orchestration plan. Raw LLM output:\n${planText}`;
    onStatusEvent?.(errMsg);
    onComplete?.(errMsg);
    return errMsg;
  }

  onStatusEvent?.(`Plan ready: ${steps.length} steps`);
  // Plan parsed

  // ── Step 2: Execute steps sequentially ────────────────────
  const completedOutputs: string[] = [];
  const localMemory = { ...workingMemory };
  localMemory.keyFacts = { ...(workingMemory.keyFacts ?? {}) };
  localMemory.files = { ...(workingMemory.files ?? {}) };

  for (const step of steps) {
    if (signal?.aborted) {
      onStatusEvent?.('Aborted by user.');
      break;
    }

    onStatusEvent?.(`Step ${step.id}/${steps.length}: ${step.do}`);

    let stepOutput = '';
    let succeeded = false;

    // First attempt
    try {
      stepOutput = await dispatchStep(step, taskId, onStep, signal);
      succeeded = true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      console.warn(`[orchestrator-medium][${taskId}] Step ${step.id} failed (attempt 1): ${String(err)}`);
      onStatusEvent?.(`Step ${step.id} failed, retrying...`);

      // Retry once
      try {
        stepOutput = await dispatchStep(
          { ...step, do: step.do + ' (retry with alternative approach)' },
          taskId,
          onStep,
          signal
        );
        succeeded = true;
      } catch (retryErr) {
        if (retryErr instanceof DOMException && retryErr.name === 'AbortError') throw retryErr;
        stepOutput = `[SKIPPED] Step ${step.id} (${step.agent}): ${step.do} — failed after retry. Error: ${String(retryErr)}`;
        console.warn(`[orchestrator-medium][${taskId}] Step ${step.id} skipped after retry failure`);
        onStatusEvent?.(`Step ${step.id} skipped — continuing`);
      }
    }

    // Emit done/failed event
    const doneStep: OrchestrationStep = {
      ...step,
      status: succeeded ? 'done' : 'failed',
      output: stepOutput,
    };
    onStep?.(doneStep);

    // Compress and update working memory
    const compressed = await compressStepOutput(step.id, stepOutput, signal);
    completedOutputs.push(compressed);
    localMemory.completedSteps = [...(localMemory.completedSteps ?? []), step.id];
    localMemory.keyFacts[`step_${step.id}`] = compressed.slice(0, 300);
  }

  // ── Step 3: Synthesize final result ───────────────────────
  onStatusEvent?.('Synthesizing final result...');

  const synthPrompt = `Task: ${taskDescription}

Completed step outputs:
${completedOutputs.join('\n\n')}

Write a concise final result summary for the user. Include key findings and any deliverable.`;

  let finalResult = '';
  await ollamaService.generateStream(
    synthPrompt,
    systemPrompt,
    {
      model: MEDIUM_ORCH_MODEL,
      temperature: 0.6,
      num_predict: 800,
      onChunk: (chunk) => { finalResult += chunk; },
      signal,
    }
  );

  finalResult = finalResult.trim() || completedOutputs.join('\n\n');

  onStatusEvent?.('Done.');
  onComplete?.(finalResult);
  return finalResult;
}
