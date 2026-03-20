/**
 * MemoriesPanel — Intuitive memory management UI
 *
 * Features:
 * - View mode: collapsible cards grouped by type
 * - Edit mode: inline editing of any memory
 * - Add new: modal form to create memories
 * - Search/filter: find memories by type or keyword
 * - Delete: with confirmation modal
 */

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Edit2, Plus, X, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useMemories, addMemory, deleteMemory } from '../utils/memoryStore';
import type { Memory } from '../utils/memoryStore';
import { useTheme } from '../context/ThemeContext';
import { cn } from '@/lib/utils';

type MemoryType = Memory['type'];
type EditingId = string | null;

const TYPE_COLORS: Record<MemoryType, { bg: string; text: string; badge: string }> = {
  general: { bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
  user: { bg: 'bg-green-500/10', text: 'text-green-400', badge: 'bg-green-500/20 text-green-300' },
  campaign: { bg: 'bg-purple-500/10', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
  research: { bg: 'bg-orange-500/10', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' },
};

const TYPE_LABELS: Record<MemoryType, string> = {
  general: 'General',
  user: 'User',
  campaign: 'Campaign',
  research: 'Research',
};

// ──────────────────────────────────────────────────────────────────────────

export function MemoriesPanel() {
  const { isDarkMode } = useTheme();
  const memories = useMemories();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<EditingId>(null);
  const [editData, setEditData] = useState<Partial<Memory> | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all');

  // Filter memories
  const filtered = useMemo(() => {
    let result = memories;
    if (filterType !== 'all') {
      result = result.filter(m => m.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [memories, searchQuery, filterType]);

  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<MemoryType, Memory[]> = {
      general: [],
      user: [],
      campaign: [],
      research: [],
    };
    filtered.forEach(m => {
      groups[m.type].push(m);
    });
    return groups;
  }, [filtered]);

  // Edit handlers
  const startEdit = useCallback((memory: Memory) => {
    setEditingId(memory.id);
    setEditData({ ...memory });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditData(null);
  }, []);

  const saveEdit = useCallback(async (id: string) => {
    if (!editData) return;
    // Since memoryStore doesn't have updateMemory, we delete and re-add
    deleteMemory(id);
    addMemory(editData.type || 'general', editData.content || '', editData.tags || []);
    setEditingId(null);
    setEditData(null);
  }, [editData]);

  const handleDelete = useCallback((id: string) => {
    deleteMemory(id);
    setDeleteConfirmId(null);
  }, []);

  return (
    <div className={cn(
      'flex flex-col h-full overflow-hidden',
      isDarkMode ? 'bg-black/20 text-white/87' : 'bg-white/20 text-zinc-900'
    )}>
      {/* ── Header ── */}
      <div className={cn(
        'flex-shrink-0 px-4 py-3 border-b',
        isDarkMode ? 'border-white/[0.08]' : 'border-black/[0.06]'
      )}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-wider opacity-80">MEMORIES</h2>
          <button
            onClick={() => setShowAddForm(true)}
            className={cn(
              'p-1.5 rounded transition-colors',
              isDarkMode
                ? 'hover:bg-white/[0.08] text-white/60 hover:text-white'
                : 'hover:bg-black/[0.06] text-zinc-600 hover:text-zinc-900'
            )}
            title="Add new memory"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* ── Search ── */}
        <div className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded text-xs',
          isDarkMode ? 'bg-white/[0.05]' : 'bg-black/[0.05]'
        )}>
          <Search size={14} className="opacity-50" />
          <input
            type="text"
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'flex-1 bg-transparent outline-none placeholder-opacity-40',
              isDarkMode ? 'text-white placeholder-white' : 'text-zinc-900 placeholder-zinc-600'
            )}
          />
        </div>

        {/* ── Type Filter ── */}
        <div className="flex gap-1 mt-2 flex-wrap">
          {(['all', 'general', 'user', 'campaign', 'research'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                'px-2 py-1 rounded text-xs transition-colors font-medium',
                filterType === type
                  ? isDarkMode
                    ? 'bg-white/[0.15] text-white'
                    : 'bg-black/[0.15] text-zinc-900'
                  : isDarkMode
                    ? 'text-white/50 hover:text-white/70'
                    : 'text-zinc-600 hover:text-zinc-800'
              )}
            >
              {type === 'all' ? 'All' : TYPE_LABELS[type as MemoryType]}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {filtered.length === 0 ? (
          <div className={cn(
            'flex items-center justify-center h-full text-xs opacity-50',
            isDarkMode ? 'text-white' : 'text-zinc-600'
          )}>
            {searchQuery ? 'No memories match this search' : 'No memories yet'}
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(grouped).map(([typeKey, typeMemories]) => {
              if (typeMemories.length === 0) return null;
              const type = typeKey as MemoryType;
              const colors = TYPE_COLORS[type];

              return (
                <div key={type}>
                  <div className={cn(
                    'text-xs font-semibold px-2 py-1 mb-1.5 opacity-60 uppercase tracking-wider',
                    colors.text
                  )}>
                    {TYPE_LABELS[type]}
                  </div>
                  <div className="space-y-1.5">
                    {typeMemories.map(memory => (
                      <MemoryCard
                        key={memory.id}
                        memory={memory}
                        colors={colors}
                        isExpanded={expandedMemoryId === memory.id}
                        onToggleExpand={() => setExpandedMemoryId(
                          expandedMemoryId === memory.id ? null : memory.id
                        )}
                        isEditing={editingId === memory.id}
                        editData={editData}
                        onStartEdit={() => startEdit(memory)}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={() => saveEdit(memory.id)}
                        onDeleteClick={() => setDeleteConfirmId(memory.id)}
                        onEditDataChange={setEditData}
                        isDarkMode={isDarkMode}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add Form Modal ── */}
      <AnimatePresence>
        {showAddForm && (
          <AddMemoryForm
            onClose={() => setShowAddForm(false)}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation ── */}
      <AnimatePresence>
        {deleteConfirmId && (
          <DeleteConfirmation
            onConfirm={() => handleDelete(deleteConfirmId)}
            onCancel={() => setDeleteConfirmId(null)}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// MemoryCard Component
// ──────────────────────────────────────────────────────────────────────────

interface MemoryCardProps {
  memory: Memory;
  colors: { bg: string; text: string; badge: string };
  isExpanded: boolean;
  onToggleExpand: () => void;
  isEditing: boolean;
  editData: Partial<Memory> | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDeleteClick: () => void;
  onEditDataChange: (data: Partial<Memory>) => void;
  isDarkMode: boolean;
}

function MemoryCard({
  memory,
  colors,
  isExpanded,
  onToggleExpand,
  isEditing,
  editData,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDeleteClick,
  onEditDataChange,
  isDarkMode,
}: MemoryCardProps) {
  const contentPreview = memory.content.slice(0, 100);
  const isLong = memory.content.length > 100;

  if (isEditing && editData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className={cn(
          'rounded p-3 space-y-2 border',
          colors.bg,
          isDarkMode ? 'border-white/[0.08]' : 'border-black/[0.08]'
        )}
      >
        {/* Type Select */}
        <select
          value={editData.type || 'general'}
          onChange={(e) => onEditDataChange({ ...editData, type: e.target.value as MemoryType })}
          className={cn(
            'w-full px-2 py-1 rounded text-xs bg-transparent border',
            isDarkMode ? 'border-white/20 text-white' : 'border-black/20 text-zinc-900'
          )}
        >
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key} className="text-gray-800">{label}</option>
          ))}
        </select>

        {/* Content TextArea */}
        <textarea
          value={editData.content || ''}
          onChange={(e) => onEditDataChange({ ...editData, content: e.target.value })}
          className={cn(
            'w-full px-2 py-1.5 rounded text-xs bg-transparent border resize-none',
            isDarkMode ? 'border-white/20 text-white' : 'border-black/20 text-zinc-900'
          )}
          rows={4}
        />

        {/* Tags Input */}
        <input
          type="text"
          placeholder="Tags (comma-separated)"
          value={(editData.tags || []).join(', ')}
          onChange={(e) => onEditDataChange({
            ...editData,
            tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
          })}
          className={cn(
            'w-full px-2 py-1 rounded text-xs bg-transparent border',
            isDarkMode ? 'border-white/20 text-white' : 'border-black/20 text-zinc-900'
          )}
        />

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancelEdit}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              isDarkMode
                ? 'hover:bg-white/[0.1] text-white/70'
                : 'hover:bg-black/[0.1] text-zinc-600'
            )}
          >
            Cancel
          </button>
          <button
            onClick={onSaveEdit}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              isDarkMode
                ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                : 'bg-green-500/10 text-green-600 hover:bg-green-500/20'
            )}
          >
            Save
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={cn(
        'rounded p-3 border transition-all',
        colors.bg,
        isDarkMode ? 'border-white/[0.08] hover:border-white/[0.12]' : 'border-black/[0.08] hover:border-black/[0.12]'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={onToggleExpand}
              className={cn(
                'p-0.5 transition-transform',
                isLong ? 'opacity-100' : 'opacity-40'
              )}
              disabled={!isLong}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded', colors.badge)}>
              {TYPE_LABELS[memory.type]}
            </span>
          </div>

          {/* Content Preview / Full */}
          <div className="text-xs leading-relaxed opacity-75 whitespace-pre-wrap break-words">
            {isExpanded ? memory.content : contentPreview}
            {!isExpanded && isLong && '...'}
          </div>

          {/* Tags */}
          {memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {memory.tags.map(tag => (
                <span
                  key={tag}
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded opacity-60',
                    isDarkMode ? 'bg-white/[0.08]' : 'bg-black/[0.08]'
                  )}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex gap-1">
          <button
            onClick={onStartEdit}
            className={cn(
              'p-1 rounded transition-colors',
              isDarkMode
                ? 'hover:bg-white/[0.1] text-white/50 hover:text-white/80'
                : 'hover:bg-black/[0.1] text-zinc-500 hover:text-zinc-700'
            )}
            title="Edit"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={onDeleteClick}
            className={cn(
              'p-1 rounded transition-colors',
              isDarkMode
                ? 'hover:bg-red-500/20 text-red-400/50 hover:text-red-300'
                : 'hover:bg-red-500/20 text-red-600/50 hover:text-red-600'
            )}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Metadata */}
      {isExpanded && (
        <div className="text-xs opacity-40 mt-2 text-right font-mono">
          Created: {new Date(memory.createdAt).toLocaleDateString()}
        </div>
      )}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// AddMemoryForm Component
// ──────────────────────────────────────────────────────────────────────────

interface AddMemoryFormProps {
  onClose: () => void;
  isDarkMode: boolean;
}

function AddMemoryForm({ onClose, isDarkMode }: AddMemoryFormProps) {
  const [formData, setFormData] = useState({
    type: 'general' as MemoryType,
    content: '',
    tags: '' as string,
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.content.trim()) return;

    addMemory(
      formData.type,
      formData.content,
      formData.tags.split(',').map(t => t.trim()).filter(Boolean)
    );
    onClose();
  }, [formData, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center bg-black/50 z-50"
      onClick={onClose}
    >
      <motion.form
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className={cn(
          'w-full max-w-md rounded-lg p-6 space-y-4 shadow-lg',
          isDarkMode ? 'bg-black/80 text-white border border-white/[0.1]' : 'bg-white/80 text-zinc-900 border border-black/[0.1]'
        )}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add Memory</h3>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'p-1 rounded transition-colors',
              isDarkMode ? 'hover:bg-white/[0.1]' : 'hover:bg-black/[0.1]'
            )}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Type Select */}
          <div>
            <label className="text-xs opacity-70 mb-1 block">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as MemoryType })}
              className={cn(
                'w-full px-3 py-2 rounded text-sm bg-transparent border outline-none',
                isDarkMode ? 'border-white/20 text-white' : 'border-black/20 text-zinc-900'
              )}
            >
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key} className="text-gray-800">{label}</option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div>
            <label className="text-xs opacity-70 mb-1 block">Content</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="What do you want to remember?"
              className={cn(
                'w-full px-3 py-2 rounded text-sm bg-transparent border outline-none resize-none',
                isDarkMode ? 'border-white/20 text-white placeholder-white/40' : 'border-black/20 text-zinc-900 placeholder-zinc-600'
              )}
              rows={4}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs opacity-70 mb-1 block">Tags (optional, comma-separated)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="e.g., important, todo, research"
              className={cn(
                'w-full px-3 py-2 rounded text-sm bg-transparent border outline-none',
                isDarkMode ? 'border-white/20 text-white placeholder-white/40' : 'border-black/20 text-zinc-900 placeholder-zinc-600'
              )}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'px-4 py-1.5 text-xs rounded transition-colors',
              isDarkMode
                ? 'hover:bg-white/[0.1] text-white/70'
                : 'hover:bg-black/[0.1] text-zinc-600'
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
            Save Memory
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
  onConfirm: () => void;
  onCancel: () => void;
  isDarkMode: boolean;
}

function DeleteConfirmation({ onConfirm, onCancel, isDarkMode }: DeleteConfirmationProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center bg-black/50 z-50"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-xs rounded-lg p-5 space-y-4 shadow-lg',
          isDarkMode ? 'bg-black/80 text-white border border-white/[0.1]' : 'bg-white/80 text-zinc-900 border border-black/[0.1]'
        )}
      >
        <h3 className="text-sm font-semibold">Delete Memory?</h3>
        <p className="text-xs opacity-70">This cannot be undone.</p>
        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onCancel}
            className={cn(
              'px-4 py-1.5 text-xs rounded transition-colors',
              isDarkMode
                ? 'hover:bg-white/[0.1] text-white/70'
                : 'hover:bg-black/[0.1] text-zinc-600'
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
