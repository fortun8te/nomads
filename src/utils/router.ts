/**
 * router — Pure heuristic router, zero LLM calls.
 *
 * Classifies user input and routes to the right executor.
 * Port of specs/router.py.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type RouteClassification = 'DIRECT' | 'QUICK' | 'MEDIUM' | 'COMPLEX' | 'INTERRUPT' | 'CHAT';

export interface RouteResult {
  classification: RouteClassification;
  handler: 'middle-agent' | 'direct-executor' | 'orchestrator-medium' | 'orchestrator-complex';
  model: string;
}

export interface ActiveTask {
  id: string;
  description: string;
  status: 'running' | 'paused' | 'complete';
}

// ─────────────────────────────────────────────────────────────
// Keyword arrays (exported so tests can reference them)
// ─────────────────────────────────────────────────────────────

export const DIRECT_KEYWORDS: string[] = [
  'write', 'create file', 'save', 'remind', 'send telegram',
  'set timer', 'make file', 'open', 'execute', '.docx', '.pdf',
  '.xlsx', '.md', '.txt', 'remind me',
];

export const COMPLEX_SIGNALS: string[] = [
  'research', 'analyze', 'compare', 'deep dive', 'build me',
  'create a full', 'comprehensive', 'competitors', 'campaign',
  'hours', 'strategy', 'full report',
];

export const INTERRUPT_SIGNALS: string[] = [
  'also', 'actually', 'wait', 'stop', 'change', 'instead',
  'add', 'forget that', 'scratch that', 'never mind', 'but also',
];

export const GREETING_PATTERNS: string[] = [
  'hey', 'hi', 'hello', 'yo', 'sup', "what's up", 'gm', 'good morning',
];

// ─────────────────────────────────────────────────────────────
// Quick signal predicate (mirrors the Python lambda)
// ─────────────────────────────────────────────────────────────

function isQuickSignal(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (msg.endsWith('?') && msg.split(' ').length < 20) return true;
  return (
    lower.startsWith('what') ||
    lower.startsWith('who') ||
    lower.startsWith('when') ||
    lower.startsWith('where') ||
    lower.startsWith('how much') ||
    lower.startsWith('how many')
  );
}

// ─────────────────────────────────────────────────────────────
// Core classifier
// ─────────────────────────────────────────────────────────────

export function classify(msg: string, activeTasks: ActiveTask[]): RouteClassification {
  const lower = msg.toLowerCase().trim();

  // Interrupt check first — only when tasks are active
  if (activeTasks.length > 0 && INTERRUPT_SIGNALS.some(s => lower.includes(s))) {
    return 'INTERRUPT';
  }

  // Greeting
  const words = lower.split(/\s+/);
  if (
    GREETING_PATTERNS.includes(lower) ||
    (words.length <= 3 && GREETING_PATTERNS.some(g => lower.includes(g)))
  ) {
    return 'CHAT';
  }

  // Direct action — but not if clearly complex
  if (DIRECT_KEYWORDS.some(kw => lower.includes(kw))) {
    if (!COMPLEX_SIGNALS.some(c => lower.includes(c))) {
      return 'DIRECT';
    }
  }

  // Quick question
  if (isQuickSignal(msg)) {
    return 'QUICK';
  }

  // Complex
  const complexity = COMPLEX_SIGNALS.filter(c => lower.includes(c)).length;
  if (complexity >= 2 || msg.split(/\s+/).length > 50) {
    return 'COMPLEX';
  }

  // Default
  return 'MEDIUM';
}

// ─────────────────────────────────────────────────────────────
// Route table
// ─────────────────────────────────────────────────────────────

const ROUTE_TABLE: Record<RouteClassification, RouteResult> = {
  CHAT:      { classification: 'CHAT',      handler: 'middle-agent',        model: 'qwen3.5:9b' },
  DIRECT:    { classification: 'DIRECT',    handler: 'direct-executor',     model: 'qwen3.5:9b' },
  QUICK:     { classification: 'QUICK',     handler: 'middle-agent',        model: 'qwen3.5:9b' },
  MEDIUM:    { classification: 'MEDIUM',    handler: 'orchestrator-medium', model: 'qwen3.5:4b'  },
  COMPLEX:   { classification: 'COMPLEX',   handler: 'orchestrator-complex', model: 'qwen3.5:9b' },
  INTERRUPT: { classification: 'INTERRUPT', handler: 'middle-agent',        model: 'qwen3.5:9b' },
};

export function route(classification: RouteClassification): RouteResult {
  return ROUTE_TABLE[classification];
}
