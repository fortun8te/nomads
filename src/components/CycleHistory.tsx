import { useState } from 'react';
import type { Cycle } from '../types';
import { useTheme } from '../context/ThemeContext';

interface CycleHistoryProps {
  cycles: Cycle[];
}

export function CycleHistory({ cycles }: CycleHistoryProps) {
  const { isDarkMode } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const completed = cycles.filter((c) => c.status === 'complete');

  const borderClass = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const secondaryTextClass = isDarkMode ? 'text-zinc-500' : 'text-zinc-600';
  const hoverBgClass = isDarkMode ? 'hover:bg-zinc-900' : 'hover:bg-zinc-50';
  const expandedBgClass = isDarkMode ? 'bg-zinc-900' : 'bg-zinc-50';
  const textClass = isDarkMode ? 'text-white' : 'text-black';
  const mutedTextClass = isDarkMode ? 'text-zinc-700' : 'text-zinc-400';

  return (
    <div className={`border ${borderClass}`}>
      <div className={`px-5 py-3 border-b ${borderClass} flex items-center justify-between`}>
        <span className={`font-mono text-xs uppercase tracking-widest ${secondaryTextClass}`}>History</span>
        <span className={`font-mono text-xs ${secondaryTextClass}`}>{completed.length} cycles</span>
      </div>

      {completed.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <span className={`font-mono text-xs ${mutedTextClass}`}>No completed cycles</span>
        </div>
      ) : (
        <div className={`divide-y ${borderClass} max-h-64 overflow-y-auto`}>
          {completed.map((cycle) => (
            <div key={cycle.id}>
              <button
                onClick={() => setExpandedId(expandedId === cycle.id ? null : cycle.id)}
                className={`w-full px-5 py-3 text-left flex items-center justify-between transition-colors ${hoverBgClass}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-xs font-bold ${textClass}`}>#{cycle.cycleNumber}</span>
                  <span className={`font-mono text-xs ${secondaryTextClass}`}>
                    {new Date(cycle.startedAt).toLocaleDateString()}
                  </span>
                </div>
                <span className={`font-mono text-xs ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  {expandedId === cycle.id ? '−' : '+'}
                </span>
              </button>

              {expandedId === cycle.id && (
                <div className={`px-5 pb-4 ${expandedBgClass} border-t ${borderClass}`}>
                  <p className={`font-mono text-xs ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'} mt-3 leading-relaxed line-clamp-4`}>
                    {cycle.stages.research.agentOutput.slice(0, 200)}...
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
