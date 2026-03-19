/**
 * WayfayerPlusPanel — Computer Use browser automation UI
 *
 * Dark liquid glass design inspired by macOS + Apple's frosted glass.
 * Optimized for both AI-driven automation AND human manual use.
 *
 * Layout:
 *  - Browser chrome bar (36px, macOS traffic lights + URL pill + status)
 *  - Browser viewport (full bleed VNC canvas)
 *  - Floating plan overlay (top-right, collapsible)
 *  - Bottom controls bar (48px, Take Control + action pills + input + send)
 *  - Collapsible chat drawer (24px collapsed, 180px expanded)
 */

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { sandboxService } from '../utils/sandboxService';
import {
  runPlanAct,
  notifyUserInteraction, clearUserInteraction, getUserInteractionState,
  type AgentPlan, type StreamEvent, type ConversationContext,
} from '../utils/planActAgent';
import { getPlannerModel, getExecutorModel } from '../utils/modelConfig';
import { VNCViewer } from './VNCViewer';
import { MeshGradient } from '@paper-design/shaders-react';
import { BGPattern } from './BGPattern';

export interface WayfayerPlusPanelHandle {
  runTask: (goal: string) => void;
}

// ── Types ──

type Phase = 'idle' | 'connecting' | 'live' | 'acting' | 'error';
type ControlMode = 'ai' | 'human';

interface ChatMessage {
  id: number;
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
}

interface ActionPill {
  id: number;
  icon: 'navigate' | 'click' | 'type' | 'step' | 'pause' | 'resume' | 'task' | 'control' | 'done' | 'error';
  label: string;
  timestamp: number;
}

// ── Spring transition preset ──
const springTransition = { type: 'spring' as const, bounce: 0, duration: 0.3 };

// ── CSS ──
let cssInjected = false;
const CSS = `
@keyframes wf-cursor-glow {
  0%, 100% { filter: drop-shadow(0 0 4px rgba(43,121,255,0.35)); }
  50% { filter: drop-shadow(0 0 8px rgba(43,121,255,0.55)); }
}
@keyframes wf-click-ring {
  0% { transform: scale(0.3); opacity: 0.9; border-width: 2px; }
  100% { transform: scale(2.5); opacity: 0; border-width: 0.5px; }
}
@keyframes wf-pulse-dot {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
`;
function injectCSS() {
  if (cssInjected) return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  cssInjected = true;
}

