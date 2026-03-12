import type { Cycle, StageName } from '../types';
import { motion } from 'framer-motion';

// Stage groups map to the 3 views
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

interface CycleTimelineProps {
  cycle: Cycle | null;
  selectedStage?: StageName | null;
  onSelectStage?: (stage: StageName) => void;
}

export function CycleTimeline({ cycle, selectedStage, onSelectStage }: CycleTimelineProps) {
  if (!cycle) return null;

  // Filter stages based on mode
  const stages = cycle.mode === 'concepting'
    ? ALL_STAGES.filter(s => ['research', 'brand-dna', 'persona-dna', 'angles'].includes(s.name))
    : ALL_STAGES;

  // Group separator positions
  const groupBoundaries = new Set<number>();
  for (let i = 1; i < stages.length; i++) {
    if (stages[i].group !== stages[i - 1].group) {
      groupBoundaries.add(i);
    }
  }

  return (
    <div className="pb-1">
      {/* Cycle label */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-medium text-zinc-400 tracking-wide uppercase">Cycle {cycle.cycleNumber}</span>
          {cycle.mode === 'concepting' && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium">Concepting</span>
          )}
        </div>
        {cycle.completedAt && (
          <span className="text-[10px] text-zinc-400">
            {new Date(cycle.completedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Stage pills */}
      <div className="flex items-center gap-1 flex-wrap">
        {stages.map((stage, idx) => {
          const stageData = cycle.stages[stage.name];
          const isActive = cycle.currentStage === stage.name;
          const isComplete = stageData?.status === 'complete';
          const isViewing = selectedStage === stage.name;
          const canClick = isComplete || isActive;

          // Group separator
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
                    ? 'bg-[#414243] text-white shadow-sm'
                    : isActive
                    ? 'bg-zinc-200 text-zinc-700'
                    : isComplete
                    ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-600'
                    : 'bg-transparent text-zinc-300'
                }`}
              >
                {isViewing && (
                  <motion.div
                    layoutId="stage-pill-active"
                    className="absolute inset-0 bg-[#414243] rounded-lg"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    style={{ zIndex: -1 }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
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
    </div>
  );
}
