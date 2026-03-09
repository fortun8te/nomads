import { useState, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { CampaignSelector } from './CampaignSelector';
import { BrandDetailsPanel } from './BrandDetailsPanel';
import { PresetDetailsPanel } from './PresetDetailsPanel';
import { ControlPanel } from './ControlPanel';
import { CycleTimeline } from './CycleTimeline';
import { StagePanel } from './StagePanel';
import { CycleHistory } from './CycleHistory';
import { QuestionModal } from './QuestionModal';
import { ResearchReviewModal } from './ResearchReviewModal';
import type { StageName } from '../types';

interface DashboardProps {
  embedded?: boolean;
}

const STAGES = [
  { name: 'research', label: 'Research', desc: 'Desires & objections', icon: '🔍' },
  { name: 'taste', label: 'Taste', desc: 'Creative direction', icon: '🎨' },
  { name: 'make', label: 'Make', desc: 'Assets', icon: '⚡' },
  { name: 'test', label: 'Test', desc: 'Evaluation', icon: '📊' },
  { name: 'memories', label: 'Memories', desc: 'Insights', icon: '💾' },
];

export function Dashboard({ embedded = false }: DashboardProps) {
  const { systemStatus, error, currentCycle, cycles, campaign, pendingQuestion, answerQuestion, reviewingStage, reviewFindings, resumeAfterReview } = useCampaign();
  const { isDarkMode } = useTheme();
  const isRunning = systemStatus === 'running';
  const [selectedStage, setSelectedStage] = useState<StageName | null>(null);

  useEffect(() => {
    if (currentCycle) {
      setSelectedStage(currentCycle.currentStage);
    }
  }, [currentCycle?.currentStage]);

  return (
    <div className={`${embedded ? 'flex-1 overflow-y-auto' : 'min-h-screen'} ${isDarkMode ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'}`}>
      {!embedded && <ControlPanel />}

      <div className="max-w-7xl mx-auto px-6 py-5">
        {/* Error banner */}
        {error && (
          <div className={`rounded-xl p-4 mb-5 flex items-start gap-3 ${
            isDarkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
          }`}>
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>Error</span>
            <span className={`text-xs ${isDarkMode ? 'text-red-300/80' : 'text-red-700'}`}>{error}</span>
          </div>
        )}

        {/* Running indicator */}
        {!error && isRunning && (
          <div className="flex items-center gap-2 mb-5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className={`text-[11px] font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Pipeline running</span>
          </div>
        )}

        <div className="grid grid-cols-12 gap-4">
          {/* Left — Campaign info */}
          <div className="col-span-3 space-y-3">
            <CampaignSelector />
            {campaign && campaign.presetData && <PresetDetailsPanel campaign={campaign} isDarkMode={isDarkMode} />}
            {campaign && !campaign.presetData && <BrandDetailsPanel campaign={campaign} isDarkMode={isDarkMode} />}
            <CycleHistory cycles={cycles} />

            {/* Stage legend */}
            <div className={`rounded-xl p-3 ${
              isDarkMode
                ? 'bg-zinc-900 border border-zinc-800/60'
                : 'bg-white border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
            }`}>
              <span className={`text-[10px] uppercase tracking-wider font-semibold block mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Stages
              </span>
              <div className="space-y-1">
                {STAGES.map((s) => {
                  const stageData = currentCycle?.stages[s.name as StageName];
                  const isActive = stageData?.status === 'in-progress';
                  const isComplete = stageData?.status === 'complete';
                  return (
                    <button
                      key={s.name}
                      onClick={() => {
                        if (campaign && currentCycle) setSelectedStage(s.name as StageName);
                      }}
                      disabled={!campaign || !currentCycle}
                      className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-all ${
                        campaign && currentCycle
                          ? isDarkMode
                            ? 'hover:bg-zinc-800/80 cursor-pointer'
                            : 'hover:bg-zinc-50 cursor-pointer'
                          : 'opacity-40 cursor-not-allowed'
                      } ${
                        selectedStage === s.name
                          ? isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'
                          : ''
                      }`}
                    >
                      <span className="text-sm">{s.icon}</span>
                      <div className="flex-1 text-left">
                        <span className={`text-[11px] font-medium ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>{s.label}</span>
                      </div>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                      {isComplete && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#71717a' : '#a1a1aa'} strokeWidth="2.5">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
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
              <div className={`rounded-2xl border-2 border-dashed p-16 text-center ${
                isDarkMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'
              }`}>
                <p className={`text-sm ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  Create a campaign to begin
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive question modal */}
      {pendingQuestion && (
        <QuestionModal
          question={pendingQuestion}
          onAnswer={answerQuestion}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Research review modal */}
      {reviewingStage === 'research' && reviewFindings && (
        <ResearchReviewModal
          isOpen={true}
          findings={reviewFindings}
          isDarkMode={isDarkMode}
          onApprove={async (updatedFindings) => {
            resumeAfterReview(updatedFindings);
          }}
        />
      )}
    </div>
  );
}
