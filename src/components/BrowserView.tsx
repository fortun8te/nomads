/**
 * BrowserView — Live screenshot viewport for the Computer Use agent.
 *
 * Shows:
 *  - URL bar (read-only, globe icon)
 *  - Screenshot area (base64 JPEG, crossfades on update)
 *  - Thinking/action status bar at bottom
 *  - Thin progress bar while an action is executing
 *  - Action log panel (scrollable, color-coded by status)
 *
 * Design: dark monochrome, looks like a real browser embedded in the UI.
 * Framer-motion crossfade between screenshots.
 */

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ExecutorAction } from '../utils/planActAgent';

// ── Action log entry ──────────────────────────────────────────

export type ActionLogStatus = 'pending' | 'running' | 'done' | 'error';

export interface ActionLogEntry {
  id: number;
  action: ExecutorAction['action'];
  description: string;
  timestamp: number;
  status: ActionLogStatus;
}

// ── Icon helpers ──────────────────────────────────────────────

function GlobeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.28)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function ActionTypeIcon({ type }: { type: ExecutorAction['action'] }) {
  const s = { width: 9, height: 9, viewBox: '0 0 24 24', fill: 'none' as const, stroke: 'currentColor' as const, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'navigate':
    case 'open_tab':
      return <svg {...s}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>;
    case 'click':
      return <svg {...s}><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="10"/></svg>;
    case 'input':
    case 'type':
    case 'fill_field':
      return <svg {...s}><rect x="2" y="6" width="20" height="12" rx="2"/></svg>;
    case 'scroll_down':
      return <svg {...s}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;
    case 'scroll_up':
      return <svg {...s}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
    case 'press_key':
    case 'back':
      return <svg {...s}><polyline points="15 18 9 12 15 6"/></svg>;
    case 'done':
      return <svg {...s}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'switch_tab':
    case 'close_tab':
      return <svg {...s}><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/></svg>;
    default:
      return <svg {...s}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
  }
}

