import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Cycle, StageName } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useCampaign } from '../context/CampaignContext';
import { ResearchOutput } from './ResearchOutput';
import { ModelOutputDebug } from './ModelOutputDebug';
import { MakeTestPanel } from './MakeTestPanel';
import { TestResultsPanel } from './TestResultsPanel';
import { tokenTracker } from '../utils/tokenStats';
import { ShineText } from './ShineText';

const STAGE_LABELS: Record<StageName, string> = {
  'research':    'Research',
  'brand-dna':   'Brand DNA',
  'persona-dna': 'Persona DNA',
  'angles':      'Angles',
  'strategy':    'Strategy',
  'copywriting': 'Copywriting',
  'production':  'Production',
  'test':        'Test',
};

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

function formatTime(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

interface StagePanelProps {
  cycle: Cycle | null;
  isRunning?: boolean;
  isDarkMode?: boolean;
  viewStage?: StageName | null;
}

export function StagePanel({ cycle, isRunning, isDarkMode: propDarkMode, viewStage }: StagePanelProps) {
  const { isDarkMode: themeDarkMode } = useTheme();
  const { campaign } = useCampaign();
  const isDark = propDarkMode !== undefined ? propDarkMode : themeDarkMode;
  const outputRef = useRef<HTMLDivElement>(null);
  const thinkRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [thinkExpanded, setThinkExpanded] = useState(true);
  const [exporting, setExporting] = useState(false);
  const tokenInfo = useSyncExternalStore(tokenTracker.subscribe, tokenTracker.getSnapshot);

  const handleExportPDF = useCallback(async () => {
    if (!campaign || !cycle || exporting) return;
    setExporting(true);
    try {
      const { exportResearchPDF } = await import('../utils/pdfExport');
      await exportResearchPDF(campaign, cycle);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [campaign, cycle, exporting]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [cycle?.stages[cycle?.currentStage || 'research']?.agentOutput]);

  // Auto-scroll the think panel to bottom when new tokens arrive
  useEffect(() => {
    if (thinkExpanded && thinkRef.current) {
      thinkRef.current.scrollTop = thinkRef.current.scrollHeight;
    }
  }, [tokenInfo.liveThinkSnippet, tokenInfo.liveResponseSnippet, thinkExpanded]);

  // Auto-expand when stage starts, collapse when stage completes
  const wasStageActiveRef = useRef(false);
  const stageStatus = cycle?.stages[viewStage || cycle?.currentStage || 'research']?.status;
  const stageIsActive = stageStatus === 'in-progress';
  useEffect(() => {
    if (stageIsActive && !wasStageActiveRef.current) {
      setThinkExpanded(true);
    }
    if (!stageIsActive && wasStageActiveRef.current) {
      const t = setTimeout(() => setThinkExpanded(false), 2000);
      return () => clearTimeout(t);
    }
    wasStageActiveRef.current = stageIsActive;
  }, [stageIsActive]);

  if (!cycle) return null;

  const currentStage = viewStage || cycle.currentStage;
  const stageData = cycle.stages[currentStage];
  if (!stageData) return null;

  const elapsed = stageData.startedAt
    ? Math.round(((stageData.completedAt || Date.now()) - stageData.startedAt) / 1000)
    : null;

  const isActive = stageData.status === 'in-progress';
  const isComplete = stageData.status === 'complete';

  // Token state
  const hasActivity = tokenInfo.isGenerating || tokenInfo.isThinking || tokenInfo.isModelLoading;
  const tokenColor = tokenInfo.isModelLoading ? '#d97706' : tokenInfo.isThinking ? '#2B79FF' : '#2B79FF';
  const tokenLabel = tokenInfo.isModelLoading ? 'Loading' : tokenInfo.isThinking ? 'Thinking' : 'Generating';

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Stage header ── */}
      <div className={`flex-shrink-0 flex items-center gap-3 px-5 py-2.5 border-b ${
        isDark ? 'border-white/[0.08] bg-[#0f0f0f]' : 'border-zinc-200 bg-white'
      }`}>
        {/* Stage name */}
        <h2 className={`text-[13px] font-semibold ${isDark ? 'text-white/[0.85]' : 'text-zinc-900'}`}>
          {STAGE_LABELS[currentStage]}
        </h2>

        {/* Status pill */}
        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
          isActive
            ? isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
            : isComplete
            ? isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
            : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            isActive ? 'animate-pulse bg-blue-400' :
            isComplete ? 'bg-emerald-500' :
            isDark ? 'bg-zinc-700' : 'bg-zinc-300'
          }`} />
          {isActive ? 'Running' : isComplete ? 'Complete' : 'Pending'}
        </span>

        {elapsed !== null && (
          <span className={`text-[11px] tabular-nums ${isDark ? 'text-white/[0.30]' : 'text-zinc-400'}`}>
            {formatTime(elapsed)}
          </span>
        )}

        {/* PDF export — only shown when research is complete */}
        {currentStage === 'research' && isComplete && campaign && (
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            title="Export research PDF"
            className={`ml-1 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-all ${
              isDark
                ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
                : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
            } ${exporting ? 'opacity-50 cursor-wait' : ''}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? 'Exporting…' : 'PDF'}
          </button>
        )}

        {/* Live token badge in header (only when active) */}
        {isActive && tokenInfo.liveTokens > 0 && (
          <div className="ml-auto flex items-center gap-1.5 tabular-nums">
            <span className="text-[12px] font-semibold" style={{ color: tokenColor }}>
              {tokenInfo.liveTokens.toLocaleString()}
            </span>
            <span className={`text-[9px] ${isDark ? 'text-white/[0.30]' : 'text-zinc-400'}`}>tok</span>
            {tokenInfo.tokensPerSec > 0 && (
              <span className="text-[10px]" style={{ color: tokenColor, opacity: 0.6 }}>{tokenInfo.tokensPerSec} t/s</span>
            )}
          </div>
        )}
      </div>

      {/* ── Think mode panel ── live raw token stream, collapsible ── */}
      {isActive && (
        <div className={`flex-shrink-0 border-b ${isDark ? 'border-white/[0.08] bg-[#0c0c0c]' : 'border-zinc-200 bg-zinc-50'}`}>
          {/* think panel header */}
          <button
            onClick={() => setThinkExpanded(e => !e)}
            className={`w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors group ${
              isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-zinc-100/60'
            }`}
          >
            <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">
              {tokenInfo.isThinking ? (
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#2B79FF' }} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#d4d4d8' }} />
              )}
            </span>
            <span className="text-[10px] font-medium flex-1 truncate" style={{
              color: tokenInfo.isThinking ? '#2B79FF' : tokenInfo.isModelLoading ? '#d97706' : hasActivity ? (isDark ? 'rgba(255,255,255,0.30)' : '#71717a') : isDark ? '#3f3f46' : '#a1a1aa'
            }}>
              {tokenInfo.isModelLoading
                ? `Loading ${formatModelName(tokenInfo.activeModel)}…`
                : tokenInfo.isThinking
                ? (tokenInfo.liveThinkSnippet.slice(-80).split('\n').at(-1) || 'Thinking…')
                : tokenInfo.isGenerating
                ? (tokenInfo.liveResponseSnippet.slice(-80).split('\n').at(-1) || 'Generating…')
                : tokenInfo.callCount > 0
                ? `${tokenInfo.sessionTotal.toLocaleString()} tokens · ${tokenInfo.callCount} calls`
                : 'Waiting for model…'}
            </span>
            <svg
              width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              className={`flex-shrink-0 transition-transform duration-150 opacity-30 group-hover:opacity-60 ${thinkExpanded ? '' : '-rotate-90'}`}
              style={{ color: isDark ? '#71717a' : '#a1a1aa' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* think panel body */}
          {thinkExpanded && (
            <div
              ref={thinkRef}
              className="overflow-y-auto px-4 pb-3"
              style={{ maxHeight: 160 }}
            >
              {tokenInfo.liveThinkSnippet && (
                <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-words" style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: isDark ? '#1D6AE5' : '#2B79FF',
                  opacity: 0.7,
                }}>
                  {tokenInfo.liveThinkSnippet}
                </pre>
              )}
              {tokenInfo.liveResponseSnippet && (
                <pre className={`text-[10px] leading-relaxed whitespace-pre-wrap break-words mt-1 ${
                  tokenInfo.liveThinkSnippet ? 'border-t border-white/[0.08] pt-1' : ''
                }`} style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: isDark ? '#a1a1aa' : '#71717a',
                  opacity: 0.8,
                }}>
                  {tokenInfo.liveResponseSnippet}
                </pre>
              )}
              {!tokenInfo.liveThinkSnippet && !tokenInfo.liveResponseSnippet && !hasActivity && tokenInfo.callCount > 0 && (
                <div className="flex items-center gap-3 py-1">
                  <span className="text-[10px]" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: isDark ? 'rgba(255,255,255,0.30)' : '#a1a1aa' }}>
                    {tokenInfo.sessionTotal.toLocaleString()} total tokens · {tokenInfo.callCount} LLM calls · {tokenInfo.activeModel && `last: ${formatModelName(tokenInfo.activeModel)}`}
                  </span>
                </div>
              )}
              {!tokenInfo.liveThinkSnippet && !tokenInfo.liveResponseSnippet && !hasActivity && tokenInfo.callCount === 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#d4d4d8' }} />
                  <span className="text-[10px]" style={{ color: isDark ? '#3f3f46' : '#a1a1aa' }}>Preparing…</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Output area ── */}
      {stageData.agentOutput ? (
        currentStage === 'research' ? (
          /* Research gets the full-height Manus two-column layout — no padding wrapper */
          <div className={`flex-1 min-h-0 ${isDark ? 'bg-transparent' : 'bg-zinc-50'}`}>
            <ResearchOutput output={stageData.agentOutput} isDarkMode={isDark} />
          </div>
        ) : (
          /* Other stages keep the scrolling wrapper */
          <div ref={outputRef} className={`flex-1 overflow-y-auto min-h-0 ${isDark ? 'bg-transparent' : 'bg-zinc-50'}`}>
            <div className="px-5 py-4 max-w-3xl">
              <div className={isDark ? 'text-white/[0.55]' : 'text-zinc-700'}>
                {stageData.agentOutput.split('\n').map((line, idx) => (
                  <div key={idx} className={`text-[13px] leading-relaxed ${
                    line.startsWith('§')
                      ? isDark ? 'text-blue-400 font-semibold' : 'text-blue-600 font-semibold'
                      : ''
                  }`} style={{ lineHeight: '1.6' }}>
                    {line.startsWith('§') ? line.substring(1) : line || <span>&nbsp;</span>}
                  </div>
                ))}
              </div>
              {currentStage === 'test' && cycle.testVerdict && (
                <div className="mt-4">
                  <TestResultsPanel cycle={cycle} isDarkMode={isDark} />
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
          </div>
        )
      ) : (
        <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${isDark ? 'bg-transparent' : 'bg-zinc-50'}`}>
          {currentStage === 'production' && !isRunning ? (
            <MakeTestPanel isDarkMode={isDark} />
          ) : currentStage === 'test' && !isRunning ? (
            <TestResultsPanel cycle={cycle} isDarkMode={isDark} />
          ) : isRunning ? (
            <>
              <div className="w-24 h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(43,121,255,0.08)' : 'rgba(43,121,255,0.06)' }}>
                <div className="h-full rounded-full" style={{
                  width: '40%',
                  backgroundColor: 'rgba(43,121,255,0.4)',
                  animation: 'nomad-shimmer-bar 1.5s ease-in-out infinite',
                }} />
              </div>
              <ShineText variant={isDark ? 'dark' : 'light'} className="text-[11px]" speed={4}>
                <span style={{ color: 'rgba(43,121,255,0.5)' }}>Processing</span>
              </ShineText>
            </>
          ) : (
            <span className={`text-[12px] ${isDark ? 'text-white/[0.15]' : 'text-zinc-300'}`}>No output yet</span>
          )}
        </div>
      )}

      {/* ── Token bar — always visible when running ── */}
      {isActive && (
        <div className={`flex-shrink-0 flex items-center gap-3 px-5 py-2 border-t tabular-nums ${
          isDark ? 'border-white/[0.08] bg-[#0c0c0c]' : 'border-zinc-200 bg-white'
        }`}>
          {/* Status dot */}
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasActivity ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: hasActivity ? tokenColor : isDark ? 'rgba(255,255,255,0.15)' : '#d4d4d8' }}
          />

          {/* Status + model */}
          <span className="text-[11px] font-medium" style={{ color: hasActivity ? tokenColor : isDark ? 'rgba(255,255,255,0.30)' : '#a1a1aa' }}>
            {tokenLabel}
          </span>

          {tokenInfo.activeModel && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              isDark ? 'text-white/[0.30] bg-white/[0.04]' : 'text-zinc-500 bg-zinc-100'
            }`}>
              {formatModelName(tokenInfo.activeModel)}
            </span>
          )}

          {tokenInfo.isModelLoading && tokenInfo.callStartTime && (
            <span className="text-[10px] tabular-nums" style={{ color: '#d97706', opacity: 0.7 }}>
              {Math.floor((Date.now() - tokenInfo.callStartTime) / 1000)}s
            </span>
          )}

          {/* Right: metrics */}
          <div className={`ml-auto flex items-center gap-3 ${isDark ? 'text-white/[0.30]' : 'text-zinc-400'}`}>
            {tokenInfo.liveTokens > 0 && (
              <span className="text-[11px]">
                <span className={`font-semibold ${isDark ? 'text-white/[0.85]' : 'text-zinc-700'}`}>{tokenInfo.liveTokens.toLocaleString()}</span>
                <span className="text-[9px] ml-0.5">tok</span>
                {tokenInfo.tokensPerSec > 0 && (
                  <span className="ml-1 text-[10px]">{tokenInfo.tokensPerSec} t/s</span>
                )}
              </span>
            )}
            {tokenInfo.sessionTotal > 0 && (
              <>
                <span className={`text-[10px] ${isDark ? 'text-white/[0.08]' : 'text-zinc-200'}`}>|</span>
                <span className="text-[10px]">{tokenInfo.sessionTotal.toLocaleString()} total</span>
              </>
            )}
            {tokenInfo.callCount > 0 && (
              <span className="text-[9px]">#{tokenInfo.callCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Session summary when complete */}
      {!isActive && isComplete && tokenInfo.sessionTotal > 0 && (
        <div className={`flex-shrink-0 flex items-center justify-between px-5 py-2 border-t ${
          isDark ? 'border-white/[0.08] bg-[#0c0c0c]' : 'border-zinc-100 bg-zinc-50'
        }`}>
          <span className={`text-[10px] ${isDark ? 'text-zinc-700' : 'text-zinc-400'}`}>Session</span>
          <div className={`flex items-center gap-3 text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            <span>{tokenInfo.sessionTotal.toLocaleString()} tokens</span>
            {tokenInfo.callCount > 0 && <span>{tokenInfo.callCount} calls</span>}
          </div>
        </div>
      )}
    </div>
  );
}
