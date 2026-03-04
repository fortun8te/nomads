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
  onUpdateOutput?: (stageName: StageName, output: string) => void;
  onPauseForInput?: (event: any) => Promise<string>;
}

export function StagePanel({ cycle, isRunning, isDarkMode: propDarkMode }: StagePanelProps) {
  const { isDarkMode: themeDarkMode } = useTheme();
  const isDarkMode = propDarkMode !== undefined ? propDarkMode : themeDarkMode;
  const outputRef = useRef<HTMLDivElement>(null);
  const [prevStage, setPrevStage] = useState<StageName | null>(null);

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

  const currentStage = cycle.currentStage;
  const stageData = cycle.stages[currentStage];
  const elapsed = stageData.startedAt
    ? Math.round((Date.now() - stageData.startedAt) / 1000)
    : null;

  const borderClass = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const bgClass = isDarkMode ? 'bg-[#0a0a0a]' : 'bg-white';
  const outputBgClass = isDarkMode ? 'bg-[#0d0d0d]' : 'bg-zinc-50';
  const textClass = isDarkMode ? 'text-white' : 'text-black';
  const secondaryTextClass = isDarkMode ? 'text-zinc-500' : 'text-zinc-600';
  const outputTextClass = isDarkMode ? 'text-zinc-200' : 'text-zinc-900';
  const placeholderTextClass = isDarkMode ? 'text-zinc-700' : 'text-zinc-300';
  const statusDotClass = stageData.status === 'in-progress'
    ? (isDarkMode ? 'bg-white' : 'bg-black')
    : stageData.status === 'complete'
      ? (isDarkMode ? 'bg-zinc-600' : 'bg-zinc-400')
      : (isDarkMode ? 'bg-zinc-800' : 'bg-zinc-200');
  const bounceDotClass = isDarkMode ? 'bg-white' : 'bg-black';

  return (
    <div className={`border ${borderClass}`}>
      {/* Header */}
      <div className={`border-b ${borderClass} px-4 py-2.5 flex items-center justify-between ${bgClass}`}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h3 className={`font-bold text-base uppercase tracking-tight ${textClass}`}>{currentStage}</h3>
            <p className={`font-mono text-xs ${secondaryTextClass} mt-0.5`}>{STAGE_DESCRIPTIONS[currentStage]}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 ${statusDotClass} ${stageData.status === 'in-progress' ? 'animate-pulse' : ''}`} />
            <span className={`font-mono text-xs uppercase tracking-wider ${secondaryTextClass}`}>
              {stageData.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {elapsed !== null && (
            <span className={`font-mono text-xs ${secondaryTextClass}`}>{elapsed}s</span>
          )}
          {stageData.completedAt && (
            <span className={`font-mono text-xs ${secondaryTextClass}`}>
              {Math.round((stageData.completedAt - (stageData.startedAt || 0)) / 1000)}s
            </span>
          )}
        </div>
      </div>

      {/* Output Console */}
      <div
        ref={outputRef}
        className={`p-4 h-96 overflow-y-auto ${outputBgClass} font-mono text-sm ${outputTextClass} leading-relaxed space-y-2`}
      >
        {stageData.agentOutput ? (
          <div className="space-y-2">
            {/* Stage transition message */}
            {prevStage && prevStage !== currentStage && (
              <div className={`border-l-2 ${isDarkMode ? 'border-blue-600' : 'border-blue-400'} pl-2 py-1 text-xs ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                → {currentStage}
              </div>
            )}

            {/* Main output with better formatting */}
            {currentStage === 'research' ? (
              <ResearchOutput output={stageData.agentOutput} isDarkMode={isDarkMode} />
            ) : (
              <div className={`${isDarkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>
                {stageData.agentOutput.split('\n').map((line, idx) => (
                  <div key={idx} className={`text-xs ${line.startsWith('§') ? `${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'} font-semibold` : ''}`}>
                    {line.startsWith('§') ? line.substring(1) : line || <span className={placeholderTextClass}>.</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Model output debug info - always show if there's metadata or during processing */}
            <ModelOutputDebug
              rawOutput={stageData.rawOutput}
              model={stageData.model}
              tokensUsed={stageData.tokensUsed}
              processingTime={stageData.processingTime}
              stageName={currentStage}
            />
          </div>
        ) : (
          <span className={placeholderTextClass}>
            {isRunning ? (
              <div className="flex items-center gap-2 text-xs">
                <div className="flex gap-1">
                  <div className={`w-1 h-1 ${bounceDotClass} rounded-full animate-bounce`} />
                  <div className={`w-1 h-1 ${bounceDotClass} rounded-full animate-bounce`} style={{animationDelay:'0.1s'}} />
                  <div className={`w-1 h-1 ${bounceDotClass} rounded-full animate-bounce`} style={{animationDelay:'0.2s'}} />
                </div>
                <span>awaiting output</span>
              </div>
            ) : (
              '_ no output yet'
            )}
          </span>
        )}
      </div>

      {/* Status Footer */}
      {stageData.status === 'in-progress' && (
        <div className={`px-4 py-2 border-t ${borderClass} flex items-center gap-2`}>
          <div className="flex gap-1">
            <div className={`w-1 h-1 ${bounceDotClass} rounded-full animate-bounce`} />
            <div className={`w-1 h-1 ${bounceDotClass} rounded-full animate-bounce`} style={{animationDelay:'0.1s'}} />
            <div className={`w-1 h-1 ${bounceDotClass} rounded-full animate-bounce`} style={{animationDelay:'0.2s'}} />
          </div>
          <span className={`font-mono text-xs ${secondaryTextClass}`}>processing</span>
        </div>
      )}
    </div>
  );
}
