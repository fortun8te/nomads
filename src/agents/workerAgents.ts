/**
 * workerAgents.ts — All 5 worker agent implementations in one module.
 *
 * Each agent:
 *   1. Loads the identity block from prompts/core/identity.md
 *   2. Loads its own prompt template from prompts/agents/<name>.md
 *   3. Fills {variable} placeholders
 *   4. Calls ollamaService.generateStream()
 *   5. Returns a structured WorkerResult
 *
 * Code-agent additionally attempts to execute the code it generates
 * via sandboxService (shell_exec equivalent), if available.
 *
 * dispatchWorker() routes by agent name string to the correct function.
 */

import { ollamaService } from '../utils/ollama';
import { loadPromptBody } from '../utils/promptLoader';
import { sandboxService } from '../utils/sandboxService';

// ─────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────

export interface WorkerOptions {
  taskId: string;
  task: string;
  context: string;
  userMemory?: string;
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

export interface WorkerResult {
  success: boolean;
  output: string;
  filesCreated?: string[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Fill {placeholder} tokens in a prompt string. */
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in vars ? vars[key] : match;
  });
}

/** Load the identity block (no header assumed — entire body is the identity text). */
function getIdentityBlock(): string {
  const body = loadPromptBody('agents/nomad-identity.md');
  // If the file hasn't been imported by Vite yet (e.g. during SSR/testing), fall back.
  return body || 'You are Nomad, an autonomous AI agent built for creative marketing intelligence.';
}

/**
 * Stream from Ollama, accumulate response, call onChunk.
 * Returns the full text or throws on error.
 */
async function streamAgent(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: WorkerOptions,
): Promise<string> {
  return ollamaService.generateStream(userPrompt, systemPrompt, {
    model,
    temperature: 0.7,
    onChunk: options.onChunk,
    signal: options.signal,
  });
}

/** Extract code blocks (``` ... ```) from LLM output. */
function extractCodeBlocks(text: string): Array<{ lang: string; code: string }> {
  const blocks: Array<{ lang: string; code: string }> = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ lang: m[1] || 'sh', code: m[2].trim() });
  }
  return blocks;
}

/** Extract file paths mentioned in an LLM response (heuristic). */
function extractFilePaths(text: string): string[] {
  const matches = text.match(/_workspace\/[^\s"'\n,]+/g) || [];
  return [...new Set(matches)];
}

// ─────────────────────────────────────────────────────────────
// 1. Direct Executor — single tool call, done
//    Model: qwen3.5:4b
// ─────────────────────────────────────────────────────────────

const DIRECT_EXECUTOR_MODEL = 'qwen3.5:4b';

/**
 * Direct Executor: handles simple, single-action tasks.
 * One tool call → confirm what was done.
 */
export async function runDirectExecutor(options: WorkerOptions): Promise<WorkerResult> {
  const identityBlock = getIdentityBlock();
  const promptTemplate = loadPromptBody('agents/direct-executor.md');

  const systemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    user_memory: options.userMemory ?? '',
    task: options.task,
    tool_descriptions: 'shell_exec, file_read, file_write — pick one appropriate tool',
  });

  const userPrompt = `Task ID: ${options.taskId}\nContext: ${options.context}\n\nExecute the task now.`;

  try {
    const output = await streamAgent(DIRECT_EXECUTOR_MODEL, systemPrompt, userPrompt, options);
    return {
      success: true,
      output,
      filesCreated: extractFilePaths(output),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error };
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Code Agent — execute shell + code via sandboxService
//    Model: qwen3.5:4b
// ─────────────────────────────────────────────────────────────

const CODE_AGENT_MODEL = 'qwen3.5:4b';

/**
 * Code Agent: writes and executes code in the sandbox.
 * After the LLM generates code, the first shell/python block is
 * executed via sandboxService.consoleExec (JS sandbox).
 * For full shell_exec support, a real shell API would be needed.
 */
export async function runCodeAgent(options: WorkerOptions): Promise<WorkerResult> {
  const identityBlock = getIdentityBlock();
  const promptTemplate = loadPromptBody('agents/code-agent.md');

  const systemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    task_id: options.taskId,
    task: options.task,
    context: options.context,
  });

  const userPrompt =
    `Task ID: ${options.taskId}\n` +
    `Workspace: _workspace/${options.taskId}/\n\n` +
    `Write the code, save it to a file, then run it. Report what happened.`;

  let llmOutput = '';
  try {
    llmOutput = await streamAgent(CODE_AGENT_MODEL, systemPrompt, userPrompt, options);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error };
  }

  // Attempt to execute the first JS code block via sandboxService if available.
  // For shell/python we'd need a real shell_exec endpoint — stub with TODO.
  const codeBlocks = extractCodeBlocks(llmOutput);
  let executionNote = '';

  if (codeBlocks.length > 0) {
    const first = codeBlocks[0];
    if (first.lang === 'js' || first.lang === 'javascript') {
      try {
        const result = await sandboxService.consoleExec(first.code);
        executionNote = result.error
          ? `\n[Execution error: ${result.error}]`
          : `\n[Executed JS — result: ${result.result ?? 'ok'}]`;
      } catch (execErr) {
        executionNote = `\n[sandboxService.consoleExec unavailable: ${execErr instanceof Error ? execErr.message : String(execErr)}]`;
      }
    } else {
      // TODO: wire up shell_exec endpoint when sandbox server supports it
      executionNote = `\n[Note: shell_exec for '${first.lang}' not yet wired — LLM output only]`;
    }
  }

  const output = llmOutput + executionNote;

  return {
    success: true,
    output,
    filesCreated: extractFilePaths(output),
  };
}

