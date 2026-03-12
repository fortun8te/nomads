import { useState, useEffect, useRef } from 'react';
import { ShineText } from './ShineText';
import { playSound } from '../hooks/useSoundEngine';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type SectionKind =
  | 'phase'                // [PHASE 1], [PHASE 2]
  | 'campaign'             // [CAMPAIGN_DATA]
  | 'step'                 // STEP 1: ..., STEP 2: ...
  | 'layer'                // LAYER 1-7: desire analysis layers
  | 'orchestrator'         // [Orchestrator] ...
  | 'researcher'           // [Researcher] ...
  | 'reflection'           // [Reflection] / Running reflection agent
  | 'reflection-perspective' // [Reflection: Devil's Advocate/Depth Auditor/Coverage Checker]
  | 'visual'               // [Visual Scout] — minicpm-v screenshot analysis
  | 'thinking'             // [Orchestrator thinking] — live reasoning stream
  | 'metrics'              // [METRICS] — per-iteration stats
  | 'coverage'             // Coverage: ...
  | 'deploy'               // Deploying ...
  | 'complete'             // research complete / RESEARCH COMPLETE
  | 'timelimit'            // Time limit
  | 'error'                // ERROR
  | 'findings'             // Desire/objection findings
  | 'ads'                  // [Ads] — Phase 3 competitor ad intelligence
  | 'brain'                // [BRAIN:id] — Council marketing brain output
  | 'council-head'         // [HEAD:id] — Council head synthesis
  | 'council'              // [COUNCIL] — Council status/verdict
  | 'report'               // [REPORT] — Research report generation
  | 'raw';                 // Fallback

interface Section {
  kind: SectionKind;
  title: string;
  lines: string[];
  badge?: string;
  icon?: string;
  isStreaming?: boolean; // currently receiving data
}

// ─────────────────────────────────────────────────────────────
// Parser — turns progressive text stream into structured sections
// ─────────────────────────────────────────────────────────────

