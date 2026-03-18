/**
 * Visual Verifier — post-action verification agent.
 *
 * Takes a screenshot after every browser action and asks a vision model:
 * "Did this action succeed?" Returns a structured VerificationResult.
 *
 * Designed for speed: low-res capture (480x320), short prompt, capped output.
 */

import { ollamaService } from './ollama';
import { screenshotService } from './wayfayer';
import { sandboxService } from './sandboxService';
import { getVisionModel } from './modelConfig';

// ── Types ──

export interface VerificationResult {
  success: boolean;
  observation: string;    // what the agent sees on screen
  suggestion?: string;    // if failed, what to try instead
  confidence: number;     // 0-1
  screenshotB64?: string; // the verification screenshot (for UI display)
}

export interface VerifyOptions {
  action: string;           // what action was taken (e.g. "clicked Add to Cart button")
  expectedOutcome?: string; // what should happen (e.g. "cart count should increase")
  mode: 'vnc' | 'screenshot';
  sessionId?: string;       // for screenshot mode (wayfayer session)
  signal?: AbortSignal;
  maxWidth?: number;        // default 480
  maxHeight?: number;       // default 320
  quality?: number;         // JPEG quality, default 40
}

// ── Defaults ──

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 320;
const DEFAULT_QUALITY = 40;
const MAX_VERIFY_TOKENS = 200;

// ── Action categories for shouldVerify ──

const ALWAYS_VERIFY_PATTERNS = [
  /click/i,
  /navigate/i,
  /goto/i,
  /submit/i,
  /press.*enter/i,
  /fill.*form/i,
  /type.*submit/i,
  /select/i,
  /upload/i,
  /drag/i,
  /drop/i,
  /login/i,
  /sign.?in/i,
  /add.?to.?cart/i,
  /checkout/i,
  /delete/i,
  /remove/i,
];

const SKIP_VERIFY_PATTERNS = [
  /^scroll/i,
  /^read/i,
  /^view/i,
  /^get/i,
  /^extract/i,
  /^observe/i,
  /^wait/i,
  /^screenshot/i,
  /^hover$/i,
];

/**
 * Decide whether an action warrants visual verification.
 *
 * Always verify: clicks, navigations, form submissions, selects, uploads.
 * Skip: scrolls, reads, views, extracts, plain hovers.
 */
export function shouldVerify(action: string): boolean {
  // Skip patterns take priority — cheap actions never need verification
  if (SKIP_VERIFY_PATTERNS.some(p => p.test(action.trim()))) return false;
  // Always-verify patterns
  if (ALWAYS_VERIFY_PATTERNS.some(p => p.test(action))) return true;
  // Unknown actions: verify to be safe
  return true;
}

/**
 * Capture a low-res screenshot for verification.
 * Returns raw base64 JPEG (no data: prefix) or null on failure.
 */
async function captureScreenshot(opts: VerifyOptions): Promise<string | null> {
  const quality = opts.quality ?? DEFAULT_QUALITY;

  if (opts.mode === 'vnc') {
    // Sandbox (Docker VNC) mode — uses sandboxService
    try {
      const result = await sandboxService.screenshot(quality);
      if (result.error || !result.image_base64) return null;
      return result.image_base64;
    } catch {
      return null;
    }
  }

  // Screenshot (Wayfayer session) mode
  if (!opts.sessionId) return null;
  try {
    const result = await screenshotService.sessionAction(opts.sessionId, 'screenshot', {
      quality,
      signal: opts.signal,
    });
    if (result.error || !result.image_base64) return null;
    return result.image_base64;
  } catch {
    return null;
  }
}

/**
 * Build the verification prompt — kept short to minimize latency.
 */
function buildPrompt(action: string, expectedOutcome?: string): string {
  const expected = expectedOutcome
    ? `Expected result: ${expectedOutcome}`
    : 'Determine if the action succeeded based on the current page state.';

  return `Action taken: ${action}
${expected}

Look at the screenshot. Did the action succeed?
Reply with ONLY valid JSON (no markdown, no code blocks):
{"success": true/false, "observation": "what you see on screen", "suggestion": "if failed, what to try instead", "confidence": 0.0-1.0}`;
}

/**
 * Parse the vision model's JSON response.
 * Handles common LLM quirks: markdown fences, trailing text, partial JSON.
 */
function parseVerificationResponse(raw: string): Omit<VerificationResult, 'screenshotB64'> {
  // Strip markdown code fences if present
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  // Try to extract JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        success: Boolean(parsed.success),
        observation: String(parsed.observation || 'No observation'),
        suggestion: parsed.suggestion && parsed.success === false
          ? String(parsed.suggestion)
          : undefined,
        confidence: typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      };
    } catch {
      // JSON parse failed — fall through to heuristic
    }
  }

  // Heuristic fallback: look for success/fail keywords
  const lower = cleaned.toLowerCase();
  const looksSuccessful = lower.includes('success') || lower.includes('succeeded') || lower.includes('"success": true');
  const looksFailed = lower.includes('fail') || lower.includes('error') || lower.includes('"success": false');

  return {
    success: looksSuccessful && !looksFailed,
    observation: cleaned.slice(0, 300),
    suggestion: looksFailed ? 'Vision model response was not valid JSON. Retry the action.' : undefined,
    confidence: 0.3,
  };
}

/**
 * Verify a browser action by taking a screenshot and asking a vision model.
 *
 * Designed for speed:
 * - Low resolution (480x320) + low JPEG quality (40)
 * - Short prompt, capped at 200 output tokens
 * - Uses the configured vision model (typically fast/small)
 */
export async function verify(opts: VerifyOptions): Promise<VerificationResult> {
  // Step 1: Capture screenshot
  const screenshotB64 = await captureScreenshot(opts);

  if (!screenshotB64) {
    return {
      success: false,
      observation: 'Failed to capture verification screenshot',
      suggestion: 'Check that the browser/sandbox is running and responsive',
      confidence: 0,
    };
  }

  // Step 2: Ask vision model
  const prompt = buildPrompt(opts.action, opts.expectedOutcome);
  const model = getVisionModel();

  try {
    const response = await ollamaService.generateStream(
      prompt,
      'You are a visual verification agent. Analyze the screenshot and determine if the described action succeeded. Reply with JSON only.',
      {
        model,
        images: [screenshotB64],
        temperature: 0.1,
        num_predict: MAX_VERIFY_TOKENS,
        signal: opts.signal,
      },
    );

    // Step 3: Parse response
    const result = parseVerificationResponse(response);

    return {
      ...result,
      screenshotB64,
    };
  } catch (error) {
    // Abort is not a verification failure — re-throw
    if (opts.signal?.aborted) throw error;

    return {
      success: false,
      observation: `Vision model error: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: 'Vision model may be unavailable. Check Ollama connection.',
      confidence: 0,
      screenshotB64,
    };
  }
}

/**
 * Convenience: verify and retry helper.
 *
 * Runs verification, and if it fails, returns the suggestion so the caller
 * can decide whether to retry. Does NOT retry automatically — that decision
 * belongs to the calling agent.
 */
export async function verifyAction(
  action: string,
  mode: 'vnc' | 'screenshot',
  options?: Partial<VerifyOptions>,
): Promise<VerificationResult> {
  return verify({
    action,
    mode,
    ...options,
  });
}
