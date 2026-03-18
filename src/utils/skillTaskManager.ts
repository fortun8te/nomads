/**
 * Skill Task Manager — tracks running/completed skill executions with
 * runtime profile overrides, retry logic, and adjustment commands.
 *
 * Each skill execution becomes a SkillTask with:
 *  - The skill + params + profile used
 *  - Status tracking (running/done/failed)
 *  - Error info + what went wrong
 *  - Ability to retry with tweaked settings ("higher res", "use 9b model", etc.)
 */

import { type SkillProfile, type ModelProfile, type VisionProfile, getSkillProfile } from './agentSkills';
import { ollamaService } from './ollama';
import { getThinkingModel } from './modelConfig';

// ── Task Types ──

export interface SkillTask {
  id: number;
  skillId: string;
  params: Record<string, string>;
  profile: SkillProfile;              // the actual profile used (may differ from default after tweaks)
  status: 'running' | 'done' | 'failed' | 'retrying';
  result?: string;                    // summary of what happened
  error?: string;                     // error message if failed
  startedAt: number;
  completedAt?: number;
  retryCount: number;
  tweaks: ProfileTweak[];             // history of adjustments applied
}

export interface ProfileTweak {
  description: string;                // "increased image resolution to 1280x900"
  field: string;                      // "vision.imageSettings.maxWidth"
  oldValue: unknown;
  newValue: unknown;
}

// ── Adjustment Parser — turns natural language into profile tweaks ──

export interface ParsedAdjustment {
  tweaks: ProfileTweak[];
  applyTo: (profile: SkillProfile) => SkillProfile;
  description: string;
}

/**
 * Parse natural language adjustment commands into profile tweaks.
 * Fast keyword matching — no LLM needed for common cases.
 */
