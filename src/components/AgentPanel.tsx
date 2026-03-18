/**
 * AgentPanel -- Manus-style autonomous agent UI
 *
 * Clean chat interface with real Ollama streaming, morphing thinking animation,
 * tool chips, and suggestion prompts for ad agency workflows.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ollamaService } from '../utils/ollama';

// ── Types ──────────────────────────────────────────────────────────────────

interface BaseMessage {
  id: string;
  timestamp: number;
}

interface UserMessage extends BaseMessage {
  type: 'user';
  content: string;
}

interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  content: string;
}

interface ToolMessage extends BaseMessage {
  type: 'tool';
  toolName: string;
  args: string;
  result?: string;
  status: 'running' | 'done' | 'error';
}

interface ThinkingMessage extends BaseMessage {
  type: 'thinking';
  content: string;
}

type AgentMessage = UserMessage | AssistantMessage | ToolMessage | ThinkingMessage;

type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'error';

const AGENT_MODEL = 'qwen3:4b';

const SYSTEM_PROMPT =
  'You are Nomad Agent, an autonomous AI assistant for advertising and creative strategy. ' +
  'You help with research, copywriting, creative direction, and campaign optimization. ' +
  'Be concise and actionable. Use markdown formatting for structure when helpful.';

// ── Icons ──────────────────────────────────────────────────────────────────

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A5.5 5.5 0 005 7.5c0 1.3.4 2.4 1.2 3.3L4 13l2.5 1.5L5 17l3 1.5L7 21l5-2 5 2-1-2.5 3-1.5-1.5-2.5L20 13l-2.2-2.2A5.5 5.5 0 009.5 2z" />
    </svg>
  );
}

function toolIcon(name: string) {
  if (name.includes('browser') || name.includes('navigate') || name.includes('screenshot')) return <GlobeIcon />;
  if (name.includes('shell') || name.includes('exec') || name.includes('command')) return <TerminalIcon />;
  if (name.includes('file') || name.includes('read') || name.includes('write') || name.includes('save')) return <FileIcon />;
  if (name.includes('search') || name.includes('scrape') || name.includes('fetch')) return <SearchIcon />;
  return <TerminalIcon />;
}

// ── Manus-style morphing thinking animation ────────────────────────────────

function ThinkingMorph() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-5 h-5 shrink-0"
        style={{
          background: 'linear-gradient(135deg, #4d9aff, #2B79FF, #1a5fd4)',
          boxShadow: '0 0 12px rgba(43,121,255,0.35), 0 0 24px rgba(43,121,255,0.15)',
          animation: 'manusMorph 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        }}
      />
      <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Thinking...
      </span>
      <style>{`
        @keyframes manusMorph {
          0%   { border-radius: 50%; transform: rotate(0deg) scale(1); }
          25%  { border-radius: 22% 50% 50% 22%; transform: rotate(45deg) scale(1.05); }
          50%  { border-radius: 50%; transform: rotate(90deg) scale(1); }
          75%  { border-radius: 50% 22% 22% 50%; transform: rotate(135deg) scale(1.05); }
          100% { border-radius: 50%; transform: rotate(180deg) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Markdown-lite renderer ─────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings
    if (line.startsWith('### ')) {
      result.push(
        <h4 key={i} className="text-[13px] font-semibold mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.8)' }}>
          {inlineFormat(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      result.push(
        <h3 key={i} className="text-[14px] font-semibold mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {inlineFormat(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      result.push(
        <h2 key={i} className="text-[15px] font-bold mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.9)' }}>
          {inlineFormat(line.slice(2))}
        </h2>
      );
    }
    // Bullet points
    else if (line.match(/^[-*] /)) {
      result.push(
        <div key={i} className="flex gap-2 pl-1">
          <span className="shrink-0 mt-[7px] w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.3)' }} />
          <span className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {inlineFormat(line.slice(2))}
          </span>
        </div>
      );
    }
    // Numbered lists
    else if (line.match(/^\d+\.\s/)) {
      const match = line.match(/^(\d+\.)\s(.*)$/);
      if (match) {
        result.push(
          <div key={i} className="flex gap-2 pl-1">
            <span className="shrink-0 text-[12px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{match[1]}</span>
            <span className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {inlineFormat(match[2])}
            </span>
          </div>
        );
      }
    }
    // Empty line
    else if (line.trim() === '') {
      result.push(<div key={i} className="h-2" />);
    }
    // Normal paragraph
    else {
      result.push(
        <p key={i} className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {inlineFormat(line)}
        </p>
      );
    }
  }

  return result;
}

/** Inline formatting: **bold**, `code`, *italic* */
function inlineFormat(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Split on **bold**, `code`, and *italic* patterns
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={match.index} className="text-[12px] font-mono px-1.5 py-0.5 rounded" style={{
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(43,121,255,0.8)',
        }}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} style={{ color: 'rgba(255,255,255,0.55)' }}>
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// ── Tool chip (inline in message list) ──────────────────────────────────────

