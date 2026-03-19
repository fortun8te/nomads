/**
 * ComputerDesktop — macOS-style desktop with dock and file icons
 *
 * Window manager: tracks focus order so the last-clicked window is always on top.
 * Drag bug fix: each window gets an onFocus callback; windows apply a transparent
 * overlay over iframes/content during drag so mousemove isn't stolen.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconFinderReal, IconChromeReal, IconTerminalReal } from './RealMacOSIcons';
import { FinderWindow } from './FinderWindow';
import { ChromeWindow } from './ChromeWindow';
import { TerminalWindow } from './TerminalWindow';

// Window IDs
type WinId = 'finder' | 'chrome' | 'terminal';

// Base z-indices (before focus stacking)
const BASE_Z: Record<WinId, number> = { finder: 200, chrome: 200, terminal: 200 };

export function ComputerDesktop() {
  const [time] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  const [isChromeOpen, setIsChromeOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // Focus stack — last element is the topmost window
  const [focusStack, setFocusStack] = useState<WinId[]>([]);

  const bringToFront = useCallback((id: WinId) => {
    setFocusStack(prev => [...prev.filter(w => w !== id), id]);
  }, []);

  // Returns z-index for a window: base + position in focus stack * 10
  const zFor = useCallback((id: WinId): number => {
    const idx = focusStack.indexOf(id);
    return BASE_Z[id] + (idx === -1 ? 0 : (idx + 1) * 10);
  }, [focusStack]);

  const openWindow = useCallback((id: WinId, setOpen: (v: boolean) => void, isOpen: boolean) => {
    if (!isOpen) bringToFront(id);
    setOpen(!isOpen);
  }, [bringToFront]);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col">
      {/* Top menu bar */}
      <div className="h-6 px-4 flex items-center justify-between bg-black/[0.35] backdrop-blur-md border-b border-white/[0.08]">
        <div className="text-[10px] font-medium text-white/[0.50] tracking-wide">nomad</div>
        <div className="flex items-center gap-2">
          <div
            aria-label="AI controlled machine"
            title="This desktop is operated by an AI agent"
            style={{
              background: 'rgba(43,121,255,0.15)',
              border: '1px solid rgba(43,121,255,0.25)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 8,
              fontWeight: 700,
              color: 'rgba(43,121,255,0.9)',
              letterSpacing: '0.06em',
              lineHeight: '14px',
            }}
          >
            AI
          </div>
          <div className="text-[10px] font-medium text-white/[0.40]">{time}</div>
        </div>
      </div>

      {/* Desktop area — windows here, pointer-events-auto so they're draggable */}
      <div className="flex-1 relative pointer-events-auto">
        <AnimatePresence>
          {isFinderOpen && (
            <FinderWindow
              onClose={() => setIsFinderOpen(false)}
              zIndex={zFor('finder')}
              onFocus={() => bringToFront('finder')}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isChromeOpen && (
            <ChromeWindow
              onClose={() => setIsChromeOpen(false)}
              zIndex={zFor('chrome')}
              onFocus={() => bringToFront('chrome')}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isTerminalOpen && (
            <TerminalWindow
              onClose={() => setIsTerminalOpen(false)}
              zIndex={zFor('terminal')}
              onFocus={() => bringToFront('terminal')}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Bottom dock */}
      <div className="h-20 px-6 flex items-end justify-center pb-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-2 py-2 rounded-2xl"
          style={{
            background: 'rgba(20,20,28,0.55)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
        >
          {/* Finder */}
          <DockIcon
            label="Finder"
            isOpen={isFinderOpen}
            onClick={() => openWindow('finder', setIsFinderOpen, isFinderOpen)}
            title="Open Finder — Browse session files"
            ariaLabel="Open Finder — Browse session files"
            hint="Click to open the Finder file browser window"
          >
            <IconFinderReal size={62} />
          </DockIcon>

          {/* Chrome */}
          <DockIcon
            label="Chrome"
            isOpen={isChromeOpen}
            onClick={() => openWindow('chrome', setIsChromeOpen, isChromeOpen)}
            title="Open Chrome — AI web browser"
            ariaLabel="Open Chrome — AI web browser"
            hint="Click to open the Chrome browser for web navigation"
          >
            <IconChromeReal size={62} />
          </DockIcon>

          {/* Terminal */}
          <DockIcon
            label="Terminal"
            isOpen={isTerminalOpen}
            onClick={() => openWindow('terminal', setIsTerminalOpen, isTerminalOpen)}
            title="Terminal — AI command interface"
            ariaLabel="Terminal — AI command interface"
            hint="Click to open the AI terminal command window"
          >
            <IconTerminalReal size={62} />
          </DockIcon>
        </motion.div>
      </div>
    </div>
  );
}

// ── DockIcon sub-component ────────────────────────────────────────────────────

function DockIcon({
  children, label, isOpen, onClick, title, ariaLabel, hint,
}: {
  children: React.ReactNode;
  label: string;
  isOpen: boolean;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  hint: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative' }}>
        <motion.button
          whileHover={{ y: -8 }}
          whileTap={{ scale: 0.92, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={onClick}
          className="cursor-pointer pointer-events-auto"
          style={{ background: 'none', border: 'none', padding: 0, display: 'block' }}
          title={title}
          aria-label={ariaLabel}
          data-ai-hint={hint}
        >
          {children}
        </motion.button>
        {isOpen && (
          <div style={{
            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
            width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.7)',
          }} />
        )}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 1, letterSpacing: 0.2 }}>
        {label}
      </div>
    </div>
  );
}
