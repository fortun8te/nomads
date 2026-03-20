"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FilePlus,
  FolderPlus,
  Edit2,
  Trash2,
} from "lucide-react";
import { getFileTree, createFile, createFolder, deleteFile, deleteFolder } from "@/utils/fileSystem";
import type { FileNode } from "@/utils/fileSystem";
import { Card, CardHeader, CardTitle, CardContent } from "./card";
import { Button } from "./button";
import { Input } from "./input";
import { Separator } from "./separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

// ──────────────────────────────────────────────────────────────────────────
// Re-export FileNode for consumers of this file
// ──────────────────────────────────────────────────────────────────────────

export type { FileNode };

export type FileTreeProps = {
  data: FileNode[];
  expanded: Record<string, boolean>;
  selected: string | null;
  onToggle: (id: string) => void;
  onSelect: (node: FileNode) => void;
  onRename?: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
};

// ──────────────────────────────────────────────────────────────────────────
// File extension colour coding
// ──────────────────────────────────────────────────────────────────────────

function getExtColor(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "rgba(255,255,255,0.6)";
  const ext = name.slice(dot).toLowerCase();
  if ([".ts", ".tsx"].includes(ext)) return "rgba(96,165,250,0.75)";
  if ([".md", ".mdx"].includes(ext)) return "rgba(74,222,128,0.75)";
  if ([".json", ".py", ".yaml", ".yml"].includes(ext)) return "rgba(250,204,21,0.75)";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "rgba(251,191,36,0.65)";
  if ([".css", ".scss", ".sass"].includes(ext)) return "rgba(167,139,250,0.75)";
  if ([".html", ".htm", ".svg"].includes(ext)) return "rgba(251,113,133,0.75)";
  return "rgba(255,255,255,0.6)";
}

// ──────────────────────────────────────────────────────────────────────────
// Tree row with hover-reveal action buttons
// ──────────────────────────────────────────────────────────────────────────

