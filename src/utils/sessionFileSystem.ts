/**
 * sessionFileSystem.ts — Session-aware virtual filesystem for the Nomad agent.
 *
 * Three-level hierarchy:
 *   /nomad                          (root)
 *   /nomad/sessions/{sessionId}     (agent/neuro session)
 *   /nomad/sessions/{sessionId}/computers/{computerId}  (computer session)
 *   /nomad/shared                   (cross-session shared files)
 *
 * Persistence: IndexedDB via idb-keyval (already in project).
 */

import { set, get } from 'idb-keyval';

// ── Types ──────────────────────────────────────────────────────────────────

export interface VFSNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  /** Full path like /nomad/sessions/abc123/downloads/file.pdf */
  path: string;
  mimeType?: string;
  size?: number;
  createdAt: number;
  modifiedAt: number;
  /** base64 for binary files, text for text files */
  data?: string;
  /** Child node IDs for folders */
  children?: string[];
  /** Which agent session owns this */
  sessionId?: string;
  /** Which computer session owns this */
  computerId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const IDB_KEY = 'nomad_vfs';

function makeId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Generate a human-readable session ID: `2026_03_22_12-28_XAGIE`
 * Format: YYYY_MM_DD_HH-mm_XXXXX (date + time + 5 random uppercase letters)
 */
export function generateSessionId(): string {
  const now = new Date();
  const date = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const suffix = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * 26)]).join('');
  return `${date}_${time}_${suffix}`;
}

/**
 * Extract the 5-letter suffix from a human-readable session ID.
 * E.g. `2026_03_22_12-28_XAGIE` -> `XAGIE`
 */
export function getSessionSuffix(sessionId: string): string {
  const parts = sessionId.split('_');
  return parts.length >= 5 ? parts[parts.length - 1] : sessionId.slice(0, 8);
}

