import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { CampaignSelector } from './CampaignSelector';
import { ControlPanel } from './ControlPanel';
import { CycleTimeline } from './CycleTimeline';
import { StagePanel } from './StagePanel';
import { CycleHistory } from './CycleHistory';

export function Dashboard() {
  const { systemStatus, error, currentCycle, cycles, campaign } = useCampaign();
  const { isDarkMode } = useTheme();
  const isRunning = systemStatus === 'running';

  const bgClass = isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white';
  const textClass = isDarkMode ? 'text-white' : 'text-black';
  const borderClass = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const secondaryTextClass = isDarkMode ? 'text-zinc-500' : 'text-zinc-600';

  return (
    <div className={`min-h-screen ${bgClass} ${textClass}`}>
      <ControlPanel />

      <div className="max-w-7xl mx-auto px-6 py-6">

        {error && (
          <div className={`border ${isDarkMode ? 'border-red-800 bg-red-950/30' : 'border-red-300 bg-red-50'} p-3 mb-6 flex items-start gap-3`}>
            <span className={`font-mono text-xs uppercase tracking-widest font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>Error</span>
            <span className={`font-mono text-xs ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</span>
          </div>
        )}

        {!error && isRunning && (
          <div className={`border-l-4 ${isDarkMode ? 'border-white' : 'border-black'} pl-3 mb-6`}>
            <span className={`font-mono text-xs uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-black'}`}>Running</span>
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* Left — Campaign info */}
          <div className="col-span-4 space-y-3">
            <CampaignSelector />
            <CycleHistory cycles={cycles} />

            {/* Stage legend */}
            <div className={`border ${borderClass} p-3.5`}>
              <span className={`font-mono text-xs uppercase tracking-widest ${secondaryTextClass} block mb-2.5`}>Stages</span>
              <div className="space-y-2">
                {[
                  { name: 'Research', desc: 'Desires & objections' },
                  { name: 'Taste', desc: 'Creative direction' },
                  { name: 'Make', desc: 'Assets' },
                  { name: 'Test', desc: 'Eval' },
                  { name: 'Memories', desc: 'Insights' },
                ].map((s) => (
                  <div key={s.name} className="flex items-center justify-between gap-2 text-xs">
                    <span className={`font-mono font-semibold uppercase ${textClass}`}>{s.name}</span>
                    <span className={`font-mono ${secondaryTextClass}`}>{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Active stage */}
          <div className="col-span-8 space-y-3">
            {campaign && currentCycle ? (
              <>
                <CycleTimeline cycle={currentCycle} />
                <StagePanel cycle={currentCycle} isRunning={isRunning} isDarkMode={isDarkMode} />
              </>
            ) : (
              <div className={`border border-dashed ${borderClass} p-8 text-center`}>
                <p className={`font-mono text-xs uppercase tracking-widest ${isDarkMode ? 'text-zinc-700' : 'text-zinc-400'}`}>
                  Create campaign to begin
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
