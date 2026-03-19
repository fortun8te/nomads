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
import { ProgressiveBlur } from './ProgressiveBlur';
import { runAgentLoop } from '../utils/agentEngine';
import type { TaskProgress, AgentEngineEvent, ToolCall } from '../utils/agentEngine';
import { getModelForStage } from '../utils/modelConfig';
import { generateWorkspaceId, getWorkspacePath, workspaceSaveBinary, workspaceListDetailed, ensureWorkspace, workspacePreview, type WorkspaceFile } from '../utils/workspace';
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
import { FilesystemTree, buildTreeFromFlatFiles, renderWorkspaceResult, type FileNode } from './FilesystemTree';

// ── Types ──────────────────────────────────────────────────────────────────

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
    default: return 'Working';
  }
}

interface MessageBlock {
  id: string;
  timestamp: number;
  type: 'user' | 'agent' | 'upload';
  content: string;
  steps?: StepCard[];
  uploadFilename?: string;
  uploadSize?: string;
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

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
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

function _MessageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function _TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function ComputerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function actionIcon(name: string) {
  if (name === 'use_computer') return <ComputerIcon />;
  if (name.includes('browse') || name.includes('navigate') || name.includes('screenshot') || name.includes('analyze_page')) return <GlobeIcon />;
  if (name.includes('shell') || name.includes('exec') || name.includes('command') || name.includes('run_code')) return <TerminalIcon />;
  if (name.includes('sandbox_pull')) return <UploadIcon />;
  if (name.includes('workspace')) return <FolderIcon />;
  if (name.includes('file') || name.includes('read') || name.includes('write') || name.includes('save')) return <FileIcon />;
  if (name.includes('search') || name.includes('scrape') || name.includes('fetch')) return <SearchIcon />;
  return <ClockIcon />;
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
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>nomad</span>
        </div>
        <div className="flex items-center gap-2">
          <ThinkingMorph size={14} />
          <TextShimmer className="text-[12px] font-medium [--shimmer-base:rgba(43,121,255,0.3)] [--shimmer-highlight:rgba(43,121,255,0.9)]" duration={1.8}>Routing</TextShimmer>
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
      {elapsed}s{tokenCount != null && tokenCount > 0 ? <span style={{ color: 'rgba(43,121,255,0.6)' }}> · {tokenCount}tk</span> : ''}
    </span>
  );
}

// ── ThinkingMorph ──────────────────────────────────────────────────────────

