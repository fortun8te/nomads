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
    creative: false,
    platforms: false,
  });

  const preset = campaign.presetData;
  if (!preset) return null;

  const borderCls = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const bgCls = isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50';
  const hoverCls = isDarkMode ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100/50';
  const labelCls = isDarkMode ? 'text-zinc-500' : 'text-zinc-400';
  const valCls = isDarkMode ? 'text-zinc-300' : 'text-zinc-700';
  const headerCls = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const Field = ({ label, value }: { label: string; value: string | undefined }) => {
    if (!value) return null;
    return (
      <div className={`${bgCls} p-2.5 rounded-lg`}>
        <div className={`font-mono text-[9px] uppercase tracking-wider ${labelCls} mb-0.5`}>{label}</div>
        <div className={`text-xs ${valCls} whitespace-pre-wrap`}>{value}</div>
      </div>
    );
  };

  const Section = ({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) => (
    <>
      <button
        onClick={() => toggleSection(id)}
        className={`w-full flex items-center justify-between gap-2 px-4 py-3 ${hoverCls} transition-colors border-b ${borderCls}`}
      >
        <span className={`font-mono text-[10px] uppercase tracking-[0.15em] font-bold ${headerCls}`}>
          {title}{subtitle && <span className={`ml-1.5 font-normal normal-case tracking-normal ${labelCls}`}>{subtitle}</span>}
        </span>
        <span className={`text-[10px] ${labelCls} shrink-0 transition-transform ${expandedSections[id] ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>
      {expandedSections[id] && (
        <div className={`px-4 py-3 space-y-2 border-b ${borderCls}`}>
          {children}
        </div>
      )}
    </>
  );

  return (
    <div className={`rounded-xl border ${borderCls} overflow-hidden ${
      isDarkMode
        ? 'bg-zinc-900 border-zinc-800/60'
        : 'bg-white border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
    }`}>
      {preset.brand && (
        <Section id="brand" title="Brand" subtitle={preset.brand.name}>
          <Field label="Name" value={preset.brand.name} />
          <Field label="Positioning" value={preset.brand.positioning} />
          <Field label="Brand Why" value={preset.brand.brandWhy} />
          <Field label="Colors" value={preset.brand.colors} />
          <Field label="Fonts" value={preset.brand.fonts} />
          <Field label="Voice / Tone" value={preset.brand.voiceTone || preset.brand.tone} />
        </Section>
      )}
      {preset.audience && (
        <Section id="audience" title="Audience" subtitle={preset.audience.name}>
          <Field label="Age Range" value={preset.audience.ageRange} />
          <Field label="Job" value={preset.audience.job} />
          <Field label="Primary Pain" value={preset.audience.painPoints?.primary} />
          <Field label="Deep Desire" value={preset.audience.painPoints?.deepDesire || preset.audience.deepDesire} />
          <Field label="Objections" value={preset.audience.painPoints?.objections || preset.audience.objections} />
          <Field label="Desired Situation" value={preset.audience.desiredSituation} />
          <Field label="Hobbies" value={preset.audience.hobbies} />
        </Section>
      )}
      {preset.product && (
        <Section id="product" title="Product" subtitle={preset.product.name}>
          <Field label="One-Liner" value={preset.product.oneLiner} />
          <Field label="USP" value={preset.product.usp} />
          <Field label="Price" value={preset.product.price} />
          <Field label="Key Benefits" value={Array.isArray(preset.product.keyBenefits) ? preset.product.keyBenefits.join(', ') : preset.product.keyBenefits} />
          <Field label="Scents / Variants" value={Array.isArray(preset.product.scents) ? preset.product.scents.join(', ') : preset.product.scents} />
          <Field label="Ingredients" value={preset.product.ingredients} />
        </Section>
      )}
      {preset.competitive && (
        <Section id="competitive" title="Competitive">
          <Field label="Market Gap" value={preset.competitive.marketGap} />
          <Field label="Main Competitors" value={Array.isArray(preset.competitive.mainCompetitors) ? preset.competitive.mainCompetitors.map((c: any) => typeof c === 'string' ? c : `${c.name} — ${c.positioning || c.weakness || ''}`).join('\n') : undefined} />
          <Field label="Positioning" value={preset.competitive.positioning} />
        </Section>
      )}
      {preset.creative && (
        <Section id="creative" title="Creative">
          <Field label="Top Performing Angles" value={preset.creative.topPerformingAngles} />
          <Field label="Untested Angles" value={preset.creative.untestedAngles} />
          <Field label="Contrarian Angles" value={preset.creative.contrarianAngles} />
          <Field label="Hook Bank" value={preset.creative.hookBank} />
          <Field label="Scroll-Stopping Visuals" value={preset.creative.scrollStoppingVisuals} />
          <Field label="Emotional vs Rational" value={preset.creative.emotionalVsRational} />
        </Section>
      )}
      {preset.messaging && (
        <Section id="messaging" title="Messaging">
          <Field label="Core Message" value={preset.messaging.mainMessage} />
          <Field label="Tagline" value={preset.messaging.brandTagline} />
          <Field label="Tone" value={preset.messaging.tone} />
        </Section>
      )}
      {preset.platforms && (
        <Section id="platforms" title="Platforms">
          <Field label="Primary" value={preset.platforms.primaryPlatform || preset.platforms.primary} />
          <Field label="Ad Formats" value={preset.platforms.adFormats} />
        </Section>
      )}
    </div>
  );
}
