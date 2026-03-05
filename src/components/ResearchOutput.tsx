import { useState, useEffect, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type SectionKind =
  | 'phase'        // [PHASE 1], [PHASE 2]
  | 'campaign'     // [CAMPAIGN_DATA]
  | 'step'         // STEP 1: ..., STEP 2: ...
  | 'orchestrator' // [Orchestrator] ...
  | 'researcher'   // [Researcher] ...
  | 'reflection'   // [Reflection] / Running reflection agent
  | 'coverage'     // 📊 Coverage: ...
  | 'deploy'       // 🚀 Deploying ...
  | 'complete'     // ✓ ... complete / RESEARCH COMPLETE
  | 'timelimit'    // ⏱️ Time limit
  | 'error'        // ERROR / ⚠️
  | 'findings'     // Desire/objection findings
  | 'raw';         // Fallback

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
      // Clean up empty trailing lines
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
    if (t.startsWith('[PHASE 1]') || t.includes('ORCHESTRATED RESEARCH:') || t.includes('Desire-Driven') || t.startsWith('RESEARCH PHASE:')) {
      // Don't create a duplicate Phase 1 if we already have one as current
      if (!current || current.kind !== 'phase' || current.title !== 'Phase 1 — Desire-Driven Analysis') {
        push();
        current = {
          kind: 'phase',
          title: 'Phase 1 — Desire-Driven Analysis',
          icon: '🧠',
          badge: 'GLM-4.7',
          lines: [],
        };
      }
      continue;
    }

    if (t.startsWith('[PHASE 2]') || t.includes('Orchestrating Web Search')) {
      push();
      current = {
        kind: 'phase',
        title: 'Phase 2 — Web Research Agents',
        icon: '🌐',
        badge: 'LFM-2.5 + Wayfayer',
        lines: [],
      };
      continue;
    }

    if (t.startsWith('[PHASE 1 COMPLETE]') || t.startsWith('[PHASE 2 COMPLETE]')) {
      if (current) {
        current.lines.push(t.includes('1') ? '✓ Desire-driven analysis done' : '✓ Web research orchestration done');
      }
      continue;
    }

    // ── Campaign data ──
    if (t.startsWith('[CAMPAIGN_DATA]')) {
      push();
      current = {
        kind: 'campaign',
        title: 'Campaign Brief',
        icon: '📋',
        lines: [],
      };
      continue;
    }

    // ── Research Phase header — already handled above ──

    // ── Steps (STEP 1, STEP 2, STEP 3) ──
    const stepMatch = t.match(/^STEP\s+(\d+):\s*(.+)/i);
    if (stepMatch) {
      push();
      const stepNum = stepMatch[1];
      const stepTitle = stepMatch[2];
      const stepIcons: Record<string, string> = { '1': '💡', '2': '🛡️', '3': '👥' };
      current = {
        kind: 'step',
        title: `Step ${stepNum} — ${stepTitle}`,
        icon: stepIcons[stepNum] || '📌',
        lines: [],
      };
      continue;
    }

    // ── Findings: desire hierarchies ──
    if (t.startsWith('Identified') && t.includes('desire hierarch')) {
      if (current?.kind === 'step') {
        current.badge = t.match(/(\d+)/)?.[1] + ' desires';
        current.lines.push(t);
      }
      continue;
    }

    // ── Findings: objections ──
    if (t.startsWith('Found') && t.includes('objection')) {
      if (current?.kind === 'step') {
        current.badge = t.match(/(\d+)/)?.[1] + ' objections';
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
        title: iterMatch ? `Orchestrator Iteration ${iterMatch[1]}/${iterMatch[2]}` : 'Orchestrator',
        icon: '🎯',
        badge: timeMatch ? `${timeMatch[1]}s` : 'GLM-4.7',
        lines: [],
      };
      if (t.includes('Pausing')) {
        current.lines.push('Waiting for user input...');
      }
      continue;
    }

    // ── Deploying researchers ──
    if (t.includes('Deploying') && t.includes('researcher')) {
      const countMatch = t.match(/Deploying\s+(\d+)/);
      if (current?.kind === 'orchestrator') {
        current.badge = countMatch ? `${countMatch[1]} agents` : current.badge;
        current.lines.push(`Deploying ${countMatch?.[1] || ''} researcher agents...`);
      }
      continue;
    }

    // ── Orchestrator chosen queries (→ "query") ──
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
      if (current?.kind === 'orchestrator') {
        current.lines.push(`Decision: ${preview}`);
      }
      continue;
    }

    // ── Researcher activity ──
    if (t.includes('[Researcher]')) {
      const inner = t.replace(/.*\[Researcher\]\s*/, '').replace(/^[🔎📄⚠️]\s*/, '');

      // New search = new section
      if (inner.includes('Searching:')) {
        push();
        const topicMatch = inner.match(/Searching:\s*"?(.+?)"?\s*\.{0,3}$/);
        current = {
          kind: 'researcher',
          title: topicMatch ? topicMatch[1].slice(0, 60) : 'Web Search',
          icon: '🔍',
          badge: 'searching...',
          lines: [],
        };
        continue;
      }

      // Page fetch update
      if (inner.includes('Fetched')) {
        const fetchMatch = inner.match(/Fetched\s+(\d+)\/(\d+)\s+pages\s+\((.+?)s\)/);
        if (fetchMatch && current?.kind === 'researcher') {
          current.badge = `${fetchMatch[1]}/${fetchMatch[2]} pages · ${fetchMatch[3]}s`;
        }
        if (current) current.lines.push(inner);
        continue;
      }

      // Compression progress
      if (inner.includes('Compress')) {
        if (current) current.lines.push(inner);
        continue;
      }

      // Synthesis / other researcher output
      if (current) {
        current.lines.push(inner);
      }
      continue;
    }

    // ── Reflection agent ──
    if (t.includes('Running reflection agent') || t.includes('150% bar mode')) {
      push();
      current = {
        kind: 'reflection',
        title: 'Reflection Agent',
        icon: '🔬',
        badge: '150% bar',
        lines: [],
      };
      continue;
    }

    if (t.includes('[Reflection]')) {
      const inner = t.replace(/.*\[Reflection\]\s*/, '');
      if (!current || current.kind !== 'reflection') {
        push();
        current = {
          kind: 'reflection',
          title: 'Reflection Agent',
          icon: '🔬',
          badge: '150% bar',
          lines: [],
        };
      }
      current.lines.push(inner);
      continue;
    }

    if (t.includes('Reflection found')) {
      const gapMatch = t.match(/found\s+(\d+)\s+gaps/);
      if (current?.kind === 'reflection') {
        current.badge = gapMatch ? `${gapMatch[1]} gaps found` : current.badge;
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
        title: covMatch ? `Coverage — ${covMatch[1]}%` : 'Coverage',
        icon: '📊',
        badge: covMatch ? `${covMatch[2]}/${covMatch[3]} dims` : undefined,
        lines: threshMatch ? [`Target: ${threshMatch[1]}% threshold`] : [],
      };
      continue;
    }

    // ── Complete ──
    if (t.includes('research complete') || t.includes('RESEARCH COMPLETE') || t.includes('Coverage threshold reached') || t.includes('Orchestrator satisfied')) {
      push();
      current = {
        kind: 'complete',
        title: 'Research Complete',
        icon: '✅',
        lines: [t.replace(/^.*?[✓✅]\s*/, '')],
      };
      continue;
    }

    // ── Time limit ──
    if (t.includes('Time limit reached')) {
      push();
      current = {
        kind: 'timelimit',
        title: 'Time Limit Reached',
        icon: '⏱️',
        lines: [t.replace(/^.*?⏱️\s*/, '')],
      };
      continue;
    }

    // ── Error ──
    if (t.startsWith('ERROR') || (t.startsWith('⚠️') && !t.includes('[Reflection]'))) {
      push();
      current = {
        kind: 'error',
        title: 'Error',
        icon: '⚠️',
        lines: [t],
      };
      continue;
    }

    // ── Skip synthesis boilerplate ──
    if (t === 'glm-4.7 orchestrator deciding what additional research is needed...') {
      if (current) current.lines.push('GLM evaluating research gaps...');
      continue;
    }
    if (t.startsWith('User provided:') && current) {
      current.lines.push(t);
      continue;
    }

    // ── Fallback: append to current section ──
    if (current) {
      current.lines.push(t);
    } else {
      current = {
        kind: 'raw',
        title: 'Output',
        icon: '📝',
        lines: [t],
      };
    }
  }

  push();
  return sections;
}

