import type { Cycle, StageName } from '../types';

const ALL_STAGES: { name: StageName; label: string; group: 'research' | 'make' | 'test' }[] = [
  { name: 'research',    label: 'Research',    group: 'research' },
  { name: 'brand-dna',   label: 'Brand DNA',   group: 'research' },
  { name: 'persona-dna', label: 'Persona',     group: 'research' },
  { name: 'angles',      label: 'Angles',      group: 'research' },
  { name: 'strategy',    label: 'Strategy',    group: 'make' },
  { name: 'copywriting', label: 'Copy',        group: 'make' },
  { name: 'production',  label: 'Production',  group: 'make' },
  { name: 'test',        label: 'Test',        group: 'test' },
];

function formatElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

interface CycleTimelineProps {
  cycle: Cycle | null;
  selectedStage?: StageName | null;
  onSelectStage?: (stage: StageName) => void;
  vertical?: boolean;
}

export function CycleTimeline({ cycle, selectedStage, onSelectStage, vertical = false }: CycleTimelineProps) {
  if (!cycle) return null;

  const stages = cycle.mode === 'concepting'
    ? ALL_STAGES.filter(s => ['research', 'brand-dna', 'persona-dna', 'angles'].includes(s.name))
    : ALL_STAGES;

  const groupBoundaries = new Set<number>();
  for (let i = 1; i < stages.length; i++) {
    if (stages[i].group !== stages[i - 1].group) groupBoundaries.add(i);
  }

  if (vertical) {
    return (
      <div>
        <div className="text-[9px] text-white/[0.15] px-1 mb-1 tabular-nums">
          Cycle {cycle.cycleNumber}
          {cycle.completedAt && (
            <span className="ml-1">· {new Date(cycle.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
        <div className="space-y-px">
          {stages.map((stage, idx) => {
            const stageData = cycle.stages[stage.name];
            const isActive = cycle.currentStage === stage.name;
            const isComplete = stageData?.status === 'complete';
            const isViewing = selectedStage === stage.name;
            const canClick = isComplete || isActive;
            const showSep = groupBoundaries.has(idx);

            const elapsed = (isComplete || isActive) && stageData?.startedAt
              ? formatElapsed((stageData.completedAt || Date.now()) - stageData.startedAt)
              : null;

            return (
              <div key={stage.name}>
                {showSep && <div className="h-px bg-white/[0.08] mx-1 my-1" />}
                <button
                  onClick={() => canClick && onSelectStage?.(stage.name)}
                  disabled={!canClick}
                  className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-md text-left transition-colors group ${
                    canClick ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isViewing
                      ? 'bg-white/[0.08] text-white/[0.85]'
                      : isActive
                      ? 'text-blue-400'
                      : isComplete
                      ? 'text-white/[0.55] hover:bg-white/[0.04] hover:text-white/[0.85]'
                      : 'text-white/[0.15]'
                  }`}
                >
                  {/* Status indicator */}
                  <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                    {isActive ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    ) : isComplete ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full border border-white/[0.15]" />
                    )}
                  </span>

                  <span className="text-[11px] font-medium flex-1 leading-none">{stage.label}</span>

                  {elapsed && (
                    <span className={`text-[9px] tabular-nums flex-shrink-0 ${isViewing ? 'text-white/[0.30]' : isActive ? 'text-blue-600' : 'text-white/[0.15]'}`}>
                      {elapsed}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Horizontal fallback (kept for backward compat)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, idx) => {
        const stageData = cycle.stages[stage.name];
        const isActive = cycle.currentStage === stage.name;
        const isComplete = stageData?.status === 'complete';
        const isViewing = selectedStage === stage.name;
        const canClick = isComplete || isActive;
        const showSep = groupBoundaries.has(idx);

        return (
          <div key={stage.name} className="flex items-center">
            {showSep && <div className="w-px h-4 bg-zinc-200 mx-1" />}
            <button
              onClick={() => canClick && onSelectStage?.(stage.name)}
              className={`relative px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
                canClick ? 'cursor-pointer' : 'cursor-default'
              } ${
                isViewing
                  ? 'bg-zinc-800 text-white'
                  : isActive
                  ? 'bg-zinc-200 text-zinc-700'
                  : isComplete
                  ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                  : 'bg-transparent text-zinc-300'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {isComplete && !isViewing && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                {isActive && !isViewing && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
                {stage.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