function normalizePath(p: string): string {
  // Ensure leading slash, no trailing slash, collapse double slashes
  let out = ('/' + p).replace(/\/+/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function parentPath(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx <= 0 ? '/' : p.slice(0, idx);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Listeners (useSyncExternalStore pattern) ──────────────────────────────

type VFSListener = () => void;

// ── SessionFileSystem ─────────────────────────────────────────────────────

export class SessionFileSystem {
  private nodes: Map<string, VFSNode> = new Map();
  private pathIndex: Map<string, string> = new Map(); // path -> node id
  private listeners: Set<VFSListener> = new Set();
  private _snapshot: number = 0; // monotonic counter for useSyncExternalStore

  constructor() {
    this.bootstrap();
  }

  // ── External store interface ───────────────────────────────────────────

  subscribe(listener: VFSListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getSnapshot(): number {
    return this._snapshot;
  }

  private notify(): void {
    this._snapshot++;
    this.listeners.forEach(l => l());
  }

  // ── Bootstrap (create root structure) ──────────────────────────────────

  private bootstrap(): void {
    // Only create root structure if it doesn't already exist (load may fill these)
    if (!this.pathIndex.has('/nomad')) {
      this._mkdirp('/nomad', 'Nomad');
      this._mkdirp('/nomad/sessions', 'Sessions');
      this._mkdirp('/nomad/shared', 'Shared');
      this._mkdirp('/nomad/downloads', 'Downloads');
    }
  }

  // ── Session / Computer init ────────────────────────────────────────────

  initSession(sessionId: string): void {
    const base = `/nomad/sessions/${sessionId}`;
    if (this.pathIndex.has(base)) return; // already exists
    this._mkdirp(base, `Session ${sessionId.slice(0, 8)}`);
    const sessionNode = this.getByPath(base);
    if (sessionNode) {
      sessionNode.sessionId = sessionId;
    }
    this._mkdirp(`${base}/notes`, 'Notes');
    this._mkdirp(`${base}/computers`, 'Computers');
    this._mkdirp(`${base}/exports`, 'Exports');
    this.notify();
  }

  initComputer(sessionId: string, computerId: string): void {
    // Ensure session exists first
    this.initSession(sessionId);
    const base = `/nomad/sessions/${sessionId}/computers/${computerId}`;
    if (this.pathIndex.has(base)) return;
    this._mkdirp(base, `Computer ${computerId.slice(0, 8)}`);
    const compNode = this.getByPath(base);
    if (compNode) {
      compNode.sessionId = sessionId;
      compNode.computerId = computerId;
    }
    this._mkdirp(`${base}/downloads`, 'Downloads');
    this._mkdirp(`${base}/screenshots`, 'Screenshots');
    this._mkdirp(`${base}/activity`, 'Activity');
    this.notify();
  }

  // ── File operations ────────────────────────────────────────────────────

  createFolder(path: string, name: string): VFSNode {
    const fullPath = normalizePath(`${path}/${name}`);
    const existing = this.getByPath(fullPath);
    if (existing) return existing;

    const now = Date.now();
    const node: VFSNode = {
      id: makeId(),
      name,
      type: 'folder',
      path: fullPath,
      createdAt: now,
      modifiedAt: now,
      children: [],
    };

    this.nodes.set(node.id, node);
    this.pathIndex.set(fullPath, node.id);

    // Attach to parent
    this.attachToParent(fullPath, node.id);
    this.notify();
    return node;
  }

  createFile(path: string, name: string, data: string, mimeType: string): VFSNode {
    const fullPath = normalizePath(`${path}/${name}`);

    // If file already exists, update it
    const existingId = this.pathIndex.get(fullPath);
    if (existingId) {
      const existing = this.nodes.get(existingId);
      if (existing) {
        existing.data = data;
        existing.mimeType = mimeType;
        existing.size = data.length;
        existing.modifiedAt = Date.now();
        this.notify();
        return existing;
      }
    }

    const now = Date.now();
    const node: VFSNode = {
      id: makeId(),
      name,
      type: 'file',
      path: fullPath,
      mimeType,
      size: data.length,
      createdAt: now,
      modifiedAt: now,
      data,
    };

    this.nodes.set(node.id, node);
    this.pathIndex.set(fullPath, node.id);

    // Ensure parent folder structure exists
    this._mkdirp(path, path.split('/').pop() || 'folder');
    this.attachToParent(fullPath, node.id);
    this.notify();
    return node;
  }

  readFile(path: string): VFSNode | null {
    const p = normalizePath(path);
    const id = this.pathIndex.get(p);
    return id ? (this.nodes.get(id) ?? null) : null;
  }

  getByPath(path: string): VFSNode | null {
    const p = normalizePath(path);
    const id = this.pathIndex.get(p);
    return id ? (this.nodes.get(id) ?? null) : null;
  }

  getById(id: string): VFSNode | null {
    return this.nodes.get(id) ?? null;
  }

  listFolder(path: string): VFSNode[] {
    const p = normalizePath(path);
    const id = this.pathIndex.get(p);
    if (!id) return [];
    const folder = this.nodes.get(id);
    if (!folder || folder.type !== 'folder' || !folder.children) return [];

    const items: VFSNode[] = [];
    for (const childId of folder.children) {
      const child = this.nodes.get(childId);
      if (child) items.push(child);
    }
    // Sort: folders first, then by modifiedAt descending (most recent first)
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return b.modifiedAt - a.modifiedAt;
    });
    return items;
  }

  deleteNode(path: string): boolean {
    const p = normalizePath(path);
    const id = this.pathIndex.get(p);
    if (!id) return false;
    const node = this.nodes.get(id);
    if (!node) return false;

    // Recursively delete children
    if (node.type === 'folder' && node.children) {
      for (const childId of [...node.children]) {
        const child = this.nodes.get(childId);
        if (child) this.deleteNode(child.path);
      }
    }

    // Remove from parent
    const parent = this.getByPath(parentPath(p));
    if (parent && parent.children) {
      parent.children = parent.children.filter(c => c !== id);
    }

    this.nodes.delete(id);
    this.pathIndex.delete(p);
    this.notify();
    return true;
  }

  moveNode(from: string, to: string): boolean {
    const fromPath = normalizePath(from);
    const toPath = normalizePath(to);
    const id = this.pathIndex.get(fromPath);
    if (!id) return false;
    const node = this.nodes.get(id);
    if (!node) return false;

    // Detach from old parent
    const oldParent = this.getByPath(parentPath(fromPath));
    if (oldParent && oldParent.children) {
      oldParent.children = oldParent.children.filter(c => c !== id);
    }
    this.pathIndex.delete(fromPath);

    // Update node path
    node.path = toPath;
    node.modifiedAt = Date.now();
    this.pathIndex.set(toPath, id);

    // Attach to new parent
    this.attachToParent(toPath, id);
    this.notify();
    return true;
  }

  renameNode(path: string, newName: string): boolean {
    const p = normalizePath(path);
    const id = this.pathIndex.get(p);
    if (!id) return false;
    const node = this.nodes.get(id);
    if (!node) return false;

    const parent = parentPath(p);
    const newPath = normalizePath(`${parent}/${newName}`);

    // Update path index
    this.pathIndex.delete(p);
    this.pathIndex.set(newPath, id);

    node.name = newName;
    node.path = newPath;
    node.modifiedAt = Date.now();
    this.notify();
    return true;
  }

  // ── Convenience methods ────────────────────────────────────────────────

  saveDownload(sessionId: string, computerId: string, fileName: string, data: string, mimeType: string): VFSNode {
    this.initComputer(sessionId, computerId);
    const path = `/nomad/sessions/${sessionId}/computers/${computerId}/downloads`;
    return this.createFile(path, fileName, data, mimeType);
  }

  saveScreenshot(sessionId: string, computerId: string, screenshot: string): VFSNode {
    this.initComputer(sessionId, computerId);
    const path = `/nomad/sessions/${sessionId}/computers/${computerId}/screenshots`;
    const name = `screenshot_${Date.now()}.jpg`;
    return this.createFile(path, name, screenshot, 'image/jpeg');
  }

  saveActivity(sessionId: string, computerId: string, description: string, data?: string): VFSNode {
    this.initComputer(sessionId, computerId);
    const path = `/nomad/sessions/${sessionId}/computers/${computerId}/activity`;
    const name = `${Date.now()}.json`;
    const payload = JSON.stringify({ timestamp: Date.now(), description, data }, null, 2);
    return this.createFile(path, name, payload, 'application/json');
  }

  // ── Query methods ──────────────────────────────────────────────────────

  /** Get all files within a session (agent can see its computers' files) */
  getSessionFiles(sessionId: string): VFSNode[] {
    const prefix = `/nomad/sessions/${sessionId}`;
    const results: VFSNode[] = [];
    for (const [path, id] of this.pathIndex) {
      if (path.startsWith(prefix)) {
        const node = this.nodes.get(id);
        if (node && node.type === 'file') results.push(node);
      }
    }
    return results;
  }

  /** Get all session IDs */
  getSessionIds(): string[] {
    const sessionsPath = '/nomad/sessions';
    const folder = this.getByPath(sessionsPath);
    if (!folder || !folder.children) return [];
    return folder.children
      .map(cid => this.nodes.get(cid))
      .filter((n): n is VFSNode => !!n && n.type === 'folder')
      .map(n => {
        // Extract sessionId from folder name or path
        const seg = n.path.split('/').pop();
        return seg || '';
      })
      .filter(Boolean);
  }

  /** Get all computer IDs for a session */
  getComputerIds(sessionId: string): string[] {
    const compPath = `/nomad/sessions/${sessionId}/computers`;
    const folder = this.getByPath(compPath);
    if (!folder || !folder.children) return [];
    return folder.children
      .map(cid => this.nodes.get(cid))
      .filter((n): n is VFSNode => !!n && n.type === 'folder')
      .map(n => n.path.split('/').pop() || '')
      .filter(Boolean);
  }

  /** Get node count */
  get nodeCount(): number {
    return this.nodes.size;
  }

  /** Get human-readable relative time */
  formatModified(node: VFSNode): string {
    return timeAgo(node.modifiedAt);
  }

  /** Get human-readable size */
  formatSize(node: VFSNode): string {
    if (node.size == null) return '--';
    return formatBytes(node.size);
  }

  /** Get file extension from node name */
  getExtension(node: VFSNode): string | undefined {
    if (node.type !== 'file') return undefined;
    const dot = node.name.lastIndexOf('.');
    return dot > 0 ? node.name.slice(dot + 1).toLowerCase() : undefined;
  }

  // ── Persistence (IndexedDB) ────────────────────────────────────────────

  async persist(): Promise<void> {
    try {
      // Serialize nodes without data field for large files (keep data for small files)
      const serialized: Array<[string, VFSNode]> = [];
      for (const [id, node] of this.nodes) {
        serialized.push([id, node]);
      }
      await set(IDB_KEY, {
        nodes: serialized,
        pathIndex: Array.from(this.pathIndex.entries()),
      });
    } catch (err) {
      console.error('[VFS] persist failed:', err);
    }
  }

  async load(): Promise<void> {
    try {
      const raw = await get(IDB_KEY) as {
        nodes: Array<[string, VFSNode]>;
        pathIndex: Array<[string, string]>;
      } | undefined;

      if (!raw || !raw.nodes) {
        // Nothing saved yet -- keep bootstrap state
        return;
      }

      this.nodes = new Map(raw.nodes);
      this.pathIndex = new Map(raw.pathIndex);

      // Re-bootstrap if somehow root is missing
      if (!this.pathIndex.has('/nomad')) {
        this.bootstrap();
      }

      this.notify();
    } catch (err) {
      console.error('[VFS] load failed:', err);
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────

  /** Create all folders along a path (like mkdir -p) */
  private _mkdirp(targetPath: string, leafName?: string): void {
    const p = normalizePath(targetPath);
    if (this.pathIndex.has(p)) return;

    const segments = p.split('/').filter(Boolean);
    let current = '';
    for (let i = 0; i < segments.length; i++) {
      current = current + '/' + segments[i];
      if (!this.pathIndex.has(current)) {
        const name = (i === segments.length - 1 && leafName) ? leafName : segments[i];
        const now = Date.now();
        const node: VFSNode = {
          id: makeId(),
          name,
          type: 'folder',
          path: current,
          createdAt: now,
          modifiedAt: now,
          children: [],
        };
        this.nodes.set(node.id, node);
        this.pathIndex.set(current, node.id);

        // Attach to parent
        if (i > 0) {
          const parentP = current.slice(0, current.lastIndexOf('/')) || '/';
          const parentId = this.pathIndex.get(parentP);
          if (parentId) {
            const parentNode = this.nodes.get(parentId);
            if (parentNode && parentNode.children && !parentNode.children.includes(node.id)) {
              parentNode.children.push(node.id);
            }
          }
        }
      }
    }
  }

  private attachToParent(childPath: string, childId: string): void {
    const pp = parentPath(childPath);
    const parentId = this.pathIndex.get(pp);
    if (!parentId) return;
    const parentNode = this.nodes.get(parentId);
    if (!parentNode) return;
    if (!parentNode.children) parentNode.children = [];
    if (!parentNode.children.includes(childId)) {
      parentNode.children.push(childId);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

export const vfs = new SessionFileSystem();

// Auto-load on import
const _loadPromise = vfs.load();

/** Wait for VFS to be ready (call from components that need data on mount) */
export function vfsReady(): Promise<void> {
  return _loadPromise;
}

// Auto-persist debounced -- save 2s after last change
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
vfs.subscribe(() => {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => { vfs.persist(); }, 2000);
});
