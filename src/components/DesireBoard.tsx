/**
 * DesireBoard — Avatar → Desires → Ads tree view
 *
 * The organizing principle: one Avatar at top, branching into
 * N Desires, each containing tagged Ads. This replaces the
 * "Funnel" stub tab in MakeStudio.
 */

import { useState, useMemo, useCallback } from 'react';
import type { DeepDesire, AvatarPersona, ResearchFindings, Campaign } from '../types';
import type { StoredImage } from '../utils/storage';

// ── Types ──

interface DesireBoardProps {
  theme: 'light' | 'dark';
  researchFindings: ResearchFindings | null;
  persona: AvatarPersona | null;
  storedImages: StoredImage[];
  campaign: Campaign | null;
  onGenerateForDesire: (desire: DeepDesire, count: number) => void;
  onImageClick: (image: StoredImage) => void;
  onSwitchToResearch: () => void;
  isGenerating: boolean;
  generatingDesireId?: string | null;
}

// ── Intensity config ──

const INTENSITY_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  low:      { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', border: 'border-zinc-300 dark:border-zinc-700', label: 'Low' },
  moderate: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-800', label: 'Moderate' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-800', label: 'High' },
  extreme:  { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-800', label: 'Extreme' },
};

const AMPLIFIED_ICONS: Record<string, { icon: string; label: string }> = {
  loved_ones:      { icon: '\u2665', label: 'Loved Ones' },
  identity_status: { icon: '\u26E8', label: 'Identity' },
  survival:        { icon: '\u26A1', label: 'Survival' },
  other:           { icon: '\u25C6', label: 'Other' },
};

// ── Helpers ──

/** Ensure desires have IDs (backward compat with old research data) */
function ensureDesireIds(desires: DeepDesire[] | undefined): DeepDesire[] {
  if (!desires) return [];
  return desires.map((d, i) => ({
    ...d,
    id: d.id || `legacy-desire-${i}`,
  }));
}

/** Count ads per desire */
function countAdsByDesire(images: StoredImage[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const img of images) {
    if (img.desireId) {
      counts.set(img.desireId, (counts.get(img.desireId) || 0) + 1);
    }
  }
  return counts;
}

