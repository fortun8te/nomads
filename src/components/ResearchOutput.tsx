import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { ShineText } from './ShineText';
import { TextShimmer } from './TextShimmer';
import { ResponseStream } from './ResponseStream';
import { playSound } from '../hooks/useSoundEngine';
import { visualProgressStore } from '../utils/visualProgressStore';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type SectionKind =
  | 'phase'
  | 'campaign'
  | 'step'
  | 'layer'
  | 'orchestrator'
  | 'researcher'
  | 'reflection'
  | 'reflection-perspective'
  | 'visual'
  | 'thinking'
  | 'metrics'
  | 'coverage'
  | 'deploy'
  | 'complete'
  | 'timelimit'
  | 'error'
  | 'findings'
  | 'ads'
  | 'brain'
  | 'council-head'
  | 'council'
  | 'report'
  | 'raw';

interface Section {
  kind: SectionKind;
  title: string;
  lines: string[];
  badge?: string;
  icon?: string;
  isStreaming?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Parser — turns progressive text stream into structured sections
// (unchanged from previous version — robust, battle-tested)
// ─────────────────────────────────────────────────────────────

function parseOutput(text: string): Section[] {
  const sections: Section[] = [];
  const rawLines = text.split('\n');
  let current: Section | null = null;

  const push = () => {
    if (current) {
      while (current.lines.length > 0 && current.lines[current.lines.length - 1].trim() === '') current.lines.pop();
      if (current.lines.length > 0 || current.kind !== 'raw') sections.push(current);
    }
  };

  for (const line of rawLines) {
    const t = line.trim();
    if (!t || /^[─═]{10,}$/.test(t)) continue;

    // ── Phase headers ──
    if (t.startsWith('[PHASE 1]') && (t.includes('Council') || t.includes('Marketing Brains'))) {
      push(); current = { kind: 'phase', title: 'Council of Marketing Brains', badge: 'Phase 1', lines: [] }; continue;
    }
    if (t.startsWith('[PHASE 1]') || t.includes('ORCHESTRATED RESEARCH:') || t.includes('Desire-Driven') || t.startsWith('RESEARCH PHASE:')) {
      if (!current || current.kind !== 'phase' || current.title !== 'Desire-Driven Analysis') {
        push(); current = { kind: 'phase', title: 'Desire-Driven Analysis', badge: 'Phase 1', lines: [] };
      }
      continue;
    }
    if (t.startsWith('[PHASE 1+2 COMPLETE]')) { if (current) current.lines.push('Council verdict delivered'); continue; }
    if (t.startsWith('[PHASE 2]') || t.includes('Orchestrating Web Search')) {
      push(); current = { kind: 'phase', title: 'Web Research Agents', badge: 'Phase 2', lines: [] }; continue;
    }
    if (t.startsWith('[PHASE 3]') && t.includes('Desire-Driven')) {
      push(); current = { kind: 'phase', title: 'Desire-Driven Deep Dive', badge: 'Phase 3', lines: [] }; continue;
    }
    if (t.startsWith('[PHASE 3]') || t.includes('Competitor Ad Intelligence')) {
      push(); current = { kind: 'phase', title: 'Ad Intelligence', badge: 'Phase 3', lines: [] }; continue;
    }
    if (t.startsWith('[PHASE 4]') && t.includes('Web Research')) {
      push(); current = { kind: 'phase', title: 'Web Research - Gap Filling', badge: 'Phase 4', lines: [] }; continue;
    }
    if (t.startsWith('[PHASE 5]') && t.includes('Council Re-run')) {
      push(); current = { kind: 'phase', title: 'Council Re-analysis', badge: 'Phase 5', lines: [] }; continue;
    }
    if (t.startsWith('[PHASE 6]') && t.includes('Competitor')) {
      push(); current = { kind: 'phase', title: 'Competitor Ad Intelligence', badge: 'Phase 6', lines: [] }; continue;
    }

    // ── Competitor Ads ──
    if (t.includes('[Ads]')) {
      const inner = t.replace(/.*\[Ads\]\s*/, '').trim();
      if (!current || current.kind !== 'ads') { push(); current = { kind: 'ads', title: 'Competitor Ads', badge: 'fetching', lines: [] }; }
      const metaMatch = inner.match(/Meta API:\s*(\d+)\s*ads found for "(.+?)"/);
      if (metaMatch) { const prev = parseInt(current.badge?.match(/\d+/)?.[0] || '0') || 0; current.badge = `${prev + parseInt(metaMatch[1])} ads`; }
      const completeMatch = inner.match(/Complete:\s*(\d+)\s*ad examples.*?(\d+)\s*vision/);
      if (completeMatch) current.badge = `${completeMatch[1]} ads`;
      if (inner.includes('Creative opportunities found:')) { current.lines.push(`Opportunities: ${inner.replace('Creative opportunities found:', '').trim()}`); continue; }
      if (inner) current.lines.push(inner);
      continue;
    }

    if (/^\[PHASE \d/.test(t) && t.includes('COMPLETE]')) { if (current) current.lines.push(t.replace(/\[PHASE \d+ COMPLETE\]\s*/, '').trim() || 'Complete'); continue; }
    if (/^\[PHASE \d/.test(t) && t.includes('ERROR]')) { if (current) current.lines.push(t.replace(/\[PHASE \d+ ERROR\]\s*/, '').trim()); continue; }

    // ── Council ──
    if (t.startsWith('[COUNCIL]') && t.includes('Council of Marketing Brains')) {
      push(); const m = t.match(/Iteration\s+(\d+)\/(\d+)/);
      current = { kind: 'council', title: 'Council of Marketing Brains', badge: m ? `Run ${m[1]}` : 'starting', lines: [] }; continue;
    }
    if (t.startsWith('[COUNCIL]') && t.includes('Round 1')) { push(); current = { kind: 'council', title: 'Round 1 - 7 Brains', badge: 'parallel', lines: [] }; continue; }
    if (t.startsWith('[COUNCIL]') && t.includes('Round 2')) { push(); current = { kind: 'council-head', title: 'Round 2 - Council Heads', badge: 'synthesizing', lines: [] }; continue; }
    if (t.startsWith('[COUNCIL]') && t.includes('Round 3')) { push(); current = { kind: 'council', title: 'Round 3 - Master Verdict', badge: 'deciding', lines: [] }; continue; }
    if (t.startsWith('[COUNCIL]') && t.includes('Verdict delivered')) {
      const m = t.match(/confidence:\s*(\d+)/);
      if (current) { current.badge = m ? `${m[1]}/10` : 'done'; current.lines.push(t.replace('[COUNCIL] ', '')); }
      continue;
    }
    if (t.startsWith('[COUNCIL]')) {
      if (!current || (current.kind !== 'council' && current.kind !== 'council-head')) { push(); current = { kind: 'council', title: 'Council', lines: [] }; }
      current.lines.push(t.replace('[COUNCIL] ', '')); continue;
    }

    // ── Report ──
    if (t.startsWith('[REPORT]')) {
      if (!current || current.kind !== 'report') { push(); current = { kind: 'report', title: 'Research Report', lines: [] }; }
      const c = t.replace('[REPORT] ', '').replace('[REPORT]', ''); if (c.trim()) current.lines.push(c); continue;
    }

    // ── Brain ──
    const brainMatch = t.match(/^\[BRAIN:(\w+)\]\s*(.+)/);
    if (brainMatch) {
      const names: Record<string, string> = { desire: 'Desire Brain', persuasion: 'Persuasion Brain', offer: 'Offer Brain', creative: 'Creative Brain', avatar: 'Avatar Brain', contrarian: 'Contrarian Brain', visual: 'Visual Brain' };
      if (brainMatch[2].includes('analyzing')) { push(); current = { kind: 'brain', title: names[brainMatch[1]] || brainMatch[1], badge: 'analyzing', lines: [] }; }
      else if (brainMatch[2].includes('Failed')) { if (current?.kind === 'brain') current.badge = 'failed'; if (current) current.lines.push(brainMatch[2]); }
      else { if (current) current.lines.push(brainMatch[2]); }
      continue;
    }

    // ── Council Head ──
    const headMatch = t.match(/^\[HEAD:(\S+)\]\s*(.+)/);
    if (headMatch) {
      const names: Record<string, string> = { 'strategy-head': 'Strategy Head', 'creative-head': 'Creative Head', 'challenge-head': 'Challenge Head' };
      if (headMatch[2].includes('synthesizing')) { push(); current = { kind: 'council-head', title: names[headMatch[1]] || headMatch[1], badge: 'synthesizing', lines: [] }; }
      else { if (current) current.lines.push(headMatch[2]); }
      continue;
    }

    // ── Campaign ──
    if (t.startsWith('[CAMPAIGN_DATA]')) { push(); current = { kind: 'campaign', title: 'Campaign Brief', lines: [] }; continue; }

    // ── Steps ──
    const stepMatch = t.match(/^STEP\s+(\d+):\s*(.+)/i);
    if (stepMatch) { push(); current = { kind: 'step', title: stepMatch[2], badge: `Step ${stepMatch[1]}`, lines: [] }; continue; }

    // ── Layers ──
    const layerMatch = t.match(/^LAYER\s+(\d+)[:\s—]+(.+)/i);
    if (layerMatch) { push(); current = { kind: 'layer', title: layerMatch[2].trim(), badge: `Layer ${layerMatch[1]}`, lines: [] }; continue; }
    const layerSubMatch = t.match(/^\s*\[Layer\s+(\d+)\]\s*(.+)/);
    if (layerSubMatch) { if (current?.kind === 'layer') current.lines.push(layerSubMatch[2]); continue; }

    // ── Reflection perspectives ──
    const reflPerspMatch = t.match(/\[Reflection:\s*(Devil's Advocate|Depth Auditor|Coverage Checker)\]\s*(.*)/);
    if (reflPerspMatch) {
      push();
      current = { kind: 'reflection-perspective', title: reflPerspMatch[1], badge: reflPerspMatch[1] === "Devil's Advocate" ? 'bias check' : reflPerspMatch[1] === 'Depth Auditor' ? 'specifics' : 'gaps', lines: [] };
      if (reflPerspMatch[2]) current.lines.push(reflPerspMatch[2]); continue;
    }

    // ── Findings ──
    if (t.startsWith('Identified') && t.includes('desire hierarch')) { if (current?.kind === 'step') { current.badge = (current.badge || '') + ` · ${t.match(/(\d+)/)?.[1]} desires`; current.lines.push(t); } continue; }
    if (t.startsWith('Found') && t.includes('objection')) { if (current?.kind === 'step') { current.badge = (current.badge || '') + ` · ${t.match(/(\d+)/)?.[1]} objections`; current.lines.push(t); } continue; }

    // ── Orchestrator ──
    if (t.includes('[Orchestrator]')) {
      push();
      const iterMatch = t.match(/Iteration\s+(\d+)\/(\d+)/);
      const timeMatch = t.match(/\((\d+)s elapsed\)/);
      current = { kind: 'orchestrator', title: iterMatch ? `Iteration ${iterMatch[1]}/${iterMatch[2]}` : 'Orchestrator', badge: timeMatch ? `${timeMatch[1]}s` : undefined, lines: [] };
      if (t.includes('Pausing')) current.lines.push('Waiting for user input...');
      continue;
    }
    if (t.includes('Deploying') && t.includes('researcher')) {
      const m = t.match(/Deploying\s+(\d+)/);
      if (current?.kind === 'orchestrator') { current.badge = m ? `${m[1]} agents` : current.badge; current.lines.push(`Deploying ${m?.[1] || ''} agents`); }
      continue;
    }
    if (t.includes('[Orchestrator]') && t.includes('→')) {
      const m = t.match(/→\s*"(.+?)"/);
      if (m && current?.kind === 'orchestrator') current.lines.push(`→ "${m[1]}"`);
      continue;
    }
    if (t.includes('[Orchestrator]') && t.includes('Decision:')) {
      if (current?.kind === 'orchestrator') current.lines.push(t.replace(/.*\[Orchestrator\]\s*Decision:\s*/, ''));
      continue;
    }

    // ── Researcher ──
    if (t.includes('[Researcher]')) {
      const inner = t.replace(/.*\[Researcher\]\s*/, '').replace(/^[🔎📄⚠️]\s*/, '');
      if (inner.includes('Searching:')) {
        push();
        const m = inner.match(/Searching:\s*"?(.+?)"?\s*\.{0,3}$/);
        current = { kind: 'researcher', title: m ? m[1].slice(0, 50) : 'Web Search', badge: 'searching', lines: [] };
        continue;
      }
      if (inner.includes('Fetched')) {
        const m = inner.match(/Fetched\s+(\d+)\/(\d+)\s+pages\s+\((.+?)s\)/);
        if (m && current?.kind === 'researcher') current.badge = `${m[1]}/${m[2]} pages`;
        if (current) current.lines.push(inner); continue;
      }
      if (inner.includes('Compress')) { if (current) current.lines.push(inner); continue; }
      if (current) current.lines.push(inner); continue;
    }

    // ── Visual Scout ──
    if (t.includes('[Visual Scout]')) {
      const inner = t.replace(/.*\[Visual Scout\]\s*/, '');
      if (inner.includes('Screenshotting') || inner.includes('Orchestrator requested') || inner.includes('Reflection agent requested')) {
        push();
        const m = inner.match(/(\d+)/);
        current = { kind: 'visual', title: inner.includes('Screenshotting') ? 'Capturing Screenshots' : 'Visual Analysis', badge: m ? `${m[1]} pages` : undefined, lines: [] };
        continue;
      }
      if (!current || current.kind !== 'visual') { push(); current = { kind: 'visual', title: 'Visual Scout', badge: undefined, lines: [] }; }
      if (inner.includes('Analyzed') && inner.includes('competitor')) { const m = inner.match(/(\d+)/); if (m) current.badge = `${m[1]} analyzed`; }
      if (inner.includes('complete')) { current.badge = inner.match(/(\d+)\s+sites/)?.[0] || current.badge; }
      current.lines.push(inner); continue;
    }

    // ── Thinking ──
    if (t.startsWith('[Orchestrator thinking]') || t.startsWith('[Thinking]')) {
      const inner = t.replace(/.*\[(Orchestrator thinking|Thinking)\]\s*/, '');
      if (!current || current.kind !== 'thinking') { push(); current = { kind: 'thinking', title: 'Reasoning', badge: 'live', lines: [] }; }
      if (inner) current.lines.push(inner); continue;
    }

    // ── Metrics ──
    if (t.startsWith('[METRICS]')) {
      push();
      try {
        const json = JSON.parse(t.replace('[METRICS] ', ''));
        const elapsed = json.elapsedSec >= 60 ? `${Math.floor(json.elapsedSec / 60)}m ${json.elapsedSec % 60}s` : `${json.elapsedSec}s`;
        current = { kind: 'metrics', title: `${json.coveragePct}% Coverage`, badge: elapsed, lines: [`${json.coveredDims}/${json.totalDims} dimensions covered`, `${json.totalSources || 0} sources · ${json.totalQueries} queries`] };
      } catch { current = { kind: 'raw', title: 'Metrics', lines: [t] }; }
      continue;
    }

    // ── Reflection ──
    if (t.includes('Running reflection agent') || t.includes('150% bar mode')) { push(); current = { kind: 'reflection', title: 'Reflection', badge: '150% bar', lines: [] }; continue; }
    if (t.includes('[Reflection]')) {
      const inner = t.replace(/.*\[Reflection\]\s*/, '');
      if (!current || current.kind !== 'reflection') { push(); current = { kind: 'reflection', title: 'Reflection', badge: '150% bar', lines: [] }; }
      current.lines.push(inner); continue;
    }
    if (t.includes('Reflection found')) {
      const m = t.match(/found\s+(\d+)\s+gaps/);
      if (current?.kind === 'reflection') { current.badge = m ? `${m[1]} gaps` : current.badge; current.lines.push(t.replace(/^.*?🎯\s*/, '')); }
      continue;
    }

    // ── Coverage ──
    if (t.includes('Coverage:') && t.includes('dimensions')) {
      push();
      const m = t.match(/Coverage:\s*(\d+)%\s*\((\d+)\/(\d+)/);
      const threshMatch = t.match(/threshold:\s*(\d+)%/);
      current = { kind: 'coverage', title: m ? `${m[1]}% Coverage` : 'Coverage', badge: m ? `${m[2]}/${m[3]}` : undefined, lines: threshMatch ? [`Target: ${threshMatch[1]}%`] : [] };
      continue;
    }

    // ── Terminal states ──
    if (t.includes('research complete') || t.includes('RESEARCH COMPLETE') || t.includes('Coverage threshold reached') || t.includes('Orchestrator satisfied')) {
      push(); current = { kind: 'complete', title: 'Research Complete', lines: [t.replace(/^.*?[✓✅]\s*/, '')] }; continue;
    }
    if (t.includes('Time limit reached')) { push(); current = { kind: 'timelimit', title: 'Time Limit', lines: [t.replace(/^.*?⏱️\s*/, '')] }; continue; }
    if (t.startsWith('ERROR') || (t.startsWith('⚠️') && !t.includes('[Reflection]'))) { push(); current = { kind: 'error', title: 'Error', lines: [t] }; continue; }

    // ── Skip boilerplate ──
    if (t.includes('orchestrator deciding what additional research') || t.includes('orchestrator evaluating')) { if (current) current.lines.push('Evaluating research gaps...'); continue; }
    if (t.startsWith('User provided:') && current) { current.lines.push(t); continue; }

    // ── Fallback ──
    if (current) { current.lines.push(t); } else { current = { kind: 'raw', title: 'Output', lines: [t] }; }
  }

  push();
  return sections;
}

// ─────────────────────────────────────────────────────────────
// Incremental parse header regex
// ─────────────────────────────────────────────────────────────

const SECTION_HEADER_RE = /\[PHASE [1-6]\]|Competitor Ad Intelligence|ORCHESTRATED RESEARCH:|Council of Marketing Brains|Desire-Driven|Orchestrating Web Search|\[CAMPAIGN_DATA\]|STEP \d+:|LAYER \d+[:\s—]|Iteration \d+\/|Searching:\s*"|Screenshotting|Orchestrator requested visual|Reflection agent requested visual|Running reflection agent|150% bar mode|\[Reflection:\s*(Devil's Advocate|Depth Auditor|Coverage Checker)\]|Coverage:\s*\d+%.*dimensions|research complete|RESEARCH COMPLETE|Coverage threshold|Orchestrator satisfied|Time limit reached|^ERROR|\[METRICS\]|\[Orchestrator thinking\]|\[Thinking\]|\[Ads\]|\[BRAIN:\w+\]|\[HEAD:\S+\]|\[COUNCIL\]/im;

// ─────────────────────────────────────────────────────────────
// Manus Morphing Blob — framer-motion animated gradient shape
// ─────────────────────────────────────────────────────────────

function ManusBlob({ size = 14 }: { size?: number }) {
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


// ─────────────────────────────────────────────────────────────
// Icons (inline SVGs — small, clean, Manus-style)
// ─────────────────────────────────────────────────────────────

function ActionIcon({ kind, dark }: { kind: SectionKind; dark: boolean }) {
  const cls = `w-[14px] h-[14px] flex-shrink-0 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`;

  // Search/magnifying glass
  if (kind === 'researcher') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" />
    </svg>
  );

  // Brain/thinking
  if (kind === 'thinking' || kind === 'brain') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" /><path d="M5.5 8a2.5 2.5 0 015 0" /><path d="M8 5.5v5" />
    </svg>
  );

  // Camera/visual
  if (kind === 'visual') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" /><circle cx="8" cy="8" r="2.5" />
    </svg>
  );

  // Orchestrator / deploy
  if (kind === 'orchestrator' || kind === 'deploy') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M8 2v4M8 10v4M2 8h4M10 8h4" /><circle cx="8" cy="8" r="2" />
    </svg>
  );

  // Reflection / mirror
  if (kind === 'reflection' || kind === 'reflection-perspective') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M4 2l8 6-8 6V2z" />
    </svg>
  );

  // Step / numbered action
  if (kind === 'step' || kind === 'layer') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="2" y="2" width="12" height="12" rx="2" /><path d="M5 8h6M8 5v6" />
    </svg>
  );

  // Council
  if (kind === 'council' || kind === 'council-head') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="8" cy="4" r="2.5" /><circle cx="3.5" cy="10" r="2" /><circle cx="12.5" cy="10" r="2" />
    </svg>
  );

  // Report / document
  if (kind === 'report') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="3" y="1.5" width="10" height="13" rx="1.5" /><path d="M5.5 5h5M5.5 8h5M5.5 11h3" />
    </svg>
  );