// ─────────────────────────────────────────────────────────────
// Style config
// ─────────────────────────────────────────────────────────────

interface StyleSet {
  headerBg: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
  border: string;
  contentBg: string;
  accent: string;
}

function getStyles(kind: SectionKind, dark: boolean): StyleSet {
  // Lowered opacity on section backgrounds for a subtler look
  const styles: Record<string, StyleSet> = {
    phase: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-white', badgeBg: 'bg-indigo-900/40', badgeText: 'text-indigo-300', border: 'border-indigo-800/30', contentBg: 'bg-zinc-950/40', accent: 'text-indigo-400' }
      : { headerBg: 'bg-indigo-50', headerText: 'text-indigo-900', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700', border: 'border-indigo-200', contentBg: 'bg-white', accent: 'text-indigo-600' },
    campaign: dark
      ? { headerBg: 'bg-zinc-900/60', headerText: 'text-zinc-300', badgeBg: 'bg-zinc-800/60', badgeText: 'text-zinc-500', border: 'border-zinc-800/50', contentBg: 'bg-zinc-950/30', accent: 'text-zinc-500' }
      : { headerBg: 'bg-zinc-50', headerText: 'text-zinc-800', badgeBg: 'bg-zinc-200', badgeText: 'text-zinc-600', border: 'border-zinc-200', contentBg: 'bg-white', accent: 'text-zinc-500' },
    step: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-emerald-300', badgeBg: 'bg-emerald-900/35', badgeText: 'text-emerald-300', border: 'border-emerald-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-emerald-400' }
      : { headerBg: 'bg-emerald-50', headerText: 'text-emerald-800', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700', border: 'border-emerald-200', contentBg: 'bg-white', accent: 'text-emerald-600' },
    orchestrator: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-blue-300', badgeBg: 'bg-blue-900/35', badgeText: 'text-blue-300', border: 'border-blue-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-blue-400' }
      : { headerBg: 'bg-blue-50', headerText: 'text-blue-800', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', border: 'border-blue-200', contentBg: 'bg-white', accent: 'text-blue-600' },
    researcher: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-teal-300', badgeBg: 'bg-teal-900/35', badgeText: 'text-teal-300', border: 'border-teal-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-teal-400' }
      : { headerBg: 'bg-teal-50', headerText: 'text-teal-800', badgeBg: 'bg-teal-100', badgeText: 'text-teal-700', border: 'border-teal-200', contentBg: 'bg-white', accent: 'text-teal-600' },
    reflection: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-amber-300', badgeBg: 'bg-amber-900/35', badgeText: 'text-amber-300', border: 'border-amber-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-amber-400' }
      : { headerBg: 'bg-amber-50', headerText: 'text-amber-800', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700', border: 'border-amber-200', contentBg: 'bg-white', accent: 'text-amber-600' },
    coverage: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-purple-300', badgeBg: 'bg-purple-900/35', badgeText: 'text-purple-300', border: 'border-purple-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-purple-400' }
      : { headerBg: 'bg-purple-50', headerText: 'text-purple-800', badgeBg: 'bg-purple-100', badgeText: 'text-purple-700', border: 'border-purple-200', contentBg: 'bg-white', accent: 'text-purple-600' },
    deploy: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-cyan-300', badgeBg: 'bg-cyan-900/35', badgeText: 'text-cyan-300', border: 'border-cyan-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-cyan-400' }
      : { headerBg: 'bg-cyan-50', headerText: 'text-cyan-800', badgeBg: 'bg-cyan-100', badgeText: 'text-cyan-700', border: 'border-cyan-200', contentBg: 'bg-white', accent: 'text-cyan-600' },
    complete: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-green-300', badgeBg: 'bg-green-900/35', badgeText: 'text-green-300', border: 'border-green-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-green-400' }
      : { headerBg: 'bg-green-50', headerText: 'text-green-800', badgeBg: 'bg-green-100', badgeText: 'text-green-700', border: 'border-green-200', contentBg: 'bg-white', accent: 'text-green-600' },
    timelimit: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-orange-300', badgeBg: 'bg-orange-900/35', badgeText: 'text-orange-300', border: 'border-orange-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-orange-400' }
      : { headerBg: 'bg-orange-50', headerText: 'text-orange-800', badgeBg: 'bg-orange-100', badgeText: 'text-orange-700', border: 'border-orange-200', contentBg: 'bg-white', accent: 'text-orange-600' },
    error: dark
      ? { headerBg: 'bg-zinc-900/80', headerText: 'text-red-300', badgeBg: 'bg-red-900/35', badgeText: 'text-red-300', border: 'border-red-800/25', contentBg: 'bg-zinc-950/40', accent: 'text-red-400' }
      : { headerBg: 'bg-red-50', headerText: 'text-red-800', badgeBg: 'bg-red-100', badgeText: 'text-red-700', border: 'border-red-200', contentBg: 'bg-white', accent: 'text-red-600' },
    findings: dark
      ? { headerBg: 'bg-zinc-900/60', headerText: 'text-zinc-300', badgeBg: 'bg-zinc-800/60', badgeText: 'text-zinc-500', border: 'border-zinc-800/50', contentBg: 'bg-zinc-950/30', accent: 'text-zinc-500' }
      : { headerBg: 'bg-zinc-50', headerText: 'text-zinc-800', badgeBg: 'bg-zinc-200', badgeText: 'text-zinc-600', border: 'border-zinc-200', contentBg: 'bg-white', accent: 'text-zinc-500' },
    raw: dark
      ? { headerBg: 'bg-zinc-900/60', headerText: 'text-zinc-400', badgeBg: 'bg-zinc-800/60', badgeText: 'text-zinc-600', border: 'border-zinc-800/40', contentBg: 'bg-zinc-950/30', accent: 'text-zinc-600' }
      : { headerBg: 'bg-zinc-50', headerText: 'text-zinc-700', badgeBg: 'bg-zinc-200', badgeText: 'text-zinc-500', border: 'border-zinc-200', contentBg: 'bg-white', accent: 'text-zinc-400' },
  };
  return styles[kind] || styles.raw;
}

// ─────────────────────────────────────────────────────────────
// Coverage Bar sub-component
// ─────────────────────────────────────────────────────────────

function CoverageBar({ text, dark }: { text: string; dark: boolean }) {
  const pctMatch = text.match(/(\d+)%/);
  const pct = pctMatch ? parseInt(pctMatch[1]) : 0;
  const color = pct >= 80 ? (dark ? 'bg-emerald-500/80' : 'bg-emerald-500') : pct >= 50 ? (dark ? 'bg-amber-500/80' : 'bg-amber-500') : (dark ? 'bg-red-500/80' : 'bg-red-500');

  return (
    <div className="flex items-center gap-3 w-full mt-1">
      <div className={`flex-1 h-2 rounded-full ${dark ? 'bg-zinc-800' : 'bg-zinc-200'} overflow-hidden`}>
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`font-mono text-xs font-bold ${dark ? 'text-zinc-300' : 'text-zinc-700'}`}>{pct}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Finding line renderer — handles [1], [2], Surface:, etc.
// ─────────────────────────────────────────────────────────────

function RenderLine({ line, dark, accent }: { line: string; dark: boolean; accent: string }) {
  const textClass = dark ? 'text-zinc-300' : 'text-zinc-700';
  const dimClass = dark ? 'text-zinc-500' : 'text-zinc-400';

  // Numbered finding: [1] Target: Desire
  const findingMatch = line.match(/^\s*\[(\d+)\]\s*(.+)/);
  if (findingMatch) {
    return (
      <div className="flex gap-2 items-start py-0.5">
        <span className={`font-mono text-[10px] font-bold ${accent} bg-current/10 w-5 h-5 flex items-center justify-center rounded shrink-0 mt-0.5`} style={{ backgroundColor: 'transparent' }}>
          <span className={accent}>{findingMatch[1]}</span>
        </span>
        <span className={`text-xs ${textClass} leading-relaxed`}>{findingMatch[2]}</span>
      </div>
    );
  }

  // Surface/Intensity sub-line
  if (line.match(/^\s*Surface:/i) || line.match(/^\s*Intensity:/i)) {
    return (
      <div className={`text-xs ${dimClass} ml-7 leading-relaxed italic`}>{line.trim()}</div>
    );
  }

  // Campaign data lines (Brand:, Target:, etc.)
  const kvMatch = line.match(/^(Brand|Target Audience|Marketing Goal|Audience congregates|Key language|Market gap):\s*(.+)/);
  if (kvMatch) {
    return (
      <div className="flex gap-2 py-0.5">
        <span className={`text-xs font-semibold ${accent} shrink-0`}>{kvMatch[1]}</span>
        <span className={`text-xs ${textClass}`}>{kvMatch[2]}</span>
      </div>
    );
  }

  // Compression progress
  if (line.match(/Compress/i)) {
    return <div className={`text-[11px] ${dimClass} font-mono`}>{line}</div>;
  }

  // Fetched pages
  if (line.match(/Fetched/i)) {
    return <div className={`text-xs ${accent} font-mono`}>{line}</div>;
  }

  // Raw JSON streaming tokens — dim mono so they don't dominate
  if (line.match(/^\s*[\[{\]},"]/) || line.match(/^\s*"[a-zA-Z_]+"\s*:/)) {
    return <div className={`text-[10px] ${dimClass} font-mono leading-tight`}>{line}</div>;
  }

  // Default
  return <div className={`text-xs ${textClass} leading-relaxed`}>{line}</div>;
}

// ─────────────────────────────────────────────────────────────
// Section Component
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
  const s = getStyles(section.kind, dark);

  // Phase sections are always bold/prominent
  const isPhase = section.kind === 'phase';

  return (
    <div className={`border ${s.border} rounded-sm overflow-hidden ${isPhase ? 'mt-1' : ''}`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className={`w-full px-3 py-1.5 flex items-center gap-2 ${s.headerBg} hover:brightness-110 transition-all duration-150 cursor-pointer`}
      >
          {/* Title */}
        <span className={`flex-1 text-left text-[11px] ${isPhase ? 'font-bold uppercase tracking-wide' : 'font-medium'} ${s.headerText} truncate`}>
          {section.title}
        </span>

        {/* Badge */}
        {section.badge && (
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm ${s.badgeBg} ${s.badgeText} shrink-0`}>
            {section.badge}
          </span>
        )}

        {/* Line count pill */}
        {section.lines.length > 0 && (
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-full ${dark ? 'bg-zinc-800/60 text-zinc-500' : 'bg-zinc-200 text-zinc-500'} shrink-0`}>
            {section.lines.length}
          </span>
        )}

        {/* Streaming indicator */}
        {isLast && section.lines.length > 0 && (
          <span className={`w-1.5 h-1.5 rounded-full ${dark ? 'bg-green-400' : 'bg-green-500'} animate-pulse shrink-0`} />
        )}

        {/* Chevron */}
        <span className={`text-[10px] ${dark ? 'text-zinc-600' : 'text-zinc-400'} shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>

      {/* Content */}
      {isExpanded && section.lines.length > 0 && (
        <div className={`px-3 py-2 border-t ${s.border} ${s.contentBg} space-y-0.5 max-h-80 overflow-y-auto`}>
          {/* Coverage gets a bar */}
          {section.kind === 'coverage' && <CoverageBar text={section.title} dark={dark} />}

          {section.lines.map((line, li) => (
            <RenderLine key={li} line={line} dark={dark} accent={s.accent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Summary header
// ─────────────────────────────────────────────────────────────

function ResearchSummary({ sections, dark }: { sections: Section[]; dark: boolean }) {
  const phases = sections.filter(s => s.kind === 'phase').length;
  const steps = sections.filter(s => s.kind === 'step').length;
  const searches = sections.filter(s => s.kind === 'researcher').length;
  const coverage = sections.find(s => s.kind === 'coverage');
  const coveragePct = coverage?.title.match(/(\d+)%/)?.[1] || '—';
  const isDone = sections.some(s => s.kind === 'complete');
  const isTimeout = sections.some(s => s.kind === 'timelimit');

  const statClass = dark ? 'text-zinc-400' : 'text-zinc-500';
  const numClass = dark ? 'text-white' : 'text-black';

  return (
    <div className={`flex items-center gap-4 px-1 py-1.5 mb-2 border-b ${dark ? 'border-zinc-800' : 'border-zinc-200'}`}>
      <div className="flex items-center gap-4 flex-1">
        <span className={`font-mono text-[10px] uppercase tracking-wider ${statClass}`}>
          <span className={numClass}>{phases}</span> phases
        </span>
        <span className={`font-mono text-[10px] uppercase tracking-wider ${statClass}`}>
          <span className={numClass}>{steps}</span> steps
        </span>
        {searches > 0 && (
          <span className={`font-mono text-[10px] uppercase tracking-wider ${statClass}`}>
            <span className={numClass}>{searches}</span> searches
          </span>
        )}
        <span className={`font-mono text-[10px] uppercase tracking-wider ${statClass}`}>
          <span className={numClass}>{coveragePct}</span>% coverage
        </span>
      </div>
      {isDone && (
        <span className={`font-mono text-[10px] font-bold ${dark ? 'text-green-400' : 'text-green-600'}`}>
          ✓ COMPLETE
        </span>
      )}
      {isTimeout && (
        <span className={`font-mono text-[10px] font-bold ${dark ? 'text-orange-400' : 'text-orange-600'}`}>
          ⏱ TIMEOUT
        </span>
      )}
      {!isDone && !isTimeout && (
        <span className={`font-mono text-[10px] ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          running...
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

export function ResearchOutput({ output, isDarkMode }: ResearchOutputProps) {
  const sections = useMemo(() => parseOutput(output), [output]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Auto-expand latest section + all phases
  useEffect(() => {
    if (sections.length > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        // Always expand latest
        next.add(sections.length - 1);
        // Auto-expand phases and steps on first appearance
        sections.forEach((s, i) => {
          if (s.kind === 'phase' || s.kind === 'step' || s.kind === 'coverage' || s.kind === 'complete' || s.kind === 'error') {
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
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(sections.map((_, i) => i)));
  const collapseAll = () => setExpanded(new Set());

  if (sections.length === 0) {
    return (
      <div className={`font-mono text-xs ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'} flex items-center gap-2`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        Waiting for research output...
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Summary bar */}
      <ResearchSummary sections={sections} dark={isDarkMode} />

      {/* Controls */}
      <div className="flex gap-1.5 mb-1">
        <button
          onClick={expandAll}
          className={`font-mono text-[9px] px-2 py-0.5 rounded-sm ${isDarkMode ? 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'} transition-all duration-150`}
        >
          expand all
        </button>
        <button
          onClick={collapseAll}
          className={`font-mono text-[9px] px-2 py-0.5 rounded-sm ${isDarkMode ? 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'} transition-all duration-150`}
        >
          collapse all
        </button>
      </div>

      {/* Sections */}
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
  );
}
