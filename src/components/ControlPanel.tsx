import { useState, useCallback } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsModal } from './SettingsModal';
import { PresetDetailsModal } from './PresetDetailsModal';
import { MakeTestPanel } from './MakeTestPanel';

export function ControlPanel() {
  const { systemStatus, currentCycle, campaign, clearCampaign } = useCampaign();
  const { isDarkMode } = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const [showTestMake, setShowTestMake] = useState(false);
  const [showPresetDetails, setShowPresetDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const isRunning = systemStatus === 'running';

  // Research stage must be complete to enable PDF export
  const canExport = campaign && currentCycle && currentCycle.stages.research.status === 'complete';

  const handleExport = useCallback(async () => {
    if (!campaign || !currentCycle || exporting) return;
    setExporting(true);
    try {
      const { exportResearchPDF } = await import('../utils/pdfExport');
      await exportResearchPDF(campaign, currentCycle);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [campaign, currentCycle, exporting]);

  return (
    <div className={`border-b ${isDarkMode ? 'border-white/[0.08]' : 'border-zinc-200'} ${isDarkMode ? 'bg-transparent' : 'bg-white'} shadow-[0_1px_3px_rgba(0,0,0,0.2)]`}>
      <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Logo / Title */}
          <div className="flex flex-col">
            <span className={`font-mono text-[11px] font-bold tracking-[0.2em] uppercase ${isDarkMode ? 'text-white' : 'text-black'}`}>
              NOMAD
            </span>
            <span className={`font-mono text-[10px] ${isDarkMode ? 'text-white/[0.15]' : 'text-zinc-400'}`}>
              v1.0
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${
              isRunning
                ? (isDarkMode ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]' : 'bg-emerald-500')
                : (isDarkMode ? 'bg-white/[0.15]' : 'bg-zinc-300')
            } ${isRunning ? 'animate-pulse' : ''}`} />
            <span className={`font-mono text-[10px] ${isDarkMode ? 'text-white/[0.30]' : 'text-zinc-500'} uppercase tracking-widest`}>
              {isRunning ? 'Running' : 'Idle'}
            </span>
          </div>

          {/* Cycle info */}
          {currentCycle && (
            <span className={`font-mono text-[10px] ${isDarkMode ? 'text-white/[0.30]' : 'text-zinc-400'} tracking-wide`}>
              CYCLE {currentCycle.cycleNumber} / {currentCycle.currentStage.toUpperCase()}
            </span>
          )}
          {campaign && (
            <span className={`font-mono text-[10px] ${isDarkMode ? 'text-white/[0.30]' : 'text-zinc-400'} uppercase tracking-wide`}>{campaign.brand}</span>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          {campaign && (
            <button
              onClick={() => clearCampaign()}
              className={`border px-4 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.15em] transition-all duration-150 ${
                isDarkMode
                  ? 'border-red-900/60 text-red-500/80 hover:border-red-700 hover:text-red-400 hover:bg-red-950/30'
                  : 'border-red-200 text-red-500 hover:border-red-400'
              }`}
              title="Kill cycle & reset campaign"
            >
              Kill
            </button>
          )}

          {canExport && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className={`border px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.15em] transition-all duration-150 ${
                exporting
                  ? (isDarkMode ? 'border-white/[0.08] text-white/[0.30] cursor-wait' : 'border-zinc-200 text-zinc-400 cursor-wait')
                  : isDarkMode
                    ? 'border-white/[0.12] text-white/[0.55] hover:border-white/[0.20] hover:text-white/[0.85]'
                    : 'border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-black'
              }`}
              title="Export research as PDF"
            >
              {exporting ? 'Exporting...' : 'PDF'}
            </button>
          )}

          {campaign?.presetData && (
            <button
              onClick={() => setShowPresetDetails(true)}
              className={`border px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.15em] transition-all duration-150 ${
                isDarkMode
                  ? 'border-purple-800 text-purple-400 hover:border-purple-600 hover:text-purple-300 hover:bg-purple-950/30'
                  : 'border-purple-300 text-purple-600 hover:border-purple-500'
              }`}
              title="View all preset details"
            >
              Details
            </button>
          )}

          <button
            onClick={() => setShowTestMake(true)}
            className={`border px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.15em] transition-all duration-150 ${
              isDarkMode
                ? 'border-blue-800 text-blue-400 hover:border-blue-600 hover:text-blue-300 hover:bg-blue-950/30'
                : 'border-blue-300 text-blue-600 hover:border-blue-500'
            }`}
            title="Test layout generation"
          >
            Test Make
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className={`border px-2.5 py-1.5 text-[10px] font-mono transition-all duration-150 ${
              isDarkMode
                ? 'border-white/[0.08] text-white/[0.30] hover:border-white/[0.15] hover:text-white/[0.55]'
                : 'border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600'
            }`}
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      {showTestMake && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDarkMode ? 'bg-black/70' : 'bg-white/70'}`}>
          <div className={`max-h-[90vh] overflow-y-auto rounded border ${isDarkMode ? 'bg-[#0f0f0f] border-white/[0.08]' : 'bg-white border-zinc-300'}`}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className={`font-mono text-sm font-bold uppercase tracking-wide ${isDarkMode ? 'text-white' : 'text-black'}`}>Test Layout Generator</h2>
              <button
                onClick={() => setShowTestMake(false)}
                className={`px-3 py-1 text-xs font-mono ${isDarkMode ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100'}`}
              >
                Close
              </button>
            </div>
            <div className="p-6 min-w-[600px]">
              <MakeTestPanel isDarkMode={isDarkMode} />
            </div>
          </div>
        </div>
      )}

      {showPresetDetails && campaign && (
        <PresetDetailsModal
          campaign={campaign}
          isDarkMode={isDarkMode}
          onClose={() => setShowPresetDetails(false)}
        />
      )}

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} isRunning={isRunning} />
    </div>
  );
}
