/**
 * AgentPanel -- Manus-style autonomous agent UI
 *
 * Chat interface with grouped step cards, action pills, morphing thinking
 * animation, sticky progress bar, browser preview thumbnails,
 * and a left conversation sidebar with full chat history persistence.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TextShimmer } from './TextShimmer';
import { runAgentLoop } from '../utils/agentEngine';
import type { TaskProgress, AgentEngineEvent, ToolCall, CampaignContextData, SubagentEventData } from '../utils/agentEngine';
import { useCampaign } from '../context/CampaignContext';
import { getMemories, deleteMemory } from '../utils/memoryStore';
import { getUserMemories, touchUserProfile } from '../utils/userProfile';
import { getModelForStage } from '../utils/modelConfig';
import { generateWorkspaceId, getWorkspacePath, workspaceSaveBinary, workspaceListDetailed, ensureWorkspace, workspaceMkdir, seedWorkspace, type WorkspaceFile } from '../utils/workspace';
import {
  saveConversation,
  loadConversation,
  deleteConversation,
  listConversations,
  type Conversation,
  type StoredMessageBlock,
  type GroupedConversations,
  shouldRetitle,
  generateConversationTitle,
} from '../utils/chatHistory';
import VoiceInput from './VoiceInput';
import { ResponseStream } from './ResponseStream';
import { LiquidGlass } from './LiquidGlass';
import { renderWorkspaceResult } from './FilesystemTree';
import { AgentUIWrapper } from './AgentUIWrapper';
import type { StepConfig } from './AgentUIWrapper';
import { WorkspaceModal } from './WorkspaceModal';
import type { Campaign, Cycle } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────

/** An image or file pasted/dropped into the chat input */
interface ChatAttachment {
  id: string;
  dataUrl: string;       // base64 data URL for images, or empty for text files
  name: string;
  type: 'image' | 'text';
  textContent?: string;  // raw text for text-type attachments
}

const IMAGE_ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TEXT_ACCEPT = ['application/pdf', 'text/plain', 'text/markdown', 'application/json'];

interface ActionPill {
  id: string;
  toolName: string;
  argsPreview: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

type StepEntry =
  | { type: 'text'; content: string }
  | { type: 'action'; pill: ActionPill };

/** Live state for a single spawned subagent */
interface SubagentInfo {
  agentId: string;
  role: string;
  task: string;
  status: 'spawning' | 'running' | 'complete' | 'failed';
  tokens: number;
  result?: string;
  confidence?: number;
  error?: string;
}

interface StepCard {
  id: string;
  title: string;
  /** @deprecated kept for back-compat with stored conversations */
  thinkingText: string;
  isThinking: boolean;
  /** @deprecated kept for back-compat with stored conversations */
  actions: ActionPill[];
  /** Interleaved text + action entries rendered in order */
  entries: StepEntry[];
  status: 'active' | 'done' | 'pending';
  browserUrl?: string;
  browserScreenshot?: string;
  /** Contextual status text based on current activity */
  activityLabel?: string;
  /** Active subagents spawned from this step */
  subagents?: SubagentInfo[];
}

function getActivityLabel(toolName?: string): string {
  if (!toolName) return 'Thinking';
  switch (toolName) {
    case 'browse': return 'Viewing browser';
    case 'analyze_page': return 'Analyzing page';
    case 'scrape_page': return 'Reading page';
    case 'web_search': return 'Searching the web';
    case 'shell_exec': return 'Running command';
    case 'run_code': return 'Executing code';
    case 'file_read': return 'Reading file';
    case 'file_write': return 'Writing file';
    case 'file_find': return 'Finding files';
    case 'workspace_save': return 'Saving to workspace';
    case 'workspace_read': return 'Reading from workspace';
    case 'workspace_list': return 'Checking workspace';
    case 'use_computer': return 'Using computer';
    case 'sandbox_pull': return 'Pulling from sandbox';
    case 'think': return 'Reasoning';
    case 'remember': return 'Remembering';
    case 'wait': return 'Waiting';
    case 'spawn_agents': return 'Spawning agents';
    default: return 'Working';
  }
}

/** Format token counts: under 1000 as-is, 1000+ as "1.2k" etc. */
function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/** Format duration: <60s → "12s", 60s+ → "1m 4s", 60min+ → "1h 3m" */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface MessageBlock {
  id: string;
  timestamp: number;
  type: 'user' | 'agent' | 'upload';
  content: string;
  steps?: StepCard[];
  uploadFilename?: string;
  uploadSize?: string;
  /** Attached images/files sent with the message */
  attachments?: ChatAttachment[];
  /** Timing + tokens for agent messages */
  startedAt?: number;
  completedAt?: number;
  tokenCount?: number;
}

type AgentStatus = 'idle' | 'routing' | 'thinking' | 'streaming' | 'error';

/** Human-readable status text for the current activity */
function statusLabel(status: AgentStatus, toolName?: string): string {
  if (status === 'idle') return '';
  if (status === 'routing') return 'Routing';
  if (status === 'error') return 'Error';
  if (toolName) return getActivityLabel(toolName);
  if (status === 'thinking') return 'Thinking';
  return 'Working';
}

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

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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



function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FileDocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function SidebarToggleIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <polyline points="14 9 17 12 14 15" />
        </>
      )}
    </svg>
  );
}




function actionLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'web_search': return `Searching: "${String(args.query || '').slice(0, 60)}"`;
    case 'browse': return `Browsing ${String(args.url || '').slice(0, 50)}`;
    case 'scrape_page': return `Scraping ${String(args.url || '').slice(0, 50)}`;
    case 'analyze_page': return `Analyzing ${String(args.url || '').slice(0, 50)}`;
    case 'shell_exec': return `Running: ${String(args.command || '').slice(0, 60)}`;
    case 'run_code': return `Executing ${String(args.language || 'code')}`;
    case 'file_read': return `Reading ${String(args.path || '').split('/').pop() || 'file'}`;
    case 'file_write': return `Writing ${String(args.path || '').split('/').pop() || 'file'}`;
    case 'file_find': return `Finding "${String(args.pattern || '')}"`;
    case 'workspace_save': return `Saving ${String(args.filename || 'file')}`;
    case 'workspace_read': return `Reading ${String(args.filename || 'file')}`;
    case 'workspace_list': return 'Listing workspace files';
    case 'use_computer': return `Computer: ${String(args.goal || '').slice(0, 60)}`;
    case 'sandbox_pull': return `Pulling ${String(args.source_path || '').split('/').pop() || 'file'}`;
    case 'think': return 'Deep thinking...';
    case 'remember': return `Remembering: ${String(args.key || '')}`;
    case 'wait': return `Waiting ${String(args.seconds || '')}s`;
    case 'ask_user': return 'Asking user...';
    case 'spawn_agents': {
      const tasks = args.tasks as Array<{ role?: string; query?: string }> | undefined;
      const count = tasks?.length ?? 0;
      return `Spawning ${count} agent${count !== 1 ? 's' : ''}${args.reason ? ': ' + String(args.reason).slice(0, 40) : ''}`;
    }
    default: return name.replace(/_/g, ' ');
  }
}

function deriveStepTitle(thinking: string): string {
  if (!thinking) return 'Working...';
  const first = thinking.split(/[.\n]/)[0]?.trim() || thinking;
  return first.length > 80 ? first.slice(0, 77) + '...' : first;
}

// ── Routing Screen (Manus-style "thinking" boot screen) ───────────────────

function RoutingIndicator() {
  return (
    <div className="flex gap-3">
      <NomadLogo />
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
          <ThinkingMorph size={14} />
          <TextShimmer className="text-[12px] font-medium [--shimmer-base:rgba(255,255,255,0.4)] [--shimmer-highlight:rgba(255,255,255,0.9)]" duration={1.8}>Routing</TextShimmer>
        </div>
      </div>
    </div>
  );
}

// ── LiveTimer (ticks every second while agent is working) ──────────────────

function LiveTimer({ startedAt, tokenCount }: { startedAt: number; tokenCount?: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="text-[10px] font-sans" style={{ color: 'rgba(255,255,255,0.3)' }}>
      {formatDuration(elapsed)}{tokenCount != null && tokenCount > 0 ? <span style={{ color: 'rgba(43,121,255,0.6)' }}> · {formatTokens(tokenCount)}</span> : ''}
    </span>
  );
}

// ── ThinkingMorph ──────────────────────────────────────────────────────────
// WHITE thinking animation (not blue) for Manus Lite