function parseOutput(text: string): Section[] {
  const sections: Section[] = [];
  const rawLines = text.split('\n');
  let current: Section | null = null;

  const push = () => {
    if (current) {
      while (current.lines.length > 0 && current.lines[current.lines.length - 1].trim() === '') {
        current.lines.pop();
      }
      if (current.lines.length > 0 || current.kind !== 'raw') {
        sections.push(current);
      }
    }
  };

  for (const line of rawLines) {
    const t = line.trim();
    if (!t || t === '────────────────────────────────────────────────' || t === '════════════════════════════════════════════════════════════════════') continue;

    // ── Phase headers ──
    if (t.startsWith('[PHASE 1]') && (t.includes('Council') || t.includes('Marketing Brains'))) {
      push();
      current = { kind: 'phase', title: 'Council of Marketing Brains', badge: 'Phase 1', lines: [] };
      continue;
    }

    if (t.startsWith('[PHASE 1]') || t.includes('ORCHESTRATED RESEARCH:') || t.includes('Desire-Driven') || t.startsWith('RESEARCH PHASE:')) {
      if (!current || current.kind !== 'phase' || current.title !== 'Desire-Driven Analysis') {
        push();
        current = { kind: 'phase', title: 'Desire-Driven Analysis', badge: 'Phase 1', lines: [] };
      }
      continue;
    }

    if (t.startsWith('[PHASE 1+2 COMPLETE]')) {
      if (current) current.lines.push('Council verdict delivered');
      continue;
    }

    if (t.startsWith('[PHASE 2]') || t.includes('Orchestrating Web Search')) {
      push();
      current = { kind: 'phase', title: 'Web Research Agents', badge: 'Phase 2', lines: [] };
      continue;
    }

    if (t.startsWith('[PHASE 3]') && t.includes('Desire-Driven')) {
      push();
      current = { kind: 'phase', title: 'Desire-Driven Deep Dive', badge: 'Phase 3', lines: [] };
      continue;
    }

    if (t.startsWith('[PHASE 3]') || t.includes('Competitor Ad Intelligence')) {
      push();
      current = { kind: 'phase', title: 'Ad Intelligence', badge: 'Phase 3', lines: [] };
      continue;
    }

    if (t.startsWith('[PHASE 4]') && t.includes('Web Research')) {
      push();
      current = { kind: 'phase', title: 'Web Research — Gap Filling', badge: 'Phase 4', lines: [] };
      continue;
    }

    if (t.startsWith('[PHASE 5]') && t.includes('Council Re-run')) {
      push();
      current = { kind: 'phase', title: 'Council Re-analysis', badge: 'Phase 5', lines: [] };
      continue;
    }

    if (t.startsWith('[PHASE 6]') && t.includes('Competitor')) {
      push();
      current = { kind: 'phase', title: 'Competitor Ad Intelligence', badge: 'Phase 6', lines: [] };
      continue;
    }

    // ── Competitor Ads [Ads] ──
    if (t.includes('[Ads]')) {
      const inner = t.replace(/.*\[Ads\]\s*/, '').trim();
      if (!current || current.kind !== 'ads') {
        push();
        current = { kind: 'ads', title: 'Competitor Ads', badge: 'fetching', lines: [] };
      }
      const metaMatch = inner.match(/Meta API:\s*(\d+)\s*ads found for "(.+?)"/);
      if (metaMatch) {
        const prevCount = parseInt(current.badge?.match(/\d+/)?.[0] || '0') || 0;
        const newCount = prevCount + parseInt(metaMatch[1]);
        current.badge = `${newCount} ads`;
      }
      const completeMatch = inner.match(/Complete:\s*(\d+)\s*ad examples.*?(\d+)\s*vision/);
      if (completeMatch) current.badge = `${completeMatch[1]} ads`;
      if (inner.includes('Creative opportunities found:')) {
        current.lines.push(`Opportunities: ${inner.replace('Creative opportunities found:', '').trim()}`);
        continue;
      }
      if (inner) current.lines.push(inner);
      continue;
    }

    if (/^\[PHASE \d/.test(t) && t.includes('COMPLETE]')) {
      if (current) {
        const label = t.replace(/\[PHASE \d+ COMPLETE\]\s*/, '').trim() || 'Complete';
        current.lines.push(label);
      }
      continue;
    }

    if (/^\[PHASE \d/.test(t) && t.includes('ERROR]')) {
      if (current) current.lines.push(t.replace(/\[PHASE \d+ ERROR\]\s*/, '').trim());
      continue;
    }

    // ── Council of Marketing Brains ──
    if (t.startsWith('[COUNCIL]') && t.includes('Council of Marketing Brains')) {
      push();
      const iterMatch = t.match(/Iteration\s+(\d+)\/(\d+)/);
      current = { kind: 'council', title: 'Council of Marketing Brains', badge: iterMatch ? `Run ${iterMatch[1]}` : 'starting', lines: [] };
      continue;
    }

    if (t.startsWith('[COUNCIL]') && t.includes('Round 1')) {
      push();
      current = { kind: 'council', title: 'Round 1 — 7 Brains Analyzing', badge: 'parallel', lines: [] };
      continue;
    }

    if (t.startsWith('[COUNCIL]') && t.includes('Round 2')) {
      push();
      current = { kind: 'council-head', title: 'Round 2 — Council Heads', badge: 'synthesizing', lines: [] };
      continue;
    }

    if (t.startsWith('[COUNCIL]') && t.includes('Round 3')) {
      push();
      current = { kind: 'council', title: 'Round 3 — Master Verdict', badge: 'deciding', lines: [] };
      continue;
    }

    if (t.startsWith('[COUNCIL]') && t.includes('Verdict delivered')) {
      const confMatch = t.match(/confidence:\s*(\d+)/);
      if (current) {
        current.badge = confMatch ? `${confMatch[1]}/10` : 'done';
        current.lines.push(t.replace('[COUNCIL] ', ''));
      }
      continue;
    }

    if (t.startsWith('[COUNCIL]')) {
      if (!current || (current.kind !== 'council' && current.kind !== 'council-head')) {
        push();
        current = { kind: 'council', title: 'Council', lines: [] };
      }
      current.lines.push(t.replace('[COUNCIL] ', ''));
      continue;
    }

    // ── Report generation ──
    if (t.startsWith('[REPORT]')) {
      if (!current || current.kind !== 'report') {
        push();
        current = { kind: 'report', title: 'Research Report', lines: [] };
      }
      const content = t.replace('[REPORT] ', '').replace('[REPORT]', '');
      if (content.trim()) current.lines.push(content);
      continue;
    }

    // ── Brain outputs ──
    const brainMatch = t.match(/^\[BRAIN:(\w+)\]\s*(.+)/);
    if (brainMatch) {
      const brainId = brainMatch[1];
      const inner = brainMatch[2];
      const brainNames: Record<string, string> = {
        desire: 'Desire Brain', persuasion: 'Persuasion Brain', offer: 'Offer Brain',
        creative: 'Creative Brain', avatar: 'Avatar Brain', contrarian: 'Contrarian Brain',
        visual: 'Visual Brain',
      };
      if (inner.includes('analyzing')) {
        push();
        current = { kind: 'brain', title: brainNames[brainId] || brainId, badge: 'analyzing', lines: [] };
      } else if (inner.includes('Failed')) {
        if (current?.kind === 'brain') current.badge = 'failed';
        if (current) current.lines.push(inner);
      } else {
        if (current) current.lines.push(inner);
      }
      continue;
    }

    // ── Council Head outputs ──
    const headMatch = t.match(/^\[HEAD:(\S+)\]\s*(.+)/);
    if (headMatch) {
      const headId = headMatch[1];
      const inner = headMatch[2];
      const headNames: Record<string, string> = {
        'strategy-head': 'Strategy Head', 'creative-head': 'Creative Head', 'challenge-head': 'Challenge Head',
      };
      if (inner.includes('synthesizing')) {
        push();
        current = { kind: 'council-head', title: headNames[headId] || headId, badge: 'synthesizing', lines: [] };
      } else {
        if (current) current.lines.push(inner);
      }
      continue;
    }

    // ── Campaign data ──
    if (t.startsWith('[CAMPAIGN_DATA]')) {
      push();
      current = { kind: 'campaign', title: 'Campaign Brief', lines: [] };
      continue;
    }

    // ── Steps ──
    const stepMatch = t.match(/^STEP\s+(\d+):\s*(.+)/i);
    if (stepMatch) {
      push();
      current = { kind: 'step', title: stepMatch[2], badge: `Step ${stepMatch[1]}`, lines: [] };
      continue;
    }

    // ── Layers (LAYER 1-7: desire analysis) ──
    const layerMatch = t.match(/^LAYER\s+(\d+)[:\s—]+(.+)/i);
    if (layerMatch) {
      push();
      current = { kind: 'layer', title: layerMatch[2].trim(), badge: `Layer ${layerMatch[1]}`, lines: [] };
      continue;
    }

    // ── Layer sub-progress ──
    const layerSubMatch = t.match(/^\s*\[Layer\s+(\d+)\]\s*(.+)/);
    if (layerSubMatch) {
      if (current?.kind === 'layer') {
        current.lines.push(layerSubMatch[2]);
      }
      continue;
    }

    // ── Reflection perspectives (3 agents) ──
    const reflPerspMatch = t.match(/\[Reflection:\s*(Devil's Advocate|Depth Auditor|Coverage Checker)\]\s*(.*)/);
    if (reflPerspMatch) {
      push();
      current = {
        kind: 'reflection-perspective',
        title: reflPerspMatch[1],
        badge: reflPerspMatch[1] === "Devil's Advocate" ? 'bias check' : reflPerspMatch[1] === 'Depth Auditor' ? 'specifics' : 'gaps',
        lines: [],
      };
      if (reflPerspMatch[2]) current.lines.push(reflPerspMatch[2]);
      continue;
    }

    // ── Findings: desire hierarchies ──
    if (t.startsWith('Identified') && t.includes('desire hierarch')) {
      if (current?.kind === 'step') {
        current.badge = (current.badge || '') + ` · ${t.match(/(\d+)/)?.[1]} desires`;
        current.lines.push(t);
      }
      continue;
    }

    // ── Findings: objections ──
    if (t.startsWith('Found') && t.includes('objection')) {
      if (current?.kind === 'step') {
        current.badge = (current.badge || '') + ` · ${t.match(/(\d+)/)?.[1]} objections`;
        current.lines.push(t);
      }
      continue;
    }

    // ── Orchestrator iteration ──
    if (t.includes('[Orchestrator]')) {
      push();
      const iterMatch = t.match(/Iteration\s+(\d+)\/(\d+)/);
      const timeMatch = t.match(/\((\d+)s elapsed\)/);
      current = {
        kind: 'orchestrator',
        title: iterMatch ? `Iteration ${iterMatch[1]}/${iterMatch[2]}` : 'Orchestrator',
        badge: timeMatch ? `${timeMatch[1]}s` : undefined,
        lines: [],
      };
      if (t.includes('Pausing')) current.lines.push('Waiting for user input...');
      continue;
    }

    // ── Deploying researchers ──
    if (t.includes('Deploying') && t.includes('researcher')) {
      const countMatch = t.match(/Deploying\s+(\d+)/);
      if (current?.kind === 'orchestrator') {
        current.badge = countMatch ? `${countMatch[1]} agents` : current.badge;
        current.lines.push(`Deploying ${countMatch?.[1] || ''} agents`);
      }
      continue;
    }

    // ── Orchestrator chosen queries ──
    if (t.includes('[Orchestrator]') && t.includes('→')) {
      const queryMatch = t.match(/→\s*"(.+?)"/);
      if (queryMatch && current?.kind === 'orchestrator') {
        current.lines.push(`→ "${queryMatch[1]}"`);
      }
      continue;
    }

    // ── Orchestrator decision preview ──
    if (t.includes('[Orchestrator]') && t.includes('Decision:')) {
      const preview = t.replace(/.*\[Orchestrator\]\s*Decision:\s*/, '');
      if (current?.kind === 'orchestrator') current.lines.push(preview);
      continue;
    }

    // ── Researcher activity ──
    if (t.includes('[Researcher]')) {
      const inner = t.replace(/.*\[Researcher\]\s*/, '').replace(/^[🔎📄⚠️]\s*/, '');
      if (inner.includes('Searching:')) {
        push();
        const topicMatch = inner.match(/Searching:\s*"?(.+?)"?\s*\.{0,3}$/);
        current = {
          kind: 'researcher',
          title: topicMatch ? topicMatch[1].slice(0, 50) : 'Web Search',
          badge: 'searching',
          lines: [],
        };
        continue;
      }
      if (inner.includes('Fetched')) {
        const fetchMatch = inner.match(/Fetched\s+(\d+)\/(\d+)\s+pages\s+\((.+?)s\)/);
        if (fetchMatch && current?.kind === 'researcher') {
          current.badge = `${fetchMatch[1]}/${fetchMatch[2]} pages`;
        }
        if (current) current.lines.push(inner);
        continue;
      }
      if (inner.includes('Compress')) { if (current) current.lines.push(inner); continue; }
      if (current) current.lines.push(inner);
      continue;
    }

    // ── Visual Scout ──
    if (t.includes('[Visual Scout]')) {
      const inner = t.replace(/.*\[Visual Scout\]\s*/, '');
      if (inner.includes('Screenshotting') || inner.includes('Orchestrator requested') || inner.includes('Reflection agent requested')) {
        push();
        const countMatch = inner.match(/(\d+)/);
        current = {
          kind: 'visual',
          title: inner.includes('Screenshotting') ? 'Capturing Screenshots' : 'Visual Analysis',
          badge: countMatch ? `${countMatch[1]} pages` : undefined,
          lines: [],
        };
        continue;
      }
      if (!current || current.kind !== 'visual') {
        push();
        current = { kind: 'visual', title: 'Visual Scout', badge: undefined, lines: [] };
      }
      if (inner.includes('Analyzed') && inner.includes('competitor')) {
        const countMatch = inner.match(/(\d+)/);
        if (countMatch) current.badge = `${countMatch[1]} analyzed`;
      }
      if (inner.includes('complete')) {
        current.badge = inner.match(/(\d+)\s+sites/)?.[0] || current.badge;
      }
      current.lines.push(inner);
      continue;
    }

    // ── Orchestrator thinking ──
    if (t.startsWith('[Orchestrator thinking]') || t.startsWith('[Thinking]')) {
      const inner = t.replace(/.*\[(Orchestrator thinking|Thinking)\]\s*/, '');
      if (!current || current.kind !== 'thinking') {
        push();
        current = { kind: 'thinking', title: 'Reasoning', badge: 'live', lines: [] };
      }
      if (inner) current.lines.push(inner);
      continue;
    }

    // ── Metrics ──
    if (t.startsWith('[METRICS]')) {
      push();
      try {
        const json = JSON.parse(t.replace('[METRICS] ', ''));
        const elapsed = json.elapsedSec >= 60
          ? `${Math.floor(json.elapsedSec / 60)}m ${json.elapsedSec % 60}s`
          : `${json.elapsedSec}s`;
        current = {
          kind: 'metrics',
          title: `${json.coveragePct}% Coverage`,
          badge: elapsed,
          lines: [
            `${json.coveredDims}/${json.totalDims} dimensions covered`,
            `${json.totalSources || 0} sources · ${json.totalQueries} queries`,
          ],
        };
      } catch {
        current = { kind: 'raw', title: 'Metrics', lines: [t] };
      }
      continue;
    }

    // ── Reflection agent ──
    if (t.includes('Running reflection agent') || t.includes('150% bar mode')) {
      push();
      current = { kind: 'reflection', title: 'Reflection', badge: '150% bar', lines: [] };
      continue;
    }
    if (t.includes('[Reflection]')) {
      const inner = t.replace(/.*\[Reflection\]\s*/, '');
      if (!current || current.kind !== 'reflection') {
        push();
        current = { kind: 'reflection', title: 'Reflection', badge: '150% bar', lines: [] };
      }
      current.lines.push(inner);
      continue;
    }
    if (t.includes('Reflection found')) {
      const gapMatch = t.match(/found\s+(\d+)\s+gaps/);
      if (current?.kind === 'reflection') {
        current.badge = gapMatch ? `${gapMatch[1]} gaps` : current.badge;
        current.lines.push(t.replace(/^.*?🎯\s*/, ''));
      }
      continue;
    }

    // ── Coverage ──
    if (t.includes('Coverage:') && t.includes('dimensions')) {
      push();
      const covMatch = t.match(/Coverage:\s*(\d+)%\s*\((\d+)\/(\d+)/);
      const threshMatch = t.match(/threshold:\s*(\d+)%/);
      current = {
        kind: 'coverage',
        title: covMatch ? `${covMatch[1]}% Coverage` : 'Coverage',
        badge: covMatch ? `${covMatch[2]}/${covMatch[3]}` : undefined,
        lines: threshMatch ? [`Target: ${threshMatch[1]}%`] : [],
      };
      continue;
    }

    // ── Complete ──
    if (t.includes('research complete') || t.includes('RESEARCH COMPLETE') || t.includes('Coverage threshold reached') || t.includes('Orchestrator satisfied')) {
      push();
      current = { kind: 'complete', title: 'Research Complete', lines: [t.replace(/^.*?[✓✅]\s*/, '')] };
      continue;
    }

    // ── Time limit ──
    if (t.includes('Time limit reached')) {
      push();
      current = { kind: 'timelimit', title: 'Time Limit', lines: [t.replace(/^.*?⏱️\s*/, '')] };
      continue;
    }

    // ── Error ──
    if (t.startsWith('ERROR') || (t.startsWith('⚠️') && !t.includes('[Reflection]'))) {
      push();
      current = { kind: 'error', title: 'Error', lines: [t] };
      continue;
    }

    // ── Skip boilerplate ──
    if (t.includes('orchestrator deciding what additional research') || t.includes('orchestrator evaluating')) {
      if (current) current.lines.push('Evaluating research gaps...');
      continue;
    }
    if (t.startsWith('User provided:') && current) { current.lines.push(t); continue; }

    // ── Fallback ──
    if (current) {
      current.lines.push(t);
    } else {
      current = { kind: 'raw', title: 'Output', lines: [t] };
    }
  }

  push();
  return sections;
}

// ─────────────────────────────────────────────────────────────
// Color system — minimal, clean
// ─────────────────────────────────────────────────────────────

type ColorKey = 'indigo' | 'emerald' | 'blue' | 'teal' | 'amber' | 'purple' | 'rose' | 'sky' | 'cyan' | 'green' | 'orange' | 'red' | 'zinc';

function kindColor(kind: SectionKind): ColorKey {
  // Simplified to 3 main accents: blue (orchestrator/thinking), teal (researcher/brain), amber (reflection/analysis)
  const map: Record<string, ColorKey> = {
    phase: 'zinc', step: 'blue', layer: 'blue', orchestrator: 'blue', researcher: 'teal',
    reflection: 'amber', 'reflection-perspective': 'amber', coverage: 'zinc', visual: 'teal', thinking: 'zinc',
    metrics: 'zinc', deploy: 'teal', complete: 'emerald', timelimit: 'amber',
    error: 'red', ads: 'teal', campaign: 'zinc', findings: 'zinc', raw: 'zinc',
    brain: 'teal', 'council-head': 'amber', council: 'blue', report: 'blue',
  };
  return map[kind] || 'zinc';
}

function dotColor(color: ColorKey, dark: boolean): string {
  if (dark) {
    const map: Record<ColorKey, string> = {
      indigo: 'bg-indigo-400', emerald: 'bg-emerald-400', blue: 'bg-blue-400', teal: 'bg-teal-400',
      amber: 'bg-amber-400', purple: 'bg-purple-400', rose: 'bg-rose-400', sky: 'bg-sky-400',
      cyan: 'bg-cyan-400', green: 'bg-green-400', orange: 'bg-orange-400', red: 'bg-red-400', zinc: 'bg-zinc-500',
    };
    return map[color];
  }
  const map: Record<ColorKey, string> = {
    indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', blue: 'bg-blue-500', teal: 'bg-teal-500',
    amber: 'bg-amber-500', purple: 'bg-purple-500', rose: 'bg-rose-500', sky: 'bg-sky-500',
    cyan: 'bg-cyan-500', green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500', zinc: 'bg-zinc-400',
  };
  return map[color];
}

function textColor(color: ColorKey, dark: boolean): string {
  if (dark) {
    const map: Record<ColorKey, string> = {
      indigo: 'text-indigo-400', emerald: 'text-emerald-400', blue: 'text-blue-400', teal: 'text-teal-400',
      amber: 'text-amber-400', purple: 'text-purple-400', rose: 'text-rose-400', sky: 'text-sky-400',
      cyan: 'text-cyan-400', green: 'text-green-400', orange: 'text-orange-400', red: 'text-red-400', zinc: 'text-zinc-500',
    };
    return map[color];
  }
  const map: Record<ColorKey, string> = {
    indigo: 'text-indigo-600', emerald: 'text-emerald-600', blue: 'text-blue-600', teal: 'text-teal-600',
    amber: 'text-amber-600', purple: 'text-purple-600', rose: 'text-rose-600', sky: 'text-sky-600',
    cyan: 'text-cyan-600', green: 'text-green-600', orange: 'text-orange-600', red: 'text-red-600', zinc: 'text-zinc-500',
  };
  return map[color];
}

function badgeBg(color: ColorKey, dark: boolean): string {
  if (dark) {
    const map: Record<ColorKey, string> = {
      indigo: 'bg-indigo-500/10', emerald: 'bg-emerald-500/10', blue: 'bg-blue-500/10', teal: 'bg-teal-500/10',
      amber: 'bg-amber-500/10', purple: 'bg-purple-500/10', rose: 'bg-rose-500/10', sky: 'bg-sky-500/10',
      cyan: 'bg-cyan-500/10', green: 'bg-green-500/10', orange: 'bg-orange-500/10', red: 'bg-red-500/10', zinc: 'bg-zinc-700/50',
    };
    return map[color];
  }
  const map: Record<ColorKey, string> = {
    indigo: 'bg-indigo-50', emerald: 'bg-emerald-50', blue: 'bg-blue-50', teal: 'bg-teal-50',
    amber: 'bg-amber-50', purple: 'bg-purple-50', rose: 'bg-rose-50', sky: 'bg-sky-50',
    cyan: 'bg-cyan-50', green: 'bg-green-50', orange: 'bg-orange-50', red: 'bg-red-50', zinc: 'bg-zinc-100',
  };
  return map[color];
}

// ─────────────────────────────────────────────────────────────
// Coverage Bar
// ─────────────────────────────────────────────────────────────

function CoverageBar({ pct, dark }: { pct: number; dark: boolean }) {
  const barColor = pct >= 80
    ? 'bg-emerald-500'
    : pct >= 50
    ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className={`flex-1 h-1.5 rounded-full ${dark ? 'bg-zinc-800' : 'bg-zinc-100'} overflow-hidden`}>
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-[10px] font-semibold tabular-nums ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
        {pct}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Line renderer
// ─────────────────────────────────────────────────────────────

function RenderLine({ line, dark, accentClass }: { line: string; dark: boolean; accentClass: string }) {
  const txt = dark ? 'text-zinc-300' : 'text-[#414243]';
  const dim = dark ? 'text-zinc-600' : 'text-zinc-400';

  // Query line
  if (line.startsWith('→ "')) {
    return (
      <div className="flex items-start gap-2 py-0.5">
        <span className={`${accentClass} text-[11px] mt-px shrink-0`}>→</span>
        <span className={`text-[12px] ${txt} italic font-medium leading-5`}>{line.slice(2)}</span>
      </div>
    );
  }

  // Numbered finding
  const findingMatch = line.match(/^\s*\[(\d+)\]\s*(.+)/);
  if (findingMatch) {
    return (
      <div className="flex gap-2 items-start py-0.5">
        <span className={`text-[11px] font-bold ${accentClass} w-4 shrink-0 text-right tabular-nums`}>{findingMatch[1]}</span>
        <span className={`text-[12px] ${txt} font-medium leading-5`}>{findingMatch[2]}</span>
      </div>
    );
  }

  // Sub-lines
  if (line.match(/^\s*(Surface|Intensity):/i)) {
    return <div className={`text-[11px] ${dim} ml-6 italic`}>{line.trim()}</div>;
  }

  // KV lines
  const kvMatch = line.match(/^(Brand|Target Audience|Marketing Goal|Audience congregates|Key language|Market gap):\s*(.+)/);
  if (kvMatch) {
    return (
      <div className="flex gap-1.5 py-0.5">
        <span className={`text-[12px] font-semibold ${accentClass} shrink-0`}>{kvMatch[1]}:</span>
        <span className={`text-[12px] font-medium ${txt} leading-5`}>{kvMatch[2]}</span>
      </div>
    );
  }

  // Compression / fetch
  if (line.match(/Compress|Fetched/i)) {
    return <div className={`text-[10px] ${dim} font-mono`}>{line}</div>;
  }

  // JSON tokens
  if (line.match(/^\s*[\[{\]},"]/) || line.match(/^\s*"[a-zA-Z_]+"\s*:/)) {
    return <div className={`text-[9px] ${dim} font-mono leading-snug`}>{line}</div>;
  }

  return <div className={`text-[12px] font-medium ${txt} leading-5`}>{line}</div>;
}

// ─────────────────────────────────────────────────────────────
// Section Component — clean, minimal card
// ─────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  isExpanded,
  isLast,
  onToggle,
  dark,
}: {
  section: Section;
  isExpanded: boolean;
  isLast: boolean;
  onToggle: () => void;
  dark: boolean;
}) {
  const color = kindColor(section.kind);
  const isPhase = section.kind === 'phase';
  const isComplete = section.kind === 'complete';
  const isError = section.kind === 'error';
  const accent = textColor(color, dark);
  const dot = dotColor(color, dark);
  const badge = badgeBg(color, dark);
  const covPct = (section.kind === 'coverage' || section.kind === 'metrics')
    ? parseInt(section.title.match(/(\d+)%/)?.[1] || '0')
    : null;

  // Left border color for card accent
  const borderAccent = (() => {
    if (isComplete) return dark ? 'border-l-emerald-400' : 'border-l-emerald-500';
    if (isError) return dark ? 'border-l-red-400' : 'border-l-red-500';
    const map: Record<ColorKey, string> = {
      blue: dark ? 'border-l-blue-400' : 'border-l-blue-500',
      teal: dark ? 'border-l-teal-400' : 'border-l-teal-500',
      amber: dark ? 'border-l-amber-400' : 'border-l-amber-500',
      emerald: dark ? 'border-l-emerald-400' : 'border-l-emerald-500',
      red: dark ? 'border-l-red-400' : 'border-l-red-500',
      indigo: dark ? 'border-l-indigo-400' : 'border-l-indigo-500',
      purple: dark ? 'border-l-purple-400' : 'border-l-purple-500',
      rose: dark ? 'border-l-rose-400' : 'border-l-rose-500',
      sky: dark ? 'border-l-sky-400' : 'border-l-sky-500',
      cyan: dark ? 'border-l-cyan-400' : 'border-l-cyan-500',
      green: dark ? 'border-l-green-400' : 'border-l-green-500',
      orange: dark ? 'border-l-orange-400' : 'border-l-orange-500',
      zinc: dark ? 'border-l-zinc-600' : 'border-l-zinc-300',
    };
    return map[color] || (dark ? 'border-l-zinc-600' : 'border-l-zinc-300');
  })();

  return (
    <div className={`group ${isPhase ? 'mt-4 first:mt-0' : ''}`}>
      {/* Phase divider */}
      {isPhase && (
        <div className="flex items-center gap-3 mb-2 px-1">
          <div className={`h-px flex-1 ${dark ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
          <span className={`text-[10px] uppercase tracking-widest font-semibold ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {section.badge}
          </span>
          <div className={`h-px flex-1 ${dark ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
        </div>
      )}

      {/* Card wrapper */}
      <div className={`rounded-xl border-l-2 ${borderAccent} ${
        isPhase
          ? ''
          : dark
            ? 'bg-zinc-900/40 border border-zinc-800/40 border-l-2'
            : 'bg-white border border-zinc-100 border-l-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
      } ${isPhase ? '' : 'mb-1.5'}`}>
        <button
          onClick={onToggle}
          className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors duration-100 ${
            !isPhase && (dark ? 'hover:bg-zinc-800/40' : 'hover:bg-zinc-50/80')
          }`}
        >
          {/* Status dot — only for active items */}
          {isLast && !isComplete && !isError && (
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} animate-pulse`} />
          )}

          {/* Title */}
          <span className={`flex-1 truncate ${
            isPhase
              ? `text-[13px] font-semibold ${dark ? 'text-zinc-100' : 'text-[#414243]'}`
              : `text-[12px] font-medium ${dark ? 'text-zinc-300' : 'text-[#414243]'}`
          }`}>
            {section.title}
          </span>

          {/* Coverage bar inline */}
          {covPct !== null && (
            <div className="w-20 shrink-0">
              <CoverageBar pct={covPct} dark={dark} />
            </div>
          )}

          {/* Badge */}
          {section.badge && section.kind !== 'phase' && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${badge} ${accent} shrink-0`}>
              {section.badge.includes('...') || section.badge === 'live' || section.badge === 'searching' || section.badge === 'fetching' ? (
                <ShineText variant={dark ? 'dark' : 'light'} className="text-[9px]" speed={2}>
                  {section.badge}
                </ShineText>
              ) : section.badge}
            </span>
          )}

          {/* Line count */}
          {section.lines.length > 0 && !isPhase && (
            <span className={`text-[9px] tabular-nums ${dark ? 'text-zinc-600' : 'text-zinc-400'} shrink-0`}>
              {section.lines.length}
            </span>
          )}

          {/* Chevron */}
          {section.lines.length > 0 && (
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={dark ? '#52525b' : '#d4d4d8'} strokeWidth="2.5" strokeLinecap="round"
              className={`shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </button>

        {/* Content */}
        {isExpanded && section.lines.length > 0 && (
          <div className={`px-3 pb-2.5 pt-0.5 space-y-px max-h-64 overflow-y-auto`}>
            {section.kind === 'thinking' ? (
              <div className={`font-mono text-[9px] leading-snug whitespace-pre-wrap ${dark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {section.lines.join('\n')}
              </div>
            ) : (
              section.lines.map((line, li) => (
                <RenderLine key={li} line={line} dark={dark} accentClass={accent} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Status header
// ─────────────────────────────────────────────────────────────

function StatusHeader({ sections, dark }: { sections: Section[]; dark: boolean }) {
  const searches = sections.filter(s => s.kind === 'researcher').length;
  const metricsSections = sections.filter(s => s.kind === 'metrics');
  const lastMetrics = metricsSections[metricsSections.length - 1];
  const coverage = sections.find(s => s.kind === 'coverage');
  const covStr = lastMetrics?.title.match(/(\d+)%/)?.[1] || coverage?.title.match(/(\d+)%/)?.[1];
  const covPct = covStr ? parseInt(covStr) : 0;
  const isDone = sections.some(s => s.kind === 'complete');
  const isTimeout = sections.some(s => s.kind === 'timelimit');
  const isRunning = !isDone && !isTimeout;

  return (
    <div className={`flex items-center gap-3 mb-2 pb-2 border-b ${dark ? 'border-zinc-800/50' : 'border-zinc-200/80'}`}>
      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        {isRunning && (
          <span className={`w-1.5 h-1.5 rounded-full ${dark ? 'bg-emerald-400' : 'bg-emerald-500'} animate-pulse`} />
        )}
        <span className={`text-[11px] font-medium ${
          isDone
            ? (dark ? 'text-emerald-400' : 'text-emerald-600')
            : isTimeout
            ? (dark ? 'text-orange-400' : 'text-orange-600')
            : (dark ? 'text-zinc-400' : 'text-zinc-500')
        }`}>
          {isDone ? 'Complete' : isTimeout ? 'Timeout' : 'Researching'}
        </span>
      </div>

      {/* Coverage */}
      {covPct > 0 && (
        <div className="flex-1">
          <CoverageBar pct={covPct} dark={dark} />
        </div>
      )}

      {/* Stats */}
      {searches > 0 && (
        <span className={`text-[10px] tabular-nums ${dark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          {searches} searches
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

interface ResearchOutputProps {
  output: string;
  isDarkMode: boolean;
}

const SECTION_HEADER_RE = /\[PHASE [1-6]\]|Competitor Ad Intelligence|ORCHESTRATED RESEARCH:|Council of Marketing Brains|Desire-Driven|Orchestrating Web Search|\[CAMPAIGN_DATA\]|STEP \d+:|LAYER \d+[:\s—]|Iteration \d+\/|Searching:\s*"|Screenshotting|Orchestrator requested visual|Reflection agent requested visual|Running reflection agent|150% bar mode|\[Reflection:\s*(Devil's Advocate|Depth Auditor|Coverage Checker)\]|Coverage:\s*\d+%.*dimensions|research complete|RESEARCH COMPLETE|Coverage threshold|Orchestrator satisfied|Time limit reached|^ERROR|\[METRICS\]|\[Orchestrator thinking\]|\[Thinking\]|\[Ads\]|\[BRAIN:\w+\]|\[HEAD:\S+\]|\[COUNCIL\]/im;

export function ResearchOutput({ output, isDarkMode }: ResearchOutputProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const cacheRef = useRef<{ len: number; sections: Section[] }>({ len: 0, sections: [] });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Incremental parsing
  useEffect(() => {
    if (!output) {
      cacheRef.current = { len: 0, sections: [] };
      setSections([]);
      return;
    }

    const cache = cacheRef.current;

    if (output.length < cache.len) {
      cache.len = 0;
      cache.sections = [];
    }
    if (output.length === cache.len) return;

    const delta = output.slice(cache.len);
    cache.len = output.length;

    // Fast path: no new section header → append to last
    if (!SECTION_HEADER_RE.test(delta) && cache.sections.length > 0) {
      const last = cache.sections[cache.sections.length - 1];
      for (const line of delta.split('\n')) {
        const t = line.trim();
        if (!t || /^[─═]{10,}$/.test(t)) continue;

        if (last.kind === 'researcher' && t.includes('[Researcher]')) {
          const inner = t.replace(/.*\[Researcher\]\s*/, '').replace(/^[🔎📄⚠️]\s*/, '');
          if (inner.includes('Fetched')) {
            const m = inner.match(/Fetched\s+(\d+)\/(\d+)\s+pages\s+\((.+?)s\)/);
            if (m) last.badge = `${m[1]}/${m[2]} pages`;
          }
          last.lines.push(inner);
        } else if (last.kind === 'visual' && t.includes('[Visual Scout]')) {
          const inner = t.replace(/.*\[Visual Scout\]\s*/, '');
          if (inner.includes('Analyzed') || inner.includes('complete')) {
            const m = inner.match(/(\d+)/);
            if (m) last.badge = `${m[1]} analyzed`;
          }
          last.lines.push(inner);
        } else if (last.kind === 'reflection' && t.includes('[Reflection]')) {
          last.lines.push(t.replace(/.*\[Reflection\]\s*/, ''));
        } else if (last.kind === 'thinking' && (t.startsWith('[Orchestrator thinking]') || t.startsWith('[Thinking]'))) {
          last.lines.push(t.replace(/.*\[(Orchestrator thinking|Thinking)\]\s*/, ''));
        } else if (last.kind === 'brain' && t.match(/^\[BRAIN:\w+\]/)) {
          const inner = t.replace(/\[BRAIN:\w+\]\s*/, '');
          last.lines.push(inner);
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

    // Slow path: full re-parse
    cache.sections = parseOutput(output);
    setSections(cache.sections);
  }, [output]);

  // Auto-expand latest + phases
  useEffect(() => {
    if (sections.length > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        next.add(sections.length - 1);
        sections.forEach((s, i) => {
          if (s.kind === 'phase' || s.kind === 'step' || s.kind === 'layer' || s.kind === 'coverage' || s.kind === 'complete' || s.kind === 'error' || s.kind === 'visual' || s.kind === 'metrics' || s.kind === 'ads' || s.kind === 'council' || s.kind === 'council-head' || s.kind === 'reflection-perspective') {
            next.add(i);
          }
        });
        return next;
      });
    }
  }, [sections.length]);

  const toggle = (i: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
        playSound('collapse');
      } else {
        next.add(i);
        playSound('expand');
      }
      return next;
    });
  };

  if (sections.length === 0) {
    return (
      <div className={`flex items-center gap-2 py-6 justify-center`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'} animate-pulse`} />
        <ShineText variant={isDarkMode ? 'dark' : 'light'} className="text-xs" speed={2.5}>
          Starting research...
        </ShineText>
      </div>
    );
  }

  return (
    <div>
      {/* Status bar */}
      <StatusHeader sections={sections} dark={isDarkMode} />

      {/* Expand/Collapse */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => setExpanded(new Set(sections.map((_, i) => i)))}
          className={`text-[10px] font-medium ${isDarkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'} transition-colors`}
        >
          Expand all
        </button>
        <span className={`text-[10px] ${isDarkMode ? 'text-zinc-700' : 'text-zinc-200'}`}>|</span>
        <button
          onClick={() => setExpanded(new Set())}
          className={`text-[10px] font-medium ${isDarkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'} transition-colors`}
        >
          Collapse all
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-0.5">
        {sections.map((section, idx) => (
          <SectionBlock
            key={idx}
            section={section}
            isExpanded={expanded.has(idx)}
            isLast={idx === sections.length - 1}
            onToggle={() => toggle(idx)}
            dark={isDarkMode}
          />
        ))}
      </div>
    </div>
  );
}
