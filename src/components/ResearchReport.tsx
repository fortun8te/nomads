/**
 * ResearchReport — Renders the generated mini research paper
 * Executive summary, key insights, contradictions, sources, confidence
 */

import { useState } from 'react';
import type { ResearchReport as ReportType } from '../types';
import { useTheme } from '../context/ThemeContext';

interface Props {
  report: ReportType;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  market: { bg: 'bg-blue-100', text: 'text-blue-800', darkBg: 'bg-blue-900/30', darkText: 'text-blue-300' },
  audience: { bg: 'bg-green-100', text: 'text-green-800', darkBg: 'bg-green-900/30', darkText: 'text-green-300' },
  competitor: { bg: 'bg-red-100', text: 'text-red-800', darkBg: 'bg-red-900/30', darkText: 'text-red-300' },
  emotional: { bg: 'bg-purple-100', text: 'text-purple-800', darkBg: 'bg-purple-900/30', darkText: 'text-purple-300' },
  behavioral: { bg: 'bg-amber-100', text: 'text-amber-800', darkBg: 'bg-amber-900/30', darkText: 'text-amber-300' },
  opportunity: { bg: 'bg-emerald-100', text: 'text-emerald-800', darkBg: 'bg-emerald-900/30', darkText: 'text-emerald-300' },
};

function ConfidenceGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const { isDarkMode } = useTheme();
  const radius = size === 'sm' ? 20 : 36;
  const stroke = size === 'sm' ? 4 : 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const dim = (radius + stroke) * 2;

  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={dim} height={dim}>
        <circle
          cx={radius + stroke}
          cy={radius + stroke}
          r={radius}
          fill="none"
          stroke={isDarkMode ? '#27272a' : '#e4e4e7'}
          strokeWidth={stroke}
        />
        <circle
          cx={radius + stroke}
          cy={radius + stroke}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${radius + stroke} ${radius + stroke})`}
          className="transition-all duration-1000"
        />
      </svg>
      <span className={`absolute ${size === 'sm' ? 'text-[10px]' : 'text-sm'} font-bold`} style={{ color }}>
        {score}%
      </span>
    </div>
  );
}

export default function ResearchReport({ report }: Props) {
  const { isDarkMode } = useTheme();
  const [expandedInsights, setExpandedInsights] = useState<Set<number>>(new Set());
  const [showSources, setShowSources] = useState(false);

  const card = isDarkMode
    ? 'bg-zinc-900/80 border border-zinc-800/60 rounded-xl'
    : 'bg-white border border-zinc-200/80 rounded-xl';
  const text = isDarkMode ? 'text-zinc-100' : 'text-zinc-900';
  const muted = isDarkMode ? 'text-zinc-400' : 'text-zinc-500';
  const subtle = isDarkMode ? 'text-zinc-500' : 'text-zinc-400';

  const toggleInsight = (i: number) => {
    const next = new Set(expandedInsights);
    next.has(i) ? next.delete(i) : next.add(i);
    setExpandedInsights(next);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header + Confidence */}
      <div className={`${card} p-5 flex items-start gap-4`}>
        <ConfidenceGauge score={report.confidenceScore} />
        <div className="flex-1 min-w-0">
          <h2 className={`text-lg font-bold ${text}`}>Research Report</h2>
          <p className={`text-xs ${muted} mt-0.5`}>
            {report.keyInsights.length} insights | {report.contradictions.length} contradictions | {report.sources.length} sources
          </p>
          <p className={`text-xs ${subtle} mt-0.5`}>
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Executive Summary */}
      <div className={`${card} p-5`}>
        <h3 className={`text-sm font-bold ${text} mb-2 uppercase tracking-wider`}>Executive Summary</h3>
        <div className={`text-[13px] leading-relaxed ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'} whitespace-pre-line`}>
          {report.executiveSummary}
        </div>
      </div>

      {/* Key Insights */}
      <div className={`${card} p-5`}>
        <h3 className={`text-sm font-bold ${text} mb-3 uppercase tracking-wider`}>Key Insights</h3>
        <div className="space-y-2">
          {report.keyInsights.map((insight, i) => {
            const cc = CATEGORY_COLORS[insight.category] || CATEGORY_COLORS.market;
            const expanded = expandedInsights.has(i);
            return (
              <div
                key={i}
                className={`${isDarkMode ? 'bg-zinc-800/50 border-zinc-700/30' : 'bg-zinc-50 border-zinc-200/60'} border rounded-lg cursor-pointer transition-all`}
                onClick={() => toggleInsight(i)}
              >
                <div className="p-3 flex items-start gap-2">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${isDarkMode ? cc.darkBg + ' ' + cc.darkText : cc.bg + ' ' + cc.text}`}>
                    {insight.category}
                  </span>
                  <p className={`text-[12px] leading-snug ${text} flex-1`}>{insight.insight}</p>
                  <ConfidenceGauge score={insight.confidence} size="sm" />
                </div>
                {expanded && (
                  <div className={`px-3 pb-3 pt-1 border-t ${isDarkMode ? 'border-zinc-700/30' : 'border-zinc-200/60'}`}>
                    {insight.verbatimEvidence?.length > 0 && (
                      <div className="mb-2">
                        <span className={`text-[9px] uppercase tracking-wider font-semibold ${muted}`}>Evidence</span>
                        {insight.verbatimEvidence.map((e, j) => (
                          <p key={j} className={`text-[11px] italic ${muted} mt-0.5`}>"{e}"</p>
                        ))}
                      </div>
                    )}
                    {insight.supportingSources?.length > 0 && (
                      <div>
                        <span className={`text-[9px] uppercase tracking-wider font-semibold ${muted}`}>Sources</span>
                        {insight.supportingSources.map((s, j) => (
                          <p key={j} className={`text-[10px] ${subtle} truncate`}>{s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Contradictions */}
      {report.contradictions.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={`text-sm font-bold ${text} mb-3 uppercase tracking-wider`}>Contradictions Found</h3>
          <div className="space-y-3">
            {report.contradictions.map((c, i) => (
              <div key={i} className={`${isDarkMode ? 'bg-amber-900/10 border-amber-800/20' : 'bg-amber-50 border-amber-200/60'} border rounded-lg p-3`}>
                <p className={`text-[11px] font-bold ${isDarkMode ? 'text-amber-300' : 'text-amber-800'} mb-1.5`}>{c.topic}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className={`text-[9px] uppercase ${muted}`}>Claim A</span>
                    <p className={`text-[11px] ${text}`}>{c.claimA.text}</p>
                    <p className={`text-[9px] ${subtle} truncate`}>{c.claimA.source}</p>
                  </div>
                  <div>
                    <span className={`text-[9px] uppercase ${muted}`}>Claim B</span>
                    <p className={`text-[11px] ${text}`}>{c.claimB.text}</p>
                    <p className={`text-[9px] ${subtle} truncate`}>{c.claimB.source}</p>
                  </div>
                </div>
                {c.resolution && (
                  <p className={`text-[11px] ${isDarkMode ? 'text-amber-200/70' : 'text-amber-700'} mt-2 italic`}>
                    Resolution: {c.resolution}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confidence by Dimension */}
      {Object.keys(report.confidenceByDimension).length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={`text-sm font-bold ${text} mb-3 uppercase tracking-wider`}>Confidence by Dimension</h3>
          <div className="space-y-1.5">
            {Object.entries(report.confidenceByDimension)
              .sort(([, a], [, b]) => b - a)
              .map(([dim, score]) => (
                <div key={dim} className="flex items-center gap-2">
                  <span className={`text-[10px] w-32 truncate ${muted}`}>{dim.replace(/_/g, ' ')}</span>
                  <div className={`flex-1 h-2 rounded-full ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${score}%`,
                        backgroundColor: score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono w-8 text-right ${muted}`}>{score}%</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Methodology + Limitations */}
      {(report.methodology || report.limitations.length > 0) && (
        <div className={`${card} p-5`}>
          <h3 className={`text-sm font-bold ${text} mb-2 uppercase tracking-wider`}>Methodology</h3>
          {report.methodology && (
            <p className={`text-[12px] ${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'} mb-3`}>{report.methodology}</p>
          )}
          {report.limitations.length > 0 && (
            <>
              <h4 className={`text-[10px] font-bold uppercase tracking-wider ${muted} mb-1`}>Known Limitations</h4>
              <ul className="space-y-0.5">
                {report.limitations.map((l, i) => (
                  <li key={i} className={`text-[11px] ${subtle}`}>- {l}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Sources (collapsible) */}
      <div className={`${card} p-5`}>
        <button
          onClick={() => setShowSources(!showSources)}
          className={`text-sm font-bold ${text} uppercase tracking-wider flex items-center gap-2`}
        >
          Sources ({report.sources.length})
          <span className={`text-[10px] ${muted}`}>{showSources ? '[-]' : '[+]'}</span>
        </button>
        {showSources && (
          <div className="mt-3 space-y-1 max-h-60 overflow-y-auto">
            {report.sources
              .sort((a, b) => b.relevanceScore - a.relevanceScore)
              .map((src, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`text-[9px] font-mono w-6 text-right ${subtle}`}>{src.relevanceScore}</span>
                  <span className={`text-[10px] ${muted} truncate flex-1`}>{src.url}</span>
                  <span className={`text-[9px] ${subtle}`}>{src.contentType}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
