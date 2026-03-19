/**
 * ChromeWindow — Pixel-perfect Chrome browser window component
 *
 * Features:
 * - macOS traffic lights (red closes window, others cosmetic)
 * - Full tab bar: favicons, titles, close buttons, new tab (+)
 * - URL/address bar: glass pill, lock icon, back/forward/reload
 * - New tab page: dark, minimal, single search input
 * - Embeds BrowserViewport as browser content placeholder
 * - Drag support via tab bar
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──────────────────────────────────────────────

export interface ChromeTab {
  id: string;
  title: string;
  url: string;
  favicon?: string; // emoji or URL
  isActive: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  history: string[];
  historyIndex: number;
}

interface ChromeWindowProps {
  /** Called when the red traffic light (close) is clicked */
  onClose?: () => void;
  /** Initial tabs to open. Defaults to a single new-tab page. */
  initialTabs?: Partial<ChromeTab>[];
  /** Width/height are controlled by the window manager via className/style */
  className?: string;
  style?: React.CSSProperties;
  /** z-index override from the window manager */
  zIndex?: number;
  /** Called on any mousedown in this window (bring to front) */
  onFocus?: () => void;
}

// ── Constants ──────────────────────────────────────────

const NEW_TAB_URL = 'chrome://newtab';

const spring = { type: 'spring' as const, bounce: 0, duration: 0.22 };

// ── Inline SVG Icons ────────────────────────────────────

function LockIcon({ locked = true }: { locked?: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
      stroke={locked ? 'rgba(134,239,172,0.7)' : 'rgba(255,255,255,0.25)'}
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      {locked
        ? <path d="M7 11V7a5 5 0 0110 0v4"/>
        : <path d="M7 11V7a5 5 0 019.9-1"/>}
    </svg>
  );
}

function ReloadIcon({ spinning }: { spinning: boolean }) {
  return (
    <motion.svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={spinning ? { duration: 0.7, repeat: Infinity, ease: 'linear' } : {}}
    >
      <path d="M23 4v6h-6"/>
      <path d="M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/>
      <path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
    </motion.svg>
  );
}

function ArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/>
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}

function CloseTabIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
    </svg>
  );
}

// ── Utility ────────────────────────────────────────────

function makeTabId() {
  return Math.random().toString(36).slice(2, 9);
}

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

function isHttps(url: string) {
  return url.startsWith('https://');
}

function isNewTab(url: string) {
  return !url || url === NEW_TAB_URL || url === 'about:blank';
}

function trimTitle(title: string, maxLen = 18): string {
  return title.length > maxLen ? title.slice(0, maxLen) + '…' : title;
}

function makeDefaultTab(overrides: Partial<ChromeTab> = {}): ChromeTab {
  return {
    id: makeTabId(),
    title: 'New Tab',
    url: NEW_TAB_URL,
    favicon: undefined,
    isActive: true,
    canGoBack: false,
    canGoForward: false,
    history: [NEW_TAB_URL],
    historyIndex: 0,
    ...overrides,
  };
}

// ── Favicon dot (color circle fallback) ──────────────

function FaviconDot({ favicon, size = 14 }: { favicon?: string; size?: number }) {
  if (!favicon) {
    return (
      <span style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)', flexShrink: 0,
      }} />
    );
  }
  if (favicon.length <= 2) {
    return <span style={{ fontSize: size - 2, lineHeight: 1, flexShrink: 0 }}>{favicon}</span>;
  }
  return (
    <img src={favicon} width={size} height={size}
      style={{ borderRadius: 2, objectFit: 'contain', flexShrink: 0 }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

// ── New Tab Page — minimal dark search page ─────────────

interface NewTabPageProps {
  onNavigate: (url: string) => void;
}

function NewTabPage({ onNavigate }: NewTabPageProps) {
  const [query, setQuery] = useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const isUrl = /^https?:\/\//.test(q) || /^[a-z0-9-]+\.[a-z]{2,}/.test(q);
    if (isUrl) {
      onNavigate(q.startsWith('http') ? q : 'https://' + q);
    } else {
      onNavigate(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#0a0a0c',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <form onSubmit={handleSearch} style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 99, padding: '0 16px',
          height: 44, backdropFilter: 'blur(12px)',
        }}>
          <SearchIcon />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search or enter URL"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 13, color: 'rgba(255,255,255,0.7)',
              caretColor: '#3b82f6',
            }}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.25)', padding: 0, lineHeight: 1,
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

