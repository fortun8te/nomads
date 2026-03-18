import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useCampaign } from '../context/CampaignContext';
import { useSoundEngine } from '../hooks/useSoundEngine';
import { ollamaService } from '../utils/ollama';
import { getChatModel, CHAT_MODEL_OPTIONS } from '../utils/modelConfig';
import { glassCard } from '../styles/tokens';
import type { BrandDNA, PersonaDNA, CreativeStrategy } from '../types';

// ══════════════════════════════════════════════════════
// ██  Brand Hub — Unified Brand DNA + Persona + Strategy
// ██  Single source of truth for all brand intelligence
// ══════════════════════════════════════════════════════

interface BrandHubDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // Pipeline-generated
  brandDNA?: BrandDNA;
  personas?: PersonaDNA[];
  creativeStrategy?: CreativeStrategy;
  // Preset data
  presetBrand?: Record<string, any>;
  presetAudience?: Record<string, any>;
  presetProduct?: Record<string, any>;
  presetCompetitive?: Record<string, any>;
  presetStrategy?: Record<string, any>;
  presetMessaging?: Record<string, any>;
  presetPersonas?: any[];
}

type HubTab = 'dna' | 'persona' | 'strategy';

export function BrandHubDrawer({
  isOpen,
  onClose,
  brandDNA,
  personas,
  creativeStrategy,
  presetBrand,
  presetAudience,
  presetProduct,
  presetCompetitive,
  presetStrategy,
  presetMessaging,
  presetPersonas,
}: BrandHubDrawerProps) {
  const { isDarkMode } = useTheme();
  const { play } = useSoundEngine();
  const [activeTab, setActiveTab] = useState<HubTab>('dna');
  const [activePersonaIdx, setActivePersonaIdx] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  // Play whoosh on drawer open
  useEffect(() => {
    if (isOpen) play('whoosh');
  }, [isOpen, play]);

  if (!isOpen) return null;

  const brandName = presetBrand?.name || brandDNA?.name || '';
  const positioning = presetBrand?.positioning || brandDNA?.positioning || '';
  const colorEntries = parseColorString(presetBrand?.colors);

  const tabs: { key: HubTab; label: string }[] = [
    { key: 'dna', label: 'DNA' },
    { key: 'persona', label: 'Persona' },
    { key: 'strategy', label: 'Strategy' },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={`absolute inset-0 ${isDarkMode ? 'bg-black/70' : 'bg-black/30'} backdrop-blur-md`} />

      <motion.div
        className={`relative w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden ${glassCard(isDarkMode)}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className={`absolute top-5 right-5 z-10 p-2 rounded-xl transition-all ${
            isDarkMode ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* ── Hero Header ── */}
        <div className={`flex-shrink-0 px-8 pt-8 pb-5 ${isDarkMode ? 'border-b border-zinc-800/60' : 'border-b border-zinc-100'}`}>
          <div className="flex items-center gap-4">
            <motion.div
              whileHover={{ scale: 1.2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ perspective: 600, transformStyle: 'preserve-3d' }}
            >
              <DNAIcon size={32} animated isDark={isDarkMode} />
            </motion.div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                  {brandName || 'Brand DNA'}
                </h1>
                <button
                  onClick={() => { play('tab'); setEditOpen(prev => !prev); }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wide transition-all ${
                    editOpen
                      ? isDarkMode
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                      : isDarkMode
                        ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 border border-zinc-800/60'
                        : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
                  }`}
                >
                  {editOpen ? 'Close Editor' : 'Edit'}
                </button>
              </div>
              {positioning && (
                <p className={`text-[13px] leading-relaxed mt-1 max-w-2xl ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {positioning}
                </p>
              )}
            </div>
          </div>

          {/* Color strip */}
          {colorEntries.length > 0 && (
            <div className="flex items-center gap-3 mt-4 ml-[46px]">
              {colorEntries.slice(0, 8).map((c, i) => (
                <div key={i} className="flex flex-col items-center gap-1 group cursor-default">
                  <div
                    className="w-8 h-8 rounded-lg border shadow-sm transition-transform group-hover:scale-110"
                    style={{ backgroundColor: c.hex, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
                    title={`${c.name} ${c.hex}${c.note ? ` — ${c.note}` : ''}`}
                  />
                  <span className={`text-[7px] font-mono ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{c.hex}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tabs with animated underline */}
          <div className="flex items-center gap-1 mt-5 ml-[46px] relative">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { if (activeTab !== key) play('tab'); setActiveTab(key); }}
                className={`relative px-4 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all ${
                  activeTab === key
                    ? isDarkMode
                      ? 'text-white'
                      : 'text-white'
                    : isDarkMode
                      ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                      : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                {activeTab === key && (
                  <motion.div
                    layoutId="brand-hub-tab"
                    className={`absolute inset-0 rounded-lg ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-900'}`}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Inline Edit Panel (slide-down) */}
          <motion.div
            initial={false}
            animate={{
              height: editOpen ? 'auto' : 0,
              opacity: editOpen ? 1 : 0,
            }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className={`border-b ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
              <ChatContent isDark={isDarkMode} />
            </div>
          </motion.div>

          {/* Tab content */}
          <div className="flex-1">
            {activeTab === 'dna' && (
              <DNAContent
                brandDNA={brandDNA}
                presetBrand={presetBrand}
                presetProduct={presetProduct}
                isDark={isDarkMode}
              />
            )}
            {activeTab === 'persona' && (
              <PersonaContent
                personas={personas}
                presetAudience={presetAudience}
                presetPersonas={presetPersonas}
                activeIdx={activePersonaIdx}
                onSelectIdx={(idx) => { play('select'); setActivePersonaIdx(idx); }}
                isDark={isDarkMode}
              />
            )}
            {activeTab === 'strategy' && (
              <StrategyContent
                strategy={creativeStrategy}
                presetStrategy={presetStrategy}
                presetCompetitive={presetCompetitive}
                presetMessaging={presetMessaging}
                isDark={isDarkMode}
              />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}


// ══════════════════════════════════════════════════════
// ██  Animated DNA Icon (exported)
// ══════════════════════════════════════════════════════

let _dnaCounter = 0;
export function DNAIcon({ size = 20, animated = false, isDark = false }: { size?: number; animated?: boolean; isDark?: boolean }) {
  const [uid] = useState(() => `dna-${++_dnaCounter}`);
  const violet = isDark ? '#6BA3FF' : '#2B79FF';
  const indigo = isDark ? '#4D8FFF' : '#1D6AE5';
  const glow = isDark ? 'rgba(43,121,255,0.45)' : 'rgba(43,121,255,0.3)';
  const glowLg = isDark ? 'rgba(43,121,255,0.2)' : 'rgba(43,121,255,0.12)';

  return (
    <div
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        perspective: animated ? 600 : undefined,
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        className={animated ? 'animate-[dna-spin_6s_linear_infinite]' : ''}
        style={{
          width: size,
          height: size,
          transformStyle: 'preserve-3d',
          filter: size >= 18 ? `drop-shadow(0 0 ${size * 0.15}px ${glow}) drop-shadow(0 0 ${size * 0.4}px ${glowLg})` : undefined,
        }}
      >
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
          <defs>
            <linearGradient id={`${uid}-a`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={isDark ? '#6BA3FF' : '#3B8AFF'} />
              <stop offset="100%" stopColor={isDark ? '#2B79FF' : '#1558C0'} />
            </linearGradient>
            <linearGradient id={`${uid}-b`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={isDark ? '#4D8FFF' : '#2B79FF'} />
              <stop offset="100%" stopColor={isDark ? '#1D6AE5' : '#1558C0'} />
            </linearGradient>
            {/* 3D glow filter */}
            <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {/* Back helix strand (slightly transparent for depth) */}
          <path d="M16 2C16 2 8 6 8 12s8 10 8 10" stroke={`url(#${uid}-b)`} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          {/* Rungs (connecting bars) */}
          <line x1="9.5" y1="5" x2="14.5" y2="5" stroke={violet} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <line x1="8" y1="9" x2="16" y2="9" stroke={indigo} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <line x1="8" y1="15" x2="16" y2="15" stroke={violet} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <line x1="9.5" y1="19" x2="14.5" y2="19" stroke={indigo} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          {/* Front helix strand (fully opaque for 3D depth) */}
          <path d="M8 2C8 2 16 6 16 12s-8 10-8 10" stroke={`url(#${uid}-a)`} strokeWidth="2.5" strokeLinecap="round" filter={size >= 18 ? `url(#${uid}-glow)` : undefined} />
          {/* Specular highlights for 3D feel */}
          {size >= 18 && (
            <>
              <circle cx="10" cy="5.5" r="1" fill="white" opacity={isDark ? 0.3 : 0.4} />
              <circle cx="14" cy="12" r="0.8" fill="white" opacity={isDark ? 0.2 : 0.3} />
              <circle cx="10" cy="18" r="0.6" fill="white" opacity={isDark ? 0.15 : 0.25} />
            </>
          )}
        </svg>
      </div>
      {animated && (
        <style>{`
          @keyframes dna-spin {
            0% { transform: rotateY(0deg) rotateX(5deg); }
            25% { transform: rotateY(90deg) rotateX(-3deg); }
            50% { transform: rotateY(180deg) rotateX(5deg); }
            75% { transform: rotateY(270deg) rotateX(-3deg); }
            100% { transform: rotateY(360deg) rotateX(5deg); }
          }
        `}</style>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════
// ██  DNA Tab — Brand Identity + Product (rich grid)
// ══════════════════════════════════════════════════════

function DNAContent({
  brandDNA,
  presetBrand,
  presetProduct,
  isDark,
}: {
  brandDNA?: BrandDNA;
  presetBrand?: Record<string, any>;
  presetProduct?: Record<string, any>;
  isDark: boolean;
}) {
  const hasDNA = !!brandDNA;
  const hasPreset = !!presetBrand;

  if (!hasDNA && !hasPreset) {
    return (
      <div className="px-8 py-6">
        <EmptyState icon="dna" message="No Brand DNA yet" sub="Run the pipeline or load a preset" isDark={isDark} />
      </div>
    );
  }

  // Pipeline-generated brandDNA display
  if (hasDNA && !hasPreset) {
    return (
      <div className="px-8 py-6 space-y-4">
        <CardSection title="Identity" isDark={isDark}>
          <GridField label="Name" value={brandDNA!.name} isDark={isDark} />
          <GridField label="Tagline" value={brandDNA!.tagline} isDark={isDark} />
          <GridField label="Mission" value={brandDNA!.mission} isDark={isDark} wide />
          {brandDNA!.values.length > 0 && (
            <div className={`col-span-2 ${fieldBg(isDark)} px-3 py-2.5 rounded-lg`}>
              <Lbl text="Values" isDark={isDark} />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {brandDNA!.values.map((v, i) => <Tag key={i} text={v} isDark={isDark} />)}
              </div>
            </div>
          )}
        </CardSection>

        <CardSection title="Voice & Personality" isDark={isDark}>
          <GridField label="Tone" value={brandDNA!.voiceTone} isDark={isDark} />
          <GridField label="Personality" value={brandDNA!.personality} isDark={isDark} />
        </CardSection>

        <CardSection title="Positioning" isDark={isDark}>
          <p className={`text-xs leading-relaxed col-span-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
            {brandDNA!.positioning}
          </p>
        </CardSection>

        {(brandDNA!.visualIdentity.primaryColors.length > 0 || brandDNA!.visualIdentity.fonts.length > 0) && (
          <CardSection title="Visual Identity" isDark={isDark}>
            {brandDNA!.visualIdentity.primaryColors.length > 0 && (
              <div className={`${fieldBg(isDark)} px-3 py-2.5 rounded-lg`}>
                <Lbl text="Primary Colors" isDark={isDark} />
                <div className="flex gap-2 mt-1.5">
                  {brandDNA!.visualIdentity.primaryColors.map((c, i) => <ColorSwatch key={i} color={c} isDark={isDark} />)}
                </div>
              </div>
            )}
            {brandDNA!.visualIdentity.accentColors.length > 0 && (
              <div className={`${fieldBg(isDark)} px-3 py-2.5 rounded-lg`}>
                <Lbl text="Accents" isDark={isDark} />
                <div className="flex gap-2 mt-1.5">
                  {brandDNA!.visualIdentity.accentColors.map((c, i) => <ColorSwatch key={i} color={c} isDark={isDark} />)}
                </div>
              </div>
            )}
            {brandDNA!.visualIdentity.fonts.length > 0 && (
              <GridField label="Fonts" value={brandDNA!.visualIdentity.fonts.join(', ')} isDark={isDark} />
            )}
            {brandDNA!.visualIdentity.moodKeywords.length > 0 && (
              <div className={`col-span-2 ${fieldBg(isDark)} px-3 py-2.5 rounded-lg`}>
                <Lbl text="Mood" isDark={isDark} />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {brandDNA!.visualIdentity.moodKeywords.map((k, i) => <Tag key={i} text={k} isDark={isDark} />)}
                </div>
              </div>
            )}
          </CardSection>
        )}
      </div>
    );
  }

  // ── Full Preset Display (rich grid) ──
  const b = presetBrand!;
  const pr = presetProduct;

  // Parse arrays
  const beliefs: string[] = Array.isArray(b.categoryBeliefs) ? b.categoryBeliefs : [];
  const narratives: string[] = Array.isArray(b.narrativeArcs) ? b.narrativeArcs : [];
  const milestones: string[] = Array.isArray(b.pivotalMilestones) ? b.pivotalMilestones : [];
  const ingredients: string[] = pr && Array.isArray(pr.ingredients) ? pr.ingredients : [];
  const emotionalBenefits: string[] = pr && Array.isArray(pr.emotionalBenefits) ? pr.emotionalBenefits : [];

  // Parse scent colors
  const scents: string[] = pr && Array.isArray(pr.scents) ? pr.scents : [];
  const scentColors = scents.map((s: string) => {
    const m = s.match(/#[0-9A-Fa-f]{6}/);
    return { text: s.replace(/#[0-9A-Fa-f]{6}/, '').replace(/[()]/g, '').trim(), hex: m?.[0] || '' };
  });

  return (
    <div className="px-8 py-6">
      <div className="grid grid-cols-2 gap-2.5">
        {/* ── Brand Identity ── */}
        <SectionHead text="Brand Identity" isDark={isDark} />
        <GridField label="Brand Why" value={b.brandWhy} isDark={isDark} wide />
        <GridField label="Tone of Voice" value={b.tone || b.toneOfVoice} isDark={isDark} wide />
        <GridField label="Personality" value={b.personality} isDark={isDark} />
        <GridField label="Big Enemy" value={b.bigEnemy} isDark={isDark} />
        <GridField label="Mission" value={b.missionStatement} isDark={isDark} wide />
        <GridField label="Vision" value={b.visionStatement} isDark={isDark} wide />
        <GridField label="Core Values" value={b.coreValues} isDark={isDark} />
        <GridField label="Brand Promise" value={b.brandPromise} isDark={isDark} />
        <GridField label="Fonts" value={b.fonts} isDark={isDark} />
        <GridField label="Website" value={b.website} isDark={isDark} />
        <GridField label="Socials" value={b.socials} isDark={isDark} />
        <GridField label="Industry" value={b.industry} isDark={isDark} />

        {/* Voice & Style */}
        <GridField label="Image Style" value={b.imageStyle} isDark={isDark} />
        <GridField label="Logo" value={b.logoStyle} isDark={isDark} />
        <GridField label="Visual Identity" value={b.visualIdentity} isDark={isDark} wide />
        <GridField label="Packaging" value={b.packagingDesign} isDark={isDark} />
        <GridField label="Sensory Brand" value={b.sensoryBrand} isDark={isDark} />

        {/* Story & Heritage */}
        <GridField label="Founder" value={b.founderPersona} isDark={isDark} wide />
        <GridField label="Founding Story" value={b.foundingStory} isDark={isDark} wide />
        <GridField label="First Product" value={b.firstProduct} isDark={isDark} wide />
        <GridField label="Key People" value={b.keyPeople} isDark={isDark} wide />
        <GridField label="Market Position" value={b.marketPosition} isDark={isDark} wide />
        <GridField label="Niche" value={b.nicheDefinition} isDark={isDark} wide />
        <GridField label="Emotional Differentiation" value={b.emotionalDifferentiation} isDark={isDark} wide />
        <GridField label="Unmet Needs" value={b.targetNeedsUnmet} isDark={isDark} wide />
        <GridField label="Buying Experience" value={b.buyingExperience} isDark={isDark} wide />
        <GridListField label="Category Beliefs" items={beliefs} isDark={isDark} />
        <GridListField label="Narrative Arcs" items={narratives} isDark={isDark} />
        <GridListField label="Milestones" items={milestones} isDark={isDark} />

        {/* ── Product ── */}
        {pr && (
          <>
            <SectionHead text="Product" isDark={isDark} />
            <GridField label="Product" value={pr.name} isDark={isDark} />
            <GridField label="Variant" value={pr.variant || pr.activeVariant} isDark={isDark} />
            <GridField label="Category" value={pr.category} isDark={isDark} />
            <GridField label="Pricing" value={pr.pricing} isDark={isDark} />
            <GridField label="Description" value={pr.description} isDark={isDark} wide />
            <GridField label="USP" value={pr.usp} isDark={isDark} wide />
            <GridField label="Mechanism" value={pr.uniqueMechanism || pr.mechanism} isDark={isDark} wide />
            <GridField label="Proven Results" value={pr.provenResults} isDark={isDark} wide />
            <GridField label="Clinical Results" value={pr.clinicalResults} isDark={isDark} wide />
            <GridField label="Social Proof" value={pr.socialProof} isDark={isDark} wide />
            <GridField label="Guarantee" value={pr.guarantee} isDark={isDark} />
            <GridField label="Packaging" value={pr.packaging || pr.format} isDark={isDark} />
            <GridField label="Best For" value={pr.bestFor} isDark={isDark} />
            <GridField label="Not For" value={pr.notFor} isDark={isDark} />

            {/* Ingredients as tags */}
            {ingredients.length > 0 && (
              <div className={`col-span-2 ${fieldBg(isDark)} px-3 py-2.5 rounded-lg`}>
                <Lbl text={`Ingredients (${ingredients.length})`} isDark={isDark} />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {ingredients.map((ing, i) => <Tag key={i} text={ing} isDark={isDark} />)}
                </div>
              </div>
            )}

            {/* Scent variants */}
            {scentColors.length > 0 && (
              <div className={`${fieldBg(isDark)} px-3 py-2.5 rounded-lg`}>
                <Lbl text="Scent Variants" isDark={isDark} />
                <div className="space-y-1 mt-1.5">
                  {scentColors.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {s.hex && <div className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: s.hex }} />}
                      <span className={`text-[10px] ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <GridListField label="Emotional Benefits" items={emotionalBenefits} isDark={isDark} />
          </>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════
// ██  Persona Tab — Audience & Persona data
// ══════════════════════════════════════════════════════

function PersonaContent({
  personas,
  presetAudience,
  presetPersonas,
  activeIdx,
  onSelectIdx,
  isDark,
}: {
  personas?: PersonaDNA[];
  presetAudience?: Record<string, any>;
  presetPersonas?: any[];
  activeIdx: number;
  onSelectIdx: (i: number) => void;
  isDark: boolean;
}) {
  const hasPersonas = personas && personas.length > 0;
  const hasPresetPersonas = presetPersonas && presetPersonas.length > 0;
  const active = hasPersonas ? personas[activeIdx] : null;

  // Pipeline personas
  if (hasPersonas) {
    return (
      <div className="px-8 py-6 space-y-4">
        {personas!.length > 1 && (
          <div className="flex gap-1.5">
            {personas!.map((p, i) => (
              <button
                key={p.id || i}
                onClick={() => onSelectIdx(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeIdx === i
                    ? isDark ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-white'
                    : isDark ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-300' : 'bg-zinc-100 text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {p.name?.split(',')[0] || `Persona ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {active && (
          <>
            <CardSection title={active.name} isDark={isDark}>
              {active.demographics && (
                <p className={`text-xs leading-relaxed col-span-2 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {active.demographics}
                </p>
              )}
            </CardSection>

            {active.psychographics && (
              <CardSection title="Psychographics" isDark={isDark}>
                <p className={`text-xs leading-relaxed col-span-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  {active.psychographics}
                </p>
              </CardSection>
            )}

            {active.painPoints?.length > 0 && (
              <CardSection title="Pain Points" isDark={isDark}>
                <BulletList items={active.painPoints} color="red" isDark={isDark} />
              </CardSection>
            )}

            {active.desires?.length > 0 && (
              <CardSection title="Desires" isDark={isDark}>
                <BulletList items={active.desires} color="emerald" isDark={isDark} />
              </CardSection>
            )}

            {active.language?.length > 0 && (
              <CardSection title="Their Language" isDark={isDark}>
                <div className="flex flex-wrap gap-1.5 col-span-2">
                  {active.language.map((l, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded-md text-xs italic ${
                      isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-700'
                    }`}>"{l}"</span>
                  ))}
                </div>
              </CardSection>
            )}

            {active.objections?.length > 0 && (
              <CardSection title="Objections" isDark={isDark}>
                <BulletList items={active.objections} color="amber" isDark={isDark} />
              </CardSection>
            )}

            {active.buyingTriggers?.length > 0 && (
              <CardSection title="Buying Triggers" isDark={isDark}>
                <div className="flex flex-wrap gap-1.5 col-span-2">
                  {active.buyingTriggers.map((t, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded-md text-xs ${
                      isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                    }`}>{t}</span>
                  ))}
                </div>
              </CardSection>
            )}

            {active.dayInLife && (
              <CardSection title="A Day in Their Life" isDark={isDark}>
                <p className={`text-xs leading-relaxed italic col-span-2 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {typeof active.dayInLife === 'string' ? active.dayInLife : Object.values(active.dayInLife).join(' · ')}
                </p>
              </CardSection>
            )}
          </>
        )}
      </div>
    );
  }

  // Preset personas
  if (hasPresetPersonas) {
    const pp = presetPersonas![0];
    return (
      <div className="px-8 py-6 space-y-4">
        <CardSection title={pp.name || 'Preset Persona'} isDark={isDark}>
          <GridField label="Age" value={pp.age} isDark={isDark} />
          <GridField label="Role" value={pp.role} isDark={isDark} />
          <GridField label="Core Pain" value={pp.corePain} isDark={isDark} wide />
          <GridField label="Deep Desire" value={pp.deepDesire} isDark={isDark} wide />
          <GridField label="Buying Trigger" value={pp.buyingTrigger} isDark={isDark} wide />
          {pp.objections?.length > 0 && (
            <div className={`col-span-2 ${fieldBg(isDark)} px-3 py-2.5 rounded-lg`}>
              <Lbl text="Objections" isDark={isDark} />
              <BulletList items={pp.objections} color="amber" isDark={isDark} />
            </div>
          )}
        </CardSection>
      </div>
    );
  }

  // Preset audience as persona fallback
  if (presetAudience) {
    const a = presetAudience;
    return (
      <div className="px-8 py-6">
        <div className="grid grid-cols-2 gap-2.5">
          <SectionHead text={a.name || 'Target Audience'} isDark={isDark} />
          <GridField label="Age" value={a.ageRange} isDark={isDark} />
          <GridField label="Location" value={a.location} isDark={isDark} />
          <GridField label="Income" value={a.income} isDark={isDark} />
          <GridField label="Job" value={a.job} isDark={isDark} />
          <GridField label="Current Situation" value={a.currentSituation} isDark={isDark} wide />
          <GridField label="Desired Situation" value={a.desiredSituation} isDark={isDark} wide />

          {/* Pain Points */}
          {a.painPoints && (
            <>
              <SectionHead text="Pain Points" isDark={isDark} />
              <GridField label="Primary" value={a.painPoints.primary} isDark={isDark} wide />
              <GridField label="Secondary" value={a.painPoints.secondary} isDark={isDark} wide />
              <GridField label="Tertiary" value={a.painPoints.tertiary} isDark={isDark} wide />
              <GridField label="Deepest" value={a.painPoints.deepestPain} isDark={isDark} wide />
            </>
          )}

          {/* Psychology */}
          <SectionHead text="Psychology" isDark={isDark} />
          <GridField label="Deep Desire" value={a.deepDesire} isDark={isDark} wide />
          <GridField label="Identity Shift" value={a.identityShift} isDark={isDark} wide />
          <GridField label="Deepest Fears" value={a.deepestFears} isDark={isDark} wide />
          <GridField label="Decision Style" value={a.decisionMakingStyle} isDark={isDark} />
          <GridField label="Loyalty Triggers" value={a.loyaltyTriggers} isDark={isDark} />

          {/* Buying Behavior */}
          <SectionHead text="Buying Behavior" isDark={isDark} />
          <GridField label="Buying Triggers" value={a.buyingTriggers} isDark={isDark} wide />
          <GridField label="Buying Journey" value={a.buyingJourney} isDark={isDark} wide />
          <GridField label="Purchase History" value={a.purchaseHistory} isDark={isDark} wide />
          <GridField label="Failed Solutions" value={a.failedSolutions} isDark={isDark} wide />
          <GridField label="Deal Breakers" value={a.dealBreakers} isDark={isDark} />
          <GridField label="Trust Factors" value={a.trustFactors} isDark={isDark} />

          {/* Psychographic Triggers */}
          {a.psychographicTriggers && (
            <>
              <SectionHead text="Psychographic Triggers" isDark={isDark} />
              <GridField label="Responds To" value={a.psychographicTriggers.respondTo} isDark={isDark} wide />
              <GridField label="Turn-offs" value={a.psychographicTriggers.turnOff} isDark={isDark} wide />
              <GridField label="Anxieties" value={a.psychographicTriggers.anxieties} isDark={isDark} wide />
              <GridField label="Aspirations" value={a.psychographicTriggers.aspirations} isDark={isDark} wide />
            </>
          )}

          {/* Platforms */}
          {a.platforms && (
            <>
              <SectionHead text="Platforms" isDark={isDark} />
              {Object.entries(a.platforms).map(([k, v]) => (
                <GridField key={k} label={k} value={v as string} isDark={isDark} />
              ))}
            </>
          )}

          {/* Lifestyle */}
          <SectionHead text="Lifestyle" isDark={isDark} />
          {typeof a.dayInLife === 'string' ? (
            <GridField label="Day in Life" value={a.dayInLife} isDark={isDark} wide />
          ) : a.dayInLife && typeof a.dayInLife === 'object' ? (
            <>
              <GridField label="Schedule" value={a.dayInLife.schedule} isDark={isDark} wide />
              <GridField label="Hair Routine" value={a.dayInLife.hairRoutineExact} isDark={isDark} wide />
              <GridField label="Friction Point" value={a.dayInLife.friction_point} isDark={isDark} wide />
              <GridField label="Ideal Scenario" value={a.dayInLife.ideal_scenario} isDark={isDark} wide />
            </>
          ) : null}
          <GridField label="Hobbies" value={a.hobbies} isDark={isDark} />
          <GridField label="Fashion" value={a.fashionStyle} isDark={isDark} />
          <GridField label="Entertainment" value={a.entertainment} isDark={isDark} wide />
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <EmptyState icon="persona" message="No personas yet" sub="Run the pipeline to generate" isDark={isDark} />
    </div>
  );
}


// ══════════════════════════════════════════════════════
// ██  Strategy Tab — Competitive + Messaging + Strategy
// ══════════════════════════════════════════════════════

function StrategyContent({
  strategy,
  presetStrategy,
  presetCompetitive,
  presetMessaging,
  isDark,
}: {
  strategy?: CreativeStrategy;
  presetStrategy?: Record<string, any>;
  presetCompetitive?: Record<string, any>;
  presetMessaging?: Record<string, any>;
  isDark: boolean;
}) {
  // Pipeline strategy
  if (strategy) {
    return (
      <div className="px-8 py-6 space-y-4">
        <BridgeDiagram strategy={strategy} isDark={isDark} />

        <div className="flex gap-3">
          <div className={`flex-1 rounded-xl border p-3 ${isDark ? 'bg-zinc-800/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <Lbl text="Awareness Level" isDark={isDark} />
            <p className={`text-xs font-medium mt-1 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {strategy.awarenessLevel}
            </p>
          </div>
          <div className={`flex-1 rounded-xl border p-3 ${isDark ? 'bg-zinc-800/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <Lbl text="Positioning" isDark={isDark} />
            <p className={`text-xs font-medium mt-1 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {strategy.positioningStatement}
            </p>
          </div>
        </div>

        <CardSection title="Current State" isDark={isDark}>
          <div className="col-span-2 space-y-3">
            <div>
              <Lbl text="Emotional State" isDark={isDark} />
              <p className={`text-xs leading-relaxed mt-1 italic ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {strategy.currentState.emotionalState}
              </p>
            </div>
            <div>
              <Lbl text="Pain Points" isDark={isDark} />
              <BulletList items={strategy.currentState.painPoints} color="red" isDark={isDark} />
            </div>
            {strategy.currentState.frustrations.length > 0 && (
              <div>
                <Lbl text="Frustrations" isDark={isDark} />
                <BulletList items={strategy.currentState.frustrations} color="orange" isDark={isDark} />
              </div>
            )}
            {strategy.currentState.triedBefore.length > 0 && (
              <div>
                <Lbl text="What They've Tried" isDark={isDark} />
                <BulletList items={strategy.currentState.triedBefore} color="zinc" isDark={isDark} />
              </div>
            )}
          </div>
        </CardSection>

        <CardSection title="The Bridge — Product" isDark={isDark}>
          <GridField label="Mechanism" value={strategy.bridge.mechanism} isDark={isDark} wide />
          <GridField label="Unique Angle" value={strategy.bridge.uniqueAngle} isDark={isDark} wide />
          {strategy.bridge.proofPoints.length > 0 && (
            <div className="col-span-2">
              <Lbl text="Proof Points" isDark={isDark} />
              <BulletList items={strategy.bridge.proofPoints} color="blue" isDark={isDark} />
            </div>
          )}
        </CardSection>

        <CardSection title="Desired State" isDark={isDark}>
          <div className="col-span-2 space-y-3">
            <div>
              <Lbl text="Transformation" isDark={isDark} />
              <p className={`text-xs leading-relaxed mt-1 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                {strategy.desiredState.transformation}
              </p>
            </div>
            <div>
              <Lbl text="Desires" isDark={isDark} />
              <BulletList items={strategy.desiredState.desires} color="emerald" isDark={isDark} />
            </div>
            {strategy.desiredState.turningPoints.length > 0 && (
              <div>
                <Lbl text="Turning Points" isDark={isDark} />
                <BulletList items={strategy.desiredState.turningPoints} color="violet" isDark={isDark} />
              </div>
            )}
          </div>
        </CardSection>

        <CardSection title="Ideal Life" isDark={isDark}>
          <GridField label="Vision" value={strategy.idealLife.vision} isDark={isDark} wide />
          <GridField label="Identity Shift" value={strategy.idealLife.identity} isDark={isDark} wide />
        </CardSection>

        <CardSection title="Messaging" isDark={isDark}>
          <div className="col-span-2 space-y-3">
            <div>
              <Lbl text="Headlines" isDark={isDark} />
              <div className="space-y-1.5 mt-1.5">
                {strategy.messaging.headlines.map((h, i) => (
                  <div key={i} className={`px-3 py-2 rounded-lg text-xs font-medium ${
                    isDark ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-800'
                  }`}>{h}</div>
                ))}
              </div>
            </div>

            <div>
              <Lbl text="Proof Hierarchy" isDark={isDark} />
              <ol className="space-y-1 mt-1.5">
                {strategy.messaging.proofHierarchy.map((p, i) => (
                  <li key={i} className={`text-xs leading-relaxed flex gap-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    <span className={`flex-shrink-0 w-4 text-right font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{i + 1}.</span>
                    {p}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <Lbl text="Conversation Starters" isDark={isDark} />
              <div className="space-y-1 mt-1.5">
                {strategy.messaging.conversationStarters.map((c, i) => (
                  <p key={i} className={`text-xs leading-relaxed italic ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>"{c}"</p>
                ))}
              </div>
            </div>

            <GridField label="Tone & Voice" value={strategy.messaging.toneAndVoice} isDark={isDark} wide />
          </div>
        </CardSection>
      </div>
    );
  }

  // Preset strategy + competitive + messaging fallback
  if (presetStrategy || presetCompetitive || presetMessaging) {
    return (
      <div className="px-8 py-6">
        <div className="grid grid-cols-2 gap-2.5">
          {/* Strategy */}
          {presetStrategy && (
            <>
              <SectionHead text="Creative Strategy" isDark={isDark} />
              <GridField label="Primary Angle" value={presetStrategy.primaryAngle} isDark={isDark} wide />
              {presetStrategy.supportingAngles?.length > 0 && (
                <GridListField label="Supporting Angles" items={presetStrategy.supportingAngles} isDark={isDark} />
              )}
              <GridField label="Tone Direction" value={presetStrategy.toneDirection} isDark={isDark} />
              <GridField label="Visual Direction" value={presetStrategy.visualDirection} isDark={isDark} />
              {presetStrategy.targetPlatforms?.length > 0 && (
                <GridField label="Platforms" value={presetStrategy.targetPlatforms.join(', ')} isDark={isDark} />
              )}
            </>
          )}

          {/* Competitive */}
          {presetCompetitive?.competitors?.length > 0 && (
            <>
              <SectionHead text="Competitive Landscape" isDark={isDark} />
              {presetCompetitive!.competitors.map((c: any, i: number) => (
                <div key={i} className={`col-span-2 ${fieldBg(isDark)} px-3 py-3 rounded-lg`}>
                  <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{c.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <GridFieldInline label="Positioning" value={c.positioning} isDark={isDark} />
                    <GridFieldInline label="Pricing" value={c.pricing} isDark={isDark} />
                    <GridFieldInline label="Strengths" value={c.strengths} isDark={isDark} />
                    <GridFieldInline label="Weaknesses" value={c.weaknesses} isDark={isDark} />
                  </div>
                </div>
              ))}
            </>
          )}

          {presetCompetitive?.marketGaps && (
            <GridField label="Market Gaps" value={presetCompetitive.marketGaps} isDark={isDark} wide />
          )}
          {presetCompetitive?.marketGap && (
            <GridField label="Market Gap" value={presetCompetitive.marketGap} isDark={isDark} wide />
          )}
          {presetCompetitive?.marketGapAnalysis?.primaryOpportunity && (
            <GridField label="Primary Opportunity" value={presetCompetitive.marketGapAnalysis.primaryOpportunity} isDark={isDark} wide />
          )}

          {/* Competitors list */}
          {presetCompetitive?.mainCompetitors?.length > 0 && (
            <GridListField label="Main Competitors" items={presetCompetitive!.mainCompetitors} isDark={isDark} />
          )}
          {presetCompetitive?.yourAdvantage?.length > 0 && (
            <GridListField label="Our Advantages" items={presetCompetitive!.yourAdvantage} isDark={isDark} />
          )}

          {/* Messaging */}
          {presetMessaging && (
            <>
              <SectionHead text="Messaging" isDark={isDark} />
              <GridField label="Core Message" value={presetMessaging.mainMessage || presetMessaging.coreMessage} isDark={isDark} wide />
              <GridField label="Tagline" value={presetMessaging.brandTagline} isDark={isDark} />
              <GridField label="Hero Message" value={presetMessaging.heroMessage} isDark={isDark} />
              {presetMessaging.testimonials?.length > 0 && (
                <GridListField label="Testimonials" items={presetMessaging.testimonials} isDark={isDark} />
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <EmptyState icon="strategy" message="No creative strategy yet" sub="Run the pipeline to generate" isDark={isDark} />
    </div>
  );
}


// ══════════════════════════════════════════════════════
// ██  Bridge Diagram
// ══════════════════════════════════════════════════════

function BridgeDiagram({ strategy, isDark }: { strategy: CreativeStrategy; isDark: boolean }) {
  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
      <div className={`relative h-32 ${isDark ? 'bg-zinc-800/30' : 'bg-zinc-50'}`}>
        <div className="absolute left-0 bottom-0 w-[30%] h-[70%] flex flex-col items-center justify-end pb-2"
          style={{ background: isDark ? 'linear-gradient(135deg, #3f3f46, #52525b)' : 'linear-gradient(135deg, #d4d4d8, #a1a1aa)', borderRadius: '0 12px 0 0' }}>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Current State</span>
          <span className={`text-[8px] mt-0.5 px-2 text-center ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            {strategy.currentState.painPoints[0]?.slice(0, 40) || 'Pain'}
          </span>
        </div>
        <div className="absolute left-[30%] right-[30%] top-[15%] h-4 flex items-center justify-center"
          style={{ background: isDark ? 'linear-gradient(90deg, #78716c, #a8a29e)' : 'linear-gradient(90deg, #a8a29e, #d6d3d1)', borderRadius: '4px' }}>
          <span className={`text-[8px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>Product</span>
        </div>
        <div className="absolute right-0 bottom-0 w-[30%] h-[70%] flex flex-col items-center justify-end pb-2"
          style={{ background: isDark ? 'linear-gradient(135deg, #365314, #3f6212)' : 'linear-gradient(135deg, #bbf7d0, #86efac)', borderRadius: '12px 0 0 0' }}>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>Desired State</span>
          <span className={`text-[8px] mt-0.5 px-2 text-center ${isDark ? 'text-emerald-500' : 'text-emerald-600'}`}>
            {strategy.desiredState.desires[0]?.slice(0, 40) || 'Desire'}
          </span>
        </div>
        <div className="absolute left-[28%] right-[28%] bottom-0 h-[45%]"
          style={{ background: isDark ? 'linear-gradient(180deg, transparent, rgba(59,130,246,0.15))' : 'linear-gradient(180deg, transparent, rgba(59,130,246,0.1))' }} />
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════
// ██  Shared Primitives
// ══════════════════════════════════════════════════════

function fieldBg(isDark: boolean) {
  return isDark ? 'bg-zinc-800/40' : 'bg-zinc-50';
}

function EmptyState({ icon, message, sub, isDark }: { icon: string; message: string; sub: string; isDark: boolean }) {
  return (
    <div className={`text-center py-16 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
      <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
        {icon === 'dna' && <DNAIcon size={24} isDark={isDark} />}
        {icon === 'persona' && (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={isDark ? 'text-zinc-600' : 'text-zinc-400'}>
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        )}
        {icon === 'strategy' && (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={isDark ? 'text-zinc-600' : 'text-zinc-400'}>
            <path d="M2 20h20M5 20V10l7-8 7 8v10" /><path d="M9 20v-4h6v4" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium mb-1">{message}</p>
      <p className="text-xs">{sub}</p>
    </div>
  );
}

/** Section divider for 2-column grid layout */
function SectionHead({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <div className={`col-span-2 pt-5 pb-1.5 border-b ${isDark ? 'border-zinc-800/60' : 'border-zinc-200/80'}`}>
      <span className={`font-mono text-[10px] uppercase tracking-[0.15em] font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
        {text}
      </span>
    </div>
  );
}

/** Card section with title + children grid */
function CardSection({ title, isDark, children }: { title: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`rounded-xl border p-4 ${isDark ? 'bg-zinc-800/30 border-zinc-800' : 'bg-zinc-50/80 border-zinc-200'}`}
    >
      <h3 className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{title}</h3>
      <div className="grid grid-cols-2 gap-2.5">
        {children}
      </div>
    </motion.div>
  );
}

/** Grid field — key/value card that sits in a 2-column grid */
function GridField({ label, value, isDark, wide, index = 0 }: { label: string; value?: string | null | Record<string, any>; isDark: boolean; wide?: boolean; index?: number }) {
  if (!value) return null;
  // Safely handle object values (from nested preset data)
  const displayValue = typeof value === 'object' ? Object.values(value).filter(v => typeof v === 'string').join(' · ') : String(value);
  if (!displayValue) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 400, damping: 30 }}
      className={`${fieldBg(isDark)} px-3 py-2.5 rounded-lg ${wide ? 'col-span-2' : ''}`}
    >
      <Lbl text={label} isDark={isDark} />
      <p className={`text-[11px] leading-relaxed mt-0.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>{displayValue}</p>
    </motion.div>
  );
}

/** Inline field for nested grids (no bg) */
function GridFieldInline({ label, value, isDark }: { label: string; value?: string | null; isDark: boolean }) {
  if (!value) return null;
  return (
    <div>
      <Lbl text={label} isDark={isDark} />
      <p className={`text-[10px] leading-relaxed mt-0.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>{value}</p>
    </div>
  );
}

/** Numbered list field spanning full width in grid */
function GridListField({ label, items, isDark }: { label: string; items: string[]; isDark: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`col-span-2 ${fieldBg(isDark)} px-3 py-2.5 rounded-lg`}>
      <Lbl text={label} isDark={isDark} />
      <div className="space-y-1 mt-1.5">
        {items.map((item, i) => (
          <div key={i} className={`text-[10px] leading-relaxed flex gap-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
            <span className={`flex-shrink-0 font-mono ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>{String(i + 1).padStart(2, '0')}</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Lbl({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <span className={`font-mono text-[9px] uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{text}</span>
  );
}

function Tag({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] ${isDark ? 'bg-zinc-700/60 text-zinc-300' : 'bg-zinc-200/80 text-zinc-700'}`}>{text}</span>
  );
}

function ColorSwatch({ color, isDark }: { color: string; isDark: boolean }) {
  const hex = color.startsWith('#') ? color : `#${color}`;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-5 rounded-md border" style={{ backgroundColor: hex, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
      <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{hex}</span>
    </div>
  );
}

const bulletColors: Record<string, { dark: string; light: string }> = {
  red: { dark: 'text-red-400/60', light: 'text-red-400' },
  orange: { dark: 'text-orange-400/60', light: 'text-orange-400' },
  amber: { dark: 'text-amber-400/60', light: 'text-amber-500' },
  emerald: { dark: 'text-emerald-400/60', light: 'text-emerald-500' },
  blue: { dark: 'text-blue-400/60', light: 'text-blue-500' },
  violet: { dark: 'text-blue-400/60', light: 'text-blue-500' },
  zinc: { dark: 'text-zinc-500', light: 'text-zinc-400' },
};

function BulletList({ items, color, isDark }: { items: string[]; color: string; isDark: boolean }) {
  const c = bulletColors[color] || bulletColors.zinc;
  return (
    <ul className="space-y-1.5 mt-1">
      {items.map((item, i) => (
        <li key={i} className={`text-xs leading-relaxed flex gap-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
          <span className={`flex-shrink-0 mt-0.5 ${isDark ? c.dark : c.light}`}>-</span>
          {item}
        </li>
      ))}
    </ul>
  );
}


// ══════════════════════════════════════════════════════
// ██  Chat Tab — Natural language brand editor
// ══════════════════════════════════════════════════════

function deepMerge(target: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(patch)) {
    const tv = target[key];
    const pv = patch[key];
    if (pv !== null && typeof pv === 'object' && !Array.isArray(pv) && typeof tv === 'object' && !Array.isArray(tv)) {
      result[key] = deepMerge(tv, pv);
    } else {
      result[key] = pv;
    }
  }
  return result;
}

function extractJSON(text: string): Record<string, any> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function buildContext(presetData: Record<string, any>): string {
  const snap: Record<string, any> = {};
  for (const s of ['brand', 'audience', 'product', 'competitive', 'messaging', 'creative']) {
    if (presetData[s]) snap[s] = presetData[s];
  }
  const full = JSON.stringify(snap, null, 2);
  return full.length <= 6000 ? full : full.slice(0, 5900) + '\n... (truncated)';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  status?: 'ok' | 'err';
  changedKeys?: string[];
}

function ChatContent({ isDark }: { isDark: boolean }) {
  const { campaign, updateCampaign } = useCampaign();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatModel, setChatModel] = useState(getChatModel());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-focus on mount
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, loading]);

  const submit = useCallback(async () => {
    const instruction = input.trim();
    if (!instruction || loading || !campaign?.presetData) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: instruction }]);
    setLoading(true);

    const presetData = campaign.presetData;
    const context = buildContext(presetData);
    const model = chatModel;

    const systemPrompt = `You are a brand data editor. You will receive the current brand brief as JSON and an edit instruction. Return ONLY a valid JSON object containing the fields to update, using the same nested structure. Only include changed fields. No explanation, no markdown, just the JSON object.`;
    const prompt = `Current brand data:\n${context}\n\nInstruction: "${instruction}"\n\nReturn ONLY the JSON delta (changed fields only).`;

    let fullResponse = '';

    try {
      await ollamaService.generateStream(prompt, systemPrompt, {
        model,
        temperature: 0.3,
        onChunk: (chunk: string) => { fullResponse += chunk; },
      });

      const delta = extractJSON(fullResponse);

      if (!delta || Object.keys(delta).length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', text: 'No changes detected. Try rephrasing your request.', status: 'err' }]);
        setLoading(false);
        return;
      }

      const newPresetData = deepMerge(presetData, delta);
      await updateCampaign({ presetData: newPresetData });

      const keys = Object.keys(delta);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Updated ${keys.join(', ')}`,
        status: 'ok',
        changedKeys: keys,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: String(err).slice(0, 120), status: 'err' }]);
    }

    setLoading(false);
  }, [input, loading, campaign, updateCampaign]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }, [submit]);

  if (!campaign?.presetData) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className={`text-sm ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>No brand data to edit</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 280, maxHeight: 360 }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#71717a' : '#a1a1aa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className={`text-[13px] font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>Edit your brand data</p>
            <div className={`text-[11px] leading-relaxed text-center max-w-sm ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
              <p>Ask in plain English to add, change, or remove anything.</p>
              <div className={`mt-3 space-y-1.5`}>
                {[
                  '"Add sustainability to core values"',
                  '"Change tone from clinical to warm"',
                  '"Add competitor: GlowLab, weakness: no subscription"',
                  '"Remove vitamin E from product features"',
                ].map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(ex.slice(1, -1))}
                    className={`block w-full text-left px-3 py-1.5 rounded-lg text-[11px] transition-colors ${
                      isDark ? 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'
                    }`}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? isDark ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-900 text-white'
                : msg.status === 'ok'
                  ? isDark ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : msg.status === 'err'
                    ? isDark ? 'bg-red-950/30 text-red-400 border border-red-900/30' : 'bg-red-50 text-red-600 border border-red-200'
                    : isDark ? 'bg-zinc-800/60 text-zinc-300' : 'bg-zinc-100 text-zinc-700'
            }`}>
              <p className="text-[12px] leading-relaxed">{msg.text}</p>
              {msg.changedKeys && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {msg.changedKeys.map(k => (
                    <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                    }`}>{k}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className={`rounded-2xl px-4 py-3 ${isDark ? 'bg-zinc-800/40' : 'bg-zinc-100'}`}>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? 'bg-zinc-500' : 'bg-zinc-400'}`} />
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? 'bg-zinc-500' : 'bg-zinc-400'}`} style={{ animationDelay: '0.2s' }} />
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? 'bg-zinc-500' : 'bg-zinc-400'}`} style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className={`flex-shrink-0 px-8 py-4 border-t ${isDark ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
        <div className={`relative rounded-xl border overflow-hidden ${isDark ? 'border-zinc-700/50 bg-zinc-800/40' : 'border-zinc-200 bg-zinc-50'}`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            placeholder="Ask anything about your brand data..."
            rows={2}
            className={`w-full px-4 pt-3 pb-10 text-[13px] leading-relaxed resize-none outline-none bg-transparent ${
              isDark ? 'text-zinc-200 placeholder-zinc-600' : 'text-zinc-800 placeholder-zinc-400'
            } disabled:opacity-50`}
          />
          <div className="absolute bottom-2 left-3 right-2 flex items-center gap-2">
            <select
              value={chatModel}
              onChange={e => { setChatModel(e.target.value); localStorage.setItem('chat_model', e.target.value); }}
              className={`text-[9px] font-medium rounded-md px-1.5 py-0.5 outline-none cursor-pointer border ${
                isDark
                  ? 'bg-zinc-800/60 text-zinc-500 border-zinc-700/50'
                  : 'bg-zinc-100 text-zinc-400 border-zinc-200'
              }`}
            >
              {CHAT_MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="flex-1" />
            <span className={`text-[9px] ${isDark ? 'text-zinc-700' : 'text-zinc-300'}`}>
              Enter to send
            </span>
            <button
              onClick={submit}
              disabled={!input.trim() || loading}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 ${
                isDark
                  ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                  : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}
            >
              {loading ? 'Updating...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════
// ██  Utilities
// ══════════════════════════════════════════════════════

/** Parse "Black #000000 (primary text) + Charcoal #252520 (dark backgrounds)" */
function parseColorString(colors?: string): { hex: string; name: string; note: string }[] {
  if (!colors || typeof colors !== 'string') return [];
  const entries: { hex: string; name: string; note: string }[] = [];
  const parts = colors.split('+').map(s => s.trim());
  for (const part of parts) {
    const m = part.match(/^(.+?)\s*(#[0-9A-Fa-f]{6})\s*(?:\((.+?)\))?/);
    if (m) entries.push({ name: m[1].trim(), hex: m[2], note: m[3] || '' });
  }
  return entries;
}
