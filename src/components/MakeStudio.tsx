/**
 * MakeStudio — SaaS-style ad creative generation tool
 *
 * Creatify-inspired UI: mode tabs, prompt input, reference images,
 * settings popover, gallery of generated ads.
 *
 * This is the DEFAULT view when app opens.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { ollamaService } from '../utils/ollama';

// ── Types ──

type AdMode = 'static' | 'carousel' | 'proofstack' | 'custom';
type AspectRatio = '1:1' | '9:16' | '4:5' | '16:9';

interface GeneratedAd {
  id: string;
  mode: AdMode;
  prompt: string;
  html: string;
  aspectRatio: AspectRatio;
  timestamp: number;
  conceptLabel?: string;
}

// ── Component ──

export function MakeStudio() {
  const { campaign, currentCycle } = useCampaign();

  // State
  const [activeMode, setActiveMode] = useState<AdMode>('static');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [count, setCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([]);
  const [selectedAd, setSelectedAd] = useState<GeneratedAd | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHtmlSource, setShowHtmlSource] = useState(false);

  const settingsRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Close settings popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettings]);

  // Auto-populate prompt from preset
  useEffect(() => {
    if (campaign?.presetData && !prompt) {
      const preset = campaign.presetData;
      const brand = preset.brand?.name || campaign.brand || '';
      const product = preset.product?.oneLiner || campaign.productDescription || '';
      setPrompt(`Create a high-converting ad for ${brand}. ${product}`);
    }
  }, [campaign]);

  // ── Mode definitions ──
  const modes: { key: AdMode; label: string; icon: string }[] = [
    { key: 'static', label: 'Image', icon: '◻' },
    { key: 'carousel', label: 'Carousel', icon: '▣' },
    { key: 'proofstack', label: 'Proof Stack', icon: '☰' },
    { key: 'custom', label: 'See more', icon: '✦' },
  ];

  // ── Aspect ratio dimensions for preview ──
  const aspectDimensions: Record<AspectRatio, { w: number; h: number }> = {
    '1:1': { w: 400, h: 400 },
    '9:16': { w: 360, h: 640 },
    '4:5': { w: 400, h: 500 },
    '16:9': { w: 640, h: 360 },
  };

  // ── Get research context from completed stages ──
  const getResearchContext = useCallback(() => {
    if (!currentCycle) return '';

    const parts: string[] = [];

    // Research findings
    if (currentCycle.researchFindings) {
      const rf = currentCycle.researchFindings;
      if (rf.deepDesires?.length) {
        parts.push(`CUSTOMER DESIRES: ${rf.deepDesires.map(d => d.deepestDesire).join('; ')}`);
      }
      if (rf.objections?.length) {
        parts.push(`OBJECTIONS: ${rf.objections.map(o => o.objection).join('; ')}`);
      }
      if (rf.avatarLanguage?.length) {
        parts.push(`CUSTOMER LANGUAGE: ${rf.avatarLanguage.slice(0, 5).join('; ')}`);
      }
    }

    // Taste output
    if (currentCycle.stages.taste?.status === 'complete' && currentCycle.stages.taste.agentOutput) {
      parts.push(`CREATIVE DIRECTION: ${currentCycle.stages.taste.agentOutput.slice(0, 500)}`);
    }

    // Competitor ad intelligence
    if (currentCycle.researchFindings?.competitorAds) {
      const ca = currentCycle.researchFindings.competitorAds;
      if (ca.industryPatterns?.unusedAngles?.length) {
        parts.push(`UNUSED ANGLES (OPPORTUNITY): ${ca.industryPatterns.unusedAngles.join(', ')}`);
      }
    }

    return parts.join('\n\n');
  }, [currentCycle]);

  // ── Get preset context ──
  const getPresetContext = useCallback(() => {
    if (!campaign?.presetData) return '';

    const preset = campaign.presetData;
    const parts: string[] = [];

    if (preset.brand) {
      parts.push(`BRAND: ${preset.brand.name} — ${preset.brand.positioning || ''}`);
      if (preset.brand.colors) parts.push(`COLORS: ${JSON.stringify(preset.brand.colors)}`);
      if (preset.brand.typography) parts.push(`FONTS: ${JSON.stringify(preset.brand.typography)}`);
    }

    if (preset.product) {
      parts.push(`PRODUCT: ${preset.product.oneLiner || ''}`);
      if (preset.product.keyBenefits) parts.push(`BENEFITS: ${preset.product.keyBenefits.join(', ')}`);
    }

    if (preset.audience) {
      parts.push(`AUDIENCE: ${preset.audience.primary || ''}`);
    }

    return parts.join('\n');
  }, [campaign]);

  // ── Format variation instructions ──
  const getModeInstructions = (mode: AdMode, index: number): string => {
    switch (mode) {
      case 'static':
        return 'STATIC HERO AD: Full-screen layout with bold headline overlay, product imagery area, social proof badge, and prominent CTA button. Single-view, scroll-stopping design.';
      case 'carousel':
        return `CAROUSEL AD (Slide ${index + 1} of ${count}): Design slide ${index + 1}. ${
          index === 0 ? 'Hook slide — attention-grabbing headline + visual' :
          index === count - 1 ? 'Final CTA slide — strong call to action + offer' :
          'Content slide — benefit/proof/feature with visual'
        }. Each slide must work independently but create a story together.`;
      case 'proofstack':
        return 'PROOF STACK AD: Vertical layout stacking social proof elements — testimonial quote, stats grid (3-4 metrics), feature badges, trust signals, and CTA. Heavy on credibility.';
      case 'custom':
        return 'CUSTOM FORMAT: Create the most effective layout for this specific product and audience. No constraints — optimize purely for conversion. Be creative with layout, animation, and interaction.';
      default:
        return '';
    }
  };

  // ── Generate ads ──
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerationProgress('Preparing...');
    setSelectedAd(null);

    const newAds: GeneratedAd[] = [];

    try {
      const researchContext = getResearchContext();
      const presetContext = getPresetContext();

      for (let i = 0; i < count; i++) {
        if (count > 1) {
          setGenerationProgress(`Generating ${i + 1} of ${count}...`);
        } else {
          setGenerationProgress('Generating ad...');
        }

        const dim = aspectDimensions[aspectRatio];
        const modeInstr = getModeInstructions(activeMode, i);

        const fullPrompt = `You are an elite ad creative designer. Generate a COMPLETE, PRODUCTION-READY HTML ad.

USER BRIEF: ${prompt}

${presetContext ? `BRAND CONTEXT:\n${presetContext}\n` : ''}
${researchContext ? `RESEARCH INTELLIGENCE:\n${researchContext}\n` : ''}

FORMAT: ${modeInstr}

DIMENSIONS: ${aspectRatio} (${dim.w}x${dim.h}px)

DESIGN RULES:
1. FULL VIEWPORT — The ad fills the entire ${dim.w}x${dim.h} container. No whitespace borders.
2. HOOK IN 0.5s — Headline must grab attention instantly
3. PROOF — Include at least 1 social proof element (stat, testimonial badge, rating)
4. CTA — High-contrast, prominent button. Use <button> tag
5. VISUAL HIERARCHY — Clear reading flow: hook → benefit → proof → CTA
6. COLORS — ${campaign?.brandColors || 'Use bold, high-contrast colors that pop'}
7. TYPOGRAPHY — ${campaign?.brandFonts || 'Modern, clean sans-serif. Import from Google Fonts if needed'}
8. RESPONSIVE — Must look perfect at exactly ${dim.w}x${dim.h}px
9. NO PLACEHOLDER TEXT — Use real, compelling copy based on the brief
10. MODERN CSS — Use gradients, shadows, subtle animations where appropriate

Output ONLY the complete HTML document. No explanation. Start with <!DOCTYPE html>.`;

        try {
          const html = await ollamaService.generateStream(
            fullPrompt,
            'You are a world-class ad designer. Output only valid HTML. Be creative and conversion-focused.',
            { model: 'gpt-oss:20b' }
          );

          // Extract just the HTML if there's extra text
          let cleanHtml = html;
          const htmlStart = html.indexOf('<!DOCTYPE html>') !== -1 ? html.indexOf('<!DOCTYPE html>') : html.indexOf('<html');
          const htmlEnd = html.lastIndexOf('</html>');
          if (htmlStart !== -1 && htmlEnd !== -1) {
            cleanHtml = html.substring(htmlStart, htmlEnd + 7);
          }

          if (cleanHtml.includes('<html') && cleanHtml.includes('</html>')) {
            const ad: GeneratedAd = {
              id: `ad-${Date.now()}-${i}`,
              mode: activeMode,
              prompt: prompt,
              html: cleanHtml,
              aspectRatio: aspectRatio,
              timestamp: Date.now(),
              conceptLabel: activeMode === 'carousel' ? `Slide ${i + 1}` : `Concept ${generatedAds.length + i + 1}`,
            };
            newAds.push(ad);
          }
        } catch (err) {
          console.error(`Generation ${i + 1} failed:`, err);
        }
      }

      if (newAds.length > 0) {
        setGeneratedAds(prev => [...newAds, ...prev]);
        setSelectedAd(newAds[0]);
      }
    } catch (err) {
      console.error('Generation failed:', err);
      setGenerationProgress('Generation failed. Try again.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  }, [prompt, isGenerating, count, activeMode, aspectRatio, campaign, getResearchContext, getPresetContext, generatedAds.length]);

  // ── Keyboard shortcut ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // ── Research status indicator ──
  const researchComplete = currentCycle?.stages?.research?.status === 'complete';
  const tasteComplete = currentCycle?.stages?.taste?.status === 'complete';
  const hasContext = researchComplete || campaign?.presetData;

  // ── Render ──

  return (
    <div className="min-h-screen bg-[#f7f7f8] flex flex-col">

      {/* ── Gallery / Canvas Area ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-8 overflow-y-auto">
        {selectedAd ? (
          /* ── Selected Ad Preview ── */
          <div className="flex flex-col items-center gap-4 w-full max-w-4xl">
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={() => setSelectedAd(null)}
                className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
              >
                ← All ads
              </button>
              <span className="text-sm font-medium text-zinc-700">
                {selectedAd.conceptLabel}
              </span>
              <span className="text-xs text-zinc-400">
                {selectedAd.aspectRatio} · {selectedAd.mode}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setShowHtmlSource(!showHtmlSource)}
                className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-all"
              >
                {showHtmlSource ? 'Preview' : 'HTML'}
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([selectedAd.html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedAd.conceptLabel?.replace(/\s+/g, '-').toLowerCase() || 'ad'}.html`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-all"
              >
                Download
              </button>
            </div>

            {showHtmlSource ? (
              <div className="w-full bg-zinc-900 rounded-2xl p-6 overflow-auto max-h-[70vh]">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{selectedAd.html}</pre>
              </div>
            ) : (
              <div
                className="bg-white rounded-2xl shadow-lg overflow-hidden"
                style={{
                  width: Math.min(aspectDimensions[selectedAd.aspectRatio].w, 500),
                  height: Math.min(aspectDimensions[selectedAd.aspectRatio].h, 700),
                }}
              >
                <iframe
                  srcDoc={selectedAd.html}
                  className="w-full h-full border-0"
                  title={selectedAd.conceptLabel || 'Ad Preview'}
                  sandbox="allow-scripts"
                />
              </div>
            )}
          </div>
        ) : generatedAds.length > 0 ? (
          /* ── Gallery Grid ── */
          <div className="w-full max-w-5xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-zinc-800">
                Generated Ads
                <span className="text-sm font-normal text-zinc-400 ml-2">{generatedAds.length}</span>
              </h2>
              <button
                onClick={() => setGeneratedAds([])}
                className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {generatedAds.map((ad) => (
                <button
                  key={ad.id}
                  onClick={() => { setSelectedAd(ad); setShowHtmlSource(false); }}
                  className="group relative bg-white rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden border border-zinc-100 hover:border-zinc-300 text-left"
                >
                  <div className="aspect-[3/4] overflow-hidden">
                    <iframe
                      srcDoc={ad.html}
                      className="w-full h-full border-0 pointer-events-none"
                      title={ad.conceptLabel || 'Ad'}
                      sandbox=""
                      style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: '200%', height: '200%' }}
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-zinc-700 truncate">{ad.conceptLabel}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{ad.aspectRatio} · {ad.mode}</p>
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors rounded-xl" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Empty State ── */
          <div className="flex flex-col items-center gap-4 text-center">
            {isGenerating ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
                </div>
                <p className="text-sm text-zinc-500">{generationProgress}</p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-2xl bg-white shadow-sm border border-dashed border-zinc-200 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 16l5-5 4 4 4-6 5 7" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Generate winning ad creatives</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {hasContext ? 'Research data ready — generation will use your insights' : 'Describe your ad or run research first for smarter output'}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Bar ── */}
      <div className="border-t border-zinc-200 bg-white px-6 py-4">
        {/* Mode Tabs */}
        <div className="flex justify-center gap-2 mb-4">
          {modes.map((mode) => (
            <button
              key={mode.key}
              onClick={() => setActiveMode(mode.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeMode === mode.key
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <span className="text-xs">{mode.icon}</span>
              {mode.label}
            </button>
          ))}
        </div>

        {/* Prompt Input Area */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-zinc-50 rounded-2xl border border-zinc-200 overflow-hidden">
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your ad concept..."
              rows={3}
              className="w-full px-5 py-4 bg-transparent resize-none text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none"
            />

            {/* Bottom Row: Context chips + Controls */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100">
              <div className="flex items-center gap-2">
                {/* Research status chips */}
                {researchComplete && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Research
                  </span>
                )}
                {tasteComplete && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-full text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    Taste
                  </span>
                )}
                {campaign?.presetData && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {campaign.brand} Preset
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* Count Stepper */}
                <div className="flex items-center gap-0 border border-zinc-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setCount(c => Math.max(1, c - 1))}
                    className="px-2.5 py-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-sm"
                    disabled={count <= 1}
                  >
                    −
                  </button>
                  <span className="px-3 py-1.5 text-sm font-medium text-zinc-700 min-w-[28px] text-center border-x border-zinc-200">
                    {count}
                  </span>
                  <button
                    onClick={() => setCount(c => Math.min(6, c + 1))}
                    className="px-2.5 py-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-sm"
                    disabled={count >= 6}
                  >
                    +
                  </button>
                </div>

                {/* Settings Gear */}
                <div className="relative" ref={settingsRef}>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all relative z-40"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1M5.636 5.636l.707.707m11.314 11.314l.707.707M5.636 18.364l.707-.707m11.314-11.314l.707-.707" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>

                  {/* Settings Popover */}
                  {showSettings && (
                    <div className="absolute bottom-full right-0 mb-3 w-72 bg-white rounded-2xl shadow-2xl border border-zinc-200 p-5 z-[9999] flex flex-col">
                      <div className="flex items-center justify-between mb-5 pb-4 border-b border-zinc-200">
                        <h3 className="text-sm font-bold text-zinc-900">Settings</h3>
                        <button
                          onClick={() => setShowSettings(false)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="space-y-5">
                        {/* Image Model */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-600">Model</span>
                          <span className="text-sm text-zinc-800 font-medium">Nano-Banana Pro</span>
                        </div>

                        {/* Aspect Ratio */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-600">Aspect ratio</span>
                          <select
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                            className="text-sm font-medium text-zinc-800 bg-white border border-zinc-300 rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 cursor-pointer"
                          >
                            <option value="9:16">9:16 — Social story</option>
                            <option value="4:5">4:5 — Social post</option>
                            <option value="1:1">1:1 — Square</option>
                            <option value="16:9">16:9 — Widescreen</option>
                          </select>
                        </div>

                        {/* Layout Engine */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-600">Layout engine</span>
                          <span className="text-xs text-zinc-400 font-medium">Qwen 20B</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isGenerating || !prompt.trim()
                      ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                      : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm hover:shadow-md'
                  }`}
                >
                  {isGenerating ? (
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L12 22M12 2L5 9M12 2L19 9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Keyboard hint */}
          <p className="text-center text-[11px] text-zinc-400 mt-2">
            ⌘ + Enter to generate
          </p>
        </div>
      </div>
    </div>
  );
}
