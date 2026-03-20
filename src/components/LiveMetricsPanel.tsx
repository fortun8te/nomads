import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Cycle } from '../types';

/**
 * LiveMetricsPanel — Real-time pipeline metrics display.
 * Shows watchdog status, orchestration state, token usage, research insights, and model status.
 *
 * This is a pure display component. Data flows in via props from parent.
 */

export interface LiveMetricsInput {
  // Current cycle context
  cycle: Cycle | null;
  isRunning: boolean;
  currentStage: string;

  // Orchestrator state
  iteration: number;
  maxIterations: number;
  coveragePercent: number;
  coveredDimensions?: number;
  totalDimensions?: number;
  totalSources?: number;
  totalQueries?: number;
  coverageDimensions: string[];
  coverageDimensionCounts: Record<string, number>;

  // Watchdog state
  watchdogStatus: {
    tokensUsed: number;
    tokenBudget: number;
    iterationsRemaining: number;
    stagnationRounds: number;
    queryRepeatCount: Record<string, number>;
    shouldKill: boolean;
    killReason?: string;
  };

  // Stage execution metrics
  elapsedMs: number;
  currentModel: string;
  thinkingTokens?: number;

  // Researchers
  activeResearchers: Array<{
    query: string;
    progress: number;
    status: 'pending' | 'running' | 'complete' | 'error';
  }>;
  pagesScanned: number;
  urlsProcessed: number;
  keyFactsExtracted: number;
  visualScreenshots?: number;

  // Actions & status
  onAbort?: () => void;
  onPause?: () => void;
  lastError?: string;
  thinkingContent?: string;
  onShowThinking?: () => void;

  // Compact mode (mobile)
  compact?: boolean;
}


function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function getStatusColor(value: number, low: number, high: number): string {
  if (value <= low) return 'text-green-400';
  if (value <= high) return 'text-yellow-400';
  return 'text-red-400';
}


