/**
 * Error Recovery — Intelligent recovery strategies for browser automation failures.
 *
 * When an action fails, the system diagnoses the root cause, generates a ranked
 * list of recovery strategies, and can execute them automatically. This prevents
 * the agent from halting on transient issues like timing races, off-screen
 * elements, or blocking modals.
 */

import type { ElementInfo } from './sandboxService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Everything we know about the failed action and current page state. */
export interface RecoveryContext {
  /** What was attempted: 'click', 'input', 'navigate', 'scroll', etc. */
  action: string;
  /** Element index that was targeted (if applicable). */
  targetIndex?: number;
  /** Human-readable description of the target (button label, link text, etc.). */
  targetText?: string;
  /** Raw error message from the failed action. */
  error: string;
  /** Current page URL. */
  pageUrl: string;
  /** Current page title. */
  pageTitle: string;
  /** How many times we have already retried this exact action. */
  attemptCount: number;
  /** Live element list from sandboxService.view(), if available. */
  elements?: ElementInfo[];
}

/**
 * A single recovery strategy with an optional concrete action to execute.
 * Strategies are returned in priority order (first = most preferred).
 */
export interface RecoveryStrategy {
  type:
    | 'retry'
    | 'alternative_element'
    | 'scroll_and_retry'
    | 'wait_and_retry'
    | 'navigate_back'
    | 'refresh'
    | 'skip'
    | 'abort';
  /** Human-readable explanation of why this strategy was chosen. */
  description: string;
  /**
   * Optional concrete action payload.  Shape depends on `type`:
   * - alternative_element: `{ index: number }`
   * - scroll_and_retry:    `{ direction: 'up' | 'down'; amount?: number }`
   * - wait_and_retry:      (uses `delay`)
   */
  action?: Record<string, unknown>;
  /** Milliseconds to wait before executing this strategy. */
  delay?: number;
}

// ---------------------------------------------------------------------------
// Fuzzy text matching
// ---------------------------------------------------------------------------

/**
 * Normalise a string for comparison: lowercase, collapse whitespace,
 * strip common punctuation noise.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple bigram-based similarity score (Dice coefficient) between two strings.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
function diceCoefficient(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const setA = bigrams(na);
  const setB = bigrams(nb);
  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

// ---------------------------------------------------------------------------
// findAlternativeElement
// ---------------------------------------------------------------------------

/**
 * Search the elements list for an element whose visible text best matches
 * `targetText`.  Returns the element index, or `null` if no good match
 * (similarity >= 0.4) is found.
 *
 * @param targetText  The text we expected to find on the target element.
 * @param elements    Current page elements from `sandboxService.view()`.
 * @returns           The best matching element index, or `null`.
 */
export function findAlternativeElement(
  targetText: string,
  elements: ElementInfo[],
): number | null {
  if (!targetText || elements.length === 0) return null;

  const SIMILARITY_THRESHOLD = 0.4;
  let bestIndex: number | null = null;
  let bestScore = 0;

  for (const el of elements) {
    // Build a composite text blob from every descriptive field.
    const composite = [
      el.text,
      el.ariaLabel,
      el.placeholder,
      el.role,
    ]
      .filter(Boolean)
      .join(' ');

    if (!composite) continue;

    // Exact substring match is the strongest signal.
    if (normalise(composite).includes(normalise(targetText))) {
      return el.index;
    }

    const score = diceCoefficient(targetText, composite);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = el.index;
    }
  }

  return bestScore >= SIMILARITY_THRESHOLD ? bestIndex : null;
}

// ---------------------------------------------------------------------------
// Private diagnosis helpers
// ---------------------------------------------------------------------------

/** True when the error message indicates the target element was not found. */
function isElementNotFound(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('not found') ||
    lower.includes('no element') ||
    lower.includes('no such') ||
    lower.includes('invalid index') ||
    lower.includes('out of range') ||
    lower.includes('stale element') ||
    lower.includes('detached')
  );
}

/** True when the error looks like a network / DNS problem. */
function isNetworkError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('dns') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('err_name_not_resolved')
  );
}

/** True when the error looks like a timeout. */
function isTimeout(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('deadline exceeded')
  );
}