function ThinkingMorph({ size = 18 }: { size?: number }) {
  return (
    <motion.div
      className="shrink-0"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 50%, #6366f1 100%)',
        backgroundSize: '200% 200%',
      }}
      animate={{
        borderRadius: ['50%', '22%', '50%'],
        rotate: [0, 90, 180],
        scale: [0.95, 1.08, 0.95],
        boxShadow: [
          `0 0 ${size * 0.3}px rgba(59,130,246,0.3), 0 0 ${size * 0.6}px rgba(59,130,246,0.1)`,
          `0 0 ${size * 0.5}px rgba(59,130,246,0.5), 0 0 ${size}px rgba(59,130,246,0.2)`,
          `0 0 ${size * 0.3}px rgba(59,130,246,0.3), 0 0 ${size * 0.6}px rgba(59,130,246,0.1)`,
        ],
        backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
      }}
      transition={{
        duration: 1.8,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

// ── Animated agent response — uses ResponseStream for new messages, static for old ──

function AnimatedAgentText({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) {
    return <div className="space-y-1">{renderMarkdown(text)}</div>;
  }
  // For long text, use typewriter with fast speed; for short, use fade
  const isLong = text.length > 600;
  return (
    <div style={{ color: 'rgba(255,255,255,0.6)' }}>
      <ResponseStream
        textStream={text}
        mode={isLong ? "typewriter" : "fade"}
        speed={isLong ? 50 : 40}
        className="whitespace-pre-wrap text-[13px] leading-[1.7]"
      />
    </div>
  );
}

// ── Markdown renderer ──────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ```lang ... ```
    if (line.trim().startsWith('\`\`\`')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('\`\`\`')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      result.push(
        <pre
          key={`code-${i}`}
          className="my-2 p-3 rounded-lg overflow-x-auto text-[11px] font-mono leading-relaxed"
          style={{
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(43,121,255,0.85)',
          }}
          data-lang={lang || undefined}
        >{codeLines.join('\n')}</pre>
      );
      continue;
    }

    // Table detection: line with | separators
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Parse table
      const rows = tableLines
        .filter(l => !l.match(/^\|[\s-:|]+\|$/)) // skip separator rows
        .map(l => l.split('|').map(c => c.trim()).filter(Boolean));
      if (rows.length > 0) {
        const header = rows[0];
        const body = rows.slice(1);
        result.push(
          <div key={`table-${i}`} className="my-3 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {header.map((h, j) => (
                    <th key={j} className="text-left px-4 py-2.5 font-semibold" style={{ color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {inlineFormat(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2.5" style={{
                        color: ci === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
                        fontWeight: ci === 0 ? 600 : 400,
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        {inlineFormat(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    if (line.startsWith('### ')) {
      result.push(<h4 key={i} className="text-[13px] font-semibold mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.8)' }}>{inlineFormat(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      result.push(<h3 key={i} className="text-[15px] font-semibold mt-4 mb-1.5" style={{ color: 'rgba(255,255,255,0.9)' }}>{inlineFormat(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      result.push(<h2 key={i} className="text-[17px] font-bold mt-4 mb-2" style={{ color: 'rgba(255,255,255,0.95)' }}>{inlineFormat(line.slice(2))}</h2>);
    } else if (line.match(/^[-*] /)) {
      result.push(<div key={i} className="flex gap-2 pl-1"><span className="shrink-0 mt-[7px] w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.3)' }} /><span className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{inlineFormat(line.slice(2))}</span></div>);
    } else if (line.match(/^\d+\.\s/)) {
      const m = line.match(/^(\d+\.)\s(.*)$/);
      if (m) result.push(<div key={i} className="flex gap-2 pl-1"><span className="shrink-0 text-[12px] font-sans" style={{ color: 'rgba(255,255,255,0.3)' }}>{m[1]}</span><span className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{inlineFormat(m[2])}</span></div>);
    } else if (line.trim() === '') {
      result.push(<div key={i} className="h-2" />);
    } else {
      result.push(<p key={i} className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{inlineFormat(line)}</p>);
    }
    i++;
  }
  return result;
}

function inlineFormat(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index} className="font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={match.index} className="text-[12px] font-sans px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(43,121,255,0.8)' }}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={match.index} style={{ color: 'rgba(255,255,255,0.55)' }}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

// ── ActionPillView — Manus style: ◎ text (no pill border) ─────────────────

function ActionPillView({ action }: { action: ActionPill }) {
  // Circle icon: filled = done/error, outline = pending/running
  const circleSvg = action.status === 'done' ? (
    // Filled green circle with check
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="rgba(34,197,94,0.2)" stroke="rgba(34,197,94,0.5)" strokeWidth="1.5" />
      <polyline points="7 12 10 15 17 9" stroke="rgba(34,197,94,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : action.status === 'error' ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.4)" strokeWidth="1.5" />
      <line x1="8" y1="8" x2="16" y2="16" stroke="rgba(239,68,68,0.8)" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="8" x2="8" y2="16" stroke="rgba(239,68,68,0.8)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ) : action.status === 'running' ? (
    // Pulsing outline circle
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="animate-pulse">
      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(43,121,255,0.5)" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" fill="rgba(43,121,255,0.4)" />
    </svg>
  ) : (
    // Outline only — pending
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
    </svg>
  );

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="shrink-0 mt-px">{circleSvg}</span>
      <span className="text-[12px] leading-snug" style={{
        color: action.status === 'done' ? 'rgba(255,255,255,0.4)' :
               action.status === 'error' ? 'rgba(239,68,68,0.6)' :
               action.status === 'running' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
        fontStyle: action.status === 'running' ? 'normal' : 'normal',
      }}>{action.argsPreview}</span>
    </div>
  );
}

// ── SubagentPanel — shows spawned subagents in a compact list ──────────────

function roleIcon(role: string): string {
  switch (role) {
    case 'researcher': return 'R';
    case 'analyzer': return 'A';
    case 'synthesizer': return 'S';
    case 'validator': return 'V';
    case 'strategist': return 'T';
    case 'compressor': return 'C';
    case 'evaluator': return 'E';
    default: return role.charAt(0).toUpperCase();
  }
}

function roleColor(role: string): string {
  switch (role) {
    case 'researcher': return 'rgba(43,121,255,0.7)';
    case 'analyzer': return 'rgba(168,85,247,0.7)';
    case 'synthesizer': return 'rgba(16,185,129,0.7)';
    case 'validator': return 'rgba(245,158,11,0.7)';
    case 'strategist': return 'rgba(239,68,68,0.7)';
    case 'compressor': return 'rgba(100,116,139,0.7)';
    case 'evaluator': return 'rgba(251,146,60,0.7)';
    default: return 'rgba(255,255,255,0.4)';
  }
}

function SubagentPanel({ subagents }: { subagents: SubagentInfo[] }) {
  const [expanded, setExpanded] = useState(false);

  if (subagents.length === 0) return null;

  const activeCount = subagents.filter(s => s.status === 'spawning' || s.status === 'running').length;
  const completeCount = subagents.filter(s => s.status === 'complete').length;
  const failedCount = subagents.filter(s => s.status === 'failed').length;
  const totalTokens = subagents.reduce((s, a) => s + (a.tokens || 0), 0);
  const allDone = activeCount === 0;

  return (
    <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
      {/* Header row — collapsed summary */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
        style={{ borderBottom: expanded ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
      >
        {/* Status indicator */}
        {allDone ? (
          <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <CheckIcon size={8} />
          </div>
        ) : (
          <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#2B79FF' }} />
        )}

        {/* Label */}
        <span className="text-[11px] font-medium flex-1" style={{ color: allDone ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.65)' }}>
          {allDone
            ? `${subagents.length} agent${subagents.length !== 1 ? 's' : ''} complete — ${formatTokens(totalTokens)} tokens`
            : `${activeCount} agent${activeCount !== 1 ? 's' : ''} running${completeCount > 0 ? ` · ${completeCount} done` : ''}`}
          {failedCount > 0 && <span style={{ color: 'rgba(239,68,68,0.6)' }}> · {failedCount} failed</span>}
        </span>

        {/* Role badges (collapsed) */}
        {!expanded && (
          <div className="flex gap-1">
            {subagents.map(sa => (
              <span key={sa.agentId} className="text-[9px] font-bold w-4 h-4 rounded flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', color: roleColor(sa.role) }}>
                {roleIcon(sa.role)}
              </span>
            ))}
          </div>
        )}

        <span style={{ color: 'rgba(255,255,255,0.2)' }}><ChevronIcon open={expanded} /></span>
      </button>

      {/* Expanded rows */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="px-3 py-2 space-y-1.5">
              {subagents.map(sa => (
                <div key={sa.agentId} className="flex items-start gap-2.5">
                  {/* Status icon */}
                  <div className="shrink-0 mt-0.5">
                    {sa.status === 'complete' ? (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                        <CheckIcon size={7} />
                      </div>
                    ) : sa.status === 'failed' ? (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                        <XIcon />
                      </div>
                    ) : (
                      <span className="w-2 h-2 mt-1 rounded-full block animate-pulse" style={{ background: roleColor(sa.role) }} />
                    )}
                  </div>

                  {/* Role badge */}
                  <span className="text-[9px] font-bold shrink-0 px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: roleColor(sa.role) }}>
                    {sa.role}
                  </span>

                  {/* Task text */}
                  <span className="text-[11px] flex-1 leading-snug" style={{ color: sa.status === 'complete' ? 'rgba(255,255,255,0.35)' : sa.status === 'failed' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.6)' }}>
                    {sa.error ? sa.error.slice(0, 80) : sa.task.slice(0, 80)}
                  </span>

                  {/* Token count */}
                  {sa.tokens != null && sa.tokens > 0 && (
                    <span className="text-[9px] shrink-0 font-sans" style={{ color: 'rgba(255,255,255,0.18)' }}>{formatTokens(sa.tokens!)}</span>
                  )}

                  {/* Confidence pill */}
                  {sa.status === 'complete' && sa.confidence != null && (
                    <span className="text-[9px] shrink-0 px-1 rounded" style={{ background: sa.confidence > 0.7 ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', color: sa.confidence > 0.7 ? 'rgba(34,197,94,0.6)' : 'rgba(245,158,11,0.6)' }}>
                      {Math.round(sa.confidence * 100)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ── StepCardView — Manus-style collapsible step block ──────────────────────

function StepCardView({ step }: { step: StepCard }) {
  const [expanded, setExpanded] = useState(step.status === 'active');
  // Expand when active, collapse when done
  useEffect(() => {
    if (step.status === 'active') setExpanded(true);
    else if (step.status === 'done') setExpanded(false);
  }, [step.status]);

  // Use entries if available, else fall back to legacy thinkingText + actions
  const entries: StepEntry[] = step.entries && step.entries.length > 0
    ? step.entries
    : [
        ...(step.thinkingText ? [{ type: 'text' as const, content: step.thinkingText }] : []),
        ...step.actions.map(a => ({ type: 'action' as const, pill: a })),
      ];

  // Title to show in header
  const headerTitle = step.title || (step.isThinking ? 'Thinking...' : 'Working...');

  return (
    <div className="mt-2.5">
      {/* Step header: ▼ Title   ∧ (chevron) */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {/* Leading triangle — ▶ collapsed / ▼ expanded */}
        <span className="shrink-0 text-[10px]" style={{ color: 'rgba(255,255,255,0.25)', lineHeight: 1, marginTop: 1, transition: 'transform 0.15s ease', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        {/* Title */}
        {step.isThinking && !step.title ? (
          <TextShimmer
            className="text-[13px] font-medium flex-1 leading-snug [--shimmer-base:rgba(255,255,255,0.35)] [--shimmer-highlight:rgba(255,255,255,0.85)]"
            duration={1.8}
          >
            Thinking...
          </TextShimmer>
        ) : (
          <span
            className="text-[13px] font-medium flex-1 leading-snug"
            style={{ color: step.status === 'active' ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.45)' }}
          >
            {headerTitle}
          </span>
        )}
        {/* Trailing chevron */}
        <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.18)' }}>
          <ChevronIcon open={expanded} />
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-2 ml-5 space-y-1.5">
              {/* Interleaved text + action entries */}
              {entries.map((entry, idx) => {
                if (entry.type === 'text') {
                  const isLast = idx === entries.length - 1;
                  // Live thinking stream: show as italic grey blurred text
                  if (isLast && step.isThinking) {
                    return (
                      <div key={`t-${idx}`} className="relative overflow-hidden rounded-lg" style={{ maxHeight: 120, maxWidth: '85%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '8px 10px' }}>
                        <p
                          className="text-[12px] leading-relaxed whitespace-pre-wrap"
                          style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}
                        >
                          {entry.content.slice(-400)}
                        </p>
                        {/* Fade-out at bottom */}
                        <div className="rounded-b-lg" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, background: 'linear-gradient(transparent, rgba(16,16,20,0.95))' }} />
                      </div>
                    );
                  }
                  // Completed thinking text — show brief description in a contained card
                  const brief = entry.content.length > 160 ? entry.content.slice(0, 157) + '...' : entry.content;
                  return (
                    <div key={`t-${idx}`} className="rounded-lg" style={{ maxWidth: '85%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '6px 10px' }}>
                      <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                        {brief}
                      </p>
                    </div>
                  );
                }
                // Action entry: ◎ text (Manus style)
                const wsResult = entry.pill.status === 'done' && entry.pill.result
                  ? renderWorkspaceResult(entry.pill.toolName, entry.pill.result)
                  : null;
                return (
                  <div key={entry.pill.id}>
                    <ActionPillView action={entry.pill} />
                    {wsResult}
                  </div>
                );
              })}

              {/* Subagent panel — rendered inside expanded step card */}
              {step.subagents && step.subagents.length > 0 && (
                <SubagentPanel subagents={step.subagents} />
              )}

              {/* Browser preview thumbnail */}
              {step.browserUrl && (
                <div className="mt-2 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', maxWidth: 280 }}>
                  <div className="px-2 py-1.5 flex items-center gap-1.5">
                    <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}><GlobeIcon /></span>
                    <span className="text-[9px] font-sans truncate flex-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{step.browserUrl}</span>
                    <a href={step.browserUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[8px] font-medium px-1 py-0.5 rounded" style={{ color: 'rgba(43,121,255,0.5)', background: 'rgba(43,121,255,0.07)' }} onClick={e => e.stopPropagation()}>open</a>
                  </div>
                  {step.browserScreenshot && (
                    <img src={`data:image/jpeg;base64,${step.browserScreenshot}`} alt="Page screenshot" className="w-full block" style={{ maxHeight: 160, objectFit: 'cover', objectPosition: 'top' }} />
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── BottomStatusBar — Manus-style fixed bar above input ────────────────────
// Shows: [browser thumb] · current step title · N/M · Thinking (blue dot)

interface BottomStatusBarProps {
  steps: StepCard[];
  isWorking: boolean;
  currentToolName?: string;
}

function BottomStatusBar({ steps, isWorking, currentToolName }: BottomStatusBarProps) {
  // Only show when there are steps
  if (steps.length === 0) return null;

  const activeStep = steps.find(s => s.status === 'active');
  const completedCount = steps.filter(s => s.status === 'done').length;
  const totalCount = steps.length;

  // Title: use active step title, or last step title, or generic
  const title = activeStep?.title || steps[steps.length - 1]?.title || 'Working...';
  // Browser screenshot from active or last browsing step
  const browserThumb = (() => {
    const browsing = [...steps].reverse().find(s => s.browserScreenshot);
    return browsing?.browserScreenshot || null;
  })();

  // Status label right side
  const statusText = !isWorking ? 'Done' : currentToolName ? getActivityLabel(currentToolName) : 'Thinking';

  return (
    <div
      style={{
        background: 'rgba(10,10,14,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
      className="flex items-center gap-3 px-4 py-2"
    >
      {/* Left: browser thumbnail (small) */}
      <div
        className="shrink-0 rounded overflow-hidden"
        style={{
          width: 32,
          height: 22,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {browserThumb ? (
          <img
            src={`data:image/jpeg;base64,${browserThumb}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.12)' }}>
            <GlobeIcon />
          </div>
        )}
      </div>

      {/* Center: current step title truncated */}
      <span className="flex-1 min-w-0 text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {title}
      </span>

      {/* Right: N/M · Thinking + pulsing dot */}
      <div className="shrink-0 flex items-center gap-1.5">
        <span className="text-[10px] font-sans tabular-nums" style={{ color: 'rgba(255,255,255,0.28)' }}>
          {completedCount}/{totalCount}
        </span>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>·</span>
        <span className="text-[10px]" style={{ color: isWorking ? 'rgba(255,255,255,0.55)' : 'rgba(34,197,94,0.7)' }}>
          {statusText}
        </span>
        {isWorking && (
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
            style={{ background: '#2B79FF' }}
          />
        )}
      </div>
    </div>
  );
}

// ── NomadLogo ──────────────────────────────────────────────────────────────

function NomadLogo() {
  return (
    <div
      className="w-7 h-7 rounded-lg shrink-0"
      style={{
        background: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 50%, #6366f1 100%)',
        boxShadow: '0 0 12px rgba(59, 130, 246, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
      }}
    />
  );
}

// ── ConversationSidebar ────────────────────────────────────────────────────

function ConversationSidebar({ groups, currentId, onSelect, onDelete, onNewChat, onRename, isCollapsed, onClose }: {
  groups: GroupedConversations[]; currentId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void; onNewChat: () => void; onRename: (id: string, title: string) => void; isCollapsed: boolean; onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (ts: number) => {
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  return (
    <AnimatePresence>
      {!isCollapsed && (
        <>
          {/* Scrim backdrop -- click anywhere to close */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-40 cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={onClose}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            role="button"
            tabIndex={0}
            aria-label="Close sidebar"
          />
          {/* Sidebar panel */}
          <motion.div
            initial={{ x: -240, opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -240, opacity: 0.8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="absolute left-0 top-0 bottom-0 z-50 flex flex-col"
            style={{ width: 240, background: 'rgba(12,12,16,0.98)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRight: '1px solid rgba(255,255,255,0.06)', boxShadow: '4px 0 32px rgba(0,0,0,0.5)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 h-11 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>Chats</span>
              <div className="flex items-center gap-1">
                <button onClick={onNewChat} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/[0.05] transition-colors" style={{ color: 'rgba(255,255,255,0.3)' }} title="New chat"><NewChatIcon /></button>
                <button onClick={onClose} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/[0.05] transition-colors" style={{ color: 'rgba(255,255,255,0.25)' }} title="Close"><XIcon /></button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto py-0.5">
              {groups.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>No chats yet</span>
                </div>
              ) : groups.map(group => (
                <div key={group.group}>
                  <div className="px-3 pt-2.5 pb-0.5">
                    <span className="text-[8px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>{group.group}</span>
                  </div>
                  {group.items.map(conv => {
                    const isActive = conv.id === currentId;
                    const isEditing = editingId === conv.id;
                    return (
                      <div key={conv.id} className="group px-1">
                        <div
                          onClick={() => !isEditing && onSelect(conv.id)}
                          onDoubleClick={() => { setEditingId(conv.id); setEditValue(conv.title); }}
                          className="w-full text-left px-2 py-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                          style={{ background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                              className="text-[11px] flex-1 min-w-0 bg-transparent outline-none px-0.5 rounded"
                              style={{ color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.06)' }}
                            />
                          ) : (
                            <span className="text-[11px] flex-1 truncate" style={{ color: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)' }}>
                              {conv.title}
                            </span>
                          )}
                          <span className="text-[9px] shrink-0" style={{ color: 'rgba(255,255,255,0.1)' }}>
                            {formatTime(conv.updatedAt)}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                            className="shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/[0.06]"
                            style={{ color: 'rgba(255,255,255,0.15)' }}
                            title="Delete"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── AttachmentMenu ─────────────────────────────────────────────────────────

function AttachmentMenu({ onClose, onUploadClick }: { onClose: () => void; onUploadClick: () => void }) {
  const items = [
    { icon: <UploadIcon />, label: 'Upload file', desc: 'Add a file to workspace', onClick: onUploadClick },
    { icon: <FolderIcon />, label: 'Add from workspace', desc: 'Reference an existing file', onClick: onClose },
    { icon: <GlobeIcon />, label: 'Browse a URL', desc: 'Fetch and analyze a webpage', onClick: onClose },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }} transition={{ duration: 0.12 }} className="absolute bottom-full left-0 mb-2 rounded-xl overflow-hidden z-30" style={{ background: 'rgba(20,20,24,0.97)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
      {items.map((item, i) => (
        <button key={i} onClick={item.onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]" style={{ borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{item.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{item.label}</div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{item.desc}</div>
          </div>
        </button>
      ))}
    </motion.div>
  );
}

// ── Campaign context builder ────────────────────────────────────────────────

function buildCampaignContext(campaign: Campaign | null, cycle: Cycle | null): CampaignContextData | undefined {
  if (!campaign) return undefined;
  const ctx: CampaignContextData = {
    brand: campaign.brand,
    productDescription: campaign.productDescription || undefined,
    targetAudience: campaign.targetAudience || undefined,
    marketingGoal: campaign.marketingGoal || undefined,
    productFeatures: campaign.productFeatures?.length ? campaign.productFeatures : undefined,
    productPrice: campaign.productPrice || undefined,
  };
  if (cycle) {
    const brandDnaStage = cycle.stages['brand-dna'];
    if (brandDnaStage?.agentOutput) ctx.brandDna = brandDnaStage.agentOutput.slice(0, 2000);
    const personaStage = cycle.stages['persona-dna'];
    if (personaStage?.agentOutput) ctx.personaDna = personaStage.agentOutput.slice(0, 2000);
    const anglesStage = cycle.stages['angles'];
    if (anglesStage?.agentOutput) ctx.angles = anglesStage.agentOutput.slice(0, 1000);
    if (cycle.researchFindings?.deepDesires?.length) {
      const desires = cycle.researchFindings.deepDesires
        .slice(0, 3)
        .map(d => `• ${d.deepestDesire}`)
        .join('\n');
      ctx.researchSummary = `Top customer desires:\n${desires}`;
    }
  }
  return ctx;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function AgentPanel() {
  const { campaign, currentCycle } = useCampaign();
  const [blocks, setBlocks] = useState<MessageBlock[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [currentToolName, setCurrentToolName] = useState<string | undefined>();
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  /** True when user has manually scrolled up -- freezes auto-scroll until they return to bottom */
  const userScrolledUpRef = useRef(false);
  const [askUserPrompt, setAskUserPrompt] = useState<{ question: string; options: string[]; resolve: (answer: string) => void } | null>(null);
  const [askUserInput, setAskUserInput] = useState('');
  const taskProgressRef = useRef<TaskProgress | null>(null);
  const [workspaceId, setWorkspaceId] = useState(() => generateWorkspaceId());
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [sessionMemories, setSessionMemories] = useState<Array<{ key: string; content: string }>>([]);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const dragCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenBlockContentRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const injectedMessagesRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeBlockIdRef = useRef<string | null>(null);
  const activeStepIdRef = useRef<string | null>(null);
  /** Tracks how much thinking text was already committed before last tool_start */
  const committedThinkingLenRef = useRef<number>(0);

  // Chat history
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [conversationGroups, setConversationGroups] = useState<GroupedConversations[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userMsgCountRef = useRef<number>(0);

  const refreshConversationList = useCallback(async () => {
    const groups = await listConversations();
    setConversationGroups(groups);
  }, []);

  useEffect(() => { refreshConversationList(); }, [refreshConversationList]);

  // Abort any running agent loop on unmount to prevent background fetch leaks
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort('unmount');
        abortRef.current = null;
      }
    };
  }, []);

  // Load memories on mount — user profile + persisted memoryStore entries
  useEffect(() => {
    const loaded: Array<{ key: string; content: string }> = [];

    // 1. User profile memories (name, style, preferences, expertise)
    const profileMems = getUserMemories();
    loaded.push(...profileMems);

    // 2. Persisted memoryStore entries (max 30, newest first)
    const stored = getMemories();
    stored.slice(0, 30).forEach(m => {
      // Skip seed memories with do-not-surface tag — they are already in the profile
      if (m.tags.includes('do-not-surface-unprompted')) return;
      const key = m.tags[0] || m.type;
      loaded.push({ key, content: m.content });
    });

    setSessionMemories(loaded);
    touchUserProfile();
  }, []);

  // Auto-save (debounced) — preserves existing LLM-generated title if one exists
  useEffect(() => {
    if (blocks.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      // Check if conversation already has an LLM-generated title
      const existing = await loadConversation(conversationId);
      let title: string;
      if (existing && existing.title && existing.title !== 'New conversation' && !existing.title.endsWith('...')) {
        // Keep the existing LLM-generated title
        title = existing.title;
      } else {
        // Fallback: derive from first user message
        const firstUser = blocks.find(b => b.type === 'user');
        title = firstUser ? (firstUser.content.length > 50 ? firstUser.content.slice(0, 47) + '...' : firstUser.content) : 'New conversation';
      }
      const conv: Conversation = {
        id: conversationId, title, messages: blocks as StoredMessageBlock[],
        createdAt: blocks[0]?.timestamp || Date.now(), updatedAt: Date.now(),
        workspaceId, messageCount: blocks.filter(b => b.type === 'user' || b.type === 'agent').length,
      };
      await saveConversation(conv);
      refreshConversationList();
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [blocks, conversationId, workspaceId, refreshConversationList]);

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort(); abortRef.current = null;
    setStatus('idle'); taskProgressRef.current = null;
    activeBlockIdRef.current = null; activeStepIdRef.current = null;
    setBlocks([]); setConversationId(crypto.randomUUID());
    seenBlockContentRef.current.clear();
    userMsgCountRef.current = 0;
    setWorkspaceId(generateWorkspaceId()); setWorkspaceFiles([]);
    setInput(''); setAskUserPrompt(null); setAskUserInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSelectConversation = useCallback(async (id: string) => {
    if (id === conversationId) return;
    abortRef.current?.abort(); abortRef.current = null;
    setStatus('idle'); taskProgressRef.current = null;
    activeBlockIdRef.current = null; activeStepIdRef.current = null;
    const conv = await loadConversation(id);
    if (!conv) return;
    setConversationId(conv.id); setBlocks(conv.messages as MessageBlock[]);
    seenBlockContentRef.current.clear();
    userMsgCountRef.current = conv.messages.filter(m => m.type === 'user').length;
    setWorkspaceId(conv.workspaceId); setWorkspaceFiles([]);
    setAskUserPrompt(null); setAskUserInput(''); setInput('');
  }, [conversationId]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    if (id === conversationId) handleNewChat();
    refreshConversationList();
  }, [conversationId, handleNewChat, refreshConversationList]);

  const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
    const conv = await loadConversation(id);
    if (!conv) return;
    conv.title = newTitle;
    await saveConversation(conv);
    refreshConversationList();
  }, [refreshConversationList]);

  /** Fire-and-forget: generate a short LLM title if the message count hits a retitle checkpoint */
  const maybeRetitle = useCallback((currentBlocks: MessageBlock[], convId: string) => {
    const userCount = currentBlocks.filter(b => b.type === 'user').length;
    if (!shouldRetitle(userCount)) return;

    // Fire-and-forget -- don't await, don't block UI
    generateConversationTitle(currentBlocks as StoredMessageBlock[]).then(async (title) => {
      if (!title) return;
      const conv = await loadConversation(convId);
      if (!conv) return;
      conv.title = title;
      await saveConversation(conv);
      refreshConversationList();
    }).catch(() => { /* swallow -- keep existing title */ });
  }, [refreshConversationList]);

  const scrollToBottom = useCallback(() => {
    // Clear the frozen-scroll flag so auto-scroll resumes
    userScrolledUpRef.current = false;
    setShowScrollBtn(false);
    requestAnimationFrame(() => {
      const c = scrollContainerRef.current;
      if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  // Track previous block count to detect when a new block is appended vs content update.
  const blockCountRef = useRef(0);
  // Scroll when a new message block appears (not just a content update on existing ones).
  // Skips if user has manually scrolled up to read history.
  useEffect(() => {
    const prevCount = blockCountRef.current;
    blockCountRef.current = blocks.length;
    if (blocks.length > prevCount && !userScrolledUpRef.current) {
      scrollToBottom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.length]);

  // Auto-scroll when DOM content grows (streaming tokens, new steps)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new MutationObserver(() => {
      // Respect user scroll: if they've scrolled up to read history, do not auto-scroll
      if (userScrolledUpRef.current) return;
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (nearBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
      }
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const scrolledUp = distFromBottom > 120;
    // Freeze / unfreeze auto-scroll based on user position
    userScrolledUpRef.current = scrolledUp;
    setShowScrollBtn(scrolledUp);
  }, []);

  const isWorking = status === 'routing' || status === 'thinking' || status === 'streaming';

  // Convert current agent block's StepCards to StepConfig[] for AgentUIWrapper
  const agentSteps: StepConfig[] = (() => {
    const activeBlock = blocks.find(b => b.id === activeBlockIdRef.current);
    const steps = activeBlock?.steps || [];
    if (steps.length === 0) return [];
    return steps.map((s): StepConfig => ({
      id: s.id,
      title: s.title,
      status: s.status === 'active' ? 'active' : s.status === 'done' ? 'completed' : 'pending',
      isThinking: s.isThinking,
      liveThinkingText: (s.entries.find(e => e.type === 'text' && s.isThinking) as { type: 'text'; content: string } | undefined)?.content,
      subItems: s.entries
        .filter(e => e.type === 'action')
        .map(e => {
          const pill = (e as { type: 'action'; pill: ActionPill }).pill;
          return {
            id: pill.id,
            type: pill.status === 'done' ? 'completed' as const : pill.status === 'running' ? 'query' as const : 'pending' as const,
            label: `${pill.toolName}: ${pill.argsPreview}`,
          };
        }),
    }));
  })();

  // Show the AgentUIWrapper overview panel when there are steps to display
  const [stepOverviewOpen, setStepOverviewOpen] = useState(false);

  const refreshWorkspaceFiles = useCallback(async () => {
    const result = await workspaceListDetailed(workspaceId);
    if (result.success) setWorkspaceFiles(result.files);
  }, [workspaceId]);

  // Seed default folder structure whenever a new workspace is created
  useEffect(() => {
    seedWorkspace(workspaceId).then(() => refreshWorkspaceFiles());
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current++; if (e.dataTransfer.types.includes('Files')) setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCountRef.current--; if (dragCountRef.current <= 0) { dragCountRef.current = 0; setIsDragOver(false); } }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false); dragCountRef.current = 0;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    await ensureWorkspace(workspaceId);
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const result = await workspaceSaveBinary(workspaceId, file.name, buf);
      setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'upload' as const, content: '', uploadFilename: file.name, uploadSize: result.sizeStr, timestamp: Date.now() }]);
    }
    refreshWorkspaceFiles();
  }, [workspaceId, refreshWorkspaceFiles]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await ensureWorkspace(workspaceId);
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const result = await workspaceSaveBinary(workspaceId, file.name, buf);
      setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'upload' as const, content: '', uploadFilename: file.name, uploadSize: result.sizeStr, timestamp: Date.now() }]);
    }
    refreshWorkspaceFiles();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [workspaceId, refreshWorkspaceFiles]);

  // ── Attachment helpers (paste / drop into chat input) ──────────────────

  const fileToAttachment = useCallback((file: File): Promise<ChatAttachment | null> => {
    return new Promise((resolve) => {
      if (IMAGE_ACCEPT.includes(file.type)) {
        const reader = new FileReader();
        reader.onload = () => resolve({ id: crypto.randomUUID(), dataUrl: reader.result as string, name: file.name, type: 'image' });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else if (TEXT_ACCEPT.includes(file.type) || file.name.endsWith('.md') || file.name.endsWith('.txt') || file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = () => resolve({ id: crypto.randomUUID(), dataUrl: '', name: file.name, type: 'text', textContent: reader.result as string });
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      } else {
        resolve(null);
      }
    });
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const fileItems = items.filter(item => item.kind === 'file' && (IMAGE_ACCEPT.includes(item.type) || TEXT_ACCEPT.includes(item.type)));
    if (fileItems.length === 0) return;
    e.preventDefault();
    const newAttachments: ChatAttachment[] = [];
    for (const item of fileItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const att = await fileToAttachment(file);
      if (att) newAttachments.push(att);
    }
    if (newAttachments.length > 0) setAttachments(prev => [...prev, ...newAttachments]);
  }, [fileToAttachment]);

  const handleInputDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false); dragCountRef.current = 0;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const newAttachments: ChatAttachment[] = [];
    for (const file of files) {
      const att = await fileToAttachment(file);
      if (att) newAttachments.push(att);
    }
    const unhandledFiles = files.filter(f => !IMAGE_ACCEPT.includes(f.type) && !TEXT_ACCEPT.includes(f.type) && !f.name.endsWith('.md') && !f.name.endsWith('.txt') && !f.name.endsWith('.json'));
    if (unhandledFiles.length > 0) {
      await ensureWorkspace(workspaceId);
      for (const file of unhandledFiles) {
        const buf = await file.arrayBuffer();
        const result = await workspaceSaveBinary(workspaceId, file.name, buf);
        setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'upload' as const, content: '', uploadFilename: file.name, uploadSize: result.sizeStr, timestamp: Date.now() }]);
      }
      refreshWorkspaceFiles();
    }
    if (newAttachments.length > 0) setAttachments(prev => [...prev, ...newAttachments]);
  }, [fileToAttachment, workspaceId, refreshWorkspaceFiles]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const ensureAgentBlock = useCallback((): string => {
    if (activeBlockIdRef.current) return activeBlockIdRef.current;
    const blockId = crypto.randomUUID();
    activeBlockIdRef.current = blockId;
    setBlocks(prev => [...prev, { id: blockId, type: 'agent' as const, content: '', steps: [], timestamp: Date.now(), startedAt: Date.now(), tokenCount: 0 }]);
    return blockId;
  }, []);

  const addStepToBlock = useCallback((blockId: string, step: StepCard) => {
    activeStepIdRef.current = step.id;
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, steps: [...(b.steps || []), step] } : b));
  }, []);

  const updateCurrentStep = useCallback((updater: (step: StepCard) => StepCard) => {
    const stepId = activeStepIdRef.current; const blockId = activeBlockIdRef.current;
    if (!stepId || !blockId) return;
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, steps: (b.steps || []).map(s => s.id === stepId ? updater(s) : s) } : b));
  }, []);

  const completeCurrentStep = useCallback(() => {
    updateCurrentStep(s => ({ ...s, status: 'done', isThinking: false }));
    activeStepIdRef.current = null;
  }, [updateCurrentStep]);

  const handleSubmit = async () => {
    const text = input.trim();
    const currentAttachments = [...attachments];
    if (!text && currentAttachments.length === 0) return;

    // Build attachment context string for the agent
    let attachmentContext = '';
    if (currentAttachments.length > 0) {
      const parts: string[] = [];
      for (const att of currentAttachments) {
        if (att.type === 'image') {
          parts.push(`[Attached image: ${att.name}] (base64 data available)`);
        } else if (att.type === 'text' && att.textContent) {
          const preview = att.textContent.length > 2000 ? att.textContent.slice(0, 2000) + '...(truncated)' : att.textContent;
          parts.push(`[Attached file: ${att.name}]\n\`\`\`\n${preview}\n\`\`\``);
        }
      }
      attachmentContext = '\n\n' + parts.join('\n\n');
    }
    const fullMessage = (text || '') + attachmentContext;

    if (isWorking) {
      injectedMessagesRef.current.push(fullMessage);
      userMsgCountRef.current += 1;
      setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'user' as const, content: text || '(attached files)', attachments: currentAttachments.length > 0 ? currentAttachments : undefined, timestamp: Date.now() }]);
      setInput(''); setAttachments([]); if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.focus(); }
      return;
    }
    userMsgCountRef.current += 1;
    setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'user' as const, content: text || '(attached files)', attachments: currentAttachments.length > 0 ? currentAttachments : undefined, timestamp: Date.now() }]);
    setInput(''); setAttachments([]); if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.focus(); }
    setStatus('routing');
    const controller = new AbortController(); abortRef.current = controller;
    activeBlockIdRef.current = null; activeStepIdRef.current = null;
    const conversationHistory = blocks.filter(b => b.type === 'user' || b.type === 'agent').map(b => `${b.type === 'user' ? 'User' : 'Assistant'}: ${b.content}`).join('\n\n');

    try {
      // Build initial memories: profile + stored + campaign context snapshot
      const campaignCtx = buildCampaignContext(campaign, currentCycle);
      const campaignMemories: Array<{ key: string; content: string }> = [];
      if (campaignCtx) {
        if (campaignCtx.brand) campaignMemories.push({ key: 'brand', content: campaignCtx.brand });
        if (campaignCtx.productDescription) campaignMemories.push({ key: 'product', content: campaignCtx.productDescription });
        if (campaignCtx.targetAudience) campaignMemories.push({ key: 'audience', content: campaignCtx.targetAudience });
        if (campaignCtx.marketingGoal) campaignMemories.push({ key: 'goal', content: campaignCtx.marketingGoal });
      }
      const allInitialMemories = [...sessionMemories, ...campaignMemories];

      await runAgentLoop(fullMessage, conversationHistory, {
        model: getModelForStage('research'), temperature: 0.7, maxSteps: 999, maxDurationMs: 5 * 60 * 60 * 1000,
        signal: controller.signal, workspaceId,
        campaignContext: campaignCtx,
        initialMemories: allInitialMemories,
        onAskUser: (question, options) => new Promise<string>((resolve) => { setAskUserPrompt({ question, options, resolve }); }),
        getInjectedMessages: () => { const msgs = [...injectedMessagesRef.current]; injectedMessagesRef.current = []; return msgs; },
        onEvent: (event: AgentEngineEvent) => {
          switch (event.type) {
            case 'response_chunk': {
              // Router acknowledgment — show as agent intro text
              if (event.response) {
                const blockId = ensureAgentBlock();
                setBlocks(prev => prev.map(b =>
                  b.id === blockId ? { ...b, content: event.response || '' } : b
                ));
              }
              break;
            }

            case 'thinking_start': {
              setStatus('thinking');
              setCurrentToolName(undefined);
              const blockId = ensureAgentBlock();
              committedThinkingLenRef.current = 0;
              addStepToBlock(blockId, { id: crypto.randomUUID(), title: '', thinkingText: '', isThinking: true, actions: [], entries: [], status: 'active', activityLabel: 'Thinking' });
              break;
            }
            case 'thinking_chunk': {
              if (event.thinking) {
                const raw = event.thinking;
                const idx = raw.indexOf('```tool');
                const clean = idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
                if (event.isThinkingToken) {
                  // Real thinking tokens from json.thinking — stream into collapsible box inside step card
                  updateCurrentStep(s => {
                    const entries = [...s.entries];
                    const last = entries[entries.length - 1];
                    if (last && last.type === 'text') {
                      entries[entries.length - 1] = { type: 'text', content: clean };
                    } else {
                      if (clean) entries.push({ type: 'text', content: clean });
                    }
                    return { ...s, thinkingText: clean, entries };
                  });
                } else {
                  // Response text streaming (no dedicated thinking stream) — derive step title only, no text entry
                  const newPortion = clean.slice(committedThinkingLenRef.current).trim();
                  updateCurrentStep(s => ({ ...s, title: deriveStepTitle(newPortion || clean), thinkingText: clean }));
                }
                // Update token count on the agent block
                const bid = activeBlockIdRef.current;
                if (bid) setBlocks(prev => prev.map(b => b.id === bid ? { ...b, tokenCount: (b.tokenCount || 0) + 1 } : b));
              }
              break;
            }
            case 'thinking_done': updateCurrentStep(s => ({ ...s, isThinking: false })); break;
            case 'tool_start': {
              if (event.toolCall) {
                setStatus('streaming');
                setCurrentToolName(event.toolCall.name);
                const tc: ToolCall = event.toolCall;
                const isBrowser = tc.name === 'browse' || tc.name === 'analyze_page' || tc.name === 'use_computer';
                const url = isBrowser ? String(tc.args.url || tc.args.start_url || '') : undefined;
                const pill: ActionPill = { id: tc.id, toolName: tc.name, argsPreview: actionLabel(tc.name, tc.args), status: 'running' };
                // Commit current thinking length so next thinking_chunk starts a new text entry
                updateCurrentStep(s => {
                  committedThinkingLenRef.current = s.thinkingText.length;
                  return {
                    ...s, isThinking: false, activityLabel: getActivityLabel(tc.name),
                    actions: [...s.actions, pill],
                    entries: [...s.entries, { type: 'action', pill }],
                    ...(url ? { browserUrl: url } : {}),
                  };
                });
              }
              break;
            }
            case 'tool_done': case 'tool_error': {
              setCurrentToolName(undefined);
              if (event.toolCall) {
                const tcId = event.toolCall.id;
                const tcName = event.toolCall.name;
                const ns = event.type === 'tool_done' ? 'done' as const : 'error' as const;
                const result = event.toolCall?.result?.output?.slice(0, 500);

                // BUG-01: extract screenshot from tool result data for browser tools
                const isBrowserTool = ['browse', 'browser_screenshot', 'use_computer', 'analyze_page'].includes(tcName);
                const screenshotBase64: string | undefined = isBrowserTool
                  ? (event.toolCall.result?.data as { image_base64?: string } | undefined)?.image_base64
                  : undefined;

                // BUG-07: extract URL from tool result output for browser URL chip
                const outputText = event.toolCall?.result?.output || '';
                const urlMatch = outputText.match(/https?:\/\/[^\s"']+/);
                const extractedUrl = urlMatch ? urlMatch[0] : undefined;

                updateCurrentStep(s => ({
                  ...s,
                  actions: s.actions.map(a => a.id === tcId ? { ...a, status: ns, result } : a),
                  entries: s.entries.map(e => e.type === 'action' && e.pill.id === tcId ? { type: 'action', pill: { ...e.pill, status: ns, result } } : e),
                  ...(screenshotBase64 ? { browserScreenshot: screenshotBase64 } : {}),
                  ...(extractedUrl ? { browserUrl: extractedUrl } : {}),
                }));
                // Auto-refresh workspace files after filesystem-modifying tools
                if (event.type === 'tool_done' && ['workspace_save', 'workspace_list', 'file_write', 'use_computer', 'sandbox_pull'].includes(tcName)) {
                  refreshWorkspaceFiles();
                }
              }
              break;
            }
            case 'step_complete': completeCurrentStep(); break;
            case 'response_done': {
              if (event.response) {
                const blockId = activeBlockIdRef.current;
                if (blockId) {
                  completeCurrentStep();
                  // Replace content (router ack may have set a placeholder)
                  setBlocks(prev => prev.map(b =>
                    b.id === blockId ? { ...b, content: event.response || '', completedAt: Date.now() } : b
                  ));
                } else {
                  setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'agent' as const, content: event.response || '', steps: [], entries: [], timestamp: Date.now(), completedAt: Date.now() }]);
                }
              }
              break;
            }
            case 'done': {
              // Just clean up refs -- content was already set by response_done
              activeBlockIdRef.current = null; activeStepIdRef.current = null;
              // Auto-title: read current blocks via setState callback, fire-and-forget
              setBlocks(prev => { maybeRetitle(prev, conversationId); return prev; });
              break;
            }
            case 'task_progress': if (event.taskProgress) taskProgressRef.current = event.taskProgress ?? null; break;

            // ── Subagent lifecycle events ──
            case 'subagent_spawn': {
              const sa = event.subagent as SubagentEventData;
              if (!sa) break;
              const newAgent: SubagentInfo = {
                agentId: sa.agentId,
                role: sa.role,
                task: sa.task,
                status: 'spawning',
                tokens: 0,
              };
              updateCurrentStep(s => ({
                ...s,
                subagents: [...(s.subagents || []), newAgent],
              }));
              break;
            }
            case 'subagent_progress': {
              const sa = event.subagent as SubagentEventData;
              if (!sa) break;
              updateCurrentStep(s => ({
                ...s,
                subagents: (s.subagents || []).map(a =>
                  a.agentId === sa.agentId
                    ? { ...a, status: 'running' as const, tokens: sa.tokens ?? a.tokens }
                    : a,
                ),
              }));
              break;
            }
            case 'subagent_complete': {
              const sa = event.subagent as SubagentEventData;
              if (!sa) break;
              updateCurrentStep(s => ({
                ...s,
                subagents: (s.subagents || []).map(a =>
                  a.agentId === sa.agentId
                    ? { ...a, status: 'complete' as const, tokens: sa.tokens ?? a.tokens, result: sa.result, confidence: sa.confidence }
                    : a,
                ),
              }));
              break;
            }
            case 'subagent_failed': {
              const sa = event.subagent as SubagentEventData;
              if (!sa) break;
              updateCurrentStep(s => ({
                ...s,
                subagents: (s.subagents || []).map(a =>
                  a.agentId === sa.agentId
                    ? { ...a, status: 'failed' as const, error: sa.error }
                    : a,
                ),
              }));
              break;
            }

            case 'error': {
              completeCurrentStep();
              setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'agent' as const, content: `Error: ${event.error || 'Unknown error'}`, steps: [], timestamp: Date.now(), completedAt: Date.now() }]);
              activeBlockIdRef.current = null; activeStepIdRef.current = null;
              break;
            }
          }
        },
      });
      setStatus('idle'); taskProgressRef.current = null; abortRef.current = null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAbort = (err instanceof DOMException && err.name === 'AbortError')
        || (err instanceof Error && err.name === 'AbortError')
        || msg.toLowerCase().includes('abort')
        || msg.toLowerCase().includes('stopped');
      if (isAbort) { setStatus('idle'); }
      else {
        setStatus('error');
        const friendly = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('econnrefused')
          ? "Can't reach Ollama — check your connection in Settings"
          : msg;
        setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'agent' as const, content: friendly, steps: [], timestamp: Date.now() }]);
      }
      activeBlockIdRef.current = null; activeStepIdRef.current = null; abortRef.current = null;
    }
  };

  const handleStop = () => {
    // Abort the controller — this propagates to all running tools via signal
    abortRef.current?.abort('stopped');
    abortRef.current = null;
    setStatus('idle'); taskProgressRef.current = null;
    setCurrentToolName(undefined);
    // Mark any in-progress steps as done and set error pills
    const blockId = activeBlockIdRef.current;
    const stepId = activeStepIdRef.current;
    if (blockId && stepId) {
      setBlocks(prev => prev.map(b => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          completedAt: Date.now(),
          steps: (b.steps || []).map(s => {
            if (s.id !== stepId) return s;
            return {
              ...s,
              status: 'done' as const,
              isThinking: false,
              activityLabel: 'Stopped',
              actions: s.actions.map(a => a.status === 'running' ? { ...a, status: 'error' as const, result: 'Aborted by user' } : a),
              entries: s.entries.map(e => e.type === 'action' && e.pill.status === 'running' ? { type: 'action' as const, pill: { ...e.pill, status: 'error' as const, result: 'Aborted by user' } } : e),
            };
          }),
        };
      }));
    }
    activeBlockIdRef.current = null; activeStepIdRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };

  const isEmpty = blocks.length === 0;
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ background: 'transparent', minHeight: 0 }}>
      {/* Overlay Conversation Sidebar */}
      <ConversationSidebar groups={conversationGroups} currentId={blocks.length > 0 ? conversationId : null} onSelect={(id) => { handleSelectConversation(id); setSidebarOpen(false); }} onDelete={handleDeleteConversation} onNewChat={() => { handleNewChat(); setSidebarOpen(false); }} onRename={handleRenameConversation} isCollapsed={!sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Toolbar strip ─────────────────────────────────────────────── */}
      <div
        className="h-10 shrink-0 flex items-center justify-between px-2 z-30 relative"
        style={{ background: 'rgba(15,15,18,0.6)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        {/* Left side */}
        <div className="flex items-center gap-1">
          <button onClick={() => setSidebarOpen(o => !o)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]" style={{ color: sidebarOpen ? 'rgba(43,121,255,0.8)' : 'rgba(255,255,255,0.35)' }} title="Chat history">
            <SidebarToggleIcon open={sidebarOpen} />
          </button>
          <button onClick={handleNewChat} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]" style={{ color: 'rgba(255,255,255,0.35)' }} title="New chat">
            <NewChatIcon />
          </button>
        </div>
        {/* Right side */}
        <div className="flex items-center gap-1">
          {/* Workspace button (opens Files + Memory modal) */}
          <button
            onClick={() => { setShowWorkspaceModal(true); refreshWorkspaceFiles(); }}
            className="h-7 px-2.5 rounded-lg flex items-center gap-1.5 transition-all hover:bg-white/[0.06] text-[11px] font-medium"
            style={{ color: showWorkspaceModal ? 'rgba(43,121,255,0.8)' : 'rgba(255,255,255,0.35)' }}
            title={getWorkspacePath(workspaceId)}
          >
            <FolderIcon />
            <span>Workspace</span>
            {(workspaceFiles.length > 0 || sessionMemories.length > 0) && (
              <span className="text-[9px] px-1 rounded-full tabular-nums" style={{ background: 'rgba(43,121,255,0.12)', color: 'rgba(43,121,255,0.7)' }}>
                {workspaceFiles.length + sessionMemories.length}
              </span>
            )}
          </button>
          {/* Step overview toggle */}
          {agentSteps.length > 0 && (
            <button
              onClick={() => setStepOverviewOpen(o => !o)}
              className="h-7 px-2.5 rounded-lg flex items-center gap-1.5 transition-all hover:bg-white/[0.06] text-[11px] font-medium"
              style={{ color: stepOverviewOpen ? 'rgba(43,121,255,0.8)' : 'rgba(255,255,255,0.35)' }}
              title="Toggle step overview"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: isWorking ? '#2B79FF' : 'rgba(34,197,94,0.8)' }} />
              Steps {agentSteps.filter(s => s.status === 'completed').length}/{agentSteps.length}
            </button>
          )}
        </div>
      </div>

      {/* ── Workspace Modal (Files + Memory) ──────────────────────── */}
      <WorkspaceModal
        isOpen={showWorkspaceModal}
        onClose={() => setShowWorkspaceModal(false)}
        memories={sessionMemories}
        onDeleteMemory={(index) => {
          const removed = sessionMemories[index];
          if (removed) {
            const stored = getMemories();
            const match = stored.find(m => m.content === removed.content);
            if (match) deleteMemory(match.id);
            setSessionMemories(prev => prev.filter((_, i) => i !== index));
          }
        }}
        onAddMemory={(key, content) => {
          setSessionMemories(prev => [...prev, { key, content }]);
        }}
        onEditMemory={(index, key, content) => {
          setSessionMemories(prev => prev.map((m, i) => i === index ? { key, content } : m));
        }}
        workspaceFiles={workspaceFiles}
        onUploadFile={() => fileInputRef.current?.click()}
        onCreateFolder={async (name) => {
          await workspaceMkdir(workspaceId, name);
          refreshWorkspaceFiles();
        }}
        workspacePath={getWorkspacePath(workspaceId)}
      />

      {/* AgentUIWrapper step overview panel (right-side slide-in) */}
      <AnimatePresence>
        {stepOverviewOpen && agentSteps.length > 0 && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="absolute top-0 right-0 bottom-0 z-[25] w-72 shadow-2xl"
            style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}
          >
            <AgentUIWrapper
              taskDescription={blocks.find(b => b.type === 'user')?.content || 'Agent task in progress'}
              steps={agentSteps}
              isThinking={isWorking}
              onStepToggle={() => {}}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat area */}
      <div className="flex-1 flex flex-col relative min-w-0 min-h-0" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

        {/* Thin animated progress line at top */}
        {isWorking && (
          <div className="absolute top-0 left-0 right-0 h-[2px] z-10 overflow-hidden" style={{ background: 'rgba(43,121,255,0.08)' }}>
            <div className="h-full" style={{ width: '40%', background: 'linear-gradient(90deg, transparent, #2B79FF, transparent)', animation: 'agentProgressSlide 1.2s ease-in-out infinite' }} />
          </div>
        )}

        {/* Drag overlay */}
        <AnimatePresence>
          {isDragOver && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="absolute inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(10,10,14,0.85)', border: '2px dashed rgba(43,121,255,0.4)', borderRadius: 12 }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(43,121,255,0.12)', border: '1px solid rgba(43,121,255,0.2)' }}><span style={{ color: 'rgba(43,121,255,0.7)' }}><UploadIcon /></span></div>
                <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Drop files to upload to workspace</span>
                <span className="text-[10px] font-sans" style={{ color: 'rgba(255,255,255,0.2)' }}>{getWorkspacePath(workspaceId)}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative" style={{ minHeight: 0 }}>
          {isEmpty ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 min-h-full">
              <img src="/icons/agent.png" alt="Neuro" style={{ width: 44, height: 44, opacity: 0.5 }} className="rounded-xl" />
              <div className="text-center space-y-1.5">
                <p className="text-[15px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>What can I help you with?</p>
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>Search, code, browse, analyze -- autonomous multi-step agent</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full px-6 pt-4 pb-8 flex flex-col gap-5">
              {blocks.map(block => {
                switch (block.type) {
                  case 'user':
                    return (
                      <div key={block.id} className="flex justify-end">
                        {/* Manus-style: right-aligned dark rounded bubble, white text */}
                        <div
                          className="max-w-[75%] px-4 py-2.5"
                          style={{
                            borderRadius: '18px 18px 4px 18px',
                            background: 'rgba(40,40,50,0.95)',
                            border: '1px solid rgba(255,255,255,0.1)',
                          }}
                        >
                          {block.attachments && block.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {block.attachments.map(att => (
                                att.type === 'image' ? (
                                  <img key={att.id} src={att.dataUrl} alt={att.name} className="w-10 h-10 rounded object-cover" style={{ border: '1px solid rgba(255,255,255,0.12)' }} />
                                ) : (
                                  <span key={att.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(43,121,255,0.08)', border: '1px solid rgba(43,121,255,0.15)' }}>
                                    <FileDocIcon />
                                    <span className="text-[10px] max-w-[100px] truncate" style={{ color: 'rgba(43,121,255,0.7)' }}>{att.name}</span>
                                  </span>
                                )
                              ))}
                            </div>
                          )}
                          <p className="text-[13px] leading-[1.6] whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.92)' }}>{block.content}</p>
                        </div>
                      </div>
                    );
                  case 'agent':
                    return (
                      <div key={block.id} className="flex gap-3">
                        {/* Manus agent identity: small globe icon */}
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <GlobeIcon />
                        </div>
                        <div className="flex-1 min-w-0 pt-0">
                          {/* Identity line: "neuro" —  */}
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>neuro</span>
                            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.1)', marginLeft: 4 }}>{formatTime(block.timestamp)}</span>
                            {block.completedAt && block.startedAt && (
                              <span className="text-[10px] font-sans" style={{ color: 'rgba(255,255,255,0.18)' }}>
                                {formatDuration(Math.round((block.completedAt - block.startedAt) / 1000))}{block.tokenCount ? <span style={{ color: 'rgba(43,121,255,0.4)' }}> · {formatTokens(block.tokenCount)}</span> : ''}
                              </span>
                            )}
                            {!block.completedAt && block.startedAt && (
                              <LiveTimer startedAt={block.startedAt} tokenCount={block.tokenCount} />
                            )}
                          </div>
                          {block.content && (() => {
                            const isNew = !seenBlockContentRef.current.has(block.id);
                            if (isNew) seenBlockContentRef.current.add(block.id);
                            const isRecent = !!block.startedAt && (Date.now() - block.startedAt) < 60_000;
                            return <div className="mb-4"><AnimatedAgentText text={block.content} animate={isNew && isRecent} /></div>;
                          })()}
                          {block.steps && block.steps.length > 0 && <div className="mt-1">{block.steps.map(step => <StepCardView key={step.id} step={step} />)}</div>}
                          {!block.content && (!block.steps || block.steps.length === 0) && (status === 'routing' || status === 'thinking') && (
                            <div className="flex items-center gap-2 py-1">
                              <ThinkingMorph size={14} />
                              <TextShimmer className="text-[12px] font-medium [--shimmer-base:rgba(255,255,255,0.4)] [--shimmer-highlight:rgba(255,255,255,0.9)]" duration={1.8}>Thinking</TextShimmer>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  case 'upload':
                    return (
                      <div key={block.id} className="flex justify-end">
                        <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
                          <span style={{ color: 'rgba(34,197,94,0.5)' }}><UploadIcon /></span>
                          <span className="text-[11px] font-medium" style={{ color: 'rgba(34,197,94,0.7)' }}>Uploaded: {block.uploadFilename}</span>
                          <span className="text-[10px] font-sans" style={{ color: 'rgba(255,255,255,0.2)' }}>({block.uploadSize})</span>
                        </div>
                      </div>
                    );
                }
              })}
              {/* Routing indicator (inline, not splash) */}
              {status === 'routing' && <RoutingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        {/* Manus-style bottom status bar — shown when agent has steps */}
        {(() => {
          const activeBlock = blocks.find(b => b.id === activeBlockIdRef.current) || blocks.filter(b => b.type === 'agent' && b.steps && b.steps.length > 0).slice(-1)[0];
          const allSteps = activeBlock?.steps || [];
          return allSteps.length > 0 ? (
            <BottomStatusBar
              steps={allSteps}
              isWorking={isWorking}
              currentToolName={currentToolName}
            />
          ) : null;
        })()}

        {/* Scroll button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }} onClick={scrollToBottom} className="absolute left-1/2 -translate-x-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:brightness-125" style={{ bottom: 130, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(12px)' }}>
              <ArrowDownIcon />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Ask User */}
        {askUserPrompt && (
          <LiquidGlass intensity="medium" className="px-5 py-3 relative z-30" style={{ borderTop: '1px solid rgba(43,121,255,0.12)', borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderBottom: 'none', background: 'rgba(43,121,255,0.04)' }}>
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#2B79FF' }} /><span className="text-[12px] font-medium" style={{ color: 'rgba(43,121,255,0.8)' }}>Agent is asking:</span></div>
              <p className="text-[13px] mb-3" style={{ color: 'rgba(255,255,255,0.75)' }}>{askUserPrompt.question}</p>
              {askUserPrompt.options.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {askUserPrompt.options.map((opt, i) => (
                    <button key={i} onClick={() => { askUserPrompt.resolve(opt); setAskUserPrompt(null); setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'user' as const, content: opt, timestamp: Date.now() }]); }} className="nomad-glass-btn nomad-glass-btn-primary px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ color: 'rgba(43,121,255,0.8)' }}>{opt}</button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={askUserInput} onChange={e => setAskUserInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && askUserInput.trim()) { askUserPrompt.resolve(askUserInput.trim()); setAskUserPrompt(null); setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'user' as const, content: askUserInput.trim(), timestamp: Date.now() }]); setAskUserInput(''); } }} placeholder="Type your answer..." className="flex-1 bg-transparent text-[12px] outline-none px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }} />
                <button onClick={() => { if (askUserInput.trim()) { askUserPrompt.resolve(askUserInput.trim()); setAskUserPrompt(null); setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'user' as const, content: askUserInput.trim(), timestamp: Date.now() }]); setAskUserInput(''); } }} className="nomad-glass-btn nomad-glass-btn-primary px-3 py-2 rounded-lg text-[11px] font-medium" style={{ color: 'rgba(43,121,255,0.8)' }}>Send</button>
              </div>
            </div>
          </LiquidGlass>
        )}

        {/* Input area */}
        <div className="px-5 pb-4 pt-2 relative z-10">
          <div className="max-w-3xl mx-auto w-full">
            <div className="nomad-glass-medium" style={{ borderRadius: 20 }} onDrop={handleInputDrop} onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}>
              {/* Attachment previews */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3.5 pt-3 pb-1">
                  {attachments.map(att => (
                    <div key={att.id} className="relative group flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {att.type === 'image' ? (
                        <img src={att.dataUrl} alt={att.name} className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <span className="w-10 h-10 rounded flex items-center justify-center" style={{ background: 'rgba(43,121,255,0.08)', color: 'rgba(43,121,255,0.6)' }}><FileDocIcon /></span>
                      )}
                      <span className="text-[10px] max-w-[80px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{att.name}</span>
                      <button onClick={() => removeAttachment(att.id)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(239,68,68,0.8)', color: '#fff' }}><XIcon /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 px-3.5 py-3">
                <div className="relative">
                  <button onClick={() => setShowAttachMenu(o => !o)} className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${showAttachMenu ? 'bg-blue-500/10' : 'hover:bg-white/[0.05]'}`} style={{ color: showAttachMenu ? 'rgba(43,121,255,0.7)' : 'rgba(255,255,255,0.25)' }}><PlusIcon /></button>
                  <AnimatePresence>
                    {showAttachMenu && (<><div className="fixed inset-0 z-[25]" onClick={() => setShowAttachMenu(false)} /><AttachmentMenu onClose={() => setShowAttachMenu(false)} onUploadClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }} /></>)}
                  </AnimatePresence>
                </div>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder={isWorking ? "Add instructions..." : "What would you like me to do?"} rows={1} className="flex-1 bg-transparent text-[13px] leading-relaxed resize-none outline-none placeholder:text-white/15" style={{ color: 'rgba(255,255,255,0.85)', minHeight: 24, maxHeight: 120 }} onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }} />
                <VoiceInput
                  onTranscript={() => { /* onInterim already set the text live */ }}
                  onInterim={(text) => setInput(text)}
                  size={32}
                />
                {isWorking ? (
                  <button onClick={handleStop} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-red-500/15" style={{ background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.7)' }}><StopIcon /></button>
                ) : (
                  <button onClick={handleSubmit} disabled={!input.trim() && attachments.length === 0} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-20" style={{ background: (input.trim() || attachments.length > 0) ? 'rgba(43,121,255,0.15)' : 'rgba(255,255,255,0.03)', color: (input.trim() || attachments.length > 0) ? 'rgba(43,121,255,0.9)' : 'rgba(255,255,255,0.15)' }}><ArrowUpIcon /></button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end mt-2 px-1">
              {isWorking && (
                <span className="text-[9px] flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: currentToolName ? 'rgba(34,197,94,0.6)' : 'rgba(43,121,255,0.6)' }} />
                  {statusLabel(status, currentToolName)}
                </span>
              )}
              <span className="text-[9px] font-sans ml-3" style={{ color: 'rgba(255,255,255,0.1)' }}>{getModelForStage('research')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
