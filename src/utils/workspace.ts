/**
 * Workspace — per-chat folder management for the Neuro Agent.
 *
 * Each chat session gets its own folder under ~/Documents/Neuro/{chat-id}/
 * where files can be saved, read, and listed. The agent uses these as its
 * working directory for a given conversation.
 */

const BASE_DIR = '~/Documents/Neuro';

export interface WorkspaceFile {
  name: string;
  size: number;
  /** Human-readable size like "2.3 MB" */
  sizeStr: string;
  /** ISO timestamp of last modification */
  modifiedAt?: string;
  /** Human-readable relative time like "2m ago" */
  modifiedStr?: string;
  /** True if this entry is a directory */
  isFolder?: boolean;
}

/** Create a folder (and any missing parents) inside the workspace */
export async function workspaceMkdir(
  workspaceId: string,
  folderName: string,
): Promise<{ success: boolean; error?: string }> {
  const shellPath = getWorkspacePath(workspaceId).replace('~', '$HOME');
  // Sanitize: strip leading slashes and disallow path traversal
  const safe = folderName.replace(/\.\./g, '').replace(/^\/+/, '').trim();
  if (!safe) return { success: false, error: 'Invalid folder name' };
  const target = `${shellPath}/${safe}`;
  try {
    const resp = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `mkdir -p "${target}"`, timeout: 5000 }),
    });
    if (!resp.ok) return { success: false, error: 'Shell API not available' };
    const result = await resp.json();
    if (result.exitCode !== 0) return { success: false, error: result.stderr || 'mkdir failed' };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Format bytes into a human-readable string */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Generate a workspace ID from a timestamp and the first few words of the task.
 * e.g. "2026-03-18_research-collagen-market"
 */
export function generateWorkspaceId(taskHint?: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // "2026-03-18"
  const time = now.toTimeString().slice(0, 5).replace(':', ''); // "1423"

  let slug = '';
  if (taskHint) {
    slug = taskHint
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join('-');
  }

  return slug ? `${date}_${time}_${slug}` : `${date}_${time}`;
}

/** Get the full path for a workspace directory */
export function getWorkspacePath(workspaceId: string): string {
  return `${BASE_DIR}/${workspaceId}`;
}