export function ChromeWindow({
  onClose,
  initialTabs,
  className = '',
  style,
  zIndex,
  onFocus,
}: ChromeWindowProps) {
  const [tabs, setTabs] = useState<ChromeTab[]>(() => {
    if (initialTabs && initialTabs.length > 0) {
      return initialTabs.map((t, i) => makeDefaultTab({ ...t, isActive: i === 0 }));
    }
    return [makeDefaultTab()];
  });

  const [urlInputValue, setUrlInputValue] = useState('');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // ── Window drag ──
  const windowRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Center window explicitly on mount
  useEffect(() => {
    const parent = windowRef.current?.parentElement;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    setPos({ x: (pr.width - 780) / 2, y: Math.max(16, (pr.height - 460) / 2) });
  }, []);

  const onTabBarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Do not drag when clicking buttons or inputs
    if ((e.target as HTMLElement).closest('button, input')) return;
    e.preventDefault();
    isDraggingRef.current = true;
    const rect = windowRef.current?.getBoundingClientRect();
    const parentRect = windowRef.current?.parentElement?.getBoundingClientRect();
    if (rect && parentRect) {
      dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (pos === null) {
        setPos({ x: rect.left - parentRect.left, y: rect.top - parentRect.top });
      }
    }
    setIsDraggingWindow(true);
    const onMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const pr = windowRef.current?.parentElement?.getBoundingClientRect();
      if (!pr) return;
      setPos({ x: ev.clientX - pr.left - dragOffsetRef.current.x, y: ev.clientY - pr.top - dragOffsetRef.current.y });
    };
    const onUp = () => {
      isDraggingRef.current = false;
      setIsDraggingWindow(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // ── Derived ──
  const activeTab = tabs.find(t => t.isActive) ?? tabs[0];
  const showNewTabPage = isNewTab(activeTab?.url ?? '');

  // ── Tab management ──

  const activateTab = useCallback((id: string) => {
    setTabs(prev => prev.map(t => ({ ...t, isActive: t.id === id })));
    setIsEditingUrl(false);
  }, []);

  const openTab = useCallback((url = NEW_TAB_URL, title = 'New Tab', favicon?: string) => {
    const tab = makeDefaultTab({ url, title, favicon, history: [url], historyIndex: 0 });
    setTabs(prev => [...prev.map(t => ({ ...t, isActive: false })), tab]);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      // Closing last tab resets to a fresh new-tab page
      if (prev.length === 1) return [makeDefaultTab()];
      const idx = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      if (prev[idx].isActive) {
        const newActive = Math.max(0, idx - 1);
        next[newActive] = { ...next[newActive], isActive: true };
      }
      return next;
    });
  }, []);

  const updateActiveTab = useCallback((patch: Partial<ChromeTab>) => {
    setTabs(prev => prev.map(t => t.isActive ? { ...t, ...patch } : t));
  }, []);

  // ── Navigation ──

  const navigateTo = useCallback((rawUrl: string) => {
    let url = rawUrl.trim();
    if (!url) return;

    const isUrl = /^https?:\/\//.test(url) || /^[a-z0-9-]+\.[a-z]{2,}(\/|$)/.test(url) || url === NEW_TAB_URL;
    if (!isUrl) {
      url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    } else if (!/^https?:\/\//.test(url) && url !== NEW_TAB_URL) {
      url = 'https://' + url;
    }

    setLoading(true);
    setIsEditingUrl(false);

    setTabs(prev => prev.map(t => {
      if (!t.isActive) return t;
      const newHistory = [...t.history.slice(0, t.historyIndex + 1), url];
      return {
        ...t, url,
        title: isNewTab(url) ? 'New Tab' : (cleanUrl(url) || 'Loading...'),
        canGoBack: newHistory.length > 1,
        canGoForward: false,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    }));

    setTimeout(() => setLoading(false), 600);
  }, []);

  const goBack = useCallback(() => {
    setTabs(prev => prev.map(t => {
      if (!t.isActive || t.historyIndex === 0) return t;
      const newIndex = t.historyIndex - 1;
      const url = t.history[newIndex];
      return {
        ...t,
        url,
        historyIndex: newIndex,
        canGoBack: newIndex > 0,
        canGoForward: true,
        title: isNewTab(url) ? 'New Tab' : (cleanUrl(url) || 'Loading...'),
      };
    }));
  }, []);

  const goForward = useCallback(() => {
    setTabs(prev => prev.map(t => {
      if (!t.isActive || t.historyIndex >= t.history.length - 1) return t;
      const newIndex = t.historyIndex + 1;
      const url = t.history[newIndex];
      return {
        ...t,
        url,
        historyIndex: newIndex,
        canGoBack: true,
        canGoForward: newIndex < t.history.length - 1,
        title: isNewTab(url) ? 'New Tab' : (cleanUrl(url) || 'Loading...'),
      };
    }));
  }, []);

  const reload = useCallback(() => {
    if (!activeTab || isNewTab(activeTab.url)) return;
    setLoading(true);
    setTimeout(() => setLoading(false), 700);
  }, [activeTab]);

  // ── URL bar ──

  function handleUrlFocus() {
    setIsEditingUrl(true);
    setUrlInputValue(activeTab?.url ?? '');
    setTimeout(() => urlInputRef.current?.select(), 50);
  }

  function handleUrlBlur() {
    setIsEditingUrl(false);
  }

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigateTo(urlInputValue);
  }

  function handleUrlKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsEditingUrl(false);
      urlInputRef.current?.blur();
    }
  }

  const displayedUrl = isNewTab(activeTab?.url ?? '')
    ? ''
    : cleanUrl(activeTab?.url ?? '');

  const isSecure = activeTab ? isHttps(activeTab.url) : false;

  // Suppress unused-variable warning — updateActiveTab is available for callers
  void updateActiveTab;

  // ── Render ──────────────────────────────────────────

  return (
    <motion.div
      ref={windowRef}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
      onMouseDownCapture={onFocus}
      style={{
        position: 'absolute',
        ...(pos !== null
          ? { left: pos.x, top: pos.y, transform: 'none' }
          : { left: '50%', top: '40%', transform: 'translate(-50%, -50%)' }
        ),
        width: 780, height: 460,
        display: 'flex', flexDirection: 'column',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'rgba(22, 22, 28, 0.98)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 40px 100px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)',
        backdropFilter: 'blur(40px) saturate(160%)',
        zIndex: zIndex ?? 210,
        pointerEvents: 'auto',
        ...style,
      }}
    >
      {/* Drag overlay — prevents iframe from stealing mousemove during window drag */}
      {isDraggingWindow && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9999, cursor: 'grabbing' }} />
      )}
      {/* ══════════════════════════════════════════ */}
      {/*  1. TAB BAR (36px)                         */}
      {/* ══════════════════════════════════════════ */}
      <div
        onMouseDown={onTabBarMouseDown}
        style={{
          height: 36, display: 'flex', alignItems: 'flex-end',
          background: 'rgba(18, 18, 24, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          paddingLeft: 72,
          paddingRight: 8,
          position: 'relative',
          cursor: 'default',
        }}
      >
        {/* Traffic lights — buttons, so drag check ignores them */}
        <div style={{
          position: 'absolute', left: 14, top: 0, bottom: 0,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <TrafficLight color="#ff5f57" hoverGlow="rgba(255,95,87,0.5)" onClick={onClose} />
          <TrafficLight color="#febc2e" hoverGlow="rgba(254,188,46,0.5)" />
          <TrafficLight color="#28c840" hoverGlow="rgba(40,200,64,0.5)" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <AnimatePresence initial={false}>
            {tabs.map(tab => (
              <TabButton
                key={tab.id}
                tab={tab}
                onActivate={() => activateTab(tab.id)}
                onClose={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              />
            ))}
          </AnimatePresence>

          {/* New tab button */}
          <motion.button
            onClick={() => openTab()}
            whileHover={{ scale: 1.1, color: 'rgba(255,255,255,0.6)' }}
            whileTap={{ scale: 0.92 }}
            style={{
              width: 28, height: 28, borderRadius: 6, marginBottom: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.25)', flexShrink: 0, marginLeft: 4,
            }}
          >
            <PlusIcon />
          </motion.button>
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/*  2. TOOLBAR (44px): nav + url              */}
      {/* ══════════════════════════════════════════ */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px',
        background: 'rgba(20, 20, 26, 0.97)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Back */}
        <NavButton onClick={goBack} disabled={!activeTab?.canGoBack} title="Back">
          <ArrowLeft />
        </NavButton>

        {/* Forward */}
        <NavButton onClick={goForward} disabled={!activeTab?.canGoForward} title="Forward">
          <ArrowRight />
        </NavButton>

        {/* Reload */}
        <NavButton onClick={reload} disabled={showNewTabPage} title="Reload">
          <ReloadIcon spinning={loading} />
        </NavButton>

        {/* URL Bar */}
        <form onSubmit={handleUrlSubmit} style={{ flex: 1, display: 'flex' }}>
          <div
            onClick={handleUrlFocus}
            style={{
              flex: 1, height: 32, borderRadius: 99,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 12px',
              background: isEditingUrl
                ? 'rgba(255,255,255,0.07)'
                : 'rgba(255,255,255,0.04)',
              border: isEditingUrl
                ? '1px solid rgba(99,155,255,0.4)'
                : '1px solid rgba(255,255,255,0.07)',
              boxShadow: isEditingUrl ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
              transition: 'all 0.15s ease',
              cursor: isEditingUrl ? 'text' : 'pointer',
            }}
          >
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <LockIcon locked={isSecure} />
            </div>

            {isEditingUrl ? (
              <input
                ref={urlInputRef}
                value={urlInputValue}
                onChange={e => setUrlInputValue(e.target.value)}
                onBlur={handleUrlBlur}
                onKeyDown={handleUrlKeyDown}
                autoFocus
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: 12, color: 'rgba(255,255,255,0.8)',
                  caretColor: '#3b82f6',
                  fontFamily: 'ui-monospace, monospace',
                }}
              />
            ) : (
              <span style={{
                flex: 1, fontSize: 12,
                color: showNewTabPage ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                userSelect: 'none',
              }}>
                {showNewTabPage ? 'Search or navigate...' : displayedUrl}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/*  3. BROWSER VIEWPORT                       */}
      {/* ══════════════════════════════════════════ */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {/* Loading bar */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ scaleX: 0, opacity: 1 }}
              animate={{ scaleX: 0.85 }}
              exit={{ scaleX: 1, opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                transformOrigin: 'left', zIndex: 10,
              }}
            />
          )}
        </AnimatePresence>

        {showNewTabPage ? (
          <NewTabPage onNavigate={navigateTo} />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0a0a0c',
          }}>
            <BrowserViewport url={activeTab?.url ?? ''} onNavigate={navigateTo} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Sub-components ─────────────────────────────────────