// ─────────────────────────────────────────────────────────────
// 3. File Agent — read/write/edit/search/list operations
//    Model: qwen3.5:4b
// ─────────────────────────────────────────────────────────────

const FILE_AGENT_MODEL = 'qwen3.5:4b';

/**
 * File Agent: handles file operations — read, write, edit, search, organize.
 * Long documents are written section-by-section per the prompt instructions.
 */
export async function runFileAgent(options: WorkerOptions): Promise<WorkerResult> {
  const identityBlock = getIdentityBlock();
  const promptTemplate = loadPromptBody('agents/file-agent.md');

  const systemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    task_id: options.taskId,
    task: options.task,
    context: options.context,
  });

  const userPrompt =
    `Task ID: ${options.taskId}\n` +
    `Workspace: _workspace/${options.taskId}/\n\n` +
    `Perform the file operation now. Confirm each operation with byte/word count.`;

  try {
    const output = await streamAgent(FILE_AGENT_MODEL, systemPrompt, userPrompt, options);
    return {
      success: true,
      output,
      filesCreated: extractFilePaths(output),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error };
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Vision Agent — interpret screenshots/images
//    Model: qwen3.5:4b (multimodal)
// ─────────────────────────────────────────────────────────────

const VISION_AGENT_MODEL = 'qwen3.5:4b';

/**
 * Vision Agent: interprets screenshots and images.
 * Passes imageBase64 to the Ollama `images` field for multimodal input.
 * Falls back to a text description prompt if no image data is provided.
 */
export async function runVisionAgent(
  options: WorkerOptions & { imageBase64: string },
): Promise<WorkerResult> {
  const identityBlock = getIdentityBlock();
  const promptTemplate = loadPromptBody('agents/vision-agent.md');

  const systemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    task: options.task,
    image: options.imageBase64 ? '[image attached]' : '[no image provided]',
  });

  const userPrompt =
    `Task: ${options.task}\n` +
    `Context: ${options.context}\n\n` +
    `Describe exactly what you see. Be literal and structured.`;

  try {
    const output = await ollamaService.generateStream(userPrompt, systemPrompt, {
      model: VISION_AGENT_MODEL,
      temperature: 0.3, // Lower temp for factual visual description
      onChunk: options.onChunk,
      signal: options.signal,
      // Pass image only if provided — Ollama multimodal (no data: prefix)
      ...(options.imageBase64 ? { images: [options.imageBase64] } : {}),
    });

    return { success: true, output };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error };
  }
}

// ─────────────────────────────────────────────────────────────
// 5. Deploy Agent — expose ports, deploy sites
//    Model: qwen3.5:4b
// ─────────────────────────────────────────────────────────────

const DEPLOY_AGENT_MODEL = 'qwen3.5:4b';

/**
 * Deploy Agent: handles deployment — exposing services and deploying sites.
 * Uses expose_port, deploy_website, make_page tools (via LLM guidance).
 */
export async function runDeployAgent(options: WorkerOptions): Promise<WorkerResult> {
  const identityBlock = getIdentityBlock();
  const promptTemplate = loadPromptBody('agents/deploy-agent.md');

  const systemPrompt = fillTemplate(promptTemplate, {
    identity_block: identityBlock,
    task: options.task,
    context: options.context,
  });

  const userPrompt =
    `Task ID: ${options.taskId}\n\n` +
    `Deploy task: ${options.task}\n\n` +
    `Follow the rules: test locally first, listen on 0.0.0.0, provide the full public URL.`;

  try {
    const output = await streamAgent(DEPLOY_AGENT_MODEL, systemPrompt, userPrompt, options);
    return { success: true, output };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error };
  }
}

// ─────────────────────────────────────────────────────────────
// dispatchWorker — route by agent name string
// ─────────────────────────────────────────────────────────────

const KNOWN_AGENTS = [
  'direct-executor',
  'code-agent',
  'file-agent',
  'vision-agent',
  'deploy-agent',
  'wayfayer',
  'self',
] as const;

export type AgentName = typeof KNOWN_AGENTS[number];

/**
 * Route to the right worker by agent name.
 *
 * Supported names:
 *   'direct-executor'  → runDirectExecutor
 *   'code-agent'       → runCodeAgent
 *   'file-agent'       → runFileAgent
 *   'vision-agent'     → runVisionAgent  (requires imageBase64)
 *   'deploy-agent'     → runDeployAgent
 *   'wayfayer'         → stub (handled by the Wayfarer system)
 *   'self'             → returns options.context as-is
 */
export async function dispatchWorker(
  agentName: string,
  options: WorkerOptions & { imageBase64?: string },
): Promise<WorkerResult> {
  switch (agentName) {
    case 'direct-executor':
      return runDirectExecutor(options);

    case 'code-agent':
      return runCodeAgent(options);

    case 'file-agent':
      return runFileAgent(options);

    case 'vision-agent':
      return runVisionAgent({
        ...options,
        imageBase64: options.imageBase64 ?? '',
      });

    case 'deploy-agent':
      return runDeployAgent(options);

    case 'wayfayer':
      // Stub — web research is handled by the Wayfarer system (wayfayer.ts / wayfarer_server.py)
      return {
        success: true,
        output: `[wayfayer stub] Task "${options.task}" should be routed to the Wayfarer research system. ` +
          `Use useOrchestratedResearch or researchAgents.ts for web research tasks.`,
      };

    case 'self':
      // Returns the provided context as the output — useful for pass-through / reflection tasks
      return {
        success: true,
        output: options.context,
      };

    default:
      return {
        success: false,
        output: '',
        error: `Unknown agent name: "${agentName}". Valid agents: ${KNOWN_AGENTS.join(', ')}`,
      };
  }
}