  // Ads
  if (kind === 'ads') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M5 8l2 2 4-4" />
    </svg>
  );

  // Terminal / code
  if (kind === 'campaign' || kind === 'raw') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M4 5l3 3-3 3M9 11h3" />
    </svg>
  );

  // Complete / check
  if (kind === 'complete') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );

  // Error
  if (kind === 'error') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8" cy="8" r="5.5" /><path d="M8 5v4M8 11v.5" />
    </svg>
  );

  // Coverage / metrics
  if (kind === 'coverage' || kind === 'metrics') return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="2" y="6" width="3" height="8" rx="0.5" /><rect x="6.5" y="3" width="3" height="11" rx="0.5" /><rect x="11" y="1" width="3" height="13" rx="0.5" />
    </svg>
  );

  // Default dot
  return <span className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${dark ? 'bg-zinc-600' : 'bg-zinc-400'}`} />;
}


// ─────────────────────────────────────────────────────────────
// Coverage Bar
// ─────────────────────────────────────────────────────────────

function CoverageBar({ pct, dark }: { pct: number; dark: boolean }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#2B79FF' : '#ef4444';
  return (
    <div className="flex items-center gap-2 w-full">
      <div className={`flex-1 h-1 rounded-full overflow-hidden ${dark ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Action Pill — single Manus-style chip
// ─────────────────────────────────────────────────────────────

function ActionPill({
  section, isActive, isExpanded, onToggle, dark,
}: {
  section: Section;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  dark: boolean;
}) {
  const isLive = isActive && (section.badge === 'live' || section.badge === 'searching' || section.badge === 'fetching' || section.badge === 'analyzing' || section.badge === 'synthesizing' || section.badge === 'parallel' || section.badge === 'deciding');

  // First meaningful line as description
  const desc = !isExpanded && section.lines.length > 0
    ? (section.lines.find(l => l.startsWith('→'))?.slice(2) || section.lines[0]).slice(0, 80)
    : null;

  return (
    <button
      onClick={onToggle}
      className={`group flex items-start gap-2.5 w-full text-left rounded-xl px-3.5 py-2.5 transition-all duration-200`}
      style={{
        border: `1px solid ${dark ? (isExpanded ? 'rgba(63,63,70,0.6)' : 'rgba(39,39,42,0.5)') : (isExpanded ? 'rgba(228,228,231,1)' : 'rgba(244,244,245,1)')}`,
        background: dark
          ? (isExpanded
            ? 'linear-gradient(to right, rgba(43,121,255,0.06), rgba(39,39,42,0.8))'
            : 'linear-gradient(to right, rgba(43,121,255,0.03), rgba(24,24,27,0.6))')
          : (isExpanded
            ? 'linear-gradient(to right, rgba(43,121,255,0.05), rgba(244,244,245,1))'
            : 'linear-gradient(to right, rgba(43,121,255,0.02), rgba(250,250,250,1))'),
      }}
    >
      {/* Icon */}
      <div className="mt-0.5">
        <ActionIcon kind={section.kind} dark={dark} />
      </div>

      {/* Text stack */}
      <div className="flex-1 min-w-0">
        <span className={`text-[13px] leading-snug truncate block ${
          dark ? 'text-zinc-300' : 'text-zinc-700'
        } ${isActive ? 'font-medium' : ''}`}>
          {section.title}
        </span>
        {desc && (
          <span className={`text-[11px] leading-snug truncate block mt-0.5 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {desc}
          </span>
        )}
      </div>

      {/* Badge */}
      {section.badge && (
        <div className="mt-0.5 flex-shrink-0">
          {isLive ? (
            <ShineText variant={dark ? 'dark' : 'light'} className="text-[10px]" speed={2}>
              {section.badge}
            </ShineText>
          ) : (
            <span className={`text-[10px] tabular-nums ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {section.badge}
            </span>
          )}
        </div>
      )}
    </button>
  );
}