function TrafficLight({ color, hoverGlow, onClick }: { color: string; hoverGlow: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 12, height: 12, borderRadius: '50%',
        background: color, flexShrink: 0, cursor: onClick ? 'pointer' : 'default',
        border: 'none', padding: 0,
        boxShadow: hovered ? `0 0 6px ${hoverGlow}` : `0 0 0 0 transparent`,
        transition: 'box-shadow 0.15s ease',
      }}
    />
  );
}

function NavButton({
  children, onClick, disabled, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.45)',
        transition: 'color 0.15s, background 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; } }}
      onMouseLeave={e => { e.currentTarget.style.color = disabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'none'; }}
    >
      {children}
    </button>
  );
}

function TabButton({
  tab, onActivate, onClose,
}: {
  tab: ChromeTab;
  onActivate: () => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const title = trimTitle(tab.title);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 'auto' }}
      exit={{ opacity: 0, width: 0 }}
      transition={spring}
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 34, maxWidth: 200, minWidth: 60,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 8px 0 10px',
        borderRadius: '7px 7px 0 0',
        cursor: 'pointer',
        flexShrink: 1, overflow: 'hidden',
        position: 'relative',
        background: tab.isActive
          ? 'rgba(255,255,255,0.07)'
          : hovered
            ? 'rgba(255,255,255,0.035)'
            : 'transparent',
        borderTop: tab.isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        borderLeft: tab.isActive ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        borderRight: tab.isActive ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        transition: 'background 0.15s',
      }}
    >
      {/* Active indicator */}
      {tab.isActive && (
        <div style={{
          position: 'absolute', bottom: 0, left: 8, right: 8, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(99,155,255,0.4), transparent)',
        }} />
      )}

      <FaviconDot favicon={tab.favicon} size={13} />

      <span style={{
        flex: 1, fontSize: 11, fontWeight: tab.isActive ? 500 : 400,
        color: tab.isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        userSelect: 'none',
      }}>
        {title}
      </span>

      <button
        onClick={onClose}
        style={{
          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hovered || tab.isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
          border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.3)',
          opacity: hovered || tab.isActive ? 1 : 0,
          transition: 'opacity 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255,80,60,0.2)';
          e.currentTarget.style.color = 'rgba(255,100,80,0.9)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.3)';
        }}
      >
        <CloseTabIcon />
      </button>
    </motion.div>
  );
}