/** Ensure the workspace directory exists (via shell) */
export async function ensureWorkspace(workspaceId: string): Promise<{ success: boolean; path: string; error?: string }> {
  const path = getWorkspacePath(workspaceId);
  try {
    const resp = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `mkdir -p "${path.replace('~', '$HOME')}"`, timeout: 5000 }),
    });
    if (!resp.ok) return { success: false, path, error: `Shell API returned ${resp.status}` };
    const result = await resp.json();
    if (result.exitCode !== 0) return { success: false, path, error: result.stderr || 'mkdir failed' };
    return { success: true, path };
  } catch (err) {
    return { success: false, path, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Expand ~ to actual home directory (resolved on server side) */
function expandPath(workspaceId: string, filename: string): string {
  return `${getWorkspacePath(workspaceId)}/${filename}`.replace('~', '$HOME');
}

/** Save content to a file in the workspace */
export async function workspaceSave(
  workspaceId: string,
  filename: string,
  content: string,
): Promise<{ success: boolean; fullPath: string; error?: string }> {
  const fullPath = `${getWorkspacePath(workspaceId)}/${filename}`;
  const shellPath = expandPath(workspaceId, filename);

  // Ensure directory exists (including any subdirectories in filename)
  const dir = shellPath.substring(0, shellPath.lastIndexOf('/'));
  try {
    await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `mkdir -p "${dir}"`, timeout: 5000 }),
    });
  } catch { /* best effort */ }

  try {
    const resp = await fetch('/api/file/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath, content }),
    });
    if (!resp.ok) {
      // Fallback: use shell to write
      const escaped = content.replace(/'/g, "'\\''");
      const cmd = `cat > "${shellPath}" << 'WORKSPACE_EOF'\n${escaped}\nWORKSPACE_EOF`;
      const shellResp = await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, timeout: 10000 }),
      });
      if (!shellResp.ok) return { success: false, fullPath, error: 'File write API not available' };
      const result = await shellResp.json();
      if (result.exitCode !== 0) return { success: false, fullPath, error: result.stderr || 'Write failed' };
    }
    return { success: true, fullPath };
  } catch (err) {
    return { success: false, fullPath, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Save binary data (e.g. from a dropped file) to the workspace */
export async function workspaceSaveBinary(
  workspaceId: string,
  filename: string,
  data: ArrayBuffer,
): Promise<{ success: boolean; fullPath: string; sizeStr: string; error?: string }> {
  const fullPath = `${getWorkspacePath(workspaceId)}/${filename}`;
  const shellPath = expandPath(workspaceId, filename);
  const sizeStr = formatBytes(data.byteLength);

  // Ensure directory exists
  const dir = shellPath.substring(0, shellPath.lastIndexOf('/'));
  try {
    await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `mkdir -p "${dir}"`, timeout: 5000 }),
    });
  } catch { /* best effort */ }

  // Convert to base64 and write via shell
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  try {
    const cmd = `echo "${base64}" | base64 -d > "${shellPath}"`;
    const resp = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, timeout: 30000 }),
    });
    if (!resp.ok) return { success: false, fullPath, sizeStr, error: 'Shell API not available' };
    const result = await resp.json();
    if (result.exitCode !== 0) return { success: false, fullPath, sizeStr, error: result.stderr || 'Write failed' };
    return { success: true, fullPath, sizeStr };
  } catch (err) {
    return { success: false, fullPath, sizeStr, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Read a file from the workspace */
export async function workspaceRead(
  workspaceId: string,
  filename: string,
): Promise<{ success: boolean; content: string; error?: string }> {
  const fullPath = `${getWorkspacePath(workspaceId)}/${filename}`;

  try {
    const resp = await fetch('/api/file/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath, maxLines: 500 }),
    });
    if (!resp.ok) {
      // Fallback: use shell
      const shellPath = expandPath(workspaceId, filename);
      const shellResp = await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `cat "${shellPath}"`, timeout: 10000 }),
      });
      if (!shellResp.ok) return { success: false, content: '', error: 'File read API not available' };
      const result = await shellResp.json();
      if (result.exitCode !== 0) return { success: false, content: '', error: result.stderr || 'Read failed' };
      return { success: true, content: result.stdout || '' };
    }
    const result = await resp.json();
    return { success: true, content: result.content || '' };
  } catch (err) {
    return { success: false, content: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/** List files in the workspace */
export async function workspaceList(
  workspaceId: string,
): Promise<{ success: boolean; files: WorkspaceFile[]; error?: string }> {
  const shellPath = getWorkspacePath(workspaceId).replace('~', '$HOME');

  try {
    // ls -lAp gives size and name, skip directories
    const cmd = `ls -lAp "${shellPath}" 2>/dev/null | grep -v '/$' | tail -n +2`;
    const resp = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, timeout: 5000 }),
    });
    if (!resp.ok) return { success: false, files: [], error: 'Shell API not available' };
    const result = await resp.json();

    if (result.exitCode !== 0 || !result.stdout?.trim()) {
      return { success: true, files: [] };
    }

    const files: WorkspaceFile[] = [];
    for (const line of result.stdout.trim().split('\n')) {
      // Parse ls -l output: permissions links owner group size month day time name
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 9) {
        const size = parseInt(parts[4]) || 0;
        const name = parts.slice(8).join(' ');
        files.push({ name, size, sizeStr: formatBytes(size) });
      }
    }

    return { success: true, files };
  } catch (err) {
    return { success: false, files: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Format relative time from an ISO timestamp */
function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 0) return 'just now';
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** List files in the workspace with detailed info (size + last modified). Recursive. Includes top-level folders. */
export async function workspaceListDetailed(
  workspaceId: string,
): Promise<{ success: boolean; files: WorkspaceFile[]; error?: string }> {
  const shellPath = getWorkspacePath(workspaceId).replace('~', '$HOME');

  try {
    // find + stat to get recursive files AND top-level dirs with modification time
    const cmd = `{ find "${shellPath}" -type f -exec stat -f '%m %z %N' {} + 2>/dev/null; find "${shellPath}" -mindepth 1 -maxdepth 1 -type d -exec stat -f '%m 0 %N' {} + 2>/dev/null; } | sort -rn`;
    const resp = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, timeout: 10000 }),
    });
    if (!resp.ok) return workspaceList(workspaceId); // fallback to basic list
    const result = await resp.json();

    if (result.exitCode !== 0 || !result.stdout?.trim()) {
      return { success: true, files: [] };
    }

    const files: WorkspaceFile[] = [];
    for (const line of result.stdout.trim().split('\n')) {
      // Format: epoch_seconds size full_path
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (match) {
        const epoch = parseInt(match[1]) * 1000;
        const size = parseInt(match[2]) || 0;
        const fullPath = match[3];
        // Strip base path to get relative name
        const resolvedBase = fullPath.includes(workspaceId)
          ? fullPath.substring(fullPath.indexOf(workspaceId) + workspaceId.length + 1)
          : fullPath;
        const modifiedAt = new Date(epoch).toISOString();
        // A top-level directory has no slash in its relative name
        const isFolder = size === 0 && !resolvedBase.includes('/');
        files.push({
          name: resolvedBase,
          size,
          sizeStr: isFolder ? '' : formatBytes(size),
          modifiedAt,
          modifiedStr: formatRelativeTime(modifiedAt),
          isFolder,
        });
      }
    }

    return { success: true, files };
  } catch (err) {
    return workspaceList(workspaceId); // fallback
  }
}

