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
}

export function CycleTimeline({ cycle }: CycleTimelineProps) {
  const { isDarkMode } = useTheme();

  if (!cycle) return null;

  const borderClass = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const secondaryTextClass = isDarkMode ? 'text-zinc-500' : 'text-zinc-600';

  // Filter stages based on mode
  const stages = cycle.mode === 'concepting'
    ? ALL_STAGES.filter(s => ['research', 'objections', 'taste'].includes(s.name))
    : ALL_STAGES;

  return (
    <div className={`border ${borderClass} p-3`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className={`font-mono text-xs uppercase tracking-widest ${secondaryTextClass}`}>Cycle {cycle.cycleNumber}</span>
          {cycle.mode === 'concepting' && (
            <span className={`font-mono text-xs px-2 py-0.5 rounded ${isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-600'}`}>Concepting</span>
          )}
        </div>
        {cycle.completedAt && (
          <span className={`font-mono text-xs ${secondaryTextClass}`}>
            {new Date(cycle.completedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex gap-px">
        {stages.map((stage) => {
          const stageData = cycle.stages[stage.name];
          const isActive = cycle.currentStage === stage.name;
          const isComplete = stageData.status === 'complete';

          let stageClass = '';
          if (isActive) {
            stageClass = isDarkMode
              ? 'bg-white text-black'
              : 'bg-black text-white';
          } else if (isComplete) {
            stageClass = isDarkMode
              ? 'bg-zinc-800 text-zinc-300'
              : 'bg-zinc-200 text-zinc-800';
          } else {
            stageClass = isDarkMode
              ? 'bg-zinc-900 text-zinc-700'
              : 'bg-zinc-100 text-zinc-400';
          }

          return (
            <div
              key={stage.name}
              className={`flex-1 py-2.5 px-2 text-center transition-colors ${stageClass}`}
            >
              <div className="font-mono text-xs font-semibold uppercase tracking-wider">{stage.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
