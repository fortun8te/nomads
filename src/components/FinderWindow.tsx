/**
 * FinderWindow — Agentic file browser
 *
 * Real folder structure for the nomad agent system:
 * - Session: temp computer storage (screenshots, artifacts)
 * - Memory: agent memory, research notes, summaries
 * - Exports: generated ads, briefs, output files
 *
 * Computer is temp storage. Agent is the level above.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useFSStore,
  getItems as fsGetItems,
  removeItem,
  renameItem,
  createFolder,
  type FSNode,
} from '../utils/fsStore';

// ── Types ──────────────────────────────────────────────────────────────────

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

interface SidebarItem {
  id: string;
  label: string;
  path: string[];
  icon: React.ReactNode;
}

interface ContextMenu {
  x: number;
  y: number;
  nodeId: string;
  nodeType: 'folder' | 'file';
}

// ── Icons ──────────────────────────────────────────────────────────────────

const ico = {
  width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

function FolderIcon({ color = '#5B9BF8', size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} fillOpacity={size > 20 ? 0.15 : 0}
      stroke={color} strokeWidth={size > 20 ? 1.2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function fileColor(ext?: string): string {
  if (!ext) return '#9ca3af';
  if (/pdf/i.test(ext)) return '#ef4444';
  if (/json/i.test(ext)) return '#f59e0b';
  if (/md|txt/i.test(ext)) return '#6b7280';
  if (/jpe?g|png|gif|webp|svg/i.test(ext)) return '#a855f7';
  if (/html|css/i.test(ext)) return '#f97316';
  if (/tsx?|jsx?|py|go|rs/i.test(ext)) return '#38bdf8';
  return '#9ca3af';
}

function FileIcon({ extension, size = 14 }: { extension?: string; size?: number }) {
  const color = fileColor(extension);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} fillOpacity={size > 20 ? 0.12 : 0}
      stroke={color} strokeWidth={size > 20 ? 1.2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v14a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <polyline points="14 2 14 8 20 8" strokeOpacity={0.4} />
    </svg>
  );
}

function IcoSession() {
  return <svg {...ico} stroke="#60a5fa"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
}
function IcoScreenshots() {
  return <svg {...ico} stroke="#94a3b8"><rect x="2" y="4" width="20" height="14" rx="2" /><circle cx="8" cy="11" r="2" /><path d="M21 18l-6-7-4 5-3-3-5 5" /></svg>;
}
function IcoResearch() {
  return <svg {...ico} stroke="#94a3b8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
}
function IcoChevron({ dir = 'right' }: { dir?: 'right' | 'left' }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: dir === 'left' ? 'rotate(180deg)' : 'none' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function IcoGrid() {
  return <svg {...ico} width={13} height={13}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
function IcoList() {
  return <svg {...ico} width={13} height={13}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></svg>;
}
function IcoSearch() {
  return <svg {...ico} width={11} height={11}><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>;
}
function IcoFolderPlus() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

// Computer view = session scope only. Agent-level folders (memory, exports) are NOT shown here.
const SIDEBAR: SidebarSection[] = [
  {
    title: 'This Session',
    items: [
      { id: 'session', label: 'Session', path: ['session'], icon: <IcoSession /> },
      { id: 'screenshots', label: 'Screenshots', path: ['session', 'screenshots'], icon: <IcoScreenshots /> },
      { id: 'browser_artifacts', label: 'Browser Artifacts', path: ['session', 'browser_artifacts'], icon: <IcoResearch /> },
    ],
  },
];

// ── Traffic Lights ─────────────────────────────────────────────────────────

function TrafficLights({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="flex items-center gap-[6px]" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button onClick={onClose} className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: '#FF5F57', border: '0.5px solid rgba(0,0,0,0.25)', cursor: 'pointer' }}>
        {hovered && <svg width="6" height="6" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="#7a1a16" strokeWidth="1.5" strokeLinecap="round" /><line x1="8" y1="2" x2="2" y2="8" stroke="#7a1a16" strokeWidth="1.5" strokeLinecap="round" /></svg>}
      </button>
      <button className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: '#FEBC2E', border: '0.5px solid rgba(0,0,0,0.25)', cursor: 'pointer' }}>
        {hovered && <svg width="6" height="6" viewBox="0 0 10 10" fill="none"><line x1="2" y1="5" x2="8" y2="5" stroke="#7a5200" strokeWidth="1.5" strokeLinecap="round" /></svg>}
      </button>
      <button className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: '#28C840', border: '0.5px solid rgba(0,0,0,0.25)', cursor: 'pointer' }}>
        {hovered && <svg width="6" height="6" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="#0c4a1c" strokeWidth="1.3" strokeLinecap="round" /><line x1="8" y1="2" x2="2" y2="8" stroke="#0c4a1c" strokeWidth="1.3" strokeLinecap="round" /></svg>}
      </button>
    </div>
  );
}

// ── Rename Input ────────────────────────────────────────────────────────────

function RenameInput({
  initial, onCommit, onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(val.trim() || initial); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={() => onCommit(val.trim() || initial)}
      onClick={e => e.stopPropagation()}
      style={{
        fontSize: 11,
        color: '#fff',
        background: 'rgba(43,121,255,0.3)',
        border: '1px solid rgba(43,121,255,0.8)',
        borderRadius: 3,
        outline: 'none',
        padding: '0 3px',
        width: '100%',
        maxWidth: 76,
        textAlign: 'center',
        fontFamily: 'system-ui,-apple-system,sans-serif',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ── Grid Item ──────────────────────────────────────────────────────────────

function GridItem({
  item, selected, renaming, onSelect, onOpen, onRenameCommit, onRenameCancel, onContextMenu,
}: {
  item: FSNode;
  selected: boolean;
  renaming: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      onClick={onSelect}
      onDoubleClick={renaming ? undefined : onOpen}
      onContextMenu={onContextMenu}
      className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-default select-none"
      style={{ background: selected ? 'rgba(43,121,255,0.25)' : 'transparent', minWidth: 80, maxWidth: 80 }}
    >
      <div className="flex items-center justify-center" style={{ width: 52, height: 52 }}>
        {item.type === 'folder'
          ? <FolderIcon size={52} color={item.tag === 'memory' ? '#a78bfa' : item.tag === 'export' ? '#34d399' : '#5B9BF8'} />
          : <FileIcon size={52} extension={item.extension} />}
      </div>
      {renaming ? (
        <RenameInput initial={item.name} onCommit={onRenameCommit} onCancel={onRenameCancel} />
      ) : (
        <span style={{
          fontSize: 11, color: selected ? '#fff' : 'rgba(255,255,255,0.75)',
          fontFamily: 'system-ui,-apple-system,sans-serif', textAlign: 'center',
          maxWidth: 76, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as unknown as undefined, overflow: 'hidden', lineHeight: 1.3,
        }}>
          {item.name}
        </span>
      )}
    </motion.div>
  );
}

// ── List Row ───────────────────────────────────────────────────────────────

function ListRow({
  item, selected, isFirst, renaming, onSelect, onOpen, onRenameCommit, onRenameCancel, onContextMenu,
}: {
  item: FSNode;
  selected: boolean;
  isFirst: boolean;
  renaming: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={renaming ? undefined : onOpen}
      onContextMenu={onContextMenu}
      className="flex items-center gap-2 px-3 cursor-default select-none"
      style={{
        background: selected ? 'rgba(43,121,255,0.25)' : 'transparent',
        borderTop: isFirst ? 'none' : '1px solid rgba(255,255,255,0.04)', height: 28,
      }}
    >
      <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {item.type === 'folder'
          ? <FolderIcon color={item.tag === 'memory' ? '#a78bfa' : item.tag === 'export' ? '#34d399' : '#5B9BF8'} />
          : <FileIcon extension={item.extension} />}
      </div>
      {renaming ? (
        <RenameInput initial={item.name} onCommit={onRenameCommit} onCancel={onRenameCancel} />
      ) : (
        <span style={{ flex: 1, fontSize: 12, color: selected ? '#fff' : 'rgba(255,255,255,0.8)', fontFamily: 'system-ui,-apple-system,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </span>
      )}
      {!renaming && (
        <>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', width: 90, textAlign: 'right', flexShrink: 0, fontFamily: 'system-ui,-apple-system,sans-serif', whiteSpace: 'nowrap' }}>
            {item.modified ?? '—'}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', width: 60, textAlign: 'right', flexShrink: 0, fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            {item.size ?? '—'}
          </span>
        </>
      )}
    </div>
  );
}

// ── File Preview Panel ──────────────────────────────────────────────────────

function FilePreview({ node }: { node: FSNode }) {
  const extLabel = node.extension
    ? node.extension.toUpperCase() + ' File'
    : 'File';

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(14,14,18,0.98)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
    }}>
      <div style={{ flexShrink: 0 }}>
        <FileIcon size={36} extension={node.extension} />
      </div>
      <div style={{ overflow: 'hidden' }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
          fontFamily: 'system-ui,-apple-system,sans-serif',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {node.name}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'system-ui,-apple-system,sans-serif', marginTop: 2 }}>
          {extLabel}
          {node.size && ` · ${node.size}`}
          {node.modified && ` · ${node.modified}`}
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export function FinderWindow({ onClose, zIndex, onFocus }: { onClose: () => void; zIndex?: number; onFocus?: () => void }) {
  // Reactive store — re-renders when filesystem changes
  useFSStore();

  const [currentPath, setCurrentPath] = useState<string[]>(['session']);
  const [history, setHistory] = useState<string[][]>([['session']]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(190);
  const [activeSidebarId, setActiveSidebarId] = useState('session');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  // Window drag
  const windowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<DOMRect | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Center window explicitly on mount (CSS % centering is unreliable in flex containers)
  useEffect(() => {
    const parent = windowRef.current?.parentElement;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    setPos({ x: (pr.width - 820) / 2, y: Math.max(20, (pr.height - 520) / 2) });
  }, []);

  // Sidebar resize
  const isSidebarDragging = useRef(false);
  const sidebarStart = useRef({ x: 0, w: 190 });

  // Container div for keyboard events
  const containerDivRef = useRef<HTMLDivElement>(null);

  const items = (() => {
    const all = fsGetItems(currentPath);
    if (!searchQuery) return all;
    return all.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  })();

  const selectedNode = selectedId ? items.find(i => i.id === selectedId) ?? null : null;

  // ── Context menu close on outside click / Escape ──────────────────────────

  useEffect(() => {
    if (!contextMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      setContextMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [contextMenu]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const navigateTo = useCallback((path: string[]) => {
    setCurrentPath(path);
    setSelectedId(null);
    setSearchQuery('');
    setContextMenu(null);
    setRenamingId(null);
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIdx + 1);
      const next = [...trimmed, path];
      setHistoryIdx(next.length - 1);
      return next;
    });
    const match = SIDEBAR.flatMap(s => s.items).find(i => i.path.join('/') === path.join('/'));
    if (match) setActiveSidebarId(match.id);
  }, [historyIdx]);

  const goBack = useCallback(() => {
    if (historyIdx > 0) {
      const idx = historyIdx - 1;
      setHistoryIdx(idx);
      setCurrentPath(history[idx]);
      setSelectedId(null);
    }
  }, [historyIdx, history]);

  const goForward = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const idx = historyIdx + 1;
      setHistoryIdx(idx);
      setCurrentPath(history[idx]);
      setSelectedId(null);
    }
  }, [historyIdx, history]);

  const openItem = useCallback((item: FSNode) => {
    if (item.type === 'folder') navigateTo([...currentPath, item.name]);
  }, [currentPath, navigateTo]);

  // ── CRUD actions ──────────────────────────────────────────────────────────

  const startRename = useCallback((id: string) => {
    setRenamingId(id);
    setContextMenu(null);
  }, []);

  const commitRename = useCallback((id: string, newName: string) => {
    renameItem(currentPath, id, newName);
    setRenamingId(null);
  }, [currentPath]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedNode) return;
    const confirmed = window.confirm(`Delete "${selectedNode.name}"?`);
    if (confirmed) {
      removeItem(currentPath, selectedNode.id);
      setSelectedId(null);
    }
  }, [selectedNode, currentPath]);

  const deleteById = useCallback((id: string) => {
    const node = items.find(n => n.id === id);
    if (!node) return;
    const confirmed = window.confirm(`Delete "${node.name}"?`);
    if (confirmed) {
      removeItem(currentPath, id);
      if (selectedId === id) setSelectedId(null);
    }
    setContextMenu(null);
  }, [items, currentPath, selectedId]);

  const handleNewFolder = useCallback(() => {
    // Generate a unique name
    const base = 'New Folder';
    const existing = fsGetItems(currentPath).map(n => n.name);
    let name = base;
    let counter = 1;
    while (existing.includes(name)) {
      name = `${base} ${counter++}`;
    }
    const node = createFolder(currentPath, name);
    setSelectedId(node.id);
    setRenamingId(node.id);
  }, [currentPath]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const onContainerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Don't handle when a rename input is focused
    if (renamingId) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
      e.preventDefault();
      deleteSelected();
    }
    if (e.key === 'F2' && selectedNode) {
      e.preventDefault();
      startRename(selectedNode.id);
    }
    if (e.key === 'Escape') {
      setSelectedId(null);
      setContextMenu(null);
    }
  }, [renamingId, selectedNode, deleteSelected, startRename]);

  // ── Right-click context menu ──────────────────────────────────────────────

  const onItemContextMenu = useCallback((e: React.MouseEvent, node: FSNode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(node.id);
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, nodeType: node.type });
  }, []);

  // ── Window drag handlers ──────────────────────────────────────────────────

  const onTitleBarMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    isDragging.current = true;
    const rect = windowRef.current?.getBoundingClientRect();
    const parentRect = windowRef.current?.parentElement?.getBoundingClientRect();
    if (rect && parentRect) {
      containerRef.current = parentRect;
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (pos === null) {
        setPos({ x: rect.left - parentRect.left, y: rect.top - parentRect.top });
      }
    }

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      setPos({
        x: ev.clientX - containerRef.current.left - dragOffset.current.x,
        y: ev.clientY - containerRef.current.top - dragOffset.current.y,
      });
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // ── Sidebar resize handlers ───────────────────────────────────────────────

  const onSidebarDividerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isSidebarDragging.current = true;
    sidebarStart.current = { x: e.clientX, w: sidebarWidth };
    const onMove = (ev: MouseEvent) => {
      if (!isSidebarDragging.current) return;
      const delta = ev.clientX - sidebarStart.current.x;
      setSidebarWidth(Math.max(140, Math.min(280, sidebarStart.current.w + delta)));
    };
    const onUp = () => {
      isSidebarDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  const canBack = historyIdx > 0;
  const canForward = historyIdx < history.length - 1;

  const rootLabel = currentPath[0] === 'session' ? 'Session' : currentPath[0] === 'memory' ? 'Memory' : 'Exports';

  return (
    <motion.div
      ref={windowRef}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseDownCapture={onFocus}
      style={{
        position: 'absolute',
        ...(pos !== null
          ? { left: pos.x, top: pos.y, transform: 'none' }
          : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
        ),
        width: 820,
        height: 520,
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: zIndex ?? 200,
        pointerEvents: 'auto',
        background: 'rgba(18,18,22,0.97)',
        backdropFilter: 'blur(40px) saturate(160%)',
        WebkitBackdropFilter: 'blur(40px) saturate(160%)',
        boxShadow: '0 40px 100px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif',
        userSelect: 'none',
      }}
    >
      {/* Outer keyboard-handler div */}
      <div
        ref={containerDivRef}
        tabIndex={0}
        onKeyDown={onContainerKeyDown}
        style={{ display: 'contents', outline: 'none' }}
      >

      {/* Title bar */}
      <div
        onMouseDown={onTitleBarMouseDown}
        style={{
          height: 36, display: 'flex', alignItems: 'center', paddingLeft: 14, paddingRight: 14,
          background: 'rgba(22,22,28,0.98)', borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0, cursor: 'default', position: 'relative',
        }}
      >
        <TrafficLights onClose={onClose} />
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src="/icons/finder.png" alt="" width={14} height={14} style={{ borderRadius: 3, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)', letterSpacing: -0.2 }}>Files</span>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        height: 40, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6,
        background: 'rgba(20,20,26,0.98)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
      }}>
        {/* Back / Forward */}
        {[{ fn: goBack, can: canBack, ico: <IcoChevron dir="left" /> }, { fn: goForward, can: canForward, ico: <IcoChevron dir="right" /> }].map((btn, i) => (
          <button key={i} onClick={btn.fn} disabled={!btn.can} style={{
            background: 'none', border: 'none', padding: '4px 5px', borderRadius: 5,
            color: btn.can ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)',
            cursor: btn.can ? 'pointer' : 'default', display: 'flex', alignItems: 'center',
          }}>
            {btn.ico}
          </button>
        ))}

        {/* Breadcrumb */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', minWidth: 0 }}>
          {[rootLabel, ...currentPath.slice(1)].map((seg, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: i < arr.length - 1 ? 1 : 0 }}>
              {i > 0 && <IcoChevron dir="right" />}
              <button
                onClick={() => {
                  if (i < arr.length - 1) navigateTo(currentPath.slice(0, i + 1));
                }}
                style={{
                  background: 'none', border: 'none', padding: '2px 4px', borderRadius: 4,
                  fontSize: 12, cursor: i < arr.length - 1 ? 'pointer' : 'default',
                  color: i === arr.length - 1 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.38)',
                  fontWeight: i === arr.length - 1 ? 600 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120,
                }}
              >
                {seg}
              </button>
            </div>
          ))}
        </div>

        {/* View toggles */}
        <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: 2 }}>
          {(['grid', 'list'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              background: viewMode === mode ? 'rgba(255,255,255,0.12)' : 'none',
              border: 'none', padding: '3px 7px', borderRadius: 5, cursor: 'pointer',
              color: viewMode === mode ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.38)',
              display: 'flex', alignItems: 'center',
            }}>
              {mode === 'grid' ? <IcoGrid /> : <IcoList />}
            </button>
          ))}
        </div>

        {/* New Folder button */}
        <button
          onClick={handleNewFolder}
          title="New Folder"
          style={{
            background: 'none', border: 'none', padding: '4px 6px', borderRadius: 5, cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}
        >
          <IcoFolderPlus />
        </button>

        {/* Search */}
        <div style={{ position: 'relative', width: 150 }}>
          <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.28)', pointerEvents: 'none' }}>
            <IcoSearch />
          </div>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search"
            style={{
              width: '100%', paddingLeft: 24, paddingRight: 8, height: 26,
              borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
              fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: sidebarWidth, background: 'rgba(16,16,20,0.98)', borderRight: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, overflowY: 'auto', paddingTop: 8 }}>
          {SIDEBAR.map(section => (
            <div key={section.title} style={{ marginBottom: 12 }}>
              <div style={{ padding: '4px 12px 2px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {section.title}
              </div>
              {section.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setActiveSidebarId(item.id); navigateTo(item.path); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    width: `calc(100% - 8px)`, margin: '0 4px', padding: '5px 8px',
                    border: 'none', borderRadius: 8, cursor: 'pointer', boxSizing: 'border-box',
                    background: activeSidebarId === item.id ? 'rgba(43,121,255,0.2)' : 'transparent',
                    color: activeSidebarId === item.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
                    fontSize: 12.5, textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', color: activeSidebarId === item.id ? '#5B9BF8' : 'rgba(255,255,255,0.3)' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Sidebar resize handle */}
        <div
          onMouseDown={onSidebarDividerDown}
          style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0, zIndex: 1 }}
        />

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* List header */}
          {viewMode === 'list' && (
            <div style={{
              display: 'flex', alignItems: 'center', padding: '0 12px', height: 26,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(18,18,24,0.95)',
            }}>
              {[['Name', 1, 'left'], ['Modified', '90px', 'right'], ['Size', '60px', 'right']].map(([label, w, align]) => (
                <span key={label as string} style={{
                  flex: w === 1 ? 1 : undefined, width: w !== 1 ? w as string : undefined,
                  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
                  textAlign: align as 'left' | 'right', flexShrink: w !== 1 ? 0 : undefined,
                }}>
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Files */}
          <div
            style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? 12 : 0 }}
            onClick={() => { setSelectedId(null); setContextMenu(null); }}
          >
            {items.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.2)', fontSize: 13, gap: 8 }}>
                <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                Empty
              </div>
            ) : viewMode === 'grid' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <AnimatePresence>
                  {items.map(item => (
                    <GridItem
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      renaming={renamingId === item.id}
                      onSelect={e => { e.stopPropagation(); setSelectedId(item.id); }}
                      onOpen={() => openItem(item)}
                      onRenameCommit={name => commitRename(item.id, name)}
                      onRenameCancel={cancelRename}
                      onContextMenu={e => onItemContextMenu(e, item)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div>
                {items.map((item, i) => (
                  <ListRow
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    isFirst={i === 0}
                    renaming={renamingId === item.id}
                    onSelect={e => { e.stopPropagation(); setSelectedId(item.id); }}
                    onOpen={() => openItem(item)}
                    onRenameCommit={name => commitRename(item.id, name)}
                    onRenameCancel={cancelRename}
                    onContextMenu={e => onItemContextMenu(e, item)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* File preview panel — only in list view when a file is selected */}
          {viewMode === 'list' && selectedNode && selectedNode.type === 'file' && (
            <FilePreview node={selectedNode} />
          )}
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(16,16,20,0.98)', borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 11, color: 'rgba(255,255,255,0.28)', flexShrink: 0,
      }}>
        {items.length} item{items.length !== 1 ? 's' : ''}
        {selectedNode && ` · "${selectedNode.name}" selected`}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 500,
            background: 'rgba(28,28,34,0.98)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '4px 0',
            minWidth: 160,
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {[
            {
              label: 'Rename',
              action: () => { startRename(contextMenu.nodeId); },
            },
            {
              label: 'Delete',
              action: () => deleteById(contextMenu.nodeId),
              danger: true,
            },
            ...(contextMenu.nodeType === 'folder' ? [{
              label: 'New Folder Inside',
              action: () => {
                const node = items.find(n => n.id === contextMenu.nodeId);
                if (node) {
                  // Navigate into the folder, then create
                  navigateTo([...currentPath, node.name]);
                  setContextMenu(null);
                }
              },
            }] : []),
          ].map((opt, i) => (
            <button
              key={i}
              onClick={opt.action}
              style={{
                display: 'block', width: '100%', padding: '6px 14px',
                textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12.5, color: opt.danger ? '#f87171' : 'rgba(255,255,255,0.8)',
                fontFamily: 'system-ui,-apple-system,sans-serif',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      </div>{/* end keyboard-handler div */}
    </motion.div>
  );
}