function ThinkingMorph({ size = 18 }: { size?: number }) {
  return (
    <motion.div
      className="shrink-0"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #4d9aff, #2B79FF, #1a5fd4)',
        backgroundSize: '200% 200%',
      }}
      animate={{
        borderRadius: ['50%', '22%', '50%'],
        rotate: [0, 90, 180],
        scale: [0.95, 1.08, 0.95],
        boxShadow: [
          `0 0 ${size * 0.3}px rgba(43,121,255,0.2), 0 0 ${size * 0.6}px rgba(43,121,255,0.06)`,
          `0 0 ${size * 0.5}px rgba(77,154,255,0.35), 0 0 ${size}px rgba(43,121,255,0.12)`,
          `0 0 ${size * 0.3}px rgba(43,121,255,0.2), 0 0 ${size * 0.6}px rgba(43,121,255,0.06)`,
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
    <ResponseStream
      textStream={text}
      mode={isLong ? "typewriter" : "fade"}
      speed={isLong ? 95 : 60}
      fadeDuration={400}
      segmentDelay={15}
      characterChunkSize={isLong ? 8 : undefined}
      className="whitespace-pre-wrap text-[13px] leading-[1.7]"
    />
  );
}

// ── Markdown renderer ──────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

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

// ── ActionPillView ─────────────────────────────────────────────────────────

function ActionPillView({ action }: { action: ActionPill }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{
        background: action.status === 'done' ? 'rgba(34,197,94,0.12)' : action.status === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(43,121,255,0.12)',
        border: `1px solid ${action.status === 'done' ? 'rgba(34,197,94,0.25)' : action.status === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(43,121,255,0.25)'}`,
      }}>
        {action.status === 'done' ? <CheckIcon size={9} /> : action.status === 'error' ? <XIcon /> : <span style={{ color: 'rgba(43,121,255,0.7)' }}>{actionIcon(action.toolName)}</span>}
      </div>
      <span className="text-[11px]" style={{ color: action.status === 'running' ? 'rgba(255,255,255,0.6)' : action.status === 'error' ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.4)' }}>{action.argsPreview}</span>
      {action.status === 'running' && <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#2B79FF' }} />}
    </div>
  );
}

// ── BlurredThinkingBox — live thinking text with progressive blur edges ────

function BlurredThinkingBox({ content }: { content: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll to bottom as content streams in
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [content]);
  return (
    <div className="relative overflow-hidden" style={{ maxHeight: 150 }}>
      <div ref={scrollRef} className="max-h-[150px] overflow-y-auto">
        <ResponseStream
          textStream={content}
          mode="typewriter"
          speed={90}
          characterChunkSize={3}
          className="text-[11px] leading-relaxed whitespace-pre-wrap"
          as="div"
        />
      </div>
      <ProgressiveBlur
        scrollRef={scrollRef}
        height={22}
        maxBlur={3}
        tint="rgba(10, 10, 14, 0.97)"
      />
    </div>
  );
}

// ── StepCardView ───────────────────────────────────────────────────────────

function StepCardView({ step }: { step: StepCard }) {
  const [expanded, setExpanded] = useState(step.status === 'active');
  const [expandedTexts, setExpandedTexts] = useState<Set<number>>(new Set());
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

  const allPills = entries.filter((e): e is { type: 'action'; pill: ActionPill } => e.type === 'action').map(e => e.pill);

  return (
    <div className="mt-3">
      <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2.5 w-full text-left group">
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
          {step.status === 'done' ? (
            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}><CheckIcon size={10} /></div>
          ) : step.status === 'active' ? <ThinkingMorph size={16} /> : (
            <div className="w-4 h-4 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
          )}
        </div>
        <span className="text-[13px] font-medium flex-1 leading-snug" style={{ color: step.status === 'active' ? 'rgba(255,255,255,0.85)' : step.status === 'done' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)' }}>{step.title}</span>
        <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}><ChevronIcon open={expanded} /></span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="mt-2.5 ml-7 space-y-2">
              {/* Interleaved text + action entries */}
              {entries.map((entry, idx) => {
                if (entry.type === 'text') {
                  const isLast = idx === entries.length - 1;
                  const isTextExpanded = expandedTexts.has(idx);
                  // Live thinking: last text entry while still thinking
                  if (isLast && step.isThinking) {
                    return (
                      <BlurredThinkingBox key={`t-${idx}`} content={entry.content} />
                    );
                  }
                  // Completed text (collapsed by default)
                  return (
                    <button key={`t-${idx}`} onClick={() => setExpandedTexts(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; })} className="text-left w-full">
                      <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {isTextExpanded ? entry.content : (entry.content.length > 120 ? entry.content.slice(0, 117) + '...' : entry.content)}
                      </p>
                    </button>
                  );
                }
                // Action pill + optional workspace result tree
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

              {/* Activity indicator */}
              {(step.isThinking || allPills.some(a => a.status === 'running')) && (
                <div className="flex items-center gap-2 py-1">
                  <ThinkingMorph size={14} />
                  <TextShimmer className="text-[12px] font-medium [--shimmer-base:rgba(43,121,255,0.3)] [--shimmer-highlight:rgba(43,121,255,0.9)]" duration={1.8}>{step.activityLabel || 'Thinking'}</TextShimmer>
                </div>
              )}
              {step.browserUrl && (
                <div className="mt-2 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', maxWidth: 240 }}>
                  <div className="px-2 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><div className="flex items-center gap-1.5"><span style={{ color: 'rgba(255,255,255,0.2)' }}><GlobeIcon /></span><span className="text-[9px] font-sans truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>{step.browserUrl}</span></div></div>
                  <div className="h-[120px] flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.02)' }}><span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.12)' }}>Browser preview</span></div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── StickyProgressBar ──────────────────────────────────────────────────────

function StickyProgressBar({ progress }: { progress: TaskProgress }) {
  const [expanded, setExpanded] = useState(false);
  if (progress.totalSteps === 0) return null;
  const activeStep = progress.steps.find(s => s.status === 'active');
  const completedCount = progress.steps.filter(s => s.status === 'done').length;
  const description = activeStep?.description || progress.steps[progress.steps.length - 1]?.description || 'Working...';

  return (
    <div className="sticky bottom-0 z-20">
      <div style={{ background: 'rgba(10,10,14,0.85)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
              <div className="px-4 py-2 space-y-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {progress.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    {step.status === 'done' ? <CheckIcon size={10} /> : step.status === 'active' ? <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#2B79FF' }} /> : <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />}
                    <span className="text-[11px]" style={{ color: step.status === 'active' ? 'rgba(255,255,255,0.7)' : step.status === 'done' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)' }}>{step.description}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left">
          <span style={{ color: 'rgba(255,255,255,0.25)' }}><ClockIcon /></span>
          <span className="text-[11px] font-medium flex-1 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{description}</span>
          <span className="text-[11px] font-sans shrink-0" style={{ color: 'rgba(43,121,255,0.7)' }}>{completedCount}/{progress.totalSteps}</span>
          <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}><ChevronIcon open={expanded} /></span>
        </button>
        <div className="h-0.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <motion.div className="h-full" style={{ background: 'linear-gradient(90deg, #2B79FF, #4d9aff)' }} initial={{ width: '0%' }} animate={{ width: `${(completedCount / progress.totalSteps) * 100}%` }} transition={{ duration: 0.3, ease: 'easeOut' }} />
        </div>
      </div>
    </div>
  );
}

// ── FilePreviewPanel ──────────────────────────────────────────────────────

function FilePreviewPanel({ filename, workspaceId, onClose }: { filename: string; workspaceId: string; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [mimeType, setMimeType] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    workspacePreview(workspaceId, filename).then(result => {
      if (cancelled) return;
      setLoading(false);
      if (result.success) {
        setContent(result.content);
        setIsImage(result.isImage);
        setMimeType(result.mimeType || '');
      } else {
        setContent(`Error: ${result.error || 'Could not load file'}`);
      }
    });
    return () => { cancelled = true; };
  }, [filename, workspaceId]);

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-[10px] font-sans truncate flex-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{filename}</span>
        <button onClick={onClose} className="shrink-0 ml-2" style={{ color: 'rgba(255,255,255,0.2)' }}><XIcon /></button>
      </div>
      <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
        {loading ? (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>Loading...</span>
        ) : isImage && content ? (
          <img src={`data:${mimeType};base64,${content}`} alt={filename} className="max-w-full rounded" style={{ maxHeight: 160 }} />
        ) : (
          <pre className="text-[10px] leading-relaxed whitespace-pre-wrap font-mono" style={{ color: 'rgba(255,255,255,0.45)' }}>{content}</pre>
        )}
      </div>
    </div>
  );
}

// ── WorkspaceIndicator ─────────────────────────────────────────────────────

function WorkspaceIndicator({ workspaceId, files, onRefresh }: { workspaceId: string; files: WorkspaceFile[]; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const path = getWorkspacePath(workspaceId);

  const handleFileClick = useCallback((node: FileNode) => {
    // Extract relative filename from the full path
    const fullPath = node.path || node.name;
    const wsPath = getWorkspacePath(workspaceId) + '/';
    const relative = fullPath.startsWith(wsPath) ? fullPath.substring(wsPath.length) : node.name;
    setPreviewFile(relative);
  }, [workspaceId]);

  return (
    <div className="relative">
      <button onClick={() => { setOpen(o => !o); if (!open) onRefresh(); }} className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all hover:brightness-125" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} title={path}>
        <span style={{ color: 'rgba(255,255,255,0.3)' }}><FolderIcon /></span>
        <span className="text-[10px] font-sans max-w-[140px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{workspaceId}</span>
        {files.length > 0 && <span className="text-[9px] font-sans px-1 rounded-full" style={{ background: 'rgba(43,121,255,0.12)', color: 'rgba(43,121,255,0.7)' }}>{files.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.97 }} transition={{ duration: 0.12 }} className="absolute bottom-full left-0 mb-1 rounded-xl overflow-hidden z-30" style={{ background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', minWidth: 280, maxWidth: 360, maxHeight: 'calc(100vh - 200px)' }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>Workspace files</span>
              <div className="flex items-center gap-1">
                <button onClick={onRefresh} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/[0.05] transition-colors" style={{ color: 'rgba(255,255,255,0.2)' }} title="Refresh">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
                </button>
                <button onClick={() => { setOpen(false); setPreviewFile(null); }} style={{ color: 'rgba(255,255,255,0.2)' }}><XIcon /></button>
              </div>
            </div>
            <div className="px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span className="text-[9px] font-sans block truncate" style={{ color: 'rgba(255,255,255,0.2)' }}>{path}</span></div>
            <div className="max-h-[280px] overflow-y-auto px-1 py-0.5">
              <FilesystemTree
                nodes={buildTreeFromFlatFiles(
                  files.map(f => ({ name: f.name, sizeStr: f.sizeStr, modifiedStr: f.modifiedStr })),
                  path
                )}
                onFileClick={handleFileClick}
              />
            </div>
            {/* File preview panel */}
            {previewFile && (
              <FilePreviewPanel
                filename={previewFile}
                workspaceId={workspaceId}
                onClose={() => setPreviewFile(null)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── NomadLogo ──────────────────────────────────────────────────────────────

function NomadLogo() {
  return (
    <img src="/icons/agent.png" alt="Nomad" className="w-7 h-7 rounded-lg shrink-0" style={{ opacity: 0.75 }} />
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

// ── Main Component ──────────────────────────────────────────────────────────

export function AgentPanel() {
  const [blocks, setBlocks] = useState<MessageBlock[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [currentToolName, setCurrentToolName] = useState<string | undefined>();
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [askUserPrompt, setAskUserPrompt] = useState<{ question: string; options: string[]; resolve: (answer: string) => void } | null>(null);
  const [askUserInput, setAskUserInput] = useState('');
  const [taskProgress, setTaskProgress] = useState<TaskProgress | null>(null);
  const [workspaceId, setWorkspaceId] = useState(() => generateWorkspaceId());
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
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
    setStatus('idle'); setTaskProgress(null);
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
    setStatus('idle'); setTaskProgress(null);
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
    requestAnimationFrame(() => {
      const c = scrollContainerRef.current;
      if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  // Scroll when blocks change
  useEffect(() => { scrollToBottom(); }, [blocks, scrollToBottom]);

  // Auto-scroll when DOM content grows (streaming tokens, new steps)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new MutationObserver(() => {
      // Only auto-scroll if user is near the bottom
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
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  const isWorking = status === 'routing' || status === 'thinking' || status === 'streaming';

  const refreshWorkspaceFiles = useCallback(async () => {
    const result = await workspaceListDetailed(workspaceId);
    if (result.success) setWorkspaceFiles(result.files);
  }, [workspaceId]);

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
    if (!text) return;
    if (isWorking) {
      injectedMessagesRef.current.push(text);
      userMsgCountRef.current += 1;
      setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'user' as const, content: text, timestamp: Date.now() }]);
      setInput(''); if (inputRef.current) inputRef.current.style.height = 'auto';
      return;
    }
    userMsgCountRef.current += 1;
    setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'user' as const, content: text, timestamp: Date.now() }]);
    setInput(''); if (inputRef.current) inputRef.current.style.height = 'auto';
    setStatus('routing');
    const controller = new AbortController(); abortRef.current = controller;
    activeBlockIdRef.current = null; activeStepIdRef.current = null;
    const conversationHistory = blocks.filter(b => b.type === 'user' || b.type === 'agent').map(b => `${b.type === 'user' ? 'User' : 'Assistant'}: ${b.content}`).join('\n\n');

    try {
      await runAgentLoop(text, conversationHistory, {
        model: getModelForStage('research'), temperature: 0.7, maxSteps: 999, maxDurationMs: 5 * 60 * 60 * 1000,
        signal: controller.signal, workspaceId,
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
              addStepToBlock(blockId, { id: crypto.randomUUID(), title: 'Working...', thinkingText: '', isThinking: true, actions: [], entries: [], status: 'active', activityLabel: 'Thinking' });
              break;
            }
            case 'thinking_chunk': {
              if (event.thinking) {
                const idx = event.thinking.indexOf('```tool');
                const clean = idx > 0 ? event.thinking.slice(0, idx).trim() : event.thinking.trim();
                // Extract only the new portion since last commit point
                const newPortion = clean.slice(committedThinkingLenRef.current).trim();
                updateCurrentStep(s => {
                  const entries = [...s.entries];
                  const last = entries[entries.length - 1];
                  if (last && last.type === 'text') {
                    // Update the current text segment with new portion
                    entries[entries.length - 1] = { type: 'text', content: newPortion || clean.slice(committedThinkingLenRef.current) };
                  } else {
                    // After an action pill, start a new text segment
                    if (newPortion) entries.push({ type: 'text', content: newPortion });
                  }
                  return { ...s, title: deriveStepTitle(clean), thinkingText: clean, entries };
                });
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
                updateCurrentStep(s => ({
                  ...s,
                  actions: s.actions.map(a => a.id === tcId ? { ...a, status: ns, result } : a),
                  entries: s.entries.map(e => e.type === 'action' && e.pill.id === tcId ? { type: 'action', pill: { ...e.pill, status: ns, result } } : e),
                }));
                // Auto-refresh workspace files after filesystem-modifying tools
                if (event.type === 'tool_done' && ['workspace_save', 'file_write', 'use_computer', 'sandbox_pull'].includes(tcName)) {
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
            case 'task_progress': if (event.taskProgress) setTaskProgress({ ...event.taskProgress }); break;
            case 'error': {
              completeCurrentStep();
              setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'agent' as const, content: `Error: ${event.error || 'Unknown error'}`, steps: [], timestamp: Date.now(), completedAt: Date.now() }]);
              activeBlockIdRef.current = null; activeStepIdRef.current = null;
              break;
            }
          }
        },
      });
      setStatus('idle'); setTaskProgress(null); abortRef.current = null;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') { setStatus('idle'); }
      else {
        setStatus('error');
        const msg = err instanceof Error ? err.message : String(err);
        const friendly = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') ? 'Cannot reach Ollama' : msg;
        setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'agent' as const, content: `Error: ${friendly}`, steps: [], timestamp: Date.now() }]);
      }
      activeBlockIdRef.current = null; activeStepIdRef.current = null; abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort(); abortRef.current = null;
    setStatus('idle'); setTaskProgress(null);
    activeBlockIdRef.current = null; activeStepIdRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };

  const isEmpty = blocks.length === 0;
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const _conversationTimestamp = blocks.length > 0 ? new Date(blocks[0].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ background: 'transparent', minHeight: 0 }}>
      {/* Overlay Conversation Sidebar */}
      <ConversationSidebar groups={conversationGroups} currentId={blocks.length > 0 ? conversationId : null} onSelect={(id) => { handleSelectConversation(id); setSidebarOpen(false); }} onDelete={handleDeleteConversation} onNewChat={() => { handleNewChat(); setSidebarOpen(false); }} onRename={handleRenameConversation} isCollapsed={!sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Floating action buttons (top-left) — z-30 keeps them above content but below sidebar overlay */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5">
        <button onClick={() => setSidebarOpen(o => !o)} className="nomad-glass-pill w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:brightness-150" style={{ color: 'rgba(255,255,255,0.35)' }} title="Chat history">
          <SidebarToggleIcon open={sidebarOpen} />
        </button>
        <button onClick={handleNewChat} className="nomad-glass-pill w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:brightness-150" style={{ color: 'rgba(255,255,255,0.35)' }} title="New chat">
          <NewChatIcon />
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col relative min-w-0 min-h-0" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

        {/* Thin animated progress line at top */}
        {isWorking && (
          <div className="absolute top-0 left-0 right-0 h-[2px] z-10 overflow-hidden" style={{ background: 'rgba(43,121,255,0.08)' }}>
            <div className="h-full" style={{ width: '40%', background: 'linear-gradient(90deg, transparent, #2B79FF, transparent)', animation: 'agentProgressSlide 1.2s ease-in-out infinite' }} />
            <style>{`@keyframes agentProgressSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
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
              <img src="/icons/agent.png" alt="Nomad" style={{ width: 44, height: 44, opacity: 0.5 }} className="rounded-xl" />
              <div className="text-center space-y-1.5">
                <p className="text-[15px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>What can I help you with?</p>
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>Search, code, browse, analyze -- autonomous multi-step agent</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full px-6 pt-14 pb-8 flex flex-col gap-5">
              {blocks.map(block => {
                switch (block.type) {
                  case 'user':
                    return (
                      <div key={block.id} className="flex justify-end">
                        <div className="max-w-[75%] px-4 py-2.5" style={{ borderRadius: '16px 16px 4px 16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <p className="text-[13px] leading-[1.6] whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.8)' }}>{block.content}</p>
                        </div>
                      </div>
                    );
                  case 'agent':
                    return (
                      <div key={block.id} className="flex gap-3">
                        <NomadLogo />
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>nomad</span>
                            <span className="text-[8px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)' }}>v0.1</span>
                            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>{formatTime(block.timestamp)}</span>
                            {block.completedAt && block.startedAt && (
                              <span className="text-[10px] font-sans" style={{ color: 'rgba(255,255,255,0.12)' }}>
                                {Math.round((block.completedAt - block.startedAt) / 1000)}s{block.tokenCount ? ` · ↓${block.tokenCount}t` : ''}
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
                          {!block.content && (!block.steps || block.steps.length === 0) && (
                            <div className="flex items-center gap-2 py-1"><ThinkingMorph size={16} /><TextShimmer className="text-[12px] font-medium [--shimmer-base:rgba(43,121,255,0.3)] [--shimmer-highlight:rgba(43,121,255,0.9)]" duration={1.8}>Thinking</TextShimmer></div>
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
          {taskProgress && taskProgress.totalSteps > 0 && <StickyProgressBar progress={taskProgress} />}
        </div>

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
            <div className="nomad-glass-medium" style={{ borderRadius: 20 }}>
              <div className="flex items-end gap-2 px-3.5 py-3">
                <div className="relative">
                  <button onClick={() => setShowAttachMenu(o => !o)} className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${showAttachMenu ? 'bg-blue-500/10' : 'hover:bg-white/[0.05]'}`} style={{ color: showAttachMenu ? 'rgba(43,121,255,0.7)' : 'rgba(255,255,255,0.25)' }}><PlusIcon /></button>
                  <AnimatePresence>
                    {showAttachMenu && (<><div className="fixed inset-0 z-[25]" onClick={() => setShowAttachMenu(false)} /><AttachmentMenu onClose={() => setShowAttachMenu(false)} onUploadClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }} /></>)}
                  </AnimatePresence>
                </div>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={isWorking ? "Add instructions..." : "What would you like me to do?"} rows={1} className="flex-1 bg-transparent text-[13px] leading-relaxed resize-none outline-none placeholder:text-white/15" style={{ color: 'rgba(255,255,255,0.85)', minHeight: 24, maxHeight: 120 }} onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }} />
                <VoiceInput
                  onTranscript={() => { /* onInterim already set the text live */ }}
                  onInterim={(text) => setInput(text)}
                  size={32}
                />
                {isWorking ? (
                  <button onClick={handleStop} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-red-500/15" style={{ background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.7)' }}><StopIcon /></button>
                ) : (
                  <button onClick={handleSubmit} disabled={!input.trim()} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-20" style={{ background: input.trim() ? 'rgba(43,121,255,0.15)' : 'rgba(255,255,255,0.03)', color: input.trim() ? 'rgba(43,121,255,0.9)' : 'rgba(255,255,255,0.15)' }}><ArrowUpIcon /></button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <WorkspaceIndicator workspaceId={workspaceId} files={workspaceFiles} onRefresh={refreshWorkspaceFiles} />
              <div className="flex items-center gap-3">
                {isWorking && (
                  <span className="text-[9px] flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: currentToolName ? 'rgba(34,197,94,0.6)' : 'rgba(43,121,255,0.6)' }} />
                    {statusLabel(status, currentToolName)}
                  </span>
                )}
                <span className="text-[9px] font-sans" style={{ color: 'rgba(255,255,255,0.1)' }}>{getModelForStage('research')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
