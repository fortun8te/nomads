import { useState } from 'react';
import type { Campaign } from '../types';

interface PresetDetailsPanelProps {
  campaign: Campaign;
  isDarkMode: boolean;
}

export function PresetDetailsPanel({ campaign, isDarkMode }: PresetDetailsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    brand: true,
    audience: false,
    product: false,
    competitive: false,
    messaging: false,
  });

  const preset = campaign.presetData;
  if (!preset) return null;

  const borderClass = isDarkMode ? 'border-zinc-800/70' : 'border-zinc-200';
  const bgClass = isDarkMode ? 'bg-zinc-900/30' : 'bg-zinc-50/50';
  const hoverClass = isDarkMode ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100/50';
  const secondaryTextClass = isDarkMode ? 'text-zinc-600' : 'text-zinc-500';
  const textClass = isDarkMode ? 'text-zinc-300' : 'text-zinc-700';
  const headerClass = isDarkMode ? 'text-zinc-400' : 'text-zinc-700';

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className={`border ${borderClass} space-y-1`}>
      {/* Brand Section */}
      <button
        onClick={() => toggleSection('brand')}
        className={`w-full flex items-center justify-between gap-2 p-3 ${hoverClass} transition-colors`}
      >
        <span className={`font-mono text-[10px] uppercase tracking-[0.2em] font-bold ${headerClass}`}>
          Brand Details
        </span>
        <span className={`text-[10px] ${secondaryTextClass} shrink-0 transition-transform ${expandedSections.brand ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      {expandedSections.brand && preset.brand && (
        <div className={`border-t ${borderClass} p-3 space-y-2 text-xs`}>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Name</div>
            <div className={textClass}>{preset.brand.name}</div>
          </div>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Positioning</div>
            <div className={textClass}>{preset.brand.positioning}</div>
          </div>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Brand Why</div>
            <div className={textClass}>{preset.brand.brandWhy}</div>
          </div>
          {preset.brand.colors && (
            <div className={`${bgClass} p-2 rounded`}>
              <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Colors</div>
              <div className={textClass}>{preset.brand.colors}</div>
            </div>
          )}
        </div>
      )}

      {/* Audience Section */}
      <button
        onClick={() => toggleSection('audience')}
        className={`w-full flex items-center justify-between gap-2 p-3 ${hoverClass} transition-colors border-t ${borderClass}`}
      >
        <span className={`font-mono text-[10px] uppercase tracking-[0.2em] font-bold ${headerClass}`}>
          Audience ({preset.audience?.name})
        </span>
        <span className={`text-[10px] ${secondaryTextClass} shrink-0 transition-transform ${expandedSections.audience ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      {expandedSections.audience && preset.audience && (
        <div className={`border-t ${borderClass} p-3 space-y-2 text-xs`}>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Age Range</div>
            <div className={textClass}>{preset.audience.ageRange}</div>
          </div>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Job</div>
            <div className={textClass}>{preset.audience.job}</div>
          </div>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Primary Pain Point</div>
            <div className={textClass}>{preset.audience.painPoints?.primary || 'N/A'}</div>
          </div>
        </div>
      )}

      {/* Product Section */}
      <button
        onClick={() => toggleSection('product')}
        className={`w-full flex items-center justify-between gap-2 p-3 ${hoverClass} transition-colors border-t ${borderClass}`}
      >
        <span className={`font-mono text-[10px] uppercase tracking-[0.2em] font-bold ${headerClass}`}>
          Product
        </span>
        <span className={`text-[10px] ${secondaryTextClass} shrink-0 transition-transform ${expandedSections.product ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      {expandedSections.product && preset.product && (
        <div className={`border-t ${borderClass} p-3 space-y-2 text-xs`}>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Name</div>
            <div className={textClass}>{preset.product.name}</div>
          </div>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>USP</div>
            <div className={textClass}>{preset.product.usp?.substring(0, 150) || 'N/A'}...</div>
          </div>
          {preset.product.scents && (
            <div className={`${bgClass} p-2 rounded`}>
              <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Scents/Variants</div>
              <div className={textClass}>
                {Array.isArray(preset.product.scents)
                  ? preset.product.scents.slice(0, 3).join(', ') + (preset.product.scents.length > 3 ? '...' : '')
                  : String(preset.product.scents).substring(0, 100)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Competitive Section */}
      <button
        onClick={() => toggleSection('competitive')}
        className={`w-full flex items-center justify-between gap-2 p-3 ${hoverClass} transition-colors border-t ${borderClass}`}
      >
        <span className={`font-mono text-[10px] uppercase tracking-[0.2em] font-bold ${headerClass}`}>
          Competitive
        </span>
        <span className={`text-[10px] ${secondaryTextClass} shrink-0 transition-transform ${expandedSections.competitive ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      {expandedSections.competitive && preset.competitive && (
        <div className={`border-t ${borderClass} p-3 space-y-2 text-xs`}>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Market Gap</div>
            <div className={textClass}>{preset.competitive.marketGap?.substring(0, 150) || 'N/A'}</div>
          </div>
          {preset.competitive.mainCompetitors && (
            <div className={`${bgClass} p-2 rounded`}>
              <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Main Competitors</div>
              <div className={textClass}>
                {Array.isArray(preset.competitive.mainCompetitors)
                  ? preset.competitive.mainCompetitors.length + ' competitors mapped'
                  : 'N/A'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messaging Section */}
      <button
        onClick={() => toggleSection('messaging')}
        className={`w-full flex items-center justify-between gap-2 p-3 ${hoverClass} transition-colors border-t ${borderClass}`}
      >
        <span className={`font-mono text-[10px] uppercase tracking-[0.2em] font-bold ${headerClass}`}>
          Messaging
        </span>
        <span className={`text-[10px] ${secondaryTextClass} shrink-0 transition-transform ${expandedSections.messaging ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      {expandedSections.messaging && preset.messaging && (
        <div className={`border-t ${borderClass} p-3 space-y-2 text-xs`}>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Core Message</div>
            <div className={textClass}>{preset.messaging.mainMessage?.substring(0, 150) || 'N/A'}</div>
          </div>
          <div className={`${bgClass} p-2 rounded`}>
            <div className={`font-mono text-[9px] uppercase ${secondaryTextClass} mb-1`}>Brand Tagline</div>
            <div className={textClass}>{preset.messaging.brandTagline || 'N/A'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