/** True when the error suggests a redirect loop. */
function isRedirectLoop(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('redirect') ||
    lower.includes('too many redirects') ||
    lower.includes('err_too_many_redirects')
  );
}

/** True when the error hints that a modal or overlay is intercepting clicks. */
function isClickIntercepted(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('intercept') ||
    lower.includes('obscured') ||
    lower.includes('overlay') ||
    lower.includes('not clickable') ||
    lower.includes('another element would receive')
  );
}

/**
 * Try to find a dismiss / close button among the current elements.
 * Returns the element index or `null`.
 */
function findDismissButton(elements: ElementInfo[]): number | null {
  const dismissPatterns = [
    /close/i,
    /dismiss/i,
    /got it/i,
    /accept/i,
    /no thanks/i,
    /×/,           // multiplication sign used as X
    /✕/,
    /^x$/i,
  ];

  for (const el of elements) {
    const text = el.text || el.ariaLabel || '';
    for (const pattern of dismissPatterns) {
      if (pattern.test(text)) {
        return el.index;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// diagnoseAndRecover
// ---------------------------------------------------------------------------

/**
 * Analyse a failed action and return a ranked list of recovery strategies.
 *
 * The caller should iterate through the returned list, executing each strategy
 * in order until one succeeds (or the list is exhausted).
 *
 * @param ctx  Full context about the failure and current page state.
 * @returns    Ordered list of strategies, most-preferred first.
 */
export function diagnoseAndRecover(ctx: RecoveryContext): RecoveryStrategy[] {
  const strategies: RecoveryStrategy[] = [];
  const { action, error, elements = [], attemptCount, targetText, targetIndex } = ctx;

  // ------------------------------------------------------------------
  // Hard limits — if we have retried too many times, bail out early.
  // ------------------------------------------------------------------
  if (attemptCount >= 5) {
    strategies.push({
      type: 'abort',
      description: `Giving up after ${attemptCount} attempts — too many retries.`,
    });
    return strategies;
  }

  // ------------------------------------------------------------------
  // Action-specific diagnosis
  // ------------------------------------------------------------------
  switch (action) {
    case 'click': {
      diagnoseClick(ctx, strategies);
      break;
    }
    case 'input': {
      diagnoseInput(ctx, strategies);
      break;
    }
    case 'navigate': {
      diagnoseNavigate(ctx, strategies);
      break;
    }
    default: {
      // Generic fallback for scroll, pressKey, etc.
      diagnoseGeneric(ctx, strategies);
      break;
    }
  }

  // ------------------------------------------------------------------
  // Append universal fallbacks (only those not already present)
  // ------------------------------------------------------------------
  const presentTypes = new Set(strategies.map(s => s.type));

  if (!presentTypes.has('wait_and_retry') && attemptCount < 2) {
    strategies.push({
      type: 'wait_and_retry',
      description: 'Wait briefly and retry the same action (handles timing races).',
      delay: 500,
    });
  }

  if (!presentTypes.has('refresh') && attemptCount < 3) {
    strategies.push({
      type: 'refresh',
      description: 'Reload the page and retry from scratch.',
    });
  }

  if (!presentTypes.has('navigate_back')) {
    strategies.push({
      type: 'navigate_back',
      description: 'Go back to the previous page and try a different approach.',
    });
  }

  if (!presentTypes.has('skip')) {
    strategies.push({
      type: 'skip',
      description: 'Skip this step and continue to the next action.',
    });
  }

  if (!presentTypes.has('abort')) {
    strategies.push({
      type: 'abort',
      description: 'Abort the current task — no viable recovery path.',
    });
  }

  return strategies;
}

// ---------------------------------------------------------------------------
// Per-action diagnosis
// ---------------------------------------------------------------------------

function diagnoseClick(ctx: RecoveryContext, strategies: RecoveryStrategy[]): void {
  const { error, elements = [], targetText, targetIndex, attemptCount } = ctx;

  // --- Modal / popup blocking ---
  if (isClickIntercepted(error)) {
    const dismissIdx = findDismissButton(elements);
    if (dismissIdx !== null) {
      strategies.push({
        type: 'alternative_element',
        description: `Dismiss blocking overlay first (clicking element [${dismissIdx}]).`,
        action: { index: dismissIdx, followUp: 'retry_original' },
      });
    }
    // Try pressing Escape to close modals.
    strategies.push({
      type: 'retry',
      description: 'Press Escape to dismiss any overlay, then retry click.',
      action: { pressEscape: true },
    });
  }

  // --- Element not found ---
  if (isElementNotFound(error)) {
    // Scroll to reveal off-screen elements.
    strategies.push({
      type: 'scroll_and_retry',
      description: 'Scroll down to reveal elements that may be off-screen.',
      action: { direction: 'down', amount: 600 },
    });
    strategies.push({
      type: 'scroll_and_retry',
      description: 'Scroll up in case the element is above the viewport.',
      action: { direction: 'up', amount: 600 },
    });

    // Try fuzzy-matching an alternative element.
    if (targetText && elements.length > 0) {
      const altIdx = findAlternativeElement(targetText, elements);
      if (altIdx !== null && altIdx !== targetIndex) {
        strategies.push({
          type: 'alternative_element',
          description: `Found similar element [${altIdx}] matching "${targetText}".`,
          action: { index: altIdx },
        });
      }
    }
  }

  // --- Click registered but had no effect (generic) ---
  if (!isElementNotFound(error) && !isClickIntercepted(error)) {
    // Try coordinate-based click as fallback.
    if (targetIndex !== undefined) {
      const targetEl = elements.find(el => el.index === targetIndex);
      if (targetEl?.rect) {
        const cx = targetEl.rect.x + targetEl.rect.w / 2;
        const cy = targetEl.rect.y + targetEl.rect.h / 2;
        strategies.push({
          type: 'retry',
          description: `Retry click using pixel coordinates (${Math.round(cx)}, ${Math.round(cy)}).`,
          action: { clickCoords: { x: cx, y: cy } },
        });
      }
    }

    // Brief wait for dynamic re-renders.
    if (attemptCount < 2) {
      strategies.unshift({
        type: 'wait_and_retry',
        description: 'Wait 500ms for page to settle, then retry click.',
        delay: 500,
      });
    }
  }
}

function diagnoseInput(ctx: RecoveryContext, strategies: RecoveryStrategy[]): void {
  const { error, elements = [], targetText, targetIndex, attemptCount } = ctx;

  // --- Element not found ---
  if (isElementNotFound(error)) {
    strategies.push({
      type: 'scroll_and_retry',
      description: 'Scroll down to reveal the input field.',
      action: { direction: 'down', amount: 600 },
    });
    strategies.push({
      type: 'scroll_and_retry',
      description: 'Scroll up to reveal the input field.',
      action: { direction: 'up', amount: 600 },
    });

    if (targetText && elements.length > 0) {
      const altIdx = findAlternativeElement(targetText, elements);
      if (altIdx !== null && altIdx !== targetIndex) {
        strategies.push({
          type: 'alternative_element',
          description: `Found similar input [${altIdx}] matching "${targetText}".`,
          action: { index: altIdx },
        });
      }
    }
  }

  // --- Readonly / disabled field ---
  const lower = error.toLowerCase();
  if (lower.includes('readonly') || lower.includes('disabled') || lower.includes('not editable')) {
    // Click the field first to try activating it.
    if (targetIndex !== undefined) {
      strategies.push({
        type: 'retry',
        description: 'Click the field first to activate it, then retry input.',
        action: { clickFirst: true, index: targetIndex },
      });
    }
    // Try using JavaScript to set the value directly.
    strategies.push({
      type: 'retry',
      description: 'Set value via JavaScript as a fallback for readonly fields.',
      action: { jsSetValue: true },
    });
  }

  // --- Timing ---
  if (attemptCount < 2) {
    strategies.unshift({
      type: 'wait_and_retry',
      description: 'Wait 500ms for field to become interactive, then retry.',
      delay: 500,
    });
  }
}

function diagnoseNavigate(ctx: RecoveryContext, strategies: RecoveryStrategy[]): void {
  const { error, attemptCount } = ctx;

  // --- Hard network failures (unrecoverable) ---
  if (isNetworkError(error)) {
    strategies.push({
      type: 'abort',
      description: 'DNS or network error — cannot reach the destination.',
    });
    return;
  }

  // --- Redirect loop ---
  if (isRedirectLoop(error)) {
    strategies.push({
      type: 'navigate_back',
      description: 'Redirect loop detected — going back.',
    });
    return;
  }

  // --- Timeout ---
  if (isTimeout(error)) {
    if (attemptCount < 2) {
      strategies.push({
        type: 'wait_and_retry',
        description: 'Navigation timed out — retry with a longer timeout.',
        delay: 2000,
      });
    }
    strategies.push({
      type: 'refresh',
      description: 'Refresh the page after timeout.',
    });
  }
}

function diagnoseGeneric(ctx: RecoveryContext, strategies: RecoveryStrategy[]): void {
  const { attemptCount } = ctx;

  if (attemptCount < 2) {
    strategies.push({
      type: 'wait_and_retry',
      description: 'Wait briefly and retry the action.',
      delay: 500,
    });
  }
}

// ---------------------------------------------------------------------------
// executeRecovery
// ---------------------------------------------------------------------------

/**
 * Execute a single recovery strategy against the sandbox.
 *
 * @param strategy       The strategy to execute.
 * @param sandboxService A reference to the sandbox service (avoids circular import).
 * @returns `true` if the recovery action itself succeeded (does NOT guarantee
 *          the original action will now work — the caller should re-attempt it).
 */
export async function executeRecovery(
  strategy: RecoveryStrategy,
  sandboxService: {
    scroll: (direction: 'up' | 'down', amount?: number) => Promise<unknown>;
    click: (index: number) => Promise<unknown>;
    clickCoords: (x: number, y: number) => Promise<unknown>;
    input: (index: number, text: string, pressEnter?: boolean) => Promise<unknown>;
    pressKey: (key: string) => Promise<unknown>;
    back: () => Promise<unknown>;
    navigate: (url: string) => Promise<unknown>;
    consoleExec: (js: string) => Promise<unknown>;
  },
): Promise<boolean> {
  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  try {
    if (strategy.delay) {
      await wait(strategy.delay);
    }

    switch (strategy.type) {
      // ---- wait_and_retry ----
      case 'wait_and_retry':
      case 'retry': {
        const act = (strategy.action ?? {}) as Record<string, unknown>;

        // Press Escape before retrying (dismiss overlays).
        if (act.pressEscape) {
          await sandboxService.pressKey('Escape');
          await wait(300);
        }

        // Click-first to activate a field.
        if (act.clickFirst && typeof act.index === 'number') {
          await sandboxService.click(act.index);
          await wait(200);
        }

        // Coordinate-based click.
        if (act.clickCoords) {
          const coords = act.clickCoords as { x: number; y: number };
          await sandboxService.clickCoords(coords.x, coords.y);
        }

        // JavaScript value injection.
        if (act.jsSetValue) {
          // The caller must handle the actual JS — we just signal success.
          return true;
        }

        return true;
      }

      // ---- scroll_and_retry ----
      case 'scroll_and_retry': {
        const act = (strategy.action ?? { direction: 'down', amount: 600 }) as {
          direction: 'up' | 'down';
          amount?: number;
        };
        await sandboxService.scroll(act.direction, act.amount ?? 600);
        await wait(300);
        return true;
      }

      // ---- alternative_element ----
      case 'alternative_element': {
        const act = strategy.action as { index: number; followUp?: string } | undefined;
        if (!act || typeof act.index !== 'number') return false;

        await sandboxService.click(act.index);
        // If this was a dismiss-first action, give the page time to settle.
        if (act.followUp === 'retry_original') {
          await wait(500);
        }
        return true;
      }

      // ---- refresh ----
      case 'refresh': {
        // Reload by navigating to the same URL via JavaScript.
        await sandboxService.consoleExec('location.reload()');
        await wait(1500);
        return true;
      }

      // ---- navigate_back ----
      case 'navigate_back': {
        await sandboxService.back();
        await wait(500);
        return true;
      }

      // ---- skip ----
      case 'skip':
        // Nothing to execute — the caller should simply move on.
        return true;

      // ---- abort ----
      case 'abort':
        return false;

      default:
        return false;
    }
  } catch {
    // The recovery action itself failed — signal the caller to try the next strategy.
    return false;
  }
}