function StatusDot({ status }: { status: ActionLogStatus }) {
  const base: React.CSSProperties = { width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block' };
  if (status === 'running') {
    return <span style={{ ...base, background: '#3b82f6', animation: '_bv_pulse 1.1s ease-in-out infinite' }} />;
  }
  if (status === 'done') {
    return <span style={{ ...base, background: 'rgba(52,211,153,0.75)' }} />;
  }
  if (status === 'error') {
    return <span style={{ ...base, background: 'rgba(239,68,68,0.75)' }} />;
  }
  return <span style={{ ...base, background: 'rgba(255,255,255,0.14)' }} />;
}

// ── BrowserView props ─────────────────────────────────────────

export interface BrowserViewProps {
  /** Current page URL (displayed in the URL bar) */
  currentUrl: string;
  /** Base64 JPEG from sandbox screenshot (no data: prefix) */
  screenshot: string | null;
  /** Status text shown at bottom (e.g. "Clicking login button...") */
  statusText: string;
  /** True while an action is executing (shows progress bar) */
  isActing: boolean;
  /** Action log entries */
  actionLog: ActionLogEntry[];
  /** Optional: show the log as a side panel vs below the viewport */
  logPosition?: 'below' | 'right';
}

// ── Inject CSS once ───────────────────────────────────────────

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
@keyframes _bv_pulse {
  0%, 100% { opacity: 0.45; }
  50%       { opacity: 1; }
}
@keyframes _bv_bar {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
`;
  document.head.appendChild(s);
}

// ── Main component ────────────────────────────────────────────

export function BrowserView({
  currentUrl,
  screenshot,
  statusText,
  isActing,
  actionLog,
  logPosition = 'below',
}: BrowserViewProps) {
  injectCSS();

  const logScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll action log to bottom on new entries
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [actionLog.length]);

  // Format URL for display
  const displayUrl = (() => {
    if (!currentUrl) return 'about:blank';
    try {
      const u = new URL(currentUrl);
      return u.hostname + u.pathname.replace(/\/$/, '') + (u.search ? u.search.slice(0, 40) : '');
    } catch {
      return currentUrl;
    }
  })();

  const isHttps = currentUrl.startsWith('https://');

  return (
    <div style={{ display: 'flex', flexDirection: logPosition === 'right' ? 'row' : 'column', height: '100%', minHeight: 0, gap: 0 }}>

      {/* ── Viewport panel ──────────────────────────────── */}
      <div style={{
        flex: logPosition === 'right' ? '1 1 0' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.07)',
        background: '#0a0b0e',
      }}>

        {/* URL bar */}
        <div style={{
          height: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.015)',
          flexShrink: 0,
        }}>
          {/* Lock / globe */}
          <div style={{ flexShrink: 0 }}>
            {currentUrl && isHttps ? (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                stroke="rgba(52,211,153,0.55)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            ) : (
              <GlobeIcon />
            )}
          </div>

          {/* URL text */}
          <span style={{
            flex: 1,
            fontSize: 10,
            color: currentUrl ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.15)',
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '0.01em',
          }}>
            {displayUrl}
          </span>

          {/* Thinking bar — replaces spinner */}
          {isActing && (
            <div style={{ flexShrink: 0, width: 30, height: 3, borderRadius: 2, background: 'rgba(59,130,246,0.15)', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '35%',
                height: '100%',
                borderRadius: 2,
                background: 'rgba(59,130,246,0.7)',
                animation: '_bv_bar 1.4s ease-in-out infinite',
              }} />
            </div>
          )}
        </div>

        {/* Screenshot area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#080a0d', minHeight: 180 }}>
          <AnimatePresence mode="sync">
            {screenshot ? (
              <motion.img
                key={screenshot.slice(-16)} // key on last 16 chars to trigger re-mount on new screenshot
                src={`data:image/jpeg;base64,${screenshot}`}
                alt="Browser screenshot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
                draggable={false}
              />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                </svg>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', fontFamily: 'monospace' }}>
                  waiting for screenshot
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Thin progress line at very top of viewport */}
          {isActing && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              overflow: 'hidden',
              zIndex: 10,
            }}>
              <div style={{
                width: '40%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.8), transparent)',
                animation: '_bv_bar 1.4s ease-in-out infinite',
              }} />
            </div>
          )}
        </div>

        {/* Status bar */}
        <div style={{
          height: 24,
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.25)',
          flexShrink: 0,
        }}>
          {isActing && (
            <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#3b82f6',
              flexShrink: 0,
              display: 'inline-block',
              animation: '_bv_pulse 1.1s ease-in-out infinite',
            }} />
          )}
          <span style={{
            fontSize: 9,
            color: isActing ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.20)',
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '0.01em',
          }}>
            {statusText || 'idle'}
          </span>
        </div>
      </div>

      {/* ── Action log panel ────────────────────────────── */}
      {actionLog.length > 0 && (
        <div style={{
          ...(logPosition === 'right'
            ? { width: 220, flexShrink: 0, marginLeft: 8 }
            : { marginTop: 8, maxHeight: 180 }),
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(10,12,16,0.85)',
          overflow: 'hidden',
        }}>
          {/* Log header */}
          <div style={{
            padding: '7px 10px 5px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,0.22)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Actions
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.14)', fontVariantNumeric: 'tabular-nums' }}>
              {actionLog.length}
            </span>
          </div>

          {/* Log entries */}
          <div ref={logScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            <AnimatePresence initial={false}>
              {actionLog.map((entry) => (
                <ActionLogRow key={entry.id} entry={entry} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Action log row ────────────────────────────────────────────

function ActionLogRow({ entry }: { entry: ActionLogEntry }) {
  const [ts] = useState(() => {
    const d = new Date(entry.timestamp);
    return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  });

  const iconColor = entry.status === 'running' ? 'rgba(59,130,246,0.8)'
    : entry.status === 'done'    ? 'rgba(52,211,153,0.65)'
    : entry.status === 'error'   ? 'rgba(239,68,68,0.65)'
    : 'rgba(255,255,255,0.18)';

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 7,
        padding: '4px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.025)',
      }}
    >
      {/* Status dot */}
      <div style={{ marginTop: 2, flexShrink: 0 }}>
        <StatusDot status={entry.status} />
      </div>

      {/* Action icon */}
      <div style={{ marginTop: 1, color: iconColor, flexShrink: 0 }}>
        <ActionTypeIcon type={entry.action} />
      </div>

      {/* Description */}
      <span style={{
        flex: 1,
        fontSize: 9.5,
        color: entry.status === 'running' ? 'rgba(255,255,255,0.72)'
          : entry.status === 'done'    ? 'rgba(255,255,255,0.42)'
          : entry.status === 'error'   ? 'rgba(239,68,68,0.70)'
          : 'rgba(255,255,255,0.28)',
        lineHeight: 1.4,
        wordBreak: 'break-word',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {entry.description}
      </span>

      {/* Timestamp */}
      <span style={{
        fontSize: 8,
        color: 'rgba(255,255,255,0.15)',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'monospace',
        marginTop: 1,
      }}>
        {ts}
      </span>
    </motion.div>
  );
}
