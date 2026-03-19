/**
 * userProfile — Persistent user profile that grows over time.
 *
 * Stored in localStorage under a separate key from memoryStore so it
 * is never accidentally overwritten by campaign or research memories.
 * Injected into every agent session as background context.
 */

const PROFILE_KEY = 'nomad_user_profile';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface UserProfile {
  name?: string;
  preferences: string[];
  workingStyle: string;
  domainExpertise: string[];
  pastInteractions: number;
  lastSeen: string; // ISO timestamp
}

// ─────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────

function defaultProfile(): UserProfile {
  return {
    name: 'Michael',
    preferences: [
      'Direct communication, no filler or corporate language',
      'Technical detail when relevant',
      'Fast iteration — skip preamble, get to the point',
      'Prefers markdown formatting for structured output',
    ],
    workingStyle: 'Intense hyperfocus sessions (12-16h). Solo freelancer. Mixes Dutch/English casually. Self-taught across all tools.',
    domainExpertise: [
      'Motion design and 3D visualization (Blender, After Effects)',
      'DTC e-commerce and Meta advertising',
      'React / TypeScript / Vite / Tailwind frontend development',
      'Python (FastAPI, async scraping, Playwright)',
      'AI/LLM tooling and local model infrastructure (Ollama)',
    ],
    pastInteractions: 0,
    lastSeen: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Load / save
// ─────────────────────────────────────────────────────────────

export function loadUserProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    // Merge with defaults so new fields are always present
    return { ...defaultProfile(), ...parsed };
  } catch {
    return defaultProfile();
  }
}

export function updateUserProfile(updates: Partial<UserProfile>): void {
  try {
    const current = loadUserProfile();
    const updated: UserProfile = { ...current, ...updates };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
  } catch {
    console.warn('[userProfile] Failed to persist profile');
  }
}

/**
 * Increment session count and update lastSeen timestamp.
 * Call this each time the agent starts a new session.
 */
export function touchUserProfile(): void {
  const profile = loadUserProfile();
  updateUserProfile({
    pastInteractions: profile.pastInteractions + 1,
    lastSeen: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────
// Memory injection helper
// ─────────────────────────────────────────────────────────────

/**
 * Returns user profile as an array of { key, content } memory entries
 * ready to be injected into the agent's initial memories.
 */
export function getUserMemories(): Array<{ key: string; content: string }> {
  const p = loadUserProfile();
  const entries: Array<{ key: string; content: string }> = [];

  if (p.name) {
    entries.push({ key: 'user_name', content: p.name });
  }

  if (p.workingStyle) {
    entries.push({ key: 'user_working_style', content: p.workingStyle });
  }

  if (p.preferences.length > 0) {
    entries.push({ key: 'user_preferences', content: p.preferences.join(' | ') });
  }

  if (p.domainExpertise.length > 0) {
    entries.push({ key: 'user_expertise', content: p.domainExpertise.join(', ') });
  }

  if (p.pastInteractions > 0) {
    entries.push({ key: 'user_sessions', content: `${p.pastInteractions} sessions. Last seen: ${p.lastSeen.slice(0, 10)}` });
  }

  return entries;
}
