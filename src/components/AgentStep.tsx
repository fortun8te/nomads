/**
 * AgentStep.tsx — Manus Lite collapsible step component
 *
 * Individual step card with:
 * - Title + description
 * - Collapsible content (toggled by click)
 * - Status icons (checkmark for done, circle for pending, animated white dot for active)
 * - Sub-items with icons (search, completed, pending)
 * - Smooth open/close transitions
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface StepConfig {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'completed';
  subItems?: SubItem[];
  isThinking?: boolean;
  liveThinkingText?: string;
}

export interface SubItem {
  id: string;
  type: 'query' | 'completed' | 'pending';
  label: string;
}

interface AgentStepProps {
  step: StepConfig;
  onStatusChange?: (stepId: string, expanded: boolean) => void;
}

// Icons
function CheckmarkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s ease',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ThinkingDot() {
  return (
    <motion.div
      className="w-2 h-2 rounded-full"
      style={{ background: 'rgba(255,255,255,0.9)' }}
      animate={{
        scale: [0.9, 1.2, 0.9],
        opacity: [0.7, 1, 0.7],
      }}
      transition={{
        duration: 1.2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

function PendingCircle() {
  return (
    <div
      className="w-2 h-2 rounded-full"
      style={{ background: 'rgba(255,255,255,0.3)' }}
    />
  );
}

export function AgentStep({ step, onStatusChange }: AgentStepProps) {
  const [expanded, setExpanded] = useState(step.status === 'active');

  useEffect(() => {
    if (step.status === 'active') {
      setExpanded(true);
    }
  }, [step.status]);

  const handleToggle = () => {
    const newState = !expanded;
    setExpanded(newState);
    onStatusChange?.(step.id, newState);
  };

  const statusColor = {
    pending: 'rgba(255,255,255,0.3)',
    active: 'rgba(255,255,255,0.8)',
    completed: 'rgba(34,197,94,0.9)',
  };

  const statusOpacity = {
    pending: 0.3,
    active: 0.85,
    completed: 0.7,
  };

  return (
    <div className="py-2">
      {/* Step Header (clickable) */}
      <button
        onClick={handleToggle}
        className="flex items-center gap-3 w-full text-left group hover:bg-white/[0.02] px-3 py-2 rounded-lg transition-all"
      >
        {/* Status Icon */}
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {step.status === 'completed' ? (
            <div className="w-4 h-4 rounded-full flex items-center justify-center bg-green-500/20 border border-green-500/30">
              <CheckmarkIcon />
            </div>
          ) : step.status === 'active' ? (
            <ThinkingDot />
          ) : (
            <PendingCircle />
          )}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold leading-tight"
            style={{
              color: statusColor[step.status],
              opacity: statusOpacity[step.status],
            }}
          >
            {step.title}
          </div>
          {step.description && (
            <div
              className="text-xs leading-snug mt-0.5"
              style={{
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              {step.description}
            </div>
          )}
        </div>

        {/* Chevron */}
        <div
          className="shrink-0"
          style={{
            color: 'rgba(255,255,255,0.2)',
          }}
        >
          <ChevronIcon open={expanded} />
        </div>
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-7 mt-2 space-y-2 pb-1">
              {/* Sub-items (queries, completed tasks) */}
              {step.subItems && step.subItems.length > 0 && (
                <div className="space-y-1.5">
                  {step.subItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 text-xs"
                      style={{
                        color:
                          item.type === 'completed'
                            ? 'rgba(34,197,94,0.7)'
                            : item.type === 'query'
                              ? 'rgba(255,255,255,0.5)'
                              : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      <div className="w-3.5 flex items-center justify-center shrink-0">
                        {item.type === 'query' && (
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                            <SearchIcon />
                          </span>
                        )}
                        {item.type === 'completed' && (
                          <CheckmarkIcon />
                        )}
                        {item.type === 'pending' && (
                          <PendingCircle />
                        )}
                      </div>
                      <span className="leading-snug">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Live thinking text */}
              {step.isThinking && step.liveThinkingText && (
                <div
                  className="text-xs leading-relaxed p-2 rounded border"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderColor: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.35)',
                    maxHeight: '120px',
                    overflowY: 'auto',
                  }}
                >
                  {step.liveThinkingText}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
