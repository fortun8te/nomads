import { useState, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { CampaignSelector } from './CampaignSelector';
import { ControlPanel } from './ControlPanel';
import { CycleTimeline } from './CycleTimeline';
import { StagePanel } from './StagePanel';
import { CycleHistory } from './CycleHistory';
import { QuestionModal } from './QuestionModal';
import type { StageName } from '../types';

export function Dashboard() {
  const { systemStatus, error, currentCycle, cycles, campaign, pendingQuestion, answerQuestion } = useCampaign();
  const { isDarkMode } = useTheme();
  const isRunning = systemStatus === 'running';
  const [selectedStage, setSelectedStage] = useState<StageName | null>(null);

  // Auto-follow the active stage when it changes (unless user explicitly picked one)
  useEffect(() => {
    if (currentCycle) {
      setSelectedStage(currentCycle.currentStage);
    }
  }, [currentCycle?.currentStage]);

  const bgClass = isDarkMode ? 'bg-[#080808]' : 'bg-white';
  const textClass = isDarkMode ? 'text-white' : 'text-black';
  const borderClass = isDarkMode ? 'border-zinc-800/70' : 'border-zinc-200';
  const secondaryTextClass = isDarkMode ? 'text-zinc-600' : 'text-zinc-500';

  return (
    <div className={`min-h-screen ${bgClass} ${textClass}`}>
      <ControlPanel />

      <div className="max-w-7xl mx-auto px-6 py-5">

        {error && (
          <div className={`border ${isDarkMode ? 'border-red-800/60 bg-red-950/20' : 'border-red-300 bg-red-50'} p-3 mb-5 flex items-start gap-3`}>
            <span className={`font-mono text-[10px] uppercase tracking-widest font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>Error</span>
            <span className={`font-mono text-xs ${isDarkMode ? 'text-red-300/80' : 'text-red-700'}`}>{error}</span>
          </div>
        )}

        {!error && isRunning && (
          <div className={`border-l-2 ${isDarkMode ? 'border-emerald-500/60' : 'border-black'} pl-3 mb-5`}>
            <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-emerald-400/70' : 'text-black'}`}>Running</span>
          </div>
        )}

        <div className="grid grid-cols-12 gap-3">
          {/* Left — Campaign info */}
          <div className="col-span-3 space-y-3">
            <CampaignSelector />
            <CycleHistory cycles={cycles} />

            {/* Stage legend */}
            <div className={`border ${borderClass} p-3`}>
              <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${secondaryTextClass} block mb-2`}>Stages</span>
              <div className="space-y-1.5">
                {[
                  { name: 'Research', desc: 'Desires & objections' },
                  { name: 'Taste', desc: 'Creative direction' },
                  { name: 'Make', desc: 'Assets' },
                  { name: 'Test', desc: 'Eval' },
                  { name: 'Memories', desc: 'Insights' },
                ].map((s) => (
                  <div key={s.name} className="flex items-center justify-between gap-2">
                    <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-zinc-400' : 'text-zinc-700'}`}>{s.name}</span>
                    <span className={`font-mono text-[10px] ${secondaryTextClass}`}>{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Active stage */}
          <div className="col-span-9 space-y-3">
            {campaign && currentCycle ? (
              <>
                <CycleTimeline cycle={currentCycle} selectedStage={selectedStage} onSelectStage={setSelectedStage} />
                <StagePanel cycle={currentCycle} isRunning={isRunning} isDarkMode={isDarkMode} viewStage={selectedStage} />
              </>
            ) : (
              <div className={`border border-dashed ${borderClass} p-12 text-center`}>
                <p className={`font-mono text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-zinc-700' : 'text-zinc-400'}`}>
                  Create campaign to begin
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Interactive question modal — shown when pipeline pauses for user input */}
      {pendingQuestion && (
        <QuestionModal
          question={pendingQuestion}
          onAnswer={answerQuestion}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}
