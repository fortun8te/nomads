/**
 * AppShell — Top-level layout with navigation
 *
 * Three views:
 * - Make (default) — SaaS-style creative tool
 * - Research — Full pipeline view (old Dashboard)
 * - Test — Evaluation results
 *
 * Navigation is clean, minimal — matches the Creatify-style look.
 */

import { useState, useCallback } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { MakeStudio } from './MakeStudio';
import { Dashboard } from './Dashboard';
import { SettingsModal } from './SettingsModal';
import { NomadIcon } from './NomadIcon';
import { ShineText } from './ShineText';

export type AppView = 'make' | 'research' | 'test';

export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>('make');
  const [showSettings, setShowSettings] = useState(false);
  const { systemStatus, currentCycle, campaign } = useCampaign() as any;
  const { startCycle, pauseCycle, resumeCycle, stopCycle, clearCampaign } = useCampaign() as any;

  const isRunning = systemStatus === 'running';
  const isPaused = systemStatus === 'paused';

  const handleStartPipeline = useCallback(() => {
    if (campaign) {
      startCycle();
    }
  }, [campaign, startCycle]);

  // Status color
  const statusColor = isRunning ? 'bg-emerald-500' : isPaused ? 'bg-amber-500' : 'bg-zinc-300';

  // Research stage status for badge
  const researchStatus = currentCycle?.stages?.research?.status;
  const tasteStatus = currentCycle?.stages?.taste?.status;
  const makeStatus = currentCycle?.stages?.make?.status;
  const testStatus = currentCycle?.stages?.test?.status;

  const getStageBadge = (status: string | undefined) => {
    if (!status || status === 'pending') return null;
    if (status === 'complete') return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />;
    if (status === 'in-progress') return <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />;
    return null;
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Top Navigation Bar ── */}
      <nav className="bg-white border-b border-zinc-200 px-6 py-0 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14">
          {/* Left: Logo + Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <NomadIcon size={20} animated={isRunning} className="text-zinc-900" />
              <span className="text-sm font-bold tracking-wide text-zinc-900">NOMAD</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${statusColor} ${isRunning ? 'animate-pulse' : ''}`} />
              <span className="text-xs text-zinc-400 uppercase tracking-wider">
                {isRunning ? (
                  <ShineText className="text-xs uppercase tracking-wider" speed={2.5}>Running</ShineText>
                ) : isPaused ? 'Paused' : 'Idle'}
              </span>
            </div>
            {campaign && (
              <span className="text-xs text-zinc-400">{campaign.brand}</span>
            )}
          </div>

          {/* Center: View Tabs */}
          <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
            {([
              { key: 'research' as AppView, label: 'Research', badge: researchStatus || tasteStatus },
              { key: 'make' as AppView, label: 'Make', badge: makeStatus },
              { key: 'test' as AppView, label: 'Test', badge: testStatus },
            ]).map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setActiveView(key)}
                className={`relative flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeView === key
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {getStageBadge(badge)}
                {label}
              </button>
            ))}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Pipeline controls */}
            {!isRunning && !isPaused && campaign && (
              <button
                onClick={handleStartPipeline}
                className="px-3.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg hover:bg-zinc-800 transition-all"
              >
                Run Pipeline
              </button>
            )}
            {isRunning && (
              <button
                onClick={() => pauseCycle()}
                className="px-3 py-1.5 border border-zinc-200 text-zinc-600 text-xs font-medium rounded-lg hover:border-zinc-300 hover:text-zinc-800 transition-all"
              >
                Pause
              </button>
            )}
            {isPaused && (
              <>
                <button
                  onClick={() => resumeCycle()}
                  className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg hover:bg-zinc-800 transition-all"
                >
                  Resume
                </button>
                <button
                  onClick={() => stopCycle()}
                  className="px-3 py-1.5 border border-red-200 text-red-500 text-xs font-medium rounded-lg hover:border-red-300 transition-all"
                >
                  Stop
                </button>
              </>
            )}

            {campaign && (
              <button
                onClick={() => clearCampaign()}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-red-500 transition-colors"
                title="Reset campaign"
              >
                Reset
              </button>
            )}

            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all"
              title="Settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ── View Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeView === 'make' && <MakeStudio />}
        {activeView === 'research' && <Dashboard embedded />}
        {activeView === 'test' && <TestView />}
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} isRunning={isRunning} />
    </div>
  );
}

// ── Test View (placeholder for now) ──

function TestView() {
  const { currentCycle } = useCampaign();
  const testOutput = currentCycle?.stages?.test?.agentOutput;
  const testComplete = currentCycle?.stages?.test?.status === 'complete';

  return (
    <div className="h-full bg-[#f7f7f8] flex items-center justify-center p-8 overflow-y-auto">
      {testComplete && testOutput ? (
        <div className="max-w-3xl w-full bg-white rounded-2xl shadow-sm border border-zinc-100 p-8">
          <h2 className="text-lg font-semibold text-zinc-800 mb-4">Test Results</h2>
          <div className="font-mono text-xs text-zinc-600 whitespace-pre-wrap leading-relaxed">
            {testOutput}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white shadow-sm border border-dashed border-zinc-200 flex items-center justify-center mb-4">
            <NomadIcon size={24} className="text-zinc-300" />
          </div>
          <p className="text-sm text-zinc-500">No test results yet</p>
          <p className="text-xs text-zinc-400 mt-1">Run the full pipeline to evaluate ad concepts</p>
        </div>
      )}
    </div>
  );
}
