/**
 * fileSystem — File and folder operations API
 *
 * Provides a typed interface for:
 * - Creating files and folders
 * - Deleting files and folders (recursive)
 * - Renaming and moving files
 * - Listing directory contents as a tree
 *
 * Backend: /api/file/* and /api/folder/* endpoints (proxied to wayfarer_server.py)
 */

/**
 * Minimal FileNode — used by UI tree components (id, name, type, children only).
 * This is the canonical type for getFileTree() return values.
 */
export type FileNode = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
};

/**
 * Extended node with server-side metadata (path, size, timestamps).
 * Used internally by FileExplorer and other components that need full path info.
 */
export interface FileTreeNode extends FileNode {
  path: string;         // full path
  size?: number;        // bytes, for files
  modifiedAt?: string;  // ISO timestamp
  children?: FileTreeNode[];
}

// ──────────────────────────────────────────────────────────────────────────
// Backend helpers
// ──────────────────────────────────────────────────────────────────────────

async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${endpoint}`);
  return resp.json() as Promise<T>;
}

async function apiGet<T>(endpoint: string): Promise<T> {
  const resp = await fetch(endpoint, {
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${endpoint}`);
  return resp.json() as Promise<T>;
}

// ──────────────────────────────────────────────────────────────────────────
// File operations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a new file in the workspace
 */
export async function createFile(
  path: string,
  content: string = ''
): Promise<{ success: boolean; file?: FileTreeNode; error?: string }> {
  try {
    const result = await apiPost<{ success: boolean; error?: string }>('/api/file/write', { path, content });
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      file: {
        id: path,
        name: path.split('/').pop() || '',
        path,
        type: 'file',
        size: content.length,
        modifiedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Create a new folder
 */
export async function createFolder(
  path: string
): Promise<{ success: boolean; folder?: FileTreeNode; error?: string }> {
  try {
    const result = await apiPost<{ success: boolean; error?: string }>('/api/folder/create', { path });
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      folder: {
        id: path,
        name: path.split('/').pop() || '',
        path,
        type: 'folder',
        children: [],
        modifiedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Delete a file
 */
export async function deleteFile(path: string): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await apiPost<{ success: boolean; error?: string }>('/api/file/delete', { path });
    return result;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Delete a folder and optionally its contents
 */
export async function deleteFolder(
  path: string,
  _recursive: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // The backend always deletes recursively for directories
    const result = await apiPost<{ success: boolean; error?: string }>('/api/file/delete', { path });
    return result;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Rename a file or folder (moves from oldPath to newPath)
 */
export async function renameFile(
  oldPath: string,
  newPath: string
): Promise<{ success: boolean; file?: FileTreeNode; error?: string }> {
  try {
    const result = await apiPost<{ success: boolean; error?: string }>('/api/file/move', {
      fromPath: oldPath,
      toPath: newPath,
    });
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      file: {
        id: newPath,
        name: newPath.split('/').pop() || '',
        path: newPath,
        type: 'file',
        modifiedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Move a file or folder to a different location
 */
export async function moveFile(
  fromPath: string,
  toPath: string
): Promise<{ success: boolean; file?: FileTreeNode; error?: string }> {
  try {
    const result = await apiPost<{ success: boolean; error?: string }>('/api/file/move', { fromPath, toPath });
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      file: {
        id: toPath,
        name: toPath.split('/').pop() || '',
        path: toPath,
        type: 'file',
        modifiedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * List files in a folder as a flat array
 */
export async function listFiles(
  folderPath: string,
  recursive: boolean = false
): Promise<{ success: boolean; files: FileTreeNode[]; error?: string }> {
  try {
    const result = await apiPost<{ success: boolean; files: FileTreeNode[]; error?: string }>(
      '/api/file/list',
      { path: folderPath, recursive }
    );
    return result;
  } catch (err) {
    return { success: false, files: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get the tree structure of a folder as a flat array of FileNode children.
 * Calls GET /api/file/tree?path=... and returns the root's children (or [] on error).
 */
export async function getFileTree(folderPath: string): Promise<FileNode[]> {
  try {
    const encoded = encodeURIComponent(folderPath);
    const result = await apiGet<{ success: boolean; tree?: FileTreeNode; error?: string }>(
      `/api/file/tree?path=${encoded}`
    );
    if (!result.success || !result.tree) return [];
    // Return children of the root node so callers get a flat array of top-level entries
    return result.tree.children ?? [];
  } catch {
    return [];
  }
}

/**
 * Read file content.
 * Calls GET /api/file/read?path=...
 */
export async function readFile(path: string): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const encoded = encodeURIComponent(path);
    const result = await apiGet<{ success: boolean; content?: string; error?: string }>(
      `/api/file/read?path=${encoded}`
    );
    return result;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Write file content
 */
export async function writeFile(
  path: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await apiPost<{ success: boolean; error?: string }>('/api/file/write', { path, content });
    return result;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Get the extension of a file (without the dot)
 */
export function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return '';
  return filename.substring(idx + 1).toLowerCase();
}

/**
 * Check if a filename appears to be an image
 */
export function isImageFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
}

/**
 * Check if a filename appears to be a code file
 */
export function isCodeFile(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rb', 'php'].includes(ext);
}

/**
 * Get a human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get a unique ID for a file path
 */
export function getFileId(path: string): string {
  return path.replace(/[^a-zA-Z0-9-_/]/g, '');
}

/**
 * Sanitize a filename (remove special characters)
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 255);
}
