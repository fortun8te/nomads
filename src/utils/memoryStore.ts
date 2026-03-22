/**
 * memoryStore — Persistent memory for the agent (localStorage-backed)
 *
 * Provides typed memory storage with tagging, access tracking, and
 * a React hook via useSyncExternalStore.
 */

import { useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  type: 'general' | 'user' | 'campaign' | 'research';
  content: string;
  tags: string[];
  createdAt: string;       // ISO timestamp
  lastAccessedAt: string;  // ISO timestamp
  accessCount: number;
}

// ─────────────────────────────────────────────────────────────
// Storage key + internal state
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nomad_agent_memories';

type Listener = () => void;
const _listeners = new Set<Listener>();

// Cached snapshot — useSyncExternalStore requires a stable reference
// between renders when the store hasn't changed (React 18 requirement).
let _cache: Memory[] | null = null;

function notify() {
  _cache = null; // invalidate cache on any write
  _filteredCache.clear(); // Bug fix: clear per-type filtered cache on write to prevent stale reads
  for (const cb of _listeners) {
    try { cb(); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────
// Load / save helpers
// ─────────────────────────────────────────────────────────────

function loadAll(): Memory[] {
  if (_cache !== null) return _cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      _cache = getSeededMemories();
    } else {
      const parsed = JSON.parse(raw) as Memory[];
      _cache = (!Array.isArray(parsed) || parsed.length === 0) ? getSeededMemories() : parsed;
    }
  } catch {
    _cache = getSeededMemories();
  }
  return _cache;
}

function saveAll(memories: Memory[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
    // notify() clears _cache and _filteredCache, then we set the fresh cache
    // so the next read doesn't need to re-parse from localStorage.
    notify();
    _cache = memories;
  } catch {
    console.warn('[memoryStore] Failed to persist memories to localStorage');
  }
}

// ─────────────────────────────────────────────────────────────
// Seed memories — so UI isn't empty on first run
// ─────────────────────────────────────────────────────────────

function getSeededMemories(): Memory[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'seed-1',
      type: 'general',
      content: 'Neuro is an autonomous marketing creative intelligence agent. It runs research, generates ad concepts, tests them, and learns from each cycle.',
      tags: ['system', 'overview'],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    },
    {
      id: 'seed-2',
      type: 'campaign',
      content: 'Best performing ad angle: objection-handling copy outperforms pure desire-based copy for supplement brands by ~18% on average.',
      tags: ['ad-angles', 'supplements', 'insight'],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    },
    {
      id: 'seed-3',
      type: 'research',
      content: 'Collagen supplement market 2025: key trends are bioavailability claims, third-party testing, grass-fed/marine sourcing, and skin-hair-joint bundling.',
      tags: ['collagen', 'market-research', '2025'],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    },
    // ── User context (DO NOT surface unprompted) ──
    {
      id: 'user-context-work',
      type: 'general',
      content: 'User: Michael (19), solo freelance 3D artist and motion designer in Amersfoort, Netherlands. Full-time since Sep 2025. Specializes in product viz, ad creatives, animation for DTC/personal brands. Clients: Luke Belmar, Simpletics, Prima Medical, NOUN Naturals. ~€3-4k/month at ~70% margins, charges €400-600/day.',
      tags: ['user', 'context', 'work', 'do-not-surface-unprompted'],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    },
    {
      id: 'user-context-personal',
      type: 'general',
      content: 'User style: Dutch, casual and direct (mixes Dutch/English), works in intense 12-16hr hyperfocus sessions. High-end setup (RTX 5080, Ryzen 9800X3D, 128GB RAM). Self-taught across all skills. Prefers direct communication, hates corporate language, iterates fast.',
      tags: ['user', 'context', 'personal', 'do-not-surface-unprompted'],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    },
    {
      id: 'user-context-current',
      type: 'general',
      content: 'Current focus: freelance brandscaler running Meta ads for ecommerce brands, building multi-agent Creative OS locally using Ollama/Python/Wayfarer research pipeline. Also exploring FMARCHETYPE variable font and AI tools. Back from Cape Town trip (Feb-Mar), now in Amsterdam.',
      tags: ['user', 'context', 'current', 'do-not-surface-unprompted'],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    },
    {
      id: 'user-context-skills',
      type: 'general',
      content: 'User skills: Blender, After Effects, motion design (self-taught since mid-teens). Freelancing since 15. Core aesthetic: minimalist, premium, technically precise. Also builds with React/TypeScript/Vite/Tailwind. Developed Wayfarer (async Python web research), Creative OS dashboard, Figma-Blender texture sync tools.',
      tags: ['user', 'context', 'skills', 'do-not-surface-unprompted'],
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    },
  ];
}

