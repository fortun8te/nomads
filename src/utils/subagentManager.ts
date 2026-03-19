/**
 * Subagent Manager — Production-quality agent infrastructure
 *
 * Features:
 *  - Retry logic with exponential back-off (configurable, default 3 attempts)
 *  - Per-subagent hard timeout (default 120 s) with clean abort
 *  - Error isolation — one subagent failure never kills the batch
 *  - Full lifecycle registry: idle → spawning → running → completed/failed/cancelled
 *  - Self-assessed confidence scoring (0–1) on every result
 *  - Rich observability callbacks: onSpawned, onProgress, onComplete
 *  - Abort signal fully threaded — external cancel propagates cleanly
 *  - No memory leaks: timers cleared in finally blocks
 */

import { ollamaService } from './ollama';
import { getResearchModelConfig } from './modelConfig';
import { AGENT_CONFIG } from '../config/infrastructure';
import type { SubagentRole } from './subagentRoles';
import { getRoleConfig } from './subagentRoles';
import { recordResearchModel } from './researchAudit';
import type {
  SubagentStatus,
  SubagentMessage,
  SubagentParentContext,
  SubagentResult,
  SubagentPoolStats,
} from '../types';

// Re-export for consumers that only import from this module
export type { SubagentStatus, SubagentMessage, SubagentParentContext, SubagentResult, SubagentPoolStats };

// ─────────────────────────────────────────────────────────────
// Request / Progress types
// ─────────────────────────────────────────────────────────────

export interface SubagentSpawnRequest {
  /** Unique ID for this instance — caller is responsible for uniqueness */
  id: string;
  role: SubagentRole;
  /** One-sentence task description visible in debug logs and UI */
  task: string;
  /** Background context injected into the system prompt */
  context: string;
  /** Optional structured parent context (brand, campaign, previous findings) */
  parentContext?: SubagentParentContext;
  /** Raw input data — search query, page content, findings to analyse, etc. */
  input?: string;
  /** Override the default model for this role */
  model?: string;
  /** Hard timeout in ms — subagent is aborted after this (default: AGENT_CONFIG.subagentTimeoutMs) */
  timeoutMs?: number;
  /** Max retry attempts on transient failure (default: AGENT_CONFIG.retryAttempts) */
  retryAttempts?: number;
  /** Base delay ms before first retry, doubles each attempt (default: AGENT_CONFIG.retryDelayMs) */
  retryDelayMs?: number;
  /** External abort signal — mirrors to internal controller */
  signal?: AbortSignal;
}

export interface SubagentProgress {
  subagentId: string;
  role: SubagentRole;
  status: SubagentStatus;
  /** 0–100 estimated progress (based on elapsed / estimated duration) */
  progress: number;
  elapsedMs: number;
  /** Partial output streamed so far (may be empty until model starts responding) */
  partialOutput?: string;
  /** Current retry attempt (0-based) */
  attempt?: number;
}

// Callbacks exposed to callers
export interface SubagentCallbacks {
  onSpawned?: (id: string, role: SubagentRole, task: string) => void;
  onProgress?: (progress: SubagentProgress) => void;
  onComplete?: (result: SubagentResult) => void;
}

// ─────────────────────────────────────────────────────────────
// Internal registry entry
// ─────────────────────────────────────────────────────────────

interface SubagentEntry {
  request: SubagentSpawnRequest;
  status: SubagentStatus;
  controller: AbortController;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  startTime: number;
  completedTime?: number;
  result?: SubagentResult;
  attempt: number;
  partialOutput: string;
  callbacks?: SubagentCallbacks;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return m.includes('abort') || m.includes('signal') || m.includes('cancel');
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Sleep aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Sleep aborted', 'AbortError'));
    }, { once: true });
  });
}

/**
 * Derive a naive confidence score (0–1) from the output text.
 * Heuristics: length, presence of structured blocks, source citations.
 * Subagents can override by embedding [CONFIDENCE:0.85] in their output.
 */
