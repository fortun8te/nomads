/**
 * watchdog — Budget enforcement, loop detection, kill logic.
 *
 * Monitors agents, enforces budgets, kills runaways.
 * No LLM calls. Port of specs/watchdog.py.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface AgentBudget {
  maxTokensPerResponse: number;
  maxSecondsPerStep: number;
  maxTotalSeconds: number;
  maxIterations: number;
  maxThinkingTokens: number; // 0 = thinking off
}

// ─────────────────────────────────────────────────────────────
// Budget table
// ─────────────────────────────────────────────────────────────

export const BUDGETS: Record<string, AgentBudget> = {
  'qwen3.5:2b':         { maxTokensPerResponse: 500,  maxSecondsPerStep: 15,  maxTotalSeconds: 30,   maxIterations: 1,  maxThinkingTokens: 0   },
  'qwen3.5:4b':         { maxTokensPerResponse: 4000, maxSecondsPerStep: 60,  maxTotalSeconds: 600,  maxIterations: 20, maxThinkingTokens: 0   },
  'qwen3.5:9b':         { maxTokensPerResponse: 6000, maxSecondsPerStep: 120, maxTotalSeconds: 1800, maxIterations: 50, maxThinkingTokens: 400 },
  'qwen3.5:9b-council': { maxTokensPerResponse: 3000, maxSecondsPerStep: 60,  maxTotalSeconds: 120,  maxIterations: 1,  maxThinkingTokens: 300 },
  'qwen3.5:27b':        { maxTokensPerResponse: 8000, maxSecondsPerStep: 180, maxTotalSeconds: 300,  maxIterations: 3,  maxThinkingTokens: 600 },
};

// ─────────────────────────────────────────────────────────────
// VRAM table (MB)
// ─────────────────────────────────────────────────────────────

export const VRAM_MB: Record<string, number> = {
  'qwen3.5:2b':         1500,
  'qwen3.5:4b':         2500,
  'qwen3.5:9b':         5500,
  'qwen3.5:9b-council': 5500,
  'qwen3.5:27b':        15000,
};

export const TOTAL_VRAM = 16000; // RTX 5080

// ─────────────────────────────────────────────────────────────
// Loop detection
// ─────────────────────────────────────────────────────────────

/**
 * Compute the length of the longest common substring of two strings.
 * Used internally by detectLoop for similarity comparison.
 */
function longestCommonSubstringLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;

  let best = 0;
  // Use a single-row DP approach to keep memory O(min(m,n))
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const prev = new Array<number>(shorter.length + 1).fill(0);

  for (let j = 1; j <= longer.length; j++) {
    let diagPrev = 0;
    for (let i = 1; i <= shorter.length; i++) {
      const diagCurr = prev[i]; // save before overwrite
      if (longer[j - 1] === shorter[i - 1]) {
        prev[i] = diagPrev + 1;
        if (prev[i] > best) best = prev[i];
      } else {
        prev[i] = 0;
      }
      diagPrev = diagCurr;
    }
  }

  return best;
}

/**
 * Returns true when the agent appears to be stuck in a loop.
 *
 * Two consecutive outputs are considered "similar" when their longest
 * common substring exceeds 90 % of the shorter string's length — a
 * pure-TypeScript equivalent of Python's SequenceMatcher.ratio() > 0.9.
 *
 * @param outputs - Ordered list of agent output strings (oldest first)
 * @param window  - How many recent outputs to examine (default 3)
 */
export function detectLoop(outputs: string[], window = 3): boolean {
  if (outputs.length < window) return false;

  const recent = outputs.slice(-window);

  // Exact-duplicate shortcut
  if (new Set(recent).size === 1) return true;

  for (let i = 0; i < recent.length - 1; i++) {
    const a = recent[i];
    const b = recent[i + 1];
    const shorterLen = Math.min(a.length, b.length);
    if (shorterLen === 0) continue;
    const lcs = longestCommonSubstringLength(a, b);
    if (lcs / shorterLen > 0.9) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// Kill decision
// ─────────────────────────────────────────────────────────────

/**
 * Returns a kill reason string if the agent should be terminated,
 * or null if it is still within budget.
 */
export function shouldKill(
  agentModel: string,
  elapsedSeconds: number,
  iteration: number,
  tokensGenerated: number,
  thinkingTokens: number,
  outputs: string[],
): string | null {
  const budget = BUDGETS[agentModel];
  if (!budget) return null;

  if (elapsedSeconds > budget.maxTotalSeconds) {
    return `total_timeout (${elapsedSeconds.toFixed(0)}s > ${budget.maxTotalSeconds}s)`;
  }

  if (elapsedSeconds > budget.maxSecondsPerStep * 2) {
    return `step_timeout (${Math.round(elapsedSeconds)}s > ${budget.maxSecondsPerStep * 2}s)`;
  }

  if (iteration > budget.maxIterations) {
    return `max_iterations (${iteration} > ${budget.maxIterations})`;
  }

  if (budget.maxThinkingTokens > 0 && thinkingTokens > budget.maxThinkingTokens * 1.5) {
    return `thinking_overflow (${thinkingTokens} > ${Math.round(budget.maxThinkingTokens * 1.5)})`;
  }

  if (detectLoop(outputs)) {
    return 'loop_detected';
  }

  if (tokensGenerated > budget.maxTokensPerResponse * 1.5) {
    return `token_overflow (${tokensGenerated} > ${budget.maxTokensPerResponse * 1.5})`;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// VRAM management
// ─────────────────────────────────────────────────────────────

/**
 * Returns true if loading the given model would keep total VRAM within budget.
 */
export function canLoadModel(model: string, currentlyLoaded: string[]): boolean {
  const used = currentlyLoaded.reduce((sum, m) => sum + (VRAM_MB[m] ?? 0), 0);
  const needed = VRAM_MB[model] ?? 0;
  return used + needed <= TOTAL_VRAM;
}

/**
 * Returns the list of currently-loaded models ordered by eviction priority
 * (lowest-priority first), excluding the active model.
 */
export function evictionOrder(currentlyLoaded: string[], activeModel: string): string[] {
  const priority: Record<string, number> = {
    'qwen3.5:2b':         0,
    'qwen3.5:4b':         1,
    'qwen3.5:9b':         2,
    'qwen3.5:9b-council': 3,
    'qwen3.5:27b':        3,
  };

  return currentlyLoaded
    .filter(m => m !== activeModel)
    .sort((a, b) => (priority[a] ?? 0) - (priority[b] ?? 0));
}
