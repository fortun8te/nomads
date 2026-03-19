/**
 * AgentUIWrapper.tsx — Manus Lite wrapper for Agent UI
 *
 * Clean, polished agent interface with:
 * - Header: Icon + "manus | Lite" branding + task description
 * - Collapsible steps with clean typography
 * - Live thinking output (expandable)
 * - Status indicator at bottom
 * - Dark theme with proper spacing
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentStep } from './AgentStep';
import type { StepConfig } from './AgentStep';

// Re-export for convenience
export type { StepConfig };

interface AgentUIWrapperProps {
  taskDescription: string;
  steps: StepConfig[];
  isThinking: boolean;
  liveThinkingOutput?: string;
  onStepToggle?: (stepId: string, expanded: boolean) => void;
}

function ManusIcon() {
  return (
    <div
      className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
      style={{
        background: 'linear-gradient(135deg, #2B79FF, #4d9aff)',
        color: 'white',
      }}
    >
      m
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <motion.div
      className="w-2 h-2 rounded-full"
      style={{ background: 'white' }}
      animate={{
        scale: [0.8, 1.2, 0.8],
        opacity: [0.6, 1, 0.6],
      }}
      transition={{
        duration: 1.2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

export function AgentUIWrapper({
  taskDescription,
  steps,
  isThinking,
  liveThinkingOutput = '',
  onStepToggle,
}: AgentUIWrapperProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: '#0a0a0e',
        color: 'rgba(255,255,255,0.7)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-4 border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.01)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <ManusIcon />
          <span className="text-sm font-semibold">manus | Lite</span>
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          {taskDescription}
        </p>
      </div>

      {/* Steps Container */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}
      >
        <div className="space-y-1">
          {steps.map((step) => (
            <AgentStep
              key={step.id}
              step={step}
              onStatusChange={onStepToggle}
            />
          ))}
        </div>
      </div>

      {/* Bottom Status / Thinking Output */}
      <div
        className="border-t"
        style={{
          borderColor: 'rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.01)',
        }}
      >
        {/* Thinking Toggle Button */}
        <button
          onClick={() => setThinkingExpanded(!thinkingExpanded)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
        >
          <ThinkingIndicator />
          <span
            className="text-xs font-medium flex-1"
            style={{
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            {isThinking ? 'Thinking...' : 'Completed'}
          </span>
          <motion.svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: 'rgba(255,255,255,0.2)',
            }}
            animate={{
              rotate: thinkingExpanded ? 180 : 0,
            }}
            transition={{ duration: 0.15 }}
          >
            <polyline points="6 9 12 15 18 9" />
          </motion.svg>
        </button>

        {/* Thinking Output (Collapsible) */}
        <AnimatePresence>
          {thinkingExpanded && liveThinkingOutput && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-t"
              style={{
                borderColor: 'rgba(255,255,255,0.04)',
              }}
            >
              <div
                className="px-4 py-3 text-xs leading-relaxed overflow-y-auto"
                style={{
                  maxHeight: '200px',
                  color: 'rgba(255,255,255,0.35)',
                  fontFamily: 'monospace',
                  background: 'rgba(255,255,255,0.01)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {liveThinkingOutput}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
