import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Cycle, StageName } from '../types';
import { useTheme } from '../context/ThemeContext';
import { ResearchOutput } from './ResearchOutput';
import { ModelOutputDebug } from './ModelOutputDebug';
import { MakeTestPanel } from './MakeTestPanel';
import { tokenTracker } from '../utils/tokenStats';
import { ShineText } from './ShineText';
import { WordCycler } from './WordCycler';

/** Brand blue — #2B79FF */
const BLUE = '#2B79FF';
const blueBg = (dark: boolean) => dark ? 'rgba(43,121,255,0.12)' : 'rgba(43,121,255,0.08)';

const STAGE_INFO: Record<StageName, { label: string; description: string; icon: string }> = {
  'research':    { label: 'Research',    description: 'Market & audience analysis',     icon: 'R' },
  'brand-dna':   { label: 'Brand DNA',   description: 'Brand identity & style',         icon: 'D' },
  'persona-dna': { label: 'Persona DNA', description: 'Customer personas',              icon: 'P' },
  'angles':      { label: 'Angles',      description: 'Ad angle brainstorm',            icon: 'A' },
  'strategy':    { label: 'Strategy',    description: 'Angle evaluation',               icon: 'S' },
  'copywriting': { label: 'Copywriting', description: 'Ad messaging',                   icon: 'C' },
  'production':  { label: 'Production',  description: 'Ad generation',                  icon: 'M' },
  'test':        { label: 'Test',        description: 'Evaluation',                     icon: 'T' },
};

