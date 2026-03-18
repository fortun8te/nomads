/**
 * Visual Grounding + Element Stability — fallback systems for browser automation.
 *
 * 1. Visual Grounding: When DOM indices shift after re-render, uses a screenshot +
 *    vision model to locate an element by its visual description and click at those
 *    pixel coordinates.
 *
 * 2. Element Stability: Anti-animation guard that checks an element's bounding box
 *    across multiple frames to confirm it is not moving before interacting with it.
 *
 * 3. reliableClick: Convenience function that combines stability checking, index-based
 *    click, and visual grounding fallback into a single call.
 */

import { ollamaService } from './ollama';
import { sandboxService } from './sandboxService';
import { getVisionModel } from './modelConfig';

// ── Types ──

export interface GroundingResult {
  found: boolean;
  x: number;       // viewport x coordinate (pixels)
  y: number;       // viewport y coordinate (pixels)
  confidence: number; // 0-1
  description: string;
}

export interface StabilityResult {
  stable: boolean;
  element: { x: number; y: number; w: number; h: number } | null;
  drift: number;   // pixels of movement between checks
  attempts: number;
}

export interface ReliableClickResult {
  success: boolean;
  method: 'index' | 'visual_grounding';
  details: string;
}

// ── Constants ──

const STABILITY_DRIFT_THRESHOLD = 3;   // max px movement considered "stable"
const STABILITY_DEFAULT_INTERVAL = 150; // ms between position checks
const STABILITY_DEFAULT_ATTEMPTS = 3;
const STABILITY_DEFAULT_TIMEOUT = 2000; // ms
const GROUNDING_MAX_TOKENS = 200;

// ── 1. Visual Grounding Fallback ──

/**
 * Ask the vision model to locate an element in a screenshot by its description.
 * Returns pixel coordinates relative to the screenshot/viewport dimensions.
 */