/** Get images for a specific desire */
function getAdsForDesire(images: StoredImage[], desireId: string): StoredImage[] {
  return images
    .filter(img => img.desireId === desireId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ── Component ──

export function DesireBoard({
  theme,
  researchFindings,
  persona,
  storedImages,
  campaign,
  onGenerateForDesire,
  onImageClick,
  onSwitchToResearch,
  isGenerating,
  generatingDesireId,
}: DesireBoardProps) {
  const [expandedDesire, setExpandedDesire] = useState<string | null>(null);
  const [generateCounts, setGenerateCounts] = useState<Record<string, number>>({});

  const isDark = theme === 'dark';
  const desires = useMemo(() => ensureDesireIds(researchFindings?.deepDesires), [researchFindings?.deepDesires]);
  const adCounts = useMemo(() => countAdsByDesire(storedImages), [storedImages]);

  // Count untagged ads (ads without a desireId that belong to this campaign)
  const untaggedCount = useMemo(() => {
    return storedImages.filter(img =>
      !img.desireId && img.campaignId === campaign?.id
    ).length;
  }, [storedImages, campaign?.id]);

  const toggleExpand = useCallback((desireId: string) => {
    setExpandedDesire(prev => prev === desireId ? null : desireId);
  }, []);

  const getGenCount = (desireId: string) => generateCounts[desireId] || 4;
  const setGenCount = (desireId: string, count: number) => {
    setGenerateCounts(prev => ({ ...prev, [desireId]: count }));
  };

  // ── Empty States ──

  if (!researchFindings) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
          <span className="text-2xl opacity-40">&#128100;</span>
        </div>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          Run research to discover your avatar and their desires
        </p>
        <button
          onClick={onSwitchToResearch}
          className="text-xs px-4 py-1.5 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        >
          Go to Research
        </button>
      </div>
    );
  }

  if (desires.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
          <span className="text-2xl opacity-40">&#128269;</span>
        </div>
        <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          Research complete but no desires were identified
        </p>
        <p className={`text-xs ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          Try running research again with a more specific audience
        </p>
      </div>
    );
  }

  // ── Main Render ──

  return (
    <div className="space-y-5 pb-8">
      {/* ── Avatar Card ── */}
      {persona && <AvatarCard persona={persona} theme={theme} />}

      {/* ── Connection Lines (visual) ── */}
      <div className="flex justify-center">
        <div className={`w-px h-6 ${isDark ? 'bg-zinc-700' : 'bg-zinc-300'}`} />
      </div>

      {/* ── Desire Cards Grid ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))` }}>
        {desires.map((desire) => {
          const count = adCounts.get(desire.id) || 0;
          const isExpanded = expandedDesire === desire.id;
          const isThisGenerating = isGenerating && generatingDesireId === desire.id;

          return (
            <DesireCard
              key={desire.id}
              desire={desire}
              adCount={count}
              isExpanded={isExpanded}
              isGenerating={isThisGenerating}
              generateCount={getGenCount(desire.id)}
              onSetGenerateCount={(n) => setGenCount(desire.id, n)}
              onToggleExpand={() => toggleExpand(desire.id)}
              onGenerate={() => onGenerateForDesire(desire, getGenCount(desire.id))}
              theme={theme}
              storedImages={storedImages}
              onImageClick={onImageClick}
            />
          );
        })}
      </div>

      {/* ── Expanded Desire Detail ── */}
      {expandedDesire && (
        <ExpandedDesirePanel
          desire={desires.find(d => d.id === expandedDesire)!}
          ads={getAdsForDesire(storedImages, expandedDesire)}
          theme={theme}
          onImageClick={onImageClick}
          onGenerate={(count) => {
            const desire = desires.find(d => d.id === expandedDesire);
            if (desire) onGenerateForDesire(desire, count);
          }}
          isGenerating={isGenerating && generatingDesireId === expandedDesire}
        />
      )}

      {/* ── Untagged Ads Section ── */}
      {untaggedCount > 0 && (
        <div className={`mt-6 p-4 rounded-xl border ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Untagged Ads
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-200 text-zinc-500'}`}>
              {untaggedCount}
            </span>
          </div>
          <p className={`text-xs ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
            These ads aren't linked to a desire yet. Tag them in the gallery to organize.
          </p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ██  Avatar Card
// ══════════════════════════════════════════════════════

function AvatarCard({ persona, theme }: { persona: AvatarPersona; theme: 'light' | 'dark' }) {
  const [expanded, setExpanded] = useState(false);
  const isDark = theme === 'dark';

  return (
    <div
      className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:shadow-sm ${
        isDark
          ? 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700'
          : 'border-zinc-200 bg-white hover:border-zinc-300'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        {/* Avatar icon */}
        <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-lg ${
          isDark ? 'bg-blue-950/50 text-blue-400' : 'bg-blue-50 text-blue-500'
        }`}>
          &#128100;
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + age */}
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              {persona.name}
            </span>
            {persona.age && (
              <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {persona.age}
              </span>
            )}
          </div>

          {/* Situation */}
          <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {persona.situation}
          </p>

          {/* Identity */}
          {persona.identity && (
            <p className={`text-xs mt-0.5 italic ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              "{persona.identity}"
            </p>
          )}

          {/* Expanded details */}
          {expanded && (
            <div className={`mt-3 pt-3 space-y-2 border-t text-xs ${isDark ? 'border-zinc-800 text-zinc-400' : 'border-zinc-200 text-zinc-500'}`}>
              {persona.painNarrative && (
                <div>
                  <span className={`font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>Pain: </span>
                  {persona.painNarrative}
                </div>
              )}
              {persona.turningPointMoment && (
                <div>
                  <span className={`font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>Turning point: </span>
                  {persona.turningPointMoment}
                </div>
              )}
              {persona.innerMonologue && (
                <div>
                  <span className={`font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>Inner voice: </span>
                  <span className="italic">"{persona.innerMonologue}"</span>
                </div>
              )}
              {persona.deepDesire && (
                <div>
                  <span className={`font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>Deep desire: </span>
                  {persona.deepDesire}
                </div>
              )}
              {persona.biggestFear && (
                <div>
                  <span className={`font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>Biggest fear: </span>
                  {persona.biggestFear}
                </div>
              )}
              {persona.languagePatterns?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {persona.languagePatterns.slice(0, 6).map((phrase, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
                      "{phrase}"
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expand indicator */}
        <span className={`text-xs transition-transform ${expanded ? 'rotate-180' : ''} ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          &#9660;
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ██  Desire Card
// ══════════════════════════════════════════════════════

function DesireCard({
  desire,
  adCount,
  isExpanded,
  isGenerating,
  generateCount,
  onSetGenerateCount,
  onToggleExpand,
  onGenerate,
  theme,
  storedImages,
  onImageClick,
}: {
  desire: DeepDesire;
  adCount: number;
  isExpanded: boolean;
  isGenerating: boolean;
  generateCount: number;
  onSetGenerateCount: (n: number) => void;
  onToggleExpand: () => void;
  onGenerate: () => void;
  theme: 'light' | 'dark';
  storedImages: StoredImage[];
  onImageClick: (img: StoredImage) => void;
}) {
  const isDark = theme === 'dark';
  const intensity = INTENSITY_CONFIG[desire.desireIntensity] || INTENSITY_CONFIG.moderate;
  const amplified = AMPLIFIED_ICONS[desire.amplifiedDesireType] || AMPLIFIED_ICONS.other;

  // Coverage indicator
  const coverageColor = adCount >= 4 ? 'bg-emerald-500' : adCount >= 2 ? 'bg-emerald-400' : adCount >= 1 ? 'bg-amber-400' : isDark ? 'bg-zinc-700' : 'bg-zinc-300';

  // Mini thumbnails (up to 3)
  const thumbnails = useMemo(
    () => getAdsForDesire(storedImages, desire.id).slice(0, 3),
    [storedImages, desire.id]
  );

  return (
    <div
      className={`rounded-xl border transition-all duration-200 cursor-pointer group ${
        isExpanded
          ? isDark ? 'border-blue-700 bg-blue-950/20 ring-1 ring-blue-800/50' : 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-200'
          : isDark ? 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700' : 'border-zinc-200 bg-white hover:border-zinc-300'
      }`}
    >
      {/* Card Header — clickable to expand */}
      <div className="p-3 pb-2" onClick={onToggleExpand}>
        {/* Top row: intensity + amplified type */}
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${intensity.bg} ${intensity.text}`}>
            {intensity.label}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} title={amplified.label}>
              {amplified.icon}
            </span>
            <div className={`w-2 h-2 rounded-full ${coverageColor}`} title={`${adCount} ads`} />
          </div>
        </div>

        {/* Deepest desire */}
        <p className={`text-xs font-medium leading-snug line-clamp-2 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
          {desire.deepestDesire}
        </p>

        {/* Surface problem */}
        <p className={`text-[10px] mt-1 line-clamp-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {desire.surfaceProblem}
        </p>

        {/* Target segment */}
        <div className="mt-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
            {desire.targetSegment}
          </span>
        </div>
      </div>

      {/* Thumbnails + ad count */}
      <div className={`px-3 py-2 border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200/80'}`}>
        {thumbnails.length > 0 ? (
          <div className="flex gap-1">
            {thumbnails.map((img) => (
              <div
                key={img.id}
                className="w-10 h-10 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); onImageClick(img); }}
              >
                <img
                  src={img.htmlScreenshot ? `data:image/png;base64,${img.htmlScreenshot}` : `data:image/png;base64,${img.imageBase64}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {adCount > 3 && (
              <div
                className={`w-10 h-10 rounded flex items-center justify-center text-[10px] font-medium ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}
                onClick={onToggleExpand}
              >
                +{adCount - 3}
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded border border-dashed ${isDark ? 'border-zinc-700' : 'border-zinc-300'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Generate bar */}
      <div className={`px-3 py-2 border-t flex items-center gap-2 ${isDark ? 'border-zinc-800' : 'border-zinc-200/80'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onGenerate(); }}
          disabled={isGenerating}
          className={`flex-1 text-[11px] font-medium py-1.5 rounded-lg transition-colors ${
            isGenerating
              ? isDark ? 'bg-zinc-800 text-zinc-500 cursor-wait' : 'bg-zinc-100 text-zinc-400 cursor-wait'
              : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
          }`}
        >
          {isGenerating ? 'Generating...' : `Generate ${generateCount}`}
        </button>
        <select
          value={generateCount}
          onChange={(e) => { e.stopPropagation(); onSetGenerateCount(Number(e.target.value)); }}
          onClick={(e) => e.stopPropagation()}
          className={`text-[10px] py-1.5 px-1 rounded-lg border appearance-none cursor-pointer ${
            isDark
              ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
              : 'bg-white border-zinc-300 text-zinc-600'
          }`}
        >
          {[1, 2, 4, 6].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// ██  Expanded Desire Panel
// ══════════════════════════════════════════════════════

function ExpandedDesirePanel({
  desire,
  ads,
  theme,
  onImageClick,
  onGenerate,
  isGenerating,
}: {
  desire: DeepDesire;
  ads: StoredImage[];
  theme: 'light' | 'dark';
  onImageClick: (img: StoredImage) => void;
  onGenerate: (count: number) => void;
  isGenerating: boolean;
}) {
  const isDark = theme === 'dark';
  const intensity = INTENSITY_CONFIG[desire.desireIntensity] || INTENSITY_CONFIG.moderate;

  return (
    <div className={`rounded-xl border p-4 transition-all duration-200 ${
      isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-zinc-200 bg-zinc-50/50'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${intensity.bg} ${intensity.text}`}>
              {desire.desireIntensity}
            </span>
            <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {desire.targetSegment}
            </span>
          </div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
            {desire.deepestDesire}
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Surface: {desire.surfaceProblem}
          </p>
        </div>
      </div>

      {/* Desire layers */}
      {desire.layers?.length > 0 && (
        <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-zinc-800/50' : 'bg-white'}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Desire Layers
          </div>
          <div className="space-y-1.5">
            {desire.layers.map((layer, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className={`text-[10px] font-mono w-4 flex-shrink-0 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  L{layer.level}
                </span>
                <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                  {layer.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Turning point */}
      {desire.turningPoint && (
        <div className={`mb-3 text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          <span className={`font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>Turning point: </span>
          {desire.turningPoint}
        </div>
      )}

      {/* Ad grid */}
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
        Ads ({ads.length})
      </div>

      {ads.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 mb-3">
          {ads.map((img) => (
            <div
              key={img.id}
              className={`aspect-square rounded-lg overflow-hidden cursor-pointer border transition-all hover:scale-[1.03] hover:shadow-md ${
                isDark ? 'border-zinc-700' : 'border-zinc-200'
              }`}
              onClick={() => onImageClick(img)}
            >
              <img
                src={img.htmlScreenshot ? `data:image/png;base64,${img.htmlScreenshot}` : `data:image/png;base64,${img.imageBase64}`}
                alt={img.label}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={`flex items-center justify-center py-6 rounded-lg border border-dashed mb-3 ${
          isDark ? 'border-zinc-700 text-zinc-600' : 'border-zinc-300 text-zinc-400'
        }`}>
          <span className="text-xs">No ads yet for this desire</span>
        </div>
      )}

      {/* Generate More */}
      <button
        onClick={() => onGenerate(4)}
        disabled={isGenerating}
        className={`w-full text-xs font-medium py-2 rounded-lg transition-colors ${
          isGenerating
            ? isDark ? 'bg-zinc-800 text-zinc-500 cursor-wait' : 'bg-zinc-100 text-zinc-400 cursor-wait'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {isGenerating ? 'Generating...' : `Generate ${ads.length === 0 ? '4' : 'More'} Ads`}
      </button>
    </div>
  );
}
