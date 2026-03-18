import type { Cycle, TestConceptVerdict } from '../types';

interface TestResultsPanelProps {
  cycle: Cycle | null;
  isDarkMode?: boolean;
}

const SCORE_LABELS: Record<string, string> = {
  desireActivation: 'Desire Activation',
  rootCauseReveal: 'Root Cause Reveal',
  emotionalLogical: 'Emotional + Logical',
  audienceLanguage: 'Audience Language',
  competitiveDiff: 'Competitive Diff',
};

function scoreColor(score: number): string {
  if (score <= 3) return '#ef4444';  // red
  if (score <= 6) return '#f59e0b';  // amber
  return '#22c55e';                   // green
}

function verdictStyle(verdict: string, isDark: boolean): { bg: string; text: string; label: string } {
  switch (verdict) {
    case 'lead':
      return {
        bg: isDark ? 'bg-blue-500/15' : 'bg-blue-50',
        text: isDark ? 'text-blue-400' : 'text-blue-600',
        label: 'Lead',
      };
    case 'test':
      return {
        bg: isDark ? 'bg-amber-500/15' : 'bg-amber-50',
        text: isDark ? 'text-amber-400' : 'text-amber-600',
        label: 'Test',
      };
    case 'skip':
    default:
      return {
        bg: isDark ? 'bg-zinc-500/15' : 'bg-zinc-100',
        text: isDark ? 'text-white/[0.30]' : 'text-zinc-500',
        label: 'Skip',
      };
  }
}

function ScoreBar({ label, score, isDark }: { label: string; score: number; isDark: boolean }) {
  const color = scoreColor(score);
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));

  return (
    <div className="flex items-center gap-2">
      <span className={`text-[11px] w-[120px] flex-shrink-0 ${isDark ? 'text-white/[0.30]' : 'text-zinc-500'}`}>
        {label}
      </span>
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums w-5 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function ConceptCard({ concept, isDark, isWinner }: { concept: TestConceptVerdict; isDark: boolean; isWinner: boolean }) {
  const badge = verdictStyle(concept.verdict, isDark);

  return (
    <div className={`rounded-lg border p-4 ${
      isWinner
        ? isDark ? 'border-blue-500/30 bg-blue-500/5' : 'border-blue-200 bg-blue-50/30'
        : isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-zinc-200 bg-white'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isWinner && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
            }`}>
              Winner
            </span>
          )}
          <span className={`text-[13px] font-semibold ${isDark ? 'text-white/[0.85]' : 'text-zinc-800'}`}>
            {concept.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          <span className={`text-[15px] font-bold tabular-nums ${isDark ? 'text-white/[0.85]' : 'text-zinc-800'}`}>
            {concept.totalScore}<span className={`text-[10px] font-normal ${isDark ? 'text-white/[0.30]' : 'text-zinc-400'}`}>/50</span>
          </span>
        </div>
      </div>

      {/* Score bars */}
      <div className="space-y-1.5 mb-3">
        {Object.entries(concept.scores).map(([key, val]) => (
          <ScoreBar
            key={key}
            label={SCORE_LABELS[key] || key}
            score={typeof val === 'number' ? val : 0}
            isDark={isDark}
          />
        ))}
      </div>

      {/* Notes */}
      {concept.notes && (
        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-white/[0.30]' : 'text-zinc-500'}`}>
          {concept.notes}
        </p>
      )}
    </div>
  );
}

export function TestResultsPanel({ cycle, isDarkMode }: TestResultsPanelProps) {
  const isDark = isDarkMode ?? true;
  const verdict = cycle?.testVerdict;

  // Empty state
  if (!verdict || !verdict.concepts || verdict.concepts.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 py-16 ${isDark ? 'bg-transparent' : 'bg-zinc-50'}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-white/[0.04]' : 'bg-zinc-100'}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#52525b' : '#a1a1aa'} strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 3h6M12 3v3M8 6h8l1.5 15H6.5L8 6z" /><path d="M10 10c0 2 4 2 4 0" />
          </svg>
        </div>
        <span className={`text-[13px] font-semibold ${isDark ? 'text-white/[0.55]' : 'text-zinc-500'}`}>
          Creative Testing
        </span>
        <p className={`text-[11px] max-w-[260px] text-center leading-relaxed ${isDark ? 'text-white/[0.30]' : 'text-zinc-400'}`}>
          Run the full pipeline to evaluate ad concepts. The test stage scores each creative against desire activation, root cause reveal, emotional logic, audience language, and competitive differentiation.
        </p>
      </div>
    );
  }

  const winnerConcept = verdict.concepts.find(c => c.name === verdict.winner);
  const winnerScore = winnerConcept?.totalScore ?? 0;

  return (
    <div className={`p-5 space-y-4 ${isDark ? 'bg-transparent' : 'bg-zinc-50'}`}>
      {/* Winner card */}
      <div className={`rounded-lg border p-4 ${
        isDark ? 'border-blue-500/20 bg-gradient-to-br from-blue-500/8 to-transparent' : 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-blue-500/60' : 'text-blue-400'}`}>
              Recommended Lead
            </span>
            <h3 className={`text-[18px] font-bold mt-0.5 ${isDark ? 'text-white/[0.85]' : 'text-zinc-900'}`}>
              {verdict.winner}
            </h3>
          </div>
          <div className="text-right">
            <span className={`text-[28px] font-bold tabular-nums ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              {winnerScore}
            </span>
            <span className={`text-[12px] ${isDark ? 'text-white/[0.30]' : 'text-zinc-400'}`}>/50</span>
          </div>
        </div>
      </div>

      {/* Concept cards */}
      <div className="space-y-3">
        {verdict.concepts.map((concept, idx) => (
          <ConceptCard
            key={idx}
            concept={concept}
            isDark={isDark}
            isWinner={concept.name === verdict.winner}
          />
        ))}
      </div>

      {/* Next cycle improvement */}
      {verdict.nextCycleImprovement && (
        <div className={`rounded-lg border p-4 ${isDark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-zinc-200 bg-white'}`}>
          <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-amber-500/60' : 'text-amber-500'}`}>
            Next Cycle Improvement
          </span>
          <p className={`text-[12px] leading-relaxed mt-1.5 ${isDark ? 'text-white/[0.55]' : 'text-zinc-600'}`}>
            {verdict.nextCycleImprovement}
          </p>
        </div>
      )}
    </div>
  );
}