/** Preview a file from the workspace (first N bytes for text, base64 for images) */
export async function workspacePreview(
  workspaceId: string,
  filename: string,
  maxChars = 2000,
): Promise<{ success: boolean; content: string; isImage: boolean; mimeType?: string; error?: string }> {
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  const isImage = imageExts.includes(ext);

  if (isImage) {
    // Return base64 for image files
    const shellPath = expandPath(workspaceId, filename);
    try {
      const cmd = `base64 < "${shellPath}" 2>/dev/null | head -c 200000`;
      const resp = await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, timeout: 10000 }),
      });
      if (!resp.ok) return { success: false, content: '', isImage: true, error: 'Shell API not available' };
      const result = await resp.json();
      if (result.exitCode !== 0) return { success: false, content: '', isImage: true, error: result.stderr || 'Read failed' };
      const mimeMap: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon' };
      return { success: true, content: result.stdout || '', isImage: true, mimeType: mimeMap[ext] || 'image/png' };
    } catch (err) {
      return { success: false, content: '', isImage: true, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Text file
  const result = await workspaceRead(workspaceId, filename);
  return {
    success: result.success,
    content: result.content.slice(0, maxChars),
    isImage: false,
    error: result.error,
  };
}

/** Copy a file from an absolute path (e.g. sandbox) into the workspace */
export async function workspacePullFile(
  workspaceId: string,
  sourcePath: string,
  destFilename?: string,
): Promise<{ success: boolean; filename: string; sizeStr: string; error?: string }> {
  const filename = destFilename || sourcePath.substring(sourcePath.lastIndexOf('/') + 1);
  const destPath = expandPath(workspaceId, filename);

  // Ensure directory exists
  const dir = destPath.substring(0, destPath.lastIndexOf('/'));
  try {
    await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: `mkdir -p "${dir}"`, timeout: 5000 }),
    });
  } catch { /* best effort */ }

  try {
    const cmd = `cp "${sourcePath}" "${destPath}" && stat -f '%z' "${destPath}" 2>/dev/null`;
    const resp = await fetch('/api/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, timeout: 15000 }),
    });
    if (!resp.ok) return { success: false, filename, sizeStr: '', error: 'Shell API not available' };
    const result = await resp.json();
    if (result.exitCode !== 0) return { success: false, filename, sizeStr: '', error: result.stderr || 'Copy failed' };
    const size = parseInt(result.stdout?.trim() || '0') || 0;
    return { success: true, filename, sizeStr: formatBytes(size) };
  } catch (err) {
    return { success: false, filename, sizeStr: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Initialize a workspace with default folder structure and README */
export async function seedWorkspace(workspaceId: string): Promise<{ success: boolean; error?: string }> {
  // Ensure base workspace directory exists
  const result = await ensureWorkspace(workspaceId);
  if (!result.success) return { success: false, error: result.error };

  // Create default folders
  const folders = ['notes', 'code', 'assets', 'output'];
  const shellPath = getWorkspacePath(workspaceId).replace('~', '$HOME');

  try {
    for (const folder of folders) {
      const folderPath = `${shellPath}/${folder}`;
      await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `mkdir -p "${folderPath}"`, timeout: 5000 }),
      });
    }

    // Create README.md
    const readmeContent = `# Workspace: ${workspaceId}

This workspace contains the working files for this chat session.

## Folders

- **notes/** - Text notes, research findings, and documentation
- **code/** - Code snippets, scripts, and generated source files
- **assets/** - Images, PDFs, and other resource files
- **output/** - Final deliverables and results

## About

Files in this workspace are automatically synced to your local storage and can be accessed across chat sessions.
`;

    const readmePath = `${shellPath}/README.md`;
    await fetch('/api/file/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: readmePath, content: readmeContent }),
    }).catch(async () => {
      // Fallback to shell if file write API fails
      const escaped = readmeContent.replace(/'/g, "'\\''");
      const cmd = `cat > "${readmePath}" << 'WORKSPACE_EOF'\n${escaped}\nWORKSPACE_EOF`;
      await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, timeout: 10000 }),
      });
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Delete a file from the workspace */
export async function workspaceDelete(
  workspaceId: string,
  filename: string,
): Promise<{ success: boolean; error?: string }> {
  const fullPath = `${getWorkspacePath(workspaceId)}/${filename}`;
  const shellPath = expandPath(workspaceId, filename);

  try {
    const resp = await fetch('/api/file/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    });

    if (!resp.ok) {
      // Fallback: use shell to delete
      const cmd = `rm -f "${shellPath}"`;
      const shellResp = await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, timeout: 5000 }),
      });
      if (!shellResp.ok) return { success: false, error: 'File delete API not available' };
      const result = await shellResp.json();
      if (result.exitCode !== 0) return { success: false, error: result.stderr || 'Delete failed' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
