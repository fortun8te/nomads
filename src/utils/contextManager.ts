/**
 * contextManager — Rolling window compression + phase transitions.
 *
 * Keeps agents alive across long tasks by compressing context when it
 * approaches model limits, and hard-resetting between phases.
 *
 * Storage: idb-keyval (IndexedDB) instead of the Python file-system approach.
 *   Keys:
 *     session_{taskId}_history  → Message[]   (append-only history)
 *     workspace_{taskId}_phases → { phase: number; summary: string }[]
 *     workspace_{taskId}_wm     → WorkingMemory
 */

import { get, set } from 'idb-keyval';

// ─────────────────────────────────────────────────────────────
// Budget + threshold constants
// ─────────────────────────────────────────────────────────────

export const CONTEXT_BUDGETS: Record<string, number> = {
  'qwen3.5:2b':    32000,
  'qwen3.5:4b':    32000,
  'qwen3.5:9b':    32000,
  'qwen3.5:27b':   32000,
};

/** Compress when context tokens exceed this fraction of the model budget. */
export const COMPRESS_THRESHOLD = 0.7;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Returns true when the current context size has hit the compression
 * threshold for the given model.
 */
export function shouldCompress(contextTokens: number, model: string): boolean {
  const budget = CONTEXT_BUDGETS[model] ?? 32000;
  return contextTokens > budget * COMPRESS_THRESHOLD;
}

/**
 * Rough token estimator — 4 characters per token (standard heuristic).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WorkingMemory {
  taskId: string;
  userRequest: string;
  currentPhase: number;
  currentStep: number;
  completed: { phases: number[]; steps: number[] };
  keyFacts: Record<string, unknown>;
  decisions: string[];
  files: Record<string, string>; // name → path
  errors: string[];
}

export interface RecoveredState {
  taskId: string;
  completedPhases: number[];
  files: string[];
  workingMemory?: WorkingMemory;
  phaseSummaries?: { phase: number; summary: string }[];
}

// ─────────────────────────────────────────────────────────────
// IDB key helpers
// ─────────────────────────────────────────────────────────────

function historyKey(taskId: string): string {
  return `session_${taskId}_history`;
}

function phasesKey(taskId: string): string {
  return `workspace_${taskId}_phases`;
}

function wmKey(taskId: string): string {
  return `workspace_${taskId}_wm`;
}

// ─────────────────────────────────────────────────────────────
// compressContext
// ─────────────────────────────────────────────────────────────

/**
 * Rolling window compression.
 *
 * 1. Appends full message history to IndexedDB (append-only).
 * 2. Compresses older messages via the provided compressionFn.
 * 3. Returns a fresh context array: system + compressed history +
 *    working memory + the last 10 messages.
 */
export async function compressContext(
  messages: Message[],
  systemPrompt: string,
  workingMemory: WorkingMemory,
  taskId: string,
  compressionFn: (text: string, maxWords: number) => Promise<string>,
): Promise<Message[]> {
  // 1. Persist full history to IndexedDB
  const existing: Message[] = (await get<Message[]>(historyKey(taskId))) ?? [];
  await set(historyKey(taskId), [...existing, ...messages]);

  // 2. Split: keep last 10 messages as-is, compress the rest
  const recent = messages.slice(-10);
  const old = messages.slice(0, messages.length - 10);

  let compressedHistory = '';
  if (old.length > 0) {
    const oldText = old
      .map(m => `${m.role}: ${m.content.slice(0, 500)}`)
      .join('\n');
    compressedHistory = await compressionFn(oldText, 300);
  }

  // 3. Rebuild fresh context
  const fresh: Message[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (compressedHistory) {
    fresh.push({ role: 'system', content: `COMPRESSED HISTORY:\n${compressedHistory}` });
  }

  fresh.push({
    role: 'system',
    content: `WORKING MEMORY:\n${JSON.stringify(workingMemory)}`,
  });

  fresh.push(...recent);

  return fresh;
}

// ─────────────────────────────────────────────────────────────
// phaseTransition
// ─────────────────────────────────────────────────────────────

/**
 * Hard context reset between phases.
 *
 * 1. Persists the raw phase output to IndexedDB.
 * 2. Compresses it into a summary and appends to the phase-summaries list.
 * 3. Returns a fresh context seeded with all previous phase summaries
 *    and the current working memory — ready for the next phase.
 */
export async function phaseTransition(
  taskId: string,
  phaseNum: number,
  phaseOutput: string,
  systemPrompt: string,
  workingMemory: WorkingMemory,
  compressionFn: (
    text: string,
    maxWords: number,
    variant?: string,
    phaseNumber?: number,
  ) => Promise<string>,
): Promise<Message[]> {
  // 1. Compress phase output into a summary
  const summary = await compressionFn(phaseOutput, 500, 'phase', phaseNum);

  // 2. Load existing summaries, append new one, persist
  const summaries: { phase: number; summary: string }[] =
    (await get<{ phase: number; summary: string }[]>(phasesKey(taskId))) ?? [];
  summaries.push({ phase: phaseNum, summary });
  await set(phasesKey(taskId), summaries);

  // 3. Persist updated working memory
  await set(wmKey(taskId), workingMemory);

  // 4. Build fresh context for the next phase
  const allSummaries = summaries
    .map(s => `PHASE ${s.phase}:\n${s.summary}`)
    .join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `PREVIOUS PHASES:\n${allSummaries}` },
    { role: 'system', content: `WORKING MEMORY:\n${JSON.stringify(workingMemory)}` },
  ];
}

// ─────────────────────────────────────────────────────────────
// recoverState
// ─────────────────────────────────────────────────────────────

/**
 * Rebuild task state from IndexedDB after a crash or page reload.
 *
 * Returns whatever was previously persisted for this taskId.
 * Missing fields default to sensible empty values.
 */
export async function recoverState(taskId: string): Promise<RecoveredState> {
  const [summaries, workingMemory] = await Promise.all([
    get<{ phase: number; summary: string }[]>(phasesKey(taskId)),
    get<WorkingMemory>(wmKey(taskId)),
  ]);

  const completedPhases = summaries?.map(s => s.phase) ?? [];

  const files: string[] = workingMemory
    ? Object.values(workingMemory.files)
    : [];

  const state: RecoveredState = {
    taskId,
    completedPhases,
    files,
  };

  if (workingMemory) {
    state.workingMemory = workingMemory;
  }

  if (summaries && summaries.length > 0) {
    state.phaseSummaries = summaries;
  }

  return state;
}
