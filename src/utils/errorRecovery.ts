/**
 * Error Recovery — Intelligent recovery strategies for browser automation failures.
 *
 * When an action fails, the system diagnoses the root cause, generates a ranked
 * list of recovery strategies, and can execute them automatically.
 *
 * Includes element scoring — finds the best alternative element matching
 * the original goal text using bigram similarity + role/tag bonuses.
 */

import type { ElementInfo } from './sandboxService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecoveryContext {
  action: string;
  targetIndex?: number;
  targetText?: string;
  error: string;
  pageUrl: string;
  pageTitle: string;
  attemptCount: number;
  elements?: ElementInfo[];
}

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
  description: string;
  action?: Record<string, unknown>;
  delay?: number;
}

// ---------------------------------------------------------------------------
// Fuzzy text matching
// ---------------------------------------------------------------------------

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
// Element scoring — rank elements by relevance to goal text
// ---------------------------------------------------------------------------

/**
 * Score elements by relevance to a goal string.
 * Returns elements sorted by score descending with a numeric score property.
 */
export function scoreElementsByGoal(
  elements: ElementInfo[],
  goalText: string,
): Array<ElementInfo & { relevanceScore: number }> {
  const goalWords = normalise(goalText).split(/\s+/).filter(w => w.length > 2);

  return elements.map(el => {
    let score = 0;
    const composite = normalise(
      [el.text, el.ariaLabel, el.placeholder, el.role].filter(Boolean).join(' ')
    );

    // Exact substring match is very strong
    if (composite.includes(normalise(goalText))) {
      score += 10;
    }

    // Word-level matches
    for (const word of goalWords) {
      if (composite.includes(word)) score += 3;
    }

    // Bigram similarity
    const similarity = diceCoefficient(goalText, composite);
    score += similarity * 5;

    // Interactive element bonus
    const tag = el.tag?.toUpperCase() || '';
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) score += 2;
    if (el.role === 'button' || el.role === 'link') score += 1;

    // Penalize empty elements
    if (!el.text && !el.ariaLabel) score -= 2;

    return { ...el, relevanceScore: score };
  })
  .filter(el => el.relevanceScore > 0)
  .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ---------------------------------------------------------------------------
// findAlternativeElement
// ---------------------------------------------------------------------------

export function findAlternativeElement(
  targetText: string,
  elements: ElementInfo[],
): number | null {
  if (!targetText || elements.length === 0) return null;

  // Use element scoring for smarter matching
  const scored = scoreElementsByGoal(elements, targetText);
  if (scored.length > 0 && scored[0].relevanceScore >= 3) {
    return scored[0].index;
  }

  // Fallback to bigram matching
  const SIMILARITY_THRESHOLD = 0.4;
  let bestIndex: number | null = null;
  let bestScore = 0;

  for (const el of elements) {
    const composite = [el.text, el.ariaLabel, el.placeholder, el.role]
      .filter(Boolean)
      .join(' ');

    if (!composite) continue;

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

function isTimeout(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('deadline exceeded')
  );
}

function isRedirectLoop(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('redirect') ||
    lower.includes('too many redirects') ||
    lower.includes('err_too_many_redirects')
  );
}

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