// ── Browser Viewport — real iframe browsing ─────────────

function BrowserViewport({ url, onNavigate }: { url: string; onNavigate: (u: string) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Reset blocked state whenever URL changes
  useEffect(() => {
    setBlocked(false);
    setIframeKey(k => k + 1);
  }, [url]);

  // Quick-access sites (work well in iframes)
  const QUICK_LINKS = [
    { label: 'Google', url: 'https://www.google.com', emoji: '🔍' },
    { label: 'Wikipedia', url: 'https://en.wikipedia.org', emoji: '📖' },
    { label: 'GitHub', url: 'https://github.com', emoji: '🐙' },
    { label: 'HN', url: 'https://news.ycombinator.com', emoji: '📰' },
  ];

  if (blocked) {
    return (
      <div style={{
        width: '100%', height: '100%', background: '#0a0a0c',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginBottom: 4 }}>
            {cleanUrl(url)}
          </p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.10)', marginBottom: 12 }}>
            This site blocks embedding. Try opening it in your real browser.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', padding: '0 24px' }}>
          {QUICK_LINKS.map(l => (
            <button key={l.url} onClick={() => onNavigate(l.url)} style={{
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.30)', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span>{l.emoji}</span> {l.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={iframeKey}
      ref={iframeRef}
      src={url}
      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      onError={() => setBlocked(true)}
      onLoad={() => {
        // Detect X-Frame-Options block (iframe loads but is empty/about:blank due to CSP)
        try {
          const doc = iframeRef.current?.contentDocument;
          if (doc && doc.location.href === 'about:blank' && url !== 'about:blank') {
            setBlocked(true);
          }
        } catch {
          // Cross-origin — that's fine, means the page loaded correctly
        }
      }}
    />
  );
}
