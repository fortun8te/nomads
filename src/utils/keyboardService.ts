/**
 * Keyboard Service — Advanced keyboard input, text typing, and form interactions
 * for the Docker sandbox browser automation system.
 *
 * Wraps sandboxService's low-level key/input APIs with higher-level helpers
 * for typing, key combos, form filling, and natural-language key parsing.
 */

import { sandboxService } from './sandboxService';

// ── Special key name mappings ──
// Maps common lowercase names to the X11 keysym names the sandbox expects.

const SPECIAL_KEYS: Record<string, string> = {
  'enter': 'Return',
  'return': 'Return',
  'tab': 'Tab',
  'escape': 'Escape',
  'esc': 'Escape',
  'backspace': 'BackSpace',
  'delete': 'Delete',
  'del': 'Delete',
  'space': 'space',
  'up': 'Up',
  'down': 'Down',
  'left': 'Left',
  'right': 'Right',
  'arrowup': 'Up',
  'arrowdown': 'Down',
  'arrowleft': 'Left',
  'arrowright': 'Right',
  'home': 'Home',
  'end': 'End',
  'pageup': 'Page_Up',
  'pagedown': 'Page_Down',
  'insert': 'Insert',
  'f1': 'F1',
  'f2': 'F2',
  'f3': 'F3',
  'f4': 'F4',
  'f5': 'F5',
  'f6': 'F6',
  'f7': 'F7',
  'f8': 'F8',
  'f9': 'F9',
  'f10': 'F10',
  'f11': 'F11',
  'f12': 'F12',
};

export interface KeyCombo {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean; // Cmd on Mac
}

// ── Helpers ──

/** Resolve a key name to the sandbox-expected string. */
function resolveKey(key: string): string {
  const lower = key.toLowerCase().trim();
  return SPECIAL_KEYS[lower] ?? key;
}

/** Small delay helper. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Build a combo string like "ctrl+shift+a" for sandboxService.pressKey. */
function comboToKeyString(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('ctrl');
  if (combo.alt) parts.push('alt');
  if (combo.shift) parts.push('shift');
  if (combo.meta) parts.push('meta');
  parts.push(resolveKey(combo.key));
  return parts.join('+');
}

// ── Exported Functions ──

/**
 * Type text character by character with optional inter-keystroke delay.
 * Uses the sandbox input API if an element index is available, otherwise
 * sends individual key presses.
 */
export async function typeText(
  text: string,
  options?: { delay?: number; index?: number },
): Promise<void> {
  const keystrokeDelay = options?.delay ?? 30;

  // If we have an element index, use the direct input API (fastest path).
  if (options?.index != null) {
    await sandboxService.input(options.index, text, false);
    return;
  }

  // Fallback: send each character as an individual key press.
  for (const char of text) {
    await sandboxService.pressKey(char);
    if (keystrokeDelay > 0) {
      await delay(keystrokeDelay);
    }
  }
}

/**
 * Press a single key by name (handles special key mapping).
 * Examples: "enter", "Tab", "F5", "Escape", "a"
 */
export async function pressKey(key: string): Promise<void> {
  await sandboxService.pressKey(resolveKey(key));
}

/**
 * Press a key combination (e.g. Ctrl+A, Cmd+C).
 * Sends the full combo string to the sandbox in one call.
 */
export async function pressCombo(combo: KeyCombo): Promise<void> {
  await sandboxService.pressKey(comboToKeyString(combo));
}

/**
 * Click on a field by selector/index, clear its contents, then type the value.
 * Higher-level form helper for filling input fields.
 */
export async function fillField(selector: string, value: string): Promise<void> {
  const index = parseInt(selector, 10);
  if (isNaN(index)) {
    throw new Error(`fillField expects a numeric element index, got "${selector}"`);
  }

  // Click the field to focus it
  await sandboxService.click(index);
  await delay(100);

  // Select all existing content and delete it
  await selectAll();
  await delay(50);
  await sandboxService.pressKey('Delete');
  await delay(50);

  // Type the new value using the direct input API
  await sandboxService.input(index, value, false);
}

/**
 * Press Enter to submit the current form.
 */
export async function submitForm(): Promise<void> {
  await sandboxService.pressKey('Return');
}

/**
 * Select all (Ctrl+A).
 */
export async function selectAll(): Promise<void> {
  await pressCombo({ key: 'a', ctrl: true });
}

/**
 * Copy (Ctrl+C).
 */
export async function copy(): Promise<void> {
  await pressCombo({ key: 'c', ctrl: true });
}

/**
 * Paste (Ctrl+V).
 */
export async function paste(): Promise<void> {
  await pressCombo({ key: 'v', ctrl: true });
}

/**
 * Undo (Ctrl+Z).
 */
export async function undo(): Promise<void> {
  await pressCombo({ key: 'z', ctrl: true });
}

/**
 * Parse natural language or shorthand keyboard instructions into actionable commands.
 *
 * Returns:
 * - A KeyCombo for combo expressions like "ctrl+a", "cmd+shift+t"
 * - A plain string for "press enter", "press tab"
 * - null if the instruction cannot be parsed
 *
 * Examples:
 *   "press enter"      → "enter"
 *   "ctrl+a"           → { key: "a", ctrl: true }
 *   "cmd+shift+t"      → { key: "t", meta: true, shift: true }
 *   "type hello world" → null (this is a type action, not a key press)
 *   "escape"           → "escape"
 */
export function parseKeyboardAction(instruction: string): KeyCombo | string | null {
  const cleaned = instruction.trim().toLowerCase();

  // Skip "type ..." instructions — those should be handled by typeText, not key press
  if (cleaned.startsWith('type ')) return null;

  // Handle "press <key>" format
  const pressMatch = cleaned.match(/^press\s+(.+)$/);
  const keyPart = pressMatch ? pressMatch[1].trim() : cleaned;

  // Check for combo notation: "ctrl+a", "cmd+shift+t", etc.
  if (keyPart.includes('+')) {
    const parts = keyPart.split('+').map(p => p.trim());
    const combo: KeyCombo = { key: '' };

    for (const part of parts) {
      switch (part) {
        case 'ctrl':
        case 'control':
          combo.ctrl = true;
          break;
        case 'alt':
        case 'option':
          combo.alt = true;
          break;
        case 'shift':
          combo.shift = true;
          break;
        case 'meta':
        case 'cmd':
        case 'command':
        case 'super':
        case 'win':
          combo.meta = true;
          break;
        default:
          combo.key = part;
          break;
      }
    }

    if (combo.key) return combo;
    return null;
  }

  // Single key — check if it's a recognized key name
  const resolved = SPECIAL_KEYS[keyPart];
  if (resolved) return keyPart;

  // Single character key
  if (keyPart.length === 1) return keyPart;

  return null;
}