function scoreConfidence(output: string, status: SubagentStatus): number {
  if (status !== 'completed') return 0;
  if (!output || output.length < 50) return 0.1;

  // Check for explicit self-report
  const explicit = output.match(/\[CONFIDENCE:\s*([\d.]+)\]/i);
  if (explicit) {
    const v = parseFloat(explicit[1]);
    if (!isNaN(v) && v >= 0 && v <= 1) return v;
  }

  let score = 0.5; // baseline

  // Length bonus (up to 0.2)
  const len = Math.min(output.length, 4000);
  score += (len / 4000) * 0.2;

  // Structured block bonus
  const hasBlocks = /\[(FINDINGS|ANALYSIS|SYNTHESIS|VALIDATION|STRATEGY|COMPRESSED|EVALUATION)\]/i.test(output);
  if (hasBlocks) score += 0.1;

  // Source citation bonus
  const sourceMentions = (output.match(/\[Source:/gi) || []).length;
  score += Math.min(sourceMentions * 0.02, 0.1);

  // Gap acknowledgement shows self-awareness — slight bonus
  if (/gaps:/i.test(output)) score += 0.05;

  return Math.min(1, Math.max(0, score));
}

function devLog(msg: string, ...args: unknown[]): void {
  if (AGENT_CONFIG.devLogging) {
    console.log(`[SubagentManager] ${msg}`, ...args);
  }
}

// ─────────────────────────────────────────────────────────────
// SubagentManager — core class
// ─────────────────────────────────────────────────────────────

export class SubagentManager {
  private registry = new Map<string, SubagentEntry>();
  /** role → count of currently-running instances */
  private roleActiveCounts = new Map<SubagentRole, number>();

  // ── Public API ──────────────────────────────────────────────

  /**
   * Spawn a subagent and await its result.
   * - Retries up to `retryAttempts` times on transient error
   * - Enforces `timeoutMs` hard limit (aborts the LLM call)
   * - Never throws — always resolves to a SubagentResult
   */
  async spawn(
    request: SubagentSpawnRequest,
    callbacks?: SubagentCallbacks,
  ): Promise<SubagentResult> {
    // Guard: if external signal already aborted, return immediately
    if (request.signal?.aborted) {
      return this._buildCancelledResult(request, 0);
    }

    const entry: SubagentEntry = {
      request,
      status: 'spawning',
      controller: new AbortController(),
      timeoutHandle: null,
      startTime: Date.now(),
      attempt: 0,
      partialOutput: '',
      callbacks,
    };

    this.registry.set(request.id, entry);

    // Mirror external abort → internal controller
    if (request.signal) {
      request.signal.addEventListener('abort', () => {
        this._cancelEntry(entry);
      }, { once: true });
    }

    devLog(`spawning ${request.id} [${request.role}] "${request.task}"`);
    callbacks?.onSpawned?.(request.id, request.role, request.task);

    const result = await this._runWithRetry(entry);

    entry.result = result;
    entry.completedTime = Date.now();
    entry.status = result.status;

    devLog(
      `${result.status} ${request.id} [${request.role}] in ${result.durationMs}ms ` +
      `confidence=${result.confidence.toFixed(2)} tokens=${result.tokensUsed}`,
    );

    callbacks?.onComplete?.(result);
    return result;
  }

  /** Abort a specific subagent by ID */
  abortSubagent(subagentId: string): void {
    const entry = this.registry.get(subagentId);
    if (entry) this._cancelEntry(entry);
  }

  /** Abort all registered subagents */
  abortAll(): void {
    for (const entry of this.registry.values()) {
      this._cancelEntry(entry);
    }
  }

  /** Live status snapshot for a single subagent */
  getStatus(subagentId: string): SubagentProgress | null {
    const entry = this.registry.get(subagentId);
    if (!entry) return null;
    return this._buildProgress(entry);
  }

  /** Live status for all registered subagents */
  getAllStatuses(): SubagentProgress[] {
    return Array.from(this.registry.values()).map(e => this._buildProgress(e));
  }

  /** Count of currently-running (not completed/failed/cancelled) subagents */
  getActiveCount(): number {
    let n = 0;
    for (const e of this.registry.values()) {
      if (e.status === 'running' || e.status === 'spawning') n++;
    }
    return n;
  }

  getActiveCountForRole(role: SubagentRole): number {
    return this.roleActiveCounts.get(role) || 0;
  }

  /** Clear completed/failed/cancelled entries from the registry */
  cleanup(): void {
    for (const [id, entry] of this.registry.entries()) {
      if (
        entry.status === 'completed' ||
        entry.status === 'failed' ||
        entry.status === 'cancelled'
      ) {
        this.registry.delete(id);
      }
    }
  }

  // ── Internal execution ──────────────────────────────────────

  private async _runWithRetry(entry: SubagentEntry): Promise<SubagentResult> {
    const maxAttempts = entry.request.retryAttempts ?? AGENT_CONFIG.retryAttempts;
    const baseDelay = entry.request.retryDelayMs ?? AGENT_CONFIG.retryDelayMs;

    let lastError: string = '';

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      // Check abort between attempts
      if (entry.controller.signal.aborted) {
        return this._buildCancelledResult(entry.request, Date.now() - entry.startTime);
      }

      entry.attempt = attempt;

      if (attempt > 0) {
        // Exponential back-off: 1s → 2s → 4s
        const delay = baseDelay * Math.pow(2, attempt - 1);
        devLog(`retry ${attempt}/${maxAttempts} for ${entry.request.id} after ${delay}ms`);
        try {
          await sleep(delay, entry.controller.signal);
        } catch {
          return this._buildCancelledResult(entry.request, Date.now() - entry.startTime);
        }
      }

      entry.status = 'running';
      entry.partialOutput = '';

      // Increment role concurrency counter
      const rolePrev = this.roleActiveCounts.get(entry.request.role) || 0;
      this.roleActiveCounts.set(entry.request.role, rolePrev + 1);

      // Set per-attempt timeout
      const timeoutMs = entry.request.timeoutMs ?? AGENT_CONFIG.subagentTimeoutMs;
      let timedOut = false;
      entry.timeoutHandle = setTimeout(() => {
        timedOut = true;
        entry.controller.abort();
      }, timeoutMs);

      try {
        const result = await this._executeOnce(entry);

        if (result.status === 'cancelled') {
          return result; // Never retry an abort
        }

        // Success path
        entry.status = 'completed';
        return { ...result, retryCount: attempt };
      } catch (err) {
        if (isAbortError(err)) {
          if (timedOut) {
            // Timeout — treat as a retriable failure but record it
            lastError = `Timeout after ${timeoutMs}ms`;
            devLog(`timeout on ${entry.request.id} attempt ${attempt}`);
            // Reset controller for next attempt (create fresh one)
            entry.controller = new AbortController();
            if (entry.request.signal) {
              entry.request.signal.addEventListener('abort', () => {
                this._cancelEntry(entry);
              }, { once: true });
            }
          } else {
            // External cancel — do not retry
            return this._buildCancelledResult(entry.request, Date.now() - entry.startTime);
          }
        } else {
          lastError = err instanceof Error ? err.message : String(err);
          devLog(`error on ${entry.request.id} attempt ${attempt}: ${lastError}`);
        }
      } finally {
        // Always clear timeout handle and decrement role counter
        if (entry.timeoutHandle !== null) {
          clearTimeout(entry.timeoutHandle);
          entry.timeoutHandle = null;
        }
        const roleNow = this.roleActiveCounts.get(entry.request.role) || 0;
        this.roleActiveCounts.set(entry.request.role, Math.max(0, roleNow - 1));
      }
    }

    // All attempts exhausted
    entry.status = 'failed';
    const durationMs = Date.now() - entry.startTime;
    return {
      subagentId: entry.request.id,
      role: entry.request.role,
      task: entry.request.task,
      status: 'failed',
      output: entry.partialOutput || '',
      confidence: 0,
      tokensUsed: 0,
      durationMs,
      startedAt: entry.startTime,
      completedAt: Date.now(),
      error: `Failed after ${maxAttempts + 1} attempts. Last error: ${lastError}`,
      retryCount: maxAttempts,
    };
  }

  private async _executeOnce(entry: SubagentEntry): Promise<SubagentResult> {
    const { request } = entry;
    const roleConfig = getRoleConfig(request.role);
    const model = request.model || getResearchModelConfig().researcherSynthesisModel;
    const startTime = Date.now();

    // Notify progress callbacks on each attempt
    const reportProgress = () => {
      entry.callbacks?.onProgress?.(this._buildProgress(entry));
    };

    // Concurrency guard — respect role's maxConcurrent limit
    const roleActive = this.roleActiveCounts.get(request.role) || 0;
    if (roleActive > roleConfig.maxConcurrent) {
      // This attempt hits the ceiling — treat as a soft error so it can retry
      // after another subagent of this role finishes
      throw new Error(
        `Concurrency ceiling: ${roleActive}/${roleConfig.maxConcurrent} for role '${request.role}'`,
      );
    }

    // Record which model is being used
    recordResearchModel(model);

    // Build system prompt — inject parentContext if provided
    let contextBlock = request.context;
    if (request.parentContext) {
      const pc = request.parentContext;
      contextBlock += `

Parent Context:
- Brand: ${pc.brand}
- Product: ${pc.productDescription}
- Audience: ${pc.targetAudience}
- Goal: ${pc.marketingGoal}${pc.previousFindings ? `\n- Prior findings summary: ${pc.previousFindings.slice(0, 600)}` : ''}${pc.userDirection ? `\n- User direction: ${pc.userDirection}` : ''}`;
    }

    const systemPrompt = roleConfig.systemPrompt(contextBlock);

    // Build user prompt
    let userPrompt = `Task: ${request.task}\n`;
    if (request.input) {
      userPrompt += `\nInput/Data:\n${request.input}\n`;
    }
    userPrompt +=
      '\nProceed with your task. Report findings clearly using the structured format in your instructions. ' +
      'At the end, include a self-assessed confidence score as [CONFIDENCE:0.XX] where 0 = no confidence, 1 = fully confident.';

    reportProgress();

    // Stream the LLM response, accumulating partial output for observability
    const output = await ollamaService.generateStream(
      userPrompt,
      systemPrompt,
      {
        model,
        temperature: roleConfig.temperature,
        num_predict: roleConfig.maxTokens,
        signal: entry.controller.signal,
        onChunk: (chunk: string) => {
          entry.partialOutput += chunk;
          reportProgress();
        },
      },
    );

    if (entry.controller.signal.aborted) {
      return this._buildCancelledResult(request, Date.now() - startTime);
    }

    const durationMs = Date.now() - startTime;
    const confidence = scoreConfidence(output, 'completed');

    // Rough token estimate: word count × 1.3
    const tokensUsed = Math.round(output.split(/\s+/).length * 1.3);

    return {
      subagentId: request.id,
      role: request.role,
      task: request.task,
      status: 'completed',
      output,
      confidence,
      tokensUsed,
      durationMs,
      startedAt: startTime,
      completedAt: Date.now(),
    };
  }

  // ── Private helpers ─────────────────────────────────────────

  private _cancelEntry(entry: SubagentEntry): void {
    if (entry.status === 'completed' || entry.status === 'failed' || entry.status === 'cancelled') {
      return;
    }
    entry.status = 'cancelled';
    if (entry.timeoutHandle !== null) {
      clearTimeout(entry.timeoutHandle);
      entry.timeoutHandle = null;
    }
    entry.controller.abort();
  }

  private _buildProgress(entry: SubagentEntry): SubagentProgress {
    const elapsedMs = Date.now() - entry.startTime;
    const estimatedDuration = getRoleConfig(entry.request.role).estimatedDurationMs;
    const progress = Math.min(100, Math.round((elapsedMs / estimatedDuration) * 100));
    return {
      subagentId: entry.request.id,
      role: entry.request.role,
      status: entry.status,
      progress,
      elapsedMs,
      partialOutput: entry.partialOutput || undefined,
      attempt: entry.attempt,
    };
  }

  private _buildCancelledResult(
    request: SubagentSpawnRequest,
    durationMs: number,
  ): SubagentResult {
    return {
      subagentId: request.id,
      role: request.role,
      task: request.task,
      status: 'cancelled',
      output: '',
      confidence: 0,
      tokensUsed: 0,
      durationMs,
      startedAt: Date.now() - durationMs,
      completedAt: Date.now(),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// SubagentPool — manages a bounded queue of subagents
// ─────────────────────────────────────────────────────────────

interface PoolQueueItem {
  request: SubagentSpawnRequest;
  callbacks?: SubagentCallbacks;
  resolve: (result: SubagentResult) => void;
}

/**
 * SubagentPool manages a bounded number of concurrent subagents.
 * Queues excess requests and drains them as slots open.
 * Tracks aggregate token usage and emits pool-level stats.
 */
export class SubagentPool {
  private id: string;
  private maxConcurrent: number;
  private manager: SubagentManager;
  private queue: PoolQueueItem[] = [];
  private active = 0;
  private completedCount = 0;
  private failedCount = 0;
  private cancelledCount = 0;
  private totalTokensUsed = 0;
  private confidenceSum = 0;
  private activeEntryTimes: Map<string, number> = new Map();
  private onStats?: (stats: SubagentPoolStats) => void;

  constructor(opts: {
    id?: string;
    maxConcurrent?: number;
    onStats?: (stats: SubagentPoolStats) => void;
  } = {}) {
    this.id = opts.id ?? `pool-${Date.now()}`;
    this.maxConcurrent = opts.maxConcurrent ?? AGENT_CONFIG.maxConcurrentSubagents;
    this.manager = new SubagentManager();
    this.onStats = opts.onStats;
  }

  /**
   * Submit a subagent to the pool.
   * If the pool is at capacity, the request is queued and will run when a slot opens.
   * Always resolves — never rejects.
   */
  submit(request: SubagentSpawnRequest, callbacks?: SubagentCallbacks): Promise<SubagentResult> {
    return new Promise<SubagentResult>((resolve) => {
      const item: PoolQueueItem = { request, callbacks, resolve };
      if (this.active < this.maxConcurrent) {
        this._dispatch(item);
      } else {
        this.queue.push(item);
        devLog(`pool ${this.id}: queued ${request.id} (queue depth: ${this.queue.length})`);
      }
    });
  }

  /**
   * Submit multiple requests and wait for all to complete.
   * Results are returned in the same order as the input requests.
   */
  async submitAll(
    requests: SubagentSpawnRequest[],
    callbacks?: SubagentCallbacks,
  ): Promise<SubagentResult[]> {
    const promises = requests.map(r => this.submit(r, callbacks));
    return Promise.all(promises);
  }

  /** Abort all queued and running subagents */
  abortAll(): void {
    this.queue = []; // drain queue — pending items will never run
    this.manager.abortAll();
  }

  /** Resize the pool's concurrency limit at runtime */
  resize(newMax: number): void {
    this.maxConcurrent = Math.max(1, newMax);
    // Drain queue into newly available slots
    this._drain();
  }

  /** Current pool stats snapshot */
  getStats(): SubagentPoolStats {
    const activeCount = this.active;
    let oldestActiveMs = 0;
    const now = Date.now();
    for (const startTime of this.activeEntryTimes.values()) {
      const elapsed = now - startTime;
      if (elapsed > oldestActiveMs) oldestActiveMs = elapsed;
    }
    const totalCompleted = this.completedCount;
    const averageConfidence =
      totalCompleted > 0 ? this.confidenceSum / totalCompleted : 0;

    return {
      poolId: this.id,
      active: activeCount,
      queued: this.queue.length,
      completed: this.completedCount,
      failed: this.failedCount,
      cancelled: this.cancelledCount,
      totalTokensUsed: this.totalTokensUsed,
      oldestActiveMs,
      averageConfidence,
    };
  }

  private _dispatch(item: PoolQueueItem): void {
    this.active++;
    this.activeEntryTimes.set(item.request.id, Date.now());
    this._emitStats();

    const wrappedCallbacks: SubagentCallbacks = {
      onSpawned: item.callbacks?.onSpawned,
      onProgress: item.callbacks?.onProgress,
      onComplete: (result) => {
        item.callbacks?.onComplete?.(result);
        this._onSubagentComplete(result);
        item.resolve(result);
      },
    };

    // Fire and forget — result flows through callbacks
    this.manager.spawn(item.request, wrappedCallbacks).catch((err) => {
      // manager.spawn never throws, but be defensive
      devLog(`pool ${this.id}: unexpected throw from manager.spawn: ${err}`);
    });
  }

  private _onSubagentComplete(result: SubagentResult): void {
    this.active = Math.max(0, this.active - 1);
    this.activeEntryTimes.delete(result.subagentId);
    this.totalTokensUsed += result.tokensUsed;

    switch (result.status) {
      case 'completed':
        this.completedCount++;
        this.confidenceSum += result.confidence;
        break;
      case 'failed':
        this.failedCount++;
        break;
      case 'cancelled':
        this.cancelledCount++;
        break;
    }

    this._emitStats();
    this._drain();
  }

  private _drain(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this._dispatch(next);
    }
  }

  private _emitStats(): void {
    this.onStats?.(this.getStats());
  }
}

// ─────────────────────────────────────────────────────────────
// Result aggregation
// ─────────────────────────────────────────────────────────────

/**
 * Aggregate results from a batch of subagents into a single coherent block.
 *
 * - Filters out low-confidence results (below threshold) — flags them separately
 * - Deduplicates by URL citations and near-identical opening sentences
 * - Sorts by confidence descending
 * - Returns a merged text block + metadata
 */
export interface AggregatedResult {
  mergedOutput: string;
  totalSources: number;
  averageConfidence: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  failedCount: number;
  lowConfidenceWarnings: string[];
}

export function aggregateResults(
  results: SubagentResult[],
  confidenceThreshold = AGENT_CONFIG.resultConfidenceThreshold,
): AggregatedResult {
  const high: SubagentResult[] = [];
  const low: SubagentResult[] = [];
  const failed: SubagentResult[] = [];

  for (const r of results) {
    if (r.status === 'failed' || r.status === 'cancelled') {
      failed.push(r);
    } else if (r.confidence >= confidenceThreshold) {
      high.push(r);
    } else {
      low.push(r);
    }
  }

  // Sort high-confidence results by confidence descending
  high.sort((a, b) => b.confidence - a.confidence);

  // Deduplicate: remove results whose first 120 chars match a prior result's
  const seen = new Set<string>();
  const deduped: SubagentResult[] = [];
  for (const r of high) {
    const fingerprint = r.output.slice(0, 120).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      deduped.push(r);
    }
  }

  // Also deduplicate cited URLs across outputs
  const seenUrls = new Set<string>();
  const urlPattern = /https?:\/\/[^\s\])\n]+/g;
  for (const r of deduped) {
    const urls = r.output.match(urlPattern) || [];
    urls.forEach(u => seenUrls.add(u));
  }

  // Build merged text
  const sections = deduped.map((r, i) => {
    const roleLabel = r.role.charAt(0).toUpperCase() + r.role.slice(1);
    return `=== ${roleLabel} Result ${i + 1} (confidence: ${r.confidence.toFixed(2)}) ===\n${r.output.trim()}`;
  });

  if (low.length > 0) {
    sections.push(
      `=== Low-Confidence Findings (below ${confidenceThreshold}) ===\n` +
      low.map(r => `[${r.role}] ${r.output.slice(0, 300).trim()}`).join('\n---\n'),
    );
  }

  const mergedOutput = sections.join('\n\n');

  const totalConfidence = deduped.reduce((s, r) => s + r.confidence, 0);
  const averageConfidence = deduped.length > 0 ? totalConfidence / deduped.length : 0;

  const lowConfidenceWarnings = low.map(
    r => `[${r.role}] task="${r.task}" confidence=${r.confidence.toFixed(2)}`,
  );

  return {
    mergedOutput,
    totalSources: seenUrls.size,
    averageConfidence,
    highConfidenceCount: deduped.length,
    lowConfidenceCount: low.length,
    failedCount: failed.length,
    lowConfidenceWarnings,
  };
}

