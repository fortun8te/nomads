/**
 * orchestratorComplex.ts — Long-running phased task orchestrator (qwen3.5:9b).
 *
 * Handles deep, multi-phase tasks (minutes to hours).
 * Between phases: compresses everything, saves to workspace, restarts fresh context.
 * Supports checkpoints where user provides direction.
 *
 * System prompt: prompts/orchestration/orchestrator-complex.md
 * Identity block: prompts/core/identity.md
 */

import { ollamaService } from '../utils/ollama';
import { loadPromptBody } from '../utils/promptLoader';
import { fillTemplate } from './middleAgent';
import type { OrchestrationStep, WorkingMemoryData, OrchestratorOptions } from './orchestratorMedium';

// NOTE: A local compressContext stub is used here for in-loop step/phase output compression.
// Full context persistence (rolling window + phase transitions) is handled by contextManager.ts.
// For the orchestrator's inline compression we keep a lightweight local version to avoid
// threading the full IDB interface through the execution loop.

// ─────────────────────────────────────────────────────────────
// Model constant
// ─────────────────────────────────────────────────────────────

export const COMPLEX_ORCH_MODEL = 'qwen3.5:9b';

// ─────────────────────────────────────────────────────────────
// Local compression helper (inline — for in-loop step/phase output compression)
// ─────────────────────────────────────────────────────────────
async function compressContext(
  text: string,
  targetTokens: number,
  signal?: AbortSignal
): Promise<string> {
  if (text.length < targetTokens * 4) return text; // rough char-to-token estimate
  const compressionPrompt = `Compress the following into ~${targetTokens} tokens. Keep all key facts, decisions, and data points. Be dense.\n\n${text.slice(0, 8000)}`;
  try {
    return await ollamaService.generateStream(
      compressionPrompt,
      'You are a lossless compressor. Preserve all important information in minimal tokens.',
      { model: 'qwen3.5:2b', temperature: 0.2, num_predict: targetTokens, signal }
    );
  } catch {
    return text.slice(0, targetTokens * 4) + '...[compressed]';
  }
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ComplexOrchestrationOptions extends OrchestratorOptions {
  onPhaseComplete?: (phaseNum: number, summary: string) => void;
  onCheckpoint?: (question: string) => Promise<string>; // user answers
}

// Re-export shared types for convenience
export type { OrchestrationStep, WorkingMemoryData, OrchestratorOptions };

// Internal plan types
interface RawPhaseStep {
  agent: string;
  do: string;
}

interface RawPhase {
  id: number;
  name: string;
  steps: RawPhaseStep[];
  est?: string;
  needs?: number[];
}

interface RawComplexPlan {
  phases: RawPhase[];
  checkpoints?: number[];
  total_est?: string;
  output_format?: string;
}

// ─────────────────────────────────────────────────────────────
// Prompt loading
// ─────────────────────────────────────────────────────────────

const IDENTITY_FALLBACK = `You are Nomad, an autonomous AI agent for creative marketing intelligence.
Be direct, concise. No filler.`;

const COMPLEX_ORCH_FALLBACK = `{identity_block}

You orchestrate complex, long-running tasks broken into phases.
Task: {task_description}
Working memory: {working_memory}
Previous phase summaries: {phase_summaries}

Output a JSON phase plan:
{"phases": [{"id": 1, "name": "Discovery", "steps": [{"agent": "wayfayer", "do": "Search"}], "est": "5 min"}], "checkpoints": [2]}

Between phases compress all output. Keep working memory under 3K tokens.`;

function getIdentityBlock(): string {
  return loadPromptBody('core/identity.md') || IDENTITY_FALLBACK;
}

function getComplexOrchPrompt(): string {
  return loadPromptBody('orchestration/orchestrator-complex.md') || COMPLEX_ORCH_FALLBACK;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function serializeWorkingMemory(wm: WorkingMemoryData): string {
  return JSON.stringify(wm, null, 2);
}

/**
 * Extract JSON from LLM output (handles fenced code blocks).
 */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text.trim();
}

/**
 * Parse the LLM complex plan JSON.
 */
function parseComplexPlan(raw: string): RawComplexPlan | null {
  try {
    const jsonStr = extractJSON(raw);
    const plan = JSON.parse(jsonStr) as RawComplexPlan;
    if (!Array.isArray(plan.phases) || plan.phases.length === 0) return null;
    return plan;
  } catch {
    return null;
  }
}

/**
 * Dispatch a single step (stubbed — real dispatch via agentCoordinator TBD).
 */
async function dispatchStep(
  phaseId: number,
  stepIndex: number,
  rawStep: RawPhaseStep,
  taskId: string,
  onStep?: (step: OrchestrationStep) => void,
  signal?: AbortSignal
): Promise<string> {
  const step: OrchestrationStep = {
    id: phaseId * 100 + stepIndex,
    agent: rawStep.agent ?? 'self',
    do: rawStep.do ?? '',
    status: 'running',
  };
  onStep?.(step);

  console.log(`[orchestrator-complex][${taskId}] Phase ${phaseId}, step ${stepIndex} → agent:${rawStep.agent} — ${rawStep.do}`);

  // TODO: Wire to agentCoordinator.dispatch when available
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  console.warn('[STUB] dispatchStep not wired to real agent dispatch');
  const stubOutput = `[Phase ${phaseId} / Step ${stepIndex} stub] Agent "${rawStep.agent}" completed: ${rawStep.do}`;

  onStep?.({ ...step, status: 'done', output: stubOutput });
  return stubOutput;
}

/**
 * Execute all steps in a single phase. Returns combined output string.
 */
async function executePhase(
  phase: RawPhase,
  taskId: string,
  onStep?: (step: OrchestrationStep) => void,
  onStatusEvent?: (event: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const phaseOutputs: string[] = [];

  for (let i = 0; i < phase.steps.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const rawStep = phase.steps[i];
    onStatusEvent?.(`Phase ${phase.id} "${phase.name}": step ${i + 1}/${phase.steps.length} — ${rawStep.do}`);

    let stepOutput = '';
    let succeeded = false;

    // First attempt
    try {
      stepOutput = await dispatchStep(phase.id, i + 1, rawStep, taskId, onStep, signal);
      succeeded = true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      console.warn(`[orchestrator-complex][${taskId}] Phase ${phase.id} step ${i + 1} failed (attempt 1): ${String(err)}`);
      onStatusEvent?.(`Phase ${phase.id} step ${i + 1} failed, retrying...`);

      // Retry once
      try {
        stepOutput = await dispatchStep(
          phase.id,
          i + 1,
          { ...rawStep, do: rawStep.do + ' (retry)' },
          taskId,
          onStep,
          signal
        );
        succeeded = true;
      } catch (retryErr) {
        if (retryErr instanceof DOMException && retryErr.name === 'AbortError') throw retryErr;
        stepOutput = `[SKIPPED] Phase ${phase.id} step ${i + 1} (${rawStep.agent}): ${rawStep.do} — failed. Error: ${String(retryErr)}`;
        const failedStep: OrchestrationStep = {
          id: phase.id * 100 + (i + 1),
          agent: rawStep.agent ?? 'self',
          do: rawStep.do ?? '',
          status: 'failed',
          output: stepOutput,
        };
        onStep?.(failedStep);
        console.warn(`[orchestrator-complex][${taskId}] Phase ${phase.id} step ${i + 1} skipped`);
        onStatusEvent?.(`Step skipped — continuing`);
      }
    }

    if (succeeded) {
      console.warn('[orchestratorComplex] step succeeded:', step.id);
    }

    phaseOutputs.push(stepOutput);
  }

  return phaseOutputs.join('\n\n');
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Run the complex orchestrator for a long, phased task.
 *
 * Flow:
 * 1. Generate phase plan via Qwen 9B
 * 2. For each phase:
 *    a. Execute all steps (dispatch, retry on failure)
 *    b. Compress phase output via compressContext
 *    c. Accumulate phase summary
 *    d. If phase is a checkpoint → call onCheckpoint, incorporate answer
 *    e. Fire onPhaseComplete
 * 3. Synthesize final result from all phase summaries
 * 4. Return final result string
 */
export async function runOrchestratorComplex(options: ComplexOrchestrationOptions): Promise<string> {
  const {
    taskId,
    taskDescription,
    userMemory,
    workingMemory,
    onStep,
    onStatusEvent,
    onComplete,
    onPhaseComplete,
    onCheckpoint,
    signal,
  } = options;

  const identityBlock = getIdentityBlock();
  const promptTemplate = getComplexOrchPrompt();

  // ── Step 1: Generate phase plan ───────────────────────────
  onStatusEvent?.('Deep-planning task phases...');
  console.log(`[orchestrator-complex][${taskId}] Generating phase plan for: ${taskDescription}`);

  const systemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    timeStr: new Date().toISOString(),
    user_memory: userMemory || '(no user profile)',
    task_description: taskDescription,
    working_memory: serializeWorkingMemory(workingMemory),
    phase_summaries: '(none yet — first planning pass)',
  });

  let planText = '';
  await ollamaService.generateStream(
    `Task: ${taskDescription}\n\nGenerate the JSON phase plan now.`,
    systemPrompt,
    {
      model: COMPLEX_ORCH_MODEL,
      temperature: 0.4,
      num_predict: 800,
      onChunk: (chunk) => { planText += chunk; },
      signal,
    }
  );

  const plan = parseComplexPlan(planText);
  if (!plan || plan.phases.length === 0) {
    const errMsg = `Failed to parse complex orchestration plan. Raw output:\n${planText}`;
    onStatusEvent?.(errMsg);
    onComplete?.(errMsg);
    return errMsg;
  }

  const checkpointPhases = new Set(plan.checkpoints ?? []);
  onStatusEvent?.(`Plan ready: ${plan.phases.length} phases${plan.total_est ? ` (~${plan.total_est})` : ''}`);
  console.log(`[orchestrator-complex][${taskId}] Plan: ${plan.phases.length} phases`);

  // ── Step 2: Execute phases ─────────────────────────────────
  const phaseSummaries: string[] = [];
  const localMemory = { ...workingMemory };

  for (const phase of plan.phases) {
    if (signal?.aborted) {
      onStatusEvent?.('Aborted by user.');
      break;
    }

    onStatusEvent?.(`Starting phase ${phase.id}: ${phase.name}${phase.est ? ` (~${phase.est})` : ''}`);
    console.log(`[orchestrator-complex][${taskId}] Phase ${phase.id}: ${phase.name}`);

    // Execute all steps in this phase
    let phaseRawOutput = '';
    try {
      phaseRawOutput = await executePhase(phase, taskId, onStep, onStatusEvent, signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      phaseRawOutput = `[Phase ${phase.id} error] ${String(err)}`;
      onStatusEvent?.(`Phase ${phase.id} error — saving partial and continuing`);
      console.error(`[orchestrator-complex][${taskId}] Phase ${phase.id} failed:`, err);
    }

    // ── Phase transition: compress ─────────────────────────
    onStatusEvent?.(`Compressing phase ${phase.id} output...`);
    const phaseSummary = await compressContext(phaseRawOutput, 500, signal);
    phaseSummaries.push(`## Phase ${phase.id}: ${phase.name}\n${phaseSummary}`);

    // Update working memory with phase summary
    localMemory.keyFacts[`phase_${phase.id}`] = phaseSummary.slice(0, 400);
    localMemory.decisions.push(`Phase ${phase.id} (${phase.name}) completed`);

    onPhaseComplete?.(phase.id, phaseSummary);
    onStatusEvent?.(`Phase ${phase.id} complete.`);

    // ── Checkpoint: pause and ask user ─────────────────────
    if (checkpointPhases.has(phase.id) && onCheckpoint) {
      const checkpointQ = buildCheckpointQuestion(phase, phaseSummary);
      onStatusEvent?.(`Checkpoint: waiting for user direction...`);
      console.log(`[orchestrator-complex][${taskId}] Checkpoint at phase ${phase.id}`);

      let userAnswer = '';
      try {
        userAnswer = await onCheckpoint(checkpointQ);
      } catch {
        userAnswer = '(no response — continuing with best judgment)';
      }

      if (userAnswer) {
        localMemory.decisions.push(`Checkpoint ${phase.id} user direction: ${userAnswer}`);
        onStatusEvent?.(`Direction received: ${userAnswer.slice(0, 100)}`);
      }
    }
  }

  // ── Step 3: Synthesize final result ───────────────────────
  onStatusEvent?.('Synthesizing final result across all phases...');

  const allPhaseSummaries = phaseSummaries.join('\n\n');
  const finalSynthPrompt = `Task: ${taskDescription}

Phase summaries:
${allPhaseSummaries}

Write a comprehensive final result for the user. Include: key findings, strategic insights, deliverables produced, and any recommended next steps.`;

  // Rebuild system prompt with accumulated phase summaries for final synthesis
  const finalSystemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    timeStr: new Date().toISOString(),
    user_memory: userMemory || '(no user profile)',
    task_description: taskDescription,
    working_memory: serializeWorkingMemory(localMemory),
    phase_summaries: allPhaseSummaries,
  });

  let finalResult = '';
  await ollamaService.generateStream(
    finalSynthPrompt,
    finalSystemPrompt,
    {
      model: COMPLEX_ORCH_MODEL,
      temperature: 0.6,
      num_predict: 1200,
      onChunk: (chunk) => { finalResult += chunk; },
      signal,
    }
  );

  finalResult = finalResult.trim() || allPhaseSummaries;

  onStatusEvent?.('Done.');
  onComplete?.(finalResult);
  return finalResult;
}

// ─────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────

function buildCheckpointQuestion(phase: RawPhase, summary: string): string {
  return `Phase "${phase.name}" complete.\n\n${summary.slice(0, 600)}\n\nWhat direction should I take for the next phase? (Or reply "continue" to proceed with my best judgment.)`;
}
