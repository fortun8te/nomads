import { useState } from 'react';
import type { Campaign } from '../types';

interface PresetDetailsModalProps {
  campaign: Campaign;
  isDarkMode: boolean;
  onClose: () => void;
}

export function PresetDetailsModal({ campaign, isDarkMode, onClose }: PresetDetailsModalProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    brand: true,
    audience: true,
    product: true,
    competitive: true,
    messaging: true,
    platforms: true,
  });

  const preset = campaign.presetData;
  if (!preset) return null;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const borderClass = isDarkMode ? 'border-zinc-800/70' : 'border-zinc-200';
  const bgClass = isDarkMode ? 'bg-zinc-900/50' : 'bg-zinc-50';
  const contentBgClass = isDarkMode ? 'bg-zinc-800/30' : 'bg-zinc-100/50';
  const textClass = isDarkMode ? 'text-zinc-300' : 'text-zinc-700';
  const secondaryTextClass = isDarkMode ? 'text-zinc-600' : 'text-zinc-500';
  const headerClass = isDarkMode ? 'text-zinc-300' : 'text-zinc-800';

  const renderSection = (title: string, data: any) => {
    if (!data) return null;
    const isExpanded = expandedSections[title];

    return (
      <div key={title} className={`border ${borderClass}`}>
        <button
          onClick={() => toggleSection(title)}
          className={`w-full flex items-center justify-between gap-2 p-4 hover:bg-opacity-50 transition-colors`}
          style={{ backgroundColor: isDarkMode ? 'rgba(39, 39, 42, 0.5)' : 'rgba(228, 228, 231, 0.5)' }}
        >
          <span className={`font-mono text-sm uppercase tracking-[0.15em] font-bold ${headerClass}`}>
            {title}
          </span>
          <span className={`text-xs ${secondaryTextClass} transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </button>

        {isExpanded && (
          <div className={`${contentBgClass} p-4 space-y-3 border-t ${borderClass}`}>
            {typeof data === 'object' && !Array.isArray(data) ? (
              Object.entries(data).map(([key, value]) => (
                <div key={key}>
                  <div className={`font-mono text-xs uppercase ${secondaryTextClass} mb-1`}>{key}</div>
                  <div className={`text-sm ${textClass} whitespace-pre-wrap break-words`}>
                    {typeof value === 'string'
                      ? value
                      : Array.isArray(value)
                      ? value.join(' | ')
                      : typeof value === 'object'
                      ? JSON.stringify(value, null, 2)
                      : String(value)}
                  </div>
                </div>
              ))
            ) : Array.isArray(data) ? (
              <div className={`text-sm ${textClass}`}>
                {data.map((item, i) => (
                  <div key={i} className="mb-2">
                    {typeof item === 'string' ? item : JSON.stringify(item)}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`text-sm ${textClass}`}>{String(data)}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${isDarkMode ? 'bg-black/70' : 'bg-black/50'}`}
      onClick={onClose}
    >
      <div
        className={`relative w-11/12 max-w-4xl max-h-[90vh] overflow-y-auto ${bgClass} border ${borderClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`sticky top-0 flex items-center justify-between gap-3 p-6 border-b ${borderClass} ${bgClass}`}>
          <div>
            <h2 className={`text-xl font-bold ${headerClass}`}>{preset.brand?.name || 'Preset Details'}</h2>
            <p className={`text-xs ${secondaryTextClass}`}>{preset.label}</p>
          </div>
          <button
            onClick={onClose}
            className={`text-2xl ${secondaryTextClass} hover:${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'} transition-colors`}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-2">
          {renderSection('brand', preset.brand)}
          {renderSection('audience', preset.audience)}
          {renderSection('product', preset.product)}
          {renderSection('competitive', preset.competitive)}
          {renderSection('creative', preset.creative)}
          {renderSection('messaging', preset.messaging)}
          {renderSection('platforms', preset.platforms)}
          {renderSection('researchFocus', preset.researchFocus)}
        </div>
      </div>
    </div>
  );
}
