/**
 * Vision Agent -- screen reader for browser automation.
 *
 * Takes a screenshot via the sandbox, sends it to a vision model,
 * and returns a structured description of what is on screen.
 *
 * Two modes:
 *   analyzeScreen()    -- full LLM-powered analysis (goal-aware)
 *   quickScreenCheck() -- fast screenshot + DOM element list, no LLM
 */

import { ollamaService } from '../ollama';
import { machinePool, type MachineClient } from '../sandboxService';
import { getVisionModel } from '../modelConfig';

// ── Types ──

export interface ScreenState {
  description: string;       // "I see Amazon's search results page showing 10 laptop listings"
  keyElements: string[];     // ["Search bar at top", "First result: Acer Aspire at $379"]
  currentFocus: string;      // "The page is scrolled about 30% down"
  relevantToGoal: string;    // "The search results show laptops matching the goal"
  suggestedAction?: string;  // Optional hint: "Click the first result to see details"
  screenshotBase64?: string; // The raw screenshot for UI display
}

// ── Constants ──

const VISION_SYSTEM_PROMPT =
  'You are a screen reader for browser automation. Describe what you see on screen. ' +
  'Focus on: interactive elements (buttons, links, inputs), visible text content, ' +
  'page layout and scroll position, anything relevant to the current task. ' +
  'Respond in JSON only with fields: description, keyElements (array), currentFocus, ' +
  'relevantToGoal, suggestedAction (optional).';

const MAX_TOKENS = 300;
const TEMPERATURE = 0.15;
const SCREENSHOT_QUALITY = 55;

// ── Helpers ──

/** Resolve a MachineClient from the pool. Falls back to the default machine. */
function getMachine(machineId?: string): MachineClient {
  if (machineId) {
    const machine = machinePool.get(machineId);
    if (machine) return machine;
  }
  return machinePool.getDefault();
}

/**
 * Parse the vision model's JSON response.
 * Handles markdown fences, partial JSON, and complete parse failures.
 */
function parseScreenState(raw: string, goal: string): Omit<ScreenState, 'screenshotBase64'> {
  // Strip markdown code fences if present
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  // Try to extract a JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        description: String(parsed.description || 'No description'),
        keyElements: Array.isArray(parsed.keyElements)
          ? parsed.keyElements.map(String)
          : [],
        currentFocus: String(parsed.currentFocus || 'Unknown'),
        relevantToGoal: String(parsed.relevantToGoal || 'Unknown'),
        suggestedAction: parsed.suggestedAction
          ? String(parsed.suggestedAction)
          : undefined,
      };
    } catch {
      // JSON parse failed -- fall through to fallback
    }
  }

  // Fallback: create a basic ScreenState from the raw text
  return {
    description: cleaned.slice(0, 500) || 'Vision model returned unparseable response',
    keyElements: [],
    currentFocus: 'Unknown',
    relevantToGoal: `Could not determine relevance to goal: ${goal}`,
    suggestedAction: undefined,
  };
}

// ── Main API ──

/**
 * Full LLM-powered screen analysis.
 *
 * Takes a screenshot of the sandbox browser, sends it to the vision model
 * with context about the current goal and step, and returns a structured
 * description of the screen state.
 */
export async function analyzeScreen(
  goal: string,
  currentStep: string,
  machineId?: string,
  signal?: AbortSignal,
): Promise<ScreenState> {
  const machine = getMachine(machineId);

  // Step 1: Take screenshot
  let screenshotBase64: string;
  try {
    const result = await machine.screenshot(SCREENSHOT_QUALITY);
    if (result.error || !result.image_base64) {
      return {
        description: 'Failed to capture screenshot',
        keyElements: [],
        currentFocus: 'Unknown',
        relevantToGoal: 'Cannot analyze -- screenshot capture failed',
        suggestedAction: 'Check that the sandbox browser is running',
      };
    }
    screenshotBase64 = result.image_base64;
  } catch (err) {
    return {
      description: `Screenshot error: ${err instanceof Error ? err.message : String(err)}`,
      keyElements: [],
      currentFocus: 'Unknown',
      relevantToGoal: 'Cannot analyze -- sandbox unreachable',
      suggestedAction: 'Verify sandbox is healthy via machinePool',
    };
  }

  // Step 2: Send to vision model
  const userPrompt =
    `Goal: ${goal}\n` +
    `Current step: ${currentStep}\n\n` +
    'Describe the current screen state. Respond in JSON only.';

  const model = getVisionModel();

  try {
    const response = await ollamaService.generateStream(
      userPrompt,
      VISION_SYSTEM_PROMPT,
      {
        model,
        images: [screenshotBase64],
        temperature: TEMPERATURE,
        num_predict: MAX_TOKENS,
        signal,
      },
    );

    // Step 3: Parse response
    const state = parseScreenState(response, goal);
    return { ...state, screenshotBase64 };
  } catch (error) {
    // Re-throw abort errors
    if (signal?.aborted) throw error;

    return {
      description: `Vision model error: ${error instanceof Error ? error.message : String(error)}`,
      keyElements: [],
      currentFocus: 'Unknown',
      relevantToGoal: 'Vision analysis failed',
      suggestedAction: 'Check Ollama connection and vision model availability',
      screenshotBase64,
    };
  }
}

/**
 * Quick screen check -- no LLM involved.
 *
 * Takes a screenshot and fetches the DOM element list via sandbox.view().
 * Returns immediately with raw data for fast decision-making.
 */
export async function quickScreenCheck(
  machineId?: string,
  signal?: AbortSignal,
): Promise<{ screenshot: string; elements: string }> {
  const machine = getMachine(machineId);

  // Run screenshot + view in parallel for speed
  const [screenshotResult, viewResult] = await Promise.all([
    machine.screenshot(SCREENSHOT_QUALITY).catch(() => null),
    machine.view().catch(() => null),
  ]);

  // Abort check after awaits
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

  const screenshot = screenshotResult?.image_base64 || '';
  const elements = viewResult
    ? machine.formatElements(viewResult.elements)
    : '';

  return { screenshot, elements };
}
