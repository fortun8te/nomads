/**
 * promptLoader — load prompts from /prompts/ folder at build time via Vite import.meta.glob
 *
 * Prompts are stored as .md files in /prompts/ and loaded as raw strings.
 * Falls back to empty string if the file is not found.
 *
 * Usage:
 *   import { loadPrompt } from './promptLoader';
 *   const prompt = loadPrompt('agents/nomad-identity.md');
 *
 * The prompt files contain a header block (# Title, **Stage**, etc.) followed by
 * a `---` separator, then the actual prompt text. Use `loadPromptBody()` to
 * strip the header and return only the prompt text.
 */

// Eagerly load all .md files under /prompts/ at build time
const promptModules = import.meta.glob('/prompts/**/*.md', { as: 'raw', eager: true });

/**
 * Load a prompt file by relative path (from /prompts/).
 * Returns the full file contents including the header block.
 *
 * @param path - Relative path from /prompts/, e.g. 'agents/nomad-identity.md'
 */
export function loadPrompt(path: string): string {
  const key = `/prompts/${path}`;
  return (promptModules[key] as string) || '';
}

/**
 * Load a prompt file and strip the markdown header block.
 * Everything before and including the first `---` separator is removed.
 * Use this when you want only the prompt text for injection into an LLM.
 *
 * @param path - Relative path from /prompts/, e.g. 'agents/nomad-identity.md'
 */
export function loadPromptBody(path: string): string {
  const full = loadPrompt(path);
  if (!full) return '';
  // Find the first --- separator (header divider)
  const separatorIdx = full.indexOf('\n---\n');
  if (separatorIdx === -1) return full.trim();
  return full.slice(separatorIdx + 5).trim(); // skip past \n---\n
}

/**
 * List all available prompt paths (relative to /prompts/).
 * Useful for debugging or building a prompt browser UI.
 */
export function listPrompts(): string[] {
  return Object.keys(promptModules).map(k => k.replace('/prompts/', ''));
}