// ─────────────────────────────────────────────────────────────
// Expanded Content — detail view below a pill
// ─────────────────────────────────────────────────────────────

function ExpandedContent({ section, dark, isStreaming }: { section: Section; dark: boolean; isStreaming?: boolean }) {
  const txtCls = dark ? 'text-zinc-400' : 'text-zinc-600';
  const dimCls = dark ? 'text-zinc-500' : 'text-zinc-400';
  const visualBatches = useSyncExternalStore(visualProgressStore.subscribe, visualProgressStore.getSnapshot);
  const activeBatch = visualBatches.length > 0 ? visualBatches[visualBatches.length - 1] : null;

  const covPct = (section.kind === 'coverage' || section.kind === 'metrics')
    ? parseInt(section.title.match(/(\d+)%/)?.[1] || '0') : null;

  const renderLine = (line: string, i: number, isLast: boolean) => {
    // For the last line of an actively streaming section, animate it in
    const shouldAnimate = isStreaming && isLast;

    // Query
    if (line.startsWith('→ "')) {
      return (
        <div key={i} className={`text-[12px] ${txtCls} italic`}>
          {shouldAnimate
            ? <ResponseStream textStream={line} mode="typewriter" speed={90} className="inline" />
            : line}
        </div>
      );
    }
    // Compress/fetch — very dim
    if (line.match(/Compress|Fetched/i)) {
      return (
        <div key={i} className={`text-[10px] font-mono ${dimCls}`}>
          {shouldAnimate
            ? <ResponseStream textStream={line} mode="typewriter" speed={90} className="inline" />
            : line}
        </div>
      );
    }
    // JSON tokens — no animation (too fast already)
    if (line.match(/^\s*[\[{\]},"]/) || line.match(/^\s*"[a-zA-Z_]+"\s*:/)) {
      return <div key={i} className={`text-[9px] font-mono leading-snug ${dimCls}`}>{line}</div>;
    }
    // KV pairs
    const kvMatch = line.match(/^(Brand|Target Audience|Marketing Goal|Audience congregates|Key language|Market gap|Patterns|Gaps):\s*(.+)/);
    if (kvMatch) {
      return (
        <div key={i} className={`text-[12px] ${txtCls}`}>
          <span className="font-semibold">{kvMatch[1]}:</span>{' '}
          {shouldAnimate
            ? <ResponseStream textStream={kvMatch[2]} mode="typewriter" speed={90} className="inline" />
            : kvMatch[2]}
        </div>
      );
    }
    // Default
    return (
      <div key={i} className={`text-[12px] leading-relaxed ${txtCls}`}>
        {shouldAnimate
          ? <ResponseStream textStream={line} mode="typewriter" speed={85} />
          : line}
      </div>
    );
  };

  return (
    <div className={`ml-8 mr-2 mt-1 mb-2 space-y-1 ${dark ? 'border-l border-zinc-800/50' : 'border-l border-zinc-200'} pl-3`}>
      {/* Coverage */}
      {covPct !== null && (
        <div className="py-1 max-w-xs">
          <CoverageBar pct={covPct} dark={dark} />
        </div>
      )}

      {/* Visual thumbnails */}
      {section.kind === 'visual' && activeBatch && activeBatch.sites.length > 0 && (
        <div className="grid grid-cols-3 gap-2 py-2">
          {activeBatch.sites.slice(0, 6).map((site) => {
            const hostname = (() => { try { return new URL(site.url).hostname.replace('www.', ''); } catch { return site.url.slice(0, 20); } })();
            const isWorking = site.status === 'capturing' || site.status === 'analyzing';
            return (
              <div key={site.url} className={`rounded-lg overflow-hidden ${dark ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                {site.thumbnail ? (
                  <img
                    src={`data:image/jpeg;base64,${site.thumbnail}`}
                    alt={hostname}
                    className="w-full aspect-[5/3] object-cover"
                    style={{ filter: isWorking ? 'brightness(0.5)' : 'none' }}
                  />
                ) : (
                  <div className={`w-full aspect-[5/3] flex items-center justify-center ${dark ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isWorking ? 'animate-pulse' : ''} ${dark ? 'bg-zinc-700' : 'bg-zinc-300'}`} />
                  </div>
                )}
                <p className={`text-[8px] truncate px-1.5 py-1 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>{hostname}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Lines */}
      {section.lines.map((line, i) => renderLine(line, i, i === section.lines.length - 1))}

      {/* Thinking */}
      {section.kind === 'thinking' && section.lines.length > 0 && (
        <pre className={`text-[10px] font-mono leading-relaxed whitespace-pre-wrap ${dimCls}`}>
          {section.lines.join('\n')}
        </pre>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Task Group — collapsible phase container (like Manus)
// ─────────────────────────────────────────────────────────────

function TaskGroup({
  phase, children, count, isComplete, isActive, dark,
}: {
  phase: Section;
  children: React.ReactNode;
  count: number;
  isComplete: boolean;
  isActive: boolean;
  dark: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-4">
      {/* Group header */}
      <button
        onClick={() => { setCollapsed(!collapsed); playSound('click'); }}
        className="flex items-center gap-3 w-full text-left py-2 px-1 group"
      >
        {/* Status circle */}
        <span
          className={`w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${isActive ? 'animate-pulse' : ''}`}
          style={{
            border: `2px solid ${isComplete ? '#22c55e' : isActive ? '#2B79FF' : dark ? '#3f3f46' : '#d4d4d8'}`,
            backgroundColor: isComplete ? '#22c55e' : isActive ? '#2B79FF' : 'transparent',
          }}
        >
          {isComplete && (
            <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 6l2.5 2.5 4.5-5" /></svg>
          )}
        </span>

        {/* Title */}
        <span className={`flex-1 text-[14px] font-semibold ${
          isComplete ? (dark ? 'text-zinc-400' : 'text-zinc-500')
          : isActive ? (dark ? 'text-zinc-100' : 'text-zinc-800')
          : dark ? 'text-zinc-400' : 'text-zinc-600'
        }`}>
          {phase.title}
        </span>

        {/* Count + chevron */}
        <span className={`text-[10px] tabular-nums ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {count}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'} ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {/* Phase description */}
      {phase.lines.length > 0 && !collapsed && (
        <p className={`text-[12px] ml-[26px] mb-2 ${dark ? 'text-zinc-500' : 'text-zinc-500'}`}>
          {phase.lines[0]}
        </p>
      )}

      {/* Children (pills) */}
      {!collapsed && (
        <div className="space-y-1.5 ml-2 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Main Component — Manus-style single-column feed
// ─────────────────────────────────────────────────────────────

interface ResearchOutputProps {
  output: string;
  isDarkMode: boolean;
}

export function ResearchOutput({ output, isDarkMode: dark }: ResearchOutputProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const cacheRef = useRef<{ len: number; sections: Section[] }>({ len: 0, sections: [] });
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const prevLenRef = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);

  // ── Incremental parsing ──
  useEffect(() => {
    if (!output) {
      cacheRef.current = { len: 0, sections: [] };
      setSections([]);
      return;
    }

    const cache = cacheRef.current;
    if (output.length < cache.len) { cache.len = 0; cache.sections = []; }
    if (output.length === cache.len) return;

    const delta = output.slice(cache.len);
    cache.len = output.length;

    // Fast path
    if (!SECTION_HEADER_RE.test(delta) && cache.sections.length > 0) {
      const last = cache.sections[cache.sections.length - 1];
      for (const line of delta.split('\n')) {
        const t = line.trim();
        if (!t || /^[─═]{10,}$/.test(t)) continue;

        if (last.kind === 'researcher' && t.includes('[Researcher]')) {
          const inner = t.replace(/.*\[Researcher\]\s*/, '').replace(/^[🔎📄⚠️]\s*/, '');
          if (inner.includes('Fetched')) { const m = inner.match(/Fetched\s+(\d+)\/(\d+)\s+pages\s+\((.+?)s\)/); if (m) last.badge = `${m[1]}/${m[2]} pages`; }
          last.lines.push(inner);
        } else if (last.kind === 'visual' && t.includes('[Visual Scout]')) {
          const inner = t.replace(/.*\[Visual Scout\]\s*/, '');
          if (inner.includes('Analyzed') || inner.includes('complete')) { const m = inner.match(/(\d+)/); if (m) last.badge = `${m[1]} analyzed`; }
          last.lines.push(inner);
        } else if (last.kind === 'reflection' && t.includes('[Reflection]')) {
          last.lines.push(t.replace(/.*\[Reflection\]\s*/, ''));
        } else if (last.kind === 'thinking' && (t.startsWith('[Orchestrator thinking]') || t.startsWith('[Thinking]'))) {
          last.lines.push(t.replace(/.*\[(Orchestrator thinking|Thinking)\]\s*/, ''));
        } else if (last.kind === 'brain' && t.match(/^\[BRAIN:\w+\]/)) {
          last.lines.push(t.replace(/\[BRAIN:\w+\]\s*/, ''));
        } else if (last.kind === 'council-head' && t.match(/^\[HEAD:\S+\]/)) {
          last.lines.push(t.replace(/\[HEAD:\S+\]\s*/, ''));
        } else if ((last.kind === 'council' || last.kind === 'council-head') && t.startsWith('[COUNCIL]')) {
          last.lines.push(t.replace('[COUNCIL] ', ''));
        } else if (last.kind === 'layer' && t.match(/^\s*\[Layer\s+\d+\]/)) {
          last.lines.push(t.replace(/^\s*\[Layer\s+\d+\]\s*/, ''));
        } else if (last.kind === 'reflection-perspective' && t.match(/\[Reflection:\s*(Devil's Advocate|Depth Auditor|Coverage Checker)\]/)) {
          last.lines.push(t.replace(/.*\[Reflection:\s*(Devil's Advocate|Depth Auditor|Coverage Checker)\]\s*/, ''));
        } else {
          last.lines.push(t);
        }
      }
      setSections([...cache.sections]);
      return;
    }

    // Full re-parse
    cache.sections = parseOutput(output);
    setSections(cache.sections);
  }, [output]);

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    if (sections.length > prevLenRef.current && feedRef.current) {
      feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevLenRef.current = sections.length;
  }, [sections.length]);

  // Sound on complete
  useEffect(() => {
    if (sections.some(s => s.kind === 'complete')) playSound('stageComplete');
  }, [sections.some(s => s.kind === 'complete')]);

  const isDone = sections.some(s => s.kind === 'complete');
  const isTimeout = sections.some(s => s.kind === 'timelimit');
  const isRunning = !isDone && !isTimeout && sections.length > 0;

  // ── Group sections by phase ──
  type Group = { phase: Section | null; items: { section: Section; globalIdx: number }[] };
  const groups: Group[] = [];
  let currentGroup: Group = { phase: null, items: [] };

  sections.forEach((section, idx) => {
    if (section.kind === 'phase') {
      if (currentGroup.phase || currentGroup.items.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = { phase: section, items: [] };
    } else {
      currentGroup.items.push({ section, globalIdx: idx });
    }
  });
  if (currentGroup.phase || currentGroup.items.length > 0) {
    groups.push(currentGroup);
  }

  // ── Empty state ──
  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full animate-pulse bg-blue-500" />
          <TextShimmer className="text-sm [--shimmer-base:rgba(43,121,255,0.3)] [--shimmer-highlight:rgba(43,121,255,0.9)]" duration={1.8}>Starting research agents...</TextShimmer>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top summary bar */}
      <div className={`flex items-center gap-3 px-5 py-2.5 border-b flex-shrink-0 ${dark ? 'border-zinc-800/60' : 'border-zinc-200'}`}>
        <span className={`text-[13px] font-semibold ${
          isDone ? (dark ? 'text-emerald-400' : 'text-emerald-600') :
          isTimeout ? (dark ? 'text-zinc-400' : 'text-zinc-500') :
          dark ? 'text-zinc-200' : 'text-zinc-700'
        }`}>
          {isDone ? 'Research Complete' : isTimeout ? 'Time Limit Reached' : 'Researching...'}
        </span>
        <span className={`ml-auto text-[10px] tabular-nums ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {sections.filter(s => s.kind !== 'phase').length} actions
        </span>
      </div>

      {/* Scrolling feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
        {groups.map((group, gi) => {
          // If group has a phase, render as TaskGroup
          if (group.phase) {
            const isGroupActive = gi === groups.length - 1 && isRunning;
            const isGroupComplete = gi < groups.length - 1 || isDone;
            return (
              <TaskGroup
                key={gi}
                phase={group.phase}
                count={group.items.length}
                isActive={isGroupActive}
                isComplete={isGroupComplete}
                dark={dark}
              >
                {group.items.map(({ section, globalIdx }) => {
                  const isLast = globalIdx === sections.length - 1;
                  const isItemActive = isLast && isRunning;
                  const isExp = expandedIdx === globalIdx;
                  return (
                    <div key={globalIdx}>
                      <ActionPill
                        section={section}
                        isActive={isItemActive}
                        isExpanded={isExp}
                        onToggle={() => {
                          setExpandedIdx(isExp ? null : globalIdx);
                          playSound('click');
                        }}
                        dark={dark}
                      />
                      {isExp && <ExpandedContent section={section} dark={dark} isStreaming={isItemActive} />}
                    </div>
                  );
                })}
              </TaskGroup>
            );
          }

          // No phase — loose items (before first phase)
          return (
            <div key={gi} className="space-y-1.5 mb-4">
              {group.items.map(({ section, globalIdx }) => {
                const isLast = globalIdx === sections.length - 1;
                const isItemActive = isLast && isRunning;
                const isExp = expandedIdx === globalIdx;
                return (
                  <div key={globalIdx}>
                    <ActionPill
                      section={section}
                      isActive={isItemActive}
                      isExpanded={isExp}
                      onToggle={() => {
                        setExpandedIdx(isExp ? null : globalIdx);
                        playSound('click');
                      }}
                      dark={dark}
                    />
                    {isExp && <ExpandedContent section={section} dark={dark} />}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Thinking indicator at bottom — Manus morphing blob */}
        {isRunning && (
          <div className="flex items-center gap-2.5 py-3 mt-2">
            <ManusBlob size={14} />
            <TextShimmer className="text-[13px] [--shimmer-base:rgba(43,121,255,0.3)] [--shimmer-highlight:rgba(43,121,255,0.9)]" duration={1.8}>Thinking</TextShimmer>
          </div>
        )}
      </div>
    </div>
  );
}
