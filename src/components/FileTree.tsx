/**
 * FileTree — Interactive file system tree browser
 *
 * Displays a hierarchical file structure with expandable folders,
 * smooth animations, and selection capabilities.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// SVG Icons (inline, no external dependencies)
// ─────────────────────────────────────────────────────────────

const ChevronRight = (props: { size: number; className?: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const ChevronDown = (props: { size: number; className?: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const FolderIcon = (props: { size: number; className?: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="currentColor" className={props.className}>
    <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" opacity="0.5"/>
  </svg>
);

const FileIcon = (props: { size: number; className?: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="currentColor" className={props.className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" opacity="0.5"/>
    <polyline points="14 2 14 8 20 8" strokeWidth="2" stroke="currentColor" fill="none"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type FileNode = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  icon?: React.ReactNode;
  children?: FileNode[];
};

export interface FileTreeProps {
  data: FileNode[];
  defaultExpanded?: Record<string, boolean>;
  onSelect?: (node: FileNode) => void;
  level?: number;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function FileTree({
  data,
  defaultExpanded = {},
  onSelect,
  level = 0
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaultExpanded);
  const [selected, setSelected] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelect = (node: FileNode) => {
    setSelected(node.id);
    onSelect?.(node);
  };

  const renderNodes = (nodes: FileNode[], currentLevel: number = 0) => {
    return nodes.map((node) => (
      <div key={node.id} className="relative">
        {/* Node item */}
        <div
          role="treeitem"
          tabIndex={0}
          aria-expanded={node.type === 'folder' ? !!expanded[node.id] : undefined}
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors select-none outline-none text-sm',
            selected === node.id
              ? 'bg-blue-500/20 border-l-2 border-blue-500 text-white'
              : 'hover:bg-white/5 text-white/60 hover:text-white/80'
          )}
          style={{ paddingLeft: `${currentLevel * 12 + 8}px` }}
          onClick={() => {
            if (node.type === 'folder') toggle(node.id);
            handleSelect(node);
          }}
          onKeyDown={(e) => {
            if (node.type === 'folder' && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              toggle(node.id);
            }
          }}
        >
          {/* Folder/File icon toggle */}
          {node.type === 'folder' ? (
            <>
              <div className="flex-shrink-0 w-4">
                {expanded[node.id] ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </div>
              <FolderIcon size={14} className="flex-shrink-0" />
            </>
          ) : (
            <>
              <div className="flex-shrink-0 w-4" />
              {node.icon || <FileIcon size={14} className="flex-shrink-0" />}
            </>
          )}
          <span className="truncate text-xs font-medium">{node.name}</span>
        </div>

        {/* Children with animation */}
        <AnimatePresence initial={false}>
          {node.children && node.children.length > 0 && expanded[node.id] && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-l border-white/10">
                <FileTree
                  data={node.children}
                  defaultExpanded={expanded}
                  onSelect={onSelect}
                  level={currentLevel + 1}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ));
  };

  return (
    <div role="tree" className="space-y-0 text-xs">
      {renderNodes(data, level)}
    </div>
  );
}