// ── Action icon map ──
function ActionIcon({ icon }: { icon: ActionPill['icon'] }) {
  const common = { width: 8, height: 8, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  switch (icon) {
    case 'navigate': return <svg {...common}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /></svg>;
    case 'click': return <svg {...common}><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="10" /></svg>;
    case 'type': return <svg {...common}><rect x="2" y="6" width="20" height="12" rx="2" /></svg>;
    case 'step': return <svg {...common}><polyline points="9 18 15 12 9 6" /></svg>;
    case 'pause': return <svg {...common}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>;
    case 'resume': return <svg {...common}><polygon points="5 3 19 12 5 21" /></svg>;
    case 'task': return <svg {...common}><path d="M12 2L2 7l10 5 10-5-10-5z" /></svg>;
    case 'control': return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>;
    case 'done': return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
    case 'error': return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg>;
  }
}

// ════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════

export const WayfayerPlusPanel = forwardRef<WayfayerPlusPanelHandle, { standalone?: boolean; onAddMachine?: () => void; gradientColors?: string[]; onStepChange?: (step: string | null) => void }>(function WayfayerPlusPanel({ standalone = false, onAddMachine, gradientColors, onStepChange }, ref) {
  // ── Core state ──
  const [phase, setPhase] = useState<Phase>('idle');
  const [pageUrl, setPageUrl] = useState('');
  const [_pageTitle, setPageTitle] = useState('');
  const [controlMode, setControlMode] = useState<ControlMode>('ai');
  const [userPaused, setUserPaused] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showPlan, setShowPlan] = useState(true);

  // ── Chat & messages ──
  const [_busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [recentActions, setRecentActions] = useState<ActionPill[]>([]);
  const [currentPlan, setCurrentPlan] = useState<AgentPlan | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [conversation, setConversation] = useState<ConversationContext>({
    messages: [], actionHistory: [], currentUrl: '', currentTitle: '', tabCount: 1, activeTabIndex: 0,
  });

  // ── Chat drawer ──
  const [chatOpen, setChatOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ── Refs ──
  const vncRef = useRef<any>(null);
  const exploringRef = useRef(false);
  const exploreAbortRef = useRef<AbortController | null>(null);
  const msgIdRef = useRef(0);
  const actionIdRef = useRef(0);

  // ── AI cursor ──
  const [aiCursor, setAiCursor] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const rippleIdRef = useRef(0);
  const [_exploreStep, setExploreStep] = useState(0);

  // ── Sandbox ──
  const [_sandboxReady, setSandboxReady] = useState(false);

  useEffect(injectCSS, []);

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, chatOpen]);

  useEffect(() => {
    let mounted = true;
    sandboxService.health().then(ok => { if (mounted && ok) setSandboxReady(true); });
    return () => { mounted = false; };
  }, []);

  const isLive = phase === 'live';

  // ── Helpers ──
  const addMessage = useCallback((role: ChatMessage['role'], text: string) => {
    const msg: ChatMessage = { id: ++msgIdRef.current, role, text, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  const addAction = useCallback((label: string, icon: ActionPill['icon'] = 'step') => {
    const pill: ActionPill = { id: ++actionIdRef.current, icon, label, timestamp: Date.now() };
    setRecentActions(prev => [...prev.slice(-4), pill]);
  }, []);

  // ── Cancel ──
  function _cancel() {
    exploreAbortRef.current?.abort();
    exploringRef.current = false;
    setBusy(false);
    setAiCursor(c => ({ ...c, visible: false }));
    setExploring(false);
    setStreamingText('');
    if (phase !== 'idle') setPhase('live');
  }
  void _cancel;

  // ── Navigate ──
  async function _navigate(targetUrl: string) {
    let u = targetUrl.trim();
    if (!u) return;
    if (!/^https?:\/\//.test(u)) u = 'https://' + u;

    setPhase('connecting');
    setPageUrl(u);
    setCurrentPlan(null);
    setConversation({ messages: [], actionHistory: [], currentUrl: u, currentTitle: '', tabCount: 1, activeTabIndex: 0 });

    try {
      const res = await sandboxService.navigate(u);
      if (res.error) { setPhase('error'); return; }
      const title = res.title || u;
      setPhase('live');
      setPageTitle(title);
      setPageUrl(res.url || u);
      setControlMode('ai');
      addAction(new URL(u).hostname, 'navigate');
    } catch {
      setPhase('error');
    }
  }
  void _navigate;

  // ── User interaction detection ──
  const handleUserInteraction = useCallback(() => {
    if (exploring && controlMode === 'ai') {
      notifyUserInteraction();
      setUserPaused(true);
      addAction('Paused', 'pause');

      const checkResume = setInterval(() => {
        const state = getUserInteractionState();
        if (!state.isPaused) {
          setUserPaused(false);
          clearInterval(checkResume);
          addAction('Resumed', 'resume');
        }
      }, 500);

      setTimeout(() => {
        clearInterval(checkResume);
        clearUserInteraction();
        setUserPaused(false);
      }, 30000);
    }
  }, [exploring, controlMode, addAction]);

  // ── Plan-Act agent run ──
  const runAgent = useCallback(async (goal: string) => {
    if (exploringRef.current) return;
    exploringRef.current = true;
    setExploreStep(0);
    setExploring(true);
    setStreamingText('');
    setControlMode('ai');
    const ac = new AbortController();
    exploreAbortRef.current = ac;

    const goalText = goal || 'Explore this page and summarize what you find.';
    addAction(goalText.slice(0, 30), 'task');

    const conv = { ...conversation };
    conv.messages = [...conv.messages, { role: 'user' as const, content: goalText, timestamp: Date.now() }];
    setConversation(conv);

    await runPlanAct(goalText, getPlannerModel(), getExecutorModel(), {
      onPlan: (plan) => {
        setCurrentPlan(plan);
        setShowPlan(true);
      },
      onStepStart: (step) => {
        const label = `Step ${step.step}: ${step.description}`;
        setStreamingText(label);
        addAction(step.description.slice(0, 25), 'step');
        onStepChange?.(label);
      },
      onAction: (action, _result) => {
        setExploreStep(s => s + 1);
        sandboxService.view().then(v => {
          setPageTitle(v.title);
          setPageUrl(v.url);
          setConversation(prev => ({ ...prev, currentUrl: v.url, currentTitle: v.title }));

          if (action.index != null && vncRef.current) {
            const el = v.elements.find((e: any) => e.index === action.index);
            if (el?.rect) {
              const container = (vncRef.current as HTMLElement)?.parentElement;
              if (container) {
                const cr = container.getBoundingClientRect();
                const sx = cr.width / 1280;
                const sy = cr.height / 900;
                const dx = (el.rect.x + el.rect.w / 2) * sx;
                const dy = (el.rect.y + el.rect.h / 2) * sy;
                setAiCursor({ x: dx, y: dy, visible: true });
                if (action.action === 'click' || action.action === 'input') {
                  setTimeout(() => {
                    const id = ++rippleIdRef.current;
                    setRipples(p => [...p, { x: dx, y: dy, id }]);
                    setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 700);
                  }, 200);
                }
              }
            }
          }
        }).catch(() => {});
      },
      onThinking: (text) => {
        setStreamingText(text);
      },
      onStepComplete: (step) => {
        addAction(`${step.description?.slice(0, 20) || 'Step'}: ${step.status}`, step.status === 'done' ? 'done' : 'error');
      },
      onAskUser: async (question, options) => {
        return new Promise<string>((resolve) => {
          const answer = prompt(`${question}\nOptions: ${options.join(', ')}`);
          resolve(answer || options[0] || '');
        });
      },
      onDone: (summary) => {
        addMessage('agent', summary);
        setConversation(prev => ({
          ...prev,
          messages: [...prev.messages, { role: 'agent' as const, content: summary, timestamp: Date.now() }],
        }));
      },
      onError: (err) => {
        addMessage('system', `Error: ${err}`);
      },
      onStream: (event: StreamEvent) => {
        if (event.type === 'step_start') {
          setAiCursor(c => ({ ...c, visible: true }));
        }
        if (event.type === 'user_paused') {
          setUserPaused(true);
          setStreamingText('Paused...');
        }
        if (event.type === 'user_resumed') {
          setUserPaused(false);
          setStreamingText('Resuming...');
        }
        if (event.type === 'replan' && event.plan) {
          setCurrentPlan(event.plan);
        }
        if (event.type === 'done' || event.type === 'error') {
          setTimeout(() => setAiCursor(c => ({ ...c, visible: false })), 1500);
        }
      },
    }, 30, ac.signal, conv);

    exploringRef.current = false;
    setExploring(false);
    setStreamingText('');
    setCurrentPlan(null);
    onStepChange?.(null);
  }, [conversation, addAction, addMessage, onStepChange]);

  // ── Expose runTask via ref so ActionSidebar can trigger computer tasks ──
  useImperativeHandle(ref, () => ({
    runTask: (goal: string) => { runAgent(goal); },
  }));

  // ── Toggle control mode ──
  const toggleControl = useCallback(() => {
    if (controlMode === 'ai') {
      if (exploring) {
        notifyUserInteraction();
        setUserPaused(true);
      }
      setControlMode('human');
      setFullscreen(true);
      addAction('You took control', 'control');
    } else {
      setControlMode('ai');
      setUserPaused(false);
      clearUserInteraction();
      setFullscreen(false);
      addAction('AI control', 'control');
      sandboxService.view().then(v => {
        setPageTitle(v.title);
        setPageUrl(v.url);
        setConversation(prev => ({ ...prev, currentUrl: v.url, currentTitle: v.title }));
      }).catch(() => {});
    }
  }, [controlMode, exploring, addAction]);

  // ── Derived ──
  const totalMessages = messages.length + (streamingText ? 1 : 0);
  const statusMode = exploring ? (userPaused ? 'paused' : 'running') : (phase === 'error' ? 'error' : 'idle');
  const displayUrl = pageUrl ? (() => { try { const u = new URL(pageUrl); return u.hostname + u.pathname.replace(/\/$/, ''); } catch { return pageUrl; } })() : '';

  // ═══════════════════════════════════════
  // FULLSCREEN MODE (user controlling)
  // ═══════════════════════════════════════
  const fullscreenOverlay = fullscreen && isLive ? createPortal(
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0a0a0c', zIndex: 99999 }}>
      {/* Fullscreen chrome bar */}
      <div className="nomad-glass-medium flex items-center gap-3 shrink-0" style={{
        height: 36, padding: '0 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        borderTop: 'none', borderLeft: 'none', borderRight: 'none',
        borderRadius: 0,
      }}>
        <div className="flex gap-[6px] shrink-0">
          {[
            { color: '#ff5f57', glow: 'rgba(255,95,87,0.4)' },
            { color: '#febc2e', glow: 'rgba(254,188,46,0.4)' },
            { color: '#28c840', glow: 'rgba(40,200,64,0.4)' },
          ].map((dot, i) => (
            <button key={i} onClick={i === 0 ? toggleControl : undefined}
              style={{
                width: 12, height: 12, borderRadius: '50%',
                background: dot.color, border: 'none', cursor: i === 0 ? 'pointer' : 'default',
                transition: 'box-shadow 0.2s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 6px ${dot.glow}`)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{displayUrl}</span>
        </div>
        <button onClick={toggleControl}
          className="nomad-glass-pill px-3 py-1 rounded-full text-[10px] font-medium cursor-pointer"
          style={{ color: 'rgba(43,121,255,0.8)' }}>
          Return to AI
        </button>
      </div>
      <div className="flex-1 overflow-hidden" style={{ background: '#0a0a0c' }}>
        <VNCViewer
          ref={vncRef}
          wsUrl={sandboxService.vncUrl}
          viewOnly={false}
          onUserInteraction={handleUserInteraction}
          style={{ height: 'calc(100vh - 36px)', aspectRatio: '1280/900' }}
        />
      </div>
    </div>,
    document.body
  ) : null;

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  return (
    <>
    {fullscreenOverlay}
    <div className={standalone ? 'h-full flex flex-col overflow-hidden' : 'rounded-[16px] overflow-hidden'}
      style={standalone ? {} : { background: '#0d0d0f', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>

      {/* ════════════════════════════════════ */}
      {/*   1. BROWSER CHROME BAR (36px)      */}
      {/* ════════════════════════════════════ */}
      <div className="nomad-glass-medium flex items-center gap-2 shrink-0" style={{
        height: 36, padding: '0 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        borderTop: 'none', borderLeft: 'none', borderRight: 'none',
        borderRadius: 0,
      }}>
        {/* Traffic lights — 12px macOS-style dots */}
        <div className="flex gap-[6px] shrink-0 items-center">
          {[
            { color: '#ff5f57', glow: 'rgba(255,95,87,0.4)' },
            { color: '#febc2e', glow: 'rgba(254,188,46,0.4)' },
            { color: '#28c840', glow: 'rgba(40,200,64,0.4)' },
          ].map((dot, i) => (
            <span key={i}
              className="block transition-all duration-200"
              style={{
                width: 12, height: 12, borderRadius: '50%',
                background: isLive ? dot.color : 'rgba(255,255,255,0.08)',
                border: isLive ? 'none' : '1px solid rgba(255,255,255,0.06)',
              }}
              onMouseEnter={e => { if (isLive) e.currentTarget.style.boxShadow = `0 0 6px ${dot.glow}`; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
            />
          ))}
        </div>

        {/* Center: URL pill with lock icon */}
        <div className="flex-1 flex items-center justify-center min-w-0">
          <div className="nomad-glass-subtle flex items-center gap-1.5 px-3" style={{
            height: 22, maxWidth: 420, width: '100%',
            borderRadius: 11,
          }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
              stroke={isLive ? 'rgba(40,200,64,0.6)' : 'rgba(255,255,255,0.15)'}
              strokeWidth="2" className="shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span className="text-[10px] truncate select-none" style={{
              color: isLive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
              fontWeight: 400,
              letterSpacing: '0.01em',
            }}>
              {displayUrl || 'Enter a URL below'}
            </span>
          </div>
        </div>

        {/* Right: Add machine + Status pill */}
        {onAddMachine && (
          <button
            onClick={onAddMachine}
            title="Add another computer"
            className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-white/5 cursor-pointer"
            style={{ width: 22, height: 22, color: 'rgba(255,255,255,0.2)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
        <div className="shrink-0">
          <AnimatePresence mode="wait">
            {statusMode === 'running' && (
              <motion.span
                key="running"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={springTransition}
                className="nomad-glass-pill flex items-center gap-1.5 px-2 rounded-full"
                style={{ height: 18 }}
              >
                <span className="w-[5px] h-[5px] rounded-full" style={{
                  background: '#3b82f6',
                  animation: 'wf-pulse-dot 1.2s ease-in-out infinite',
                }} />
                <span className="text-[9px] font-medium" style={{ color: 'rgba(59,130,246,0.8)' }}>running</span>
              </motion.span>
            )}
            {statusMode === 'paused' && (
              <motion.span
                key="paused"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={springTransition}
                className="nomad-glass-pill flex items-center gap-1.5 px-2 rounded-full"
                style={{ height: 18 }}
              >
                <span className="w-[5px] h-[5px] rounded-full" style={{ background: '#71717a' }} />
                <span className="text-[9px] font-medium" style={{ color: 'rgba(113,113,122,0.8)' }}>paused</span>
              </motion.span>
            )}
            {statusMode === 'error' && (
              <motion.span
                key="error"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={springTransition}
                className="nomad-glass-pill flex items-center gap-1.5 px-2 rounded-full"
                style={{ height: 18 }}
              >
                <span className="w-[5px] h-[5px] rounded-full" style={{ background: '#ef4444' }} />
                <span className="text-[9px] font-medium" style={{ color: 'rgba(239,68,68,0.8)' }}>error</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ════════════════════════════════════ */}
      {/*   2. MAIN CONTENT AREA              */}
      {/* ════════════════════════════════════ */}
      <div className={standalone ? 'flex-1 flex flex-col overflow-hidden min-h-0' : 'flex flex-col'} style={standalone ? {} : { maxHeight: 700 }}>

        {/* Browser Viewport — full bleed */}
        {isLive ? (
          <div className={standalone ? 'flex-1 relative min-h-0' : 'relative'} style={{ background: '#0a0a0b' }}>
            <VNCViewer
              ref={vncRef}
              wsUrl={sandboxService.vncUrl}
              viewOnly={controlMode === 'ai'}
              onUserInteraction={handleUserInteraction}
              style={standalone
                ? { width: '100%', height: '100%', objectFit: 'contain' }
                : { maxHeight: 420, aspectRatio: '1280/900' }
              }
            />

            {/* AI Cursor — smooth spring, no jitter */}
            <AnimatePresence>
              {aiCursor.visible && (
                <motion.div
                  className="absolute pointer-events-none z-50"
                  initial={{ opacity: 0, left: aiCursor.x - 4, top: aiCursor.y - 2 }}
                  animate={{ opacity: 1, left: aiCursor.x - 4, top: aiCursor.y - 2 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 180, damping: 22, mass: 0.8 }}
                  style={{ animation: 'wf-cursor-glow 1.5s ease-in-out infinite', willChange: 'left, top' }}
                >
                  <svg width="22" height="28" viewBox="0 0 22 28" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
                    <defs>
                      <linearGradient id="cursorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#93bbff" />
                        <stop offset="40%" stopColor="#2B79FF" />
                        <stop offset="100%" stopColor="#1D6AE5" />
                      </linearGradient>
                    </defs>
                    <path d="M2 1L19 14H10L15 26L12 27L7 15L2 20V1Z" fill="url(#cursorGrad)" stroke="#1a4fa0" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Click ripples (orange pulse indicator) */}
            {ripples.map(r => (
              <div key={r.id} className="absolute pointer-events-none" style={{ left: r.x - 18, top: r.y - 18, width: 36, height: 36 }}>
                <div className="absolute inset-0 rounded-full" style={{
                  border: '2px solid rgba(43,121,255,0.6)',
                  animation: 'wf-click-ring 0.6s ease-out forwards',
                }} />
              </div>
            ))}

            {/* ═══ 4. PLAN OVERLAY (floating glass panel, top-right) ═══ */}
            <AnimatePresence>
              {currentPlan && currentPlan.steps.length > 0 && (
                <>
                  {/* Toggle pill — bottom-right so it doesn't cover viewport */}
                  <motion.button
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    transition={springTransition}
                    onClick={() => setShowPlan(v => !v)}
                    className="absolute bottom-2 right-2 z-50 nomad-glass-pill px-2 rounded-full cursor-pointer flex items-center gap-1"
                    style={{ height: 18 }}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                    </svg>
                    <span className="text-[8px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {showPlan ? 'Plan' : `${currentPlan.steps.filter(s => s.status === 'done').length}/${currentPlan.steps.length}`}
                    </span>
                  </motion.button>

                  {/* Expanded plan panel — anchored bottom-right, compact */}
                  {showPlan && (
                    <motion.div
                      initial={{ opacity: 0, x: 10, y: 5 }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={springTransition}
                      className="absolute bottom-8 right-2 z-40 nomad-glass-medium rounded-lg overflow-hidden"
                      style={{ maxWidth: 190, maxHeight: 200 }}
                    >
                      <div className="overflow-y-auto px-2.5 py-2 space-y-1" style={{ maxHeight: 196 }}>
                        {currentPlan.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <div className="mt-[2px] shrink-0">
                              {step.status === 'done' ? (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : step.status === 'active' ? (
                                <span className="block w-[10px] h-[10px] rounded-full" style={{
                                  background: '#3b82f6',
                                  animation: 'wf-pulse-dot 1s infinite',
                                }} />
                              ) : step.status === 'failed' ? (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              ) : (
                                <span className="block w-[10px] h-[10px] rounded-full" style={{ border: '1.5px solid rgba(255,255,255,0.15)' }} />
                              )}
                            </div>
                            <span className="text-[9px] leading-snug" style={{
                              color: step.status === 'active' ? 'rgba(255,255,255,0.7)' :
                                     step.status === 'done' ? 'rgba(255,255,255,0.35)' :
                                     'rgba(255,255,255,0.2)',
                              textDecoration: step.status === 'done' ? 'line-through' : 'none',
                            }}>
                              {step.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* Idle / connecting / error — mesh gradient background */
          <div className={standalone ? 'flex-1 relative min-h-0' : 'relative'} style={{ minHeight: standalone ? undefined : 280, background: '#000000', overflow: 'hidden' }}>
            {(phase === 'idle' || phase === 'error') && (
              <>
                <MeshGradient
                  colors={gradientColors ?? ['#000000', '#030308', '#060e1a', '#091828', '#1a4fcc']}
                  speed={0.06}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                />
                <BGPattern fill="rgba(255,255,255,0.025)" size={28} mask="fade-edges" />
              </>
            )}
            <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
              <div className="text-center px-6">
                {phase === 'connecting' ? (
                  <>
                    <div className="w-6 h-6 mx-auto mb-3 rounded-full" style={{
                      border: '2px solid #2B79FF',
                      borderTopColor: 'transparent',
                      animation: 'wf-pulse-dot 0.8s linear infinite',
                    }} />
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Connecting...</p>
                  </>
                ) : phase === 'error' ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" className="mx-auto mb-3">
                      <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
                    </svg>
                    <p className="text-[11px]" style={{ color: '#ef4444' }}>Connection failed</p>
                    <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Check sandbox and retry</p>
                  </>
                ) : (
                  <>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" className="mx-auto mb-3">
                      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                    </svg>
                    <p className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Nomad Agent</p>
                    <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.15)' }}>Give an instruction to get started</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════ */}
        {/*   5. CHAT DRAWER (bottom)            */}
        {/* ════════════════════════════════════ */}
        {totalMessages > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Collapsed: thin 24px glass bar with message count */}
            <button
              onClick={() => setChatOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 cursor-pointer"
              style={{ height: 24, background: 'rgba(255,255,255,0.02)' }}
            >
              <span className="text-[9px] font-medium" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {totalMessages} message{totalMessages !== 1 ? 's' : ''}
              </span>
              <motion.svg
                width="8" height="8" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                animate={{ rotate: chatOpen ? 180 : 0 }}
                transition={springTransition}
              >
                <polyline points="18 15 12 9 6 15" />
              </motion.svg>
            </button>

            {/* Expanded: last 5 messages, max 180px */}
            <AnimatePresence initial={false}>
              {chatOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
                  style={{ overflow: 'hidden', willChange: 'height, opacity' }}
                >
                  <div
                    ref={chatScrollRef}
                    className="overflow-y-auto px-3 py-1.5 space-y-1"
                    style={{ maxHeight: 180, borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    {messages.slice(-5).map(msg => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className="rounded-md px-2 py-0.5 max-w-[80%]" style={{
                          background: msg.role === 'user'
                            ? 'rgba(43,121,255,0.1)'
                            : msg.role === 'agent'
                            ? 'rgba(255,255,255,0.03)'
                            : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${msg.role === 'user' ? 'rgba(43,121,255,0.12)' : 'rgba(255,255,255,0.04)'}`,
                        }}>
                          {msg.role === 'agent' && (
                            <span className="text-[8px] font-medium block" style={{ color: 'rgba(43,121,255,0.5)' }}>Agent</span>
                          )}
                          <span className="text-[11px] leading-snug" style={{
                            color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' :
                                   msg.role === 'system' ? 'rgba(255,255,255,0.2)' :
                                   'rgba(255,255,255,0.45)',
                          }}>
                            {msg.text.length > 250 ? msg.text.slice(0, 250) + '...' : msg.text}
                          </span>
                        </div>
                      </div>
                    ))}
                    {streamingText && (
                      <div className="flex justify-start">
                        <div className="rounded-md px-2 py-0.5 max-w-[80%]" style={{
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <span className="text-[8px] font-medium block" style={{ color: 'rgba(43,121,255,0.5)' }}>Agent</span>
                          <span className="text-[11px] leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            {streamingText.slice(0, 180)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ════════════════════════════════════ */}
        {/*   3. BOTTOM CONTROLS BAR (48px)      */}
        {/* ════════════════════════════════════ */}
        <div className="nomad-glass-subtle shrink-0 flex items-center gap-2 px-3" style={{
          height: 48,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 0,
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
        }}>
          {/* Take Control toggle — small glass pill */}
          {isLive && (
            <motion.button
              onClick={toggleControl}
              className="nomad-glass-pill shrink-0 rounded-full flex items-center gap-1 px-2 cursor-pointer"
              style={{ height: 24 }}
              whileTap={{ scale: 0.95 }}
              transition={springTransition}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
                stroke={controlMode === 'human' ? 'rgba(43,121,255,0.8)' : 'rgba(255,255,255,0.3)'}
                strokeWidth="2">
                {controlMode === 'human' ? (
                  <><path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0" /><path d="M9 12l2 2 4-4" /></>
                ) : (
                  <><path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0" /><path d="M15 9l-6 6M9 9l6 6" /></>
                )}
              </svg>
              <span className="text-[9px] font-medium" style={{
                color: controlMode === 'human' ? 'rgba(43,121,255,0.8)' : 'rgba(255,255,255,0.3)',
              }}>
                {controlMode === 'human' ? 'Return' : 'Control'}
              </span>
            </motion.button>
          )}

          {/* Last 3 action pills with icons */}
          <div className="flex items-center gap-1 min-w-0" style={{ overflow: 'hidden', maxWidth: '30%', flexShrink: 1 }}>
            <AnimatePresence mode="popLayout">
              {recentActions.slice(-3).map(a => (
                <motion.span
                  key={a.id}
                  layout
                  initial={{ opacity: 0, scale: 0.7, x: -8 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.7, x: 8 }}
                  transition={springTransition}
                  className="nomad-glass-pill flex items-center gap-1 px-1.5 rounded-full"
                  style={{ height: 18, flexShrink: 0, maxWidth: 100 }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}><ActionIcon icon={a.icon} /></span>
                  <span className="text-[8px] truncate" style={{ color: 'rgba(255,255,255,0.25)', maxWidth: 56 }}>
                    {a.label}
                  </span>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
    </>
  );
});