export function parseAdjustment(message: string, currentProfile: SkillProfile): ParsedAdjustment | null {
  const lower = message.toLowerCase().trim();
  const tweaks: ProfileTweak[] = [];
  let description = '';

  // ── Resolution adjustments ──
  if (/higher\s*res|increase\s*res|full\s*res|max\s*res|better\s*image|clearer\s*image|sharper/i.test(lower)) {
    const vis = currentProfile.vision;
    if (vis) {
      tweaks.push(
        { description: 'maxWidth → 1280', field: 'vision.imageSettings.maxWidth', oldValue: vis.imageSettings.maxWidth, newValue: 1280 },
        { description: 'maxHeight → 900', field: 'vision.imageSettings.maxHeight', oldValue: vis.imageSettings.maxHeight, newValue: 900 },
        { description: 'quality → 80', field: 'vision.imageSettings.quality', oldValue: vis.imageSettings.quality, newValue: 80 },
      );
      description = 'Increased image resolution to 1280x900 @ quality 80';
    }
  }
  if (/lower\s*res|decrease\s*res|faster\s*image|quick\s*image|low\s*res/i.test(lower)) {
    const vis = currentProfile.vision;
    if (vis) {
      tweaks.push(
        { description: 'maxWidth → 480', field: 'vision.imageSettings.maxWidth', oldValue: vis.imageSettings.maxWidth, newValue: 480 },
        { description: 'maxHeight → 320', field: 'vision.imageSettings.maxHeight', oldValue: vis.imageSettings.maxHeight, newValue: 320 },
        { description: 'quality → 35', field: 'vision.imageSettings.quality', oldValue: vis.imageSettings.quality, newValue: 35 },
      );
      description = 'Decreased image resolution to 480x320 @ quality 35';
    }
  }

  // ── Model swaps ──
  const modelSwap = lower.match(/use\s+(the\s+)?(\d+\.?\d*b|9b|0\.8b|35b|20b|1\.2b)\s*(model)?/i)
    || lower.match(/switch\s+(?:to\s+)?(?:the\s+)?(\d+\.?\d*b)/i);
  if (modelSwap) {
    const size = (modelSwap[2] || modelSwap[1]).toLowerCase();
    const modelMap: Record<string, string> = {
      '0.8b': 'qwen3.5:0.8b', '1.2b': 'lfm2.5-thinking:latest',
      '9b': 'qwen3.5:9b', '20b': 'gpt-oss:20b', '35b': 'qwen3.5:35b',
    };
    const newModel = modelMap[size];
    if (newModel) {
      tweaks.push({ description: `model → ${newModel}`, field: 'primary.model', oldValue: currentProfile.primary.model, newValue: newModel });
      if (currentProfile.synthesis) {
        tweaks.push({ description: `synthesis model → ${newModel}`, field: 'synthesis.model', oldValue: currentProfile.synthesis.model, newValue: newModel });
      }
      description = `Switched to ${newModel}`;
    }
  }

  // ── Temperature adjustments ──
  if (/more\s*creative|higher\s*temp|warmer|less\s*strict/i.test(lower)) {
    const newTemp = Math.min(currentProfile.primary.temperature + 0.3, 1.5);
    tweaks.push({ description: `temperature → ${newTemp}`, field: 'primary.temperature', oldValue: currentProfile.primary.temperature, newValue: newTemp });
    description = `Increased temperature to ${newTemp}`;
  }
  if (/more\s*precise|lower\s*temp|cooler|more\s*strict|more\s*accurate/i.test(lower)) {
    const newTemp = Math.max(currentProfile.primary.temperature - 0.2, 0.05);
    tweaks.push({ description: `temperature → ${newTemp}`, field: 'primary.temperature', oldValue: currentProfile.primary.temperature, newValue: newTemp });
    description = `Decreased temperature to ${newTemp}`;
  }

  // ── Token limit adjustments ──
  if (/more\s*(tokens|output|detail|verbose|longer)/i.test(lower)) {
    const newTokens = Math.min(currentProfile.primary.num_predict * 2, 2000);
    tweaks.push({ description: `num_predict → ${newTokens}`, field: 'primary.num_predict', oldValue: currentProfile.primary.num_predict, newValue: newTokens });
    description = `Increased max output to ${newTokens} tokens`;
  }
  if (/less\s*(tokens|output)|shorter|more\s*concise|briefer/i.test(lower)) {
    const newTokens = Math.max(Math.floor(currentProfile.primary.num_predict / 2), 50);
    tweaks.push({ description: `num_predict → ${newTokens}`, field: 'primary.num_predict', oldValue: currentProfile.primary.num_predict, newValue: newTokens });
    description = `Decreased max output to ${newTokens} tokens`;
  }

  // ── Text grab toggle ──
  if (/add\s*text\s*grab|enable\s*text\s*grab|also\s*grab\s*text|separate\s*text/i.test(lower)) {
    const vis = currentProfile.vision;
    if (vis) {
      tweaks.push({ description: 'separateTextGrab → true', field: 'vision.imageSettings.separateTextGrab', oldValue: vis.imageSettings.separateTextGrab, newValue: true });
      description = 'Enabled separate text grab alongside vision';
    }
  }
  if (/no\s*text\s*grab|disable\s*text\s*grab|skip\s*text|vision\s*only/i.test(lower)) {
    const vis = currentProfile.vision;
    if (vis) {
      tweaks.push({ description: 'separateTextGrab → false', field: 'vision.imageSettings.separateTextGrab', oldValue: vis.imageSettings.separateTextGrab, newValue: false });
      description = 'Disabled separate text grab (vision only)';
    }
  }

  if (tweaks.length === 0) return null;

  return {
    tweaks,
    description,
    applyTo: (profile: SkillProfile): SkillProfile => applyTweaks(profile, tweaks),
  };
}

/**
 * LLM-based adjustment parser for complex/ambiguous commands.
 * Falls back here when keyword matching fails.
 */
export async function parseAdjustmentLLM(
  message: string,
  currentProfile: SkillProfile,
  signal?: AbortSignal,
): Promise<ParsedAdjustment | null> {
  const profileSummary = JSON.stringify({
    primary: { model: currentProfile.primary.model, temperature: currentProfile.primary.temperature, num_predict: currentProfile.primary.num_predict },
    vision: currentProfile.vision ? {
      model: currentProfile.vision.model, temperature: currentProfile.vision.temperature,
      resolution: `${currentProfile.vision.imageSettings.maxWidth}x${currentProfile.vision.imageSettings.maxHeight}`,
      quality: currentProfile.vision.imageSettings.quality,
      separateTextGrab: currentProfile.vision.imageSettings.separateTextGrab,
    } : null,
    synthesis: currentProfile.synthesis ? { model: currentProfile.synthesis.model, temperature: currentProfile.synthesis.temperature } : null,
  });

  const prompt = `Current skill profile:\n${profileSummary}\n\nUser wants to adjust: "${message}"\n\nOutput JSON array of changes:\n[{"field":"primary.temperature","value":0.5},{"field":"vision.imageSettings.maxWidth","value":1280}]\n\nValid fields: primary.model, primary.temperature, primary.top_p, primary.num_predict, vision.model, vision.temperature, vision.num_predict, vision.imageSettings.maxWidth, vision.imageSettings.maxHeight, vision.imageSettings.quality, vision.imageSettings.separateTextGrab, synthesis.model, synthesis.temperature, synthesis.num_predict\n\nOutput ONLY the JSON array.`;

  let raw = '';
  try {
    await ollamaService.generateStream(prompt, 'Parse user adjustment into profile field changes. Output JSON array only.', {
      model: getThinkingModel(),
      temperature: 0.1,
      num_predict: 150,
      signal,
      onChunk: (c: string) => { raw += c; },
    });
  } catch {
    return null;
  }

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const changes: { field: string; value: unknown }[] = JSON.parse(jsonMatch[0]);
    const tweaks: ProfileTweak[] = changes.map(c => ({
      description: `${c.field} → ${c.value}`,
      field: c.field,
      oldValue: getNestedValue(currentProfile, c.field),
      newValue: c.value,
    }));

    return {
      tweaks,
      description: tweaks.map(t => t.description).join(', '),
      applyTo: (profile: SkillProfile) => applyTweaks(profile, tweaks),
    };
  } catch {
    return null;
  }
}

