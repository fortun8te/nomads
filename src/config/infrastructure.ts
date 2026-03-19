/**
 * Infrastructure configuration — all service URLs in one place.
 * Set environment variables in .env (Vite VITE_* prefix required).
 * Falls back to the standard local/remote defaults if not set.
 */
export const INFRASTRUCTURE = {
  ollamaUrl: import.meta.env.VITE_OLLAMA_URL || 'http://100.74.135.83:11440',
  wayfarerUrl: import.meta.env.VITE_WAYFARER_URL || 'http://localhost:8889',
  searxngUrl: import.meta.env.VITE_SEARXNG_URL || 'http://localhost:8888',
};

/**
 * Agent infrastructure configuration.
 * Controls concurrency, timeouts, and quality thresholds for the subagent pool.
 * Presets map to research depth tiers (SQ/QK/NR/EX/MX).
 */
export const AGENT_CONFIG = {
  /** Max subagents allowed in-flight at once (pool-level cap) */
  maxConcurrentSubagents: 5,

  /** Per-subagent hard timeout — aborts the individual agent after this many ms */
  subagentTimeoutMs: 120_000,

  /** Number of retry attempts on transient failure (network error, model timeout) */
  retryAttempts: 3,

  /** Base delay (ms) before first retry — doubles on each subsequent attempt */
  retryDelayMs: 1_000,

  /**
   * Minimum confidence score (0–1) to include a result in aggregation.
   * Results below this are flagged as low-confidence rather than silently dropped.
   */
  resultConfidenceThreshold: 0.6,

  /** Pool sizes per research preset — mirrors modelConfig.ts preset tiers */
  poolSizeByPreset: {
    SQ: 1,
    QK: 2,
    NR: 3,
    EX: 4,
    MX: 5,
  } as Record<string, number>,

  /** Whether to log subagent lifecycle events to the browser console in dev */
  devLogging: import.meta.env.DEV === true,
} as const;
