import type { Cycle, StageName } from '../types';
import { useTheme } from '../context/ThemeContext';

const ALL_STAGES: { name: StageName; label: string }[] = [
  { name: 'research', label: 'Research' },
  { name: 'objections', label: 'Objections' },
  { name: 'taste', label: 'Taste' },
  { name: 'make', label: 'Make' },
  { name: 'test', label: 'Test' },
  { name: 'memories', label: 'Memories' },
];

interface CycleTimelineProps {
  cycle: Cycle | null;
  selectedStage?: StageName | null;
  onSelectStage?: (stage: StageName) => void;
}

export function CycleTimeline({ cycle, selectedStage, onSelectStage }: CycleTimelineProps) {
  const { isDarkMode } = useTheme();

  if (!cycle) return null;

  const borderClass = isDarkMode ? 'border-zinc-800/70' : 'border-zinc-200';
  const secondaryTextClass = isDarkMode ? 'text-zinc-600' : 'text-zinc-500';

  // Filter stages based on mode
  const stages = cycle.mode === 'concepting'
    ? ALL_STAGES.filter(s => ['research', 'objections', 'taste'].includes(s.name))
    : ALL_STAGES;

  return (
    <div className={`border ${borderClass} p-3`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-3">
          <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${secondaryTextClass}`}>Cycle {cycle.cycleNumber}</span>
          {cycle.mode === 'concepting' && (
            <span className={`font-mono text-[10px] px-2 py-0.5 ${isDarkMode ? 'bg-zinc-800/80 text-zinc-500' : 'bg-zinc-100 text-zinc-500'}`}>Concepting</span>
          )}
        </div>
        {cycle.completedAt && (
          <span className={`font-mono text-[10px] ${secondaryTextClass}`}>
            {new Date(cycle.completedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex gap-px">
        {stages.map((stage) => {
          const stageData = cycle.stages[stage.name];
          const isActive = cycle.currentStage === stage.name;
          const isComplete = stageData.status === 'complete';
          const isViewing = selectedStage === stage.name;
          const canClick = isComplete || isActive;

          let stageClass = '';
          if (isViewing) {
            stageClass = isDarkMode
              ? 'bg-white text-black border-t-2 border-t-white'
              : 'bg-black text-white border-t-2 border-t-black';
          } else if (isActive) {
            stageClass = isDarkMode
              ? 'bg-zinc-700 text-zinc-200 border-t-2 border-t-zinc-500'
              : 'bg-zinc-400 text-white border-t-2 border-t-zinc-600';
          } else if (isComplete) {
            stageClass = isDarkMode
              ? 'bg-zinc-800/80 text-zinc-400 border-t-2 border-t-transparent hover:bg-zinc-700/80 hover:text-zinc-300'
              : 'bg-zinc-200 text-zinc-600 border-t-2 border-t-transparent hover:bg-zinc-300';
          } else {
            stageClass = isDarkMode
              ? 'bg-zinc-900/50 text-zinc-700 border-t-2 border-t-transparent'
              : 'bg-zinc-100 text-zinc-400 border-t-2 border-t-transparent';
          }

          return (
            <button
              key={stage.name}
              onClick={() => canClick && onSelectStage?.(stage.name)}
              className={`flex-1 py-2 px-2 text-center transition-all duration-150 ${stageClass} ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="font-mono text-[10px] font-semibold uppercase tracking-wider">{stage.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
