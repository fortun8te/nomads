/**
 * Module-level token statistics tracker.
 * Lets any component subscribe to live token counts without prop drilling.
 * Updated by ollamaService on every chunk and on call completion.
 *
 * Uses React 18's useSyncExternalStore pattern:
 *   - subscribe(callback) → registers listener
 *   - getSnapshot() → returns cached TokenInfo, new object only when state changes
 *   - version counter ensures snapshot identity changes only on real mutations
 *
 * States:
 *   idle           → nothing running
 *   isModelLoading → startCall() fired, waiting for first token (cold start / VRAM loading)
 *   isThinking     → thinking tokens arriving (GLM-4.7, Qwen3 internal reasoning)
 *   isGenerating   → response tokens arriving (actual output)
 */

type Listener = () => void;

export interface TokenInfo {
  /** Tokens so far in the current call — thinking + response combined */
  liveTokens: number;
  /** Response tokens only (excludes thinking) — used for live t/s calc */
  responseTokens: number;
  /** Tokens/sec — live during streaming, final from Ollama after completion */
  tokensPerSec: number;
  /** Accumulated total across all calls this session */
  sessionTotal: number;
  /** True between startCall() and first token — model is loading into VRAM */
  isModelLoading: boolean;
  /** True while thinking tokens are streaming (model reasoning, not yet outputting) */
  isThinking: boolean;
  /** True while response tokens are streaming (actual output) */
  isGenerating: boolean;
  /** Timestamp of startCall() — lets UI compute "loading for Xs" */
  callStartTime: number | null;
}

// ─── Internal mutable state ───
const state: TokenInfo = {
  liveTokens: 0,
  responseTokens: 0,
  tokensPerSec: 0,
  sessionTotal: 0,
  isModelLoading: false,
  isThinking: false,
  isGenerating: false,
  callStartTime: null,
};

/** Time of first response token — for live t/s computation */
let firstResponseTokenTime: number | null = null;

// ─── Snapshot cache (for useSyncExternalStore) ───
let snapshotVersion = 0;
let cachedSnapshotVersion = -1;
let cachedSnapshot: TokenInfo = { ...state };

function buildSnapshot(): TokenInfo {
  const info = { ...state };
  // Compute live t/s during active generation
  if (state.isGenerating && firstResponseTokenTime && state.responseTokens > 2) {
    const elapsed = (Date.now() - firstResponseTokenTime) / 1000;
    if (elapsed > 0.3) {
      info.tokensPerSec = Math.round(state.responseTokens / elapsed);
    }
  }
  return info;
}

// ─── Listeners ───
const listeners = new Set<Listener>();

/** Bump version + fire all listeners */
function emitChange() {
  snapshotVersion++;
  listeners.forEach((l) => l());
}

/** Throttled emit — max once per 80ms to avoid flooding React */
let emitTimer: ReturnType<typeof setTimeout> | null = null;
let emitPending = false;

function notify() {
  emitPending = true;
  if (!emitTimer) {
    // Fire immediately for the first notification
    emitPending = false;
    emitChange();
    // Then throttle subsequent ones
    emitTimer = setTimeout(() => {
      emitTimer = null;
      if (emitPending) {
        emitPending = false;
        emitChange();
      }
    }, 80);
  }
}

/** Flush immediately — used for important state transitions */
function notifyNow() {
  if (emitTimer) {
    clearTimeout(emitTimer);
    emitTimer = null;
  }
  emitPending = false;
  emitChange();
}

export const tokenTracker = {
  /**
   * Get immutable snapshot — returns SAME object reference if nothing changed.
   * Safe for useSyncExternalStore (Object.is stable between renders).
   */
  getSnapshot(): TokenInfo {
    if (cachedSnapshotVersion !== snapshotVersion) {
      cachedSnapshot = buildSnapshot();
      cachedSnapshotVersion = snapshotVersion;
    }
    return cachedSnapshot;
  },

  /** Subscribe to changes — returns an unsubscribe function */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Call at the start of each generateStream request */
  startCall() {
    state.liveTokens = 0;
    state.responseTokens = 0;
    state.tokensPerSec = 0;
    state.isModelLoading = true;
    state.isThinking = false;
    state.isGenerating = false;
    state.callStartTime = Date.now();
    firstResponseTokenTime = null;
    notifyNow(); // Immediate — important state change

    // Timeout: if no tokens after 45 seconds, something is stuck
    setTimeout(() => {
      if (state.isModelLoading && state.liveTokens === 0) {
        console.warn('Model loading timeout: no tokens after 45s — Ollama may be unresponsive');
        state.isModelLoading = false;
        state.isGenerating = false;
        notifyNow();
      }
    }, 45000);
  },

  /** Call for each thinking token (internal model reasoning) */
  tickThinking() {
    if (state.isModelLoading) {
      state.isModelLoading = false;
    }
    state.isThinking = true;
    state.liveTokens++;
    notify();
  },

  /** Call for each response token (actual output) */
  tick() {
    // ALWAYS set isGenerating — if tick() is called, we ARE generating
    state.isModelLoading = false;
    state.isThinking = false;
    state.isGenerating = true;
    state.liveTokens++;
    state.responseTokens++;
    if (!firstResponseTokenTime) {
      firstResponseTokenTime = Date.now();
    }
    notify();
  },

  /**
   * Call when the stream finishes.
   * eval_count    = total tokens generated (from Ollama done message)
   * eval_duration = nanoseconds spent generating (from Ollama done message)
   */
  endCall(evalCount?: number, evalDuration?: number) {
    const finalCount = evalCount ?? state.liveTokens;
    state.sessionTotal += finalCount;
    state.liveTokens = finalCount;
    // Use Ollama's precise t/s if available, otherwise keep our live estimate
    if (evalCount && evalDuration && evalDuration > 0) {
      state.tokensPerSec = Math.round(evalCount / (evalDuration / 1e9));
    }
    state.isModelLoading = false;
    state.isThinking = false;
    state.isGenerating = false;
    firstResponseTokenTime = null;
    notifyNow(); // Immediate — important state change
  },

  /** Reset session total (e.g. on new campaign run) */
  resetSession() {
    state.liveTokens = 0;
    state.responseTokens = 0;
    state.tokensPerSec = 0;
    state.sessionTotal = 0;
    state.isModelLoading = false;
    state.isThinking = false;
    state.isGenerating = false;
    state.callStartTime = null;
    firstResponseTokenTime = null;
    notifyNow();
  },
};
