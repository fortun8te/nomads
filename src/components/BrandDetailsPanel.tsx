import { useState } from 'react';
import type { Campaign } from '../types';

interface BrandDetailsPanelProps {
  campaign: Campaign;
  isDarkMode: boolean;
}

export function BrandDetailsPanel({ campaign, isDarkMode }: BrandDetailsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const borderClass = isDarkMode ? 'border-zinc-800/70' : 'border-zinc-200';
  const bgClass = isDarkMode ? 'bg-zinc-900/30' : 'bg-zinc-50/50';
  const hoverClass = isDarkMode ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100/50';
  const secondaryTextClass = isDarkMode ? 'text-zinc-600' : 'text-zinc-500';
  const accentClass = isDarkMode ? 'text-blue-400' : 'text-blue-600';

  const hasColors = campaign.brandColors && campaign.brandColors.trim();
  const hasFonts = campaign.brandFonts && campaign.brandFonts.trim();
  const hasDNA = campaign.brandDNA && Object.keys(campaign.brandDNA).length > 0;

  if (!hasColors && !hasFonts && !hasDNA) {
    return null;
  }

  return (
    <div className={`border ${borderClass}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between gap-2 p-3 ${hoverClass} transition-colors`}
      >
        <span className={`font-mono text-[10px] uppercase tracking-[0.2em] font-bold ${isDarkMode ? 'text-zinc-400' : 'text-zinc-700'}`}>
          Brand Details
        </span>
        <span className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </button>

      {isExpanded && (
        <div className={`border-t ${borderClass} p-3 space-y-3`}>
          {/* Colors */}
          {hasColors && (
            <div>
              <span className={`font-mono text-[9px] uppercase tracking-[0.15em] ${secondaryTextClass} block mb-1.5`}>
                Colors
              </span>
              <div className={`${bgClass} p-2 rounded text-xs font-mono leading-relaxed space-y-1`}>
                {campaign.brandColors?.split('\n').map((line, i) => (
                  <div key={i} className={`${accentClass} whitespace-pre-wrap break-words text-[11px]`}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fonts */}
          {hasFonts && (
            <div>
              <span className={`font-mono text-[9px] uppercase tracking-[0.15em] ${secondaryTextClass} block mb-1.5`}>
                Fonts
              </span>
              <div className={`${bgClass} p-2 rounded text-xs font-mono leading-relaxed space-y-1`}>
                {campaign.brandFonts?.split('\n').map((line, i) => (
                  <div key={i} className={`${accentClass} whitespace-pre-wrap break-words text-[11px]`}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Brand DNA */}
          {hasDNA && (
            <div>
              <span className={`font-mono text-[9px] uppercase tracking-[0.15em] ${secondaryTextClass} block mb-1.5`}>
                Brand DNA
              </span>
              <div className="space-y-1">
                {Object.entries(campaign.brandDNA || {}).map(([key, value]) => (
                  <div key={key} className={`${bgClass} p-2 rounded text-xs`}>
                    <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-0.5`}>
                      {key}
                    </div>
                    <div className={`text-[11px] ${accentClass} whitespace-pre-wrap break-words`}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
