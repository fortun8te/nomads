/**
 * WayfayerPlusPanel — Manus-style agentic browser
 *
 * Features:
 *  - Agentic auto-explore with visible AI cursor
 *  - macOS-style fullscreen "Take Control" mode
 *  - Compact action timeline with grouping
 *  - Fast 0.8B model with minimal prompts
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { screenshotService, wayfayerService, analyzeProductPage, analyzeCompetitor, siteCrawler } from '../utils/wayfayer';
import { ollamaService } from '../utils/ollama';
import { getVisionModel, getThinkingModel, getPlannerModel, getExecutorModel, VISION_MODEL_OPTIONS, THINKING_MODEL_OPTIONS } from '../utils/modelConfig';
import { sandboxService } from '../utils/sandboxService';
import { runPlanAct, type AgentPlan, type PlanStep, type ExecutorAction, type StreamEvent } from '../utils/planActAgent';
import { quickRoute, routeToSkill, getSkill, getSkillProfile, type SkillRouteResult } from '../utils/agentSkills';
import { skillTaskManager, parseAdjustment, parseAdjustmentLLM, type ParsedAdjustment, type ProfileTweak } from '../utils/skillTaskManager';
import { VNCViewer } from './VNCViewer';
import { useTabManager, type BrowserTab } from '../utils/tabManager';
import { useTheme } from '../context/ThemeContext';

// ── Types ──

type Phase = 'idle' | 'connecting' | 'live' | 'acting' | 'error';
type ControlMode = 'ai' | 'human';

interface ActionRecord {
  id: number;
  actor: 'ai' | 'human' | 'system';
  action: string;
  detail: string;
  observation?: string;
  reasoning?: string;
  screenshotB64?: string;
  pageTitle?: string;
  pageUrl?: string;
  timestamp: number;
  collapsed: boolean;
  duration?: number;
}

interface ExploreAction {
  action: 'scroll' | 'click' | 'navigate' | 'back' | 'type' | 'hover' | 'done' | 'extract' | 'ask_user' | 'screenshot' | 'wait';
  scrollY?: number;
  clickX?: number;
  clickY?: number;
  selector?: string;
  url?: string;
  text?: string;
  question?: string;      // what to ask user
  options?: string[];     // choices (e.g. scent names, sizes)
  data?: string;          // extracted data from page
}

interface DecisionPrompt {
  question: string;
  options: string[];
  screenshotB64?: string;
  resolve: (answer: string) => void;
}

// ── Image downscale for faster vision inference ──
function downscaleB64(b64: string, maxW = 640, maxH = 450): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.5).split(',')[1]);
    };
    img.onerror = () => resolve(b64); // fallback to original
    img.src = `data:image/jpeg;base64,${b64}`;
  });
}

// ── CSS ──
let cssInjected = false;
const CSS = `
@keyframes wf-morph {
  0%   { border-radius: 50%; transform: scale(1) rotate(0deg); }
  25%  { border-radius: 22% 50% 50% 22%; transform: scale(1.06) rotate(45deg); }
  50%  { border-radius: 50%; transform: scale(1) rotate(90deg); }
  75%  { border-radius: 50% 22% 22% 50%; transform: scale(1.06) rotate(135deg); }
  100% { border-radius: 50%; transform: scale(1) rotate(180deg); }
}
@keyframes wf-status-in {
  0% { opacity: 0; transform: translateY(6px); filter: blur(4px); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes wf-status-out {
  0% { opacity: 1; transform: translateY(0); filter: blur(0); }
  100% { opacity: 0; transform: translateY(-6px); filter: blur(4px); }
}
@keyframes wf-orb-float {
  0%, 100% { transform: translateY(0) scale(1); }
  33% { transform: translateY(-2px) scale(1.05); }
  66% { transform: translateY(1px) scale(0.97); }
}
@keyframes wf-orb-glow {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(59,130,246,0.15), 0 0 20px 4px rgba(59,130,246,0.05); }
  50% { box-shadow: 0 0 12px 4px rgba(59,130,246,0.25), 0 0 30px 8px rgba(59,130,246,0.1); }
}
@keyframes wf-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes wf-pulse-ring {
  0% { transform: scale(0.8); opacity: 0.6; }
  100% { transform: scale(2.5); opacity: 0; }
}
@keyframes wf-typing {
  0%, 20% { opacity: 0.2; }
  50% { opacity: 1; }
  80%, 100% { opacity: 0.2; }
}
@keyframes wf-click-ripple {
  0% { transform: scale(0.2); opacity: 0.7; }
  50% { opacity: 0.35; }
  100% { transform: scale(2.8); opacity: 0; }
}
@keyframes wf-scan {
  0% { top: 0; opacity: 0; }
  10% { opacity: 0.4; }
  90% { opacity: 0.4; }
  100% { top: 100%; opacity: 0; }
}
@keyframes wf-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes wf-cursor-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 0.85; }
}
@keyframes wf-cursor-glow {
  0%, 100% { filter: drop-shadow(0 0 6px rgba(249,115,22,0.35)) drop-shadow(0 2px 10px rgba(249,115,22,0.15)); }
  50% { filter: drop-shadow(0 0 12px rgba(249,115,22,0.5)) drop-shadow(0 2px 16px rgba(249,115,22,0.3)); }
}
@keyframes wf-cursor-click {
  0% { transform: scale(1); }
  30% { transform: scale(0.85); }
  60% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
@keyframes wf-scroll-indicator {
  0% { opacity: 0; transform: translateY(0); }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(var(--scroll-dir, 12px)); }
}
@keyframes wf-click-ring {
  0% { transform: scale(0.3); opacity: 0.85; border-width: 2.5px; }
  40% { opacity: 0.5; }
  100% { transform: scale(3); opacity: 0; border-width: 0.5px; }
}
.wf-browser-frame { cursor: pointer; position: relative; user-select: none; }
.wf-browser-frame:active { cursor: grabbing; }
.wf-input-focus:focus-within {
  border-color: rgba(59,130,246,0.3) !important;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.06);
}
.wf-screenshot-transition {
  transition: opacity 0.15s ease;
}
`;
function injectCSS() {
  if (cssInjected) return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  cssInjected = true;
}

// ── Action Parser (fast, minimal) ──

function parseExploreAction(raw: string): { action: ExploreAction; observation: string; reasoning: string } | null {
  let observation = '';
  let reasoning = '';
  const obsMatch = raw.match(/OBS(?:ERVATION)?:\s*(.+?)(?=REASON|ACT|```|$)/s);
  if (obsMatch) observation = obsMatch[1].trim();
  const reasonMatch = raw.match(/REASON(?:ING)?:\s*(.+?)(?=ACT|```|$)/s);
  if (reasonMatch) reasoning = reasonMatch[1].trim();

  const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || raw.match(/(\{[\s\S]*?"action"\s*:[\s\S]*?\})/);
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[1]);
      if (json.action) return {
        action: {
          action: json.action, scrollY: json.scrollY || json.scroll_y,
          clickX: json.clickX || json.click_x, clickY: json.clickY || json.click_y,
          selector: json.selector, url: json.url, text: json.text,
          question: json.question, options: json.options,
        },
        observation, reasoning,
      };
    } catch { /* fallback */ }
  }

  const lower = raw.toLowerCase();
  if (lower.includes('"done"') || lower.includes("i'm done") || lower.includes('complete')) return { action: { action: 'done' }, observation, reasoning };
  if (lower.includes('scroll down')) return { action: { action: 'scroll', scrollY: 600 }, observation, reasoning };
  if (lower.includes('scroll up')) return { action: { action: 'scroll', scrollY: -600 }, observation, reasoning };
  if (lower.includes('go back')) return { action: { action: 'back' }, observation, reasoning };
  return null;
}

// ── Command Parser ──