// Initialize storage with seeds if empty
function ensureInitialized(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Filter out any seeds the user previously deleted
      const deleted: string[] = JSON.parse(localStorage.getItem('nomad_deleted_memories') || '[]');
      const seeds = getSeededMemories().filter(s => !deleted.includes(s.id));
      saveAll(seeds);
    } else {
      _cache = null;
    }
  } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  ensureInitialized();
}

// ─────────────────────────────────────────────────────────────
// ID generator
// ─────────────────────────────────────────────────────────────

function generateId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Add a new memory entry.
 */
export function addMemory(
  type: Memory['type'],
  content: string,
  tags: string[] = []
): Memory {
  const now = new Date().toISOString();
  const memory: Memory = {
    id: generateId(),
    type,
    content,
    tags,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
  };

  const memories = loadAll();
  memories.unshift(memory); // newest first
  saveAll(memories);
  // Fire-and-forget filesystem persistence
  persistMemoryToFS(memory).catch(() => { /* non-fatal */ });
  return memory;
}

/**
 * Get all memories, optionally filtered by type.
 * Updates lastAccessedAt and accessCount for returned memories.
 */
export function getMemories(type?: Memory['type']): Memory[] {
  const memories = loadAll();
  if (!type) return memories;
  return memories.filter(m => m.type === type);
}

/**
 * Search memories by substring match across content and tags.
 */
export function searchMemories(query: string): Memory[] {
  if (!query.trim()) return loadAll();
  const q = query.toLowerCase();
  return loadAll().filter(m =>
    m.content.toLowerCase().includes(q) ||
    m.tags.some(t => t.toLowerCase().includes(q))
  );
}

/**
 * Delete a memory by ID.
 * Removes from localStorage and filesystem.
 */
export function deleteMemory(id: string): void {
  const memories = loadAll().filter(m => m.id !== id);
  saveAll(memories);
  // Track deleted IDs so seeds don't respawn
  try {
    const deleted = JSON.parse(localStorage.getItem('nomad_deleted_memories') || '[]');
    if (!deleted.includes(id)) { deleted.push(id); localStorage.setItem('nomad_deleted_memories', JSON.stringify(deleted)); }
  } catch { /* ignore */ }
  // Fire-and-forget filesystem deletion
  deleteMemoryFromFS(id).catch(() => { /* non-fatal */ });
}

/**
 * Update lastAccessedAt and increment accessCount for a memory.
 */
export function touchMemory(id: string): void {
  const memories = loadAll();
  const idx = memories.findIndex(m => m.id === id);
  if (idx === -1) return;
  memories[idx] = {
    ...memories[idx],
    lastAccessedAt: new Date().toISOString(),
    accessCount: memories[idx].accessCount + 1,
  };
  saveAll(memories);
}

// ─────────────────────────────────────────────────────────────
// React hook — useSyncExternalStore
// ─────────────────────────────────────────────────────────────

function subscribe(cb: Listener): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

// Bug fix #10: useSyncExternalStore requires the snapshot function to return
// the *same* array reference when data has not changed — otherwise React will
// see a new reference on every render and trigger an infinite re-render loop.
// _cache holds the full array (invalidated on every write via notify()).
// Per-type filtered results are cached separately in _filteredCache and are
// only recomputed after a write (when _cache is null).
const _filteredCache = new Map<string, Memory[]>();

