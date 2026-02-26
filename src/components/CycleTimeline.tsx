import type { Cycle, StageName } from '../types';
import { useTheme } from '../context/ThemeContext';

const STAGES: { name: StageName; label: string }[] = [
  { name: 'research', label: 'Research' },
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

  return (
    <div className={`border ${borderClass} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <span className={`font-mono text-xs uppercase tracking-widest ${secondaryTextClass}`}>Cycle {cycle.cycleNumber}</span>
        {cycle.completedAt && (
          <span className={`font-mono text-xs ${secondaryTextClass}`}>
            Done {new Date(cycle.completedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex gap-px">
        {STAGES.map((stage) => {
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
              className={`flex-1 py-3 text-center transition-colors ${stageClass}`}
            >
              <div className="font-mono text-xs uppercase tracking-wider">{stage.label}</div>
              {stageData.startedAt && (
                <div className="font-mono text-xs mt-0.5 opacity-60">
                  {new Date(stageData.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
