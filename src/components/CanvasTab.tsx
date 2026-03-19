/**
 * CanvasTab — Dark-themed document editor panel
 *
 * Opens alongside the computer view when a write:/draft: instruction is routed.
 * Supports Doc / Code / Plan formats. Export copies content to clipboard.
 * No rich text — clean dark monospace/prose textarea.
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type CanvasFormat = 'Doc' | 'Code' | 'Plan';

interface CanvasTabProps {
  initialContent?: string;
  initialTitle?: string;
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────
// Format configs
// ─────────────────────────────────────────────────────────────

const FORMAT_CONFIG: Record<CanvasFormat, { placeholder: string; fontFamily: string; label: string }> = {
  Doc: {
    placeholder: 'Start writing your document...',
    fontFamily: "'Inter', 'system-ui', sans-serif",
    label: 'Doc',
  },
  Code: {
    placeholder: '// Start writing code...',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', monospace",
    label: 'Code',
  },
  Plan: {
    placeholder: '1. Step one\n2. Step two\n3. Step three\n\nObjective:\n\nNotes:',
    fontFamily: "'Inter', 'system-ui', sans-serif",
    label: 'Plan',
  },
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function CanvasTab({ initialContent = '', initialTitle = 'Untitled', onClose }: CanvasTabProps) {
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(initialTitle);
  const [format, setFormat] = useState<CanvasFormat>('Doc');
  const [copied, setCopied] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content]);

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    setTimeout(() => titleRef.current?.select(), 0);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (!title.trim()) setTitle('Untitled');
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const lineCount = content ? content.split('\n').length : 0;

  const cfg = FORMAT_CONFIG[format];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="flex flex-col h-full"
      style={{
        background: 'linear-gradient(180deg, rgba(13,14,20,0.96) 0%, rgba(10,11,17,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* ── Top bar ── */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {/* Title */}
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <input
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={e => { if (e.key === 'Enter') titleRef.current?.blur(); }}
              className="w-full bg-transparent text-white/80 text-[12px] font-medium focus:outline-none border-b border-white/20"
              style={{ minWidth: 0 }}
            />
          ) : (
            <button
              onClick={handleTitleClick}
              className="text-[12px] font-medium text-white/70 hover:text-white/90 transition-colors truncate block w-full text-left"
              title="Click to rename"
            >
              {title}
            </button>
          )}
        </div>

        {/* Format selector */}
        <div
          className="flex items-center rounded-md overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {(['Doc', 'Code', 'Plan'] as CanvasFormat[]).map(f => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className="px-2 py-0.5 text-[10px] font-medium transition-colors"
              style={{
                color: format === f ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.30)',
                background: format === f ? 'rgba(255,255,255,0.09)' : 'transparent',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Export / copy button */}
        <button
          onClick={handleCopy}
          title="Copy to clipboard"
          className="flex items-center gap-1 px-2 py-1 rounded-md transition-all text-[10px] font-medium"
          style={{
            background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
            border: copied ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.07)',
            color: copied ? 'rgba(34,197,94,0.9)' : 'rgba(255,255,255,0.45)',
          }}
        >
          {copied ? (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Export
            </>
          )}
        </button>

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            title="Close canvas"
            className="flex items-center justify-center w-5 h-5 rounded transition-colors"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Editor area ── */}
      <div className="flex-1 relative min-h-0">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={cfg.placeholder}
          className="absolute inset-0 w-full h-full px-4 py-4 resize-none focus:outline-none"
          style={{
            background: 'transparent',
            color: 'rgba(255,255,255,0.80)',
            fontFamily: cfg.fontFamily,
            fontSize: format === 'Code' ? 12 : 13,
            lineHeight: format === 'Code' ? '1.65' : '1.75',
            letterSpacing: format === 'Code' ? '0' : '0.01em',
            caretColor: 'rgba(99,179,237,0.9)',
          }}
          spellCheck={format !== 'Code'}
          data-role="canvas-editor"
          aria-label={`Canvas ${format} editor`}
        />
      </div>

      {/* ── Status bar ── */}
      <div
        className="shrink-0 flex items-center justify-between px-3 py-1.5 border-t"
        style={{
          borderColor: 'rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        <span className="text-[9px] text-white/20">{format}</span>
        <div className="flex items-center gap-3">
          {format !== 'Code' && (
            <span className="text-[9px] text-white/20">{wordCount} words</span>
          )}
          <span className="text-[9px] text-white/20">{lineCount} lines</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Canvas dock icon (SVG, no external dependency)
// ─────────────────────────────────────────────────────────────

export function IconCanvasDoc({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 62 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <rect width="62" height="62" rx="13" fill="url(#canvasGrad)" />
      {/* Page */}
      <rect x="14" y="11" width="34" height="40" rx="4" fill="rgba(255,255,255,0.12)" />
      {/* Lines */}
      <rect x="19" y="19" width="24" height="2" rx="1" fill="rgba(255,255,255,0.55)" />
      <rect x="19" y="24" width="18" height="1.5" rx="0.75" fill="rgba(255,255,255,0.30)" />
      <rect x="19" y="28" width="22" height="1.5" rx="0.75" fill="rgba(255,255,255,0.30)" />
      <rect x="19" y="32" width="16" height="1.5" rx="0.75" fill="rgba(255,255,255,0.30)" />
      <rect x="19" y="36" width="20" height="1.5" rx="0.75" fill="rgba(255,255,255,0.30)" />
      {/* Pen accent */}
      <circle cx="43" cy="43" r="7" fill="rgba(99,179,237,0.85)" />
      <path d="M40.5 45.5l4.5-4.5 1.5 1.5-4.5 4.5-2 .5.5-2z" fill="white" />
      <defs>
        <linearGradient id="canvasGrad" x1="0" y1="0" x2="62" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a1f35" />
          <stop offset="100%" stopColor="#0f1220" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Canvas panel wrapper — for use in ComputerDesktop
// ─────────────────────────────────────────────────────────────

interface CanvasPanelProps {
  isOpen: boolean;
  initialContent?: string;
  initialTitle?: string;
  onClose: () => void;
}

export function CanvasPanel({ isOpen, initialContent, initialTitle, onClose }: CanvasPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          style={{
            position: 'absolute',
            top: 32,
            right: 16,
            bottom: 16,
            width: 420,
            zIndex: 50,
          }}
        >
          <CanvasTab
            initialContent={initialContent}
            initialTitle={initialTitle}
            onClose={onClose}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