function parseCommand(input: string): { type: string; label: string; selector?: string; js?: string; scrollY?: number } | null {
  const lower = input.toLowerCase().trim();
  if (/^scroll\s*(down|up)?\s*(\d+)?/.test(lower)) {
    const up = lower.includes('up'); const m = lower.match(/(\d+)/);
    return { type: 'scroll', label: `Scrolling ${up ? 'up' : 'down'}...`, scrollY: up ? -(m ? parseInt(m[1]) : 600) : (m ? parseInt(m[1]) : 600) };
  }
  if (/^click\s+(.+)/.test(lower)) {
    const target = input.replace(/^click\s+/i, '').trim();
    return { type: 'click', label: `Clicking "${target}"...`, selector: target.startsWith('.') || target.startsWith('#') ? target : `text="${target}"` };
  }
  if (/^(extract|get)\s+(text|content)/.test(lower)) return { type: 'extract_text', label: 'Extracting...' };
  if (/^(go\s+to|navigate|open)\s+/.test(lower)) {
    let t = input.replace(/^(go\s+to|navigate\s+to|open)\s+/i, '').trim();
    if (!/^https?:\/\//.test(t)) t = 'https://' + t;
    return { type: 'navigate', label: 'Navigating...', js: t };
  }
  return null;
}

// ════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════

export function WayfayerPlusPanel({ standalone = false }: { standalone?: boolean } = {}) {
  const { isDarkMode: isDark } = useTheme();
  const { tabs, activeTab, createTab, closeTab, switchTab, updateTab, machines } = useTabManager();

  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [visionModel, setVisionModel] = useState(getVisionModel());
  const [thinkingModel, setThinkingModel] = useState(getThinkingModel());

  // ── Sandbox / VNC mode ──
  const [browserMode, setBrowserMode] = useState<'screenshot' | 'vnc'>('screenshot');
  const [sandboxReady, setSandboxReady] = useState(false);
  const [agentMode, setAgentMode] = useState<'simple' | 'plan-act'>('simple');
  const [currentPlan, setCurrentPlan] = useState<AgentPlan | null>(null);
  const vncRef = useRef<any>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screenshotB64, setScreenshotB64] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [viewportW] = useState(1280);
  const [viewportH] = useState(900);

  const [controlMode, setControlMode] = useState<ControlMode>('ai');
  const [fullscreen, setFullscreen] = useState(false);

  // AI cursor position (viewport coords, scaled to display)
  const [aiCursor, setAiCursor] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });

  const [exploring, setExploring] = useState(false);
  const [exploreStep, setExploreStep] = useState(0);
  const [maxSteps] = useState(15);
  const [streamingText, setStreamingText] = useState('');
  const exploreAbortRef = useRef<AbortController | null>(null);
  const exploringRef = useRef(false);

  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [showAllActions, setShowAllActions] = useState(false);
  const actionIdRef = useRef(0);

  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const rippleIdRef = useRef(0);

  // Decision prompt — AI pauses explore to ask user
  const [decisionPrompt, setDecisionPrompt] = useState<DecisionPrompt | null>(null);

  // Current AI activity mode for thinking orb animation
  const [aiActivity, setAiActivity] = useState<'thinking' | 'browsing' | 'exploring' | 'clicking' | 'scrolling' | 'computing' | 'typing'>('thinking');

  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const acRef = useRef<AbortController | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const actingRef = useRef(false);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(injectCSS, []);
  useEffect(() => { const el = timelineEndRef.current?.parentElement; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [actions]);
  useEffect(() => { return () => { exploreAbortRef.current?.abort(); acRef.current?.abort(); if (sessionId) screenshotService.sessionClose(sessionId); }; }, [sessionId]);

  // Sandbox health check — auto-detect VNC mode availability
  useEffect(() => {
    let mounted = true;
    sandboxService.health().then(ok => {
      if (mounted && ok) { setSandboxReady(true); setBrowserMode('vnc'); }
    });
    return () => { mounted = false; };
  }, []);

  const isLive = phase === 'live';
  const isVNC = browserMode === 'vnc' && sandboxReady;

  // Compact actions — group consecutive scrolls, limit visible
  const compactActions = useMemo(() => {
    const grouped: ActionRecord[] = [];
    let scrollGroup: ActionRecord[] = [];

    const flushScrolls = () => {
      if (scrollGroup.length === 0) return;
      if (scrollGroup.length === 1) { grouped.push(scrollGroup[0]); }
      else {
        grouped.push({
          ...scrollGroup[scrollGroup.length - 1],
          detail: `Scrolled ${scrollGroup.length}x`,
          action: 'scroll_group',
        });
      }
      scrollGroup = [];
    };

    for (const a of actions) {
      if (a.action === 'scroll' && a.actor !== 'system') {
        scrollGroup.push(a);
      } else {
        flushScrolls();
        grouped.push(a);
      }
    }
    flushScrolls();
    return grouped;
  }, [actions]);

  const visibleActions = showAllActions ? compactActions : compactActions.slice(-8);

  const recordAction = useCallback((actor: 'ai' | 'human' | 'system', action: string, detail: string, extra?: Partial<ActionRecord>) => {
    const rec: ActionRecord = { id: ++actionIdRef.current, actor, action, detail, timestamp: Date.now(), collapsed: true, ...extra };
    setActions(prev => [...prev, rec]);
    return rec;
  }, []);

  // ── Session ──
  function cancel() {
    acRef.current?.abort(); exploreAbortRef.current?.abort(); exploringRef.current = false; actingRef.current = false;
    setExploring(false); setChatBusy(false); setStatus(''); setStreamingText(''); setAiCursor(c => ({ ...c, visible: false }));
    setPhase(p => p === 'idle' ? 'idle' : sessionId ? 'live' : 'idle');
  }

  async function openSession() {
    let t = url.trim();
    if (!t) return;
    if (!/^https?:\/\//.test(t)) { t = 'https://' + t; setUrl(t); }
    acRef.current?.abort();
    const ac = new AbortController(); acRef.current = ac;
    setPhase('connecting'); setStatus('Connecting...'); setScreenshotB64(''); setActions([]); setStreamingText(''); setCurrentPlan(null);
    if (sessionId) { screenshotService.sessionClose(sessionId); setSessionId(null); }

    if (isVNC) {
      // VNC mode — use sandbox API
      try {
        const res = await sandboxService.navigate(t);
        if (ac.signal.aborted) return;
        if (res.error) { setPhase('error'); setStatus(res.error); return; }
        setSessionId('vnc'); setPageTitle(res.title || t); setPageUrl(res.url || t);
        setPhase('live'); setStatus(''); setControlMode('ai');
        recordAction('system', 'navigate', `Opened ${new URL(t).hostname}`, { pageTitle: res.title, pageUrl: t });
      } catch (err: any) { if (!ac.signal.aborted) { setPhase('error'); setStatus(err?.message || 'Sandbox unavailable'); } }
    } else {
      // Screenshot mode — use wayfarer
      try {
        const res = await screenshotService.sessionOpen(t, { viewportWidth: viewportW, viewportHeight: viewportH, signal: ac.signal });
        if (ac.signal.aborted) return;
        if (res.error || !res.image_base64) { setPhase('error'); setStatus(res.error || 'Failed'); return; }
        setSessionId(res.session_id); setScreenshotB64(res.image_base64); setPageTitle(res.title || t); setPageUrl(t);
        setPhase('live'); setStatus(''); setControlMode('ai');
        recordAction('system', 'navigate', `Opened ${new URL(t).hostname}`, { pageTitle: res.title, pageUrl: t });
      } catch (err: any) {
          if (!ac.signal.aborted) {
            const msg = err?.message || 'Failed';
            const friendly = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')
              ? 'Wayfarer server not running — start it on port 8889'
              : msg;
            setPhase('error'); setStatus(friendly);
          }
        }
    }
  }

  // ── Execute action + record ──
  async function execAction(actor: 'ai' | 'human', actionType: string, opts: {
    clickX?: number; clickY?: number; scrollY?: number; selector?: string; js?: string;
  }, detail: string, meta?: { observation?: string; reasoning?: string }) {
    if (!sessionId || actingRef.current) return {};
    actingRef.current = true;
    const start = Date.now();
    try {
      if (isVNC) {
        // VNC mode — route actions through sandbox API
        let pageInfo: { error: string | null; title: string; url: string } = { error: null, title: pageTitle, url: pageUrl };
        switch (actionType) {
          case 'click':
            if (opts.clickX != null && opts.clickY != null) {
              // Convert pixel click to sandbox click via JS injection
              await sandboxService.consoleExec(`document.elementFromPoint(${opts.clickX},${opts.clickY})?.click()`);
            }
            break;
          case 'scroll':
            await sandboxService.scroll(opts.scrollY && opts.scrollY < 0 ? 'up' : 'down', Math.abs(opts.scrollY || 500));
            break;
          case 'navigate':
            if (opts.js) pageInfo = await sandboxService.navigate(opts.js);
            break;
          case 'back':
            pageInfo = await sandboxService.back();
            break;
          case 'evaluate':
            if (opts.js) await sandboxService.consoleExec(opts.js);
            break;
        }
        // Refresh page info
        try {
          const v = await sandboxService.view();
          setPageTitle(v.title); setPageUrl(v.url);
          pageInfo = { error: null, title: v.title, url: v.url };
        } catch {}
        recordAction(actor, actionType, detail, {
          pageTitle: pageInfo.title || pageTitle,
          pageUrl: pageInfo.url || pageUrl,
          duration: Date.now() - start,
          ...(meta || {}),
        });
        return { title: pageInfo.title, url: pageInfo.url, error: pageInfo.error };
      } else {
        // Screenshot mode — use wayfarer session API
        const res = await screenshotService.sessionAction(sessionId, actionType, { ...opts, quality: fullscreen ? 40 : 55 });
        if (res.image_base64) {
          setScreenshotB64(res.image_base64);
          if (res.title) setPageTitle(res.title);
          if (res.current_url) setPageUrl(res.current_url);
        }
        recordAction(actor, actionType, detail, {
          screenshotB64: res.image_base64 || undefined,
          pageTitle: res.title || pageTitle,
          pageUrl: res.current_url || pageUrl,
          duration: Date.now() - start,
          ...(meta || {}),
        });
        return { screenshotB64: res.image_base64, title: res.title, url: res.current_url, error: res.error };
      }
    } catch { return { error: 'Failed' }; }
    finally { actingRef.current = false; }
  }

  // ── Show AI cursor then click ──
  async function aiClick(vpX: number, vpY: number, detail: string, meta?: { observation?: string; reasoning?: string }) {
    if (!imgRef.current) return execAction('ai', 'click', { clickX: vpX, clickY: vpY }, detail, meta);
    const rect = imgRef.current.getBoundingClientRect();
    const dispX = vpX / viewportW * rect.width;
    const dispY = vpY / viewportH * rect.height;

    // Animate cursor to position
    setAiCursor({ x: dispX, y: dispY, visible: true });
    await new Promise(r => setTimeout(r, 180)); // quick cursor animation

    // Show click ripple
    const id = ++rippleIdRef.current;
    setRipples(p => [...p, { x: dispX, y: dispY, id }]);
    setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 600);

    const result = await execAction('ai', 'click', { clickX: vpX, clickY: vpY }, detail, meta);
    setTimeout(() => setAiCursor(c => ({ ...c, visible: false })), 800);
    return result;
  }

  // ── Human click ──
  function handleScreenshotClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!sessionId || !imgRef.current || exploring) return;
    const rect = imgRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left; const relY = e.clientY - rect.top;
    const vpX = Math.round(relX * (viewportW / rect.width)); const vpY = Math.round(relY * (viewportH / rect.height));
    const id = ++rippleIdRef.current;
    setRipples(p => [...p, { x: relX, y: relY, id }]);
    setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 600);
    execAction('human', 'click', { clickX: vpX, clickY: vpY }, `Clicked (${vpX}, ${vpY})`);
  }

  function handleScreenshotWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!sessionId || exploring) return;
    e.preventDefault();
    const amount = Math.sign(e.deltaY) * 400;
    execAction('human', 'scroll', { scrollY: amount }, `Scrolled ${amount > 0 ? 'down' : 'up'}`);
  }

  // ══════════════════════════════════════════
  // AGENTIC EXPLORE (fast, minimal prompts)
  // ══════════════════════════════════════════

  const runAutoExplore = useCallback(async (goal: string) => {
    if (!sessionId || exploringRef.current) return;
    exploringRef.current = true; setExploring(true); setExploreStep(0); setStreamingText(''); setControlMode('ai');
    const ac = new AbortController(); exploreAbortRef.current = ac;

    let curSS = screenshotB64, curTitle = pageTitle, curUrl = pageUrl;
    let sameCount = 0, lastSS = '';
    let lastStep = 0;

    const goalText = goal || 'Explore this page fully. Scroll through all content and click key links.';
    recordAction('system', 'explore_start', goal ? `Exploring: ${goal}` : 'Auto-exploring');

    // Progress memory — persists across all steps so the AI never forgets
    const progressLog: string[] = [];
    const sitesVisited: string[] = [];

    for (let step = 1; step <= maxSteps; step++) {
      lastStep = step;
      if (ac.signal.aborted) break;
      setExploreStep(step);

      // Track sites
      if (curUrl && !sitesVisited.includes(curUrl)) sitesVisited.push(curUrl);

      // Build rich context — last 12 actions with observations, grouped
      const recentActions = actions.slice(-12).map(a => {
        let line = `[${a.actor}] ${a.detail}`;
        if (a.pageUrl && a.pageUrl !== curUrl) { try { line += ` (on ${new URL(a.pageUrl).hostname})`; } catch {} }
        if (a.observation) line += ` → saw: ${a.observation.slice(0, 60)}`;
        return line;
      }).join('\n');

      // Build progress summary from last few reasonings
      const lastReasonings = actions.slice(-5)
        .filter(a => a.reasoning)
        .map(a => a.reasoning!.slice(0, 50));

      const prompt = [
        `GOAL: ${goalText}`,
        `CURRENT PAGE: "${curTitle}" [${curUrl}]`,
        `STEP: ${step}/${maxSteps}`,
        sitesVisited.length > 1 ? `SITES VISITED: ${sitesVisited.map(u => { try { return new URL(u).hostname; } catch { return u; }}).join(', ')}` : '',
        progressLog.length ? `PROGRESS:\n${progressLog.slice(-5).join('\n')}` : '',
        recentActions ? `HISTORY:\n${recentActions}` : '',
        lastReasonings.length ? `RECENT THINKING: ${lastReasonings.join(' → ')}` : '',
        'What action moves us toward the goal?',
      ].filter(Boolean).join('\n');

      const sys = `You are a browser agent. You control a 1280x900 pixel viewport.

YOUR JOB: Complete the user's goal by taking actions. Think step by step about what to do next.

RULES:
- If the target (button, link, input) is VISIBLE on screen → click it immediately. Don't scroll past it.
- Only scroll if the target is NOT visible and might be below.
- If you're on the wrong page for the goal → navigate to the right URL.
- If the page changed (new URL/title) → observe what's new before acting.
- For multi-step tasks: remember your progress. Each step should build on the last.
- If stuck (same page, nothing changed) → try a different approach.
- IMPORTANT: If you've scrolled 3+ times without clicking, STOP scrolling and look carefully at what's on screen. The target may already be visible.
- Be action-oriented: click > type > scroll. Don't over-scroll.

FORMAT (strict):
OBS: [what you see on the current page — key elements, buttons, text]
REASON: [why you're taking this action — connect it to the goal]
ACT: \`\`\`json
{"action":"click","clickX":640,"clickY":450}
\`\`\`

ACTIONS:
- click: {"action":"click","clickX":X,"clickY":Y} — pixel coordinates
- scroll: {"action":"scroll","scrollY":600} — positive=down, negative=up
- type: {"action":"type","text":"...","clickX":X,"clickY":Y} — click input first, then type
- navigate: {"action":"navigate","url":"https://..."} — go to URL
- back: {"action":"back"} — browser back
- done: {"action":"done"} — goal is complete
- ask_user: {"action":"ask_user","question":"...","options":["A","B","C"]} — ONLY when there are real choices (size/color/variant). Never ask for confirmation.`;

      let raw = '';
      setStreamingText(''); setAiActivity('thinking');
      // Downscale screenshot for faster vision inference (640x450 vs 1280x900 = 4x fewer pixels)
      const smallSS = await downscaleB64(curSS);
      try {
        await ollamaService.generateStream(prompt, sys, {
          model: visionModel,
          images: [smallSS],
          signal: ac.signal,
          temperature: 0.15,
          top_p: 0.8,
          num_predict: 120,
          keep_alive: '30m',
          onChunk: (c: string) => { raw += c; setStreamingText(raw); },
        });
      } catch { if (ac.signal.aborted) break; }
      setStreamingText('');
      if (ac.signal.aborted) break;

      const parsed = parseExploreAction(raw);
      if (!parsed) {
        // Fallback: scroll down
        await execAction('ai', 'scroll', { scrollY: 600 }, 'Scrolled down (fallback)');
        continue;
      }

      const { action: act, observation, reasoning } = parsed;
      const meta = { observation, reasoning };

      if (act.action === 'done') { recordAction('ai', 'done', observation || 'Goal complete', meta); break; }

      // Same-screenshot guard
      if (curSS === lastSS) { sameCount++; if (sameCount >= 3) { recordAction('ai', 'done', 'No change — stopping'); break; } }
      else sameCount = 0;
      lastSS = curSS;

      // Execute — observation/reasoning attached to each action immediately
      let result: any = {};
      switch (act.action) {
        case 'scroll':
          setAiActivity('scrolling');
          result = await execAction('ai', 'scroll', { scrollY: act.scrollY || 600 },
            `Scrolled ${(act.scrollY || 600) > 0 ? 'down' : 'up'}`, meta);
          break;
        case 'click':
          setAiActivity('clicking');
          if (act.clickX != null && act.clickY != null) {
            result = await aiClick(act.clickX, act.clickY,
              reasoning ? `${reasoning.slice(0, 60)}` : `Clicked (${act.clickX}, ${act.clickY})`, meta);
          } else if (act.selector) {
            result = await execAction('ai', 'click', { selector: act.selector }, `Clicked "${act.selector}"`, meta);
          }
          break;
        case 'type':
          setAiActivity('typing');
          if (act.text) {
            if (act.clickX != null && act.clickY != null) {
              await aiClick(act.clickX, act.clickY, `Focused input`, meta);
              await new Promise(r => setTimeout(r, 100));
            }
            result = await execAction('ai', 'evaluate', { js: `document.activeElement?.value !== undefined ? (document.activeElement.value = ${JSON.stringify(act.text)}, document.activeElement.dispatchEvent(new Event('input', {bubbles:true})), 'typed') : 'no input focused'` }, `Typed "${act.text.slice(0, 40)}"`, meta);
          }
          break;
        case 'navigate':
          setAiActivity('browsing');
          result = await execAction('ai', 'navigate', { js: act.url }, `Navigated to ${act.url}`, meta);
          break;
        case 'back':
          setAiActivity('browsing');
          result = await execAction('ai', 'back', {}, 'Went back', meta);
          break;
        case 'ask_user':
          if (act.question && act.options && act.options.length > 0) {
            recordAction('ai', 'ask_user', act.question, meta);
            const answer = await new Promise<string>((resolve) => {
              setDecisionPrompt({ question: act.question!, options: act.options!, screenshotB64: curSS, resolve });
            });
            setDecisionPrompt(null);
            recordAction('human', 'answer', `Chose: ${answer}`);
          }
          break;
      }

      if (result?.screenshotB64) curSS = result.screenshotB64;
      if (result?.title) curTitle = result.title;
      if (result?.url) curUrl = result.url;

      // Track progress — compact log entry per step
      if (observation || reasoning) {
        const entry = `Step ${step}: ${act.action}${reasoning ? ` — ${reasoning.slice(0, 80)}` : ''}${result?.title && result.title !== curTitle ? ` → now on "${result.title}"` : ''}`;
        progressLog.push(entry);
      }

      // Every 5 steps, compress the progress log to keep prompt size manageable
      if (progressLog.length > 8) {
        const summary = `Steps 1-${step-1}: ${progressLog.slice(0, -3).map(p => p.replace(/^Step \d+: /, '')).join('; ').slice(0, 150)}`;
        progressLog.splice(0, progressLog.length - 3, summary);
      }

      await new Promise(r => setTimeout(r, 30));
    }

    recordAction('system', 'explore_end', `Done after ${lastStep} steps`);
    exploringRef.current = false; setExploring(false); setStreamingText('');
    setAiCursor(c => ({ ...c, visible: false }));
  }, [sessionId, screenshotB64, pageTitle, pageUrl, visionModel, maxSteps, actions, recordAction]);

  // ══════════════════════════════════════════
  // SANDBOX EXPLORE (VNC + element indexing + Plan-Act)
  // ══════════════════════════════════════════

  const runSandboxExplore = useCallback(async (goal: string) => {
    if (exploringRef.current) return;
    exploringRef.current = true; setExploring(true); setExploreStep(0); setStreamingText(''); setControlMode('ai');
    const ac = new AbortController(); exploreAbortRef.current = ac;

    let lastStep = 0;
    const goalText = goal || 'Explore this page and summarize what you find.';
    recordAction('system', 'explore_start', goal ? `Exploring: ${goal}` : 'Auto-exploring');

    if (agentMode === 'plan-act') {
      // Plan-Act agent mode
      setAiActivity('thinking');
      await runPlanAct(goalText, getPlannerModel(), getExecutorModel(), {
        onPlan: (plan) => {
          setCurrentPlan(plan);
          recordAction('system', 'explore_start', `Plan: ${plan.steps.map(s => s.description).join(' → ')}`);
        },
        onStepStart: (step) => {
          setAiActivity('exploring');
          setStreamingText(`Step ${step.step}: ${step.description}`);
          recordAction('ai', 'explore_start', `Step ${step.step}: ${step.description}`);
        },
        onAction: (action, result) => {
          lastStep++;
          setExploreStep(s => s + 1);
          const detail = action.reason || `${action.action}${action.index != null ? ` [${action.index}]` : ''}`;
          recordAction('ai', action.action, detail, { observation: result, reasoning: action.reason });
          // Update page info + animate cursor on element actions
          sandboxService.view().then(v => {
            setPageTitle(v.title); setPageUrl(v.url);
            // Animate cursor to clicked/interacted element
            if (action.index != null && vncRef.current) {
              const el = v.elements.find(e => e.index === action.index);
              if (el?.rect) {
                const vncEl = vncRef.current as HTMLElement | null;
                const container = vncEl?.parentElement;
                if (container) {
                  const containerRect = container.getBoundingClientRect();
                  // Map element viewport coords to display coords
                  const scaleX = containerRect.width / 1280;
                  const scaleY = containerRect.height / 900;
                  const dispX = (el.rect.x + el.rect.w / 2) * scaleX;
                  const dispY = (el.rect.y + el.rect.h / 2) * scaleY;
                  setAiCursor({ x: dispX, y: dispY, visible: true });
                  // Click ripple
                  if (action.action === 'click' || action.action === 'input') {
                    setTimeout(() => {
                      const id = ++rippleIdRef.current;
                      setRipples(p => [...p, { x: dispX, y: dispY, id }]);
                      setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 700);
                    }, 200);
                  }
                  // Cursor stays visible during agent run — onStream hides it when done
                }
              }
            }
            // Scroll animation — show cursor moving in scroll direction
            if (action.action === 'scroll_down' || action.action === 'scroll_up') {
              const vncEl = vncRef.current as HTMLElement | null;
              const container = vncEl?.parentElement;
              if (container) {
                const rect = container.getBoundingClientRect();
                const centerX = rect.width / 2;
                const startY = action.action === 'scroll_down' ? rect.height * 0.4 : rect.height * 0.6;
                setAiCursor({ x: centerX, y: startY, visible: true });
                setTimeout(() => {
                  const endY = action.action === 'scroll_down' ? rect.height * 0.6 : rect.height * 0.4;
                  setAiCursor({ x: centerX, y: endY, visible: true });
                }, 200);
              }
            }
          }).catch(() => {});
        },
        onThinking: (text) => {
          setStreamingText(text);
          setAiActivity('thinking');
        },
        onStepComplete: (step) => {
          recordAction('ai', step.status === 'done' ? 'done' : 'explore_end', `Step ${step.step}: ${step.status}`);
        },
        onAskUser: async (question, options) => {
          return new Promise<string>((resolve) => {
            setDecisionPrompt({ question, options, resolve });
          });
        },
        onDone: (summary) => {
          recordAction('system', 'explore_end', summary);
        },
        onError: (err) => {
          recordAction('system', 'explore_end', `Error: ${err}`);
        },
        onStream: (event: StreamEvent) => {
          // Keep cursor visible throughout agent execution
          if (event.type === 'step_start') {
            setAiCursor(c => ({ ...c, visible: true }));
            setAiActivity('exploring');
          }
          // Pulse cursor glow on action execution
          if (event.type === 'action_executing') {
            setAiActivity(event.action?.action === 'click' ? 'clicking' : event.action?.action === 'input' || event.action?.action === 'type' ? 'typing' : 'exploring');
          }
          // Show verification activity
          if (event.type === 'verify_start') {
            setAiActivity('thinking');
            setStreamingText('Verifying...');
          }
          if (event.type === 'verify_result') {
            const v = event.verification;
            if (v && !v.success) {
              setStreamingText(`Verify failed: ${v.observation || 'mismatch'}`);
            }
          }
          // Show recovery activity
          if (event.type === 'recovery_start') {
            setAiActivity('thinking');
            setStreamingText(`Recovering: ${event.recovery?.description || event.recovery?.type || '...'}`);
          }
          // Show replan
          if (event.type === 'replan' && event.plan) {
            setCurrentPlan({ ...event.plan });
            setStreamingText('Re-planned strategy');
          }
          // Hide cursor when done
          if (event.type === 'done' || event.type === 'error') {
            setTimeout(() => setAiCursor(c => ({ ...c, visible: false })), 1500);
            setAiActivity(null);
          }
        },
      }, maxSteps, ac.signal);
    } else {
      // Simple element-index mode (no planner, direct executor loop)
      for (let step = 1; step <= maxSteps; step++) {
        lastStep = step;
        if (ac.signal.aborted) break;
        setExploreStep(step); setAiActivity('exploring');

        // Get page state with elements
        let viewResult;
        try { viewResult = await sandboxService.view(); } catch { break; }
        setPageTitle(viewResult.title); setPageUrl(viewResult.url);

        const elementsText = sandboxService.formatElements(viewResult.elements);
        const recentActions = actions.slice(-8).map(a => `[${a.actor}] ${a.detail}`).join('\n');

        const prompt = [
          `GOAL: ${goalText}`,
          `PAGE: "${viewResult.title}" [${viewResult.url}]`,
          `STEP: ${step}/${maxSteps}`,
          elementsText ? `ELEMENTS:\n${elementsText}` : 'No interactive elements found.',
          viewResult.pageText ? `PAGE TEXT:\n${viewResult.pageText.slice(0, 1500)}` : '',
          recentActions ? `RECENT:\n${recentActions}` : '',
          'Pick ONE action to advance the goal.',
        ].filter(Boolean).join('\n\n');

        const sys = `You are a browser agent. Pick elements by index number.
OUTPUT JSON only: {"action":"click","index":3,"reason":"clicking Add to Cart"}
ACTIONS: click(index), input(index,text), scroll_down, scroll_up, navigate(url), press_key(key), back, done, ask_user(question,options[])
RULES: Click visible targets immediately. Only scroll if target not visible. ask_user only for real choices.`;

        let raw = ''; setStreamingText(''); setAiActivity('thinking');
        try {
          await ollamaService.generateStream(prompt, sys, {
            model: getExecutorModel(),
            temperature: 0.1,
            num_predict: 100,
            signal: ac.signal,
            onChunk: (c: string) => { raw += c; setStreamingText(raw); },
          });
        } catch { if (ac.signal.aborted) break; }
        setStreamingText('');

        // Parse action
        const jsonMatch = raw.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) continue;
        let act;
        try { act = JSON.parse(jsonMatch[0]); } catch { continue; }
        const reason = act.reason || '';

        if (act.action === 'done') { recordAction('ai', 'done', reason || 'Goal complete'); break; }

        // Animate cursor to target element before executing
        const animateCursorToElement = (index: number) => {
          const el = viewResult!.elements.find(e => e.index === index);
          if (!el?.rect || !vncRef.current) return;
          const container = (vncRef.current as HTMLElement)?.parentElement;
          if (!container) return;
          const cr = container.getBoundingClientRect();
          const sx = cr.width / 1280, sy = cr.height / 900;
          const dx = (el.rect.x + el.rect.w / 2) * sx;
          const dy = (el.rect.y + el.rect.h / 2) * sy;
          setAiCursor({ x: dx, y: dy, visible: true });
          return { x: dx, y: dy };
        };

        const animateScroll = (dir: 'down' | 'up') => {
          const container = (vncRef.current as HTMLElement)?.parentElement;
          if (!container) return;
          const cr = container.getBoundingClientRect();
          const cx = cr.width / 2;
          const sy = dir === 'down' ? cr.height * 0.4 : cr.height * 0.6;
          setAiCursor({ x: cx, y: sy, visible: true });
          setTimeout(() => {
            const ey = dir === 'down' ? cr.height * 0.6 : cr.height * 0.4;
            setAiCursor({ x: cx, y: ey, visible: true });
          }, 150);
          setTimeout(() => setAiCursor(c => ({ ...c, visible: false })), 600);
        };

        // Execute
        try {
          switch (act.action) {
            case 'click':
              setAiActivity('clicking');
              if (act.index != null) {
                const pos = animateCursorToElement(act.index);
                await new Promise(r => setTimeout(r, 200)); // let cursor animate
                if (pos) {
                  const id = ++rippleIdRef.current;
                  setRipples(p => [...p, { x: pos.x, y: pos.y, id }]);
                  setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 700);
                }
                await sandboxService.click(act.index);
                setTimeout(() => setAiCursor(c => ({ ...c, visible: false })), 600);
              }
              recordAction('ai', 'click', reason || `Clicked [${act.index}]`);
              break;
            case 'input':
              setAiActivity('typing');
              if (act.index != null && act.text) {
                animateCursorToElement(act.index);
                await new Promise(r => setTimeout(r, 150));
                await sandboxService.input(act.index, act.text, !!act.press_enter);
                setTimeout(() => setAiCursor(c => ({ ...c, visible: false })), 500);
              }
              recordAction('ai', 'navigate', reason || `Typed "${(act.text || '').slice(0, 30)}"`);
              break;
            case 'scroll_down':
              setAiActivity('scrolling');
              animateScroll('down');
              await sandboxService.scroll('down'); recordAction('ai', 'scroll', reason || 'Scrolled down');
              break;
            case 'scroll_up':
              setAiActivity('scrolling');
              animateScroll('up');
              await sandboxService.scroll('up'); recordAction('ai', 'scroll', reason || 'Scrolled up');
              break;
            case 'navigate':
              setAiActivity('browsing');
              if (act.url) await sandboxService.navigate(act.url);
              recordAction('ai', 'navigate', reason || `Navigated to ${act.url}`);
              break;
            case 'press_key':
              if (act.key) await sandboxService.pressKey(act.key);
              recordAction('ai', 'navigate', reason || `Pressed ${act.key}`);
              break;
            case 'back':
              setAiActivity('browsing');
              await sandboxService.back(); recordAction('ai', 'navigate', reason || 'Went back');
              break;
            case 'ask_user':
              if (act.question && act.options?.length) {
                const answer = await new Promise<string>(resolve => {
                  setDecisionPrompt({ question: act.question, options: act.options, resolve });
                });
                recordAction('human', 'answer', `Chose: ${answer}`);
              }
              break;
          }
        } catch (e) { recordAction('system', 'explore_end', `Error: ${e}`); break; }

        await new Promise(r => setTimeout(r, 30));
      }
    }

    recordAction('system', 'explore_end', `Done after ${lastStep} steps`);
    exploringRef.current = false; setExploring(false); setStreamingText(''); setCurrentPlan(null);
  }, [agentMode, maxSteps, actions, recordAction]);

  // ── Take Control ──
  const toggleControl = useCallback(() => {
    if (controlMode === 'ai') {
      if (exploring) { exploreAbortRef.current?.abort(); exploringRef.current = false; setExploring(false); setStreamingText(''); }
      setControlMode('human'); setFullscreen(true);
      recordAction('system', 'control', 'You took control');
    } else {
      setControlMode('ai'); setFullscreen(false);
      recordAction('system', 'control', `Control returned (${actions.filter(a => a.actor === 'human').length} manual actions recorded)`);
    }
  }, [controlMode, exploring, recordAction, actions]);

  // ── Auto-Escalation — bump settings when a skill fails ──
  function autoEscalate(skillId: string, error: string, currentProf: import('../utils/agentSkills').SkillProfile): ParsedAdjustment | null {
    const tweaks: ProfileTweak[] = [];
    const lowerErr = error.toLowerCase();

    // Vision/screenshot failures → bump resolution + quality
    if (currentProf.vision && (lowerErr.includes('screenshot') || lowerErr.includes('vision') || lowerErr.includes('image') || lowerErr.includes('could not') || lowerErr.includes('empty'))) {
      const vis = currentProf.vision.imageSettings;
      tweaks.push(
        { description: 'maxWidth → 1280', field: 'vision.imageSettings.maxWidth', oldValue: vis.maxWidth, newValue: Math.max(vis.maxWidth, 1280) },
        { description: 'maxHeight → 900', field: 'vision.imageSettings.maxHeight', oldValue: vis.maxHeight, newValue: Math.max(vis.maxHeight, 900) },
        { description: 'quality → 75', field: 'vision.imageSettings.quality', oldValue: vis.quality, newValue: Math.max(vis.quality, 75) },
        { description: 'separateTextGrab → true', field: 'vision.imageSettings.separateTextGrab', oldValue: vis.separateTextGrab, newValue: true },
      );
    }

    // LLM generation failures → more tokens + slightly higher temp
    if (lowerErr.includes('parse') || lowerErr.includes('json') || lowerErr.includes('empty') || lowerErr.includes('timeout') || lowerErr.includes('failed')) {
      tweaks.push(
        { description: 'num_predict * 1.5', field: 'primary.num_predict', oldValue: currentProf.primary.num_predict, newValue: Math.round(currentProf.primary.num_predict * 1.5) },
      );
    }

    // Research/network failures → no profile change can fix, skip
    if (lowerErr.includes('network') || lowerErr.includes('fetch') || lowerErr.includes('econnrefused')) {
      return null;
    }

    if (tweaks.length === 0) return null;

    const description = tweaks.map(t => t.description).join(', ');
    return {
      tweaks,
      description,
      applyTo: (profile) => {
        const p = JSON.parse(JSON.stringify(profile));
        for (const t of tweaks) {
          const parts = t.field.split('.');
          let cur = p;
          for (let i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] === undefined) return p; cur = cur[parts[i]]; }
          cur[parts[parts.length - 1]] = t.newValue;
        }
        return p;
      },
    };
  }

  // ── Skill Execution (non-browse skills, uses tuned profiles + task tracking) ──

  async function executeSkill(route: SkillRouteResult, signal: AbortSignal, overrideProfile?: import('../utils/agentSkills').SkillProfile) {
    const { skillId, params } = route;
    const skill = getSkill(skillId);
    const prof = overrideProfile || getSkillProfile(skillId);
    const task = skillTaskManager.create(skillId, params, prof);
    recordAction('system', 'skill', `Skill: ${skill?.name || skillId} — ${route.reasoning}`);

    switch (skillId) {
      case 'web_research': {
        setAiActivity('computing');
        const query = params.query || params.goal;
        setStreamingText(`Researching: "${query}"...`);
        try {
          const result = await wayfayerService.research(query, 15, signal);
          const summary = result.meta.success > 0
            ? `Found ${result.meta.success}/${result.meta.total} sources in ${result.meta.elapsed.toFixed(1)}s.\n\nTop sources:\n${result.sources.slice(0, 5).map(s => `- ${s.title} (${s.url})`).join('\n')}\n\nKey content (first 500 chars):\n${result.text.slice(0, 500)}`
            : `No results found for "${query}".`;
          setStreamingText('');
          recordAction('ai', 'research_done', summary.slice(0, 400));
          // Summarize with LLM — uses synthesis profile
          if (result.text) {
            const sp = prof.synthesis || prof.primary;
            let llmSummary = '';
            setAiActivity('thinking');
            await ollamaService.generateStream(
              `Research results for "${query}":\n\n${result.text.slice(0, 4000)}\n\nSummarize the key findings in 3-5 bullet points.`,
              'You are a research analyst. Summarize web research concisely.',
              { model: sp.model, signal, temperature: sp.temperature, top_p: sp.top_p, num_predict: sp.num_predict,
                onChunk: (c: string) => { llmSummary += c; setStreamingText(llmSummary); },
              },
            );
            setStreamingText('');
            recordAction('ai', 'answer', llmSummary.slice(0, 400));
          }
        } catch (e) {
          if (!signal.aborted) recordAction('ai', 'error', `Research failed: ${e}`);
        }
        break;
      }

      case 'analyze_product': {
        setAiActivity('computing');
        const url = params.url;
        if (!url) { recordAction('ai', 'error', 'No URL provided for product analysis'); break; }
        setStreamingText(`Analyzing product page: ${url}...`);
        try {
          const result = await analyzeProductPage(url, 'Product', (msg) => setStreamingText(msg), signal);
          setStreamingText('');
          const parts: string[] = [];
          if (result.description) parts.push(`Description: ${result.description}`);
          if (result.pricing?.length) parts.push(`Pricing: ${result.pricing.map(p => `${p.tier} - ${p.price}`).join(', ')}`);
          if (result.features?.length) parts.push(`Features: ${result.features.slice(0, 5).join(', ')}`);
          if (result.ingredients?.length) parts.push(`Ingredients: ${result.ingredients.length} found`);
          if (result.testimonials?.length) parts.push(`Testimonials: ${result.testimonials.length} found`);
          recordAction('ai', 'analysis_done', parts.join('\n').slice(0, 400) || result.error || 'Analysis complete');
        } catch (e) {
          if (!signal.aborted) recordAction('ai', 'error', `Product analysis failed: ${e}`);
        }
        break;
      }

      case 'analyze_competitor': {
        setAiActivity('computing');
        const brand = params.brand || params.goal;
        setStreamingText(`Analyzing competitor: ${brand}...`);
        try {
          const result = await analyzeCompetitor(brand, (msg) => setStreamingText(msg), signal);
          setStreamingText('');
          const parts: string[] = [`Domain: ${result.domain}`, `Products found: ${result.summary.totalProducts}`];
          if (result.summary.priceRange) parts.push(`Price range: ${result.summary.priceRange}`);
          if (result.summary.commonFeatures?.length) parts.push(`Common features: ${result.summary.commonFeatures.slice(0, 5).join(', ')}`);
          if (result.summary.brandPositioning) parts.push(`Positioning: ${result.summary.brandPositioning}`);
          recordAction('ai', 'analysis_done', parts.join('\n').slice(0, 400) || result.error || 'Analysis complete');
        } catch (e) {
          if (!signal.aborted) recordAction('ai', 'error', `Competitor analysis failed: ${e}`);
        }
        break;
      }

      case 'crawl_site': {
        setAiActivity('computing');
        let domain = params.url || '';
        if (!domain) { recordAction('ai', 'error', 'No URL/domain provided for crawl'); break; }
        domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        setStreamingText(`Crawling ${domain} for products...`);
        try {
          const products = await siteCrawler(domain, (msg) => setStreamingText(msg), signal);
          setStreamingText('');
          const summary = products.length > 0
            ? `Found ${products.length} products:\n${products.slice(0, 10).map(p => `- ${p.name} (${p.url})`).join('\n')}`
            : `No products found on ${domain}.`;
          recordAction('ai', 'crawl_done', summary.slice(0, 400));
        } catch (e) {
          if (!signal.aborted) recordAction('ai', 'error', `Crawl failed: ${e}`);
        }
        break;
      }

      case 'visual_scout': {
        setAiActivity('computing');
        const url = params.url;
        if (!url) { recordAction('ai', 'error', 'No URL provided for visual scout'); break; }
        setStreamingText(`Visual scouting: ${url}...`);
        const vp = prof.vision;
        const imgSettings = vp?.imageSettings || { maxWidth: 1280, maxHeight: 900, quality: 60, separateTextGrab: true };
        try {
          // Screenshot at profile-specified resolution
          const ss = await screenshotService.screenshot(url, {
            viewportWidth: imgSettings.maxWidth,
            viewportHeight: imgSettings.maxHeight,
            quality: imgSettings.quality,
            signal,
          });
          if (ss.error || !ss.image_base64) { recordAction('ai', 'error', `Screenshot failed: ${ss.error}`); break; }

          // Optional separate text grab for accuracy
          let textContext = '';
          if (imgSettings.separateTextGrab) {
            try {
              const pageData = await screenshotService.analyzePage(url, { quality: 30 });
              if (pageData.page_text?.fullText) textContext = `\n\nPage text:\n${pageData.page_text.fullText.slice(0, 2000)}`;
            } catch {}
          }

          let analysis = '';
          const vm = vp || prof.primary;
          setAiActivity('thinking');
          await ollamaService.generateStream(
            `Analyze this website screenshot. Describe: colors, layout style, typography, CTA design, overall visual tone, and what the design communicates about the brand.${textContext}`,
            'You are a visual design analyst. Analyze website screenshots for competitive intelligence.',
            { model: vm.model, images: [ss.image_base64], signal,
              temperature: vm.temperature, top_p: vm.top_p, num_predict: vm.num_predict,
              onChunk: (c: string) => { analysis += c; setStreamingText(analysis); },
            },
          );
          setStreamingText('');
          recordAction('ai', 'visual_done', analysis.slice(0, 400));
        } catch (e) {
          if (!signal.aborted) recordAction('ai', 'error', `Visual scout failed: ${e}`);
        }
        break;
      }

      case 'extract_data': {
        const ep = prof.synthesis || prof.primary;
        if (isVNC) {
          setAiActivity('computing');
          const url = params.url;
          if (url) await sandboxService.navigate(url);
          try {
            const v = await sandboxService.view();
            setPageTitle(v.title); setPageUrl(v.url);
            let extracted = '';
            setAiActivity('thinking');
            await ollamaService.generateStream(
              `Extract the following from this page: ${params.goal}\n\nPage text:\n${v.pageText.slice(0, 3000)}\n\nElements:\n${sandboxService.formatElements(v.elements).slice(0, 1500)}`,
              'You are a data extraction agent. Extract structured data from web page content. Output clean, organized data.',
              { model: ep.model, signal, temperature: ep.temperature, top_p: ep.top_p, num_predict: ep.num_predict,
                onChunk: (c: string) => { extracted += c; setStreamingText(extracted); },
              },
            );
            setStreamingText('');
            recordAction('ai', 'extract_done', extracted.slice(0, 400));
          } catch (e) {
            if (!signal.aborted) recordAction('ai', 'error', `Extraction failed: ${e}`);
          }
        } else {
          setChatBusy(false);
          isVNC ? runSandboxExplore(params.goal) : runAutoExplore(params.goal);
        }
        break;
      }

      default:
        // browse, answer_page, or unknown — run as explore task
        skillTaskManager.complete(task.id, 'Dispatched to browser explore');
        setChatBusy(false);
        isVNC ? runSandboxExplore(params.goal || params.url || '') : runAutoExplore(params.goal || params.url || '');
        return;
    }

    // Track completion — check last action for error vs success
    const lastAction = actions[actions.length - 1];
    if (lastAction?.action === 'error') {
      skillTaskManager.fail(task.id, lastAction.detail);

      // Auto-retry once with escalated settings if this was the first attempt
      if (task.retryCount === 0 && !signal.aborted) {
        const escalation = autoEscalate(skillId, lastAction.detail, prof);
        if (escalation) {
          recordAction('system', 'skill', `Auto-retrying with: ${escalation.description}`);
          const retryTask = skillTaskManager.prepareRetry(task.id, escalation);
          if (retryTask) {
            const retryRoute: SkillRouteResult = { skillId, confidence: 1, params, reasoning: `auto-retry: ${escalation.description}` };
            await executeSkill(retryRoute, signal, retryTask.profile);
            return;
          }
        }
      }
    } else {
      skillTaskManager.complete(task.id, lastAction?.detail || 'Complete');
    }
  }

  // ── Chat ──
  async function sendChat() {
    const m = chatInput.trim(); if (!m || !sessionId) return;
    setChatInput(''); setChatBusy(true);

    // Layer 1: Direct commands (scroll, click, navigate)
    const directCmd = parseCommand(m);
    if (directCmd) {
      const ac = new AbortController(); acRef.current = ac;
      try { await execAction('human', directCmd.type, { selector: directCmd.selector, js: directCmd.js, scrollY: directCmd.scrollY }, m); }
      catch {} finally { setChatBusy(false); }
      return;
    }

    // Layer 1.5: Adjustment commands — retry last skill with tweaked settings
    if (skillTaskManager.isAdjustmentCommand(m)) {
      const lastTask = skillTaskManager.getLatest();
      if (lastTask) {
        const ac = new AbortController(); acRef.current = ac;
        try {
          // Try keyword parse first, then LLM parse
          let adjustment = parseAdjustment(m, lastTask.profile);
          if (!adjustment) {
            setAiActivity('thinking'); setStreamingText('Parsing adjustment...');
            adjustment = await parseAdjustmentLLM(m, lastTask.profile, ac.signal);
            setStreamingText('');
          }
          if (adjustment) {
            const retryTask = skillTaskManager.prepareRetry(lastTask.id, adjustment);
            if (retryTask) {
              recordAction('system', 'skill', `Retrying with: ${adjustment.description}`);
              const route: SkillRouteResult = {
                skillId: retryTask.skillId,
                confidence: 1,
                params: retryTask.params,
                reasoning: `retry #${retryTask.retryCount}: ${adjustment.description}`,
              };
              await executeSkill(route, ac.signal, retryTask.profile);
            }
          } else {
            recordAction('system', 'skill', 'Could not parse adjustment — running as new task');
          }
        } catch {} finally { setChatBusy(false); setStreamingText(''); }
        return;
      }
    }

    // Layer 2: Quick keyword-based skill routing (no LLM call)
    const quick = quickRoute(m);
    if (quick && quick.confidence >= 0.85 && quick.skillId !== 'browse' && quick.skillId !== 'answer_page') {
      const ac = new AbortController(); acRef.current = ac;
      try { await executeSkill(quick, ac.signal); }
      catch {} finally { setChatBusy(false); setStreamingText(''); }
      return;
    }

    // Layer 3: Question detection — answer from current page
    const isQuestion = /^(what|how|why|is |are |does|do |where|when|which|who|tell me|explain|describe|show me what)/i.test(m);
    if (isQuestion) {
      const ac = new AbortController(); acRef.current = ac;
      try {
        recordAction('human', 'ask', m); setAiActivity('computing');
        const recentActions = actions.slice(-20).map(a =>
          `[${a.actor.toUpperCase()}] ${a.action}: ${a.detail}${a.observation ? ` (saw: ${a.observation.slice(0, 80)})` : ''}`
        ).join('\n');
        const historyCtx = recentActions ? `\n\nAction history:\n${recentActions}` : '';
        let resp = '';

        if (isVNC) {
          let pageContext = '';
          try {
            const v = await sandboxService.view();
            const elText = sandboxService.formatElements(v.elements).slice(0, 1500);
            pageContext = `\n\nPage elements:\n${elText}\n\nPage text:\n${v.pageText.slice(0, 2000)}`;
          } catch {}
          await ollamaService.generateStream(m, `Browser agent on "${pageTitle}" (${pageUrl}). Answer from page content + action history. Be concise (1-3 sentences).${historyCtx}${pageContext}`, {
            model: getThinkingModel(), signal: ac.signal,
            temperature: 0.3,
            num_predict: 200,
            onChunk: (c: string) => { resp += c; setStreamingText(resp); },
          });
        } else {
          await ollamaService.generateStream(m, `Browser agent on "${pageTitle}" (${pageUrl}). Answer from screenshot + action history. Be concise (1-3 sentences).${historyCtx}`, {
            model: visionModel, images: [screenshotB64], signal: ac.signal,
            temperature: 0.3,
            num_predict: 200,
            onChunk: (c: string) => { resp += c; setStreamingText(resp); },
          });
        }
        setStreamingText(''); recordAction('ai', 'answer', resp.slice(0, 300));
      } catch {} finally { setChatBusy(false); setStreamingText(''); }
      return;
    }

    // Layer 4: LLM-based skill routing for ambiguous messages
    const ac = new AbortController(); acRef.current = ac;
    try {
      setAiActivity('thinking'); setStreamingText('Routing...');
      const route = await routeToSkill(m, {
        currentUrl: pageUrl,
        hasPage: !!sessionId,
        sandboxAvailable: sandboxReady,
        wayfayerAvailable: true, // assume available since we have a session
      }, ac.signal);
      setStreamingText('');

      // High-confidence non-browse skill → execute it
      if (route.confidence >= 0.6 && route.skillId !== 'browse' && route.skillId !== 'answer_page') {
        await executeSkill(route, ac.signal);
      } else {
        // Default: treat as browse/explore task
        setChatBusy(false);
        isVNC ? runSandboxExplore(m) : runAutoExplore(m);
        return;
      }
    } catch {} finally { setChatBusy(false); setStreamingText(''); }
  }

  // ── Theme ──
  const t = useMemo(() => ({
    bg: '#0d0d0f',
    bgCard: 'rgba(255,255,255,0.02)',
    bdr: 'rgba(255,255,255,0.06)',
    dim: 'rgba(255,255,255,0.2)',
    mid: 'rgba(255,255,255,0.45)',
    text: 'rgba(255,255,255,0.7)',
    accent: '#3b82f6',
    accentDim: 'rgba(59,130,246,0.12)',
    green: '#10b981',
    red: '#ef4444',
    amber: '#f59e0b',
    amberDim: 'rgba(245,158,11,0.1)',
  }), []);

  // ══ Browser Viewport (shared between inline + fullscreen) ══
  const renderViewport = (maxH: number | string, showLabel: boolean) => (
    <div className="wf-browser-frame relative" onClick={isVNC ? undefined : handleScreenshotClick} onWheel={isVNC ? undefined : handleScreenshotWheel}>
      {isVNC ? (
        <VNCViewer
          ref={vncRef}
          wsUrl={sandboxService.vncUrl}
          viewOnly={controlMode === 'ai'}
          style={{ maxHeight: maxH, aspectRatio: '1280/900' }}
        />
      ) : (
        <img ref={imgRef} src={`data:image/jpeg;base64,${screenshotB64}`} alt=""
          className="w-full select-none pointer-events-none wf-screenshot-transition"
          style={{ maxHeight: maxH, objectFit: 'contain' }} draggable={false} />
      )}

      {/* AI Cursor — 3D orange glass cursor image */}
      {aiCursor.visible && (
        <motion.div
          className="absolute pointer-events-none z-50"
          initial={false}
          animate={{ left: aiCursor.x - 6, top: aiCursor.y - 4 }}
          transition={{ type: 'spring', stiffness: 180, damping: 18, duration: 0.4 }}
          style={{ animation: 'wf-cursor-glow 2s ease-in-out infinite' }}
        >
          <img
            src="/icons/cursor-orange.png"
            alt=""
            width={28}
            height={28}
            draggable={false}
            style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
          />
          {/* Soft orange glow under cursor */}
          <div className="absolute -inset-4 rounded-full" style={{
            animation: 'wf-cursor-pulse 1.5s ease-in-out infinite',
            background: 'radial-gradient(circle, rgba(249,115,22,0.18), transparent 70%)',
          }} />
        </motion.div>
      )}

      {/* Click ripples — clean orange expanding rings */}
      {ripples.map(r => (
        <div key={r.id} className="absolute pointer-events-none" style={{ left: r.x - 20, top: r.y - 20, width: 40, height: 40 }}>
          {/* Primary expanding ring */}
          <div className="absolute inset-0 rounded-full" style={{
            border: '2px solid rgba(249,115,22,0.75)',
            animation: 'wf-click-ring 0.7s cubic-bezier(0.2, 0, 0.2, 1) forwards',
          }} />
          {/* Secondary ring — delayed, wider */}
          <div className="absolute inset-[-4px] rounded-full" style={{
            border: '1.5px solid rgba(249,115,22,0.35)',
            animation: 'wf-click-ring 0.7s cubic-bezier(0.2, 0, 0.2, 1) 0.08s forwards',
            opacity: 0,
          }} />
          {/* Center dot flash */}
          <div className="absolute rounded-full" style={{
            top: '50%', left: '50%', width: 6, height: 6,
            marginTop: -3, marginLeft: -3,
            background: 'rgba(249,115,22,0.6)',
            animation: 'wf-click-ripple 0.4s ease-out forwards',
          }} />
        </div>
      ))}

      {/* Scan line during explore */}
      {exploring && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute left-0 right-0 h-[2px]" style={{
            background: `linear-gradient(90deg, transparent, ${t.amber}40, transparent)`,
            animation: 'wf-scan 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {showLabel && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-medium pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(8px)' }}>
          {exploring ? 'AI exploring...' : 'Click / Scroll'}
        </div>
      )}
    </div>
  );

  // ── macOS window chrome ──
  const renderWindowChrome = (size: 'sm' | 'lg') => {
    const dotSize = size === 'lg' ? 12 : 7;
    const py = size === 'lg' ? 'py-3 px-4' : 'py-[6px] px-3';
    return (
      <div className={`flex items-center gap-2 ${py}`} style={{ background: '#1a1a1e', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex gap-2">
          {['#ff5f57','#febc2e','#28c840'].map((c, i) => (
            <span key={i} style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: c, boxShadow: `inset 0 0 0 0.5px rgba(0,0,0,0.1)` }} />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 px-3 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.35)', maxWidth: size === 'lg' ? 500 : 180 }}>
              {pageUrl || pageTitle}
            </span>
          </div>
        </div>
        {isLive && (
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: t.green }} />
            <span className="text-[9px] font-medium" style={{ color: t.green }}>live</span>
          </span>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════
  // FULLSCREEN "TAKE CONTROL" MODE
  // ═══════════════════════════════════════

  // ═══════════════════════════════════════
  // FULLSCREEN "TAKE CONTROL" — portaled to body to escape sidebar stacking context
  // ═══════════════════════════════════════

  const fullscreenOverlay = fullscreen && isLive ? createPortal(
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0a0a0c', zIndex: 99999 }}>
      {/* macOS-style top bar */}
      <div className="flex items-center gap-3 px-4 py-2 shrink-0" style={{ background: '#161618', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex gap-2">
          {['#ff5f57','#febc2e','#28c840'].map((c, i) => (
            <button key={i} onClick={i === 0 ? toggleControl : undefined}
              style={{ width: 12, height: 12, borderRadius: '50%', background: c, border: 'none', cursor: i === 0 ? 'pointer' : 'default', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.15)' }} />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{pageUrl || pageTitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono" style={{ color: t.dim }}>
            {actions.filter(a => a.actor === 'human').length} actions
          </span>
          <button onClick={toggleControl}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:brightness-110"
            style={{ background: t.accentDim, color: t.accent, border: '1px solid rgba(59,130,246,0.15)' }}>
            Return to AI
          </button>
        </div>
      </div>

      {/* Browser viewport — fills screen, no bottom bar */}
      <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ background: '#0a0a0c' }}>
        <div className="rounded-xl overflow-hidden shadow-2xl" style={{ width: '95%', maxHeight: '95%', border: '1px solid rgba(255,255,255,0.06)' }}>
          {renderWindowChrome('lg')}
          {renderViewport('calc(100vh - 80px)', false)}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // ═══════════════════════════════════════
  // INLINE PANEL VIEW
  // ═══════════════════════════════════════

  return (
    <>
    {fullscreenOverlay}
    <div className={standalone ? 'h-full flex flex-col overflow-hidden' : 'rounded-[16px] overflow-hidden'} style={standalone ? {} : {
      background: t.bg, border: `1px solid ${t.bdr}`,
      boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.02)',
    }}>
      {/* Header */}
      <button onClick={() => !standalone && setExpanded(e => !e)} className={`w-full flex items-center gap-3 px-4 py-3 text-left ${standalone ? 'cursor-default' : ''}`}>
        <div className="flex gap-[5px] shrink-0">
          {[0,1,2].map(i => (
            <span key={i} className="w-[9px] h-[9px] rounded-full" style={{
              background: isLive ? ['#ff5f57','#febc2e','#28c840'][i] : 'rgba(255,255,255,0.05)',
            }} />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isLive ? t.accent : t.dim} strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
          <span style={{ color: isLive ? t.text : t.dim, fontSize: 11, fontWeight: 500 }}>
            {isLive ? pageTitle || 'Wayfayer Plus' : 'Wayfayer Plus'}
          </span>
          {isLive && <span className="w-[5px] h-[5px] rounded-full" style={{ background: t.green }} />}
          {exploring && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: t.amberDim, color: t.amber }}>exploring</span>}
        </div>
        {!standalone && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className={`shrink-0 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} style={{ color: t.dim }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      <AnimatePresence>
        {(expanded || standalone) && (
          <motion.div initial={standalone ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={standalone ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className={standalone ? 'flex-1 flex flex-col overflow-hidden' : 'overflow-hidden'}>

            <div style={{ height: 1, background: isLive ? `linear-gradient(90deg, transparent, ${t.accent}25, transparent)` : t.bdr }} />

            <div className="p-4 space-y-3">
              {/* Tab bar */}
              {tabs.length > 0 && (
                <div className="flex items-center gap-0.5 -mx-1 pb-1 overflow-x-auto scrollbar-none">
                  {tabs.map((tab: BrowserTab) => {
                    const isActive = activeTab?.id === tab.id;
                    const machine = machines.find(m => m.id === tab.machineId);
                    const machineColor = machine?.type === 'sandbox' ? t.accent : t.amber;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => switchTab(tab.id)}
                        className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium max-w-[160px] min-w-[60px] shrink-0 transition-all duration-150"
                        style={{
                          background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                          border: `1px solid ${isActive ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
                          color: isActive ? t.text : t.dim,
                        }}
                      >
                        {/* Machine dot */}
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                          background: tab.status === 'loading' ? t.amber : tab.status === 'error' ? t.red : machineColor,
                          boxShadow: isActive ? `0 0 4px ${machineColor}40` : 'none',
                        }} />
                        {/* Title */}
                        <span className="truncate">{tab.title === 'about:blank' ? 'New Tab' : (tab.title || tab.url || 'New Tab')}</span>
                        {/* Close */}
                        <span
                          onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                          className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity shrink-0"
                          style={{ color: t.mid }}
                        >
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </span>
                      </button>
                    );
                  })}
                  {/* New tab button */}
                  <button
                    onClick={() => {
                      const machineId = machines.find(m => m.type === 'sandbox')?.id || machines[0]?.id;
                      if (machineId) createTab(machineId);
                    }}
                    className="p-1.5 rounded-lg shrink-0 transition-colors hover:bg-white/5"
                    style={{ color: t.dim }}
                    title="New tab"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  {/* Machine indicator pills */}
                  <div className="ml-auto flex items-center gap-1 shrink-0 pl-2">
                    {machines.map(m => (
                      <span key={m.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-medium"
                        style={{
                          background: m.status === 'online' ? (m.type === 'sandbox' ? t.accentDim : t.amberDim) : 'rgba(255,255,255,0.03)',
                          color: m.status === 'online' ? (m.type === 'sandbox' ? t.accent : t.amber) : t.dim,
                        }}>
                        <span className="w-1 h-1 rounded-full" style={{
                          background: m.status === 'online' ? t.green : m.status === 'busy' ? t.amber : t.dim,
                        }} />
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* URL bar */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 wf-input-focus"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${t.bdr}` }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isLive ? t.green : t.dim} strokeWidth="1.5" className="shrink-0">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <input type="text" value={url} onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); openSession(); } }}
                    placeholder="Enter URL..."
                    className="flex-1 bg-transparent outline-none text-[12px] placeholder:opacity-25"
                    style={{ color: t.text }} />
                </div>
                {phase === 'connecting' ? (
                  <button onClick={cancel} className="px-4 py-2.5 rounded-xl text-[11px] font-medium"
                    style={{ background: 'rgba(239,68,68,0.1)', color: t.red }}>Stop</button>
                ) : (
                  <button onClick={openSession} disabled={!url.trim()} className="px-4 py-2.5 rounded-xl text-[11px] font-medium active:scale-[0.97]"
                    style={{ background: url.trim() ? t.accentDim : 'rgba(255,255,255,0.02)', color: url.trim() ? t.accent : t.dim,
                      cursor: url.trim() ? 'pointer' : 'not-allowed' }}>{isLive ? 'Go' : 'Open'}</button>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 px-0.5">
                <button onClick={() => setShowSettings(s => !s)} className="p-1 rounded-md"
                  style={{ color: showSettings ? t.accent : t.dim, background: showSettings ? t.accentDim : 'transparent' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
                </button>

                {isLive && !exploring && (
                  <button onClick={() => isVNC ? runSandboxExplore(chatInput.trim()) : runAutoExplore(chatInput.trim())} className="px-2.5 py-1 rounded-full text-[10px] font-medium active:scale-[0.97]"
                    style={{ background: t.amberDim, color: t.amber }}>Explore</button>
                )}
                {exploring && (
                  <button onClick={cancel} className="px-2.5 py-1 rounded-full text-[10px] font-medium"
                    style={{ background: 'rgba(239,68,68,0.1)', color: t.red }}>Stop</button>
                )}
                {isLive && (
                  <button onClick={toggleControl} className="px-2.5 py-1 rounded-full text-[10px] font-medium active:scale-[0.97]"
                    style={{ background: controlMode === 'human' ? t.accentDim : 'rgba(255,255,255,0.03)', color: controlMode === 'human' ? t.accent : t.dim }}>
                    {controlMode === 'human' ? 'Return to AI' : 'Take Control'}
                  </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {exploring && <span className="text-[9px] font-mono" style={{ color: t.amber }}>{exploreStep}/{maxSteps}</span>}
                  {status && <span className="text-[10px]" style={{ color: phase === 'error' ? t.red : t.dim }}>{status}</span>}
                </div>
              </div>

              {/* Settings */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }} className="overflow-hidden">
                    <div className="rounded-xl p-3 space-y-3" style={{ background: t.bgCard, border: `1px solid ${t.bdr}` }}>
                      <div className="grid grid-cols-2 gap-3">
                        <ModelSelect label="Vision" value={visionModel} options={VISION_MODEL_OPTIONS}
                          onChange={v => { setVisionModel(v); localStorage.setItem('vision_model', v); }} />
                        <ModelSelect label="Thinking" value={thinkingModel} options={THINKING_MODEL_OPTIONS}
                          onChange={v => { setThinkingModel(v); localStorage.setItem('thinking_model', v); }} />
                      </div>

                      {/* Browser mode toggle */}
                      <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${t.bdr}` }}>
                        <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>Browser</span>
                        <div className="flex gap-1">
                          {(['screenshot', 'vnc'] as const).map(mode => (
                            <button key={mode} onClick={() => setBrowserMode(mode)}
                              disabled={mode === 'vnc' && !sandboxReady}
                              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${browserMode === mode ? '' : 'opacity-40'}`}
                              style={{
                                background: browserMode === mode ? 'rgba(43,121,255,0.15)' : 'transparent',
                                color: browserMode === mode ? '#2B79FF' : 'rgba(255,255,255,0.3)',
                              }}>
                              {mode === 'screenshot' ? 'Screenshot' : `VNC${sandboxReady ? '' : ' (offline)'}`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Agent mode toggle (VNC only) */}
                      {isVNC && (
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>Agent</span>
                          <div className="flex gap-1">
                            {(['simple', 'plan-act'] as const).map(mode => (
                              <button key={mode} onClick={() => setAgentMode(mode)}
                                className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${agentMode === mode ? '' : 'opacity-40'}`}
                                style={{
                                  background: agentMode === mode ? 'rgba(43,121,255,0.15)' : 'transparent',
                                  color: agentMode === mode ? '#2B79FF' : 'rgba(255,255,255,0.3)',
                                }}>
                                {mode === 'simple' ? 'Simple' : 'Plan-Act'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Progress */}
              {(phase === 'connecting' || exploring) && (
                <div className="rounded-full overflow-hidden" style={{ height: 2, background: 'rgba(255,255,255,0.02)' }}>
                  <motion.div className="h-full rounded-full"
                    style={{ background: exploring ? `linear-gradient(90deg, ${t.amber}, ${t.accent})` : `linear-gradient(90deg, ${t.accent}, #60a5fa)`,
                      backgroundSize: '200% 100%', animation: 'wf-shimmer 2s linear infinite' }}
                    initial={{ width: '0%' }} animate={{ width: exploring ? `${(exploreStep / maxSteps) * 100}%` : '60%' }}
                    transition={{ duration: 0.3, ease: 'easeOut' }} />
                </div>
              )}

              {/* ══ LIVE BROWSER ══ */}
              {screenshotB64 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-3">

                  {/* macOS window */}
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.04)', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
                    {renderWindowChrome('sm')}
                    {renderViewport(420, true)}
                  </div>

                  {/* AI thinking orb — Manus-style spinning indicator + live reasoning */}
                  {(streamingText || exploring || chatBusy) && (() => {
                    // Extract live reasoning from streaming text
                    const reasonMatch = streamingText?.match(/REASON(?:ING)?:\s*(.+?)(?=ACT|```|$)/s);
                    const obsMatch = streamingText?.match(/OBS(?:ERVATION)?:\s*(.+?)(?=REASON|ACT|```|$)/s);
                    const liveReasoning = reasonMatch ? reasonMatch[1].trim() : obsMatch ? obsMatch[1].trim() : '';
                    return (
                      <ThinkingOrb
                        mode={exploring ? aiActivity : chatBusy ? 'computing' : 'thinking'}
                        streamText={streamingText}
                        reasoning={liveReasoning}
                      />
                    );
                  })()}

                  {/* Decision prompt — AI needs user input */}
                  {decisionPrompt && (
                    <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="rounded-xl overflow-hidden"
                      style={{ border: `1px solid rgba(59,130,246,0.15)`, background: 'rgba(59,130,246,0.04)' }}>
                      <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(59,130,246,0.08)' }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: t.accentDim }}>
                          <span className="text-[10px]" style={{ color: t.accent }}>?</span>
                        </div>
                        <span className="text-[11px] font-medium" style={{ color: t.text }}>{decisionPrompt.question}</span>
                      </div>
                      <div className="p-2 flex flex-wrap gap-1.5">
                        {decisionPrompt.options.map((opt, i) => (
                          <button key={i} onClick={() => decisionPrompt.resolve(opt)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:brightness-125 active:scale-[0.97]"
                            style={{ background: t.accentDim, color: t.accent, border: '1px solid rgba(59,130,246,0.12)' }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Action feed — Manus-style step list */}
                  {compactActions.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.015)' }}>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.2)' }}>Steps</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>{actions.length}</span>
                        </div>
                        {compactActions.length > 8 && (
                          <button onClick={() => setShowAllActions(s => !s)} className="text-[9px] font-medium" style={{ color: '#3b82f6' }}>
                            {showAllActions ? 'Collapse' : `Show all ${compactActions.length}`}
                          </button>
                        )}
                      </div>
                      <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: 280 }}>
                        {visibleActions.map(a => (
                          <ActionItem key={a.id} action={a} t={t}
                            onToggle={() => setActions(prev => prev.map(x => x.id === a.id ? { ...x, collapsed: !x.collapsed } : x))} />
                        ))}
                        <div ref={timelineEndRef} />
                      </div>
                    </div>
                  )}

                  {/* Command input */}
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5 wf-input-focus"
                      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${t.bdr}` }}>
                      <span className="text-[11px] font-mono shrink-0" style={{ color: 'rgba(59,130,246,0.3)' }}>{'>'}</span>
                      <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } }}
                        placeholder={exploring ? 'goal...' : 'explore, scroll, click, ask...'}
                        disabled={chatBusy}
                        className="flex-1 bg-transparent outline-none text-[12px] disabled:opacity-40 placeholder:opacity-20"
                        style={{ color: t.text }} />
                      {chatBusy && <TypingDots color={t.accent} />}
                    </div>
                    {(chatBusy || exploring) && (
                      <button onClick={cancel} className="px-3 py-2.5 rounded-xl text-[10px] font-medium"
                        style={{ background: 'rgba(239,68,68,0.1)', color: t.red }}>Stop</button>
                    )}
                  </div>

                  {/* Quick actions */}
                  {actions.length === 0 && !chatBusy && !exploring && (
                    <div className="flex flex-wrap gap-1.5">
                      {['explore this page', 'scroll down', 'find prices', 'extract text'].map(cmd => (
                        <button key={cmd} onClick={() => setChatInput(cmd)} className="px-2.5 py-1 rounded-full text-[10px] active:scale-[0.97]"
                          style={{ background: t.accentDim, color: 'rgba(59,130,246,0.5)' }}>{cmd}</button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Idle */}
              {phase === 'idle' && !screenshotB64 && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: t.accentDim }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(59,130,246,0.4)" strokeWidth="1.2">
                      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                    </svg>
                  </div>
                  <p className="text-[11px]" style={{ color: t.dim }}>Agentic Browser</p>
                  <p className="text-[9px] max-w-[200px] text-center" style={{ color: 'rgba(255,255,255,0.1)' }}>
                    Auto-explore with AI cursor, take control anytime
                  </p>
                </div>
              )}

              {/* Error */}
              {phase === 'error' && status && (
                <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.04)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t.red} strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <span className="text-[11px]" style={{ color: t.red }}>{status}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}

// ══════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════

function ActionItem({ action: a, t, onToggle }: { action: ActionRecord; t: any; onToggle: () => void }) {
  const hasDetails = !!(a.observation || a.reasoning || a.screenshotB64);

  // Manus-style: icon per action type
  const icon = (() => {
    switch (a.action) {
      case 'click': case 'ask_user': return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 15l-2 5L9 9l11 4-5 2z" /></svg>
      );
      case 'scroll': case 'scroll_group': return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
      );
      case 'navigate': return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /></svg>
      );
      case 'done': case 'explore_end': return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
      );
      case 'explore_start': return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
      );
      case 'control': return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /></svg>
      );
      case 'answer': case 'ask': return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
      );
      default: return <span className="w-[6px] h-[6px] rounded-full block" style={{ background: 'rgba(255,255,255,0.15)' }} />;
    }
  })();

  const iconColor =
    a.action === 'done' || a.action === 'explore_end' ? '#10b981' :
    a.action === 'explore_start' ? '#3b82f6' :
    a.actor === 'human' ? '#3b82f6' :
    'rgba(255,255,255,0.25)';

  return (
    <div>
      <button onClick={hasDetails ? onToggle : undefined}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${hasDetails ? 'hover:bg-white/[0.02] cursor-pointer' : 'cursor-default'}`}>
        <span className="shrink-0 w-4 flex items-center justify-center" style={{ color: iconColor }}>{icon}</span>
        <span className="text-[11px] flex-1 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{a.detail}</span>
        {a.duration != null && a.duration > 0 && (
          <span className="text-[9px] font-mono shrink-0" style={{ color: 'rgba(255,255,255,0.12)' }}>
            {a.duration < 1000 ? `${a.duration}ms` : `${(a.duration/1000).toFixed(1)}s`}
          </span>
        )}
        {hasDetails && (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" strokeLinecap="round"
            className={`shrink-0 transition-transform duration-150 ${a.collapsed ? '-rotate-90' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      <AnimatePresence>
        {!a.collapsed && hasDetails && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="px-3 pb-2 pl-9 space-y-1.5">
              {a.observation && <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>{a.observation}</p>}
              {a.reasoning && <p className="text-[10px] italic" style={{ color: 'rgba(59,130,246,0.4)' }}>{a.reasoning}</p>}
              {a.screenshotB64 && (
                <img src={`data:image/jpeg;base64,${a.screenshotB64}`} alt=""
                  className="rounded-lg mt-1" style={{ width: 220, border: '1px solid rgba(255,255,255,0.04)' }} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModelSelect({ label, value, options, onChange }: {
  label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="text-[9px] font-medium uppercase tracking-wider block mb-1.5" style={{ color: 'rgba(255,255,255,0.2)' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-[11px] font-medium rounded-lg px-2 py-1.5 outline-none cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Cursor() {
  return <span className="inline-block w-[3px] h-[12px] ml-0.5 rounded-sm" style={{
    background: 'rgba(59,130,246,0.4)', verticalAlign: 'text-bottom', animation: 'wf-typing 1s ease-in-out infinite',
  }} />;
}

function TypingDots({ color }: { color: string }) {
  return (
    <span className="inline-flex gap-[3px] items-center">
      {[0,1,2].map(i => (
        <span key={i} className="w-[3px] h-[3px] rounded-full" style={{ background: color, animation: `wf-typing 1.2s ease-in-out ${i * 0.15}s infinite` }} />
      ))}
    </span>
  );
}

// Status words that rotate based on what the AI is doing
const STATUS_WORDS: Record<string, string[]> = {
  thinking: ['Thinking', 'Reasoning', 'Analyzing', 'Processing'],
  browsing: ['Browsing', 'Navigating', 'Loading page'],
  exploring: ['Exploring', 'Scanning page', 'Observing', 'Inspecting'],
  clicking: ['Clicking', 'Interacting', 'Selecting'],
  scrolling: ['Scrolling', 'Reading page', 'Scanning'],
  computing: ['Computing', 'Processing', 'Working'],
  typing: ['Typing', 'Entering text', 'Filling in'],
};

function ThinkingOrb({ mode = 'thinking', streamText = '', reasoning = '' }: {
  mode?: keyof typeof STATUS_WORDS;
  streamText?: string;
  reasoning?: string;
}) {
  const [wordIdx, setWordIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const words = STATUS_WORDS[mode] || STATUS_WORDS.thinking;

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setWordIdx(i => (i + 1) % words.length);
        setFading(false);
      }, 250);
    }, 2200);
    return () => clearInterval(interval);
  }, [words.length]);

  return (
    <div className="space-y-2">
      {/* Main thinking row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Spinning cube/circle — Manus-style, BLUE */}
        <div className="relative shrink-0" style={{ width: 20, height: 20 }}>
          {/* Outer spinning ring */}
          <div className="absolute inset-0 rounded-full" style={{
            border: '2px solid transparent',
            borderTopColor: '#3b82f6',
            borderRightColor: 'rgba(59,130,246,0.3)',
            animation: 'wf-spin 1s linear infinite',
          }} />
          {/* Inner morphing shape — Manus-style square/circle */}
          <div className="absolute" style={{
            top: 5, left: 5, width: 10, height: 10,
            background: 'linear-gradient(135deg, #60a5fa, #3b82f6)',
            animation: 'wf-morph 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            boxShadow: '0 0 8px rgba(59,130,246,0.4)',
          }} />
        </div>

        {/* Rotating status text */}
        <div className="flex-1 min-w-0 overflow-hidden" style={{ height: 16 }}>
          <span className="text-[12px] font-medium block" style={{
            color: 'rgba(255,255,255,0.55)',
            animation: fading ? 'wf-status-out 0.25s ease forwards' : 'wf-status-in 0.25s ease forwards',
          }}>
            {words[wordIdx % words.length]}...
          </span>
        </div>

        {/* Raw output toggle */}
        {streamText && (
          <button onClick={() => setShowRaw(s => !s)} className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-mono"
            style={{ color: 'rgba(255,255,255,0.2)', background: showRaw ? 'rgba(59,130,246,0.1)' : 'transparent' }}>
            raw
          </button>
        )}
      </div>

      {/* Live reasoning — ALWAYS visible when AI is thinking */}
      {reasoning && (
        <div className="px-3 pb-1">
          <p className="text-[10px] leading-relaxed italic" style={{ color: 'rgba(59,130,246,0.45)' }}>
            {reasoning}
          </p>
        </div>
      )}

      {/* Raw stream (hidden by default, toggle with "raw" button) */}
      {showRaw && streamText && (
        <div className="mx-3 mb-2 px-2.5 py-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <p className="text-[9px] leading-relaxed font-mono" style={{ color: 'rgba(255,255,255,0.2)', maxHeight: 60, overflow: 'hidden' }}>
            {streamText.slice(-250)}<Cursor />
          </p>
        </div>
      )}
    </div>
  );
}