/** Format model string for display: "qwen3.5:35b" → "Qwen 3.5 35B" */
function formatModelName(model: string): string {
  if (!model) return '';
  const parts = model.split(':');
  const isLocal = parts[0] === 'local';
  const modelPart = isLocal ? parts.slice(1).join(':') : model;
  const [name, size] = modelPart.split(':');

  let displayName = name
    .replace(/^qwen/, 'Qwen ')
    .replace(/^gpt-oss/, 'GPT-OSS')
    .replace(/^lfm/, 'LFM ')
    .replace(/^glm-/, 'GLM-')
    .replace(/^minicpm/, 'MiniCPM');

  const displaySize = size ? ` ${size.toUpperCase()}` : '';
  const prefix = isLocal ? 'Local ' : '';

  return `${prefix}${displayName}${displaySize}`.trim();
}


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
  const tokenInfo = useSyncExternalStore(tokenTracker.subscribe, tokenTracker.getSnapshot);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
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
  if (!stageData) return null;

  const elapsed = stageData.startedAt
    ? Math.round(((stageData.completedAt || Date.now()) - stageData.startedAt) / 1000)
    : null;

  const info = STAGE_INFO[currentStage];

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  const statusLabel = stageData.status === 'in-progress' ? 'Running' : stageData.status === 'complete' ? 'Complete' : 'Pending';
  const isActive = stageData.status === 'in-progress';
  const hasTokens = tokenInfo.liveTokens > 0 || tokenInfo.sessionTotal > 0;

  return (
    <div className={`rounded-2xl overflow-hidden relative ${
      isDarkMode
        ? 'bg-zinc-900 shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)]'
        : 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)]'
    }`}>
      {/* Header */}
      <div className={`px-5 py-3.5 flex items-center justify-between ${
        isDarkMode ? 'border-b border-zinc-800/60' : 'border-b border-zinc-100'
      }`}>
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-[13px] font-semibold ${
              !isActive && stageData.status === 'complete'
                ? isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                : !isActive
                ? isDarkMode ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-50 text-zinc-300'
                : ''
            }`}
            style={isActive ? { backgroundColor: blueBg(isDarkMode), color: BLUE } : undefined}
          >
            {info.icon}
          </div>
          <div>
            <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-zinc-100' : 'text-[#414243]'}`}>{info.label}</h3>
            <p className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{info.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Live token count in header — ALWAYS visible when running */}
          {isActive && hasTokens && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg tabular-nums"
              style={{ backgroundColor: blueBg(isDarkMode) }}
            >
              <span className="text-[13px] font-bold" style={{ color: BLUE }}>
                {tokenInfo.liveTokens > 0 ? tokenInfo.liveTokens.toLocaleString() : '0'}
              </span>
              <span className="text-[9px] font-medium" style={{ color: BLUE, opacity: 0.7 }}>tok</span>
              {tokenInfo.tokensPerSec > 0 && (
                <span className="text-[10px]" style={{ color: BLUE, opacity: 0.6 }}>{tokenInfo.tokensPerSec} t/s</span>
              )}
            </div>
          )}
          {/* Status badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${
              !isActive && stageData.status === 'complete'
                ? isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                : !isActive
                ? isDarkMode ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-50 text-zinc-400'
                : ''
            }`}
            style={isActive ? { backgroundColor: blueBg(isDarkMode), color: BLUE } : undefined}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isActive ? 'animate-pulse' :
                stageData.status === 'complete' ? 'bg-emerald-500' :
                isDarkMode ? 'bg-zinc-600' : 'bg-zinc-300'
              }`}
              style={isActive ? { backgroundColor: BLUE } : undefined}
            />
            {statusLabel}
          </span>
          {elapsed !== null && (
            <span className={`text-xs font-medium tabular-nums ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {formatTime(elapsed)}
            </span>
          )}
        </div>
      </div>

      {/* Output Console — relative for sticky overlay */}
      <div className="relative">
        <div
          ref={outputRef}
          className={`${currentStage === 'research' ? 'p-5 min-h-[500px] max-h-[700px]' : 'p-5 h-96'} overflow-y-auto space-y-2 ${
            isDarkMode ? 'bg-zinc-950' : 'bg-white'
          }`}
        >
          {stageData.agentOutput ? (
            <div className="space-y-2">
              {prevStage && prevStage !== currentStage && (
                <div className={`border-l-2 pl-3 py-1 text-[11px] ${
                  isDarkMode ? 'border-zinc-700 text-zinc-500' : 'border-zinc-200 text-zinc-400'
                }`}>
                  {currentStage}
                </div>
              )}

              {currentStage === 'research' ? (
                <ResearchOutput output={stageData.agentOutput} isDarkMode={isDarkMode} />
              ) : (
                <div className={isDarkMode ? 'text-zinc-300' : 'text-[#414243]'}>
                  {stageData.agentOutput.split('\n').map((line, idx) => (
                    <div key={idx} className={`text-[13px] leading-relaxed font-medium ${
                      line.startsWith('§')
                        ? isDarkMode ? 'text-blue-400 font-semibold' : 'text-blue-600 font-semibold'
                        : ''
                    }`} style={{ lineHeight: '1.25' }}>
                      {line.startsWith('§') ? line.substring(1) : line || <span className={isDarkMode ? 'text-zinc-700' : 'text-zinc-200'}>.</span>}
                    </div>
                  ))}
                </div>
              )}

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
              {currentStage === 'production' && !isRunning ? (
                <MakeTestPanel isDarkMode={isDarkMode} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  {isRunning ? (
                    <>
                      {/* Clean shimmer bar — #2B79FF loading */}
                      <div className="w-32 h-1 rounded-full overflow-hidden" style={{ backgroundColor: isDarkMode ? 'rgba(43,121,255,0.1)' : 'rgba(43,121,255,0.08)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: '40%',
                            backgroundColor: isDarkMode ? 'rgba(43,121,255,0.5)' : 'rgba(43,121,255,0.35)',
                            animation: 'nomad-shimmer-bar 1.5s ease-in-out infinite',
                          }}
                        />
                      </div>
                      <ShineText variant={isDarkMode ? 'dark' : 'light'} className="text-[12px] font-medium" speed={4}>
                        <span style={{ color: isDarkMode ? 'rgba(43,121,255,0.7)' : 'rgba(43,121,255,0.6)' }}>Awaiting output</span>
                      </ShineText>
                    </>
                  ) : (
                    <span className={`text-[12px] font-medium ${isDarkMode ? 'text-zinc-600' : 'text-zinc-300'}`}>No output yet</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Sticky Floating Token Counter — always visible during generation ── */}
        {isActive && (tokenInfo.isGenerating || tokenInfo.isThinking || tokenInfo.isModelLoading) && (
          <div className="absolute bottom-3 right-3 z-10">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl backdrop-blur-lg shadow-lg tabular-nums ${
              isDarkMode ? 'bg-zinc-900/90 border border-zinc-700' : 'bg-white/90 border border-zinc-200'
            }`}>
              {/* Animated dot */}
              <span className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: tokenInfo.isModelLoading ? '#d97706' : tokenInfo.isThinking ? '#7c3aed' : BLUE }}
              />
              {/* Status */}
              <span className="text-[11px] font-semibold"
                style={{ color: tokenInfo.isModelLoading ? '#d97706' : tokenInfo.isThinking ? '#7c3aed' : BLUE }}
              >
                {tokenInfo.isModelLoading ? 'Loading' :
                 tokenInfo.isThinking ? 'Thinking' :
                 'Generating'}
              </span>
              {/* Token count */}
              {tokenInfo.liveTokens > 0 && (
                <>
                  <span className={`text-[10px] ${isDarkMode ? 'text-zinc-600' : 'text-zinc-300'}`}>|</span>
                  <span className={`text-[12px] font-bold ${isDarkMode ? 'text-zinc-200' : 'text-[#414243]'}`}>{tokenInfo.liveTokens.toLocaleString()}</span>
                  <span className={`text-[9px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>tok</span>
                </>
              )}
              {/* Speed */}
              {tokenInfo.tokensPerSec > 0 && (
                <span className={`text-[10px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{tokenInfo.tokensPerSec} t/s</span>
              )}
              {/* Model */}
              {tokenInfo.activeModel && (
                <>
                  <span className={`text-[10px] ${isDarkMode ? 'text-zinc-600' : 'text-zinc-300'}`}>|</span>
                  <span className={`text-[10px] font-mono ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{formatModelName(tokenInfo.activeModel)}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Live Activity Bar — shows whenever stage is in-progress ── */}
      {isActive && (
        <div className={`px-5 py-3 flex items-center justify-between border-t ${
          isDarkMode ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-100 bg-white'
        }`}>
          {/* Left: Status + Model */}
          <div className="flex items-center gap-3">
            {/* Pulsing status dot */}
            <div className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor:
                tokenInfo.isModelLoading ? '#d97706' :
                tokenInfo.isThinking ? '#7c3aed' :
                tokenInfo.isGenerating ? BLUE :
                isDarkMode ? '#52525b' : '#d4d4d8'
              }}
            />

            {/* Status label */}
            {tokenInfo.isModelLoading ? (
              <WordCycler
                prefix="Loading"
                words={['model', 'weights', 'context', 'layers', 'model']}
                color="#d97706"
                speed={3}
                className="text-[13px] font-medium"
              />
            ) : (
              <span className="text-[13px] font-medium"
                style={{ color:
                  tokenInfo.isThinking ? '#7c3aed' :
                  tokenInfo.isGenerating ? BLUE :
                  isDarkMode ? '#71717a' : '#a1a1aa'
                }}
              >
                {tokenInfo.isThinking ? 'Thinking' : tokenInfo.isGenerating ? 'Generating' : 'Processing'}
              </span>
            )}

            {/* Model name pill — full formatted name */}
            {tokenInfo.activeModel && (
              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono ${
                isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'
              }`}>
                {formatModelName(tokenInfo.activeModel)}
              </span>
            )}

            {/* Loading timer */}
            {tokenInfo.isModelLoading && tokenInfo.callStartTime && (
              <span className="text-[11px] tabular-nums text-amber-600/70">
                {Math.floor((Date.now() - tokenInfo.callStartTime) / 1000)}s
              </span>
            )}
          </div>

          {/* Right: Token metrics — ALWAYS show full metrics when in-progress */}
          <div className="flex items-center gap-3 tabular-nums">
            {/* Live token count — show even when 0 */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold"
                style={{ color:
                  tokenInfo.isThinking ? '#7c3aed' :
                  tokenInfo.isGenerating ? BLUE :
                  tokenInfo.isModelLoading ? '#d97706' :
                  isDarkMode ? '#71717a' : '#a1a1aa'
                }}
              >
                {tokenInfo.liveTokens.toLocaleString()}
              </span>
              <span className="text-[10px] text-zinc-400">tok</span>
              {tokenInfo.tokensPerSec > 0 && (
                <span className="text-[11px] text-zinc-400">
                  {tokenInfo.tokensPerSec} t/s
                </span>
              )}
            </div>

            {/* Separator */}
            {tokenInfo.sessionTotal > 0 && (
              <span className={`text-[10px] ${isDarkMode ? 'text-zinc-700' : 'text-zinc-200'}`}>|</span>
            )}

            {/* Session total */}
            {tokenInfo.sessionTotal > 0 && (
              <span className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {tokenInfo.sessionTotal.toLocaleString()} total
              </span>
            )}

            {/* Call count */}
            {tokenInfo.callCount > 0 && (
              <span className={`text-[10px] ${isDarkMode ? 'text-zinc-600' : 'text-zinc-300'}`}>
                #{tokenInfo.callCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Session Summary Bar — shows when complete (not running) ── */}
      {!isActive && stageData.status === 'complete' && tokenInfo.sessionTotal > 0 && (
        <div className={`px-5 py-2.5 flex items-center justify-between border-t ${
          isDarkMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-100 bg-zinc-50/50'
        }`}>
          <span className={`text-[11px] font-medium ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Session</span>
          <div className="flex items-center gap-3 tabular-nums">
            <span className={`text-[11px] font-medium ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {tokenInfo.sessionTotal.toLocaleString()} tokens
            </span>
            {tokenInfo.callCount > 0 && (
              <span className={`text-[10px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {tokenInfo.callCount} calls
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