function ToolChip({ msg, onClick }: { msg: ToolMessage; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 transition-all hover:brightness-125"
      style={{
        borderRadius: 15,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span style={{ color: 'rgba(255,255,255,0.35)' }}>{toolIcon(msg.toolName)}</span>
      <span className="text-[11px] font-mono font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {msg.toolName}
      </span>
      {msg.args && (
        <span className="text-[10px] font-mono max-w-[180px] truncate" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {msg.args}
        </span>
      )}
      {msg.status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(43,121,255,0.6)' }} />
      )}
      {msg.status === 'done' && <CheckIcon />}
    </button>
  );
}

// ── Thinking block (collapsible) ────────────────────────────────────────────

function ThinkingBlock({ msg }: { msg: ThinkingMessage }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pl-9">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 py-1 group"
      >
        <div
          className="w-3.5 h-3.5 shrink-0"
          style={{
            background: 'linear-gradient(135deg, #4d9aff, #2B79FF)',
            opacity: 0.5,
            borderRadius: open ? '22%' : '50%',
            transition: 'border-radius 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
        <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Thought process
        </span>
        <span style={{ color: 'rgba(255,255,255,0.15)' }}><ChevronIcon open={open} /></span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-5 pb-2 pt-1">
              <pre
                className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                {msg.content}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Plan bar (above input) ──────────────────────────────────────────────────

function PlanBar({ task, status }: { task: string; status: AgentStatus }) {
  const isActive = status === 'thinking' || status === 'streaming';

  return (
    <div className="rounded-xl overflow-hidden mb-2" style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div className="flex items-center gap-2 px-3 py-2">
        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: '#2B79FF' }} />
        )}
        <span className="text-[11px] font-medium flex-1 truncate" style={{
          color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
        }}>
          {isActive ? task : 'Idle'}
        </span>
        {isActive && (
          <span className="text-[10px] font-mono shrink-0" style={{ color: 'rgba(43,121,255,0.5)' }}>
            {AGENT_MODEL}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function AgentPanel() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [currentTask, setCurrentTask] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Suppress unused variable warning
  void selectedToolId;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
  }, []);

  const isWorking = status === 'thinking' || status === 'streaming';

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isWorking) return;

    // Add user message
    const userMsg: UserMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    // Reset textarea height after clearing input
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setCurrentTask(text);
    setStatus('thinking');

    // Prepare assistant message
    const assistantId = crypto.randomUUID();
    const thinkingId = crypto.randomUUID();
    let thinkingContent = '';
    let assistantContent = '';
    let hasThinking = false;

    const controller = new AbortController();
    abortRef.current = controller;

    // Build conversation history for context
    const conversationHistory = messages
      .filter((m): m is UserMessage | AssistantMessage => m.type === 'user' || m.type === 'assistant')
      .map((m) => `${m.type === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const prompt = conversationHistory
      ? `${conversationHistory}\n\nUser: ${text}\n\nAssistant:`
      : `User: ${text}\n\nAssistant:`;

    try {
      await ollamaService.generateStream(
        prompt,
        SYSTEM_PROMPT,
        {
          model: AGENT_MODEL,
          temperature: 0.7,
          signal: controller.signal,
          onThink: (chunk: string) => {
            if (!hasThinking) {
              hasThinking = true;
              setMessages((prev) => [...prev, {
                id: thinkingId,
                type: 'thinking' as const,
                content: chunk,
                timestamp: Date.now(),
              }]);
            }
            thinkingContent += chunk;
            setMessages((prev) =>
              prev.map((m) => m.id === thinkingId ? { ...m, content: thinkingContent } : m)
            );
          },
          onChunk: (chunk: string) => {
            // On first content chunk, switch from thinking to streaming
            if (status === 'thinking' || assistantContent === '') {
              setStatus('streaming');
            }
            if (assistantContent === '') {
              // First chunk — add the assistant message
              setMessages((prev) => [...prev, {
                id: assistantId,
                type: 'assistant' as const,
                content: chunk,
                timestamp: Date.now(),
              }]);
            }
            assistantContent += chunk;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: assistantContent } : m)
            );
          },
          onComplete: () => {
            setStatus('idle');
            setCurrentTask('');
            abortRef.current = null;
          },
          onError: (err: Error) => {
            if (err.name === 'AbortError') {
              setStatus('idle');
              setCurrentTask('');
              return;
            }
            setStatus('error');
            const msg = err.message;
            const friendly = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')
              ? 'Cannot reach Ollama — start Wayfarer server on port 8889'
              : msg;
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              type: 'assistant' as const,
              content: `Error: ${friendly}`,
              timestamp: Date.now(),
            }]);
          },
        }
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User aborted — already handled
      } else {
        setStatus('error');
      }
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setCurrentTask('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="h-full flex flex-col" style={{ background: 'transparent', minHeight: 0 }}>
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0 }}
      >
        {/* Empty state — clean centered */}
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 px-5">
              <img src="/icons/agent.png" alt="" width={36} height={36} style={{ opacity: 0.5 }} />
              <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Ask anything
              </p>
            </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full px-5 py-6 flex flex-col gap-3">

          {/* Messages */}
          {messages.map((msg) => {
            switch (msg.type) {
              case 'user':
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] px-4 py-2.5" style={{
                      borderRadius: '16px 16px 4px 16px',
                      background: 'rgba(43,121,255,0.12)',
                      border: '1px solid rgba(43,121,255,0.18)',
                    }}>
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );

              case 'assistant':
                return (
                  <div key={msg.id} className="flex gap-2.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{
                      background: 'linear-gradient(135deg, rgba(43,121,255,0.12), rgba(43,121,255,0.05))',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <BrainIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium block mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Agent
                      </span>
                      <div className="space-y-0.5">
                        {renderMarkdown(msg.content)}
                      </div>
                    </div>
                  </div>
                );

              case 'tool':
                return (
                  <div key={msg.id} className="pl-9">
                    <ToolChip msg={msg} onClick={() => setSelectedToolId(msg.id)} />
                  </div>
                );

              case 'thinking':
                return <ThinkingBlock key={msg.id} msg={msg} />;
            }
          })}

          {/* Thinking indicator (before first content arrives) */}
          {status === 'thinking' && (
            <div className="flex gap-2.5 items-center pl-9">
              <ThinkingMorph />
            </div>
          )}

          <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={scrollToBottom}
            className="absolute left-1/2 -translate-x-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:brightness-125"
            style={{
              bottom: 130,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)',
              backdropFilter: 'blur(12px)',
              zIndex: 10,
            }}
          >
            <ArrowDownIcon />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="px-5 pb-5 pt-2">
        <div className="max-w-3xl mx-auto w-full">
          {/* Plan bar */}
          {(isWorking || currentTask) && (
            <PlanBar task={currentTask} status={status} />
          )}

          {/* Input pill */}
          <div style={{
            borderRadius: 22,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}>
            <div className="flex items-end gap-2 px-4 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the agent anything..."
                rows={1}
                className="flex-1 bg-transparent text-[13px] leading-relaxed resize-none outline-none placeholder:text-white/15"
                style={{
                  color: 'rgba(255,255,255,0.8)',
                  minHeight: 24,
                  maxHeight: 120,
                }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
              {isWorking ? (
                <button
                  onClick={handleStop}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:brightness-125"
                  style={{
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: 'rgba(239,68,68,0.7)',
                  }}
                >
                  <StopIcon />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:brightness-125 disabled:opacity-30"
                  style={{
                    background: input.trim() ? 'rgba(43,121,255,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${input.trim() ? 'rgba(43,121,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    color: input.trim() ? 'rgba(43,121,255,0.8)' : 'rgba(255,255,255,0.2)',
                  }}
                >
                  <ArrowUpIcon />
                </button>
              )}
            </div>
          </div>

          {/* Tool indicators */}
          <div className="flex items-center justify-center gap-4 mt-2">
            {(['Browse', 'Shell', 'Files', 'Think'] as const).map((label) => (
              <span
                key={label}
                className="text-[10px] font-medium"
                style={{ color: 'rgba(255,255,255,0.15)' }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
