/**
 * DocumentViewer — Full-screen modal for viewing agent-generated documents.
 *
 * Opens with scale + opacity animation (AnimatePresence).
 * Renders markdown-like content: ## headings, ### subheadings, tables, body text.
 * Footer "Copy content" button copies raw text to clipboard.
 */

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentDocument } from '../utils/documentStore';

// ─────────────────────────────────────────────────────────────
// Doc icon SVG
// ─────────────────────────────────────────────────────────────

function DocIcon({ size = 16, color = 'rgba(99,130,255,0.85)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Markdown-like renderer
// ─────────────────────────────────────────────────────────────

interface RenderedLine {
  key: string;
  element: React.ReactNode;
}

function renderContent(content: string): RenderedLine[] {
  const lines = content.split('\n');
  const result: RenderedLine[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H2
    if (line.startsWith('## ')) {
      result.push({
        key: `h2-${i}`,
        element: (
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.95)',
              margin: '20px 0 8px',
              lineHeight: 1.3,
            }}
          >
            {line.slice(3)}
          </h2>
        ),
      });
      i++;
      continue;
    }

    // H3
    if (line.startsWith('### ')) {
      result.push({
        key: `h3-${i}`,
        element: (
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.90)',
              margin: '14px 0 6px',
              lineHeight: 1.3,
            }}
          >
            {line.slice(4)}
          </h3>
        ),
      });
      i++;
      continue;
    }

    // H1 (single #)
    if (line.startsWith('# ')) {
      result.push({
        key: `h1-${i}`,
        element: (
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.98)',
              margin: '8px 0 12px',
              lineHeight: 1.3,
            }}
          >
            {line.slice(2)}
          </h1>
        ),
      });
      i++;
      continue;
    }

    // Table: collect consecutive lines with |
    if (line.includes('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Filter out separator lines (e.g. |---|---|)
      const nonSep = tableLines.filter(l => !/^\s*\|[-\s|:]+\|\s*$/.test(l));
      if (nonSep.length > 0) {
        const rows = nonSep.map(l =>
          l.split('|').map(c => c.trim()).filter((_, ci, arr) => ci > 0 && ci < arr.length - 1)
        );
        result.push({
          key: `table-${i}`,
          element: (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                margin: '12px 0',
                fontSize: 12,
              }}
            >
              <tbody>
                {rows.map((cells, ri) => (
                  <tr
                    key={ri}
                    style={{
                      background: ri === 0
                        ? 'rgba(99,130,255,0.10)'
                        : ri % 2 === 0
                          ? 'rgba(255,255,255,0.02)'
                          : 'transparent',
                    }}
                  >
                    {cells.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '5px 10px',
                          color: ri === 0
                            ? 'rgba(255,255,255,0.85)'
                            : 'rgba(255,255,255,0.65)',
                          fontWeight: ri === 0 ? 600 : 400,
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        });
      }
      continue;
    }

    // Bullet list item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      result.push({
        key: `li-${i}`,
        element: (
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 4,
              fontSize: 13,
              color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.7,
            }}
          >
            <span style={{ color: 'rgba(99,130,255,0.7)', flexShrink: 0, marginTop: 1 }}>·</span>
            <span>{line.slice(2)}</span>
          </div>
        ),
      });
      i++;
      continue;
    }

    // Numbered list item
    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        result.push({
          key: `ol-${i}`,
          element: (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 4,
                fontSize: 13,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.7,
              }}
            >
              <span style={{ color: 'rgba(99,130,255,0.7)', flexShrink: 0, minWidth: 16 }}>{match[1]}.</span>
              <span>{match[2]}</span>
            </div>
          ),
        });
        i++;
        continue;
      }
    }

    // Empty line → spacer
    if (line.trim() === '') {
      result.push({
        key: `sp-${i}`,
        element: <div style={{ height: 8 }} />,
      });
      i++;
      continue;
    }

    // Regular paragraph text
    result.push({
      key: `p-${i}`,
      element: (
        <p
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.7,
            margin: '0 0 6px',
          }}
        >
          {line}
        </p>
      ),
    });
    i++;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface DocumentViewerProps {
  document: AgentDocument | null;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function DocumentViewer({ document, onClose }: DocumentViewerProps) {
  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleCopy = useCallback(() => {
    if (!document) return;
    navigator.clipboard.writeText(document.content).catch(() => {
      /* ignore clipboard errors */
    });
  }, [document]);

  const typeLabel = document
    ? document.type === 'plan'
      ? 'Plan'
      : document.type === 'research'
        ? 'Research'
        : 'Document'
    : '';

  const renderedLines = document ? renderContent(document.content) : [];

  return (
    <AnimatePresence>
      {document && (
        <>
          {/* Backdrop */}
          <motion.div
            key="doc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9000,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(20px)',
            }}
          />

          {/* Panel */}
          <motion.div
            key="doc-panel"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: 780,
                maxWidth: 'calc(100vw - 48px)',
                height: '85vh',
                background: 'rgba(16,16,20,0.98)',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                pointerEvents: 'all',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '14px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  flexShrink: 0,
                }}
              >
                <DocIcon size={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.90)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {document.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', marginTop: 1 }}>
                    {typeLabel} · Last modified: just now
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Copy / share */}
                  <button
                    onClick={handleCopy}
                    title="Copy to clipboard"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.50)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>

                  {/* Download */}
                  <button
                    onClick={() => {
                      const blob = new Blob([document.content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = window.document.createElement('a');
                      a.href = url;
                      a.download = `${document.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    title="Download"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.50)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>

                  {/* Close */}
                  <button
                    onClick={onClose}
                    title="Close"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.50)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '24px 32px',
                  minHeight: 0,
                }}
              >
                {renderedLines.map(({ key, element }) => (
                  <div key={key}>{element}</div>
                ))}
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  borderTop: '1px solid rgba(255,255,255,0.07)',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                  {document.content.split(/\s+/).length} words
                </span>
                <button
                  onClick={handleCopy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 8,
                    background: 'rgba(99,130,255,0.15)',
                    border: '1px solid rgba(99,130,255,0.30)',
                    color: 'rgba(99,130,255,0.85)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Copy content
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
