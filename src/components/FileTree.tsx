/**
 * FileTree — Interactive file system tree browser
 *
 * Displays a hierarchical file structure with expandable folders,
 * smooth animations, and selection capabilities.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown, Folder, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

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
              <Folder size={14} className="flex-shrink-0" />
            </>
          ) : (
            <>
              <div className="flex-shrink-0 w-4" />
              {node.icon || <FileText size={14} className="flex-shrink-0" />}
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