function TreeRow({
  node,
  level,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
  onRename,
  onDelete,
}: {
  node: FileNode;
  level: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const ext = node.type === "file" ? getExtColor(node.name) : undefined;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* indent guide line */}
      {level > 0 && (
        <div
          style={{
            position: "absolute",
            left: level * 14 - 2,
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(255,255,255,0.08)",
            pointerEvents: "none",
          }}
        />
      )}

      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-expanded={node.type === "folder" ? isExpanded : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          paddingLeft: level * 14 + 6,
          paddingRight: 6,
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 5,
          cursor: "pointer",
          userSelect: "none",
          outline: "none",
          transition: "background 0.12s",
          background: isSelected
            ? "rgba(96,165,250,0.13)"
            : hovered
            ? "rgba(255,255,255,0.05)"
            : "transparent",
          borderLeft: isSelected
            ? "2px solid rgba(96,165,250,0.75)"
            : "2px solid transparent",
          color: isSelected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.7)",
        }}
        onClick={() => {
          if (node.type === "folder") onToggle();
          onSelect();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (node.type === "folder") onToggle();
            onSelect();
          }
        }}
      >
        {/* chevron */}
        {node.type === "folder" ? (
          isExpanded ? (
            <ChevronDown size={11} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={11} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
          )
        ) : (
          <span style={{ width: 11, flexShrink: 0 }} />
        )}

        {/* icon */}
        {node.type === "folder" ? (
          isExpanded ? (
            <FolderOpen size={13} style={{ color: "rgba(255,255,255,0.55)", flexShrink: 0 }} />
          ) : (
            <Folder size={13} style={{ color: "rgba(255,255,255,0.45)", flexShrink: 0 }} />
          )
        ) : (
          <File size={12} style={{ color: ext ?? "rgba(255,255,255,0.4)", flexShrink: 0 }} />
        )}

        {/* label */}
        <span
          style={{
            fontSize: 12,
            lineHeight: "16px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            fontFamily:
              node.type === "file"
                ? "ui-monospace, SFMono-Regular, monospace"
                : "inherit",
            color:
              node.type === "folder"
                ? "rgba(255,255,255,0.82)"
                : (ext ?? "rgba(255,255,255,0.65)"),
          }}
        >
          {node.name}
        </span>

        {/* hover-reveal action buttons */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              style={{ display: "flex", gap: 2, flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {onRename && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRename(); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "rgba(255,255,255,0.4)",
                        transition: "background 0.1s, color 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                        (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
                      }}
                    >
                      <Edit2 size={11} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Rename</TooltipContent>
                </Tooltip>
              )}
              {onDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "rgba(255,255,255,0.4)",
                        transition: "background 0.1s, color 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.12)";
                        (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,113,113,0.8)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Core FileTree component
// ──────────────────────────────────────────────────────────────────────────

export default function FileTree({
  data,
  expanded,
  selected,
  onToggle,
  onSelect,
  onRename,
  onDelete,
}: FileTreeProps) {
  const renderNodes = (nodes: FileNode[], level = 0): React.ReactNode =>
    nodes.map((n) => {
      const isSelected = selected === n.id;
      const isExpanded = !!expanded[n.id];

      return (
        <div key={n.id} className="relative">
          <TreeRow
            node={n}
            level={level}
            isSelected={isSelected}
            isExpanded={isExpanded}
            onSelect={() => onSelect(n)}
            onToggle={() => onToggle(n.id)}
            onRename={onRename ? () => onRename(n) : undefined}
            onDelete={onDelete ? () => onDelete(n) : undefined}
          />

          {/* children */}
          <AnimatePresence initial={false}>
            {n.children && n.children.length > 0 && isExpanded && (
              <motion.div
                key="children"
                role="group"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                {renderNodes(n.children, level + 1)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    });

  return (
    <div role="tree" style={{ fontSize: 12 }}>
      {renderNodes(data)}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// WorkspaceFileTree — card-style wrapper with header input + footer
// ──────────────────────────────────────────────────────────────────────────

export type WorkspaceFileTreeProps = {
  rootPath: string;
  refreshKey?: number;
  onSelect?: (node: FileNode) => void;
  onFileCreate?: () => void;
  onFileDelete?: () => void;
  className?: string;
};

export function WorkspaceFileTree({
  rootPath,
  refreshKey = 0,
  onSelect,
  onFileCreate,
  onFileDelete,
  className,
}: WorkspaceFileTreeProps) {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchTree = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    setError(null);
    try {
      const children = await getFileTree(rootPath);
      setNodes(children as FileNode[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree, refreshKey]);

  // If a file node is selected, resolve to its parent directory (the directory the file lives in).
  // If a folder node is selected, use that folder. If nothing selected, use rootPath.
  const resolveParentPath = useCallback((parentId: string | null): string => {
    if (!parentId || parentId === rootPath) return rootPath;
    // Check if the selected node is a file (not a folder) — walk the tree to find out
    const findNode = (nodes: FileNode[], id: string): FileNode | null => {
      for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) { const f = findNode(n.children, id); if (f) return f; }
      }
      return null;
    };
    const node = findNode(nodes, parentId);
    if (node && node.type === 'file') {
      // Use the parent directory of the file
      const lastSlash = parentId.lastIndexOf('/');
      return lastSlash > 0 ? parentId.slice(0, lastSlash) : rootPath;
    }
    return parentId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, rootPath]);

  const handleAddFile = useCallback(async () => {
    const name = newName.trim();
    if (!name) { inputRef.current?.focus(); return; }
    const parentPath = resolveParentPath(selected);
    const fullPath = `${parentPath}/${name}`;
    try {
      await createFile(fullPath, "");
      setNewName("");
      await fetchTree();
      onFileCreate?.();
      // Re-focus input so user can create another file immediately
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newName, selected, rootPath, resolveParentPath, fetchTree, onFileCreate]);

  const handleAddFolder = useCallback(async () => {
    const name = newName.trim();
    if (!name) { inputRef.current?.focus(); return; }
    const parentPath = resolveParentPath(selected);
    const fullPath = `${parentPath}/${name}`;
    try {
      await createFolder(fullPath);
      setNewName("");
      await fetchTree();
      onFileCreate?.();
      // Re-focus input so user can create another item immediately
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newName, selected, rootPath, resolveParentPath, fetchTree, onFileCreate]);

  const handleDelete = useCallback(async (node: FileNode) => {
    const path = node.id;
    try {
      if (node.type === "folder") {
        await deleteFolder(path, true);
      } else {
        await deleteFile(path);
      }
      if (selected === node.id) setSelected(null);
      await fetchTree();
      onFileDelete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [fetchTree, onFileDelete, selected]);

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleSelect = useCallback((node: FileNode) => {
    setSelected(node.id);
    onSelect?.(node);
  }, [onSelect]);

  const handleCollapseAll = useCallback(() => {
    setExpanded({});
  }, []);

  // Find selected node name for footer display
  const findNodeName = (nodes: FileNode[], id: string): string | null => {
    for (const n of nodes) {
      if (n.id === id) return n.name;
      if (n.children) {
        const found = findNodeName(n.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedName = selected ? findNodeName(nodes, selected) : null;

  return (
    <TooltipProvider delayDuration={400}>
      <Card
        className={cn("flex flex-col overflow-hidden", className)}
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.7)",
        }}
      >
        {/* Header */}
        <CardHeader style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12 }}>
          <CardTitle style={{ color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
            File Tree
          </CardTitle>

          {/* Input + action buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <Input
              ref={inputRef}
              placeholder="file or folder name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddFile();
                if (e.key === "Escape") setNewName("");
              }}
              style={{ flex: 1 }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void handleAddFile()}
                  style={{ flex: 1, gap: 4 }}
                >
                  <FilePlus size={12} />
                  Add File
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create a new file (Enter to confirm)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void handleAddFolder()}
                  style={{ flex: 1, gap: 4 }}
                >
                  <FolderPlus size={12} />
                  Add Folder
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create a new folder</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>

        {/* Separator */}
        <Separator />

        {/* Tree body */}
        <CardContent
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 6px",
            minHeight: 0,
          }}
        >
          {loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                fontSize: 11,
                color: "rgba(255,255,255,0.3)",
              }}
            >
              Loading files...
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                fontSize: 11,
                color: "rgba(248,113,113,0.6)",
                textAlign: "center",
                padding: "0 8px",
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && nodes.length === 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                fontSize: 11,
                color: "rgba(255,255,255,0.2)",
              }}
            >
              No files
            </div>
          )}

          {!loading && !error && nodes.length > 0 && (
            <FileTree
              data={nodes}
              expanded={expanded}
              selected={selected}
              onToggle={handleToggle}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          )}
        </CardContent>

        {/* Footer */}
        <Separator />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Selected:{" "}
            <span style={{ color: "rgba(255,255,255,0.55)" }}>
              {selectedName ?? "\u2014"}
            </span>
          </span>

          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (selected) void handleAddFile(); else inputRef.current?.focus(); }}
                  style={{ fontSize: 10, height: 24, padding: "0 8px" }}
                >
                  Add file in selected
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add a file inside the selected folder</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCollapseAll}
                  style={{ fontSize: 10, height: 24, padding: "0 8px" }}
                >
                  Collapse all
                </Button>
              </TooltipTrigger>
              <TooltipContent>Collapse all folders</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
}