export async function visuallyLocateElement(
  description: string,
  screenshotB64: string,
  signal?: AbortSignal,
): Promise<GroundingResult> {
  const model = getVisionModel();

  const prompt = `Find the element described as '${description}' in this screenshot.
Return its center coordinates as ONLY valid JSON (no markdown, no code blocks):
{"found": true/false, "x": <pixel x>, "y": <pixel y>, "confidence": 0.0-1.0, "description": "what you see at that location"}

If the element is not visible, return {"found": false, "x": 0, "y": 0, "confidence": 0, "description": "element not found"}.`;

  const systemPrompt = 'You are a visual grounding agent. Given a screenshot and an element description, locate the element and return its center pixel coordinates as JSON. Be precise.';

  try {
    const raw = await ollamaService.generateStream(prompt, systemPrompt, {
      model,
      images: [screenshotB64],
      temperature: 0.1,
      num_predict: GROUNDING_MAX_TOKENS,
      signal,
    });

    return parseGroundingResponse(raw);
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      found: false,
      x: 0,
      y: 0,
      confidence: 0,
      description: `Vision model error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Parse the vision model's JSON response for grounding.
 */
function parseGroundingResponse(raw: string): GroundingResult {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        found: Boolean(parsed.found),
        x: typeof parsed.x === 'number' ? parsed.x : 0,
        y: typeof parsed.y === 'number' ? parsed.y : 0,
        confidence: typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0,
        description: String(parsed.description || ''),
      };
    } catch {
      // fall through to default
    }
  }

  return {
    found: false,
    x: 0,
    y: 0,
    confidence: 0,
    description: 'Failed to parse visual grounding response',
  };
}

/**
 * Take a screenshot, visually locate the target element, and click at those coordinates.
 * Returns true if the element was found and clicked.
 */
export async function clickByVisualGrounding(
  description: string,
  signal?: AbortSignal,
): Promise<boolean> {
  // Step 1: Capture screenshot
  let screenshotB64: string;
  try {
    const result = await sandboxService.screenshot(60);
    if (result.error || !result.image_base64) return false;
    screenshotB64 = result.image_base64;
  } catch {
    return false;
  }

  // Step 2: Locate element visually
  const grounding = await visuallyLocateElement(description, screenshotB64, signal);
  if (!grounding.found || grounding.confidence < 0.3) return false;

  // Step 3: Click at the found coordinates
  try {
    await sandboxService.clickCoords(grounding.x, grounding.y);
    return true;
  } catch {
    return false;
  }
}

// ── 2. Element Stability Check ──

/**
 * Get the bounding box of an element by its DOM index via JS injection.
 */
export async function getElementBounds(
  index: number,
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const js = `
    (() => {
      const el = document.querySelector('[data-element-index="${index}"]')
        || document.querySelectorAll('[data-element-index]')[${index}];
      if (!el) {
        // Fallback: try all indexed elements in order
        const all = Array.from(document.querySelectorAll('[data-element-index]'));
        const target = all.find(e => e.getAttribute('data-element-index') === '${index}');
        if (!target) return JSON.stringify(null);
        const r = target.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    })()
  `.trim();

  try {
    const result = await sandboxService.consoleExec(js);
    if (result.error || !result.result) return null;

    const parsed = JSON.parse(result.result);
    if (!parsed || typeof parsed.x !== 'number') return null;
    return parsed as { x: number; y: number; w: number; h: number };
  } catch {
    return null;
  }
}

/**
 * Check whether an element's position is stable (not animating/transitioning).
 * Measures the bounding box twice with a short delay and compares positions.
 * Retries up to maxAttempts times if drift exceeds the threshold.
 */
export async function checkElementStability(
  index: number,
  maxAttempts: number = STABILITY_DEFAULT_ATTEMPTS,
  intervalMs: number = STABILITY_DEFAULT_INTERVAL,
): Promise<StabilityResult> {
  let lastBounds: { x: number; y: number; w: number; h: number } | null = null;
  let drift = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const bounds1 = await getElementBounds(index);
    if (!bounds1) {
      return { stable: false, element: null, drift: 0, attempts: attempt };
    }

    await new Promise(r => setTimeout(r, intervalMs));

    const bounds2 = await getElementBounds(index);
    if (!bounds2) {
      return { stable: false, element: null, drift: 0, attempts: attempt };
    }

    // Calculate maximum drift across position and size
    drift = Math.max(
      Math.abs(bounds2.x - bounds1.x),
      Math.abs(bounds2.y - bounds1.y),
      Math.abs(bounds2.w - bounds1.w),
      Math.abs(bounds2.h - bounds1.h),
    );

    lastBounds = bounds2;

    if (drift <= STABILITY_DRIFT_THRESHOLD) {
      return { stable: true, element: lastBounds, drift, attempts: attempt };
    }
  }

  // Exhausted attempts — element still moving
  return { stable: false, element: lastBounds, drift, attempts: maxAttempts };
}

/**
 * Keep checking element stability until stable or timeout.
 */
export async function waitForElementStable(
  index: number,
  timeoutMs: number = STABILITY_DEFAULT_TIMEOUT,
): Promise<StabilityResult> {
  const deadline = Date.now() + timeoutMs;
  let lastResult: StabilityResult = { stable: false, element: null, drift: 0, attempts: 0 };

  while (Date.now() < deadline) {
    lastResult = await checkElementStability(index, 1, STABILITY_DEFAULT_INTERVAL);
    if (lastResult.stable) return lastResult;

    // Small pause before next round
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise(r => setTimeout(r, Math.min(100, remaining)));
  }

  // Final attempt with full check
  return checkElementStability(index, 1, STABILITY_DEFAULT_INTERVAL);
}

// ── 3. Integration — reliableClick ──

/**
 * Attempt to click an element reliably:
 *   1. Check element stability (anti-animation guard)
 *   2. Try clicking by DOM index
 *   3. If index click fails, fall back to visual grounding
 */
export async function reliableClick(
  index: number,
  description: string,
  signal?: AbortSignal,
): Promise<ReliableClickResult> {
  // Step 1: Wait for element to be stable
  const stability = await waitForElementStable(index);
  if (!stability.stable && stability.element !== null) {
    // Element exists but still animating — log it but proceed anyway
    console.warn(
      `[visualGrounding] Element ${index} not stable (drift: ${stability.drift}px after ${stability.attempts} attempts), attempting click anyway`,
    );
  }

  // Step 2: Try clicking by index
  try {
    await sandboxService.click(index);
    return {
      success: true,
      method: 'index',
      details: `Clicked element ${index} by index${!stability.stable ? ` (warning: ${stability.drift}px drift)` : ''}`,
    };
  } catch (indexError) {
    // Index click failed — element may have shifted
    const errorMsg = indexError instanceof Error ? indexError.message : String(indexError);
    console.warn(`[visualGrounding] Index click failed for element ${index}: ${errorMsg}, falling back to visual grounding`);
  }

  // Step 3: Fall back to visual grounding
  if (signal?.aborted) {
    return { success: false, method: 'visual_grounding', details: 'Aborted before visual grounding' };
  }

  const visualSuccess = await clickByVisualGrounding(description, signal);
  if (visualSuccess) {
    return {
      success: true,
      method: 'visual_grounding',
      details: `Clicked "${description}" via visual grounding after index ${index} failed`,
    };
  }

  return {
    success: false,
    method: 'visual_grounding',
    details: `Failed to click element ${index} ("${description}") by both index and visual grounding`,
  };
}
