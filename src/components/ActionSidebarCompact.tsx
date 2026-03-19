/**
 * ActionSidebarCompact — Manus-style agent instruction panel
 *
 * Features:
 * - Input always enabled (queue model): new messages queue while a run is active
 * - Runs displayed as collapsible blocks with step-level status dots
 * - Step states: pending (dim dot) | running (spinning ring) | done (green) | error (red)
 * - "Task completed" footer with 1-5 star rating
 * - Suggested follow-ups (LLM-generated) as clickable pills
 * - Document card inside run block when a doc is created (plan/write routes)
 * - DocumentViewer modal for full-screen doc reading
 * - MEMORY section (collapsible, always present)
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconFinderReal } from './RealMacOSIcons';
import { routeInstruction } from '../utils/agentRouter';
import { addMemory, deleteMemory, formatMemoryAge, useMemories } from '../utils/memoryStore';
import { addDocument } from '../utils/documentStore';
import type { AgentDocument } from '../utils/documentStore';
import { ollamaService } from '../utils/ollama';
import { getChatModel } from '../utils/modelConfig';
import { DocumentViewer } from './DocumentViewer';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface AgentStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  output?: string;
  subSteps?: { label: string; done: boolean }[];
  isCollapsed?: boolean;
}

interface AgentRun {
  id: string;
  userMessage: string;
  steps: AgentStep[];
  status: 'running' | 'done' | 'error';
  rating?: number;
  suggestions?: string[];
  document?: AgentDocument;
  createdAt: number;
}

interface ActionSidebarCompactProps {
  machineId: string;
  onComputerTask?: (goal: string) => void;
  computerStep?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Route type → color
// ─────────────────────────────────────────────────────────────

const ROUTE_COLORS: Record<string, string> = {
  search:  'rgba(56,189,248,0.80)',
  write:   'rgba(167,139,250,0.80)',
  browse:  'rgba(52,211,153,0.80)',
  memory:  'rgba(251,191,36,0.80)',
  plan:    'rgba(129,140,248,0.80)',
  chat:    'rgba(255,255,255,0.50)',
};

// ─────────────────────────────────────────────────────────────
// Memory type badge colors
// ─────────────────────────────────────────────────────────────

const MEMORY_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  general:  { bg: 'rgba(255,255,255,0.06)',  text: 'rgba(255,255,255,0.40)' },
  user:     { bg: 'rgba(56,189,248,0.10)',   text: 'rgba(56,189,248,0.70)' },
  campaign: { bg: 'rgba(167,139,250,0.10)',  text: 'rgba(167,139,250,0.70)' },
  research: { bg: 'rgba(52,211,153,0.10)',   text: 'rgba(52,211,153,0.70)' },
};

// ─────────────────────────────────────────────────────────────
// Step dot / spinner
// ─────────────────────────────────────────────────────────────

const CSS_SPIN = `
@keyframes _nomad_spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

function StepDot({ status }: { status: AgentStep['status'] }) {
  if (status === 'running') {
    return (
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          border: '1.5px solid rgba(99,155,255,0.15)',
          borderTopColor: 'rgba(99,155,255,0.7)',
          animation: '_nomad_spin 0.8s linear infinite',
          flexShrink: 0,
        }}
      />
    );
  }
  if (status === 'done') {
    return (
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'rgba(52,211,153,0.70)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2 6 5 9 10 3" />
        </svg>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.70)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="3" x2="9" y2="9" />
          <line x1="9" y1="3" x2="3" y2="9" />
        </svg>
      </div>
    );
  }
  // pending
  return (
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.12)',
        flexShrink: 0,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Document card (inline in run block)
// ─────────────────────────────────────────────────────────────

function DocCardInline({
  doc,
  onClick,
}: {
  doc: AgentDocument;
  onClick: () => void;
}) {
  const preview = doc.content
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .slice(0, 2)
    .join(' · ');

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(30,40,80,0.5)',
        border: '1px solid rgba(60,80,180,0.30)',
        cursor: 'pointer',
        marginTop: 8,
      }}
    >
      {/* Icon */}
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(99,130,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(99,130,255,0.90)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {doc.title}
        </div>
        {preview && (
          <div
            style={{
              fontSize: 9,
              color: 'rgba(255,255,255,0.35)',
              marginTop: 3,
              lineHeight: 1.4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            } as React.CSSProperties}
          >
            {preview}
          </div>
        )}
      </div>

      {/* Ellipsis */}
      <div style={{ flexShrink: 0, color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: -2 }}>···</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Star rating
// ─────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value?: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          style={{
            width: 14,
            height: 14,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: (hovered || value || 0) >= n
              ? 'rgba(251,191,36,0.85)'
              : 'rgba(255,255,255,0.18)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Run block
// ─────────────────────────────────────────────────────────────

function RunBlock({
  run,
  onRate,
  onSuggestion,
  onDocClick,
}: {
  run: AgentRun;
  onRate: (runId: string, rating: number) => void;
  onSuggestion: (text: string) => void;
  onDocClick: (doc: AgentDocument) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const doneSteps = run.steps.filter(s => s.status === 'done').length;
  const totalSteps = run.steps.length;
  const routeType = run.steps[1]?.label.toLowerCase().includes('search') ? 'search'
    : run.steps[1]?.label.toLowerCase().includes('plan') ? 'plan'
    : run.steps[1]?.label.toLowerCase().includes('memor') ? 'memory'
    : run.steps[1]?.label.toLowerCase().includes('brows') ? 'browse'
    : run.steps[1]?.label.toLowerCase().includes('writ') ? 'write'
    : 'chat';
  const accentColor = ROUTE_COLORS[routeType] || ROUTE_COLORS.chat;

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      {/* Run header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Status dot indicator */}
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            flexShrink: 0,
            background: run.status === 'done'
              ? 'rgba(52,211,153,0.70)'
              : run.status === 'error'
                ? 'rgba(239,68,68,0.70)'
                : accentColor,
            ...(run.status === 'running' ? { animation: '_nomad_spin 2s linear infinite' } : {}),
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 10,
            color: 'rgba(255,255,255,0.65)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {run.userMessage.length > 40 ? run.userMessage.slice(0, 40) + '…' : run.userMessage}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {doneSteps} / {totalSteps}
        </span>
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            color: 'rgba(255,255,255,0.20)',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Steps */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 10px 10px' }}>
              {run.steps.map(step => (
                <StepRow key={step.id} step={step} />
              ))}

              {/* Document card */}
              {run.document && (
                <DocCardInline doc={run.document} onClick={() => onDocClick(run.document!)} />
              )}

              {/* Task completed footer */}
              {run.status === 'done' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ fontSize: 10, color: 'rgba(52,211,153,0.80)' }}>Task completed</span>
                  </div>
                  <StarRating
                    value={run.rating}
                    onChange={v => onRate(run.id, v)}
                  />
                </div>
              )}

              {/* Error footer */}
              {run.status === 'error' && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 10, color: 'rgba(239,68,68,0.80)' }}>× Task failed</span>
                </div>
              )}

              {/* Suggestions */}
              {run.status === 'done' && run.suggestions && run.suggestions.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {run.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => onSuggestion(s)}
                      style={{
                        fontSize: 9,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.50)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step row
// ─────────────────────────────────────────────────────────────

function StepRow({ step }: { step: AgentStep }) {
  const [showOutput, setShowOutput] = useState(false);
  const hasOutput = !!step.output && step.output.trim().length > 0;

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StepDot status={step.status} />
        <button
          onClick={() => hasOutput && setShowOutput(s => !s)}
          style={{
            flex: 1,
            fontSize: 10,
            color: step.status === 'running'
              ? 'rgba(255,255,255,0.80)'
              : step.status === 'done'
                ? 'rgba(255,255,255,0.55)'
                : step.status === 'error'
                  ? 'rgba(239,68,68,0.80)'
                  : 'rgba(255,255,255,0.28)',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: hasOutput ? 'pointer' : 'default',
            padding: 0,
          }}
        >
          {step.label}
          {hasOutput && (
            <span style={{ marginLeft: 4, color: 'rgba(255,255,255,0.20)', fontSize: 8 }}>
              {showOutput ? '▲' : '▼'}
            </span>
          )}
        </button>
      </div>

      {/* Output (expanded) */}
      <AnimatePresence>
        {showOutput && hasOutput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                marginTop: 4,
                marginLeft: 16,
                padding: '6px 8px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                fontSize: 9,
                color: 'rgba(255,255,255,0.50)',
                lineHeight: 1.55,
                fontFamily: "'JetBrains Mono', monospace",
                maxHeight: 120,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {step.output}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sub-steps */}
      {step.subSteps && step.subSteps.length > 0 && (
        <div style={{ marginLeft: 16, marginTop: 4 }}>
          {step.subSteps.map((ss, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <div style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: ss.done ? 'rgba(52,211,153,0.60)' : 'rgba(255,255,255,0.15)',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{ss.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ID generator
// ─────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function ActionSidebarCompact({ machineId: _machineId, onComputerTask, computerStep }: ActionSidebarCompactProps) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [input, setInput] = useState('');
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<AgentDocument | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const memories = useMemories();
  const recentMemories = memories.slice(0, 3);

  // ── Run mutation helpers ──

  const updateRun = useCallback((runId: string, updater: (r: AgentRun) => AgentRun) => {
    setRuns(prev => prev.map(r => r.id === runId ? updater(r) : r));
  }, []);

  const updateStep = useCallback((runId: string, stepId: string, updater: (s: AgentStep) => AgentStep) => {
    setRuns(prev => prev.map(r => {
      if (r.id !== runId) return r;
      return { ...r, steps: r.steps.map(s => s.id === stepId ? updater(s) : s) };
    }));
  }, []);

  const addStep = useCallback((runId: string, step: AgentStep) => {
    setRuns(prev => prev.map(r => {
      if (r.id !== runId) return r;
      return { ...r, steps: [...r.steps, step] };
    }));
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 20);
  }, []);

  // ── Generate suggestions ──

  const generateSuggestions = useCallback(async (
    userMessage: string,
    response: string,
    signal: AbortSignal
  ): Promise<string[]> => {
    try {
      let raw = '';
      await ollamaService.generateStream(
        `Based on: '${userMessage}' and response: '${response.slice(0, 200)}', suggest 3 short follow-up questions as JSON array of strings. Max 8 words each. Output only JSON array, no other text.`,
        'You output only valid JSON arrays of strings. No markdown, no explanation.',
        {
          model: getChatModel(),
          temperature: 0.7,
          num_predict: 80,
          signal,
          onChunk: (c) => { raw += c; },
        }
      );
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed.slice(0, 3).map(String) : [];
    } catch {
      return [];
    }
  }, []);

  // ── Execute a run ──

  const executeRun = useCallback(async (runId: string, userMessage: string) => {
    setIsRouting(true);
    setActiveRunId(runId);

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    // Step 1: Routing
    const routeStepId = uid();
    setRuns(prev => prev.map(r => {
      if (r.id !== runId) return r;
      return {
        ...r,
        steps: [{
          id: routeStepId,
          label: 'Routing instruction',
          status: 'running',
        }],
      };
    }));
    scrollToBottom();

    try {
      const route = await routeInstruction(userMessage);

      updateStep(runId, routeStepId, s => ({
        ...s,
        status: 'done',
        output: `Route: ${route.type}`,
      }));

      let responseText = '';

      // Step 2: Route-specific
      const actionStepId = uid();
      const actionLabel = route.type === 'search' ? 'Searching the web'
        : route.type === 'write' ? 'Writing document'
        : route.type === 'browse' ? 'Browsing page'
        : route.type === 'memory' ? 'Saving to memory'
        : route.type === 'plan' ? 'Building plan'
        : 'Generating response';

      addStep(runId, {
        id: actionStepId,
        label: actionLabel,
        status: 'running',
      });
      scrollToBottom();

      switch (route.type) {
        case 'memory': {
          addMemory('general', userMessage);
          updateStep(runId, actionStepId, s => ({ ...s, status: 'done', output: 'Saved to memory.' }));
          responseText = 'Saved to memory.';
          break;
        }

        case 'search': {
          updateStep(runId, actionStepId, s => ({
            ...s,
            status: 'done',
            output: `Search routed — connect Wayfarer to execute.\nQuery: ${userMessage}`,
          }));
          responseText = `Searching: ${userMessage}`;
          break;
        }

        case 'browse': {
          if (onComputerTask) {
            updateStep(runId, actionStepId, s => ({
              ...s,
              status: 'running',
              output: `Launching computer agent for: ${userMessage}`,
            }));
            onComputerTask(userMessage);
            updateStep(runId, actionStepId, s => ({
              ...s,
              status: 'done',
              output: 'Computer agent started.',
            }));
          } else {
            updateStep(runId, actionStepId, s => ({
              ...s,
              status: 'done',
              output: 'Browse routed — open Chrome from dock to navigate.',
            }));
          }
          responseText = `Navigating: ${userMessage}`;
          break;
        }

        case 'write':
        case 'plan': {
          // Step 3: Streaming response
          const streamStepId = uid();
          addStep(runId, {
            id: streamStepId,
            label: route.type === 'plan' ? 'Streaming plan' : 'Writing content',
            status: 'running',
          });
          scrollToBottom();

          updateStep(runId, actionStepId, s => ({ ...s, status: 'done' }));

          const isWrite = route.type === 'write';
          const prompt = isWrite
            ? `Write a detailed, well-structured document about: ${userMessage}`
            : `Create a concise numbered action plan for: ${userMessage}`;
          const systemPrompt = isWrite
            ? 'You are a skilled writer. Produce clear, well-structured content with ## headings.'
            : 'You are a strategic planning assistant. Output a clear numbered plan with ## headings.';

          await ollamaService.generateStream(
            prompt,
            systemPrompt,
            {
              model: getChatModel(),
              temperature: 0.6,
              num_predict: 500,
              signal: abort.signal,
              onChunk: (chunk) => {
                responseText += chunk;
                updateStep(runId, streamStepId, s => ({ ...s, output: responseText }));
                scrollToBottom();
              },
            }
          );

          updateStep(runId, streamStepId, s => ({ ...s, status: 'done' }));

          // Save as document if long enough
          if (responseText.length > 200) {
            const firstLine = responseText.split('\n').find(l => l.trim()) || userMessage;
            const title = firstLine.replace(/^#+\s*/, '').trim().slice(0, 60) || userMessage.slice(0, 60);
            const docType = route.type === 'plan' ? 'plan' : 'doc';
            const savedDoc = addDocument({ title, content: responseText, type: docType });
            updateRun(runId, r => ({ ...r, document: savedDoc }));
          }
          break;
        }

        case 'chat':
        default: {
          // Step 3: Streaming response
          const streamStepId = uid();
          addStep(runId, {
            id: streamStepId,
            label: 'Streaming response',
            status: 'running',
          });
          scrollToBottom();

          updateStep(runId, actionStepId, s => ({ ...s, status: 'done' }));

          await ollamaService.generateStream(
            userMessage,
            'You are a helpful AI agent assistant in a marketing creative system called Nomad. Answer concisely.',
            {
              model: getChatModel(),
              temperature: 0.7,
              num_predict: 512,
              signal: abort.signal,
              onChunk: (chunk) => {
                responseText += chunk;
                updateStep(runId, streamStepId, s => ({ ...s, output: responseText }));
                scrollToBottom();
              },
            }
          );

          updateStep(runId, streamStepId, s => ({ ...s, status: 'done' }));
          break;
        }
      }

      // Mark run done
      updateRun(runId, r => ({ ...r, status: 'done' }));

      // Generate suggestions for chat/plan routes
      if (route.type === 'chat' || route.type === 'plan') {
        const suggestions = await generateSuggestions(userMessage, responseText, abort.signal);
        updateRun(runId, r => ({ ...r, suggestions }));
      }

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        updateRun(runId, r => ({ ...r, status: 'error' }));
      } else {
        updateRun(runId, r => ({ ...r, status: 'error' }));
        console.error('[ActionSidebar] Run error:', err);
      }
    } finally {
      setIsRouting(false);
      setActiveRunId(null);
      scrollToBottom();

      // Process pending queue
      setPendingQueue(prev => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        const newRunId = uid();
        const newRun: AgentRun = {
          id: newRunId,
          userMessage: next,
          steps: [],
          status: 'running',
          createdAt: Date.now(),
        };
        setRuns(r => [...r, newRun]);
        // Kick off in microtask so state settles
        Promise.resolve().then(() => executeRun(newRunId, next));
        return rest;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStep, addStep, updateRun, generateSuggestions, onComputerTask, scrollToBottom]);

  // ── Submit ──

  const handleSendInstruction = useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    if (isRouting) {
      // Queue it
      setPendingQueue(prev => [...prev, text]);
      return;
    }

    const runId = uid();
    const newRun: AgentRun = {
      id: runId,
      userMessage: text,
      steps: [],
      status: 'running',
      createdAt: Date.now(),
    };

    setRuns(prev => [...prev, newRun]);
    scrollToBottom();
    executeRun(runId, text);
  }, [input, isRouting, executeRun, scrollToBottom]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 60) + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInstruction();
    }
  };

  const handleRate = useCallback((runId: string, rating: number) => {
    updateRun(runId, r => ({ ...r, rating }));
    // Persist rating as a memory signal
    const run = runs.find(r => r.id === runId);
    if (run) {
      addMemory('general', `Rating ${rating}/5 for: "${run.userMessage.slice(0, 80)}"`, ['rating', 'feedback']);
    }
  }, [updateRun, runs]);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Inject spin keyframes once */}
      <style>{CSS_SPIN}</style>

      <div
        className="w-[242px] shrink-0 flex flex-col rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(15,15,20,0.85) 0%, rgba(10,12,18,0.9) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* ── Header ── */}
        <div className="px-3.5 py-2.5 border-b border-white/[0.08] flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-white/[0.55] uppercase tracking-widest shrink-0">Agent Log</span>
          {computerStep ? (
            <span className="flex items-center gap-1 min-w-0">
              <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: 'rgba(52,211,153,0.8)', animation: 'pulse 1.2s ease-in-out infinite' }} />
              <span className="text-[10px] text-emerald-400/70 truncate">{computerStep}</span>
            </span>
          ) : isRouting ? (
            <span className="text-[10px] text-white/[0.30] animate-pulse shrink-0">working...</span>
          ) : null}
        </div>

        {/* ── Run list (scrollable) ── */}
        <div className="flex-1 relative min-h-0 overflow-hidden flex flex-col">
          {/* Top blur */}
          <div className="absolute top-0 left-0 right-0 h-4 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to bottom, rgba(12,12,18,0.95), transparent)' }}
          />

          <div className="flex-1 overflow-y-auto px-2.5 py-2.5" ref={scrollRef}>
            {runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-8">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/[0.12]">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span className="text-[10px] text-white/[0.15]">No activity yet</span>
              </div>
            ) : (
              <AnimatePresence>
                {runs.map(run => (
                  <motion.div
                    key={run.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    <RunBlock
                      run={run}
                      onRate={handleRate}
                      onSuggestion={text => handleSendInstruction(text)}
                      onDocClick={setViewingDoc}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Bottom blur */}
          <div className="absolute bottom-0 left-0 right-0 h-4 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to top, rgba(12,12,18,0.95), transparent)' }}
          />
        </div>

        {/* ── Memory section ── */}
        <div className="border-t border-white/[0.08]">
          <button
            onClick={() => setIsMemoryOpen(prev => !prev)}
            className="w-full px-3.5 py-2 flex items-center justify-between transition-colors hover:bg-white/[0.03]"
          >
            <span className="text-[10px] font-semibold text-white/[0.30] uppercase tracking-widest">Memory</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-white/[0.20]">{memories.length}</span>
              <svg
                width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className="text-white/[0.25] transition-transform"
                style={{ transform: isMemoryOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>

          <AnimatePresence>
            {isMemoryOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-2.5 pb-2 space-y-1">
                  {recentMemories.length === 0 ? (
                    <div className="text-center py-3 text-[9px] text-white/[0.20]">No memories yet</div>
                  ) : (
                    recentMemories.map(mem => {
                      const isExpanded = expandedMemoryId === mem.id;
                      const colors = MEMORY_TYPE_COLORS[mem.type] || MEMORY_TYPE_COLORS.general;
                      return (
                        <div
                          key={mem.id}
                          className="rounded-md px-2 py-1.5 cursor-pointer group/mem transition-colors"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                          onClick={() => setExpandedMemoryId(isExpanded ? null : mem.id)}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="shrink-0 text-[8px] font-semibold rounded px-1 py-0.5 uppercase tracking-wide"
                                style={{ background: colors.bg, color: colors.text }}
                              >
                                {mem.type}
                              </span>
                              <span className="text-[9px] text-white/[0.20] shrink-0">
                                {formatMemoryAge(mem.createdAt)}
                              </span>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); deleteMemory(mem.id); }}
                              className="shrink-0 opacity-0 group-hover/mem:opacity-100 transition-opacity text-white/[0.30] hover:text-white/[0.60]"
                              title="Delete memory"
                            >
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                          <div
                            className="mt-1 text-[9px] text-white/[0.45] leading-snug"
                            style={{
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: isExpanded ? 999 : 2,
                              WebkitBoxOrient: 'vertical',
                            } as React.CSSProperties}
                          >
                            {mem.content}
                          </div>
                          {mem.tags.length > 0 && isExpanded && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {mem.tags.map(tag => (
                                <span key={tag} className="text-[8px] px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)' }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Instruction input ── */}
        <div className="px-3 py-3 border-t border-white/[0.08] flex flex-col gap-1.5">
          <div className="text-[10px] text-white/[0.30] select-none">
            Give the AI an instruction
          </div>
          <div className="flex items-end gap-1.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Search for collagen supplement reviews..."
              className="flex-1 px-2.5 py-2 rounded-lg text-[11px] bg-white/[0.04] text-white/[0.80] placeholder-white/[0.20] border border-white/[0.08] focus:border-white/[0.15] focus:outline-none focus:bg-white/[0.06] resize-none transition-all"
              style={{
                minHeight: '32px',
                maxHeight: '60px',
                backdropFilter: 'blur(8px)',
              }}
              data-role="instruction-input"
              aria-label="Instruction input — type a command for the AI agent"
            />
            <div className="flex flex-col items-end gap-1">
              {/* Queue badge */}
              {isRouting && pendingQueue.length > 0 && (
                <span
                  style={{
                    fontSize: 8,
                    color: 'rgba(251,191,36,0.70)',
                    background: 'rgba(251,191,36,0.08)',
                    border: '1px solid rgba(251,191,36,0.15)',
                    borderRadius: 4,
                    padding: '1px 5px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pendingQueue.length} queued
                </span>
              )}
              <button
                onClick={() => handleSendInstruction()}
                disabled={!input.trim()}
                data-role="send-button"
                aria-label="Send instruction to AI agent"
                title={isRouting ? 'Queue message' : 'Send instruction'}
                className="shrink-0 flex items-center justify-center rounded-lg transition-all"
                style={{
                  width: 32,
                  height: 32,
                  background: input.trim()
                    ? isRouting
                      ? 'rgba(251,191,36,0.12)'
                      : 'rgba(43,121,255,0.18)'
                    : 'rgba(255,255,255,0.04)',
                  border: input.trim()
                    ? isRouting
                      ? '1px solid rgba(251,191,36,0.25)'
                      : '1px solid rgba(43,121,255,0.30)'
                    : '1px solid rgba(255,255,255,0.07)',
                  color: input.trim()
                    ? isRouting
                      ? 'rgba(251,191,36,0.80)'
                      : 'rgba(43,121,255,0.9)'
                    : 'rgba(255,255,255,0.20)',
                  cursor: input.trim() ? 'pointer' : 'default',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {isRouting ? (
                  /* Queue icon when routing */
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="text-[10px] text-white/[0.20]">
            {isRouting
              ? 'Agent is working — message will be queued'
              : input.trim()
                ? 'Enter to send · Shift+Enter for newline'
                : 'Shift+Enter for newline'}
          </div>
        </div>
      </div>

      {/* ── Document viewer modal ── */}
      <DocumentViewer document={viewingDoc} onClose={() => setViewingDoc(null)} />
    </>
  );
}