function getSnapshot(type?: Memory['type']): Memory[] {
  // No filter — return the stable full-list cache directly
  if (!type) return loadAll(); // loadAll() already returns _cache after first call

  // Filtered: use a per-type slot in _filteredCache.
  // The cache is invalidated by notify() which sets _cache = null —
  // we detect staleness by checking whether _cache is null.
  const cacheKey = type;
  if (_cache !== null && _filteredCache.has(cacheKey)) {
    return _filteredCache.get(cacheKey)!;
  }
  const filtered = loadAll().filter(m => m.type === type);
  _filteredCache.set(cacheKey, filtered);
  return filtered;
}

/**
 * React hook for live memory state.
 * Stays in sync with localStorage changes via useSyncExternalStore.
 */
export function useMemories(type?: Memory['type']): Memory[] {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(type),
    () => [] // server snapshot
  );
}

/**
 * Format a relative timestamp for display (e.g. "2h ago", "just now")
 */
export function formatMemoryAge(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Get stored memories by tag(s) — case-insensitive substring match.
 * Useful for retrieving previous cycle learnings by campaign name or insight type.
 */
export function getStoredMemories(tags?: string[]): Memory[] {
  if (!tags || tags.length === 0) return getMemories();
  const memories = getMemories();
  return memories.filter(m =>
    tags.some(tag => m.tags.some(mTag => mTag.toLowerCase().includes(tag.toLowerCase())))
  );
}

/**
 * Get memories by specific tag match.
 * Stricter than getStoredMemories — requires exact tag match (case-insensitive).
 */
export function getMemoriesByTag(tag: string): Memory[] {
  const memories = getMemories();
  return memories.filter(m => m.tags.some(t => t.toLowerCase() === tag.toLowerCase()));
}

/**
 * Get memories created after a specific ISO timestamp.
 * Useful for retrieving learnings from recent cycles.
 */
export function getMemoriesByDate(afterISO: string): Memory[] {
  const memories = getMemories();
  const cutoff = new Date(afterISO).getTime();
  return memories.filter(m => new Date(m.createdAt).getTime() > cutoff);
}

// ─────────────────────────────────────────────────────────────
// Filesystem persistence — ~/Documents/Neuro/memories/
// ─────────────────────────────────────────────────────────────

const MEMORIES_FS_DIR = '$HOME/Documents/Neuro/memories';

/**
 * Ensure the memories directory exists on the filesystem.
 * Called lazily on first write.
 */
async function ensureMemoriesDir(): Promise<void> {
  try {
    await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `mkdir -p "${MEMORIES_FS_DIR}"`, timeout: 5000 }),
    });
  } catch { /* best effort */ }
}

/**
 * Persist a single memory to ~/Documents/Neuro/memories/<id>.json
 * The agent can read these files directly via file tools.
 */
export async function persistMemoryToFS(memory: Memory): Promise<void> {
  try {
    await ensureMemoriesDir();
    const filename = `${MEMORIES_FS_DIR}/${memory.id}.json`;
    const content = JSON.stringify(memory, null, 2);

    // Try file write API first
    const resp = await fetch('/api/file/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filename.replace('$HOME', '~'), content }),
    });

    if (!resp.ok) {
      // Fallback: shell heredoc write
      const escaped = content.replace(/'/g, "'\\''");
      await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: `cat > "${filename}" << 'MEMORY_EOF'\n${escaped}\nMEMORY_EOF`,
          timeout: 10000,
        }),
      });
    }
  } catch {
    // Non-fatal — localStorage is the source of truth
  }
}

/**
 * Delete a memory file from ~/Documents/Neuro/memories/<id>.json
 */
export async function deleteMemoryFromFS(id: string): Promise<void> {
  try {
    const filename = `${MEMORIES_FS_DIR}/${id}.json`;
    const resp = await fetch('/api/file/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filename.replace('$HOME', '~') }),
    });
    if (!resp.ok) {
      // Fallback: shell rm
      await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `rm -f "${filename}"`, timeout: 5000 }),
      });
    }
  } catch { /* best effort */ }
}

/**
 * Sync all current memories to the filesystem.
 * Useful for initial hydration or repair after a fresh install.
 */
export async function syncAllMemoriesToFS(): Promise<void> {
  const memories = loadAll();
  await ensureMemoriesDir();
  for (const m of memories) {
    await persistMemoryToFS(m);
  }
}