function StatusDot({ isHealthy }: { isHealthy: boolean }) {
  return (
    <motion.div
      className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-green-400' : 'bg-red-400'}`}
      animate={{ scale: [1, 1.2, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    />
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <div className="border-b border-white/10 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left hover:bg-white/5 px-1 py-1 rounded transition"
      >
        <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
          {expanded ? '▼' : '▶'} {title}
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 pl-4 space-y-2 text-xs"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LiveMetricsPanel(props: LiveMetricsInput) {
  const {
    cycle: _cycle,
    isRunning: _isRunning,
    currentStage,
    iteration,
    maxIterations,
    coveragePercent,
    coveredDimensions,
    totalDimensions,
    totalSources,
    totalQueries,
    coverageDimensions,
    coverageDimensionCounts,
    watchdogStatus,
    elapsedMs,
    currentModel,
    thinkingTokens = 0,
    activeResearchers = [],
    pagesScanned = 0,
    urlsProcessed = 0,
    keyFactsExtracted = 0,
    visualScreenshots = 0,
    onAbort,
    onPause,
    lastError,
    thinkingContent,
    onShowThinking,
    compact = false,
  } = props;

  const [animatedTokens, setAnimatedTokens] = useState(watchdogStatus.tokensUsed);
  const animationRef = useRef<number | null>(null);

  // Smooth token counter animation
  // Note: animatedTokens is intentionally NOT in the dependency array to avoid
  // a feedback loop where each setAnimatedTokens call re-triggers this effect.
  useEffect(() => {
    if (watchdogStatus.tokensUsed === animatedTokens) return;
    const start = animatedTokens;
    const end = watchdogStatus.tokensUsed;
    const startTime = Date.now();
    const duration = 400;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setAnimatedTokens(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchdogStatus.tokensUsed]);

  const safeTokenBudget = Math.max(watchdogStatus.tokenBudget, 1);
  const tokenPercent = Math.min((animatedTokens / safeTokenBudget) * 100, 100);
  const isWatchdogHealthy =
    !watchdogStatus.shouldKill &&
    tokenPercent < 80 &&
    watchdogStatus.stagnationRounds < 2;

  // Remaining time estimate: only compute when we have a non-zero token rate to avoid Infinity/NaN.
  const tokenRate = elapsedMs > 0 ? animatedTokens / (elapsedMs / 1000) : 0; // tokens/sec
  const remainingTime = tokenRate > 0
    ? Math.ceil((safeTokenBudget - animatedTokens) / tokenRate) * 1000
    : 0;

  // Compact inline view — no fixed/absolute positioning; parent container handles placement
  if (compact) {
    return (
      <div className="p-3 space-y-2">
        {/* Coverage row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-400 shrink-0">Coverage</span>
          <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(coveragePercent, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className={`text-[11px] font-mono tabular-nums shrink-0 ${coveragePercent >= 60 ? 'text-green-400' : 'text-yellow-400'}`}>
            {coveragePercent.toFixed(0)}%
          </span>
        </div>

        {/* Iteration row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-400 shrink-0">Iteration</span>
          <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
            <motion.div
              className="h-full bg-indigo-400 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((iteration / Math.max(maxIterations, 1)) * 100, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-indigo-300 shrink-0">
            {iteration}/{maxIterations}
          </span>
        </div>

        {/* Model + elapsed row */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 truncate max-w-[100px]">{currentModel.split(':')[1] || currentModel}</span>
          <span className="text-zinc-500 font-mono tabular-nums">{formatTime(elapsedMs)}</span>
        </div>

        {/* Watchdog token budget row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-400 shrink-0">Budget</span>
          <div className="flex-1 bg-white/10 rounded-full h-1 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${tokenPercent > 80 ? 'bg-red-400' : tokenPercent > 60 ? 'bg-yellow-400' : 'bg-green-400'}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(tokenPercent, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className={`text-[11px] font-mono tabular-nums shrink-0 ${tokenPercent > 80 ? 'text-red-400' : 'text-zinc-400'}`}>
            {tokenPercent.toFixed(0)}%
          </span>
        </div>

        {/* Active researchers (compact) */}
        {activeResearchers.length > 0 && (
          <div className="pt-1 border-t border-white/10">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Active</span>
            {activeResearchers.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  r.status === 'complete' ? 'bg-green-400' :
                  r.status === 'error' ? 'bg-red-400' :
                  'bg-teal-400 animate-pulse'
                }`} />
                <span className="text-[10px] text-zinc-400 truncate">{r.query}</span>
              </div>
            ))}
          </div>
        )}

        {/* Stage label */}
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider">{currentStage}</div>
      </div>
    );
  }

  // Full metrics panel
  return (
    <motion.div
      className="fixed bottom-4 right-4 z-40 bg-slate-900/95 backdrop-blur-md border border-cyan-400/20 rounded-lg shadow-2xl text-white text-xs"
      style={{ width: '520px', maxHeight: '85vh', overflow: 'hidden' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border-b border-cyan-400/20 px-4 py-2 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-2">
          <StatusDot isHealthy={isWatchdogHealthy} />
          <span className="font-bold text-cyan-300 text-xs tracking-wide">LIVE METRICS</span>
        </div>
        <div className="text-gray-500">
          {currentStage && <span className="text-xs">{currentStage}</span>}
        </div>
      </div>

      {/* Scrollable content */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: 'calc(85vh - 40px)', scrollbarWidth: 'thin' }}
      >
        <div className="p-4 space-y-4">
          {/* Watchdog Status */}
          <CollapsibleSection title="Watchdog Status" defaultOpen={true}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Budget</span>
                <div className="flex-1 mx-2">
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${tokenPercent > 80 ? 'bg-red-400' : tokenPercent > 60 ? 'bg-yellow-400' : 'bg-green-400'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(tokenPercent, 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
                <span className={`font-mono ${getStatusColor(tokenPercent, 60, 80)}`}>
                  {animatedTokens.toLocaleString()} / {watchdogStatus.tokenBudget.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-400">
                <span>Usage</span>
                <span className="font-mono">{tokenPercent.toFixed(0)}%</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Iterations</span>
                <div className="flex-1 mx-2">
                  <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                    <motion.div
                      className="h-full bg-indigo-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((iteration / Math.max(maxIterations, 1)) * 100, 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
                <span className="font-mono text-indigo-300">
                  {iteration} / {maxIterations}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-400">
                <span>Query Repeats</span>
                <span className="font-mono">
                  {Object.values(watchdogStatus.queryRepeatCount).reduce((a, b) => a + b, 0)}
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-400">
                <span>Stagnation</span>
                <span className={`font-mono ${watchdogStatus.stagnationRounds > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {watchdogStatus.stagnationRounds} round{watchdogStatus.stagnationRounds !== 1 ? 's' : ''}
                </span>
              </div>

              {watchdogStatus.shouldKill && (
                <div className="mt-2 p-2 bg-red-400/20 border border-red-400/40 rounded text-red-300 text-xs">
                  <strong>Kill Signal:</strong> {watchdogStatus.killReason || 'Unknown'}
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Orchestration */}
          <CollapsibleSection title="Orchestration" defaultOpen={true}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Coverage</span>
                <div className="flex-1 mx-2">
                  <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(coveragePercent, 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
                <span className="font-mono text-purple-300">{coveragePercent.toFixed(0)}%</span>
              </div>

              <div className="flex items-center justify-between text-gray-400 text-xs">
                <span>Dimensions</span>
                <span className="font-mono">
                  {totalDimensions && totalDimensions > 0
                    ? `${coveredDimensions ?? 0} / ${totalDimensions} dims`
                    : `${Object.values(coverageDimensionCounts).filter(v => v > 0).length} / ${coverageDimensions.length}`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1 mt-2">
                {coverageDimensions.slice(0, 8).map((dim) => (
                  <div key={dim} className="flex items-center gap-1 text-gray-400 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${(coverageDimensionCounts[dim] || 0) > 0 ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className="truncate">{dim.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>

              {(totalSources != null && totalSources > 0) || (totalQueries != null && totalQueries > 0) ? (
                <div className="flex items-center justify-between text-gray-400 text-xs mt-1">
                  <span>Sources / Queries</span>
                  <span className="font-mono text-teal-300">
                    {totalSources ?? 0} sources · {totalQueries ?? 0} queries
                  </span>
                </div>
              ) : null}

              <div className="mt-2 p-2 bg-blue-400/10 border border-blue-400/30 rounded text-blue-300 text-xs">
                <strong>Model:</strong> {currentModel}
              </div>
            </div>
          </CollapsibleSection>

          {/* Time & Tokens */}
          <CollapsibleSection title="Time & Tokens" defaultOpen={false}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Stage Duration</span>
                <span className="font-mono text-teal-300">{formatTime(elapsedMs)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Est. Remaining</span>
                <span className="font-mono text-teal-300">
                  {remainingTime > 0 ? formatTime(remainingTime) : 'calculating...'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Token Rate</span>
                <span className="font-mono text-orange-400">
                  {elapsedMs > 0 ? ((animatedTokens * 1000) / elapsedMs).toFixed(1) : '—'} tokens/sec
                </span>
              </div>

              {thinkingTokens > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Thinking Tokens</span>
                  <span className="font-mono text-yellow-400">{thinkingTokens.toLocaleString()}</span>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Research Findings Summary */}
          <CollapsibleSection title="Research Insights" defaultOpen={false}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Pages Scanned</span>
                <span className="font-mono text-cyan-300">{pagesScanned}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">URLs Processed</span>
                <span className="font-mono text-cyan-300">{urlsProcessed}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Facts Extracted</span>
                <span className="font-mono text-cyan-300">{keyFactsExtracted}</span>
              </div>

              {visualScreenshots && visualScreenshots > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Screenshots (Visual Plus)</span>
                  <span className="font-mono text-cyan-300">{visualScreenshots}</span>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Active Researchers */}
          {activeResearchers.length > 0 && (
            <CollapsibleSection title={`Active Researchers (${activeResearchers.length})`} defaultOpen={true}>
              <div className="space-y-2">
                {activeResearchers.map((researcher, idx) => (
                  <div key={idx} className="p-2 bg-white/5 rounded border border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-teal-300 truncate">
                        {researcher.query.slice(0, 40)}
                        {researcher.query.length > 40 ? '...' : ''}
                      </span>
                      <span className={`text-xs font-bold ${
                        researcher.status === 'complete' ? 'text-green-400' :
                        researcher.status === 'error' ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>
                        {researcher.progress}%
                      </span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${
                          researcher.status === 'complete' ? 'bg-green-400' :
                          researcher.status === 'error' ? 'bg-red-400' :
                          'bg-teal-400'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${researcher.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Model Status */}
          <CollapsibleSection title="Model Status" defaultOpen={false}>
            <div className="space-y-2">
              <div className="p-2 bg-blue-400/10 border border-blue-400/30 rounded">
                <div className="flex items-center justify-between">
                  <span className="text-blue-300 font-mono text-xs">{currentModel}</span>
                  <span className="text-green-400 text-xs">Active</span>
                </div>
              </div>

              <div className="text-gray-500 text-xs space-y-1">
                <p>Vision model: ready</p>
                <p>Fallback: qwen3.5:2b (standby)</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* Errors */}
          {lastError && (
            <div className="p-3 bg-red-400/20 border border-red-400/40 rounded">
              <div className="font-bold text-red-300 text-xs mb-1">Last Error</div>
              <div className="text-red-200 text-xs break-words">{lastError}</div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            {onAbort && (
              <button
                onClick={onAbort}
                className="flex-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 hover:border-red-400/60 rounded text-red-300 text-xs font-semibold transition"
              >
                Abort
              </button>
            )}
            {onPause && (
              <button
                onClick={onPause}
                className="flex-1 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/40 hover:border-yellow-400/60 rounded text-yellow-300 text-xs font-semibold transition"
              >
                Pause
              </button>
            )}
            {onShowThinking && thinkingContent && (
              <button
                onClick={onShowThinking}
                className="flex-1 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 hover:border-purple-400/60 rounded text-purple-300 text-xs font-semibold transition"
              >
                Show Thinking
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
