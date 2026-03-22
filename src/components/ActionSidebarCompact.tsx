/**
 * ActionSidebarCompact -- Manus-style chat-first agent panel.
 * The chat IS the primary interface. Computer views appear as inline cards.
 * Layout: chat messages (user right, agent left), collapsible task blocks,
 * inline ComputerCard thumbnails, "will continue after reply" notifications.
 */

import { useState, useRef, useCallback, useEffect, useLayoutEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { detectFastRoute } from '../utils/routeExecutor';
import { desktopBus } from '../utils/desktopBus';
import type { AskUserRequest } from '../utils/computerAgent/orchestrator';
import type { AgentDocument } from '../utils/documentStore';
import { ollamaService } from '../utils/ollama';
import { DocumentViewer } from './DocumentViewer';
import { ResponseStream } from './ResponseStream';
import { INFRASTRUCTURE } from '../config/infrastructure';
import { vfs, generateSessionId, getSessionSuffix } from '../utils/sessionFileSystem';
import { runMassResearch } from '../utils/massResearch';
import { loadSkills, formatSkillsForPrompt } from '../utils/skillLoader';
import type { ResearchProgressEvent } from '../utils/massResearch';
import { neuroMemory } from '../utils/neuroMemory';
import { calculateBudget, compactMessages, getContextWindow } from '../utils/tokenCounter';

// ── Types ──

interface ActionLogEntry { iter: number; desc: string; type: string; ts: number }

interface AgentStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  output?: string;
  subSteps?: { label: string; done: boolean }[];
  hidden?: boolean;
  clarificationQuestion?: string;
  reasoning?: string;
  timedOut?: boolean;
  verifying?: boolean;
  latestScreenshot?: string;
  actionLog?: ActionLogEntry[];
  screenState?: string;
  iterProgress?: { iter: number; maxIter: number };
}

interface AgentRun {
  id: string;
  userMessage: string;
  steps: AgentStep[];
  status: 'running' | 'done' | 'error';
  document?: AgentDocument;
  createdAt: number;
  finalAnswer?: string;
  errorDetail?: string;
}

export interface AgentState {
  phase: 'idle' | 'planning' | 'executing' | 'verifying' | 'asking' | 'done' | 'error';
  message: string;
  stepIndex?: number;
  totalSteps?: number;
  plan?: Array<{ instruction: string; highStakes: boolean }>;
  steps: Array<{ instruction: string; highStakes?: boolean; status: 'pending' | 'running' | 'done' | 'failed'; result?: string }>;
}

/** A single entry in the chat feed -- user bubble, agent text, task block, computer card, or ask */
type ChatEntry =
  | { type: 'user'; id: string; text: string; ts: number }
  | { type: 'agent'; id: string; text: string; ts: number }
  | { type: 'task'; id: string; runId: string; ts: number }
  | { type: 'computer'; id: string; runId: string; screenshot?: string; status: string; ts: number }
  | { type: 'continue'; id: string; ts: number }
  | { type: 'ask'; id: string; question: string; options: string[]; answered?: string; ts: number };

interface ActionSidebarCompactProps {
  machineId: string;
  onComputerTask?: (goal: string) => void;
  agentState?: AgentState;
  onExpandComputer?: () => void;
}

// ── Helpers ──

function uid(): string { return Math.random().toString(36).slice(2, 9); }

function combinedSignal(userSignal: AbortSignal, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  const onAbort = () => { ctrl.abort(userSignal.reason); clearTimeout(timer); };
  if (userSignal.aborted) { ctrl.abort(userSignal.reason); clearTimeout(timer); }
  else userSignal.addEventListener('abort', onAbort, { once: true });
  return { signal: ctrl.signal, cleanup: () => { clearTimeout(timer); userSignal.removeEventListener('abort', onAbort); } };
}

// ── Neuro system prompt -- single LLM call decides tool + generates response ──

const NEURO_SYSTEM = `You are Neuro, a helpful AI assistant with access to tools.

When responding, ALWAYS start your response with a tool tag on the first line, then your message:

[TOOL:none]
Just a normal chat response here.

[TOOL:webfetch|query=current weather amsterdam]
Let me look that up for you.

[TOOL:research|query=vitamin C supplement competitors 2026]
I'll do a deep dive across multiple sources for you.

[TOOL:computer|goal=go to github.com and star the first trending repo]
I'll handle that in the browser for you.

[TOOL:ask|question=What would you like me to fix?|options=The form layout,The search bug,The login error]
I'm not sure what you mean. Let me clarify:

TOOL SELECTION RULES:
- none: for greetings, opinions, jokes, general knowledge you already know, advice, creative writing, explanations
- webfetch: for simple factual lookups that need current data (weather, time, prices, news, definitions, "what is X", "who is X", quick facts)
- research: for deep analysis needing 10+ sources (market research, competitor analysis, comprehensive reviews, "research X", "deep dive into X")
- computer: for anything requiring website INTERACTION (clicking buttons, filling forms, logging in, downloading files, scrolling through content, navigating multi-page flows, solving captchas, visiting specific URLs)
- ask: ONLY when genuinely confused or a decision matters -- ask user for clarification with 2-4 specific options

ASK TOOL RULES:
- Use ONLY when genuinely confused or a decision matters
- Include 2-4 specific options based on context
- Last option can be open-ended ("Something else")
- Do NOT ask for permission on every action
- Do NOT ask obvious questions
- If you can reasonably guess, just do it and mention your assumption

Always pick the LIGHTEST tool that can do the job. Don't use computer for a simple lookup. Don't use research for a quick fact.

TONE: Be natural and chill but not try-hard. Short responses. No exclamation spam. No "yo!!" or "let's get this rolling!!" energy. No roleplay actions like *sighs* or *searches*. No forced slang. If the user is casual, be casual back. If they're direct, be direct. Just be helpful without performing enthusiasm. Like a smart friend who helps without making it weird.
Use Celsius and metric. Never make up data. Say "I'm Neuro" if asked who you are.`;

function parseToolDecision(response: string): { tool: string; param: string; message: string; question?: string; options?: string[] } {
  const match = response.match(/^\[TOOL:(\w+)(?:\|(.+?))?\]\n?([\s\S]*)/);
  if (match) {
    const tool = match[1];
    const paramStr = match[2] || '';
    const message = (match[3] || '').trim();

    // Handle ask tool: [TOOL:ask|question=...|options=a,b,c]
    if (tool === 'ask') {
      const questionMatch = paramStr.match(/question=([^|]+)/);
      const optionsMatch = paramStr.match(/options=(.+)/);
      return {
        tool: 'ask',
        param: '',
        question: questionMatch?.[1]?.trim() || 'What would you like?',
        options: optionsMatch?.[1]?.split(',').map(o => o.trim()).filter(Boolean) || [],
        message,
      };
    }

    // Standard tools: extract first key=value pair
    const kvMatch = paramStr.match(/(\w+)=(.+)/);
    return {
      tool,
      param: kvMatch?.[2] || '',
      message,
    };
  }
  return { tool: 'none', param: '', message: response.trim() };
}

/** Fast-path: pure greetings under 4 words skip LLM entirely */
function isGreeting(msg: string): boolean {
  const t = msg.trim().toLowerCase();
  if (t.split(/\s+/).length > 4) return false;
  return /^(h(i|ey|ello|owdy|ola)|yo|sup|what'?s?\s*up|gm|good\s*(morning|evening|afternoon|night)|hey\s*there|hi\s*there|greetings|salut)[!?.]*$/i.test(t);
}

const GREETING_REPLIES = [
  'hey, what do you need?',
  'what\'s up',
  'hey. what can I help with?',
  'sup, what do you need?',
  'hey, go ahead',
];

const ROUTE_COLORS: Record<string, string> = {
  search: 'rgba(56,189,248,0.80)', write: 'rgba(167,139,250,0.80)', browse: 'rgba(52,211,153,0.80)',
  memory: 'rgba(251,191,36,0.80)', plan: 'rgba(129,140,248,0.80)', research: 'rgba(244,114,182,0.80)',
  chat: 'rgba(255,255,255,0.50)', desktop: 'rgba(129,140,248,0.80)',
};

// ── Small UI atoms ──

function ThinkingDots() {
  const dot: React.CSSProperties = {
    width: 4, height: 4, borderRadius: '50%', background: 'rgba(99,155,255,0.70)',
    display: 'inline-block', animationDuration: '1.2s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite',
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 2 }}>
      <span style={{ ...dot, animationName: '_nomad_dot1' }} />
      <span style={{ ...dot, animationName: '_nomad_dot2' }} />
      <span style={{ ...dot, animationName: '_nomad_dot3' }} />
    </span>
  );
}

function StepDot({ status, timedOut }: { status: AgentStep['status']; timedOut?: boolean }) {
  if (status === 'running')
    return <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(99,155,255,0.15)', borderTopColor: 'rgba(99,155,255,0.7)', animation: '_nomad_spin 0.8s linear infinite', flexShrink: 0 }} />;
  if (status === 'done') {
    const bg = timedOut ? 'rgba(251,191,36,0.70)' : 'rgba(52,211,153,0.70)';
    return (
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>
      </div>
    );
  }
  if (status === 'error')
    return (
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(239,68,68,0.70)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>
      </div>
    );
  return <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />;
}

function CircleButton({ children, onClick, disabled, title, active, 'aria-label': ariaLabel }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; active?: boolean; 'aria-label'?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel} style={{
      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? 'rgba(43,121,255,0.18)' : 'rgba(255,255,255,0.06)',
      border: active ? '1px solid rgba(43,121,255,0.30)' : '1px solid rgba(255,255,255,0.08)',
      color: active ? 'rgba(43,121,255,0.9)' : disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.35)',
      cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s ease', flexShrink: 0, padding: 0,
    }}>{children}</button>
  );
}

// ── Chat-specific UI atoms ──

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0' }}>
      <div style={{
        maxWidth: '85%', padding: '8px 12px', borderRadius: '12px 12px 2px 12px',
        background: 'rgba(43,121,255,0.18)', border: '1px solid rgba(43,121,255,0.22)',
        fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5,
        wordBreak: 'break-word', whiteSpace: 'pre-wrap',
      }}>{text}</div>
    </div>
  );
}