// ── Helpers ──

function applyTweaks(profile: SkillProfile, tweaks: ProfileTweak[]): SkillProfile {
  // Deep clone
  const p: SkillProfile = JSON.parse(JSON.stringify(profile));

  for (const tweak of tweaks) {
    setNestedValue(p, tweak.field, tweak.newValue);
  }

  return p;
}

function getNestedValue(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setNestedValue(obj: any, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) return; // path doesn't exist
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

// ── Task Store ──

let taskIdCounter = 0;
const taskStore: SkillTask[] = [];

export const skillTaskManager = {
  /** Create a new task when a skill starts executing */
  create(skillId: string, params: Record<string, string>, profile: SkillProfile): SkillTask {
    const task: SkillTask = {
      id: ++taskIdCounter,
      skillId,
      params,
      profile: JSON.parse(JSON.stringify(profile)), // snapshot
      status: 'running',
      startedAt: Date.now(),
      retryCount: 0,
      tweaks: [],
    };
    taskStore.push(task);
    // Keep last 20 tasks
    if (taskStore.length > 20) taskStore.shift();
    return task;
  },

  /** Mark task as done */
  complete(taskId: number, result: string): void {
    const task = taskStore.find(t => t.id === taskId);
    if (task) {
      task.status = 'done';
      task.result = result;
      task.completedAt = Date.now();
    }
  },

  /** Mark task as failed */
  fail(taskId: number, error: string): void {
    const task = taskStore.find(t => t.id === taskId);
    if (task) {
      task.status = 'failed';
      task.error = error;
      task.completedAt = Date.now();
    }
  },

  /** Get the most recent task (for retry/adjust commands) */
  getLatest(): SkillTask | undefined {
    return taskStore[taskStore.length - 1];
  },

  /** Get a task by ID */
  get(taskId: number): SkillTask | undefined {
    return taskStore.find(t => t.id === taskId);
  },

  /** Get all tasks */
  getAll(): SkillTask[] {
    return [...taskStore];
  },

  /** Prepare a retry — clones the task with adjusted profile */
  prepareRetry(taskId: number, adjustment: ParsedAdjustment): SkillTask | null {
    const original = taskStore.find(t => t.id === taskId);
    if (!original) return null;

    const newProfile = adjustment.applyTo(original.profile);
    const task: SkillTask = {
      id: ++taskIdCounter,
      skillId: original.skillId,
      params: { ...original.params },
      profile: newProfile,
      status: 'retrying',
      startedAt: Date.now(),
      retryCount: original.retryCount + 1,
      tweaks: [...original.tweaks, ...adjustment.tweaks],
    };
    taskStore.push(task);
    return task;
  },

  /** Check if a message is an adjustment command for the last task */
  isAdjustmentCommand(message: string): boolean {
    const lower = message.toLowerCase().trim();
    return /^(try\s+again|retry|redo|re-?run)/i.test(lower)
      || /^(use\s+|switch\s+to|increase|decrease|higher|lower|more|less|add\s+text|enable|disable|skip|no\s+text|vision\s+only)/i.test(lower)
      || /\b(higher\s*res|lower\s*res|full\s*res|better\s*image|warmer|cooler|more\s*creative|more\s*precise|more\s*tokens|fewer\s*tokens)\b/i.test(lower);
  },
};