// ─────────────────────────────────────────────────────────────
// Factory helpers
// ─────────────────────────────────────────────────────────────

/** Create a standalone SubagentManager (one per research cycle is typical) */
export function createSubagentManager(): SubagentManager {
  return new SubagentManager();
}

/**
 * Create a SubagentPool sized for the given research preset.
 * Preset → concurrency: SQ=1, QK=2, NR=3, EX=4, MX=5
 */
export function createSubagentPool(
  preset: string,
  onStats?: (stats: SubagentPoolStats) => void,
): SubagentPool {
  const concurrency =
    AGENT_CONFIG.poolSizeByPreset[preset] ?? AGENT_CONFIG.maxConcurrentSubagents;
  return new SubagentPool({ id: `pool-${preset}-${Date.now()}`, maxConcurrent: concurrency, onStats });
}

// ─────────────────────────────────────────────────────────────
// Global singleton manager (optional convenience)
// ─────────────────────────────────────────────────────────────

let globalManager: SubagentManager | null = null;

export function getGlobalSubagentManager(): SubagentManager {
  if (!globalManager) {
    globalManager = new SubagentManager();
  }
  return globalManager;
}

export function resetGlobalSubagentManager(): void {
  if (globalManager) {
    globalManager.abortAll();
  }
  globalManager = null;
}
