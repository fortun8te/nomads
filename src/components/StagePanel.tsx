import { useEffect, useRef, useState } from 'react';
import type { Cycle, StageName } from '../types';
import { useTheme } from '../context/ThemeContext';
import { ResearchOutput } from './ResearchOutput';
import { ModelOutputDebug } from './ModelOutputDebug';
import { MakeTestPanel } from './MakeTestPanel';
import { tokenTracker, type TokenInfo } from '../utils/tokenStats';

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
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>(tokenTracker.get());

  // Subscribe to live token stats
  useEffect(() => {
    return tokenTracker.subscribe(() => setTokenInfo(tokenTracker.get()));
  }, []);

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
        className={`${currentStage === 'research' ? 'p-4 min-h-[500px] max-h-[700px]' : 'p-4 h-96'} overflow-y-auto ${outputBgClass} shadow-inner ${currentStage !== 'research' ? `font-mono text-sm ${outputTextClass} leading-relaxed` : ''} space-y-2`}
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
          <>
            {currentStage === 'make' && !isRunning ? (
              <MakeTestPanel isDarkMode={isDarkMode} />
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
          </>
        )}
      </div>

      {/* Status Footer — loading / generating / processing */}
      {stageData.status === 'in-progress' && (
        <div className={`px-4 py-1.5 border-t ${borderClass} ${isDarkMode ? 'bg-[#090909]' : 'bg-zinc-50'} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className={`w-1 h-1 ${tokenInfo.isModelLoading ? (isDarkMode ? 'bg-amber-400' : 'bg-amber-500') : tokenInfo.isThinking ? (isDarkMode ? 'bg-violet-400' : 'bg-violet-500') : dotClass} rounded-full animate-slow-bounce`} />
              <div className={`w-1 h-1 ${tokenInfo.isModelLoading ? (isDarkMode ? 'bg-amber-400' : 'bg-amber-500') : tokenInfo.isThinking ? (isDarkMode ? 'bg-violet-400' : 'bg-violet-500') : dotClass} rounded-full animate-slow-bounce`} style={{animationDelay:'0.15s'}} />
              <div className={`w-1 h-1 ${tokenInfo.isModelLoading ? (isDarkMode ? 'bg-amber-400' : 'bg-amber-500') : tokenInfo.isThinking ? (isDarkMode ? 'bg-violet-400' : 'bg-violet-500') : dotClass} rounded-full animate-slow-bounce`} style={{animationDelay:'0.3s'}} />
            </div>
            <span className={`font-mono text-[10px] ${tokenInfo.isModelLoading ? (isDarkMode ? 'text-amber-400' : 'text-amber-600') : tokenInfo.isThinking ? (isDarkMode ? 'text-violet-400' : 'text-violet-600') : secondaryTextClass}`}>
              {tokenInfo.isModelLoading ? 'loading model' : tokenInfo.isThinking ? 'thinking' : tokenInfo.isGenerating ? 'generating' : 'processing'}
            </span>
          </div>

          {/* Live token stats */}
          <div className="flex items-center gap-3 font-mono text-[10px] tabular-nums">
            {/* Loading elapsed timer */}
            {tokenInfo.isModelLoading && tokenInfo.callStartTime && (
              <span className={isDarkMode ? 'text-amber-400' : 'text-amber-600'}>
                {Math.floor((Date.now() - tokenInfo.callStartTime) / 1000)}s
              </span>
            )}
            {/* Live token count while thinking or generating */}
            {(tokenInfo.isThinking || tokenInfo.isGenerating) && (
              <span className={tokenInfo.isThinking ? (isDarkMode ? 'text-violet-400' : 'text-violet-600') : (isDarkMode ? 'text-emerald-400' : 'text-emerald-600')}>
                {tokenInfo.liveTokens.toLocaleString()} tok
                {tokenInfo.tokensPerSec > 0 && (
                  <span className={secondaryTextClass}> · {tokenInfo.tokensPerSec} t/s</span>
                )}
              </span>
            )}
            {/* Session total */}
            {tokenInfo.sessionTotal > 0 && (
              <span className={secondaryTextClass}>
                {tokenInfo.sessionTotal.toLocaleString()} total
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