function AgentText({ text }: { text: string }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <img src="/neuro-icon-40.png" alt="" style={{ width: 18, height: 18, minWidth: 18, minHeight: 18, borderRadius: '50%', opacity: 0.75, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)' }}>neuro</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.20)' }}>
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.70)', lineHeight: 1.55,
        wordBreak: 'break-word', whiteSpace: 'pre-wrap', paddingLeft: 24,
      }}>{text}</div>
    </div>
  );
}

function ContinueNotice() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: '6px 12px', margin: '6px 0',
      background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
      borderRadius: 8,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(251,191,36,0.70)', animation: '_nomad_pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.75)', fontWeight: 500 }}>Will continue working after your reply</span>
    </div>
  );
}

// SearchIndicator removed -- replaced by ToolIndicator in Manus-style rendering

function AskUserInline({ question, options, answered, onAnswer }: {
  question: string;
  options: string[];
  answered?: string;
  onAnswer: (answer: string) => void;
}) {
  const [customInput, setCustomInput] = useState('');
  const isAnswered = !!answered;

  return (
    <div style={{
      background: 'rgba(59,130,246,0.08)',
      border: '1px solid rgba(59,130,246,0.2)',
      borderRadius: 12,
      padding: 14,
      marginTop: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 10 }}>
        {question}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map((opt, i) => {
          const isSelected = isAnswered && answered === opt;
          const isDimmed = isAnswered && !isSelected;
          return (
            <button
              key={i}
              onClick={() => { if (!isAnswered) onAnswer(opt); }}
              disabled={isAnswered}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 12,
                background: isSelected ? 'rgba(59,130,246,0.20)' : 'rgba(255,255,255,0.05)',
                border: isSelected ? '1px solid rgba(59,130,246,0.40)' : '1px solid rgba(255,255,255,0.08)',
                color: isDimmed ? 'rgba(255,255,255,0.25)' : isSelected ? 'rgba(59,130,246,0.95)' : 'rgba(255,255,255,0.7)',
                cursor: isAnswered ? 'default' : 'pointer', textAlign: 'left',
                transition: 'background 0.15s',
                fontWeight: isSelected ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={(e) => { if (!isAnswered) e.currentTarget.style.background = 'rgba(59,130,246,0.15)'; }}
              onMouseLeave={(e) => { if (!isAnswered) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              <span>{i + 1}. {opt}</span>
              {isSelected && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="rgba(59,130,246,0.95)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 'auto' }}><polyline points="2 6 5 9 10 3" /></svg>
              )}
            </button>
          );
        })}
        {!isAnswered && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && customInput.trim()) onAnswer(customInput.trim()); }}
              placeholder="Or type something..."
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 12,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.7)', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={() => { if (customInput.trim()) onAnswer(customInput.trim()); }} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11,
              background: 'rgba(59,130,246,0.3)', border: 'none',
              color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'inherit',
            }}>Send</button>
          </div>
        )}
        {isAnswered && !options.includes(answered!) && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 12,
            background: 'rgba(59,130,246,0.20)',
            border: '1px solid rgba(59,130,246,0.40)',
            color: 'rgba(59,130,246,0.95)',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>{answered}</span>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="rgba(59,130,246,0.95)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 'auto' }}><polyline points="2 6 5 9 10 3" /></svg>
          </div>
        )}
      </div>
    </div>
  );
}

function ManusStatusIcon({ status, size = 14 }: { status: 'pending' | 'running' | 'done' | 'error' | 'failed'; size?: number }) {
  const iconSize = Math.round(size * 0.6);
  if (status === 'done') return (
    <span style={{ fontSize: size, color: 'rgba(34,197,94,0.90)', lineHeight: 1, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>
    </span>
  );
  if (status === 'running') return (
    <span style={{ width: size, height: size, borderRadius: '50%', border: '2px solid rgba(251,146,60,0.20)', borderTopColor: 'rgba(251,146,60,0.85)', animation: '_nomad_spin 0.8s linear infinite', display: 'inline-flex', flexShrink: 0 }} />
  );
  if (status === 'error' || status === 'failed') return (
    <span style={{ fontSize: size, color: 'rgba(239,68,68,0.90)', lineHeight: 1, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>
    </span>
  );
  // pending
  return (
    <span style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ width: size - 4, height: size - 4, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.18)' }} />
    </span>
  );
}

/** Icon picker for Manus-style tool pills */
function toolPillIcon(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('search') || l.includes('webfetch') || l.includes('fetching') || l.includes('searxng')) return '\u{1F50D}';
  if (l.includes('read') || l.includes('brows') || l.includes('page') || l.includes('scraping')) return '\u{1F4D6}';
  if (l.includes('writ') || l.includes('creat') || l.includes('generat') || l.includes('compos') || l.includes('synthes')) return '\u270F\uFE0F';
  if (l.includes('computer') || l.includes('browser') || l.includes('using')) return '\u{1F5A5}\uFE0F';
  if (l.includes('knowledge') || l.includes('memory') || l.includes('recall')) return '\u26A1';
  if (l.includes('think') || l.includes('routing') || l.includes('classif')) return '\u{1F914}';
  if (l.includes('summariz')) return '\u{1F4DD}';
  if (l.includes('research')) return '\u{1F52C}';
  return '\u2699\uFE0F';
}

/** Manus-style tool action pill -- gray rounded badge with icon */
function SubStepPill({ label, status }: { label: string; status: 'pending' | 'running' | 'done' | 'error' | 'failed' }) {
  const icon = toolPillIcon(label);
  const isActive = status === 'running';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.06)',
      fontSize: 13, color: isActive ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.55)',
      marginBottom: 6,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <span>{label}</span>
      {isActive && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: '_nomad_pulse 1.5s infinite', flexShrink: 0, marginLeft: 2 }} />
      )}
    </div>
  );
}

/** Manus-style status indicator -- animated blue dot + label */
function ToolIndicator({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 0', marginBottom: 4,
      color: 'rgba(255,255,255,0.4)', fontSize: 13,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', animation: '_nomad_pulse 1.5s infinite', flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  );
}

/** Agent commentary text between pills -- Manus style */
function AgentCommentary({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '8px 0' }}>
      {text}
    </p>
  );
}

