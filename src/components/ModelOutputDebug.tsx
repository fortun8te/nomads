import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

interface ModelOutputDebugProps {
  rawOutput?: string;
  model?: string;
  tokensUsed?: number;
  processingTime?: number;
  stageName?: string;
}

export function ModelOutputDebug({
  rawOutput,
  model,
  tokensUsed,
  processingTime,
  stageName,
}: ModelOutputDebugProps) {
  const { isDarkMode } = useTheme();
  const [expanded, setExpanded] = useState(false);

  // Show if there's any metadata or raw output
  const hasAnyData = rawOutput || model || tokensUsed || processingTime;
  if (!hasAnyData) return null;

  const borderClass = isDarkMode ? 'border-zinc-700' : 'border-zinc-300';
  const bgClass = isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100';
  const textClass = isDarkMode ? 'text-zinc-300' : 'text-zinc-700';
  const hoverClass = isDarkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-200';
  const labelClass = isDarkMode ? 'text-zinc-500' : 'text-zinc-600';

  const outputLength = rawOutput?.length || 0;
  const lineCount = rawOutput.split('\n').length;

  return (
    <div className={`border ${borderClass} rounded mt-3`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full px-3 py-2 flex items-center justify-between text-xs font-mono ${bgClass} ${hoverClass} transition-colors`}
      >
        <div className="flex items-center gap-2">
          <span className={textClass}>{expanded ? '▼' : '▶'}</span>
          <span className={labelClass}>Model Output</span>
          {model && <span className={`text-xs ${labelClass}`}>({model})</span>}
        </div>
        <div className="flex items-center gap-3">
          {tokensUsed && <span className={labelClass}>{tokensUsed} tokens</span>}
          {processingTime && <span className={labelClass}>{processingTime}ms</span>}
          <span className={labelClass}>{outputLength} chars</span>
        </div>
      </button>

      {expanded && (
        <div className={`px-3 py-2 border-t ${borderClass} bg-opacity-50 space-y-2`}>
          {model && (
            <div className="text-xs">
              <span className={labelClass}>Model:</span>
              <span className={`ml-2 ${textClass} font-mono`}>{model}</span>
            </div>
          )}
          {stageName && (
            <div className="text-xs">
              <span className={labelClass}>Stage:</span>
              <span className={`ml-2 ${textClass} font-mono`}>{stageName}</span>
            </div>
          )}
          {processingTime && (
            <div className="text-xs">
              <span className={labelClass}>Time:</span>
              <span className={`ml-2 ${textClass} font-mono`}>{processingTime}ms</span>
            </div>
          )}
          {tokensUsed && (
            <div className="text-xs">
              <span className={labelClass}>Tokens:</span>
              <span className={`ml-2 ${textClass} font-mono`}>{tokensUsed}</span>
            </div>
          )}
          <div className="text-xs">
            <span className={labelClass}>Output:</span>
            <span className={`ml-2 ${textClass} font-mono`}>{outputLength} characters, {lineCount} lines</span>
          </div>

          {/* Raw output preview */}
          <div
            className={`mt-2 p-2 rounded text-xs font-mono ${isDarkMode ? 'bg-black/30' : 'bg-white/30'} overflow-x-auto max-h-32 overflow-y-auto`}
          >
            <pre className={textClass}>{rawOutput.slice(0, 500)}{rawOutput.length > 500 ? '\n...(truncated)' : ''}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
