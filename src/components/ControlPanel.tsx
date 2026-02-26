import { useState } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { SettingsModal } from './SettingsModal';

export function ControlPanel() {
  const { systemStatus, currentCycle, campaign, startCycle, pauseCycle, resumeCycle } = useCampaign();
  const { isDarkMode } = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const isRunning = systemStatus === 'running';
  const isPaused = systemStatus === 'paused';

  const bgClass = isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white';
  const borderClass = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const textClass = isDarkMode ? 'text-white' : 'text-black';
  const secondaryTextClass = isDarkMode ? 'text-zinc-500' : 'text-zinc-600';
  const statusDotClass = isRunning ? (isDarkMode ? 'bg-white' : 'bg-black') : (isDarkMode ? 'bg-zinc-700' : 'bg-zinc-300');

  return (
    <div className={`border-b ${borderClass} ${bgClass}`}>
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className={`font-mono text-xs font-bold tracking-widest uppercase ${textClass}`}>
            AD CREATIVE AGENT
          </span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 ${statusDotClass} ${isRunning ? 'animate-pulse' : ''}`} />
            <span className={`font-mono text-xs ${secondaryTextClass} uppercase tracking-wider`}>
              {isRunning ? 'Running' : isPaused ? 'Paused' : 'Idle'}
            </span>
          </div>
          {currentCycle && (
            <span className={`font-mono text-xs ${secondaryTextClass}`}>
              CYCLE {currentCycle.cycleNumber} / {currentCycle.currentStage.toUpperCase()}
            </span>
          )}
          {campaign && (
            <span className={`font-mono text-xs ${secondaryTextClass} uppercase`}>{campaign.brand}</span>
          )}
        </div>

        <div className="flex gap-2">
          {!isRunning && !isPaused && (
            <button
              onClick={startCycle}
              className={`border px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-widest transition-colors ${
                isDarkMode
                  ? 'border-zinc-700 text-white hover:border-white hover:bg-white hover:text-black'
                  : 'border-zinc-300 text-black hover:border-black hover:bg-black hover:text-white'
              }`}
            >
              Start
            </button>
          )}
          {isRunning && (
            <button
              onClick={pauseCycle}
              className={`border px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-widest transition-colors ${
                isDarkMode
                  ? 'border-zinc-700 text-white hover:border-white'
                  : 'border-zinc-300 text-black hover:border-black'
              }`}
            >
              Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={resumeCycle}
              className={`px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-widest transition-colors ${
                isDarkMode
                  ? 'bg-white text-black hover:bg-zinc-200'
                  : 'bg-black text-white hover:bg-zinc-800'
              }`}
            >
              Resume
            </button>
          )}

          <button
            onClick={() => setShowSettings(true)}
            className={`border px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-widest transition-colors ${
              isDarkMode
                ? 'border-zinc-700 text-white hover:border-white'
                : 'border-zinc-300 text-black hover:border-black'
            }`}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
