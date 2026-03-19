/**
 * middleAgent.ts — User-facing agent layer (qwen3.5:9b).
 *
 * Always responsive — even when backend orchestrators are running.
 * Handles message classification, status relays, and interrupt routing.
 *
 * System prompt: prompts/core/middle-agent.md
 * Identity block: prompts/core/identity.md
 */

import { ollamaService } from '../utils/ollama';
import { loadPromptBody } from '../utils/promptLoader';

// ─────────────────────────────────────────────────────────────
// Model constant
// ─────────────────────────────────────────────────────────────

export const MIDDLE_AGENT_MODEL = 'qwen3.5:9b';

// ─────────────────────────────────────────────────────────────
// Template helper
// ─────────────────────────────────────────────────────────────

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
// Prompt loading
// ─────────────────────────────────────────────────────────────

/** Inline fallback identity block (used if prompt file not found) */
const IDENTITY_FALLBACK = `You are **Nomad**, an autonomous AI agent built for creative marketing intelligence.
You are NOT Qwen, ChatGPT, Claude, LLaMA, GPT-OSS, or any other model. You are Nomad.
- If asked what model you are → "I'm Nomad."
- NEVER reveal underlying model names. NEVER start messages with "Sure!" or "Of course!".
- Direct, concise, no corporate language. No emoji spam, no filler phrases.`;

/** Inline fallback system prompt for middle agent */
const MIDDLE_AGENT_FALLBACK = `{identity_block}

You are the user's live interface to Nomad. You are ALWAYS responsive — even when backend agents are working.

Current time: {timeStr}

{user_memory}

Active tasks:
{active_tasks}

Respond to the user instantly. Classify messages as DIRECT/QUICK/MEDIUM/COMPLEX/INTERRUPT/CHAT.
If agents are busy, acknowledge, explain what's happening, relay instructions.
Keep responses concise: 1-2 sentences for status, brief summary for results.`;

/** Inline fallback for customer-success one-shot updates */
const CUSTOMER_SUCCESS_FALLBACK = `{identity_block}

You generate brief status updates for the user while backend agents are working.

Current task: {task_description}
Current agent: {active_agent}
Current step: {current_step} of {total_steps}
Last update sent: {seconds_since_last_update}s ago
Latest agent output snippet: {latest_output_snippet}

Write ONE sentence telling the user what's happening right now. Be specific.`;

function getIdentityBlock(): string {
  const loaded = loadPromptBody('core/identity.md');
  return loaded || IDENTITY_FALLBACK;
}

function getMiddleAgentSystemPrompt(): string {
  const loaded = loadPromptBody('core/middle-agent.md');
  return loaded || MIDDLE_AGENT_FALLBACK;
}

function getCustomerSuccessPrompt(): string {
  const loaded = loadPromptBody('core/customer-success.md');
  return loaded || CUSTOMER_SUCCESS_FALLBACK;
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ActiveTaskSummary {
  id: string;
  description: string;
  phase: string;
  stepProgress: string; // e.g. "3/7"
  latestOutput: string; // last ~200 chars of output
}

export interface MiddleAgentOptions {
  userMessage: string;
  userMemory: string;        // formatted user profile
  activeTasks: ActiveTaskSummary[];
  currentTime: string;
  onChunk: (text: string) => void;
  onStatusUpdate?: (update: string) => void;
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatActiveTasks(tasks: ActiveTaskSummary[]): string {
  if (tasks.length === 0) return '(none)';
  return tasks
    .map(t =>
      `- [${t.id}] ${t.description} | phase: ${t.phase} | progress: ${t.stepProgress}\n  latest: ${t.latestOutput.slice(-200)}`
    )
    .join('\n');
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Stream a middle-agent response to the user.
 * Non-blocking from the caller's perspective — chunks arrive via onChunk.
 * Returns the full accumulated response when streaming completes.
 */
export async function runMiddleAgent(options: MiddleAgentOptions): Promise<string> {
  const { userMessage, userMemory, activeTasks, currentTime, onChunk, onStatusUpdate, signal } = options;

  const identityBlock = getIdentityBlock();
  const systemTemplate = getMiddleAgentSystemPrompt();

  const systemPrompt = fillTemplate(systemTemplate, {
    identity_block: identityBlock,
    timeStr: currentTime,
    user_memory: userMemory || '(no user profile yet)',
    active_tasks: formatActiveTasks(activeTasks),
  });

  onStatusUpdate?.('middle-agent: generating response');

  const result = await ollamaService.generateStream(
    userMessage,
    systemPrompt,
    {
      model: MIDDLE_AGENT_MODEL,
      temperature: 0.7,
      onChunk,
      signal,
    }
  );

  return result;
}

/**
 * One-shot status update for customer-success keepalive.
 * Returns a single sentence describing current agent activity.
 * Does NOT stream — returns the full string when done.
 */
export async function generateStatusUpdate(
  taskDescription: string,
  activeAgent: string,
  currentStep: number,
  totalSteps: number,
  secondsSinceLastUpdate: number,
  latestOutputSnippet: string,
  signal?: AbortSignal
): Promise<string> {
  const identityBlock = getIdentityBlock();
  const promptTemplate = getCustomerSuccessPrompt();

  const systemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    task_description: taskDescription,
    active_agent: activeAgent,
    current_step: String(currentStep),
    total_steps: String(totalSteps),
    seconds_since_last_update: String(secondsSinceLastUpdate),
    latest_output_snippet: latestOutputSnippet.slice(-300),
  });

  const result = await ollamaService.generateStream(
    'Generate the status update now.',
    systemPrompt,
    {
      model: MIDDLE_AGENT_MODEL,
      temperature: 0.5,
      num_predict: 80,
      signal,
    }
  );

  return result.trim();
}
