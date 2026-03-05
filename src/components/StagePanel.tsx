import { useEffect, useRef, useState } from 'react';
import type { Cycle, StageName } from '../types';
import { useTheme } from '../context/ThemeContext';
import { ResearchOutput } from './ResearchOutput';
import { ModelOutputDebug } from './ModelOutputDebug';

const STAGE_DESCRIPTIONS: Record<StageName, string> = {
  research: 'Market & audience research',
  objections: 'Objection handling strategy',
  taste: 'Creative direction & positioning',
  make: 'Ad creative generation',
  test: 'Creative evaluation',
  memories: 'Pattern & insights archive',
};


interface StagePanelProps {
  cycle: Cycle | null;
  isRunning?: boolean;
  isDarkMode?: boolean;
  viewStage?: StageName | null;
  onUpdateOutput?: (stageName: StageName, output: string) => void;
  onPauseForInput?: (event: any) => Promise<string>;
}

export function StagePanel({ cycle, isRunning, isDarkMode: propDarkMode, viewStage }: StagePanelProps) {
  const { isDarkMode: themeDarkMode } = useTheme();
  const isDarkMode = propDarkMode !== undefined ? propDarkMode : themeDarkMode;
  const outputRef = useRef<HTMLDivElement>(null);
  const [prevStage, setPrevStage] = useState<StageName | null>(null);
  const [, setTick] = useState(0);

  // Tick every second to update elapsed timer
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [cycle?.stages[cycle?.currentStage || 'research']?.agentOutput]);

  useEffect(() => {
    if (cycle && cycle.currentStage !== prevStage && prevStage !== null) {
      setPrevStage(cycle.currentStage);
    } else if (cycle && !prevStage) {
      setPrevStage(cycle.currentStage);
    }
  }, [cycle?.currentStage, prevStage]);

  if (!cycle) return null;

  const currentStage = viewStage || cycle.currentStage;
  const stageData = cycle.stages[currentStage];
  // Use completedAt for finished stages so the timer stops ticking
  const elapsed = stageData.startedAt
    ? Math.round(((stageData.completedAt || Date.now()) - stageData.startedAt) / 1000)
    : null;

  const borderClass = isDarkMode ? 'border-zinc-800/70' : 'border-zinc-200';
  const outputBgClass = isDarkMode ? 'bg-[#0b0b0b]' : 'bg-zinc-50';
  const textClass = isDarkMode ? 'text-white' : 'text-black';
  const secondaryTextClass = isDarkMode ? 'text-zinc-600' : 'text-zinc-500';
  const outputTextClass = isDarkMode ? 'text-zinc-300' : 'text-zinc-800';
  const placeholderTextClass = isDarkMode ? 'text-zinc-700' : 'text-zinc-300';

  const statusColor = stageData.status === 'in-progress'
    ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600')
    : stageData.status === 'complete'
      ? (isDarkMode ? 'text-zinc-500' : 'text-zinc-500')
      : (isDarkMode ? 'text-zinc-700' : 'text-zinc-400');

  const statusDotClass = stageData.status === 'in-progress'
    ? (isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500')
    : stageData.status === 'complete'
      ? (isDarkMode ? 'bg-zinc-600' : 'bg-zinc-400')
      : (isDarkMode ? 'bg-zinc-800' : 'bg-zinc-200');

  const dotClass = isDarkMode ? 'bg-zinc-500' : 'bg-zinc-400';

  // Format elapsed time nicely
  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  return (
    <div className={`border ${borderClass}`}>
      {/* Header */}
      <div className={`border-b ${borderClass} px-4 py-2.5 flex items-center justify-between ${isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
        <div className="flex items-center gap-4">
          <div>
            <h3 className={`font-mono font-bold text-sm uppercase tracking-tight ${textClass}`}>{currentStage}</h3>
            <p className={`font-mono text-[10px] ${secondaryTextClass} mt-0.5`}>{STAGE_DESCRIPTIONS[currentStage]}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDotClass} ${stageData.status === 'in-progress' ? 'animate-pulse' : ''}`} />
            <span className={`font-mono text-[10px] uppercase tracking-wider ${statusColor}`}>
              {stageData.status}
            </span>
          </div>
        </div>
        {elapsed !== null && (
          <span className={`font-mono text-xs font-medium tabular-nums ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
            {formatTime(elapsed)}
          </span>
        )}
      </div>

      {/* Output Console */}
      <div
        ref={outputRef}
        className={`${currentStage === 'research' ? 'p-3 min-h-96 max-h-[600px]' : 'p-4 h-96'} overflow-y-auto ${outputBgClass} shadow-inner ${currentStage !== 'research' ? `font-mono text-sm ${outputTextClass} leading-relaxed` : ''} space-y-2`}
      >
        {stageData.agentOutput ? (
          <div className="space-y-2">
            {/* Stage transition message */}
            {prevStage && prevStage !== currentStage && (
              <div className={`border-l-2 ${isDarkMode ? 'border-zinc-600' : 'border-zinc-400'} pl-2 py-1 text-[10px] font-mono ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                {currentStage}
              </div>
            )}

            {/* Main output with better formatting */}
            {currentStage === 'research' ? (
              <ResearchOutput output={stageData.agentOutput} isDarkMode={isDarkMode} />
            ) : (
              <div className={`${isDarkMode ? 'text-zinc-300' : 'text-zinc-800'}`}>
                {stageData.agentOutput.split('\n').map((line, idx) => (
                  <div key={idx} className={`text-xs leading-relaxed ${line.startsWith('§') ? `${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'} font-semibold` : ''}`}>
                    {line.startsWith('§') ? line.substring(1) : line || <span className={placeholderTextClass}>.</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Model output debug info */}
            <ModelOutputDebug
              rawOutput={stageData.rawOutput}
              model={stageData.model}
              tokensUsed={stageData.tokensUsed}
              processingTime={stageData.processingTime}
              stageName={currentStage}
            />
          </div>
        ) : (
          <div className={`${placeholderTextClass} flex items-center justify-center h-full`}>
            {isRunning ? (
              <div className="flex items-center gap-2.5 text-[10px] font-mono">
                <div className="flex gap-1">
                  <div className={`w-1.5 h-1.5 ${dotClass} rounded-full animate-slow-bounce`} />
                  <div className={`w-1.5 h-1.5 ${dotClass} rounded-full animate-slow-bounce`} style={{animationDelay:'0.15s'}} />
                  <div className={`w-1.5 h-1.5 ${dotClass} rounded-full animate-slow-bounce`} style={{animationDelay:'0.3s'}} />
                </div>
                <span className={secondaryTextClass}>awaiting output</span>
              </div>
            ) : (
              <span className={`font-mono text-[10px] ${isDarkMode ? 'text-zinc-800' : 'text-zinc-300'}`}>no output yet</span>
            )}
          </div>
        )}
      </div>

      {/* Status Footer */}
      {stageData.status === 'in-progress' && (
        <div className={`px-4 py-1.5 border-t ${borderClass} ${isDarkMode ? 'bg-[#090909]' : 'bg-zinc-50'} flex items-center gap-2`}>
          <div className="flex gap-1">
            <div className={`w-1 h-1 ${dotClass} rounded-full animate-slow-bounce`} />
            <div className={`w-1 h-1 ${dotClass} rounded-full animate-slow-bounce`} style={{animationDelay:'0.15s'}} />
            <div className={`w-1 h-1 ${dotClass} rounded-full animate-slow-bounce`} style={{animationDelay:'0.3s'}} />
          </div>
          <span className={`font-mono text-[10px] ${secondaryTextClass}`}>processing</span>
        </div>
      )}
    </div>
  );
}