/** Knowledge recalled -- expandable section with count badge */
function KnowledgeRecalled({ count, items }: { count: number; items?: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (count === 0) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <button onClick={() => setExpanded(e => !e)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 20,
        background: 'rgba(255,255,255,0.06)', border: 'none',
        color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer',
      }}>
        <span>{'\u26A1'}</span>
        <span>Knowledge recalled({count})</span>
        <span style={{ fontSize: 10 }}>{expanded ? '\u2227' : '\u2228'}</span>
      </button>
      {expanded && items && items.length > 0 && (
        <div style={{ paddingLeft: 16, paddingTop: 4 }}>
          {items.map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 2 }}>
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline computer card -- Manus-style with pills */
function ComputerCard({ screenshot, status, steps, onExpand }: {
  screenshot?: string;
  status: string;
  steps: Array<{ label: string; status: 'pending' | 'running' | 'done' | 'error' | 'failed' }>;
  currentStep: number;
  onExpand?: () => void;
}) {
  return (
    <div style={{ padding: '4px 0' }}>
      {screenshot && (
        <div onClick={onExpand} style={{
          width: 120, height: 75, borderRadius: 8, overflow: 'hidden', background: '#111',
          cursor: onExpand ? 'pointer' : 'default', marginBottom: 6,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <img src={`data:image/jpeg;base64,${screenshot}`} alt="Computer view" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      {status === 'Using Browser' && <ToolIndicator label="Using Browser" />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {steps.map((s, i) => (
          <SubStepPill key={i} label={s.label} status={s.status} />
        ))}
      </div>
    </div>
  );
}

/** Manus-style task block -- green checkmark header, collapsible pills + commentary */
function ManusTaskBlock({ run, onDocClick, onExpandComputer }: { run: AgentRun; onDocClick: (doc: AgentDocument) => void; onExpandComputer?: () => void }) {
  const [expanded, setExpanded] = useState(run.status === 'running');
  const visibleSteps = run.steps.filter(s => !s.hidden);
  const runningStep = visibleSteps.find(s => s.status === 'running');
  const latestScreenshot = [...run.steps].reverse().find(s => s.latestScreenshot)?.latestScreenshot;
  const isComputerTask = run.steps.some(s => s.id.startsWith('agent_step_'));
  const isDone = run.status === 'done';
  const isError = run.status === 'error';

  // Derive the header label -- use the user message as the task description (Manus style)
  const taskDescription = run.userMessage.length > 60 ? run.userMessage.slice(0, 60) + '...' : run.userMessage;

  useEffect(() => { if (run.status === 'running') setExpanded(true); }, [run.status]);

  // Determine tool indicator for running state
  const toolLabel = runningStep?.label === 'Searching...' ? 'Searching the web'
    : runningStep?.label === 'Using Computer' || runningStep?.label?.toLowerCase().includes('brows') ? 'Using Browser'
    : runningStep?.label?.startsWith('Generating search') ? 'Deep research'
    : runningStep?.label?.startsWith('Fetching') ? 'Fetching pages'
    : runningStep?.label?.startsWith('Summariz') ? 'Summarizing findings'
    : runningStep?.label?.startsWith('Synthesiz') ? 'Synthesizing findings'
    : null;

  // Count knowledge items (steps with output that are done)
  const knowledgeSteps = visibleSteps.filter(s => s.status === 'done' && s.output);

  return (
    <div style={{ margin: '4px 0' }}>
      {/* Collapsible header row -- Manus style: green check / spinner + task + chevron */}
      <div onClick={() => setExpanded(e => !e)} style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 0',
      }}>
        {/* Status icon */}
        {isDone ? (
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <circle cx="9" cy="9" r="9" fill="#22c55e" />
            <path d="M5 9l3 3 5-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        ) : isError ? (
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <circle cx="9" cy="9" r="9" fill="rgba(239,68,68,0.85)" />
            <line x1="6" y1="6" x2="12" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="6" x2="6" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(59,130,246,0.5)', borderTopColor: 'rgba(59,130,246,0.9)', animation: '_nomad_spin 0.8s linear infinite', flexShrink: 0 }} />
        )}
        {/* Task description */}
        <span style={{ flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
          {taskDescription}
        </span>
        {/* Chevron */}
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          {expanded ? '\u2227' : '\u2228'}
        </span>
      </div>

      {/* Expanded: knowledge recalled + tool pills + commentary */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
            <div style={{ paddingLeft: 26, paddingBottom: 8 }}>
              {/* Knowledge recalled section */}
              {knowledgeSteps.length > 0 && (
                <KnowledgeRecalled
                  count={knowledgeSteps.length}
                  items={knowledgeSteps.map(s => s.output!.slice(0, 120))}
                />
              )}

              {/* Tool indicator for active state */}
              {run.status === 'running' && toolLabel && (
                <ToolIndicator label={toolLabel} />
              )}

              {/* Sub-step pills + commentary */}
              {visibleSteps.map((step) => {
                const isAgent = step.id.startsWith('agent_step_');
                return (
                  <div key={step.id} style={{ marginBottom: 4 }}>
                    <SubStepPill label={step.label} status={step.status} />

                    {/* Commentary: reasoning or output snippet */}
                    {step.status === 'running' && step.reasoning && (
                      <AgentCommentary text={step.reasoning.slice(0, 120) + (step.reasoning.length > 120 ? '...' : '')} />
                    )}
                    {step.status === 'running' && step.output && (
                      <AgentCommentary text={step.output.slice(0, 120) + (step.output.length > 120 ? '...' : '')} />
                    )}
                    {step.status === 'done' && step.output && !isAgent && (
                      <AgentCommentary text={step.output.slice(0, 120) + (step.output.length > 120 ? '...' : '')} />
                    )}

                    {/* Action log for agent steps (inline) */}
                    {isAgent && step.actionLog && step.actionLog.length > 0 && (
                      <div style={{ paddingLeft: 8, marginTop: 2, marginBottom: 4 }}>
                        {step.actionLog.slice(-5).map((entry, i) => (
                          <div key={`${entry.ts}_${i}`} style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ color: 'rgba(255,255,255,0.18)', marginRight: 4 }}>{'\u2192'}</span>{entry.desc}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Screenshot thumbnail for agent steps */}
                    {isAgent && step.latestScreenshot && (
                      <div style={{ marginTop: 4, marginBottom: 4 }}>
                        <img src={`data:image/jpeg;base64,${step.latestScreenshot}`} alt="Agent view" style={{
                          width: 100, height: 62, objectFit: 'cover', borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.10)', display: 'block', cursor: 'pointer',
                        }} onClick={onExpandComputer} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Computer card (compact, screenshot only) */}
              {isComputerTask && latestScreenshot && !visibleSteps.some(s => s.latestScreenshot) && (
                <div style={{ marginTop: 4 }}>
                  <img src={`data:image/jpeg;base64,${latestScreenshot}`} alt="Computer view" onClick={onExpandComputer} style={{
                    width: 100, height: 62, objectFit: 'cover', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.10)', display: 'block', cursor: onExpandComputer ? 'pointer' : 'default',
                  }} />
                </div>
              )}

              {/* Document card */}
              {run.document && (
                <button onClick={() => onDocClick(run.document!)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 8, background: 'rgba(30,40,80,0.4)',
                  border: '1px solid rgba(60,80,180,0.25)', cursor: 'pointer', marginTop: 6,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(99,130,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(99,130,255,0.90)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{run.document.title}</div>
                  </div>
                </button>
              )}

              {/* Error footer */}
              {run.status === 'error' && run.errorDetail && (
                <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(239,68,68,0.75)', lineHeight: 1.45 }}>
                  Something went wrong: {run.errorDetail}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── StepRow ──

const StepRow = memo(function StepRow({ step, defaultExpanded }: { step: AgentStep; defaultExpanded?: boolean }) {
  const isResponseStep = /stream|generat|response/i.test(step.label);
  const [showOutput, setShowOutput] = useState(isResponseStep);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [showActionLog, setShowActionLog] = useState(defaultExpanded ?? step.status === 'running');
  const hasOutput = !!step.output?.trim();
  const isAgentStep = step.id.startsWith('agent_step_');
  const hasActionLog = isAgentStep && (step.actionLog?.length ?? 0) > 0;
  const hasScreenshot = isAgentStep && !!step.latestScreenshot;

  useEffect(() => { if (step.status === 'running') setShowActionLog(true); }, [step.status]);

  const Chevron = ({ expanded }: { expanded: boolean }) => (
    <span style={{ fontSize: 10, color: 'rgba(156,163,175,0.50)', display: 'inline-block', transition: 'transform 0.15s ease', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0, lineHeight: 1 }}>&#9656;</span>
  );

  // Clarification card
  if (step.clarificationQuestion) {
    return (
      <div style={{ marginBottom: 6, padding: '8px 10px', borderRadius: 7, border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: 10, color: 'rgba(147,197,253,0.90)', lineHeight: 1.5 }}>{step.clarificationQuestion}</span>
        </div>
        {step.status === 'done' && step.output && <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.55)', paddingLeft: 16, lineHeight: 1.5 }}>{step.output}</div>}
        {step.status !== 'done' && <div style={{ marginTop: 5, paddingLeft: 16, fontSize: 9, color: 'rgba(147,197,253,0.50)', fontStyle: 'italic' }}>Waiting for your answer...</div>}
      </div>
    );
  }

  const statusColor = step.status === 'running' ? 'rgba(255,255,255,0.80)' : step.status === 'done' ? (step.timedOut ? 'rgba(251,191,36,0.65)' : 'rgba(255,255,255,0.55)') : step.status === 'error' ? 'rgba(239,68,68,0.80)' : 'rgba(255,255,255,0.28)';

  return (
    <div style={{ marginBottom: 6, borderLeft: (showOutput || showActionLog || showScreenshot) ? '2px solid rgba(59,130,246,0.30)' : '2px solid transparent', paddingLeft: 10, transition: 'border-color 0.15s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StepDot status={step.status} timedOut={step.timedOut} />
        <button onClick={() => hasOutput && setShowOutput(s => !s)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: statusColor, textAlign: 'left', background: 'none', border: 'none', cursor: hasOutput ? 'pointer' : 'default', padding: 0 }}>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.label}</span>
          {step.iterProgress && step.status === 'running' && (
            <span style={{ fontSize: 9, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'rgba(99,155,255,0.90)', background: 'rgba(99,155,255,0.12)', border: '1px solid rgba(99,155,255,0.25)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
              {step.iterProgress.iter}/{step.iterProgress.maxIter}
            </span>
          )}
          {hasOutput && <Chevron expanded={showOutput} />}
        </button>
      </div>

      {/* Screen state */}
      {isAgentStep && step.screenState && step.status === 'running' && (
        <div style={{ marginLeft: 12, marginTop: 3, fontSize: 10, color: 'rgba(156,163,175,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: 'rgba(99,155,255,0.60)', marginRight: 4 }}>screen:</span>
          {step.screenState.slice(0, 80)}{step.screenState.length > 80 ? '...' : ''}
        </div>
      )}

      {/* Screenshot */}
      {hasScreenshot && (
        <div style={{ marginLeft: 12, marginTop: 4 }}>
          <button onClick={() => setShowScreenshot(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, color: showScreenshot ? 'rgba(156,163,175,0.65)' : 'rgba(156,163,175,0.40)' }}>
            <Chevron expanded={showScreenshot} /><span style={{ fontSize: 9 }}>screenshot</span>
          </button>
          <AnimatePresence>
            {showScreenshot && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                <img src={`data:image/jpeg;base64,${step.latestScreenshot}`} alt="Agent view" style={{ marginTop: 4, marginLeft: 12, width: 80, height: 50, objectFit: 'cover', borderRadius: 5, border: '1px solid rgba(255,255,255,0.10)', display: 'block', cursor: 'pointer' }}
                  onClick={(e) => { const img = e.currentTarget; if (img.style.width === '80px' || !img.style.width) { img.style.width = '100%'; img.style.maxWidth = '280px'; img.style.height = 'auto'; } else { img.style.width = '80px'; img.style.maxWidth = ''; img.style.height = '50px'; } }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Action log */}
      {hasActionLog && (
        <div style={{ marginLeft: 12, marginTop: 3 }}>
          <button onClick={() => setShowActionLog(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, color: showActionLog ? 'rgba(156,163,175,0.65)' : 'rgba(156,163,175,0.40)' }}>
            <Chevron expanded={showActionLog} /><span style={{ fontSize: 9 }}>{step.actionLog!.length} actions</span>
          </button>
          {showActionLog && (
            <div style={{ marginLeft: 12, marginTop: 2 }}>
              {(step.actionLog ?? []).map((entry, i) => (
                <div key={`${entry.ts}_${i}`} style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: entry.type === 'verify' ? (entry.desc.includes('OK') ? 'rgba(52,211,153,0.70)' : 'rgba(251,191,36,0.60)') : 'rgba(156,163,175,0.55)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ color: 'rgba(255,255,255,0.18)', marginRight: 3 }}>-&gt;</span>{entry.desc}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reasoning / verifying */}
      {step.status === 'running' && step.reasoning && !isAgentStep && (
        <div style={{ marginLeft: 12, marginTop: 2, fontSize: 11, color: 'rgba(156,163,175,0.75)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {`Checking: ${step.reasoning.slice(0, 80)}${step.reasoning.length > 80 ? '...' : ''}`}
        </div>
      )}
      {step.status === 'running' && step.verifying && (
        <div style={{ marginLeft: 12, marginTop: 2, fontSize: 10, color: 'rgba(156,163,175,0.50)', fontStyle: 'italic' }}>Verifying...</div>
      )}

      {/* Output */}
      <AnimatePresence>
        {showOutput && hasOutput && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }} style={{ overflow: 'hidden' }}>
            <div style={{ marginTop: 4, marginLeft: 12, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', fontSize: 10, color: 'rgba(255,255,255,0.50)', lineHeight: 1.55, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              <ResponseStream textStream={step.output || ''} mode="typewriter" speed={50} className="text-xs" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sub-steps */}
      {step.subSteps && step.subSteps.length > 0 && (
        <div style={{ marginLeft: 12, marginTop: 4 }}>
          {step.subSteps.map((ss, i) => (
            <div key={`${ss.label}_${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: ss.done ? 'rgba(52,211,153,0.60)' : 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{ss.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ── RunBlock ──

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-ignore
function _RunBlock({ run, onDocClick, isLatest }: { run: AgentRun; onDocClick: (doc: AgentDocument) => void; isLatest?: boolean }) {
  const [collapsed, setCollapsed] = useState(!isLatest && run.status !== 'running');
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(() => new Set());

  const doneSteps = run.steps.filter(s => s.status === 'done').length;
  const visibleSteps = run.steps.filter(s => !s.hidden);
  const lastVisibleIndex = visibleSteps.length - 1;
  const accentColor = ROUTE_COLORS[
    run.steps[1]?.label.toLowerCase().includes('search') ? 'search'
    : run.steps[1]?.label.toLowerCase().includes('brows') ? 'browse'
    : run.steps[1]?.label.toLowerCase().includes('writ') ? 'write'
    : 'chat'
  ];

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 4, overflow: 'hidden' }}>
      {/* Header */}
      <button onClick={() => setCollapsed(c => !c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: run.status === 'done' ? 'rgba(52,211,153,0.70)' : run.status === 'error' ? 'rgba(239,68,68,0.70)' : accentColor, ...(run.status === 'running' ? { animation: '_nomad_spin 2s linear infinite' } : {}) }} />
        <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {run.userMessage.length > 50 ? run.userMessage.slice(0, 50) + '...' : run.userMessage}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{doneSteps}/{run.steps.length}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.20)', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Steps */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 10px 8px' }}>
              {visibleSteps.map((step, idx) => {
                const isStepDone = step.status === 'done' || step.status === 'error';
                const isLast = idx === lastVisibleIndex;
                const isCollapsed = collapsedSteps.has(step.id);

                if (isStepDone && !isLast && step.id.startsWith('agent_step_')) {
                  return (
                    <div key={step.id}>
                      <button onClick={() => setCollapsedSteps(prev => { const n = new Set(prev); if (n.has(step.id)) n.delete(step.id); else n.add(step.id); return n; })} style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textAlign: 'left' }}>
                        <span style={{ fontSize: 10, color: 'rgba(156,163,175,0.50)', display: 'inline-block', transition: 'transform 0.15s ease', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', flexShrink: 0, lineHeight: 1 }}>&#9656;</span>
                        <StepDot status={step.status} timedOut={step.timedOut} />
                        <span style={{ flex: 1, fontSize: 10, color: step.timedOut ? 'rgba(251,191,36,0.50)' : 'rgba(255,255,255,0.40)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.label}</span>
                        {step.actionLog && step.actionLog.length > 0 && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)', flexShrink: 0 }}>{step.actionLog.length} actions</span>}
                      </button>
                      {!isCollapsed && <StepRow step={step} defaultExpanded={false} />}
                    </div>
                  );
                }
                return <div key={step.id}><StepRow step={step} defaultExpanded={isLast || step.status === 'running'} /></div>;
              })}

              {/* Document card */}
              {run.document && (
                <button onClick={() => onDocClick(run.document!)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, background: 'rgba(30,40,80,0.5)', border: '1px solid rgba(60,80,180,0.30)', cursor: 'pointer', marginTop: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(99,130,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(99,130,255,0.90)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{run.document.title}</div>
                  </div>
                </button>
              )}

              {/* Done footer */}
              {run.status === 'done' && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  {run.finalAnswer ? (
                    <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 8, padding: '8px 10px', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        <span style={{ fontSize: 9, color: 'rgba(52,211,153,0.70)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Answer</span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.82)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto' }}>{run.finalAnswer}</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      <span style={{ fontSize: 10, color: 'rgba(52,211,153,0.80)' }}>Done</span>
                    </div>
                  )}
                </div>
              )}

              {/* Error footer */}
              {run.status === 'error' && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  {run.errorDetail ? (
                    <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="rgba(239,68,68,0.80)" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>
                        <span style={{ fontSize: 9, color: 'rgba(239,68,68,0.70)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Error</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{run.errorDetail}</div>
                    </div>
                  ) : <span style={{ fontSize: 10, color: 'rgba(239,68,68,0.80)' }}>Task failed</span>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ──

export function ActionSidebarCompact({ machineId: _machineId, onComputerTask, agentState: _agentState, onExpandComputer }: ActionSidebarCompactProps) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const isRoutingRef = useRef(false);
  const [input, setInput] = useState('');
  const [viewingDoc, setViewingDoc] = useState<AgentDocument | null>(null);
  // (removed unused state)
  const [_iterCount, setIterCount] = useState<{ iter: number; maxIter: number; stepIndex: number } | null>(null);
  const [askUserRequest, setAskUserRequest] = useState<AskUserRequest | null>(null);
  const askUserResolveRef = useRef<((r: import('../utils/computerAgent/orchestrator').AskUserResponse) => void) | null>(null);
  const [clarifyStepId, setClarifyStepId] = useState<string | null>(null);
  const prevAskUserRef = useRef<AskUserRequest | null>(null);
  const neuroAskResolveRef = useRef<((answer: string) => void) | null>(null);
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [sessionSavedFlash, setSessionSavedFlash] = useState(false);
  const [computerId, setComputerId] = useState(() => generateSessionId());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userScrolledRef = useRef(false);
  const stepTimeoutMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const userLocationRef = useRef<string | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runLongRunning, setRunLongRunning] = useState(false);

  // Long-running task detection
  useEffect(() => {
    if (!runStartedAt) { setRunLongRunning(false); return; }
    const elapsed = Date.now() - runStartedAt;
    if (elapsed >= 30_000) { setRunLongRunning(true); return; }
    const timer = setTimeout(() => setRunLongRunning(true), 30_000 - elapsed);
    return () => clearTimeout(timer);
  }, [runStartedAt]);

  // Init neuro memory on mount
  useEffect(() => { neuroMemory.init().catch(() => { /* non-fatal */ }); }, []);

  // Cleanup on unmount
  useEffect(() => () => { abortRef.current?.abort(); stepTimeoutMapRef.current.forEach(h => clearTimeout(h)); stepTimeoutMapRef.current.clear(); }, []);

  // ── desktopBus listener ──
  useEffect(() => {
    return desktopBus.subscribe(ev => {
      switch (ev.type) {
        case 'agent_iteration':
          setIterCount({ iter: ev.iteration, maxIter: ev.maxIterations ?? 0, stepIndex: 0 });
          setRuns(prev => prev.map(run => {
            if (run.status !== 'running') return run;
            const runningStep = run.steps.find(s => s.status === 'running');
            if (!runningStep) return run;
            return { ...run, steps: run.steps.map(s => s.id === runningStep.id ? { ...s, reasoning: `Attempt ${ev.iteration}/${ev.maxIterations ?? '?'}`, iterProgress: { iter: ev.iteration, maxIter: ev.maxIterations ?? 0 } } : s) };
          }));
          break;
        case 'agent_plan':
          setRuns(prev => prev.map(run => {
            if (run.status !== 'running') return run;
            const newSteps: AgentStep[] = ev.steps.map((s, i) => ({ id: `agent_step_${Date.now()}_${i}`, label: s.instruction, status: 'pending' as const }));
            return { ...run, steps: [...run.steps, ...newSteps] };
          }));
          break;
        case 'agent_step_start':
          setRuns(prev => prev.map(run => {
            if (run.status !== 'running') return run;
            const target = run.steps.filter(s => s.id.startsWith('agent_step_'))[ev.stepIndex];
            if (!target) return run;
            return { ...run, steps: run.steps.map(s => s.id === target.id ? { ...s, status: 'running' as const, reasoning: ev.reasoning, verifying: false } : s) };
          }));
          break;
        case 'agent_step_done':
          setIterCount(null);
          setRuns(prev => prev.map(run => {
            if (run.status !== 'running') return run;
            const target = run.steps.filter(s => s.id.startsWith('agent_step_'))[ev.stepIndex];
            if (!target) return run;
            return { ...run, steps: run.steps.map(s => s.id === target.id ? { ...s, status: ev.success ? 'done' as const : 'error' as const, output: ev.result, reasoning: undefined, verifying: false } : s) };
          }));
          break;
        case 'agent_step_verify':
          setRuns(prev => prev.map(run => {
            if (run.status !== 'running') return run;
            return { ...run, steps: run.steps.map(s => s.status === 'running' ? { ...s, verifying: true } : s) };
          }));
          break;
        case 'ask_user': {
          const askRequest: AskUserRequest = {
            id: `ask_${Date.now()}`,
            question: ev.question,
            context: '',
            options: [],
            allowCustom: true,
            isClarification: ev.isClarification,
          };
          setAskUserRequest(askRequest);
          askUserResolveRef.current = ev.resolve ? (r) => ev.resolve!(r.value) : null;
          if (ev.isClarification) {
            setActiveRunId(activeId => {
              if (activeId) {
                const stepId = `clarify_${Date.now()}`;
                setClarifyStepId(stepId);
                setRuns(prev => prev.map(r => r.id !== activeId ? r : { ...r, steps: [...r.steps, { id: stepId, label: ev.question, status: 'running' as const, clarificationQuestion: ev.question }] }));
              }
              return activeId;
            });
          }
          break;
        }
        case 'agent_screenshot':
          setRuns(prev => prev.map(run => {
            if (run.status !== 'running') return run;
            const rs = run.steps.find(s => s.id.startsWith('agent_step_') && s.status === 'running');
            if (!rs) return run;
            return { ...run, steps: run.steps.map(s => s.id === rs.id ? { ...s, latestScreenshot: ev.screenshot } : s) };
          }));
          break;
        case 'agent_action_desc':
          setRuns(prev => prev.map(run => {
            if (run.status !== 'running') return run;
            const rs = run.steps.find(s => s.id.startsWith('agent_step_') && s.status === 'running');
            if (!rs) return run;
            const entry: ActionLogEntry = { iter: ev.iteration, desc: ev.description, type: ev.actionType, ts: Date.now() };
            return { ...run, steps: run.steps.map(s => s.id === rs.id ? { ...s, actionLog: [...(s.actionLog ?? []), entry], ...(ev.screenState ? { screenState: ev.screenState } : {}) } : s) };
          }));
          break;
      }
    });
  }, []);

  // Mark clarification done when modal closes
  useEffect(() => {
    const prev = prevAskUserRef.current;
    prevAskUserRef.current = askUserRequest;
    if (prev?.isClarification && !askUserRequest && clarifyStepId) {
      setRuns(r => r.map(run => ({ ...run, steps: run.steps.map(s => s.id === clarifyStepId ? { ...s, status: 'done' as const, output: 'Got it, proceeding...' } : s) })));
      setClarifyStepId(null);
    }
  }, [askUserRequest, clarifyStepId]);

  // ── Run mutation helpers ──
  const MAX_RUNS = 30;
  const pruneRuns = useCallback((allRuns: AgentRun[]): AgentRun[] => {
    if (allRuns.length <= MAX_RUNS) return allRuns;
    const running = allRuns.filter(r => r.status === 'running');
    const finished = allRuns.filter(r => r.status !== 'running');
    return [...running, ...finished.slice(-(MAX_RUNS - running.length))].sort((a, b) => a.createdAt - b.createdAt);
  }, []);

  const updateRun = useCallback((runId: string, updater: (r: AgentRun) => AgentRun) => {
    setRuns(prev => prev.map(r => r.id === runId ? updater(r) : r));
  }, []);

  const updateStep = useCallback((runId: string, stepId: string, updater: (s: AgentStep) => AgentStep) => {
    setRuns(prev => prev.map(r => {
      if (r.id !== runId) return r;
      return { ...r, steps: r.steps.map(s => {
        if (s.id !== stepId) return s;
        const updated = updater(s);
        if (s.status === 'running' && updated.status !== 'running') {
          const h = stepTimeoutMapRef.current.get(stepId);
          if (h) { clearTimeout(h); stepTimeoutMapRef.current.delete(stepId); }
        }
        return updated;
      }) };
    }));
  }, []);

  const addStep = useCallback((runId: string, step: AgentStep) => {
    setRuns(prev => prev.map(r => r.id !== runId ? r : { ...r, steps: [...r.steps, step] }));
    if (step.status === 'running') {
      const existing = stepTimeoutMapRef.current.get(step.id);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        stepTimeoutMapRef.current.delete(step.id);
        setRuns(prev => prev.map(r => r.id !== runId ? r : { ...r, steps: r.steps.map(s => s.id === step.id && s.status === 'running' ? { ...s, status: 'done' as const, timedOut: true, output: 'Step timed out after 2 minutes.' } : s) }));
      }, 120_000);
      stepTimeoutMapRef.current.set(step.id, handle);
    }
  }, []);

  // ── Scroll helpers ──
  const scrollToBottomNow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    userScrolledRef.current = false;
    setShowNewActivity(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => { if (!userScrolledRef.current) scrollToBottomNow(); else setShowNewActivity(true); }, 20);
  }, [scrollToBottomNow]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => { userScrolledRef.current = el.scrollHeight - el.scrollTop - el.clientHeight >= 8; if (!userScrolledRef.current) setShowNewActivity(false); };
    const onWheel = () => { userScrolledRef.current = true; };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', onWheel, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('wheel', onWheel); el.removeEventListener('touchmove', onWheel); };
  }, []);

  // ── Helper: wait for agent done/error via desktopBus ──
  const waitForAgent = useCallback((runId: string, actionStepId: string, abort: AbortController, timeoutMs = 300_000): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const cleanup = () => { settled = true; unsub(); clearTimeout(timer); abort.signal.removeEventListener('abort', onAbort); };
      const unsub = desktopBus.subscribe(busEv => {
        if (settled) return;
        if (busEv.type === 'agent_status' && (busEv.phase === 'done' || busEv.phase === 'error')) {
          const ok = busEv.phase === 'done';
          updateStep(runId, actionStepId, s => ({ ...s, status: ok ? 'done' : 'error', output: ok ? busEv.message : `Error: ${busEv.message}` }));
          if (ok) updateRun(runId, r => ({ ...r, finalAnswer: busEv.message }));
          else updateRun(runId, r => ({ ...r, errorDetail: busEv.message }));
          cleanup();
          resolve(ok ? busEv.message : `Error: ${busEv.message}`);
        }
      });
      const timer = setTimeout(() => { if (!settled) { cleanup(); reject(new DOMException('Agent timed out', 'TimeoutError')); } }, timeoutMs);
      const onAbort = () => { if (!settled) { cleanup(); reject(abort.signal.reason ?? new DOMException('Aborted', 'AbortError')); } };
      if (abort.signal.aborted) { cleanup(); reject(new DOMException('Aborted', 'AbortError')); return; }
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });
  }, [updateStep, updateRun]);

  // ── Execute a run ──
  const executeRun = useCallback(async (runId: string, userMessage: string) => {
    isRoutingRef.current = true;
    setIsRouting(true);
    setActiveRunId(runId);
    setRunStartedAt(Date.now());
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const thinkStepId = uid();
    setRuns(prev => prev.map(r => r.id !== runId ? r : { ...r, steps: [{ id: thinkStepId, label: 'Thinking', status: 'running', hidden: true }] }));
    scrollToBottom();

    try {
      let responseText = '';

      // ── Fast path: pure greeting under 4 words ──
      if (isGreeting(userMessage)) {
        const reply = GREETING_REPLIES[Math.floor(Math.random() * GREETING_REPLIES.length)];
        updateStep(runId, thinkStepId, s => ({ ...s, status: 'done', output: 'Greeting' }));
        responseText = reply;
        // Done -- no tool needed
      }
      // ── Fast path: detectFastRoute for URLs / desktop commands ──
      else if (detectFastRoute(userMessage) === 'browse' || detectFastRoute(userMessage) === 'desktop') {
        const fastRoute = detectFastRoute(userMessage)!;
        updateStep(runId, thinkStepId, s => ({ ...s, status: 'done', output: `Fast route: ${fastRoute}` }));

        if (fastRoute === 'desktop') {
          const lower = userMessage.toLowerCase();
          const openMatch = lower.match(/(?:open|launch)\s+(chrome|finder|terminal)/);
          const closeMatch = lower.match(/close\s+(chrome|finder|terminal)/);
          if (openMatch) {
            desktopBus.emit({ type: 'open_window', app: openMatch[1] as 'chrome' | 'finder' | 'terminal' });
            responseText = `Opened ${openMatch[1]}`;
          } else if (closeMatch) {
            desktopBus.emit({ type: 'close_window', app: closeMatch[1] as 'chrome' | 'finder' | 'terminal' });
            responseText = `Closed ${closeMatch[1]}`;
          } else {
            const actionStepId = uid();
            addStep(runId, { id: actionStepId, label: 'Using Computer', status: 'running' });
            scrollToBottom();
            desktopBus.emit({ type: 'run_goal', goal: userMessage });
            responseText = await waitForAgent(runId, actionStepId, abort);
          }
        } else {
          // browse
          const actionStepId = uid();
          addStep(runId, { id: actionStepId, label: 'Browsing page', status: 'running' });
          scrollToBottom();
          desktopBus.emit({ type: 'open_window', app: 'chrome' });
          const goal = `The user asked: "${userMessage}". Open the browser, navigate to the requested page, and complete whatever they asked. If they just want to visit a site, navigate there, confirm it loaded, and describe what you see.`;
          setTimeout(() => desktopBus.emit({ type: 'run_goal', goal }), 800);
          responseText = await waitForAgent(runId, actionStepId, abort);
        }
      }
      // ── Main path: sequential tool loop (OpenClaw pattern) ──
      // 1. Classifier determines tool needed
      // 2. If none -> generate chat response directly, done
      // 3. If tool needed -> run tool FIRST -> call LLM with results -> loop if LLM wants more
      else {
        // Step 0: Get user location if needed and not yet known
        if (!userLocationRef.current && /weather|near me|nearby|local|around here|my area|in my city/i.test(userMessage)) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            // Reverse geocode with a simple fetch
            try {
              const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`).then(r => r.json());
              userLocationRef.current = geoRes.address?.city || geoRes.address?.town || geoRes.address?.village || `${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`;
            } catch {
              userLocationRef.current = `${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`;
            }
          } catch { /* user denied or timeout — proceed without location */ }
        }

        // Step 1: Fast tool classification (qwen3.5:2b, ~10 tokens, <1s)
        // Uses SKILL.md definitions -- add a new skill file to extend, no code changes needed.
        const skills = loadSkills();
        const skillNames = skills.map((s) => s.name);
        const skillsList = formatSkillsForPrompt(skills);

        let toolClass = 'none';
        let toolParam = '';
        const { signal: cs, cleanup: cc } = combinedSignal(abort.signal, 8_000);
        try {
          let classResult = '';
          await ollamaService.generateStream(
            `Available tools:\n${skillsList}\n\nUser message: "${userMessage}"${userLocationRef.current ? `\nUser location: ${userLocationRef.current}` : ''}\n\nClassify what tool is needed. Reply with ONLY one line:\nnone\n${skillNames.map((n) => `${n}: <param>`).join('\n')}\nask: <question>\n\nExamples:\n"yo" -> none\n"whats the weather" -> webfetch: weather ${userLocationRef.current || 'current location'}\n"research competitors" -> research: competitor analysis\n"go to github" -> computer: navigate to github.com\n"fix it" -> ask: What would you like me to fix?\n\nReply:`,
            'You are a tool classifier. Output ONE line only. No explanation.',
            { model: 'qwen3.5:2b', temperature: 0.1, num_predict: 30, signal: cs, think: false,
              onChunk: (c) => { classResult += c; } },
          );
          console.log("[Classifier]", classResult.trim());
          const line = classResult.trim().split('\n')[0].trim().toLowerCase();
          // Dynamic matching against loaded skill names
          let matched = false;
          for (const sn of skillNames) {
            if (line.startsWith(`${sn}:`)) {
              toolClass = sn;
              toolParam = line.slice(sn.length + 1).trim();
              matched = true;
              break;
            }
          }
          if (!matched && line.startsWith('ask:')) { toolClass = 'ask'; toolParam = line.slice(4).trim(); }
          else if (!matched) { toolClass = 'none'; }
        } catch { toolClass = 'none'; }
        finally { cc(); }

        // Build conversation history + token-aware context management
        let history = runs.slice(-5).flatMap(run => [
          { role: 'user' as const, content: run.userMessage },
          ...(run.finalAnswer ? [{ role: 'assistant' as const, content: run.finalAnswer }] : []),
        ]);
        const chatModel = 'qwen3.5:4b';
        const memoryContext = neuroMemory.ready ? neuroMemory.getContextForPrompt() : '';
        const chatSystemPrompt = `${NEURO_SYSTEM}\n\nIf you learn something important about the user (location, preferences, project details, decisions), include [REMEMBER: content] in your response to save it to memory.\n\n${memoryContext}`;

        // Compact history if over 80% utilization
        const chatBudget = calculateBudget(getContextWindow(chatModel), 400, chatSystemPrompt, history, 0);
        if (chatBudget.utilizationPct > 80) {
          const importantFacts = history
            .filter(m => m.role === 'assistant' && m.content.length > 50)
            .map(m => m.content.slice(0, 200));
          for (const fact of importantFacts.slice(-3)) {
            await neuroMemory.log(`Context: ${fact}`);
          }
          const targetTokens = Math.floor(chatBudget.available + chatBudget.messageTokens * 0.5);
          history = compactMessages(history, targetTokens);
          const newBudget = calculateBudget(getContextWindow(chatModel), 400, chatSystemPrompt, history, 0);
          console.log(`[context] Compacted: ${chatBudget.utilizationPct}% -> ${newBudget.utilizationPct}%`);
        }
        const historyStr = history.map(m => `${m.role === 'user' ? 'User' : 'Neuro'}: ${m.content}`).join('\n');

        updateStep(runId, thinkStepId, s => ({ ...s, status: 'done', output: `Tool: ${toolClass}` }));

        // ── No tool needed: generate chat response directly ──
        if (toolClass === 'none') {
          let chatResponse = '';
          const { signal: gs, cleanup: gc } = combinedSignal(abort.signal, 20_000);
          try {
            await ollamaService.generateStream(
              historyStr + `\nUser: ${userMessage}\nNeuro:`,
              chatSystemPrompt,
              {
                model: chatModel, temperature: 0.5, num_predict: 300, signal: gs, think: false,
                onChunk: (chunk) => { chatResponse += chunk; },
              },
            );
          } finally { gc(); }
          chatResponse = await neuroMemory.parseAndRemember(chatResponse, computerId);
          responseText = chatResponse.replace(/^\[TOOL:[^\]]*\]\n?/, '').trim();
        }

        // ── Ask tool: show inline question, wait for answer, then respond ──
        else if (toolClass === 'ask') {
          const askEntryId = `ask_${runId}_${uid()}`;
          const askQ = toolParam || 'What would you like?';
          const askOpts = ['Yes', 'No', 'Something else'];

          addStep(runId, { id: askEntryId, label: 'Asking user', status: 'running', hidden: true });
          setRuns(prev => prev.map(r => {
            if (r.id !== runId) return r;
            return { ...r, _askEntry: { id: askEntryId, question: askQ, options: askOpts } } as AgentRun;
          }));
          scrollToBottom();

          const answer = await new Promise<string>((resolve) => {
            neuroAskResolveRef.current = resolve;
          });

          setRuns(prev => prev.map(r => {
            if (r.id !== runId) return r;
            return { ...r, _askEntry: { ...(r as AgentRun & { _askEntry?: { id: string; question: string; options: string[] } })._askEntry!, answered: answer } } as AgentRun;
          }));
          updateStep(runId, askEntryId, s => ({ ...s, status: 'done', output: `User answered: ${answer}` }));

          // Generate response with the user's clarification as context
          let clarifiedResponse = '';
          const { signal: cls, cleanup: clc } = combinedSignal(abort.signal, 20_000);
          try {
            await ollamaService.generateStream(
              historyStr + `\nUser: ${userMessage}\nUser clarified: ${answer}\nNeuro:`,
              chatSystemPrompt,
              {
                model: chatModel, temperature: 0.5, num_predict: 300, signal: cls, think: false,
                onChunk: (chunk) => { clarifiedResponse += chunk; },
              },
            );
          } finally { clc(); }
          clarifiedResponse = await neuroMemory.parseAndRemember(clarifiedResponse, computerId);
          responseText = clarifiedResponse.replace(/^\[TOOL:[^\]]*\]\n?/, '').trim();
        }

        // ── Tool needed: sequential loop -- run tool FIRST, then LLM responds WITH data ──
        // This is the OpenClaw pattern: tools execute before the LLM speaks, so the LLM
        // always has real data when composing the answer. No more "I can't tell you the weather".
        else {
          let currentTool = toolClass;
          let currentParam = toolParam;
          const toolResults: string[] = [];
          let iteration = 0;
          const MAX_TOOL_ITERATIONS = 5;

          while (currentTool !== 'none' && currentTool !== 'ask' && iteration < MAX_TOOL_ITERATIONS) {
            iteration++;
            const toolStepId = uid();
            const toolLabel = currentTool === 'webfetch' ? `Searching: ${currentParam}`
              : currentTool === 'research' ? `Researching: ${currentParam}`
              : currentTool === 'computer' ? `Using computer: ${currentParam}`
              : `Running: ${currentTool}`;
            addStep(runId, { id: toolStepId, label: toolLabel, status: 'running' });
            scrollToBottom();

            let result = '';

            switch (currentTool) {
              case 'webfetch': {
                const query = currentParam || userMessage;
                try {
                  const searxUrl = `${INFRASTRUCTURE.wayfarerUrl}/api/search?q=${encodeURIComponent(query)}&format=json`;
                  console.log('[webfetch] Fetching via proxy:', searxUrl);
                  const searxRes = await fetch(searxUrl, { signal: abort.signal }).then(r => r.json());
                  const topResults = (searxRes.results || []).slice(0, 8);
                  result = topResults.map((r: { title?: string; content?: string; url?: string }) =>
                    `${r.title || ''}: ${r.content || ''}`
                  ).join('\n\n');
                  if (!result) result = 'No search results found.';
                  const sourceNames = topResults.map((r: { url?: string }) => {
                    try { return new URL(r.url || '').hostname.replace('www.', ''); } catch { return ''; }
                  }).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).slice(0, 4);
                  updateStep(runId, toolStepId, s => ({ ...s, status: 'done', output: `Found ${topResults.length} results from ${sourceNames.join(', ')}` }));
                } catch (err) {
                  console.error('[webfetch] SearXNG failed:', err);
                  try {
                    const wayfarerRes = await fetch(`${INFRASTRUCTURE.wayfarerUrl}/research`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ query, max_results: 3 }),
                      signal: abort.signal,
                    }).then(r => r.json());
                    const pages = wayfarerRes.results || [];
                    result = pages.map((r: { title?: string; text?: string }) =>
                      `${r.title || 'Untitled'}: ${(r.text || '').slice(0, 500)}`
                    ).join('\n\n');
                    if (!result) result = 'No results found.';
                    updateStep(runId, toolStepId, s => ({ ...s, status: 'done', output: `Fetched ${pages.length} pages` }));
                  } catch {
                    result = 'No search results available. SearXNG and Wayfarer are both unreachable.';
                    updateStep(runId, toolStepId, s => ({ ...s, status: 'error', output: 'Search unavailable' }));
                  }
                }
                neuroMemory.log(`Searched: ${query}`).catch(() => {});
                break;
              }

              case 'research': {
                const researchQuery = currentParam || userMessage;
                const sId = uid(), fId = uid(), sumId = uid(), synId = uid();
                updateStep(runId, toolStepId, s => ({ ...s, label: 'Generating search queries' }));

                const { signal: rs, cleanup: rc } = combinedSignal(abort.signal, 600_000);
                try {
                  const researchResult = await runMassResearch(researchQuery, {
                    maxSources: 20, maxSearchQueries: 5, signal: rs,
                    onProgress: (ev: ResearchProgressEvent) => {
                      switch (ev.type) {
                        case 'generating_queries': break;
                        case 'searching': updateStep(runId, toolStepId, s => ({ ...s, status: 'done', output: `Queries: ${ev.queries.join(', ')}` })); addStep(runId, { id: sId, label: 'Searching SearXNG', status: 'running' }); scrollToBottom(); break;
                        case 'found_urls': updateStep(runId, sId, s => ({ ...s, status: 'done', output: `Found ${ev.count} unique URLs` })); addStep(runId, { id: fId, label: `Fetching ${ev.count} pages`, status: 'running' }); scrollToBottom(); break;
                        case 'fetching': updateStep(runId, fId, s => ({ ...s, output: `Scraping ${ev.total} pages via Wayfarer...` })); break;
                        case 'summarizing': updateStep(runId, fId, s => ({ ...s, status: 'done', output: `Fetched ${ev.total} pages` })); addStep(runId, { id: sumId, label: `Summarizing ${ev.total} pages`, status: 'running' }); scrollToBottom(); break;
                        case 'summarizing_page': updateStep(runId, sumId, s => ({ ...s, output: `[${ev.index + 1}] ${ev.url.slice(0, 60)}...` })); break;
                        case 'synthesizing': updateStep(runId, sumId, s => ({ ...s, status: 'done' })); addStep(runId, { id: synId, label: 'Synthesizing findings', status: 'running' }); scrollToBottom(); break;
                        case 'done': updateStep(runId, synId, s => ({ ...s, status: 'done' })); break;
                      }
                    },
                  });
                  result = researchResult.synthesis;
                  try {
                    const sessionId = generateSessionId();
                    vfs.saveActivity(sessionId, computerId, `Research: ${researchQuery}`, JSON.stringify({
                      query: researchResult.query, totalSources: researchResult.totalSources, elapsed: researchResult.elapsed,
                      sources: researchResult.sources.map(s => ({ url: s.url, title: s.title, summary: s.summary })), synthesis: researchResult.synthesis,
                    }));
                  } catch { /* silent */ }
                } finally { rc(); }
                break;
              }

              case 'computer': {
                const goal = currentParam || userMessage;
                const actionStepId = uid();
                updateStep(runId, toolStepId, s => ({ ...s, label: 'Using Computer' }));
                addStep(runId, { id: actionStepId, label: goal, status: 'running' });
                scrollToBottom();

                desktopBus.emit({ type: 'open_window', app: 'chrome' });
                setTimeout(() => desktopBus.emit({ type: 'run_goal', goal }), 800);
                if (onComputerTask) onComputerTask(goal);
                result = await waitForAgent(runId, actionStepId, abort);
                updateStep(runId, toolStepId, s => ({ ...s, status: 'done' }));
                break;
              }

              default:
                updateStep(runId, toolStepId, s => ({ ...s, status: 'error', output: `Unknown tool: ${currentTool}` }));
                result = '';
                break;
            }

            toolResults.push(`[${currentTool}] ${result}`);
            scrollToBottom();

            // Now call LLM with tool results as context -- LLM responds WITH the data
            const contextData = toolResults.join('\n---\n');
            const contextualPrompt = `The user said: "${userMessage}"

Here is data I found:
${contextData}

Based on this data, answer the user's question directly and conversationally. Be specific -- use actual numbers, names, and facts from the data. Use Celsius for temperatures, metric for distances. Be precise with data from the search results. Do not say you cannot access information -- you have it above. If the data does not contain what was asked, say so honestly.`;

            const answerStepId = uid();
            addStep(runId, { id: answerStepId, label: 'Composing answer', status: 'running' });
            scrollToBottom();

            let llmResponse = '';
            const { signal: as2, cleanup: ac2 } = combinedSignal(abort.signal, 25_000);
            try {
              await ollamaService.generateStream(
                historyStr + `\n\n${contextualPrompt}\nNeuro:`,
                NEURO_SYSTEM + `\n\nYou have tool results above. Answer using that data. If you need MORE information to answer properly, output [TOOL:webfetch|query=your search] or [TOOL:research|query=topic] on its own line. Otherwise just answer naturally.\n\nIf you learn something important about the user, include [REMEMBER: content] in your response.\n\n${memoryContext}`,
                {
                  model: chatModel, temperature: 0.3, num_predict: 400, signal: as2, think: false,
                  onChunk: (chunk) => { llmResponse += chunk; },
                },
              );
            } finally { ac2(); }

            llmResponse = await neuroMemory.parseAndRemember(llmResponse, computerId);
            updateStep(runId, answerStepId, s => ({ ...s, status: 'done' }));

            // Check if LLM requested another tool
            const nextToolMatch = llmResponse.match(/\[TOOL:(webfetch|research|computer)\|(?:query=)?([^\]]+)\]/);
            if (nextToolMatch) {
              currentTool = nextToolMatch[1];
              currentParam = nextToolMatch[2].trim();
              // Strip the tool tag -- keep any partial text the LLM wrote before the tag
              const cleaned = llmResponse.replace(/\[TOOL:[^\]]+\]/g, '').trim();
              if (cleaned) responseText = cleaned;
              console.log(`[ToolLoop] LLM wants another tool: ${currentTool} -- ${currentParam}`);
            } else {
              // No more tools needed -- this is the final answer
              currentTool = 'none';
              responseText = llmResponse.replace(/^\[TOOL:[^\]]*\]\n?/, '').trim();
            }
          }

          // If we exhausted iterations, use whatever we have
          if (iteration >= MAX_TOOL_ITERATIONS && !responseText) {
            responseText = 'I gathered some data but could not fully answer. Here is what I found:\n\n' + toolResults.join('\n\n');
          }
        }
      }

      // Mark run done
      updateRun(runId, r => {
        const answer = responseText.replace(/^Done:\s*/i, '').trim() || undefined;
        const fallback = !answer ? [...r.steps].reverse().find(s => s.output?.trim() && !s.hidden)?.output?.replace(/^Done:\s*/i, '').trim() : undefined;
        return { ...r, status: 'done', finalAnswer: answer || fallback };
      });

      // Log to neuro memory daily log + session transcript
      neuroMemory.log(`User: ${userMessage.slice(0, 100)}`).catch(() => {});
      neuroMemory.log(`Neuro: ${responseText.slice(0, 100)}`).catch(() => {});
      neuroMemory.appendTranscript(computerId, { role: 'user', content: userMessage, timestamp: new Date().toISOString() }).catch(() => {});
      neuroMemory.appendTranscript(computerId, { role: 'assistant', content: responseText, timestamp: new Date().toISOString() }).catch(() => {});
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (!isAbort) console.error('[ActionSidebar] Run error:', err);
      const errMsg = isAbort ? 'Aborted.' : (err instanceof Error ? err.message : 'An unexpected error occurred.');
      setRuns(prev => prev.map(r => {
        if (r.id !== runId) return r;
        const steps = r.steps.map(s => s.status === 'running' ? { ...s, status: 'error' as const, output: errMsg } : s);
        const hasErr = steps.some(s => s.status === 'error');
        const finalSteps = hasErr ? steps : [...steps, { id: uid(), label: isAbort ? 'Aborted' : 'Error', status: 'error' as const, output: errMsg }];
        return { ...r, status: 'error', steps: finalSteps, errorDetail: errMsg };
      }));
    } finally {
      setActiveRunId(null);
      setIterCount(null);
      setRunStartedAt(null);
      userScrolledRef.current = false;
      scrollToBottomNow();
      setPendingQueue(prev => {
        if (prev.length === 0) { isRoutingRef.current = false; setIsRouting(false); return prev; }
        const [next, ...rest] = prev;
        const newRunId = uid();
        setRuns(r => pruneRuns([...r, { id: newRunId, userMessage: next, steps: [], status: 'running', createdAt: Date.now() }]));
        Promise.resolve().then(() => executeRun(newRunId, next));
        return rest;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStep, addStep, updateRun, onComputerTask, scrollToBottom, pruneRuns, waitForAgent, computerId]);

  // ── New session ──
  const handleNewSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stepTimeoutMapRef.current.forEach(h => clearTimeout(h));
    stepTimeoutMapRef.current.clear();
    if (runs.length > 0) {
      try {
        vfs.saveActivity(computerId, computerId, `Session ended with ${runs.length} task(s)`, JSON.stringify(runs.map(r => ({ id: r.id, userMessage: r.userMessage, status: r.status, createdAt: r.createdAt, finalAnswer: r.finalAnswer, errorDetail: r.errorDetail, steps: r.steps.map(s => ({ id: s.id, label: s.label, status: s.status, output: s.output })) }))));
      } catch { /* silent */ }
    }
    setRuns([]); setPendingQueue([]); setActiveRunId(null); isRoutingRef.current = false; setIsRouting(false); setIterCount(null); setShowNewActivity(false); setRunStartedAt(null); setRunLongRunning(false); userScrolledRef.current = false; setAskUserRequest(null); askUserResolveRef.current = null; neuroAskResolveRef.current = null; setClarifyStepId(null); setViewingDoc(null);
    setComputerId(generateSessionId());
    setSessionSavedFlash(true);
    setTimeout(() => setSessionSavedFlash(false), 1500);
  }, [runs, computerId]);

  // ── Submit ──
  const handleSendInstruction = useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    if (isRouting || isRoutingRef.current) { setPendingQueue(prev => [...prev, text]); return; }
    const runId = uid();
    setRuns(prev => pruneRuns([...prev, { id: runId, userMessage: text, steps: [], status: 'running', createdAt: Date.now() }]));
    scrollToBottom();
    executeRun(runId, text);
  }, [input, isRouting, executeRun, scrollToBottom, pruneRuns]);

  // ── Derived state ──
  const currentRun = (activeRunId ? runs.find(r => r.id === activeRunId) : null) || (runs.length > 0 ? runs[runs.length - 1] : null);
  const currentDone = currentRun?.steps.filter(s => s.status === 'done').length ?? 0;
  const currentTotal = currentRun?.steps.length ?? 0;
  // (removed unused var)
  const showThinkingDots = isRouting && !(currentRun?.steps.some(s => s.status === 'running') ?? false);

  // ── Build chat entries from runs ──
  const chatEntries: ChatEntry[] = [];
  for (const run of runs) {
    // User message bubble
    chatEntries.push({ type: 'user', id: `user_${run.id}`, text: run.userMessage, ts: run.createdAt });

    // Agent conversational text -- tool-based labels
    const thinkStep = run.steps.find(s => s.label === 'Thinking');
    const toolStep = run.steps.find(s => s.id !== thinkStep?.id && !s.hidden && !s.id.startsWith('agent_step_'));
    const conversationalText = toolStep?.label
      ? (toolStep.label === 'Searching...' ? "Let me look that up..."
        : toolStep.label === 'Browsing page' ? "I'll open the browser now..."
        : toolStep.label === 'Using Computer' ? "I'll handle that in the browser..."
        : toolStep.label.startsWith('Generating search') ? "I'll research that for you..."
        : '')
      : '';
    if (conversationalText) {
      chatEntries.push({ type: 'agent', id: `agent_pre_${run.id}`, text: conversationalText, ts: run.createdAt + 1 });
    }

    // Collapsible task block
    chatEntries.push({ type: 'task', id: `task_${run.id}`, runId: run.id, ts: run.createdAt + 2 });

    // Computer card (inline) if computer steps exist
    const hasComputerSteps = run.steps.some(s => s.id.startsWith('agent_step_'));
    if (hasComputerSteps) {
      const latestSS = [...run.steps].reverse().find(s => s.latestScreenshot)?.latestScreenshot;
      chatEntries.push({
        type: 'computer', id: `computer_${run.id}`, runId: run.id,
        screenshot: latestSS,
        status: run.status === 'running' ? 'Using Browser' : 'Completed',
        ts: run.createdAt + 3,
      });
    }

    // Ask user inline (Neuro ask tool)
    const askEntry = (run as AgentRun & { _askEntry?: { id: string; question: string; options: string[]; answered?: string } })._askEntry;
    if (askEntry) {
      chatEntries.push({ type: 'ask', id: askEntry.id, question: askEntry.question, options: askEntry.options, answered: askEntry.answered, ts: run.createdAt + 3.5 });
    }

    // Agent final text
    if (run.status === 'done' && run.finalAnswer) {
      const shortAnswer = run.finalAnswer.length > 300 ? run.finalAnswer.slice(0, 300) + '...' : run.finalAnswer;
      chatEntries.push({ type: 'agent', id: `agent_post_${run.id}`, text: shortAnswer, ts: run.createdAt + 4 });
    }
    if (run.status === 'error' && run.errorDetail) {
      chatEntries.push({ type: 'agent', id: `agent_err_${run.id}`, text: `Something went wrong: ${run.errorDetail}`, ts: run.createdAt + 4 });
    }
  }

  // "Will continue after reply" notification
  const showContinueNotice = !!askUserRequest && !askUserRequest.isClarification;

  // ── Render ──
  return (
    <>
      <div className="flex flex-col overflow-hidden" style={{
        background: 'linear-gradient(180deg, rgba(15,15,20,0.88) 0%, rgba(10,12,18,0.92) 100%)',
        backdropFilter: 'blur(16px)', height: '100%', width: '100%', overflow: 'hidden',
        borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Header bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 7px',
            borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isRouting && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: '_nomad_pulse 1.5s infinite', flexShrink: 0, display: 'inline-block' }} />}
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>neuro</span>
              {showThinkingDots && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>routing</span>}
              {currentTotal > 0 && isRouting && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{currentDone}/{currentTotal}</span>
              )}
              <span title={computerId} style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 4, flexShrink: 0, cursor: 'default', letterSpacing: '0.5px', marginLeft: 'auto' }}>{getSessionSuffix(computerId)}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <div style={runLongRunning && !sessionSavedFlash ? { animation: '_nomad_pulse 2s ease-in-out infinite' } : undefined}>
                <CircleButton title="New session" aria-label="New session" onClick={handleNewSession} active={runLongRunning && !sessionSavedFlash}>
                  {sessionSavedFlash
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={runLongRunning ? 'rgba(251,191,36,0.85)' : 'currentColor'} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
                </CircleButton>
              </div>
              {isRouting && (
                <CircleButton title="Abort" aria-label="Abort agent" onClick={() => abortRef.current?.abort()} active>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </CircleButton>
              )}
            </div>
          </div>

          {/* Chat feed */}
          <div className="relative flex flex-col" style={{ flex: 1, minHeight: 0 }}>
            <div className="absolute top-0 left-0 right-0 h-3 pointer-events-none z-10" style={{ background: 'linear-gradient(to bottom, rgba(12,14,20,0.8), transparent)' }} />
            <div className="px-3 py-2" ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              {chatEntries.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 20px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.15 }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block' }}>
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Ask neuro anything</div>
                  </div>
                </div>
              ) : (
                <AnimatePresence>
                  {chatEntries.map((entry) => (
                    <motion.div key={entry.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                      {entry.type === 'user' && <UserBubble text={entry.text} />}
                      {entry.type === 'agent' && <AgentText text={entry.text} />}
                      {entry.type === 'task' && (() => {
                        const run = runs.find(r => r.id === entry.runId);
                        if (!run) return null;
                        return (
                          <ManusTaskBlock run={run} onDocClick={setViewingDoc} onExpandComputer={onExpandComputer} />
                        );
                      })()}
                      {entry.type === 'computer' && (() => {
                        const run = runs.find(r => r.id === entry.runId);
                        if (!run) return null;
                        const agentSteps = run.steps.filter(s => s.id.startsWith('agent_step_'));
                        return (
                          <ComputerCard
                            screenshot={entry.screenshot}
                            status={entry.status}
                            steps={agentSteps.map(s => ({ label: s.label, status: s.status }))}
                            currentStep={agentSteps.filter(s => s.status === 'done').length}
                            onExpand={onExpandComputer}
                          />
                        );
                      })()}
                      {entry.type === 'ask' && (
                        <AskUserInline
                          question={entry.question}
                          options={entry.options}
                          answered={entry.answered}
                          onAnswer={(answer) => {
                            // Resolve the pending promise
                            if (neuroAskResolveRef.current) {
                              neuroAskResolveRef.current(answer);
                              neuroAskResolveRef.current = null;
                            }
                          }}
                        />
                      )}
                      {entry.type === 'continue' && <ContinueNotice />}
                    </motion.div>
                  ))}
                  {/* Inline continue notice */}
                  {showContinueNotice && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                      <ContinueNotice />
                    </motion.div>
                  )}
                  {/* Manus-style routing/thinking status indicator */}
                  {showThinkingDots && (
                    <div style={{ padding: '6px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', animation: '_nomad_pulse 1.5s infinite', flexShrink: 0 }} />
                        <span>thinking</span>
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              )}
            </div>
            {/* Bottom gradient removed for clean Manus-style transition to input */}
            <AnimatePresence>
              {showNewActivity && (
                <motion.button initial={{ opacity: 0, y: 4, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.92 }} transition={{ duration: 0.15 }} onClick={scrollToBottomNow} style={{
                  position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
                  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 12,
                  background: 'rgba(43,121,255,0.20)', border: '1px solid rgba(43,121,255,0.35)',
                  color: 'rgba(43,121,255,0.90)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
                }} aria-label="Scroll to latest activity">
                  <span>New activity</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Input bar */}
        <div style={{ padding: '10px 12px 12px', borderTop: 'none', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <textarea ref={inputRef} value={input}
              onChange={e => { setInput(e.target.value); if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 72) + 'px'; } }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendInstruction(); } }}
              placeholder={isRouting ? 'Queue next task...' : 'Ask neuro anything...'}
              data-role="instruction-input" aria-label="Send a message to neuro"
              style={{
                width: '100%', padding: '10px 40px 10px 12px', borderRadius: 10, fontSize: 12,
                background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.80)',
                border: '1px solid rgba(255,255,255,0.08)', outline: 'none', resize: 'none',
                minHeight: 40, maxHeight: 72, lineHeight: 1.5, fontFamily: 'inherit',
                backdropFilter: 'blur(8px)', transition: 'border-color 0.15s ease',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            {/* Send button overlaid on input */}
            <button
              onClick={() => handleSendInstruction()}
              disabled={!input.trim()}
              style={{
                position: 'absolute', right: 6, bottom: 6, width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: input.trim() ? 'rgba(43,121,255,0.25)' : 'rgba(255,255,255,0.04)',
                border: input.trim() ? '1px solid rgba(43,121,255,0.40)' : '1px solid rgba(255,255,255,0.06)',
                color: input.trim() ? 'rgba(43,121,255,0.90)' : 'rgba(255,255,255,0.15)',
                cursor: input.trim() ? 'pointer' : 'default', transition: 'all 0.15s ease', padding: 0,
              }}
              aria-label="Send message"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
            </button>
          </div>
          {isRouting && <div style={{ marginTop: 4, fontSize: 9, color: 'rgba(255,255,255,0.28)', textAlign: 'center' }}>neuro is working -- type to queue next task</div>}
          {isRouting && pendingQueue.length > 0 && (
            <div style={{ marginTop: 4, marginBottom: -2 }}>
              <span style={{ fontSize: 9, color: 'rgba(251,191,36,0.70)', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 4, padding: '2px 6px' }}>{pendingQueue.length} queued</span>
            </div>
          )}
        </div>
      </div>

      <DocumentViewer document={viewingDoc} onClose={() => setViewingDoc(null)} />

      {/* Ask-user pause card (high-stakes only) -- shown inline via ContinueNotice + this overlay */}
      <AnimatePresence>
        {askUserRequest && !askUserRequest.isClarification && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.18 }} style={{
            position: 'fixed', bottom: 80, right: 16, width: 280, zIndex: 200,
            background: 'rgba(18,20,30,0.96)', border: '1px solid rgba(251,191,36,0.28)',
            borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(251,191,36,0.80)', animation: '_nomad_pulse 1.2s ease-in-out infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(251,191,36,0.80)', letterSpacing: '0.04em' }}>neuro paused</span>
              <button onClick={() => { askUserResolveRef.current?.({ value: 'abort', label: 'Abort' }); askUserResolveRef.current = null; setAskUserRequest(null); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.30)', fontSize: 12, padding: 0, lineHeight: 1 }} aria-label="Dismiss">x</button>
            </div>
            {askUserRequest.screenshot && <img src={`data:image/jpeg;base64,${askUserRequest.screenshot}`} alt="Current state" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 8, display: 'block' }} />}
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.70)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{askUserRequest.question}</p>
            {askUserRequest.context && askUserRequest.context !== askUserRequest.question && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4, margin: '5px 0 0', whiteSpace: 'pre-wrap' }}>{askUserRequest.context}</p>}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {(askUserRequest.options?.length ? askUserRequest.options : [{ label: 'Proceed', value: 'proceed' }, { label: 'Skip', value: 'skip' }, { label: 'Abort', value: 'abort' }]).map(opt => (
                <button key={opt.value} onClick={() => { askUserResolveRef.current?.({ value: opt.value, label: opt.label }); askUserResolveRef.current = null; setAskUserRequest(null); }} style={{
                  flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  border: opt.value === 'proceed' ? '1px solid rgba(52,211,153,0.35)' : opt.value === 'abort' ? '1px solid rgba(239,68,68,0.30)' : '1px solid rgba(255,255,255,0.12)',
                  background: opt.value === 'proceed' ? 'rgba(52,211,153,0.12)' : opt.value === 'abort' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                  color: opt.value === 'proceed' ? 'rgba(52,211,153,0.90)' : opt.value === 'abort' ? 'rgba(239,68,68,0.85)' : 'rgba(255,255,255,0.60)',
                }}>{opt.label}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
