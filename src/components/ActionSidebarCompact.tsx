/**
 * ActionSidebarCompact — Manus-style agent instruction panel
 *
 * Layout (top to bottom):
 * 1. Activity header: status indicator + step counter
 * 2. Task progression: collapsible step list with step counter
 * 3. Input bar: message input + 4 circular action buttons
 *
 * Features:
 * - Input always enabled (queue model): new messages queue while a run is active
 * - Runs displayed as collapsible blocks with step-level status dots
 * - Step states: pending (dim dot) | running (spinning ring) | done (green) | error (red)
 * - Minimal "Done" footer on completed runs (no star rating, no suggested prompts)
 * - Document card inside run block when a doc is created (plan/write routes)
 * - DocumentViewer modal for full-screen doc reading
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { routeInstruction } from '../utils/agentRouter';
import { addMemory } from '../utils/memoryStore';
import { addDocument } from '../utils/documentStore';
import type { AgentDocument } from '../utils/documentStore';
import { ollamaService } from '../utils/ollama';
import { getChatModel } from '../utils/modelConfig';
import { DocumentViewer } from './DocumentViewer';
import { ResponseStream } from './ResponseStream';

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
// Route type -> color
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
// Step dot / spinner
// ─────────────────────────────────────────────────────────────

const CSS_SPIN = `
@keyframes _nomad_spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes _nomad_pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
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
    .join(' -- ');

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
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(99,130,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      </div>
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
      <div style={{ flexShrink: 0, color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: -2 }}>...</div>
    </button>
  );
}


// ─────────────────────────────────────────────────────────────
// Run block
// ─────────────────────────────────────────────────────────────

function RunBlock({
  run,
  onDocClick,
}: {
  run: AgentRun;
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
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 10,
        marginBottom: 6,
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
          gap: 8,
          padding: '8px 12px',
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
            fontSize: 11,
            color: 'rgba(255,255,255,0.65)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {run.userMessage.length > 50 ? run.userMessage.slice(0, 50) + '...' : run.userMessage}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {doneSteps}/{totalSteps}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
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
            <div style={{ padding: '0 12px 10px' }}>
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
                    gap: 4,
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: 10, color: 'rgba(52,211,153,0.80)' }}>Done</span>
                </div>
              )}

              {/* Error footer */}
              {run.status === 'error' && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 10, color: 'rgba(239,68,68,0.80)' }}>Task failed</span>
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
  // Auto-show output for response/streaming steps so the user actually sees the answer
  const isResponseStep = /stream|generat|response/i.test(step.label);
  const [showOutput, setShowOutput] = useState(isResponseStep);
  const hasOutput = !!step.output && step.output.trim().length > 0;

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StepDot status={step.status} />
        <button
          onClick={() => hasOutput && setShowOutput(s => !s)}
          style={{
            flex: 1,
            fontSize: 11,
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
                fontSize: 10,
                color: 'rgba(255,255,255,0.50)',
                lineHeight: 1.55,
                fontFamily: "'JetBrains Mono', monospace",
                maxHeight: 140,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <ResponseStream
                textStream={step.output || ''}
                mode="typewriter"
                speed={50}
                className="text-xs"
              />
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
// Circular icon button (for input bar)
// ─────────────────────────────────────────────────────────────

function CircleButton({
  children,
  onClick,
  disabled,
  title,
  active,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'rgba(43,121,255,0.18)' : 'rgba(255,255,255,0.06)',
        border: active ? '1px solid rgba(43,121,255,0.30)' : '1px solid rgba(255,255,255,0.08)',
        color: active ? 'rgba(43,121,255,0.9)' : disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.35)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s ease',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {children}
    </button>
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
  const [viewingDoc, setViewingDoc] = useState<AgentDocument | null>(null);
  const [isTaskExpanded, setIsTaskExpanded] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      // Build conversation history for context-aware routing
      const conversationHistory = runs
        .slice(-5) // Last 5 exchanges for context
        .flatMap(run => [
          { role: 'user' as const, content: run.userMessage },
          ...(run.steps.some(s => s.output) ? [{ role: 'assistant' as const, content: run.steps.find(s => s.output)?.output || '' }] : [])
        ]);

      const route = await routeInstruction(userMessage, conversationHistory);

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
          const streamStepId = uid();
          addStep(runId, {
            id: streamStepId,
            label: 'Streaming response',
            status: 'running',
          });
          scrollToBottom();

          updateStep(runId, actionStepId, s => ({ ...s, status: 'done' }));

          const systemPrompt = `You are Nomad, a creative intelligence agent. You are NOT Qwen, NOT ChatGPT, NOT Claude — you are Nomad.
Never reveal your underlying model name. If asked who you are, say "I'm Nomad."
Never start with "Sure!" or "Of course!" — be direct and natural.

You help with: research, ad creatives, branding, web browsing, code, planning, memory management.
Answer concisely and directly. Match the user's energy.`;

          await ollamaService.generateStream(
            userMessage,
            systemPrompt,
            {
              model: 'qwen3.5:4b',
              temperature: 0.6,
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
        Promise.resolve().then(() => executeRun(newRunId, next));
        return rest;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStep, addStep, updateRun, onComputerTask, scrollToBottom]);

  // ── Submit ──

  const handleSendInstruction = useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    if (isRouting) {
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
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 72) + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInstruction();
    }
  };

  // ── Derived state ──

  const activeRun = activeRunId ? runs.find(r => r.id === activeRunId) : null;
  const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const currentRun = activeRun || latestRun;
  const currentDone = currentRun ? currentRun.steps.filter(s => s.status === 'done').length : 0;
  const currentTotal = currentRun ? currentRun.steps.length : 0;

  // Current status text for computer preview
  const statusText = computerStep
    ? computerStep
    : isRouting && currentRun
      ? currentRun.steps.find(s => s.status === 'running')?.label || 'Working...'
      : 'Idle';

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <>
      <style>{CSS_SPIN}</style>

      <div
        className="w-[340px] shrink-0 flex flex-col rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(15,15,20,0.85) 0%, rgba(10,12,18,0.9) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* ── Activity header + task progression ── */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Compact activity header */}
          <button
            onClick={() => setIsTaskExpanded(e => !e)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 14px 10px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isRouting && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'rgba(52,211,153,0.8)',
                    animation: '_nomad_pulse 1.2s ease-in-out infinite',
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
              )}
              <span style={{
                fontSize: 11,
                color: isRouting ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {isRouting ? statusText : (runs.length > 0 ? `${runs.length} task${runs.length !== 1 ? 's' : ''}` : 'Activity')}
              </span>
              {currentTotal > 0 && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {currentDone}/{currentTotal}
                </span>
              )}
            </div>
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{
                color: 'rgba(255,255,255,0.20)',
                transform: isTaskExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
                flexShrink: 0,
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Task progression (collapsible) */}
          <AnimatePresence>
            {isTaskExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ overflow: 'hidden', flex: 1, minHeight: 0 }}
              >
                <div className="relative flex flex-col" style={{ minHeight: 0, maxHeight: 'calc(100vh - 300px)' }}>
                  {/* Top fade */}
                  <div className="absolute top-0 left-0 right-0 h-3 pointer-events-none z-10"
                    style={{ background: 'linear-gradient(to bottom, rgba(12,14,20,0.8), transparent)' }}
                  />

                  <div className="overflow-y-auto px-3 py-2" ref={scrollRef}>
                    {runs.length === 0 ? (
                      <div className="py-6" />
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
                              onDocClick={setViewingDoc}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    )}
                  </div>

                  {/* Bottom fade */}
                  <div className="absolute bottom-0 left-0 right-0 h-3 pointer-events-none z-10"
                    style={{ background: 'linear-gradient(to top, rgba(12,14,20,0.8), transparent)' }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Input bar ── */}
        <div
          style={{
            padding: '12px 14px 14px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Give Nomad a task..."
            data-role="instruction-input"
            aria-label="Send a message to the Nomad agent"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              fontSize: 12,
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.80)',
              border: '1px solid rgba(255,255,255,0.08)',
              outline: 'none',
              resize: 'none',
              minHeight: 40,
              maxHeight: 72,
              lineHeight: 1.5,
              fontFamily: 'inherit',
              backdropFilter: 'blur(8px)',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          />

          {/* Queue badge */}
          {isRouting && pendingQueue.length > 0 && (
            <div style={{ marginTop: 6, marginBottom: -2 }}>
              <span
                style={{
                  fontSize: 9,
                  color: 'rgba(251,191,36,0.70)',
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.15)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}
              >
                {pendingQueue.length} queued
              </span>
            </div>
          )}

          {/* Button row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            {/* Left buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {/* + (attach/new) */}
              <CircleButton title="Attach or start new task" aria-label="Attach file or start new task">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </CircleButton>

              {/* Search icon */}
              <CircleButton title="Search" aria-label="Search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </CircleButton>
            </div>

            {/* Right buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Mic (placeholder, disabled) */}
              <CircleButton title="Voice input (coming soon)" aria-label="Voice input" disabled>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </CircleButton>

              {/* Send */}
              <CircleButton
                onClick={() => handleSendInstruction()}
                active={!!input.trim()}
                title={isRouting ? 'Queue message' : 'Send message'}
                aria-label="Send message"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </CircleButton>
            </div>
          </div>
        </div>
      </div>

      {/* ── Document viewer modal ── */}
      <DocumentViewer document={viewingDoc} onClose={() => setViewingDoc(null)} />
    </>
  );
}