function findDismissButton(elements: ElementInfo[]): number | null {
  const dismissPatterns = [
    /close/i, /dismiss/i, /got it/i, /accept/i,
    /no thanks/i, /\u00d7/, /\u2715/, /^x$/i,
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

export function diagnoseAndRecover(ctx: RecoveryContext): RecoveryStrategy[] {
  const strategies: RecoveryStrategy[] = [];
  const { action, attemptCount } = ctx;

  if (attemptCount >= 5) {
    strategies.push({
      type: 'abort',
      description: `Giving up after ${attemptCount} attempts.`,
    });
    return strategies;
  }

  switch (action) {
    case 'click':
      diagnoseClick(ctx, strategies);
      break;
    case 'input':
      diagnoseInput(ctx, strategies);
      break;
    case 'navigate':
      diagnoseNavigate(ctx, strategies);
      break;
    default:
      diagnoseGeneric(ctx, strategies);
      break;
  }

  // Universal fallbacks
  const presentTypes = new Set(strategies.map(s => s.type));

  if (!presentTypes.has('wait_and_retry') && attemptCount < 2) {
    strategies.push({
      type: 'wait_and_retry',
      description: 'Page may be loading or transitioning — wait 500ms then retry the same action.',
      delay: 500,
    });
  }

  if (!presentTypes.has('refresh') && attemptCount < 3) {
    strategies.push({
      type: 'refresh',
      description: 'Page may be in a bad state — full reload then retry from this step.',
    });
  }

  if (!presentTypes.has('navigate_back')) {
    strategies.push({
      type: 'navigate_back',
      description: 'This approach is not working — go back and try a different path to the goal.',
    });
  }

  if (!presentTypes.has('skip')) {
    strategies.push({
      type: 'skip',
      description: 'Step is non-critical — skip it and continue with the remaining plan.',
    });
  }

  if (!presentTypes.has('abort')) {
    strategies.push({
      type: 'abort',
      description: 'All recovery options exhausted — abort task.',
    });
  }

  return strategies;
}

// ---------------------------------------------------------------------------
// Per-action diagnosis
// ---------------------------------------------------------------------------

function diagnoseClick(ctx: RecoveryContext, strategies: RecoveryStrategy[]): void {
  const { error, elements = [], targetText, targetIndex, attemptCount } = ctx;

  if (isClickIntercepted(error)) {
    const dismissIdx = findDismissButton(elements);
    if (dismissIdx !== null) {
      strategies.push({
        type: 'alternative_element',
        description: `Click dismiss/close button [${dismissIdx}] to clear the overlay blocking the target.`,
        action: { index: dismissIdx, followUp: 'retry_original' },
      });
    }
    strategies.push({
      type: 'retry',
      description: 'Press Escape to close modal/popup, then retry the original click.',
      action: { pressEscape: true },
    });
  }

  if (isElementNotFound(error)) {
    strategies.push({
      type: 'scroll_and_retry',
      description: 'Element may be below the fold — scroll down 600px and re-scan.',
      action: { direction: 'down', amount: 600 },
    });
    strategies.push({
      type: 'scroll_and_retry',
      description: 'Element may be above viewport — scroll up 600px and re-scan.',
      action: { direction: 'up', amount: 600 },
    });

    // Use element scoring for smarter alternative finding
    if (targetText && elements.length > 0) {
      const scored = scoreElementsByGoal(elements, targetText);
      if (scored.length > 0 && scored[0].index !== targetIndex) {
        const el = scored[0];
        const elLabel = el.text || el.ariaLabel || `[${el.tag}]`;
        strategies.push({
          type: 'alternative_element',
          description: `Try "${elLabel}" [${el.index}] instead — best text match (score: ${el.relevanceScore.toFixed(1)}).`,
          action: { index: el.index },
        });
      }
      if (scored.length > 1 && scored[1].index !== targetIndex) {
        const el = scored[1];
        const elLabel = el.text || el.ariaLabel || `[${el.tag}]`;
        strategies.push({
          type: 'alternative_element',
          description: `Fallback: "${elLabel}" [${el.index}] (score: ${el.relevanceScore.toFixed(1)}).`,
          action: { index: el.index },
        });
      }
    }
  }

  if (!isElementNotFound(error) && !isClickIntercepted(error)) {
    if (targetIndex !== undefined) {
      const targetEl = elements.find(el => el.index === targetIndex);
      if (targetEl?.rect) {
        const cx = targetEl.rect.x + targetEl.rect.w / 2;
        const cy = targetEl.rect.y + targetEl.rect.h / 2;
        strategies.push({
          type: 'retry',
          description: `Click failed at index — retry at pixel coordinates (${Math.round(cx)}, ${Math.round(cy)}).`,
          action: { clickCoords: { x: cx, y: cy } },
        });
      }
    }

    if (attemptCount < 2) {
      strategies.unshift({
        type: 'wait_and_retry',
        description: 'Page may still be loading — wait 500ms then retry.',
        delay: 500,
      });
    }
  }
}

function diagnoseInput(ctx: RecoveryContext, strategies: RecoveryStrategy[]): void {
  const { error, elements = [], targetText, targetIndex, attemptCount } = ctx;

  if (isElementNotFound(error)) {
    strategies.push({
      type: 'scroll_and_retry',
      description: 'Scroll down to reveal the input field.',
      action: { direction: 'down', amount: 600 },
    });

    if (targetText && elements.length > 0) {
      const scored = scoreElementsByGoal(elements, targetText);
      if (scored.length > 0 && scored[0].index !== targetIndex) {
        strategies.push({
          type: 'alternative_element',
          description: `Found similar input [${scored[0].index}].`,
          action: { index: scored[0].index },
        });
      }
    }
  }

  const lower = error.toLowerCase();
  if (lower.includes('readonly') || lower.includes('disabled') || lower.includes('not editable')) {
    if (targetIndex !== undefined) {
      strategies.push({
        type: 'retry',
        description: 'Click field first to activate, then retry.',
        action: { clickFirst: true, index: targetIndex },
      });
    }
  }

  if (attemptCount < 2) {
    strategies.unshift({
      type: 'wait_and_retry',
      description: 'Wait 500ms for field to become interactive.',
      delay: 500,
    });
  }
}

function diagnoseNavigate(ctx: RecoveryContext, strategies: RecoveryStrategy[]): void {
  const { error, attemptCount } = ctx;

  if (isNetworkError(error)) {
    strategies.push({
      type: 'abort',
      description: 'DNS or network error — cannot reach destination.',
    });
    return;
  }

  if (isRedirectLoop(error)) {
    strategies.push({
      type: 'navigate_back',
      description: 'Redirect loop detected — going back.',
    });
    return;
  }

  if (isTimeout(error)) {
    if (attemptCount < 2) {
      strategies.push({
        type: 'wait_and_retry',
        description: 'Navigation timed out — retry with longer timeout.',
        delay: 2000,
      });
    }
    strategies.push({
      type: 'refresh',
      description: 'Refresh page after timeout.',
    });
  }
}

function diagnoseGeneric(ctx: RecoveryContext, strategies: RecoveryStrategy[]): void {
  const { attemptCount } = ctx;

  if (attemptCount < 2) {
    strategies.push({
      type: 'wait_and_retry',
      description: 'Wait and retry.',
      delay: 500,
    });
  }
}
