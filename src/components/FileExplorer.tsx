/**
 * FileExplorer — Tree-based file/folder navigator with CRUD operations
 *
 * Features:
 * - Expandable folder tree
 * - Right-click context menus (file, folder, root)
 * - Drag/drop to move files/folders
 * - Inline rename (double-click or right-click → Rename) for files AND folders
 * - Create file/folder with validation (toolbar buttons + context menu)
 * - Delete with confirmation
 * - Tree state updated locally after every mutation so UI reflects changes immediately
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  Copy,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '../context/ThemeContext';
import type { FileTreeNode } from '../utils/fileSystem';
import {
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  renameFile,
  moveFile,
  getFileTree,
  isImageFile,
  formatFileSize,
} from '../utils/fileSystem';

interface FileExplorerProps {
  rootPath?: string;
  initialTree?: FileTreeNode;
  onFileSelect?: (node: FileTreeNode) => void;
  onFileDelete?: (path: string) => void;
  onFileCreate?: (path: string) => void;
  className?: string;
}

type ContextMenuType = 'file' | 'folder' | 'root' | null;

interface ContextMenuState {
  type: ContextMenuType;
  node: FileTreeNode | null;
  x: number;
  y: number;
}

interface RenamingState {
  nodeId: string;
  currentName: string;
  newName: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Tree mutation helpers (pure — return new tree)
// ──────────────────────────────────────────────────────────────────────────

function treeAddNode(tree: FileTreeNode, parentPath: string, newNode: FileTreeNode): FileTreeNode {
  if (tree.path === parentPath && tree.type === 'folder') {
    return { ...tree, children: [...(tree.children || []), newNode] };
  }
  if (tree.children) {
    return { ...tree, children: tree.children.map(c => treeAddNode(c, parentPath, newNode)) };
  }
  return tree;
}

function treeRemoveNode(tree: FileTreeNode, targetPath: string): FileTreeNode | null {
  if (tree.path === targetPath) return null;
  if (tree.children) {
    const nextChildren = tree.children
      .map(c => treeRemoveNode(c, targetPath))
      .filter((c): c is FileTreeNode => c !== null);
    return { ...tree, children: nextChildren };
  }
  return tree;
}

function treeRenameNode(tree: FileTreeNode, oldPath: string, newName: string): FileTreeNode {
  if (tree.path === oldPath) {
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = `${parentPath}/${newName}`;
    return { ...tree, name: newName, path: newPath, id: newPath };
  }
  if (tree.children) {
    return { ...tree, children: tree.children.map(c => treeRenameNode(c, oldPath, newName)) };
  }
  return tree;
}

// ──────────────────────────────────────────────────────────────────────────

export function FileExplorer({
  rootPath = '/',
  initialTree,
  onFileSelect,
  onFileDelete,
  onFileCreate,
  className,
}: FileExplorerProps) {
  const { isDarkMode } = useTheme();
  const [tree, setTree] = useState<FileTreeNode | null>(initialTree || null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<RenamingState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<FileTreeNode | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null);
  const [draggedNode, setDraggedNode] = useState<FileTreeNode | null>(null);
  const [dropZone, setDropZone] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Load file tree from the real filesystem on mount and when rootPath changes
  const loadTree = useCallback(async () => {
    const children = await getFileTree(rootPath);
    // Reconstruct a synthetic root FileTreeNode from the returned children array
    const rootNode: FileTreeNode = {
      id: rootPath,
      name: rootPath.split('/').pop() || rootPath,
      path: rootPath,
      type: 'folder',
      children: children as FileTreeNode[],
    };
    setTree(rootNode);
    setExpandedIds(prev => new Set([...prev, rootPath]));
  }, [rootPath]);

  useEffect(() => {
    if (!initialTree) {
      loadTree();
    }
  }, [loadTree, initialTree]);

  // Close context menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle folder expansion
  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileTreeNode | null, type: ContextMenuType) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ type, node, x: e.clientX, y: e.clientY });
  }, []);

  // Start inline rename — works for both files and folders
  const startRename = useCallback((node: FileTreeNode) => {
    setRenaming({ nodeId: node.id, currentName: node.name, newName: node.name });
    setContextMenu(null);
  }, []);

  // Complete rename — updates tree state then refreshes from disk
  const completeRename = useCallback(async () => {
    if (!renaming || renaming.newName === renaming.currentName || !renaming.newName.trim()) {
      setRenaming(null);
      return;
    }

    const oldPath = renaming.nodeId; // node.id === node.path
    const newPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + renaming.newName;

    const result = await renameFile(oldPath, newPath);
    if (result.success) {
      setTree(prev => prev ? treeRenameNode(prev, oldPath, renaming.newName) : prev);
      console.log(`[FileExplorer] Renamed: ${oldPath} -> ${newPath}`);
      loadTree();
    }
    setRenaming(null);
  }, [renaming, loadTree]);

  // Handle delete — removes node from tree state then refreshes from disk
  const handleDelete = useCallback(async (node: FileTreeNode) => {
    if (node.type === 'file') {
      const result = await deleteFile(node.path);
      if (result.success) {
        setTree(prev => prev ? (treeRemoveNode(prev, node.path) ?? prev) : prev);
        onFileDelete?.(node.path);
        console.log(`[FileExplorer] Deleted file: ${node.path}`);
        loadTree();
      }
    } else {
      const result = await deleteFolder(node.path, true);
      if (result.success) {
        setTree(prev => prev ? (treeRemoveNode(prev, node.path) ?? prev) : prev);
        onFileDelete?.(node.path);
        console.log(`[FileExplorer] Deleted folder: ${node.path}`);
        loadTree();
      }
    }
    setDeleteConfirm(null);
  }, [onFileDelete, loadTree]);

  // Handle create file/folder — creates on disk then refreshes tree from disk
  const handleCreate = useCallback(async (name: string, type: 'file' | 'folder', parentPath: string) => {
    if (!name.trim()) return;

    const path = parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}/${name}`;

    if (type === 'file') {
      const result = await createFile(path);
      if (result.success && result.file) {
        const targetParent = parentPath === rootPath ? (tree?.path ?? rootPath) : parentPath;
        setTree(prev => prev ? treeAddNode(prev, targetParent, result.file!) : prev);
        onFileCreate?.(path);
        console.log(`[FileExplorer] Created file: ${path}`);
        loadTree();
      }
    } else {
      const result = await createFolder(path);
      if (result.success && result.folder) {
        const targetParent = parentPath === rootPath ? (tree?.path ?? rootPath) : parentPath;
        setTree(prev => prev ? treeAddNode(prev, targetParent, result.folder!) : prev);
        // Auto-expand the parent folder so the new folder is visible
        setExpandedIds(prev => {
          const next = new Set(prev);
          next.add(targetParent);
          return next;
        });
        onFileCreate?.(path);
        console.log(`[FileExplorer] Created folder: ${path}`);
        loadTree();
      }
    }

    setShowCreateForm(null);
  }, [onFileCreate, tree, rootPath, loadTree]);

  // Handle drag start
  const handleDragStart = useCallback((node: FileTreeNode) => {
    setDraggedNode(node);
  }, []);

  // Handle drag end — clears drag state if drop didn't land on a valid target
  const handleDragEnd = useCallback(() => {
    setDraggedNode(null);
    setDropZone(null);
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, nodeId: string) => {
    if (!draggedNode) return;
    e.preventDefault();
    e.stopPropagation();
    setDropZone(nodeId);
  }, [draggedNode]);

  // Handle drop
  const handleDrop = useCallback(async (e: React.DragEvent, targetNode: FileTreeNode) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedNode || draggedNode.id === targetNode.id) {
      setDraggedNode(null);
      setDropZone(null);
      return;
    }

    // Only allow dropping into folders
    if (targetNode.type !== 'folder') {
      setDraggedNode(null);
      setDropZone(null);
      return;
    }

    const newPath = `${targetNode.path}/${draggedNode.name}`;
    const result = await moveFile(draggedNode.path, newPath);

    if (result.success) {
      // Remove from old location, add to new location
      setTree(prev => {
        if (!prev) return prev;
        const removed = treeRemoveNode(prev, draggedNode.path);
        if (!removed) return prev;
        const movedNode: FileTreeNode = { ...draggedNode, path: newPath, id: newPath };
        return treeAddNode(removed, targetNode.path, movedNode);
      });
      console.log(`[FileExplorer] Moved: ${draggedNode.path} -> ${newPath}`);
      loadTree();
    }

    setDraggedNode(null);
    setDropZone(null);
  }, [draggedNode, loadTree]);

  // Copy path to clipboard
  const copyPathToClipboard = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
    setContextMenu(null);
  }, []);

  // Resolve parent path for context menu actions
  const resolveParentPath = useCallback((menuNode: FileTreeNode | null): string => {
    if (!menuNode) return tree?.path ?? rootPath;
    if (menuNode.type === 'folder') return menuNode.path;
    // For files, parent is one level up
    return menuNode.path.substring(0, menuNode.path.lastIndexOf('/')) || (tree?.path ?? rootPath ?? '') || '';
  }, [tree, rootPath]);

  if (!tree) {
    return (
      <div className={cn(
        'flex flex-col h-full overflow-hidden',
        className
      )}>
        {/* ── Header (shown even when empty) ── */}
        <div className={cn(
          'flex-shrink-0 px-4 py-3 border-b flex items-center justify-between',
          isDarkMode ? 'border-white/[0.08]' : 'border-black/[0.08]'
        )}>
          <h2 className="text-sm font-semibold tracking-wider opacity-80">FILES</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={loadTree}
              className={cn(
                'p-1.5 rounded transition-colors',
                isDarkMode
                  ? 'hover:bg-white/[0.08] text-white/60 hover:text-white'
                  : 'hover:bg-black/[0.06] text-zinc-600 hover:text-zinc-900'
              )}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setShowCreateForm({ type: 'file', parentPath: rootPath })}
              className={cn(
                'p-1.5 rounded transition-colors',
                isDarkMode
                  ? 'hover:bg-white/[0.08] text-white/60 hover:text-white'
                  : 'hover:bg-black/[0.06] text-zinc-600 hover:text-zinc-900'
              )}
              title="New file"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setShowCreateForm({ type: 'folder', parentPath: rootPath })}
              className={cn(
                'p-1.5 rounded transition-colors',
                isDarkMode
                  ? 'hover:bg-white/[0.08] text-white/60 hover:text-white'
                  : 'hover:bg-black/[0.06] text-zinc-600 hover:text-zinc-900'
              )}
              title="New folder"
            >
              <FolderPlus size={16} />
            </button>
          </div>
        </div>

        <div className={cn(
          'flex items-center justify-center flex-1 text-xs opacity-50',
          isDarkMode ? 'text-white' : 'text-zinc-600'
        )}>
          No files loaded
        </div>

        {/* ── Create Form Modal (still needed even when empty) ── */}
        <AnimatePresence>
          {showCreateForm && (
            <CreateItemForm
              type={showCreateForm.type}
              parentPath={showCreateForm.parentPath}
              onCreate={(name) => handleCreate(name, showCreateForm.type, showCreateForm.parentPath)}
              onCancel={() => setShowCreateForm(null)}
              isDarkMode={isDarkMode}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* ── Header ── */}
      <div className={cn(
        'flex-shrink-0 px-4 py-3 border-b flex items-center justify-between',
        isDarkMode ? 'border-white/[0.08]' : 'border-black/[0.08]'
      )}>
        <h2 className="text-sm font-semibold tracking-wider opacity-80">FILES</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={loadTree}
            className={cn(
              'p-1.5 rounded transition-colors',
              isDarkMode
                ? 'hover:bg-white/[0.08] text-white/60 hover:text-white'
                : 'hover:bg-black/[0.06] text-zinc-600 hover:text-zinc-900'
            )}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowCreateForm({ type: 'file', parentPath: tree.path })}
            className={cn(
              'p-1.5 rounded transition-colors',
              isDarkMode
                ? 'hover:bg-white/[0.08] text-white/60 hover:text-white'
                : 'hover:bg-black/[0.06] text-zinc-600 hover:text-zinc-900'
            )}
            title="New file"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => {
              setShowCreateForm({ type: 'folder', parentPath: tree.path });
              setExpandedIds(prev => new Set([...prev, tree.id]));
            }}
            className={cn(
              'p-1.5 rounded transition-colors',
              isDarkMode
                ? 'hover:bg-white/[0.08] text-white/60 hover:text-white'
                : 'hover:bg-black/[0.06] text-zinc-600 hover:text-zinc-900'
            )}
            title="New folder"
          >
            <FolderPlus size={16} />
          </button>
        </div>
      </div>

      {/* ── Tree View ── */}
      <div
        className="flex-1 overflow-y-auto px-2 py-2"
        onContextMenu={(e) => handleContextMenu(e, null, 'root')}
      >
        <FileTreeNodeComponent
          node={tree}
          isExpanded={expandedIds.has(tree.id)}
          onToggleExpand={() => toggleExpanded(tree.id)}
          onContextMenu={handleContextMenu}
          onFileSelect={onFileSelect}
          onStartRename={startRename}
          isDarkMode={isDarkMode}
          expandedIds={expandedIds}
          onToggleAnyExpanded={toggleExpanded}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          draggedNode={draggedNode}
          dropZone={dropZone}
          renaming={renaming}
          onRenameChange={(newName) => setRenaming(prev => prev ? { ...prev, newName } : null)}
          onRenameComplete={completeRename}
          onRenameCancel={() => setRenaming(null)}
        />
      </div>

      {/* ── Context Menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            state={contextMenu}
            ref={contextMenuRef}
            onCreateFile={() => {
              const parentPath = resolveParentPath(contextMenu.node);
              setShowCreateForm({ type: 'file', parentPath });
              setContextMenu(null);
            }}
            onCreateFolder={() => {
              const parentPath = resolveParentPath(contextMenu.node);
              setShowCreateForm({ type: 'folder', parentPath });
              if (contextMenu.node?.type === 'folder') {
                setExpandedIds(prev => new Set([...prev, contextMenu.node!.id]));
              }
              setContextMenu(null);
            }}
            onRename={() => {
              if (contextMenu.node) startRename(contextMenu.node);
            }}
            onDelete={() => {
              if (contextMenu.node) setDeleteConfirm(contextMenu.node);
              setContextMenu(null);
            }}
            onCopyPath={() => {
              if (contextMenu.node) copyPathToClipboard(contextMenu.node.path);
            }}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      {/* ── Create Form Modal ── */}
      <AnimatePresence>
        {showCreateForm && (
          <CreateItemForm
            type={showCreateForm.type}
            parentPath={showCreateForm.parentPath}
            onCreate={(name) => handleCreate(name, showCreateForm.type, showCreateForm.parentPath)}
            onCancel={() => setShowCreateForm(null)}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation ── */}
      <AnimatePresence>
        {deleteConfirm && (
          <DeleteConfirmation
            node={deleteConfirm}
            onConfirm={() => handleDelete(deleteConfirm)}
            onCancel={() => setDeleteConfirm(null)}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// FileTreeNodeComponent
// ──────────────────────────────────────────────────────────────────────────

interface FileTreeNodeComponentProps {
  node: FileTreeNode;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode, type: ContextMenuType) => void;
  onFileSelect?: (node: FileTreeNode) => void;
  onStartRename: (node: FileTreeNode) => void;
  isDarkMode: boolean;
  expandedIds: Set<string>;
  onToggleAnyExpanded: (id: string) => void;
  onDragStart: (node: FileTreeNode) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, nodeId: string) => void;
  onDrop: (e: React.DragEvent, node: FileTreeNode) => void;
  draggedNode: FileTreeNode | null;
  dropZone: string | null;
  renaming: { nodeId: string; currentName: string; newName: string } | null;
  onRenameChange: (newName: string) => void;
  onRenameComplete: () => void;
  onRenameCancel: () => void;
}

function FileTreeNodeComponent({
  node,
  isExpanded,
  onToggleExpand,
  onContextMenu,
  onFileSelect,
  onStartRename,
  isDarkMode,
  expandedIds,
  onToggleAnyExpanded,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  draggedNode,
  dropZone,
  renaming,
  onRenameChange,
  onRenameComplete,
  onRenameCancel,
}: FileTreeNodeComponentProps) {
  const isFolder = node.type === 'folder';
  const hasChildren = isFolder && node.children && node.children.length > 0;
  const isDragging = draggedNode?.id === node.id;
  const isDropTarget = dropZone === node.id && isFolder;
  const isRenaming = renaming?.nodeId === node.id;

  return (
    <div
      draggable={true}
      onDragStart={() => onDragStart(node)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, node.id)}
      onDrop={(e) => onDrop(e, node)}
      className={cn(
        'select-none',
        isDragging && 'opacity-50'
      )}
    >
      {/* ── Node Row ── */}
      <motion.div
        layout
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -4 }}
        onContextMenu={(e) => onContextMenu(e, node, isFolder ? 'folder' : 'file')}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStartRename(node);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isFolder) {
            onToggleExpand();
          } else {
            onFileSelect?.(node);
          }
        }}
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-all group',
          isDropTarget
            ? isDarkMode
              ? 'bg-blue-500/20 border border-blue-400/50'
              : 'bg-blue-500/10 border border-blue-400/30'
            : isDarkMode
              ? 'hover:bg-white/[0.05]'
              : 'hover:bg-black/[0.03]'
        )}
      >
        {/* ── Expand/Collapse Chevron ── */}
        {isFolder ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className="p-0.5 flex-shrink-0"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <div className="w-5" />
        )}

        {/* ── Icon ── */}
        <div className="flex-shrink-0">
          {isFolder ? (
            isExpanded ? <FolderOpen size={14} className="text-blue-400" /> : <Folder size={14} className="text-blue-400" />
          ) : (
            <File size={14} className={cn(
              isImageFile(node.name) ? 'text-purple-400' : 'text-white/50'
            )} />
          )}
        </div>

        {/* ── Name / Rename Input ── */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                type="text"
                value={renaming.newName}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onRenameComplete();
                  if (e.key === 'Escape') onRenameCancel();
                }}
                className={cn(
                  'flex-1 px-1 py-0.5 text-xs rounded bg-transparent border outline-none',
                  isDarkMode ? 'border-white/30 text-white' : 'border-black/30 text-zinc-900'
                )}
              />
              <button
                onClick={() => onRenameComplete()}
                className="p-0.5 text-green-400 hover:text-green-300"
              >
                <Check size={12} />
              </button>
              <button
                onClick={() => onRenameCancel()}
                className="p-0.5 text-red-400 hover:text-red-300"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <span
              className="text-xs truncate block"
              title="Double-click to rename"
            >
              {node.name}
            </span>
          )}
        </div>

        {/* ── Info ── */}
        {!isRenaming && node.size && (
          <div className="text-xs opacity-50 flex-shrink-0 hidden group-hover:inline">
            {formatFileSize(node.size)}
          </div>
        )}

        {/* ── Rename hint icon (visible on hover, hidden when renaming) ── */}
        {!isRenaming && (
          <button
            onClick={(e) => { e.stopPropagation(); onStartRename(node); }}
            className={cn(
              'p-0.5 flex-shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity rounded',
              isDarkMode ? 'text-white hover:bg-white/10' : 'text-zinc-700 hover:bg-black/10'
            )}
            title="Rename (or double-click)"
          >
            <Edit2 size={11} />
          </button>
        )}
      </motion.div>

      {/* ── Children ── */}
      <AnimatePresence>
        {isFolder && isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'ml-1 border-l',
              isDarkMode ? 'border-white/[0.08]' : 'border-black/[0.08]'
            )}
          >
            {node.children!.map(child => (
              <div key={child.id} className="pl-1">
                <FileTreeNodeComponent
                  node={child}
                  isExpanded={expandedIds.has(child.id)}
                  onToggleExpand={() => onToggleAnyExpanded(child.id)}
                  onContextMenu={onContextMenu}
                  onFileSelect={onFileSelect}
                  onStartRename={onStartRename}
                  isDarkMode={isDarkMode}
                  expandedIds={expandedIds}
                  onToggleAnyExpanded={onToggleAnyExpanded}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  draggedNode={draggedNode}
                  dropZone={dropZone}
                  renaming={renaming}
                  onRenameChange={onRenameChange}
                  onRenameComplete={onRenameComplete}
                  onRenameCancel={onRenameCancel}
                />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ContextMenu Component
// ──────────────────────────────────────────────────────────────────────────

interface ContextMenuProps {
  state: ContextMenuState;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  isDarkMode: boolean;
}

const ContextMenu = React.forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  { state, onCreateFile, onCreateFolder, onRename, onDelete, onCopyPath, isDarkMode },
  ref
) {
  const isFile = state.type === 'file';
  const isFolder = state.type === 'folder';
  const isRoot = state.type === 'root';

  const items: Array<{ label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }> = [];

  if (isFile) {
    items.push(
      { label: 'Rename', icon: <Edit2 size={14} />, onClick: onRename },
      { label: 'Copy path', icon: <Copy size={14} />, onClick: onCopyPath },
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: onDelete, danger: true }
    );
  } else if (isFolder) {
    items.push(
      { label: 'New file here', icon: <Plus size={14} />, onClick: onCreateFile },
      { label: 'New folder here', icon: <FolderPlus size={14} />, onClick: onCreateFolder },
      { label: 'Rename', icon: <Edit2 size={14} />, onClick: onRename },
      { label: 'Copy path', icon: <Copy size={14} />, onClick: onCopyPath },
      { label: 'Delete', icon: <Trash2 size={14} />, onClick: onDelete, danger: true }
    );
  } else if (isRoot) {
    items.push(
      { label: 'New file', icon: <Plus size={14} />, onClick: onCreateFile },
      { label: 'New folder', icon: <FolderPlus size={14} />, onClick: onCreateFolder }
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        'fixed z-50 rounded shadow-lg overflow-hidden',
        isDarkMode ? 'bg-black/90 border border-white/[0.1]' : 'bg-white/90 border border-black/[0.1]'
      )}
      style={{ left: state.x, top: state.y }}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={item.onClick}
          className={cn(
            'w-full px-3 py-2 text-xs flex items-center gap-2 transition-colors whitespace-nowrap',
            item.danger
              ? isDarkMode
                ? 'text-red-400 hover:bg-red-500/20'
                : 'text-red-600 hover:bg-red-500/10'
              : isDarkMode
                ? 'text-white/80 hover:bg-white/[0.1]'
                : 'text-zinc-700 hover:bg-black/[0.05]'
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </motion.div>
  );
});

// ──────────────────────────────────────────────────────────────────────────
// CreateItemForm Component
// ──────────────────────────────────────────────────────────────────────────

interface CreateItemFormProps {
  type: 'file' | 'folder';
  parentPath: string;
  onCreate: (name: string) => void;
  onCancel: () => void;
  isDarkMode: boolean;
}

function CreateItemForm({ type, parentPath: _parentPath, onCreate, onCancel, isDarkMode }: CreateItemFormProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center bg-black/50 z-50"
      onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-label={`Create ${type === 'file' ? 'File' : 'Folder'}`}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className={cn(
          'w-full max-w-sm rounded-lg p-6 space-y-4',
          isDarkMode ? 'bg-black/80 text-white border border-white/[0.1]' : 'bg-white/80 text-zinc-900 border border-black/[0.1]'
        )}
      >
        <h3 className="text-sm font-semibold">Create {type === 'file' ? 'File' : 'Folder'}</h3>

        <input
          autoFocus
          type="text"
          placeholder={`${type === 'file' ? 'Filename' : 'Folder name'}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit(e as unknown as React.FormEvent);
            if (e.key === 'Escape') onCancel();
          }}
          className={cn(
            'w-full px-3 py-2 rounded text-sm bg-transparent border outline-none',
            isDarkMode ? 'border-white/20 text-white' : 'border-black/20 text-zinc-900'
          )}
        />

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              'px-4 py-1.5 text-xs rounded transition-colors',
              isDarkMode ? 'hover:bg-white/[0.1] text-white/70' : 'hover:bg-black/[0.1] text-zinc-600'
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={cn(
              'px-4 py-1.5 text-xs rounded transition-colors',
              isDarkMode
                ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                : 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20'
            )}
          >
            Create
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// DeleteConfirmation Component
// ──────────────────────────────────────────────────────────────────────────

interface DeleteConfirmationProps {
  node: FileTreeNode;
  onConfirm: () => void;
  onCancel: () => void;
  isDarkMode: boolean;
}

function DeleteConfirmation({ node, onConfirm, onCancel, isDarkMode }: DeleteConfirmationProps) {
  const itemCount = node.type === 'folder' && node.children ? node.children.length : 0;
  const message = node.type === 'file'
    ? `Delete file "${node.name}"?`
    : itemCount > 0
      ? `Delete folder "${node.name}" with ${itemCount} item(s)?`
      : `Delete folder "${node.name}"?`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center bg-black/50 z-50"
      onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm deletion"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-xs rounded-lg p-5 space-y-4',
          isDarkMode ? 'bg-black/80 text-white border border-white/[0.1]' : 'bg-white/80 text-zinc-900 border border-black/[0.1]'
        )}
      >
        <h3 className="text-sm font-semibold">Delete?</h3>
        <p className="text-xs opacity-70">{message}</p>
        <p className="text-xs opacity-60">This cannot be undone.</p>

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onCancel}
            className={cn(
              'px-4 py-1.5 text-xs rounded transition-colors',
              isDarkMode ? 'hover:bg-white/[0.1] text-white/70' : 'hover:bg-black/[0.1] text-zinc-600'
            )}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'px-4 py-1.5 text-xs rounded transition-colors',
              isDarkMode
                ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                : 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
            )}
          >
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
