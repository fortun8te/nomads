/**
 * MakeStudio — HTML-first ad creative engine
 *
 * Primary mode (HTML Ads):
 *   LLM generates complete HTML ad creatives → screenshot = final deliverable.
 *   Multi-variant generation with live iframe preview and progressive gallery.
 *
 * Toggles (LLM is master):
 *   llmEnabled      — LLM generates ad creatives (master toggle, default ON)
 *   presetEnabled   — Inject campaign/brand preset data (default ON)
 *   researchEnabled — Inject research findings
 *   htmlEnabled     — HTML ad mode (default ON, recommended)
 *
 * Pipeline paths:
 *   HTML Ads (default): Brand bible + research → LLM → HTML → screenshot → gallery
 *   Freepik fallback:   LLM prompt → Freepik image model → gallery
 *   Direct:             User prompt → Image model → gallery
 *
 * All generated ads are persisted to IndexedDB and displayed in a gallery grid.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { useSoundEngine } from '../hooks/useSoundEngine';
import { ollamaService } from '../utils/ollama';
import { generateImage, checkServerStatus, preloadFreepik, restartFreepikBrowser, forceKillFreepik } from '../utils/freepikService';
import { storage, type StoredImage, type VisionRound } from '../utils/storage';
import { knowledge } from '../utils/knowledge';
import { NomadIcon } from './NomadIcon';
import { OrbitalLoader } from './OrbitalLoader';
import { tokenTracker } from '../utils/tokenStats';
import type { ReferenceImage } from '../types';
import { toPng } from 'html-to-image';
import { SIMPLETICS_PRESET } from '../utils/presetCampaigns';
import { pdfToImages } from '../utils/pdfUtils';
import { AdLibraryBrowser } from './AdLibraryBrowser';
import { getRelevantReferences, getCache, type AdDescription } from '../utils/adLibraryCache';
import { loadAdImageBase64 } from '../utils/adLibraryLoader';
import { ProductAngleCreator } from './ProductAngleCreator';
import { DesireBoard } from './DesireBoard';
import type { DeepDesire } from '../types';

// ── DebouncedTextarea — prevents re-rendering 6000-line parent on every keystroke ──

const DebouncedTextarea = React.memo(function DebouncedTextarea({
  value,
  onChange,
  onKeyDown,
  onPaste,
  placeholder,
  rows,
  className,
  textareaRef,
  onSound,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  rows?: number;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onSound?: () => void;
}) {
  const [localValue, setLocalValue] = React.useState(value);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync from parent when parent value changes externally (e.g. cleared after generation)
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setLocalValue(v); // Instant local update — no parent re-render
    onSound?.();

    // Debounce parent state sync — 150ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(v), 150);
  }, [onChange, onSound]);

  // Flush on unmount
  React.useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <textarea
      ref={textareaRef}
      value={localValue}
      onChange={handleChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      placeholder={placeholder}
      rows={rows}
      className={className}
    />
  );
});

// ── Types ──

type AdMode = 'static' | 'funnel' | 'custom';
type AspectRatio = '1:1' | '9:16' | '4:5' | '16:9' | '2:3' | '3:4';
interface VisionRoundSnapshot { round: number; screenshot: string; feedback: string; prompt?: string; }

/** Extract SHORT brand context for image prompts.
 *  Only primary palette (3-4 hex codes max) + font. No variant colors, no verbose descriptions. */
function getShortBrandContext(campaign: any): { colors: string; font: string } {
  const brandData = campaign?.presetData?.brand;
  const rawColors: string = brandData?.colors || campaign?.brandColors || '';
  // Extract just hex codes from the color string — take first 4 max
  const hexes = rawColors.match(/#[0-9A-Fa-f]{6}/g) || [];
  const shortColors = hexes.slice(0, 4).join(' ');
  const font = brandData?.fonts || campaign?.brandFonts || '';
  // Take just the first font family name
  const shortFont = font.split(',')[0]?.split('(')[0]?.trim() || '';
  return { colors: shortColors, font: shortFont };
}

/** Extract clean base64 strings from uploaded images.
 *  Strips data URL prefixes and filters out empty/corrupt entries
 *  so @img tags always match actual images sent to Freepik. */
function getCleanBase64s(images: ReferenceImage[]): string[] {
  return images
    .map(img => img.base64.includes(',') ? img.base64.split(',')[1] : img.base64)
    .filter(b64 => b64 && b64.length > 100); // <100 chars = corrupt/empty
}

/** Extract the image prompt from LLM JSON output.
 *  Nano Banana works best with SHORT prompts (20-50 words).
 *  The model can SEE the images — don't describe them, just reference @img tags. */
function extractImagePrompt(
  raw: string,
  opts?: { shortColors?: string; imageCount?: number }
): string {
  const trimmed = raw.trim();
  let prompt = '';

  try {
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const jsonStr = trimmed.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      if (parsed.prompt_for_image_model) {
        prompt = parsed.prompt_for_image_model;
      } else if (parsed.scene?.description) {
        prompt = parsed.scene.description;
      }
    }
  } catch {
    prompt = trimmed;
  }

  if (!prompt) prompt = trimmed;

  // Truncate to ~50 words max
  const words = prompt.split(/\s+/);
  if (words.length > 50) {
    prompt = words.slice(0, 50).join(' ');
  }

  // Ensure @img1 when images exist
  if (opts?.imageCount && opts.imageCount > 0 && !prompt.includes('@img')) {
    prompt = `@img1 product. ${prompt}`;
  }

  // Add short hex colors if missing (max 4 hex codes, not verbose strings)
  if (opts?.shortColors && !prompt.includes('#')) {
    prompt = `${prompt}. Colors: ${opts.shortColors}`;
  }

  return prompt;
}

/** Render HTML string in a hidden container and capture as base64 PNG */
async function captureHtmlScreenshot(
  html: string,
  width: number,
  height: number
): Promise<string | null> {
  // Create hidden container
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: -9999px; left: -9999px;
    width: ${width}px; height: ${height}px;
    overflow: hidden; background: white; z-index: -1;
  `;

  // Render HTML via iframe to isolate styles
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `width: ${width}px; height: ${height}px; border: none;`;
  container.appendChild(iframe);
  document.body.appendChild(container);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return null;

    // Validate HTML — must have opening tag
    if (!html || (html.indexOf('<') === -1 && html.indexOf('>') === -1)) {
      console.error('Invalid HTML: no tags found');
      return null;
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for rendering with timeout
    await new Promise(r => setTimeout(r, 800));

    // Capture the iframe body
    const body = iframeDoc.body;
    if (!body) return null;

    // Add timeout to image capture (toPng can hang on bad HTML)
    // IMPORTANT: catch the losing promise to prevent unhandled rejection crash
    const capturePromise = toPng(body, {
      width,
      height,
      style: { margin: '0', padding: '0' },
      canvasWidth: width,
      canvasHeight: height,
    }).catch((err) => {
      console.warn('toPng rejected (may be superseded by timeout):', err);
      return null as string | null;
    });

    let timedOut = false;
    const timeoutPromise = new Promise<string | null>((resolve) =>
      setTimeout(() => { timedOut = true; resolve(null); }, 8000)
    );

    const dataUrl = await Promise.race([capturePromise, timeoutPromise]);
    if (!dataUrl || timedOut) {
      console.error(`Screenshot ${timedOut ? 'timed out' : 'failed'} for ${width}x${height} HTML`);
      return null;
    }
    return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  } catch (err) {
    console.error('HTML screenshot capture failed:', err);
    console.error('Error details:', {
      type: err instanceof Error ? err.constructor.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      html: html.slice(0, 200),
    });
    // Silently continue without layout screenshot
    return null;
  } finally {
    try {
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ── HTML Ad Production Dimensions (screenshot = final deliverable, needs to be high-res) ──
const htmlAdDimensions: Record<AspectRatio, { w: number; h: number }> = {
  '1:1':  { w: 1080, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '4:5':  { w: 1080, h: 1350 },
  '16:9': { w: 1920, h: 1080 },
  '2:3':  { w: 1000, h: 1500 },
  '3:4':  { w: 1080, h: 1440 },
};

// ── HTML Ad Variant (generated ads before persistence) ──
interface RenderedImage {
  id: string;
  imageBase64: string;
  timestamp: number;
  model: string;
}

interface HtmlAdVariant {
  id: string;
  html: string;
  screenshotBase64: string;
  strategyLabel: string;
  aspectRatio: string;
  timestamp: number;
  inspiredBy?: string;
  renders: RenderedImage[];
  visionFeedback?: string;
}

/** Replace {{PRODUCT_IMG_N}} placeholders with real base64 data URIs */
function embedProductImages(html: string, images: ReferenceImage[]): string {
  let result = html;
  const productImages = images.filter(img => img.type === 'product');
  productImages.forEach((img, i) => {
    const placeholder = `{{PRODUCT_IMG_${i + 1}}}`;
    const dataUri = img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`;
    result = result.replaceAll(placeholder, dataUri);
  });
  // Also handle generic @imgN placeholders for all images
  images.forEach((img, i) => {
    const placeholder = `{{IMG_${i + 1}}}`;
    const dataUri = img.base64.startsWith('data:') ? img.base64 : `data:image/png;base64,${img.base64}`;
    result = result.replaceAll(placeholder, dataUri);
  });
  return result;
}

/** Extract clean HTML document from LLM output (strip markdown fences, extra text) */
function extractHtmlDocument(raw: string): string {
  let clean = raw.trim();
  // Strip markdown code fences
  clean = clean.replace(/^```html?\s*/i, '').replace(/```\s*$/, '').trim();

  // Find where the actual HTML starts (DOCTYPE or <html)
  const docStart = clean.indexOf('<!DOCTYPE') !== -1 ? clean.indexOf('<!DOCTYPE') : clean.indexOf('<html');
  const docEnd = clean.lastIndexOf('</html>');

  if (docStart >= 0 && docEnd > docStart) {
    // Preserve HTML comments that appear BEFORE <!DOCTYPE (Strategy, Inspired by)
    const preDoc = clean.slice(0, docStart);
    const comments = preDoc.match(/<!--[\s\S]*?-->/g) || [];
    const preserved = comments.join('\n');
    const htmlPart = clean.slice(docStart, docEnd + 7);
    clean = preserved ? `${preserved}\n${htmlPart}` : htmlPart;
  }
  return clean;
}

/** Extract strategy label from HTML comment: <!-- Strategy: PRODUCT HERO - PAS --> */
function extractStrategyLabel(html: string): string {
  const match = html.match(/<!--\s*Strategy:\s*(.+?)\s*-->/i);
  if (match) return match[1].trim();
  // Fallback: try <title> tag
  const titleMatch = html.match(/<title>(.+?)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  return 'HTML Ad';
}

/** Lightweight syntax highlighting for HTML code (regex-based, no parser) */
function highlightHtml(raw: string, isDark: boolean): string {
  const c = isDark
    ? { tag: '#93c5fd', attr: '#fbbf24', str: '#86efac', comment: '#6b7280', punct: '#a1a1aa' }
    : { tag: '#2563eb', attr: '#d97706', str: '#16a34a', comment: '#9ca3af', punct: '#71717a' };
  // HTML-escape
  let code = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Comments
  code = code.replace(/(&lt;!--[\s\S]*?--&gt;)/g, `<span style="color:${c.comment}">$1</span>`);
  // Tags
  code = code.replace(/(&lt;\/?)([\w-]+)/g, `<span style="color:${c.punct}">$1</span><span style="color:${c.tag}">$2</span>`);
  // Closing brackets
  code = code.replace(/(\/?&gt;)/g, `<span style="color:${c.punct}">$1</span>`);
  // Attributes
  code = code.replace(/\s([\w-]+)(=)/g, ` <span style="color:${c.attr}">$1</span>$2`);
  // Quoted strings
  code = code.replace(/"([^"]*)"/g, `<span style="color:${c.str}">"$1"</span>`);
  return code;
}

// ── Component ──

export function MakeStudio() {
  const { campaign, currentCycle, updateCampaign, createCampaign, isLoaded: campaignIsLoaded } = useCampaign();
  const { theme } = useTheme();
  const { play: playSound } = useSoundEngine();

  // Core state
  const [activeMode, setActiveMode] = useState<AdMode>('static');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null); // persists until dismissed
  const [generationStartTime, setGenerationStartTime] = useState(0);
  const [_generationEta, setGenerationEta] = useState(0); // seconds
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [_serverWarning, setServerWarning] = useState('');
  const [freepikReady, setFreepikReady] = useState<boolean | null>(null); // null = unchecked

  // Desire-targeted generation
  const targetDesireRef = useRef<DeepDesire | null>(null);
  const [generatingDesireId, setGeneratingDesireId] = useState<string | null>(null);
  const [desireFilter, _setDesireFilter] = useState<string | null>(null);

  // Image gallery state (persisted in IndexedDB)
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<StoredImage | null>(null);
  const [favoriteFilter, setFavoriteFilter] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [generatingForPrompt, setGeneratingForPrompt] = useState<string | null>(null);
  const [, setImagesLoaded] = useState(false);

  // Batch generation
  const [batchCount, setBatchCount] = useState(1);
  const [batchCurrent, setBatchCurrent] = useState(0); // 0 = not in batch
  const lastConceptRef = useRef<string>(''); // Stores first concept for future variation mode

  // HTML Ad variant state
  const [htmlVariants, setHtmlVariants] = useState<HtmlAdVariant[]>([]);
  const [currentHtmlPreview, setCurrentHtmlPreview] = useState<string>('');
  const [variantCount, setVariantCount] = useState(() => {
    if (typeof window === 'undefined') return 1;
    return parseInt(localStorage.getItem('html_variant_count') || '1', 10);
  });
  const [autoRenderHtml] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('html_auto_render') === 'true';
  });
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'streaming' | 'capturing' | 'between'>('idle');
  const [debouncedHtml, setDebouncedHtml] = useState('');
  const [codeDrawerOpen, setCodeDrawerOpen] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);
  const [templateLabel, setTemplateLabel] = useState<string>('');
  const codeEndRef = useRef<HTMLDivElement>(null);

  // ── Live token counter ──
  // Accumulates across entire generation run. Never resets mid-generation.
  const chunkCountRef = useRef(0);        // total chunks this generation run
  const chunkStartRef = useRef(0);        // timestamp of first onChunk
  const stepChunkRef = useRef(0);         // chunks in current sub-step (for t/s calc)
  const stepStartRef = useRef(0);         // start of current sub-step
  const [tokenDisplay, setTokenDisplay] = useState({
    tokens: 0, tps: 0, loading: false, thinking: false, sessionTotal: 0,
  });

  // Detect error messages in generationProgress and persist them
  useEffect(() => {
    const errorKeywords = /failed|error|not running|crashed|unavailable|invalid|check console/i;
    if (generationProgress && errorKeywords.test(generationProgress) && !isGenerating) {
      setGenerationError(generationProgress);
      setGenerationProgress('');
    }
  }, [generationProgress, isGenerating]);

  // Clear error when new generation starts
  useEffect(() => {
    if (isGenerating) setGenerationError(null);
  }, [isGenerating]);

  // Poll every 100ms while generating (any phase, not just streaming)
  useEffect(() => {
    if (!isGenerating) {
      // Reset on generation end
      if (tokenDisplay.tokens > 0) setTokenDisplay({ tokens: 0, tps: 0, loading: false, thinking: false, sessionTotal: 0 });
      return;
    }
    const poll = () => {
      const snap = tokenTracker.getSnapshot();
      const ownTokens = chunkCountRef.current;
      const tokens = Math.max(ownTokens, snap.liveTokens);
      // t/s from current sub-step (more accurate than total run)
      let tps = 0;
      if (stepStartRef.current && stepChunkRef.current > 3) {
        const elapsed = (Date.now() - stepStartRef.current) / 1000;
        if (elapsed > 0.3) tps = Math.round(stepChunkRef.current / elapsed);
      }
      if (tps === 0 && snap.tokensPerSec > 0) tps = snap.tokensPerSec;
      setTokenDisplay({
        tokens,
        tps,
        loading: snap.isModelLoading,
        thinking: snap.isThinking,
        sessionTotal: snap.sessionTotal,
      });
    };
    poll();
    const id = setInterval(poll, 150);
    return () => clearInterval(id);
  }, [isGenerating]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convenience alias so existing JSX doesn't need big refactor
  const tokenInfo = {
    liveTokens: tokenDisplay.tokens,
    tokensPerSec: tokenDisplay.tps,
    isModelLoading: tokenDisplay.loading,
    isThinking: tokenDisplay.thinking,
    sessionTotal: tokenDisplay.sessionTotal,
  };

  // Fun rotating status words (cycles during generation)
  const VIBE_WORDS = [
    'Accomplishing', 'Actioning', 'Actualizing', 'Analyzing', 'Baking', 'Bloviating',
    'Brewing', 'Brainstorming', 'Clauding', 'Cogitating', 'Combobulating', 'Concocting',
    'Contemplating', 'Creating', 'Cultivating', 'Designing', 'Developing', 'Elaborating',
    'Envisioning', 'Executing', 'Figuring', 'Generating', 'Honking', 'Imagining',
    'Implementing', 'Innovating', 'Integrating', 'Marinating', 'Optimizing', 'Planning',
    'Pondering', 'Processing', 'Prototyping', 'Ruminating', 'Simmering', 'Strategizing',
    'Synthesizing', 'Thinking', 'Translating', 'Visualizing', 'Whatchamacalliting',
    'Wrangling', 'Sketching', 'Drafting', 'Rendering', 'Compositing', 'Tweaking',
    'Iterating', 'Polishing', 'Pretending to work', 'Flex-rendering',
    'Smoking a cigar', 'Vaping', 'Taking a Zyn', 'Drinking coffee',
    'Contemplating life', 'Glazing Michael', 'Michael-fying', 'Michael-mixing',
    'Michaeling', 'Delegating', 'Outsourcing', 'Scope-creeping',
    'Nodding in standups', 'Circling back', 'Going offline',
    'Synergizing', 'Professionalizing', 'Defrosting VRAM',
  ];
  const [vibeHistory, setVibeHistory] = useState<string[]>([]);
  useEffect(() => {
    if (!isGenerating) { setVibeHistory([]); return; }
    const shuffled = [...VIBE_WORDS].sort(() => Math.random() - 0.5);
    setVibeHistory([shuffled[0]]);
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      setVibeHistory(prev => [shuffled[idx % shuffled.length], ...prev].slice(0, 12));
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating]);

  // Actual phase label (bold, gradient)
  const getPhaseLabel = (): string => {
    if (generationProgress?.includes('Vision')) return 'Vision QA';
    if (generationProgress?.includes('Thinking:')) return 'Vision QA';
    if (generationProgress?.includes('Refining')) return 'Refining';
    if (generationPhase === 'streaming') {
      if (tokenInfo.isModelLoading) return 'Loading model';
      if (tokenInfo.isThinking) return 'Thinking';
      return 'Writing';
    }
    if (generationPhase === 'capturing') return 'Capturing';
    if (generationPhase === 'between') return 'Next variant';
    if (generationProgress?.includes('Enhancing')) return 'Enhancing';
    if (generationProgress?.includes('Freepik') || generationProgress?.includes('Sending to')) return 'Freepik';
    return 'Generating';
  };
  // Current vibe word (lighter, fun)
  const currentVibe = vibeHistory.length > 0 ? vibeHistory[0] : '';

  // Image model settings (always visible — final output is always image model)
  const [imageModel, setImageModel] = useState('nano-banana-2');

  // Style settings for Freepik
  const [imageStyle, setImageStyle] = useState(() => localStorage.getItem('make_image_style') || '');
  const [customStyleImage, setCustomStyleImage] = useState<string>(() => localStorage.getItem('make_custom_style_image') || '');
  const [customStyleName, setCustomStyleName] = useState(() => localStorage.getItem('make_custom_style_name') || 'My Style');
  // Saved custom styles (persisted array of {name, base64})
  const [savedCustomStyles, setSavedCustomStyles] = useState<{name: string; base64: string}[]>(() => {
    try { return JSON.parse(localStorage.getItem('make_saved_custom_styles') || '[]'); } catch { return []; }
  });

  // Pipeline toggles (LLM is master — others depend on it)
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [presetEnabled, setPresetEnabled] = useState(true);   // Inject campaign/brand data
  const [htmlEnabled, setHtmlEnabled] = useState(false);      // HTML ads off by default
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [llmModel, setLlmModel] = useState(() => {
    const v = localStorage.getItem('make_llm_model');
    // Migrate: local 35b is too slow — force remote
    if (v?.startsWith('local:') && v.includes('35b')) { localStorage.removeItem('make_llm_model'); return 'qwen3.5:35b'; }
    return v || 'qwen3.5:35b';
  });
  const [htmlLlmModel, setHtmlLlmModel] = useState(() => {
    const v = localStorage.getItem('make_html_llm_model');
    if (v?.startsWith('local:') && v.includes('35b')) { localStorage.removeItem('make_html_llm_model'); return 'qwen3.5:35b'; }
    return v || 'qwen3.5:35b';
  });
  const [showResearchSummary, setShowResearchSummary] = useState(false);
  const [visionFeedbackEnabled, setVisionFeedbackEnabled] = useState(() => (localStorage.getItem('make_vision_feedback') || 'false') === 'true');
  const [visionRounds, setVisionRounds] = useState(() => parseInt(localStorage.getItem('make_vision_rounds') || '3', 10));

  // Vision model follows HTML model's routing (local: or remote)
  const visionModel = htmlLlmModel.startsWith('local:') ? 'local:minicpm-v:8b' : 'minicpm-v:8b';

  // Vision QA round history — for side-by-side comparison view
  const [visionHistory, setVisionHistory] = useState<VisionRoundSnapshot[]>([]);
  const [showVisionComparison, setShowVisionComparison] = useState(false);

  // LLM streaming output (visible during generation)
  const [llmOutput, setLlmOutput] = useState('');
  const llmOutputRef = useRef<HTMLDivElement>(null);

  // Ad library browser
  const [showAdLibrary, setShowAdLibrary] = useState(false);
  const [adLibraryEnabled, setAdLibraryEnabled] = useState(true);  // Inject reference ads into prompts

  // Reference Copy mode — skip HTML, generate via Freepik using ad library reference
  const [referenceCopyEnabled, setReferenceCopyEnabled] = useState(
    () => (localStorage.getItem('make_reference_copy') || 'false') === 'true'
  );
  const [referenceCopyTarget, setReferenceCopyTarget] = useState<{
    base64: string; description: string; category: string; filename: string; path: string; style?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('make_reference_copy_target');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  // Per-reference style brief — describes layout/composition/vibe (no brand content)
  // User fills this in manually. Used in prompt instead of "Recreate @img2 layout".
  const [referenceStyle, setReferenceStyle] = useState(() => localStorage.getItem('make_reference_style') || '');
  const [batchRefCount, setBatchRefCount] = useState(() => parseInt(localStorage.getItem('make_batch_ref_count') || '1', 10));

  // Research readiness check — blocks generation if research data is insufficient
  const [researchReadinessCheck, setResearchReadinessCheck] = useState(
    () => (localStorage.getItem('make_research_readiness') || 'false') === 'true'
  );
  const [researchReadinessWarning, setResearchReadinessWarning] = useState('');

  // Render phase (HTML → Freepik conversion)
  const [isRendering, setIsRendering] = useState(false);
  const [renderCurrent, setRenderCurrent] = useState(0);
  const [renderTotal, setRenderTotal] = useState(0);
  const [renderProgress, setRenderProgress] = useState('');
  const [renderCount, setRenderCount] = useState(1);
  const [expandedVariant, setExpandedVariant] = useState<string | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);

  // Grid layout columns (user-configurable)
  const [gridCols, setGridCols] = useState(10);
  const GRID_OPTIONS = [6, 8, 10, 12, 14, 16, 18, 20] as const;

  // Refine function state (chat box on detail modal — LLM for HTML, Freepik for images)
  const [refinePrompt, setRefinePrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refineProgress, setRefineProgress] = useState('');
  const [refineHistory, setRefineHistory] = useState<{ role: 'user' | 'result'; text: string; imageBase64?: string; htmlSource?: string }[]>([]);
  const refineAbortRef = useRef<AbortController | null>(null);
  const refineInputRef = useRef<HTMLTextAreaElement>(null);
  const [visionRoundIdx, setVisionRoundIdx] = useState(0); // Which round to show in iteration viewer

  // Knowledge system (single editable text → injected into LLM system prompt)
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [knowledgeDirty, setKnowledgeDirty] = useState(false);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);

  // Preset popup
  const [showPreset, setShowPreset] = useState(false);
  const [presetSections, setPresetSections] = useState<Record<string, boolean>>({ brand: true });
  const presetFileInputRef = useRef<HTMLInputElement>(null);
  const [analyzingImageIdx, setAnalyzingImageIdx] = useState<number | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);

  // Image uploads — sourced from campaign.referenceImages (shared across tabs)
  // Migrate old string[] format → ReferenceImage[] on the fly
  const uploadedImages: ReferenceImage[] = (() => {
    const raw = campaign?.referenceImages;
    if (!raw?.length) return [];
    // Old format detection: first element is a string (base64) not an object
    if (typeof (raw as any)[0] === 'string') {
      return (raw as unknown as string[]).map((b64, i) => ({
        base64: b64,
        label: `Image ${i + 1}`,
        description: '',
        type: 'product' as const,
      }));
    }
    return raw as ReferenceImage[];
  })();

  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const imageCountRef = useRef(0); // Track total images for labeling inside async loops
  const generationAbortRef = useRef<AbortController | null>(null);
  const [popoverPos, setPopoverPos] = useState({ bottom: 0, right: 0 });

  // ── ETA estimates per model (seconds) ──
  const MODEL_ETAS: Record<string, number> = {
    'nano-banana-2': 30,
    'seedream-5-lite': 15,
  };

  // ── Load persisted images from IndexedDB ──
  useEffect(() => {
    storage.getAllImages().then((images) => {
      setStoredImages(images);
      imageCountRef.current = images.length;
      setImagesLoaded(true);
    });
  }, []);

  // ── Countdown timer ──
  useEffect(() => {
    if (!isGenerating) {
      setGenerationElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setGenerationElapsed(Math.floor((Date.now() - generationStartTime) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [isGenerating, generationStartTime]);

  // Check Freepik server status on mount (skip when HTML mode is on — Freepik not needed)
  useEffect(() => {
    if (!htmlEnabled || !llmEnabled) {
      checkServerStatus().then(setFreepikReady);
    }
  }, [htmlEnabled, llmEnabled]);

  // Auto-scroll LLM output
  useEffect(() => {
    if (llmOutputRef.current) {
      llmOutputRef.current.scrollTop = llmOutputRef.current.scrollHeight;
    }
  }, [llmOutput]);

  // Clear refine state when detail modal opens/closes
  useEffect(() => {
    setRefinePrompt('');
    setRefineHistory([]);
    setIsRefining(false);
    setRefineProgress('');
    setVisionRoundIdx(0); // Reset iteration viewer to first round
  }, [selectedImage?.id]);

  // Load knowledge on mount
  useEffect(() => {
    knowledge.get().then(store => setKnowledgeContent(store.content || ''));
  }, []);

  // Auto-create Simpletics campaign if no campaign exists (wait for IndexedDB load first)
  useEffect(() => {
    if (!campaignIsLoaded) return; // Wait for IndexedDB load to finish
    if (!campaign) {
      const preset = SIMPLETICS_PRESET;
      const growth = (preset as any).growth || { goal: '', budget: '', timeline: [] };
      const goalStr = `${growth.goal} | Budget: ${growth.budget} | Timeline: ${Array.isArray(growth.timeline) ? growth.timeline[0] : ''}`;
      const productFeaturesArray = preset.product.features
        ? Object.entries(preset.product.features).map(([key, value]) => `${key}: ${value}`)
        : [];
      const pipelineMode = localStorage.getItem('pipeline_mode');
      const researchMode = pipelineMode === 'interactive' ? 'interactive' as const : 'autonomous' as const;

      createCampaign(
        preset.brand.name,
        preset.audience.name,
        goalStr,
        preset.product.description,
        productFeaturesArray,
        preset.product.pricing,
        researchMode,
        undefined,
        undefined,
        preset.brand.colors,
        preset.brand.fonts,
        undefined,
        preset as unknown as Record<string, any>
      );
    }
  }, [campaignIsLoaded]); // Run once after IndexedDB load completes

  // Auto-enable preset + LLM when campaign has preset data
  useEffect(() => {
    if (campaign?.presetData) {
      setPresetEnabled(true);
      setLlmEnabled(true);
    }
  }, [campaign?.id]); // Only re-run when campaign changes

  // Close settings popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const isClickOnButton = settingsButtonRef.current?.contains(target);
      const isClickOnPopover = popoverRef.current?.contains(target);
      if (!isClickOnButton && !isClickOnPopover) {
        setShowSettings(false);
      }
    }
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettings]);

  // Calculate popover position
  useEffect(() => {
    if (showSettings && settingsButtonRef.current) {
      const rect = settingsButtonRef.current.getBoundingClientRect();
      setPopoverPos({
        bottom: window.innerHeight - rect.top + 12,
        right: window.innerWidth - rect.right,
      });
    }
  }, [showSettings]);

  // Debounce HTML preview — update iframe every 400ms (not every token)
  useEffect(() => {
    if (!currentHtmlPreview) { setDebouncedHtml(''); return; }
    const t = setTimeout(() => setDebouncedHtml(currentHtmlPreview), 400);
    return () => clearTimeout(t);
  }, [currentHtmlPreview]);

  // Auto-scroll code panel to bottom (scroll within code pane only, not outer gallery)
  useEffect(() => {
    if (codeDrawerOpen && codeEndRef.current) {
      const container = codeEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [llmOutput, codeDrawerOpen]);

  // Auto-open code drawer when generation starts
  useEffect(() => {
    if (generationPhase === 'streaming') {
      setCodeDrawerOpen(true);
    }
  }, [generationPhase]);

  // Inject delete animation + grid background keyframes
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'nomad-card-delete-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes nomad-card-delete {
        0% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0px); }
        40% { opacity: 0.5; transform: scale(0.9) rotate(1.5deg); filter: blur(1px); }
        100% { opacity: 0; transform: scale(0.6) rotate(4deg); filter: blur(6px); }
      }

      @keyframes nomad-grid-noise {
        0% { opacity: 0.30; }
        8% { opacity: 0.37; }
        16% { opacity: 0.43; }
        24% { opacity: 0.39; }
        32% { opacity: 0.31; }
        40% { opacity: 0.24; }
        48% { opacity: 0.28; }
        56% { opacity: 0.36; }
        64% { opacity: 0.45; }
        72% { opacity: 0.41; }
        80% { opacity: 0.33; }
        88% { opacity: 0.25; }
        96% { opacity: 0.30; }
        100% { opacity: 0.30; }
      }

      @keyframes nomad-grid-wave {
        0% { opacity: 0.15; transform: translateY(0px) scaleY(0.95); }
        25% { opacity: 0.45; transform: translateY(-3px) scaleY(1.03); }
        50% { opacity: 0.65; transform: translateY(0px) scaleY(1.05); }
        75% { opacity: 0.40; transform: translateY(3px) scaleY(0.97); }
        100% { opacity: 0.15; transform: translateY(0px) scaleY(0.95); }
      }

      @keyframes nomad-grid-drift {
        0% { transform: translate(0, 0); }
        100% { transform: translate(13.5px, 13.5px); }
      }

      @keyframes nomad-bar-shimmer {
        0% { left: -40%; }
        100% { left: 140%; }
      }

      .nomad-bar-shimmer {
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%);
        width: 40%;
        position: absolute;
        top: 0;
        bottom: 0;
        animation: nomad-bar-shimmer 1.8s ease-in-out infinite;
      }

      .nomad-gen-banner {
        animation: nomad-banner-glow 3s ease-in-out infinite;
      }

      @keyframes nomad-banner-glow {
        0%, 100% { box-shadow: 0 0 20px rgba(161,161,170,0.05), 0 4px 20px rgba(0,0,0,0.2); }
        50% { box-shadow: 0 0 30px rgba(161,161,170,0.12), 0 4px 20px rgba(0,0,0,0.2); }
      }

      .nomad-grid-bg {
        background-image:
          radial-gradient(circle, rgba(113, 113, 122, 0.5) 0.8px, transparent 0.8px),
          radial-gradient(circle, rgba(113, 113, 122, 0.25) 0.4px, transparent 0.4px);
        background-size: 13.5px 13.5px, 27px 27px;
        background-position: 0 0, 6.75px 6.75px;
        animation: nomad-grid-drift 30s linear infinite, nomad-grid-noise 11s ease-in-out infinite;
        pointer-events: none;
        filter: blur(0.3px);
        transition: opacity 0.5s ease-in-out;
      }

      .nomad-grid-bg.wave {
        animation: nomad-grid-drift 30s linear infinite, nomad-grid-wave 6s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Knowledge handlers ──
  const handleKnowledgeSave = useCallback(async () => {
    setKnowledgeSaving(true);
    try {
      await knowledge.save(knowledgeContent);
      setKnowledgeDirty(false);
    } catch (err) {
      console.error('Knowledge save failed:', err);
    } finally {
      setKnowledgeSaving(false);
    }
  }, [knowledgeContent]);

  // ── Image upload handlers (ReferenceImage objects) ──
  const [pdfProcessing, setPdfProcessing] = useState(false);

  const addReferenceImages = useCallback((base64s: string[]) => {
    const newImages: ReferenceImage[] = base64s.map((b64, i) => ({
      base64: b64,
      label: `Image ${uploadedImages.length + i + 1}`,
      description: '',
      type: 'product' as const,
    }));
    updateCampaign({ referenceImages: [...uploadedImages, ...newImages] });
  }, [uploadedImages, updateCampaign]);

  // Add pre-built ReferenceImage objects (e.g. from PDF pages)
  const addReferenceImageObjects = useCallback((imgs: ReferenceImage[]) => {
    updateCampaign({ referenceImages: [...uploadedImages, ...imgs] });
  }, [uploadedImages, updateCampaign]);

  const updateReferenceImage = useCallback((index: number, updates: Partial<ReferenceImage>) => {
    const updated = uploadedImages.map((img, i) => i === index ? { ...img, ...updates } : img);
    updateCampaign({ referenceImages: updated });
  }, [uploadedImages, updateCampaign]);

  // Process a PDF file: render pages → add as guideline reference images
  const processPdfFile = useCallback(async (file: File) => {
    setPdfProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pages = await pdfToImages(arrayBuffer, { scale: 2, maxPages: 10 });
      const pdfName = file.name.replace(/\.pdf$/i, '');
      const newImages: ReferenceImage[] = pages.map((page) => ({
        base64: page.base64,
        label: `${pdfName} p${page.pageNumber}`,
        description: '',
        type: 'product' as const,
      }));
      addReferenceImageObjects(newImages);
    } catch (err) {
      console.error('PDF processing failed:', err);
    } finally {
      setPdfProcessing(false);
    }
  }, [addReferenceImageObjects]);

  // Unified file handler — handles images + PDFs
  const processUploadedFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const pdfFiles = files.filter(f => f.type === 'application/pdf');

    // Handle image files
    if (imageFiles.length > 0) {
      const promises = imageFiles.map(file => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      }));
      const results = await Promise.all(promises);
      addReferenceImages(results);
    }

    // Handle PDF files
    for (const pdf of pdfFiles) {
      await processPdfFile(pdf);
    }
  }, [addReferenceImages, processPdfFile]);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    if (files.length > 0) {
      playSound('drop');
      processUploadedFiles(files);
    }
  }, [processUploadedFiles, playSound]);

  const handleImageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processUploadedFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processUploadedFiles]);

  const removeUploadedImage = useCallback((index: number) => {
    updateCampaign({ referenceImages: uploadedImages.filter((_, i) => i !== index) });
  }, [uploadedImages, updateCampaign]);

  // Analyze reference image — streams vision output directly into description field
  const analyzeReferenceImage = useCallback(async (index: number) => {
    const img = uploadedImages[index];
    if (!img) return;
    // Abort any in-progress analysis
    analyzeAbortRef.current?.abort();
    const abort = new AbortController();
    analyzeAbortRef.current = abort;
    setAnalyzingImageIdx(index);
    updateReferenceImage(index, { description: '' });

    try {
      const rawBase64 = img.base64.includes(',') ? img.base64.split(',')[1] : img.base64;
      const preset = campaign?.presetData;
      const brandHint = preset?.brand?.name
        ? `Brand: "${preset.brand.name}" (${preset.brand.tagline || ''}).`
        : campaign?.brand ? `Brand: "${campaign.brand}".` : '';
      const typeHint = img.type === 'product' ? 'product shot' : 'layout reference';

      let accumulated = '';
      await ollamaService.generateStream(
        `${brandHint} This is a ${typeHint}. Output ONLY 10 keywords max describing: product form, colors, visible text on label, angle, background. Example: "white spray bottle, brown label, 'Vanilla Voyage' text, front angle, plain white background". No sentences, just comma-separated keywords.`,
        'Analyze this image in detail for marketing intelligence.',
        {
          model: visionModel,
          images: [rawBase64],
          signal: abort.signal,
          onChunk: (chunk) => {
            accumulated += chunk;
            updateReferenceImage(index, { description: accumulated.trim() });
          },
        }
      );
    } catch (err) {
      if (abort.signal.aborted) return; // cancelled, don't overwrite
      console.error('Vision analysis failed:', err);
      updateReferenceImage(index, { description: `[Analysis failed: ${err instanceof Error ? err.message : 'unknown error'}]` });
    } finally {
      if (analyzeAbortRef.current === abort) analyzeAbortRef.current = null;
      setAnalyzingImageIdx(null);
    }
  }, [uploadedImages, updateReferenceImage, campaign]);

  const cancelAnalyze = useCallback(() => {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    setAnalyzingImageIdx(null);
  }, []);

  // ── Clipboard paste handler for images ──
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return; // Let default text paste happen
    e.preventDefault();
    const files = imageItems.map(item => item.getAsFile()).filter(Boolean) as File[];
    const promises = files.map(file => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.readAsDataURL(file);
    }));
    Promise.all(promises).then(results => addReferenceImages(results));
  }, [addReferenceImages]);

  // ── Mode definitions ──
  const modes: { key: AdMode; label: string; icon: string }[] = [
    { key: 'static', label: 'Image', icon: '◻' },
    { key: 'funnel', label: 'Desires', icon: '◎' },
    { key: 'custom', label: 'See more', icon: '✦' },
  ];

  // ── Aspect ratio dimensions ──
  const aspectDimensions: Record<AspectRatio, { w: number; h: number }> = {
    '1:1': { w: 400, h: 400 },     // Instagram feed, Facebook
    '9:16': { w: 360, h: 640 },    // Stories, Reels, TikTok
    '4:5': { w: 400, h: 500 },     // Instagram portrait
    '16:9': { w: 640, h: 360 },    // YouTube, Facebook landscape
    '2:3': { w: 400, h: 600 },     // Pinterest pin
    '3:4': { w: 450, h: 600 },     // Social portrait
  };

  // ── Build current settings context for LLM ──
  const getSettingsContext = useCallback(() => {
    const dim = aspectDimensions[aspectRatio];
    const imgSummary = uploadedImages.length > 0
      ? uploadedImages.map((img, i) => `@img${i + 1} (${img.type}: ${img.label})`).join(', ')
      : 'none';
    return `CURRENT SETTINGS:
- Aspect ratio: ${aspectRatio} (${dim.w}x${dim.h}px)
- Image model: ${imageModel === 'nano-banana-2' ? 'Google Nano Banana 2 (photorealistic, high quality)' : 'Seedream 5 Lite (fast, good quality)'}
- Batch count: ${batchCount}
- Reference images: ${imgSummary}`;
  }, [aspectRatio, imageModel, batchCount, uploadedImages]);

  // ── Layered system prompt — AD ENGINE (static ad creative expertise) ──
  const knowledgeBlock = knowledgeContent.trim()
    ? `\n--- DOMAIN KNOWLEDGE ---\n${knowledgeContent.trim()}\n`
    : '';

  const JSON_SYSTEM_PROMPT = `--- IDENTITY ---
You are an AD ENGINE — an elite performance creative strategist who has studied thousands of winning static ads across Instagram, Facebook, TikTok, and Pinterest. You don't just describe pretty images. You engineer AD CREATIVES that convert — every element has a strategic purpose: the hook, the visual hierarchy, the product placement, the emotional trigger, the implied CTA.

You think like a media buyer who's spent $50M on paid social. You know what stops thumbs, what drives clicks, and what converts. You've internalized the patterns of top-performing DTC ads.

--- STATIC AD CREATIVE KNOWLEDGE BASE ---
You have deep expertise in these ad frameworks and apply them strategically:

WINNING AD FORMATS (static):
1. PRODUCT-AS-HERO: Product dominates 40-60% of frame. Clean background in brand colors. Bold implied headline zone top or bottom. Works for: launches, retargeting, catalog ads.
2. UGC-STYLE: Looks like a real person took a photo of the product in their life. Slightly imperfect framing. Phone camera perspective. Works for: cold audiences, trust-building.
3. LIFESTYLE INTEGRATION: Product naturally embedded in an aspirational scene. The viewer sees themselves in the image. Works for: desire-based angles, top-of-funnel.
4. PROBLEM-SOLUTION SPLIT: Visual tension between a "before" state (left/top) and "after" state with product (right/bottom). Works for: pain point ads, comparison angles.
5. INGREDIENT/SCIENCE CLOSE-UP: Extreme close-up of product texture, ingredient visualization, or application moment. Works for: education, differentiation.
6. SOCIAL PROOF COMPOSITE: Product surrounded by visual evidence of popularity — reviews overlay style, "as seen in" feel, multiple-people context. Works for: mid-funnel, objection handling.
7. UNBOXING/FIRST-MOMENT: The reveal — product emerging from packaging, first-use anticipation. Works for: gifting, luxury positioning.
8. FLAT LAY EDITORIAL: Overhead curated arrangement telling a lifestyle story. Product is the star among complementary props. Works for: brand building, Pinterest, lifestyle targeting.

COPY FRAMEWORKS (for headline/hook strategy — NOT rendered as text in the image):
- PAS: Pain → Agitate → Solution ("Tired of frizz? Your hair deserves better. Meet [product]")
- AIDA: Attention → Interest → Desire → Action
- BAB: Before → After → Bridge (show transformation)
- "The One Thing": Single compelling claim that reframes the category
- Social Proof Hook: Lead with proof ("50,000 women switched to...")
- Curiosity Gap: Create an open loop ("The ingredient dermatologists won't tell you about")
- Direct Benefit: Clear value proposition ("Beach waves in 30 seconds")

WHAT MAKES ADS WIN (from $50M in tested creative):
- High contrast between product and background = 2x higher CTR
- Human hands holding the product = 40% more engagement than product alone
- Brand colors used in background/scene (not just on product) = stronger brand recall
- One clear focal point — cluttered ads get scrolled past
- The product should be identifiable within 0.5 seconds of viewing
- Emotional scenes outperform rational ones for cold audiences
- Specific beats generic: "Beach waves in 30 seconds" beats "Great hair product"
- The best ads make the viewer imagine themselves using the product
- Pattern interrupts (unexpected angles, bold colors, unusual compositions) stop the scroll

PLATFORM KNOWLEDGE:
- Instagram Feed: Square or 4:5. Clean, editorial. Product must pop against feed clutter.
- Instagram Stories/Reels: 9:16. Full-bleed, immersive. Bold, immediate hook.
- Facebook Feed: 1:1 or 4:5. Thumb-stopping contrast. More explicit value prop.
- TikTok: 9:16. Raw, authentic feel. UGC-style outperforms polished.
- Pinterest: 2:3 or 9:16. Aspirational, save-worthy. Lifestyle integration works best.

--- BRAND INTEGRATION RULES ---
When brand/preset data is provided, you MUST:
- Use the brand's EXACT color palette as the scene's visual foundation — backgrounds, props, wardrobe, lighting tints
- Match the brand's visual identity (minimalist? bold? playful? clinical?) in every composition choice
- Describe the product's EXACT packaging appearance — shape, colors, label layout, materials
- Maintain the brand's voice/tone even in visual storytelling (if the brand is minimal and clean, don't create chaotic compositions)
- The ad must look like it belongs on THIS brand's actual Instagram feed, not a generic brand's

--- STRATEGIC REASONING ---
Before outputting, think through these steps:
1. ANGLE: What's the strategic hook? (desire, pain point, social proof, curiosity, transformation)
2. FORMAT: Which of the 8 ad formats best serves this angle and funnel position?
3. COPY FRAMEWORK: What copy approach would pair with this visual? (PAS, AIDA, BAB, etc.)
4. PRODUCT ROLE: How does the product appear? (hero, in-use, integrated, revealed)
5. SCROLL-STOP: What specific visual element will make someone STOP scrolling? (bold color contrast, human element, unexpected angle, dramatic lighting)
6. BRAND FIT: Does every element (colors, mood, composition, energy level) match this brand's identity?
7. EMOTION: What should the viewer FEEL in the first 0.5 seconds?
${knowledgeBlock}
--- EXAMPLE ---
Example output (adapt to the brand and angle — don't copy):
{
  "ad_strategy": {
    "ad_format": "LIFESTYLE INTEGRATION",
    "copy_framework": "BAB — Before (bad hair days) → After (effortless waves) → Bridge (this product)",
    "funnel_position": "Top-of-funnel — desire-based, cold audience",
    "scroll_stop_element": "Golden backlit spray mist catching sunlight — visual magic moment",
    "why_this_wins": "Aspirational but achievable. Viewer sees themselves. Product is the bridge between their current state and desired state."
  },
  "meta": {
    "ad_angle": "Desire — effortless beach-ready hair",
    "emotional_driver": "Aspiration for effortless cool-girl confidence",
    "headline_concept": "Beach hair, anywhere",
    "image_type": "Photo"
  },
  "scene": {
    "description": "A candid lifestyle ad. A woman's hand with natural nails holds the white spray bottle with warm brown branding up near sun-kissed wavy hair. She's mid-spray — a fine mist catches golden sunlight. Sun-drenched bathroom, round mirror reflecting morning light. Brand colors echoed: warm wood shelf, white marble counter, warm brown towel. Intimate over-the-shoulder perspective — like catching your cool friend's morning routine.",
    "time_of_day": "Morning golden light",
    "mood": "Warm, sun-drenched, intimate",
    "lighting": "Natural window backlight creating rim light on hair and illuminating spray mist. Warm color temp."
  },
  "color_palette": {
    "dominant": ["#FFFFFF", "#8B6F47", "#F5F0EB"],
    "accent": ["warm wood tones", "sun-gold highlights"],
    "contrast": "Medium — warm and inviting, not harsh"
  },
  "composition": {
    "camera_angle": "Over-the-shoulder, slightly elevated — intimate POV",
    "framing": "Medium close-up — product and hair interaction fills frame",
    "depth_of_field": "Shallow — product sharp, background soft bokeh",
    "focal_point": "Spray mist catching light between bottle and hair",
    "product_prominence": "25% of frame — prominent but contextual, IN USE",
    "text_overlay_zone": "Top 20% of frame — clean sky/wall area for headline overlay in post-production"
  },
  "product_placement": {
    "position": "Center-right, held at shoulder height",
    "state": "Being actively sprayed — mist visible, actuator pressed",
    "appearance": "White bottle with warm brown (#8B6F47) label text, matte plastic",
    "interaction": "Hand holding at 30-degree angle, nozzle aimed at hair"
  },
  "prompt_for_image_model": "@img1 product on marble counter, colors #FFFFFF #8B6F47 #F5F0EB, morning sunlight, eucalyptus sprigs, soft shadows, clean minimal ad"
}

--- OUTPUT FORMAT ---
Output a single valid JSON object. No markdown fences, no explanation, no text before or after the JSON.

JSON schema (fill every field):
{
  "ad_strategy": {
    "ad_format": "Which of the 8 winning ad formats (PRODUCT-AS-HERO, UGC-STYLE, LIFESTYLE INTEGRATION, PROBLEM-SOLUTION SPLIT, INGREDIENT/SCIENCE, SOCIAL PROOF, UNBOXING/FIRST-MOMENT, FLAT LAY EDITORIAL)",
    "copy_framework": "Which copy framework and why (PAS, AIDA, BAB, The One Thing, Social Proof Hook, Curiosity Gap, Direct Benefit)",
    "funnel_position": "Where in the funnel does this ad sit? (cold/warm/hot audience)",
    "scroll_stop_element": "The ONE specific visual element that stops the scroll",
    "why_this_wins": "In one sentence — why would this ad outperform? What pattern from winning ads does it leverage?"
  },
  "meta": {
    "ad_angle": "The strategic hook (desire, pain point, social proof, transformation, curiosity, scarcity)",
    "emotional_driver": "The specific emotion triggered in 0.5 seconds (not generic — be precise)",
    "headline_concept": "Ad headline concept — 7 words max (for creative direction, not rendered in image)",
    "image_type": "Photo|Illustration|3D Render|Flat Lay"
  },
  "scene": {
    "description": "Full scene in one vivid paragraph — what MOMENT is captured? What's happening? What does the viewer feel?",
    "time_of_day": "Lighting time context",
    "mood": "The overall feeling/atmosphere",
    "lighting": "Light source, direction, quality, color temperature — all in one description"
  },
  "color_palette": {
    "dominant": ["#hex1", "#hex2", "#hex3 — must use brand colors"],
    "accent": ["specific accent color names from brand palette"],
    "contrast": "High|Medium|Low — and why"
  },
  "composition": {
    "camera_angle": "Specific angle that serves the ad strategy",
    "framing": "How tight/wide and what's included",
    "depth_of_field": "Shallow|Medium|Deep — and what's sharp vs soft",
    "focal_point": "The ONE element that draws the eye first",
    "product_prominence": "% of frame the product occupies and its visual weight",
    "text_overlay_zone": "Where headline/CTA text would go in post-production (top/bottom/left/right + % of frame)"
  },
  "product_placement": {
    "position": "Where in the frame (rule-of-thirds position)",
    "state": "What the product is DOING (in-use, held, displayed, revealed, mid-action)",
    "appearance": "EXACT visual description matching brand data — colors, shape, label, materials",
    "interaction": "How a person/hand/scene interacts with the product"
  },
  "prompt_for_image_model": "SHORT INSTRUCTION — 20-40 words MAX. The model can SEE the reference images so DON'T describe them. Instead INSTRUCT: what to do with @img1 (product), what colors to use (just hex codes), what font, what scene. Example: '@img1 product on marble counter, colors #8B6F47 #F5F0EB #FFFFFF, morning sunlight, soft shadows, minimal ad'"
}

--- SELF-CHECK ---
Before outputting, verify:
✓ AD STRATEGY: Is there a clear strategic reason for every creative choice? (Not just "looks nice")
✓ PRODUCT: Is the product prominently visible and recognizable within 0.5 seconds?
✓ BRAND: Do colors, mood, and composition match this brand's actual visual identity?
✓ SCROLL-STOP: Is there ONE clear element that would stop a thumb mid-scroll?
✓ EMOTION: Does the viewer FEEL something specific in the first moment?
✓ FORMAT: Is this a recognizable winning ad format, not a random scene?
✓ VARIATION: If part of a batch, is this a DIFFERENT format/angle than previous outputs?
✓ PROMPT: Does prompt_for_image_model describe a complete AD, not just a lifestyle photo?
If any check fails, REVISE. Generic lifestyle photo with no strategic intent = automatic fail.`;

  // ── HTML Ad system prompt (HTML IS the final ad — screenshot = deliverable) ──
  const htmlDim = htmlAdDimensions[aspectRatio];
  const HTML_AD_SYSTEM_PROMPT = `You produce a SINGLE complete HTML document. It gets screenshotted at ${htmlDim.w}x${htmlDim.h}px as a paid social ad.

OUTPUT RULES:
- Start with <!DOCTYPE html>. CSS in <style>. No JS.
- Include: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
- Product images: <img src="{{PRODUCT_IMG_1}}">. System injects real images.
- Inside <body>, first thing: <!-- Strategy: [FORMAT] - [FRAMEWORK] --> and <!-- Inspired by: [ref] --> if references provided.

YOU MUST USE THIS EXACT HTML SKELETON — just fill in the content and style the <style> block:

<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Suisse Intl','Inter',system-ui,sans-serif; }
  .ad { width:${htmlDim.w}px; height:${htmlDim.h}px; overflow:hidden; display:flex; flex-direction:column; position:relative; }
  .top { padding:${Math.round(htmlDim.h * 0.02)}px ${Math.round(htmlDim.w * 0.04)}px; flex-shrink:0; }
  .hero { flex:1; display:flex; align-items:center; justify-content:center; padding:${Math.round(htmlDim.w * 0.03)}px; min-height:0; }
  .hero img { max-width:90%; max-height:100%; object-fit:contain; filter:drop-shadow(0 8px 24px rgba(0,0,0,0.25)); }
  .headline { padding:0 ${Math.round(htmlDim.w * 0.04)}px; flex-shrink:0; }
  .headline h1 { font-size:${Math.round(htmlDim.w * 0.075)}px; font-weight:800; line-height:1.05; }
  .info { padding:${Math.round(htmlDim.h * 0.01)}px ${Math.round(htmlDim.w * 0.04)}px; flex-shrink:0; }
  .cta { padding:${Math.round(htmlDim.h * 0.015)}px ${Math.round(htmlDim.w * 0.04)}px ${Math.round(htmlDim.h * 0.025)}px; flex-shrink:0; }
  .cta button { width:100%; padding:${Math.round(htmlDim.h * 0.018)}px; font-size:${Math.round(htmlDim.w * 0.04)}px; font-weight:700; border-radius:12px; border:none; cursor:pointer; background:#5383F0; color:#fff; }
  /* ADD YOUR CUSTOM STYLES BELOW — colors, backgrounds, effects */
</style>
</head><body>
<div class="ad">
  <!-- Strategy: FORMAT - FRAMEWORK -->
  <div class="top"><!-- brand name / tag --></div>
  <div class="headline"><h1><!-- BIG BOLD HEADLINE --></h1></div>
  <div class="hero"><img src="{{PRODUCT_IMG_1}}" /></div>
  <div class="info"><!-- price, subtext, rating --></div>
  <div class="cta"><button><!-- CTA TEXT --></button></div>
</div>
</body></html>

RULES FOR FILLING IN THE SKELETON:
1. The .ad div is ${htmlDim.w}x${htmlDim.h}px. NOTHING goes outside it. overflow:hidden enforced.
2. You MAY reorder the zones (headline above or below hero, etc). You MAY add extra divs INSIDE zones.
3. Product image in .hero MUST stay huge — the flex:1 gives it ~45% of height. NEVER shrink .hero.
4. Headline font-size: ${Math.round(htmlDim.w * 0.065)}-${Math.round(htmlDim.w * 0.09)}px, weight 800. MAX 6 WORDS.
5. Font stack: 'Suisse Intl','Inter',system-ui,sans-serif everywhere. No other fonts.
6. CTA button: #5383F0 background, white text, full width. Always visible at bottom.
7. DO NOT use position:absolute on anything. Flex only.
8. Product img: ONLY use max-width % + object-fit:contain. NEVER fixed px width/height.
9. Max 3-4 text elements total: headline + subtext + CTA. This is a billboard, not a brochure.
10. Background: white, off-white (#f8f8f8), soft gradient, or dark (#1a1a2e). Brand colors for accents.

VARY ACROSS BATCH — each ad must differ:
- Different headline (unique angle: benefit, social proof, urgency, question, statistic)
- Different zone order (headline-first vs product-first vs split layout)
- Different background treatment (light vs dark vs gradient vs colored)
- Different info zone content (price vs rating vs benefit badges vs testimonial quote)

COPY: Sound like a real DTC brand. Short, punchy, specific. Not generic marketing.`;


  // ── Get research context ──
  const getResearchContext = useCallback(() => {
    if (!currentCycle?.researchFindings) return '';
    const parts: string[] = [];
    const rf = currentCycle.researchFindings;
    if (rf.deepDesires?.length) {
      parts.push(`CUSTOMER DESIRES:\n${rf.deepDesires.map(d => `- ${d.deepestDesire}`).join('\n')}`);
    }
    if (rf.objections?.length) {
      parts.push(`OBJECTIONS:\n${rf.objections.map(o => `- ${o.objection}`).join('\n')}`);
    }
    if (rf.avatarLanguage?.length) {
      parts.push(`CUSTOMER LANGUAGE:\n${rf.avatarLanguage.slice(0, 8).map(l => `"${l}"`).join(', ')}`);
    }
    if (rf.competitorWeaknesses?.length) {
      parts.push(`COMPETITOR GAPS:\n${rf.competitorWeaknesses.join('; ')}`);
    }
    if (rf.persona) {
      parts.push(`AVATAR: ${typeof rf.persona === 'string' ? rf.persona : JSON.stringify(rf.persona)}`);
    }
    // Copywriting output (creative direction)
    if (currentCycle.stages?.copywriting?.status === 'complete' && currentCycle.stages.copywriting.agentOutput) {
      parts.push(`COPY DIRECTION:\n${currentCycle.stages.copywriting.agentOutput.slice(0, 500)}`);
    }
    // Competitor ad intelligence
    if (rf.competitorAds?.industryPatterns?.unusedAngles?.length) {
      parts.push(`UNUSED ANGLES (OPPORTUNITY): ${rf.competitorAds.industryPatterns.unusedAngles.join(', ')}`);
    }
    return parts.join('\n\n');
  }, [currentCycle]);

  // ── Get preset context (brief — for research-enhanced prompts) ──
  const getPresetContext = useCallback(() => {
    if (!campaign?.presetData) return '';
    const preset = campaign.presetData;
    const parts: string[] = [];
    if (preset.brand) {
      parts.push(`BRAND: ${preset.brand.name} — ${preset.brand.positioning || ''}`);
      if (preset.brand.colors) parts.push(`COLORS: ${JSON.stringify(preset.brand.colors)}`);
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

  // ── Get FULL preset context (rich — for preset-only mode) ──
  const getFullPresetContext = useCallback(() => {
    if (!campaign?.presetData) return '';
    const preset = campaign.presetData;
    const parts: string[] = [];

    // Brand (expanded with visual identity fields)
    if (preset.brand) {
      const b = preset.brand;
      let brandBlock = `BRAND:\n  Name: ${b.name || 'N/A'}\n  Positioning: ${b.positioning || 'N/A'}\n  Brand Why: ${b.brandWhy || 'N/A'}\n  Colors: ${b.colors || 'N/A'}\n  Fonts: ${b.fonts || 'N/A'}\n  Voice/Tone: ${b.voiceTone || b.tone || 'N/A'}`;
      if (b.packagingDesign) brandBlock += `\n  Packaging Design: ${b.packagingDesign}`;
      if (b.visualIdentity) brandBlock += `\n  Visual Identity: ${b.visualIdentity}`;
      if (b.imageStyle) brandBlock += `\n  Image Style: ${b.imageStyle}`;
      if (b.logoStyle) brandBlock += `\n  Logo Style: ${b.logoStyle}`;
      if (b.sensoryBrand) brandBlock += `\n  Sensory Brand: ${b.sensoryBrand}`;
      parts.push(brandBlock);
    }

    // Product (expanded with packaging + variant details)
    if (preset.product) {
      const p = preset.product;
      let prodBlock = `PRODUCT:\n  Name: ${p.name || 'N/A'}\n  One-Liner: ${p.oneLiner || 'N/A'}\n  USP: ${p.usp || 'N/A'}\n  Key Benefits: ${Array.isArray(p.keyBenefits) ? p.keyBenefits.join(', ') : (p.keyBenefits || 'N/A')}\n  Price: ${p.price || 'N/A'}\n  Scents/Variants: ${Array.isArray(p.scents) ? p.scents.join(', ') : (p.scents || 'N/A')}`;
      if (p.packaging) prodBlock += `\n  Packaging Detail: ${p.packaging}`;
      if (p.variantColor) prodBlock += `\n  Variant Color: ${p.variantColor}`;
      if (p.variantVibe) prodBlock += `\n  Variant Vibe: ${p.variantVibe}`;
      if (p.variant) prodBlock += `\n  Current Variant: ${p.variant}`;
      parts.push(prodBlock);
    }

    // Audience
    if (preset.audience) {
      const a = preset.audience;
      parts.push(`AUDIENCE:\n  Name: ${a.name || 'N/A'}\n  Age Range: ${a.ageRange || 'N/A'}\n  Job: ${a.job || 'N/A'}\n  Primary Pain Point: ${a.painPoints?.primary || 'N/A'}\n  Deep Desire: ${a.painPoints?.deepDesire || a.deepDesire || 'N/A'}\n  Objections: ${a.painPoints?.objections || a.objections || 'N/A'}`);
    }

    // Competitive
    if (preset.competitive) {
      const c = preset.competitive;
      parts.push(`COMPETITIVE:\n  Market Gap: ${c.marketGap || 'N/A'}\n  Main Competitors: ${Array.isArray(c.mainCompetitors) ? c.mainCompetitors.map((comp: any) => typeof comp === 'string' ? comp : comp.name).join(', ') : 'N/A'}`);
    }

    // Creative Angles
    if (preset.creative) {
      const cr = preset.creative;
      parts.push(`CREATIVE ANGLES:\n  Top Performing: ${cr.topPerformingAngles || 'N/A'}\n  Untested: ${cr.untestedAngles || 'N/A'}\n  Contrarian: ${cr.contrarianAngles || 'N/A'}\n  Hook Bank: ${cr.hookBank || 'N/A'}\n  Scroll-Stopping Visuals: ${cr.scrollStoppingVisuals || 'N/A'}\n  Emotional vs Rational: ${cr.emotionalVsRational || 'N/A'}`);
    }

    // Messaging
    if (preset.messaging) {
      const m = preset.messaging;
      parts.push(`MESSAGING:\n  Core Message: ${m.mainMessage || 'N/A'}\n  Tagline: ${m.brandTagline || 'N/A'}\n  Tone: ${m.tone || 'N/A'}`);
    }

    // Platforms
    if (preset.platforms) {
      const pl = preset.platforms;
      parts.push(`PLATFORMS:\n  Primary: ${pl.primaryPlatform || pl.primary || 'N/A'}\n  Ad Formats: ${pl.adFormats || 'N/A'}`);
    }

    // Fall back to campaign-level data if no preset
    if (parts.length === 0) {
      parts.push(`BRAND: ${campaign.brand}`);
      parts.push(`AUDIENCE: ${campaign.targetAudience}`);
      parts.push(`PRODUCT: ${campaign.productDescription}`);
      if (campaign.productFeatures?.length) parts.push(`FEATURES: ${campaign.productFeatures.join(', ')}`);
      if (campaign.brandColors) parts.push(`COLORS: ${campaign.brandColors}`);
    }

    return parts.join('\n\n');
  }, [campaign]);

  // ── Build image context for LLM — tells it what images are available ──
  const buildImageContext = useCallback(() => {
    if (uploadedImages.length === 0) return '';
    const lines = uploadedImages.map((img, i) => {
      const tag = `@img${i + 1}`;
      return `${tag} [${img.type}] "${img.label}"`;
    });
    const imgTagInstructions = uploadedImages.length > 0
      ? `\n\n@img TAG RULES for prompt_for_image_model:
- The image model can SEE the reference images. DO NOT describe what they look like.
- Just use @img1 to reference the product. The model will use the uploaded image directly.
- Focus on INSTRUCTIONS: scene, colors (hex only), lighting, composition. Not descriptions.`
      : '';
    return `REFERENCE IMAGES:\n${lines.join('\n')}\n\nUse these images as visual reference. Product images show the ACTUAL product to feature prominently. Layout images show the EXACT composition/structure to reproduce — match the zone arrangement, proportions, and element positions. Match the product's exact appearance, colors, and packaging in your ad composition.${imgTagInstructions}`;
  }, [uploadedImages]);

  // ── Build brand visual rules block (mandatory when preset data exists) ──
  const buildBrandVisualRules = useCallback(() => {
    if (!campaign?.presetData?.brand) return '';
    const b = campaign.presetData.brand;
    const p = campaign.presetData.product;
    const rules: string[] = [];
    if (b.packagingDesign || p?.packaging) {
      rules.push(`- Product must appear as described: ${b.packagingDesign || p?.packaging}`);
    }
    rules.push('- Brand action blue: #5383F0 — use for ALL CTA buttons, badges, and interactive accent elements');
    if (b.colors) rules.push(`- Brand palette: ${b.colors}`);
    if (b.fonts) rules.push(`- Typography: ${b.fonts}`);
    if (b.imageStyle) rules.push(`- Image style: ${b.imageStyle}`);
    if (b.visualIdentity) rules.push(`- Visual identity: ${b.visualIdentity}`);
    if (p?.variantColor) rules.push(`- Variant accent color "${p.variantColor}" — use ONLY for tiny accent elements like a scent name badge or small tag. NEVER for backgrounds, CTAs, headlines, or large areas. The brand's primary palette always dominates.`);
    if (p?.variantVibe) rules.push(`- Variant mood/vibe: ${p.variantVibe} (subtle influence on imagery tone, NOT on brand colors)`);
    rules.push('- The ad MUST look like it belongs on the brand\'s website and Instagram feed — match their actual visual style');
    rules.push('- Product must be PROMINENTLY VISIBLE and recognizable — minimum 40% of ad area, never tiny or thumbnailed');
    return rules.length > 0 ? `\nBRAND VISUAL RULES (MANDATORY):\n${rules.join('\n')}\n` : '';
  }, [campaign]);

  // ── Build product image placeholder instructions for HTML ads ──
  const buildProductImagePlaceholders = useCallback(() => {
    const productImages = uploadedImages.filter(img => img.type === 'product');
    if (productImages.length === 0) return '';
    const lines = productImages.map((img, i) => {
      const desc = img.description ? `: ${img.description}` : '';
      return `- {{PRODUCT_IMG_${i + 1}}} — "${img.label}"${desc}`;
    });
    return `\nPRODUCT IMAGES (embed these in your HTML using <img src="{{PRODUCT_IMG_N}}" ...>):
${lines.join('\n')}
Use these placeholders as the src attribute. The system will inject the real images automatically.
Style product images with: object-fit: contain (NEVER cover — preserve transparent backgrounds), LARGE sizing (40-60% of ad area, minimum 350px smallest dimension), filter: drop-shadow(0 8px 24px rgba(0,0,0,0.2)) for depth. NO white boxes or background rectangles around the product.\n`;
  }, [uploadedImages]);

  // ── Save image to IndexedDB + update local state ──
  const persistImage = useCallback(async (image: StoredImage) => {
    await storage.saveImage(image);
    setStoredImages(prev => [image, ...prev]);
  }, []);

  // ── Desire-targeted generation ──
  const buildDesireContext = useCallback((desire: DeepDesire): string => {
    const layers = desire.layers
      ?.map(l => `  Level ${l.level}: ${l.description}`)
      .join('\n') || '';
    return `--- TARGET DESIRE (focus ALL creative around this) ---
SURFACE PROBLEM: ${desire.surfaceProblem}
DESIRE LAYERS:
${layers}
DEEPEST DESIRE: "${desire.deepestDesire}"
INTENSITY: ${desire.desireIntensity.toUpperCase()}
TURNING POINT: ${desire.turningPoint}
AMPLIFIED TYPE: ${desire.amplifiedDesireType}
TARGET SEGMENT: ${desire.targetSegment}

YOUR AD MUST:
- Address this specific desire in the headline/hook
- Show the transformation from pain to desire fulfilled
- Use language that resonates with the "${desire.targetSegment}" segment
- Match the ${desire.desireIntensity} intensity level in urgency/tone
`;
  }, []);

  // handleGenerateForDesire is defined after handleGenerate via ref pattern
  const handleGenerateRef = useRef<() => void>(() => {});
  const handleGenerateForDesire = useCallback((desire: DeepDesire, count: number) => {
    if (isGenerating) return;
    targetDesireRef.current = desire;
    setGeneratingDesireId(desire.id);
    setBatchCount(count);
    // Switch to static mode to show gallery results, then trigger generation
    setActiveMode('static');
    // Small delay to let mode switch render before generation starts
    setTimeout(() => {
      handleGenerateRef.current();
    }, 100);
  }, [isGenerating]);

  // ── Get cached ad library references (pre-analyzed, instant) ──
  const getAdLibraryContext = useCallback(async (): Promise<string> => {
    const productType = campaign?.productDescription || campaign?.presetData?.product?.oneLiner || '';
    const brandVibe = campaign?.presetData?.brand?.imageStyle || campaign?.presetData?.brand?.positioning || '';
    return getRelevantReferences(productType, brandVibe, 8);
  }, [campaign]);

  // ══════════════════════════════════════════════════════
  // ██  VISION FEEDBACK — MiniCPM audits, thinking model gives CSS fixes
  // ══════════════════════════════════════════════════════
  const getVisionFeedback = useCallback(async (
    adScreenshotBase64: string,
    referenceBase64: string | null,
    brandContext: string,
    signal?: AbortSignal
  ): Promise<string> => {
    const adRaw = adScreenshotBase64.includes(',') ? adScreenshotBase64.split(',')[1] : adScreenshotBase64;
    const refRaw = referenceBase64
      ? (referenceBase64.includes(',') ? referenceBase64.split(',')[1] : referenceBase64)
      : null;

    // ── Single MiniCPM call — sends BOTH images (ad + reference) for direct comparison ──
    // Image 1 = generated ad, Image 2 = reference layout (if available)
    const images = refRaw ? [adRaw, refRaw] : [adRaw];
    const hasRef = !!refRaw;

    setGenerationProgress(hasRef ? 'Vision: comparing ad to reference...' : 'Vision: auditing ad layout...');
    setLlmOutput('');

    const visionPrompt = hasRef
      ? `${brandContext}
You are given TWO images:
- IMAGE 1: The generated HTML ad (what we need to fix)
- IMAGE 2: The reference ad (the layout we want to match)

Compare them side by side. For each difference, give a SPECIFIC CSS/HTML fix:

1. LAYOUT: How does the reference arrange its zones (product, headline, CTA, background)? What must change in the generated ad to match?
2. PRODUCT SIZE: How big is the product in the reference vs the generated ad? Give exact % change needed.
3. TEXT SIZING: Are headlines, subheads, body text similar in scale? What font-size changes?
4. CTA PLACEMENT: Where is the CTA in the reference? Does the generated ad match?
5. SPACING: Is the whitespace/padding distribution similar?
6. OVERFLOW: Any elements cut off or overflowing in the generated ad?

For EACH fix, write it as a concrete CSS instruction like:
- "Change .product-zone img max-width from 30% to 75%"
- "Move CTA to bottom, add margin-top: auto"
- "Increase headline font-size from 24px to 48px"

Give 4-8 concrete fixes to make IMAGE 1 match IMAGE 2's layout. No vague advice — CSS properties only.`
      : `${brandContext}
Audit this ad screenshot for layout and design problems. For EACH issue found:
1. WHAT is wrong (e.g. "product image is tiny", "text overflows")
2. WHERE it is (e.g. "top-left", "bottom")
3. The SPECIFIC CSS fix (e.g. "change max-width from 30% to 80%")

Check for: product too small, overflow, text too small, CTA missing/cut off, dead space, overlap, poor contrast.

Give 3-6 concrete CSS/HTML fixes. No vague advice — CSS properties only.`;

    let audit = '';
    try {
      audit = await ollamaService.generateStream(
        visionPrompt,
        'You are a visual QA engineer comparing ad layouts. Give only concrete CSS property changes. No praise, no fluff — just the fixes.',
        {
          model: visionModel,
          images,
          signal,
          onChunk: (chunk) => setLlmOutput(prev => prev + chunk),
        }
      );
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error('[VisionQA] Vision audit failed:', err);
      setGenerationProgress('Vision QA: MiniCPM failed — check console');
      return '';
    }

    if (!audit.trim()) {
      console.warn('[VisionQA] MiniCPM returned empty response');
      return '';
    }

    // ── Thinking model refines the raw MiniCPM output into precise CSS instructions ──
    setGenerationProgress('Thinking: refining fixes...');
    setLlmOutput('');

    let feedback = '';
    try {
      feedback = await ollamaService.generateStream(
        `RAW VISION QA AUDIT:\n${audit}\n\nClean up the audit above into a numbered list of SPECIFIC CSS/HTML fixes. Each fix must:
- Reference a specific CSS property or HTML element
- Include the exact value to change TO (not just "make bigger")
- Be implementable by copying the instruction verbatim

Example format:
1. Change .product-zone img { max-width } from 30% to 80%
2. Add .cta-zone { margin-top: auto; padding: 16px 0 }
3. Increase .headline-zone h1 { font-size } from 24px to 7vw

Remove any vague or redundant items. Keep only actionable fixes.`,
        'You are an HTML/CSS expert. Convert visual feedback into precise CSS property changes. Output ONLY the numbered fix list.',
        {
          model: llmModel,
          signal,
          onChunk: (chunk) => setLlmOutput(prev => prev + chunk),
        }
      );
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error('[VisionQA] Fix refinement failed:', err);
      // Fall back to raw audit if thinking model fails
      return audit;
    }

    return feedback || audit;
  }, [llmModel, visionModel]);

  // ── Image-based vision feedback (for Reference Copy — SMART BRAND QA) ──
  // MiniCPM sees the ad and audits brand compliance using full brand/product/research knowledge.
  // Then the LLM (from settings) rewrites the prompt using the same deep knowledge.
  // MiniCPM never writes copy — it only identifies problems. The LLM fixes them.
  const getImageVisionFeedback = useCallback(async (
    generatedBase64: string,
    _referenceBase64: string,
    currentPrompt: string,
    brandContext: string,
    signal?: AbortSignal
  ): Promise<string> => {
    const genRaw = generatedBase64.includes(',') ? generatedBase64.split(',')[1] : generatedBase64;

    setGenerationProgress('Vision QA: auditing ad...');
    setLlmOutput('');

    // ── Step 1: MiniCPM AUDITS the generated ad ──
    // It gets the FULL brand context so it knows exactly what's right vs wrong.
    const brandNameLine = brandContext.split('\n')[0]?.replace('BRAND: ', '') || 'our brand';
    const visionPrompt = `You are a creative director reviewing an ad for ${brandNameLine}. Look at this ad image carefully and read ALL text visible in it.

BRAND KNOWLEDGE:
${brandContext}

AUDIT CHECKLIST — check every single one:

1. BRANDING: Is the brand name "${brandNameLine}" visible? Are there any OTHER brand names or logos? (This is critical — competitor logos are unacceptable)
2. COPY ACCURACY: Read every piece of text in the ad. For each claim or benefit mentioned, is it in the APPROVED BENEFITS list above? Quote any text that isn't approved.
3. HEADLINE QUALITY: Is the headline compelling and specific? Or generic/boring? Does it speak to a real customer desire or pain point?
4. VISUAL BRAND FIT: Do the colors match the brand palette? Does the typography feel right for the brand tone?
5. PRODUCT VISIBILITY: Is the product clearly shown? Is it the right product? Is it positioned well?
6. OVERALL IMPRESSION: Would this ad stop someone scrolling? Does it feel professional and on-brand?

FORMAT — for each issue:
ISSUE: [specific problem — quote exact text if relevant]
SEVERITY: [critical / major / minor]
FIX: [what the image generation prompt should say differently]

If the ad is good and on-brand, say "PASS" and explain briefly why it works.
Be honest and specific. This feedback drives the next revision.`;

    let audit = '';
    try {
      audit = await ollamaService.generateStream(
        visionPrompt,
        `Creative director for ${brandNameLine}. Audit this ad image. Report problems with specific fixes. Do NOT write new ad copy — only identify what needs changing and why.`,
        {
          model: visionModel,
          images: [genRaw],
          signal,
          onChunk: (chunk) => {
            chunkCountRef.current++; stepChunkRef.current++;
            if (!chunkStartRef.current) chunkStartRef.current = Date.now(); if (!stepStartRef.current) stepStartRef.current = Date.now();
            setLlmOutput(prev => prev + chunk);
          },
        }
      );
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error('[VisionQA] Brand audit failed:', err);
      return '';
    }

    if (!audit.trim()) return '';

    // Check if ad passed review
    const auditUpper = audit.toUpperCase();
    const hasCritical = auditUpper.includes('CRITICAL');
    const hasMajor = auditUpper.includes('MAJOR');
    const isPass = auditUpper.includes('PASS') && !hasCritical && !hasMajor;

    if (isPass) {
      console.log('[VisionQA] Ad passed brand review');
      setGenerationProgress('Vision QA: approved ✓');
      await new Promise(r => setTimeout(r, 1200));
      return ''; // empty = no changes needed, stop looping
    }

    console.log(`[VisionQA] Issues found (critical: ${hasCritical}, major: ${hasMajor}):`, audit.slice(0, 300));

    // ── Step 2: LLM rewrites the prompt to fix issues ──
    // The LLM gets the FULL brand context + research + knowledge to write great copy.
    setGenerationProgress('Rewriting prompt to fix issues...');
    setLlmOutput('');
    stepChunkRef.current = 0;
    stepStartRef.current = 0;

    // Pull in research context for the LLM to use when rewriting
    const researchCtx = getResearchContext();

    let refinedPrompt = '';
    try {
      refinedPrompt = await ollamaService.generateStream(
        `CURRENT IMAGE GENERATION PROMPT:
${currentPrompt}

VISION QA FEEDBACK (issues found in the generated ad):
${audit}

FULL BRAND DATA:
${brandContext}
${researchCtx ? `\nCUSTOMER RESEARCH:\n${researchCtx}` : ''}

Rewrite the image generation prompt to fix EVERY issue above. Rules:
1. Keep all @img tags and layout/composition instructions intact.
2. If wrong logo/brand found → add explicit "NO [wrong brand]. ${brandNameLine} branding ONLY."
3. If wrong claims → replace with REAL benefits from the brand data.
4. If headline is weak → write a sharper one using customer desires/pain points from research.
5. If colors are off → specify exact hex codes from brand palette.
6. If product placement is bad → give specific spatial instructions.
7. Keep the prompt concise — under 100 words. Every word must earn its place.

Output ONLY the revised prompt. No explanation. No markdown. Just the prompt text.`,
        `Expert ad prompt writer for ${brandNameLine}. Fix the issues using real brand data. Output ONLY the prompt.`,
        {
          model: llmModel,
          signal,
          onChunk: (chunk) => {
            chunkCountRef.current++; stepChunkRef.current++;
            if (!chunkStartRef.current) chunkStartRef.current = Date.now(); if (!stepStartRef.current) stepStartRef.current = Date.now();
            setLlmOutput(prev => prev + chunk);
          },
        }
      );
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error('[VisionQA] Prompt rewrite failed:', err);
      return `${currentPrompt}\n\nFIX: ${audit}`;
    }

    return refinedPrompt || currentPrompt;
  }, [llmModel, visionModel, getResearchContext]);

  // ══════════════════════════════════════════════════════
  // ██  GENERATE HTML ADS — multi-variant generation
  // ══════════════════════════════════════════════════════
  const generateHtmlAds = useCallback(async (count: number) => {
    const dim = htmlAdDimensions[aspectRatio];
    const brandRules = buildBrandVisualRules();
    const fullPreset = presetEnabled ? getFullPresetContext() : '';
    const researchContext = researchEnabled ? getResearchContext() : '';
    const presetContext = getPresetContext();
    const productPlaceholders = buildProductImagePlaceholders();
    const signal = generationAbortRef.current?.signal;
    const usedFormats: string[] = [];

    setHtmlVariants([]);
    setCurrentHtmlPreview('');
    setSelectedVariants(new Set());

    // Step 0: Get cached ad library references (instant if pre-analyzed)
    const adLibraryContext = adLibraryEnabled ? await getAdLibraryContext() : '';
    // Parse individual references for per-variant assignment
    const refLines = adLibraryContext
      ? adLibraryContext.match(/Reference #\d+\.\s*\[[^\]]+\]\s*.+/g) || []
      : [];

    for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;

      const adStartTime = Date.now();
      setBatchCurrent(i + 1);
      setGenerationProgress(`Creating ad ${i + 1} of ${count}...`);
      setGenerationPhase('streaming');
      setLlmOutput('');
      setCurrentHtmlPreview('');
      chunkCountRef.current = 0;
      chunkStartRef.current = 0;

      // Pick ONE specific reference for this variant (round-robin through available refs)
      const pickedRef = refLines.length > 0 ? refLines[i % refLines.length] : '';
      const refInstruction = pickedRef
        ? `\n--- YOUR REFERENCE AD (REPRODUCE THIS LAYOUT) ---
${pickedRef}
YOUR TASK: CLONE this reference ad's layout as closely as possible.
- SAME zone arrangement (where product goes, where headline goes, where CTA goes)
- SAME proportions (if product is 50% of the ad area, yours should be too)
- SAME visual weight distribution (if headline is huge and bold, match that scale)
- SAME spacing ratios between elements
- ONLY swap in: your brand's product images, brand name, brand colors, and specific copy text
Think of this as a TEMPLATE — reproduce the structure exactly, just fill in your brand's content.
Include <!-- Inspired by: ${pickedRef.match(/Reference #\d+/)?.[0] || 'Reference'} --> in your HTML.\n`
        : '';

      // Build diversity instruction (stronger than before)
      const variationInstruction = usedFormats.length > 0
        ? `\nCRITICAL DIVERSITY REQUIREMENT — variant ${i + 1} of ${count}:
Already created: ${usedFormats.join(', ')}.
You MUST use:
- A completely different visual layout (if hero-centered → try split-panel, grid, or text-first)
- A different copy framework (if PAS → try AIDA, testimonial, comparison, urgency)
- Different color weight (if dark bg → try light; if image-heavy → try text-heavy)
Do NOT repeat any previous layout or angle.`
        : '';

      // Template instruction (if user loaded a template)
      const templateInstruction = templateHtml
        ? `\n\nTEMPLATE HTML (use this as your base layout, modify copy/images/colors for the current brief):
\`\`\`html
${templateHtml}
\`\`\`
Maintain this layout structure but create fresh content.`
        : '';

      // Desire-targeted context (overrides generic research if targeting a specific desire)
      const desireContext = targetDesireRef.current
        ? buildDesireContext(targetDesireRef.current)
        : '';

      // Build the full prompt
      const adPrompt = `Design a ${aspectRatio} (${dim.w}x${dim.h}px) HTML ad creative.

USER BRIEF: ${prompt || 'Create a high-performance paid social ad.'}

${fullPreset ? `--- BRAND BIBLE ---\n${fullPreset}\n` : presetContext ? `BRAND:\n${presetContext}\n` : ''}
${desireContext ? `${desireContext}\n` : researchContext ? `--- CUSTOMER RESEARCH ---\n${researchContext}\n` : ''}
${refInstruction}${brandRules}
${productPlaceholders}${variationInstruction}${templateInstruction}

Create a complete, production-ready HTML ad. This screenshot IS the final deliverable — make it polished and compelling.`;

      try {
        let htmlOutput = '';
        await ollamaService.generateStream(
          adPrompt,
          HTML_AD_SYSTEM_PROMPT,
          {
            model: htmlLlmModel,
            signal,
            onChunk: (chunk) => {
              htmlOutput += chunk;
              chunkCountRef.current++; stepChunkRef.current++;
              if (!chunkStartRef.current) chunkStartRef.current = Date.now(); if (!stepStartRef.current) stepStartRef.current = Date.now();
              setLlmOutput(prev => prev + chunk);
              setCurrentHtmlPreview(htmlOutput);
            },
          }
        );

        // Extract and process HTML
        let cleanHtml = extractHtmlDocument(htmlOutput);
        if (!cleanHtml || cleanHtml.length < 50) {
          setGenerationProgress(`Ad ${i + 1} failed — LLM returned invalid HTML, skipping...`);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        // Inject real product images
        cleanHtml = embedProductImages(cleanHtml, uploadedImages);

        // Capture screenshot
        setGenerationPhase('capturing');
        setGenerationProgress(`Capturing ad ${i + 1}...`);
        const screenshot = await captureHtmlScreenshot(cleanHtml, dim.w, dim.h);

        if (screenshot) {
          const label = extractStrategyLabel(cleanHtml);
          usedFormats.push(label);

          // Parse which reference ad inspired this design (can be before DOCTYPE or in body)
          const inspiredMatch = cleanHtml.match(/<!--\s*Inspired by:\s*(.+?)\s*-->/i);
          let inspiredBy = inspiredMatch ? inspiredMatch[1].trim() : undefined;
          // Clean up generic "Reference #N" → look up actual name from adLibraryContext
          if (inspiredBy && inspiredBy.match(/^Reference #?\d+$/i) && adLibraryContext) {
            const refNum = inspiredBy.match(/\d+/)?.[0];
            if (refNum) {
              const refLine = adLibraryContext.match(new RegExp(`Reference #${refNum}\\.\\s*\\[([^\\]]+)\\]\\s*(.+?)(?:\\n|$)`, 'i'));
              if (refLine) {
                inspiredBy = `${refLine[1]} — ${refLine[2].slice(0, 40).trim()}`;
              }
            }
          }

          const variant: HtmlAdVariant = {
            id: `htmlad-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            html: cleanHtml,
            screenshotBase64: screenshot,
            strategyLabel: label,
            aspectRatio,
            timestamp: Date.now(),
            inspiredBy,
            renders: [],
          };

          // Show immediately in gallery
          setHtmlVariants(prev => [...prev, variant]);

          // Persist to IndexedDB
          imageCountRef.current += 1;
          const stored: StoredImage = {
            id: variant.id,
            imageBase64: screenshot,
            prompt: prompt || '(HTML ad)',
            imagePrompt: `HTML Ad: ${label}`,
            model: llmModel,
            aspectRatio,
            pipeline: 'html-ad',
            timestamp: variant.timestamp,
            label: `Ad ${imageCountRef.current}`,
            referenceImageCount: uploadedImages.filter(img => img.type === 'product').length,
            campaignId: campaign?.id,
            campaignBrand: campaign?.brand,
            htmlSource: cleanHtml,
            strategyLabel: label,
            generationDurationMs: Date.now() - adStartTime,
            inspiredByRef: inspiredBy,
            desireId: targetDesireRef.current?.id,
            desireLabel: targetDesireRef.current?.deepestDesire?.slice(0, 60),
          };
          await persistImage(stored);

          // ── Vision QA loop (optional, multi-round) ──
          // Each round: audit screenshot → get CSS fixes → regenerate HTML → re-capture.
          // Even 1 round = audit + refine (not just audit).
          // Wrapped in its own try/catch so VisionQA crashes don't kill the whole generation.
          if (visionFeedbackEnabled && screenshot && !signal?.aborted) try {
            console.log(`[VisionQA] Starting ${visionRounds} round(s) for ad ${i + 1}`);
            const refImages = uploadedImages.filter(img => img.type === 'layout');
            const refBase64 = refImages.length > 0 ? refImages[0].base64 : null;
            const brandCtx = presetEnabled ? (getPresetContext() || '') : '';
            let currentHtml = cleanHtml;
            let currentScreenshot = screenshot;
            let allFeedback = '';

            // Initialize vision history with original screenshot
            setVisionHistory([{ round: 0, screenshot, feedback: '(original)' }]);
            setShowVisionComparison(true);

            for (let round = 0; round < visionRounds; round++) {
              if (signal?.aborted) break;

              const roundLabel = visionRounds > 1 ? ` (round ${round + 1}/${visionRounds})` : '';

              // ── Step A: Audit the current screenshot ──
              setGenerationPhase('streaming');
              setLlmOutput('');
              chunkCountRef.current = 0;
              chunkStartRef.current = 0;
              setGenerationProgress(`Vision: reviewing ad ${i + 1}${roundLabel}...`);

              const feedback = await getVisionFeedback(currentScreenshot, refBase64, brandCtx, signal);
              if (!feedback || signal?.aborted) {
                console.warn(`[VisionQA] No feedback returned for ad ${i + 1} round ${round + 1} — MiniCPM may have failed`);
                setGenerationProgress(`Vision QA: no feedback (MiniCPM may be unavailable)`);
                await new Promise(r => setTimeout(r, 1500));
                break;
              }

              console.log(`[VisionQA] Got feedback for ad ${i + 1} round ${round + 1}: ${feedback.slice(0, 100)}...`);
              allFeedback += (allFeedback ? `\n\n--- Round ${round + 1} ---\n` : '') + feedback;

              // Update variant with latest feedback
              setHtmlVariants(prev => prev.map(v =>
                v.id === variant.id ? { ...v, visionFeedback: allFeedback } : v
              ));

              // ── Step B: Regenerate HTML incorporating the fixes ──
              setGenerationProgress(`Refining ad ${i + 1}${roundLabel}...`);
              setGenerationPhase('streaming');
              setLlmOutput('');
              chunkCountRef.current = 0;
              chunkStartRef.current = 0;

              let refinedHtml = '';
              await ollamaService.generateStream(
                `Here is the current HTML ad:\n\`\`\`html\n${currentHtml}\n\`\`\`\n\nCSS/HTML FIXES REQUIRED:\n${feedback}\n\nApply EACH fix listed above. Change the specific CSS properties and HTML structure as instructed. Keep the same content (copy, images, colors) but fix the layout problems. Output ONLY the complete revised HTML document — no explanation, just the fixed HTML.`,
                HTML_AD_SYSTEM_PROMPT,
                {
                  model: htmlLlmModel,
                  signal,
                  onChunk: (chunk) => {
                    refinedHtml += chunk;
                    chunkCountRef.current++; stepChunkRef.current++;
                    if (!chunkStartRef.current) chunkStartRef.current = Date.now(); if (!stepStartRef.current) stepStartRef.current = Date.now();
                    setLlmOutput(prev => prev + chunk);
                    setCurrentHtmlPreview(refinedHtml);
                  },
                }
              );

              // ── Step C: Re-capture screenshot with refined HTML ──
              const extracted = extractHtmlDocument(refinedHtml);
              if (extracted && extracted.length >= 50) {
                currentHtml = embedProductImages(extracted, uploadedImages);
                setGenerationPhase('capturing');
                setGenerationProgress(`Capturing refined ad ${i + 1}${roundLabel}...`);
                const newScreenshot = await captureHtmlScreenshot(currentHtml, dim.w, dim.h);
                if (newScreenshot) {
                  currentScreenshot = newScreenshot;
                  // Update variant with refined HTML + screenshot
                  setHtmlVariants(prev => prev.map(v =>
                    v.id === variant.id ? { ...v, html: currentHtml, screenshotBase64: newScreenshot } : v
                  ));
                  // Track in vision history for side-by-side comparison
                  setVisionHistory(prev => [...prev, { round: round + 1, screenshot: newScreenshot, feedback }]);
                  console.log(`[VisionQA] Refined ad ${i + 1} round ${round + 1} — HTML updated`);
                }
              } else {
                console.warn(`[VisionQA] Refinement produced invalid HTML for ad ${i + 1} round ${round + 1}`);
              }
            }

            // ── Update IndexedDB with refined HTML + screenshot ──
            if (currentHtml !== cleanHtml) {
              console.log(`[VisionQA] Updating stored image ${variant.id} with refined HTML + screenshot`);
              const updatedStored: StoredImage = {
                id: variant.id,
                imageBase64: currentScreenshot,
                prompt: prompt || '(HTML ad)',
                imagePrompt: `HTML Ad: ${label} (refined)`,
                model: llmModel,
                aspectRatio,
                pipeline: 'html-ad',
                timestamp: variant.timestamp,
                label: `Ad ${imageCountRef.current}`,
                referenceImageCount: uploadedImages.filter(img => img.type === 'product').length,
                campaignId: campaign?.id,
                campaignBrand: campaign?.brand,
                htmlSource: currentHtml,
                strategyLabel: label,
                generationDurationMs: Date.now() - adStartTime,
                inspiredByRef: inspiredBy,
              };
              await storage.saveImage(updatedStored);
              setStoredImages(prev => prev.map(img =>
                img.id === variant.id ? updatedStored : img
              ));
            }
          } catch (visionErr) {
            if (signal?.aborted) throw visionErr; // Re-throw abort
            console.error(`[VisionQA] Crashed during ad ${i + 1}:`, visionErr);
            setGenerationProgress(`Vision QA crashed — ad saved without refinement`);
            await new Promise(r => setTimeout(r, 2000));
          }
        } else {
          console.error(`Screenshot capture returned null for ad ${i + 1}`);
          setGenerationProgress(`Ad ${i + 1} screenshot failed (check console for details), skipping...`);
          await new Promise(r => setTimeout(r, 1500));
        }

        // Smooth transition between variants
        if (i < count - 1) {
          setGenerationPhase('between');
          setGenerationProgress(`✓ Ad ${i + 1} done — creating next...`);
          await new Promise(r => setTimeout(r, 400));
        } else if (count > 0) {
          // Final ad done
          setGenerationPhase('between');
          setGenerationProgress(`✓ All ${count} ads created`);
          await new Promise(r => setTimeout(r, 800));
        }
      } catch (err) {
        if (signal?.aborted) break;
        console.error(`HTML ad ${i + 1} generation failed:`, err);
        setGenerationProgress(`Ad ${i + 1} failed — ${err instanceof Error ? err.message : 'unknown error'}`);
        await new Promise(r => setTimeout(r, 1500));
      }

      setCurrentHtmlPreview('');
    }

    setBatchCurrent(0);

    // Mark for auto-render if enabled (will be handled by effect)
    if (autoRenderHtml && !signal?.aborted && htmlVariants.length > 0) {
      setGenerationProgress('Preparing to auto-render...');
    } else {
      setGenerationProgress('');
      setGenerationPhase('idle');
    }
  }, [aspectRatio, buildBrandVisualRules, presetEnabled, getFullPresetContext, researchEnabled, getResearchContext, getPresetContext, buildProductImagePlaceholders, prompt, uploadedImages, llmModel, htmlLlmModel, campaign, persistImage, HTML_AD_SYSTEM_PROMPT, templateHtml, getAdLibraryContext, adLibraryEnabled, visionFeedbackEnabled, visionRounds, getVisionFeedback]);

  // ══════════════════════════════════════════════════════
  // ██  AUTO-PICK — Select best reference(s) from ad library cache
  // ══════════════════════════════════════════════════════
  const autoPickReferences = useCallback(async (count: number = 1): Promise<Array<{
    base64: string; description: string; category: string; filename: string; path: string;
  }>> => {
    const cache = await getCache();
    if (!cache || cache.descriptions.length === 0) return [];

    const productType = campaign?.productDescription || '';
    const brandVibe = campaign?.brand || '';
    const keywords = [
      ...(productType).toLowerCase().split(/\s+/),
      ...(brandVibe).toLowerCase().split(/\s+/),
      ...(prompt || '').toLowerCase().split(/\s+/),
    ].filter(w => w.length > 2);

    // Score each cached description
    const scored = cache.descriptions.map(d => {
      let score = 0;
      const text = `${d.category} ${d.description}`.toLowerCase();

      // Category match bonuses
      if (d.category === 'product-hero') score += 3;
      if (d.category === 'features-benefits') score += 2;
      if (d.category === 'social-proof') score += 1;

      // Keyword relevance
      for (const kw of keywords) {
        if (text.includes(kw)) score += 1;
      }

      // Random jitter for variety
      score += Math.random() * 2;

      return { ...d, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Pick top N with category diversity (max 2 per category)
    const picked: AdDescription[] = [];
    const catCounts: Record<string, number> = {};
    for (const item of scored) {
      if (picked.length >= count) break;
      const cc = catCounts[item.category] || 0;
      if (cc >= 2) continue;
      picked.push(item);
      catCounts[item.category] = cc + 1;
    }

    // Load base64 for each — skip blank/corrupt images
    const results: Array<{ base64: string; description: string; category: string; filename: string; path: string }> = [];
    for (const d of picked) {
      // Construct path from category/filename if path is missing
      const imgPath = d.path || `${d.category}/${d.filename}`;
      const base64 = await loadAdImageBase64(imgPath);
      if (!base64) continue;
      // Check raw base64 size (>2KB = real image, not an error page)
      const raw = base64.includes(',') ? base64.split(',')[1] : base64;
      if (!raw || raw.length < 2000) {
        console.warn(`[RefCopy] Skipping "${d.filename}" — image too small (${raw?.length || 0} chars, path: ${imgPath})`);
        continue;
      }
      results.push({ base64, description: d.description, category: d.category, filename: d.filename, path: imgPath });
    }
    return results;
  }, [campaign, prompt]);

  // ══════════════════════════════════════════════════════
  // ██  REFERENCE COPY — Ad library ref → Freepik image (no HTML)
  // Single reference copy generation (extracted for batch support)
  const generateSingleReferenceCopy = useCallback(async (
    target: { base64: string; description: string; category: string; filename: string; path: string },
    batchLabel: string = '',
    batchIndex: number = 0
  ) => {

    const signal = generationAbortRef.current?.signal;
    const startTime = Date.now();

    setGenerationPhase('streaming');
    setGenerationProgress(`Loading reference ad${batchLabel}...`);
    setLlmOutput('');
    stepChunkRef.current = 0;
    stepStartRef.current = 0;

    // Step 1: Ensure we have a real base64 of reference ad (not empty/tiny)
    let refBase64 = target.base64;
    if (!refBase64) {
      const loaded = await loadAdImageBase64(target.path);
      if (!loaded) {
        setGenerationProgress('Failed to load reference ad image');
        setGenerationPhase('idle');
        return;
      }
      refBase64 = loaded;
    }

    // Strip data: prefix for Freepik (expects raw base64)
    const refRaw = refBase64.includes(',') ? refBase64.split(',')[1] : refBase64;

    // Validate: raw base64 must be substantial (>2KB = real image, not a blank/corrupt file)
    if (!refRaw || refRaw.length < 2000) {
      console.warn(`[RefCopy] Skipping "${target.filename}" — image too small (${refRaw?.length || 0} chars, likely blank/corrupt)`);
      setGenerationProgress(`Skipping ${target.filename} — image appears blank`);
      await new Promise(r => setTimeout(r, 1500));
      setGenerationPhase('idle');
      return;
    }

    // Step 2: Pre-check Freepik server
    setGenerationProgress('Checking Freepik server...');
    const serverOk = await checkServerStatus();
    if (!serverOk) {
      console.error('[RefCopy] Freepik server not reachable at localhost:8890');
      setGenerationProgress('Freepik server not running — start it first (port 8890)');
      setTimeout(() => { setGenerationProgress(''); setGenerationPhase('idle'); }, 4000);
      return;
    }

    // Step 3: Build reference image array — send ALL uploaded images (product + layout)
    // Users uploaded these for a reason — layout images are visual references too
    const allUploadedBase64s = getCleanBase64s(uploadedImages);
    const productBase64s = getCleanBase64s(uploadedImages.filter(img => img.type === 'product'));
    const layoutBase64s = getCleanBase64s(uploadedImages.filter(img => img.type === 'layout'));

    const refRawClean = refRaw && refRaw.length > 100 ? refRaw : null;
    // Order: product images first, then layout images, then ad library ref last
    const allRefs = [...allUploadedBase64s, ...(refRawClean ? [refRawClean] : [])];
    const refIdx = allRefs.length; // ad library ref index (1-indexed for @img tag)

    // Build @img tag map for the LLM
    const quickBrand = campaign?.brand || '';
    const imgTagMap: string[] = [];
    let imgNum = 1;
    if (productBase64s.length > 0) {
      imgTagMap.push(`@img${imgNum} = ${quickBrand} product photo — keep exact appearance, rotate/reposition as needed.`);
      imgNum += productBase64s.length;
    }
    if (layoutBase64s.length > 0) {
      imgTagMap.push(`@img${imgNum} = uploaded layout reference — use as composition guide.`);
      imgNum += layoutBase64s.length;
    }
    if (refRawClean) {
      imgTagMap.push(`@img${refIdx} = AD LIBRARY REFERENCE — copy composition/zones, IGNORE all text and branding.`);
    }

    // ── Step 4: EXTRACT REAL DATA before LLM call ──
    setGenerationProgress('Writing ad copy + creative direction...');
    setLlmOutput('');

    const preset = campaign?.presetData || {};
    const brand = preset.brand || {};
    const product = preset.product || {};
    const messaging = preset.messaging || {};

    // Real brand data — exhaustive extraction
    const brandName = brand.name || campaign?.brand || '';
    const brandTagline = brand.tagline || messaging.brandTagline || '';
    const brandTone = brand.tone || brand.voiceTone || messaging.tone || '';
    const brandColors = brand.colors || campaign?.brandColors || '';
    const brandFonts = brand.fonts || campaign?.brandFonts || '';
    const brandPersonality = brand.personality || '';
    // brandFonts — font info available but kept short for Nano Banana (used via brand data only)

    // Visual identity — critical for on-brand generation
    const packagingDesc = product.packaging || brand.packagingDesign || '';
    const productFormat = product.format || '';
    const variantName = product.variant || product.activeVariant || '';
    const variantColor = product.variantColor || '';
    // variantVibe available via product.variantVibe if needed for future prompts

    // Real product data
    const productName = product.name || '';
    const productDesc = product.oneLiner || product.description || campaign?.productDescription || '';
    const productUSP = product.usp || '';
    const productBenefits = Array.isArray(product.keyBenefits) ? product.keyBenefits : [];
    const functionalBenefits = product.functionalBenefits || {};
    const funcBenefitValues = typeof functionalBenefits === 'object' && !Array.isArray(functionalBenefits)
      ? Object.values(functionalBenefits).filter(v => typeof v === 'string') as string[]
      : [];
    const realBenefits: string[] = [
      ...funcBenefitValues,
      ...productBenefits,
      ...(product.emotionalBenefits || []).slice(0, 3),
    ].filter(Boolean).slice(0, 8);
    const provenResults = product.provenResults || '';
    const ingredients = Array.isArray(product.ingredients) ? product.ingredients : [];
    const noNos = product.features?.noNos || '';

    // ── Product angle variety per batch item ──
    const angleVariants = [
      'front-facing, slightly angled 15 degrees right, hero product shot',
      'tilted 30 degrees left, dynamic angle, spray mist visible',
      'shot from slightly above, looking down at product at 20 degree angle',
      'product angled 45 degrees showing side label, three-quarter view',
      'low angle looking up at product, powerful and bold',
      'flat lay top-down view, product centered among props',
      'product rotated to show back/side, different perspective',
      'close-up detail shot, product slightly tilted forward',
    ];
    const angleInstruction = angleVariants[batchIndex % angleVariants.length];

    // ── Extract hex codes for color direction ──
    const hexCodes = brandColors.match(/#[0-9A-Fa-f]{6}/g) || [];
    const primaryHex = hexCodes[0] || '#000000';
    const accentHex = hexCodes.length > 2 ? hexCodes[2] : hexCodes[1] || '#FFFFFF';
    const variantHex = variantColor.match(/#[0-9A-Fa-f]{6}/)?.[0] || '';

    // ── Pull research insights to drive ad angles ──
    const rf = currentCycle?.researchFindings;
    // Pick a specific desire to target (rotate per batch)
    const topDesires = rf?.deepDesires?.map(d => d.deepestDesire).filter(Boolean) || [];
    const topObjections = rf?.objections?.map(o => o.objection).filter(Boolean) || [];
    const customerLanguage = rf?.avatarLanguage?.slice(0, 6) || [];
    const competitorGaps = rf?.competitorWeaknesses || [];
    const targetDesire = topDesires.length > 0 ? topDesires[batchIndex % topDesires.length] : '';
    const targetObjection = topObjections.length > 0 ? topObjections[batchIndex % topObjections.length] : '';

    // ── LLM prompt — rich with research + brand data ──
    const structuredPrompt = `Write a ${brandName} ad targeting a SPECIFIC customer desire. Use ONLY the data below.

BRAND: ${brandName} — ${brandPersonality || brandTone || 'Clear, direct, confident'}
PRODUCT: ${productName}${variantName ? ` (${variantName})` : ''}
USP: ${productUSP || 'Premium quality, transparent ingredients, fair price'}
${ingredients.length > 0 ? `INGREDIENTS: ${ingredients.join(', ')}` : ''}
${noNos ? `CLEAN: ${noNos}` : ''}

APPROVED BENEFITS:
${realBenefits.map(b => `- ${b}`).join('\n')}
${targetDesire ? `\nTARGET DESIRE (build your headline around this): "${targetDesire}"` : ''}
${targetObjection ? `OVERCOME THIS OBJECTION: "${targetObjection}"` : ''}
${customerLanguage.length > 0 ? `SPEAK LIKE THE CUSTOMER: ${customerLanguage.map(l => `"${l}"`).join(', ')}` : ''}
${competitorGaps.length > 0 ? `EXPLOIT COMPETITOR GAPS: ${competitorGaps.slice(0, 3).join('; ')}` : ''}
${provenResults ? `PROOF: ${provenResults.slice(0, 100)}` : ''}

COLORS: ${primaryHex} (primary), ${accentHex} (accent)${variantHex ? `, ${variantHex} (variant)` : ''}
${prompt ? `BRIEF: ${prompt}` : ''}

Output ONLY JSON:
{
  "headline": "2-5 words addressing the target desire/objection",
  "subtext": "CTA or supporting line, max 6 words",
  "callouts": ["benefit 1", "benefit 2", "benefit 3"],
  "scene": "${angleInstruction}",
  "bg": "${primaryHex} or ${accentHex}"
}

RULES:
- headline: address the TARGET DESIRE or counter the OBJECTION. Use customer language. Short + punchy.${targetDesire ? `\n  e.g. for desire "${targetDesire.slice(0, 40)}" → pick the benefit that solves it` : ''}
- callouts: shorten from APPROVED BENEFITS. "Holds 8+ hours" → "8-Hour Hold"
- bg: specific hex code only
- NEVER invent benefits. ${brandName} ONLY.`;

    let imagePrompt = '';
    try {
      const rawLlmOutput = await ollamaService.generateStream(
        structuredPrompt,
        `${brandName} ad copywriter. Output ONLY valid JSON. Use ONLY the benefits listed — never invent claims. Pick punchy, specific headlines from the benefits list. Never generic.`,
        {
          model: llmModel,
          signal,
          onChunk: (chunk) => setLlmOutput(prev => prev + chunk),
          // NOTE: Don't send images to text-only LLMs (qwen, lfm) — causes errors.
          // The prompt already contains all brand/product data. MiniCPM handles vision.
        }
      );

      // Parse structured JSON from the LLM
      let parsed: Record<string, unknown> = {};
      try {
        const jsonStart = rawLlmOutput.indexOf('{');
        const jsonEnd = rawLlmOutput.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          parsed = JSON.parse(rawLlmOutput.slice(jsonStart, jsonEnd + 1));
        }
      } catch {
        const hMatch = rawLlmOutput.match(/"headline"\s*:\s*"([^"]+)"/);
        if (hMatch) parsed = { headline: hMatch[1] };
      }

      const headline = (parsed.headline as string) || '';
      const subtext = (parsed.subtext as string) || '';
      // callouts parsed but NOT sent to Freepik — image model needs short prompts
      const scene = (parsed.scene as string) || '';
      const bg = (parsed.bg as string) || '';
      const mood = (parsed.mood as string) || '';

      // ── Assemble final Freepik prompt — SHORT (~40-50 words max) ──
      // Nano Banana works best with short, punchy prompts. The reference images carry the visual info.
      const bgHex = bg?.match(/#[0-9A-Fa-f]{6}/)?.[0] || primaryHex || '#000000';
      const textHex = (bgHex === '#000000' || bgHex?.toLowerCase() === '#252520') ? '#FFFFFF' : primaryHex;
      const sceneDir = scene || angleInstruction;

      const shortParts: string[] = [];
      shortParts.push(`${brandName} ad.`);
      if (productBase64s.length > 0) shortParts.push(`@img1 product, ${sceneDir}.`);
      if (refRawClean) shortParts.push(`@img${refIdx} layout ref.`);
      if (headline) shortParts.push(`Headline: "${headline}".`);
      if (subtext) shortParts.push(`"${subtext}".`);
      shortParts.push(`${bgHex} background, ${textHex} text.`);
      if (mood) shortParts.push(`${mood}.`);
      shortParts.push(`Only ${brandName} branding.`);

      imagePrompt = shortParts.join(' ');

      console.log('[RefCopy] LLM output →', parsed);
      console.log('[RefCopy] Assembled prompt:', imagePrompt);
    } catch (err) {
      if (signal?.aborted) {
        setGenerationPhase('idle');
        return;
      }
      // LLM failed — fall back to SHORT template prompt
      console.warn('[RefCopy] LLM analysis failed, using template:', err);
      const topBenefit = realBenefits[0] || productUSP?.split('.')[0] || `${brandName} product`;
      imagePrompt = [
        `${brandName} ad.`,
        productBase64s.length > 0 ? `@img1 product, ${angleInstruction}.` : '',
        refRawClean ? `@img${refIdx} layout ref.` : '',
        `Headline: "${topBenefit}".`,
        `${primaryHex || '#000000'} background, #FFFFFF text.`,
        `Only ${brandName} branding.`,
        prompt || '',
      ].filter(Boolean).join(' ').trim();
    }

    // Filter out any empty/corrupt refs before sending
    const cleanRefs = allRefs.filter(b64 => b64 && b64.length > 500);
    console.log(`[RefCopy] Sending ${cleanRefs.length} reference images to Freepik (${cleanRefs.map((_, i) => `@img${i+1}`).join(', ')})`);
    console.log(`[RefCopy] Prompt (${imagePrompt.split(/\s+/).length} words):`, imagePrompt);

    // ── Step 5: Generate candidates from Freepik ──
    // Generate renderCount candidates, then MiniCPM picks the best one for refinement
    const candidateCount = visionFeedbackEnabled ? renderCount : 1;
    setGenerationProgress(`Generating ${candidateCount > 1 ? `${candidateCount} candidates` : 'ad'} via Freepik (${cleanRefs.length} refs)...`);
    setGenerationPhase('streaming');

    const result = await generateImage({
      prompt: imagePrompt,
      model: imageModel,
      aspectRatio,
      count: candidateCount,
      style: imageStyle,
      styleReference: customStyleImage || undefined,
      referenceImages: cleanRefs,
      signal,
      onProgress: (msg) => setGenerationProgress(msg),
      onWarning: (msg) => setServerWarning(msg),
      onEtaUpdate: (secs) => setGenerationEta(secs),
    });

    if (!result.success || !result.imageBase64) {
      setGenerationProgress(result.error || 'Image generation failed');
      await new Promise(r => setTimeout(r, 2000));
      setGenerationProgress('');
      setGenerationPhase('idle');
      return;
    }

    // All candidate images (use imagesBase64 if available, else single image)
    const allCandidates = (result.imagesBase64 && result.imagesBase64.length > 0)
      ? result.imagesBase64.filter(b => b && b.length > 1000)
      : [result.imageBase64];

    // ── Step 5b: MiniCPM picks the best candidate (if multiple) ──
    let currentImageBase64 = allCandidates[0];
    let currentPrompt = imagePrompt;

    if (allCandidates.length > 1 && visionFeedbackEnabled && !signal?.aborted) {
      setGenerationProgress(`Evaluating ${allCandidates.length} candidates...`);
      setLlmOutput('');
      chunkCountRef.current = 0;
      chunkStartRef.current = 0;

      // Build brand context early for candidate selection
      const brandNameForPick = brandName || campaign?.brand || 'the brand';

      try {
        // Send all candidates to MiniCPM — ask it to pick the best
        const candidateRaws = allCandidates.map(c =>
          c.includes(',') ? c.split(',')[1] : c
        );

        const pickPrompt = `You are evaluating ${allCandidates.length} ad image candidates for ${brandNameForPick}.

The ad MUST show the product "${productName || productDesc}" with CORRECT branding for ${brandNameForPick}.

Look at each image (IMAGE 1 through IMAGE ${allCandidates.length}) and pick the BEST one based on:
1. BRAND ACCURACY: correct brand name, no competitor logos
2. COPY QUALITY: headline and text match real product benefits
3. PRODUCT PLACEMENT: product is clearly visible and well-positioned
4. VISUAL QUALITY: clean, professional, on-brand colors
5. LAYOUT: good composition, readable text

Reply with ONLY a number (1-${allCandidates.length}) for the best candidate. Then on the next line, briefly explain why (1 sentence).
Example:
2
Best product placement and no competitor branding visible.`;

        const pickResult = await ollamaService.generateStream(
          pickPrompt,
          `Ad creative director. Pick the best candidate. Reply with ONLY the number, then one sentence.`,
          {
            model: visionModel,
            images: candidateRaws,
            signal,
            onChunk: (chunk) => {
              chunkCountRef.current++;
              setLlmOutput(prev => prev + chunk);
            },
          }
        );

        // Parse the picked number
        const pickMatch = pickResult.match(/(\d+)/);
        const pickedIdx = pickMatch ? Math.max(0, Math.min(allCandidates.length - 1, parseInt(pickMatch[1]) - 1)) : 0;
        currentImageBase64 = allCandidates[pickedIdx];
        console.log(`[VisionQA] MiniCPM picked candidate ${pickedIdx + 1}/${allCandidates.length}: ${pickResult.slice(0, 100)}`);
        setGenerationProgress(`Selected candidate ${pickedIdx + 1}/${allCandidates.length}`);
      } catch (err) {
        if (signal?.aborted) { setGenerationPhase('idle'); return; }
        console.warn('[VisionQA] Candidate selection failed, using first:', err);
        // Fall through with first candidate
      }
    }

    // ── Step 6: Persist initial result ──
    imageCountRef.current += 1;
    const imageId = `refcopy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const stored: StoredImage = {
      id: imageId,
      imageBase64: currentImageBase64,
      prompt: prompt || '(Reference Copy)',
      imagePrompt: currentPrompt,
      model: imageModel,
      aspectRatio,
      pipeline: 'reference-copy',
      timestamp: Date.now(),
      label: `Ad ${imageCountRef.current}`,
      referenceImageCount: cleanRefs.length,
      referenceImages: cleanRefs.length > 0 ? cleanRefs : undefined,
      campaignId: campaign?.id,
      campaignBrand: campaign?.brand,
      inspiredByRef: `${target.filename} [${target.category}]`,
      generationDurationMs: Date.now() - startTime,
    };
    await persistImage(stored);

    // ── Step 7: Vision QA loop — MiniCPM audits, Qwen fixes, Freepik regenerates ──
    if (visionFeedbackEnabled && !signal?.aborted) {
      // Build RICH brand context — MiniCPM + LLM get everything we know
      const visionBrandCtx = [
        `BRAND: ${brandName || campaign?.brand || 'Unknown'}`,
        productName ? `PRODUCT: ${productName}${variantName ? ` (${variantName})` : ''}` : '',
        packagingDesc ? `PACKAGING: ${packagingDesc}` : '',
        productFormat ? `FORMAT: ${productFormat}` : '',
        productUSP ? `USP: ${productUSP}` : '',
        noNos ? `CLEAN CLAIMS: ${noNos}` : '',
        ingredients.length > 0 ? `INGREDIENTS: ${ingredients.join(', ')}` : '',
        realBenefits.length > 0 ? `APPROVED BENEFITS (ONLY these are valid — reject anything else):\n${realBenefits.map(b => `- ${b}`).join('\n')}` : '',
        `BRAND COLORS: ${brandColors}${variantColor ? ` | Variant accent: ${variantColor}` : ''}`,
        brandFonts ? `BRAND FONTS: ${brandFonts.split('.')[0]}` : '',
        brandTone ? `TONE: ${brandTone.split('.')[0]}` : '',
        brandPersonality ? `PERSONALITY: ${brandPersonality.split('—')[0].trim()}` : '',
        brandTagline ? `TAGLINE: "${brandTagline}"` : '',
        provenResults ? `SOCIAL PROOF: ${provenResults.slice(0, 150)}` : '',
        referenceStyle ? `TARGET STYLE: ${referenceStyle}` : '',
      ].filter(Boolean).join('\n');

      // ── Persistent round history — saved to IndexedDB, browsable after generation ──
      const rounds: VisionRound[] = [];

      // Add candidates (round 0)
      if (allCandidates.length > 1) {
        allCandidates.forEach((c, i) => {
          rounds.push({
            round: 0,
            imageBase64: c,
            prompt: currentPrompt,
            feedback: c === currentImageBase64 ? 'Selected by MiniCPM' : `Candidate ${i + 1}`,
            status: c === currentImageBase64 ? 'original' : 'candidate',
          });
        });
      } else {
        rounds.push({
          round: 0,
          imageBase64: currentImageBase64,
          prompt: currentPrompt,
          feedback: 'Original generation',
          status: 'original',
        });
      }

      // Initialize live timeline (UI state for during generation)
      setVisionHistory(rounds.map(r => ({
        round: r.round, screenshot: r.imageBase64, feedback: r.feedback, prompt: r.prompt,
      })));
      setShowVisionComparison(true);

      // Save initial rounds to stored image
      const updateStored = async (extraRounds: VisionRound[], fb: string, img?: string, prmpt?: string) => {
        const updated: StoredImage = {
          ...stored,
          imageBase64: img || currentImageBase64,
          imagePrompt: prmpt || currentPrompt,
          visionFeedback: fb,
          visionRounds: [...rounds, ...extraRounds],
          generationDurationMs: Date.now() - startTime,
        };
        await storage.saveImage(updated);
        setStoredImages(prev => prev.map(i => i.id === imageId ? updated : i));
      };
      await updateStored([], 'QA in progress...');

      let allFeedback = '';

      for (let round = 0; round < visionRounds; round++) {
        if (signal?.aborted) break;

        setGenerationProgress(`Vision QA ${round + 1}/${visionRounds}: checking...`);
        setGenerationPhase('streaming');
        chunkCountRef.current = 0;
        chunkStartRef.current = 0;

        try {
          const refinedPrompt = await getImageVisionFeedback(
            currentImageBase64, refBase64, currentPrompt,
            visionBrandCtx, signal
          );

          // Empty string = PASS (no issues found) — stop looping
          if (!refinedPrompt || signal?.aborted) {
            console.log(`[VisionQA] Round ${round + 1}: approved — stopping`);
            allFeedback += `\nRound ${round + 1}: PASSED`;
            rounds.push({
              round: round + 1,
              imageBase64: currentImageBase64,
              prompt: currentPrompt,
              feedback: 'Approved — no issues found',
              status: 'passed',
            });
            await updateStored([], allFeedback.trim());
            break;
          }
          currentPrompt = refinedPrompt;
          allFeedback += `\nRound ${round + 1}: revised`;

          // Regenerate with refined prompt
          setGenerationProgress(`Regenerating (round ${round + 1}/${visionRounds})...`);
          const refinedResult = await generateImage({
            prompt: currentPrompt,
            model: imageModel,
            aspectRatio,
            count: 1,
            style: imageStyle,
            styleReference: customStyleImage || undefined,
            referenceImages: cleanRefs,
            signal,
            onProgress: (msg) => setGenerationProgress(msg),
            onWarning: (msg) => setServerWarning(msg),
            onEtaUpdate: (secs) => setGenerationEta(secs),
          });

          if (refinedResult.success && refinedResult.imageBase64) {
            currentImageBase64 = refinedResult.imageBase64;

            // Save this round
            rounds.push({
              round: round + 1,
              imageBase64: currentImageBase64,
              prompt: currentPrompt,
              feedback: refinedPrompt,
              status: 'revised',
            });

            // Update live timeline
            setVisionHistory(rounds.map(r => ({
              round: r.round, screenshot: r.imageBase64, feedback: r.feedback, prompt: r.prompt,
            })));

            // Persist to IndexedDB (round-by-round, so nothing is lost on crash)
            await updateStored([], allFeedback.trim(), currentImageBase64, currentPrompt);
            console.log(`[VisionQA] Round ${round + 1} — saved (${rounds.length} total rounds)`);
          }
        } catch (err) {
          if (signal?.aborted) break;
          console.error(`[VisionQA] Round ${round + 1} failed:`, err);
          setGenerationProgress(`Vision QA round ${round + 1} failed — keeping current`);
          await updateStored([], allFeedback.trim() || 'QA interrupted');
          await new Promise(r => setTimeout(r, 1500));
          break;
        }
      }
    }

    setGenerationProgress('');
    setGenerationPhase('idle');
  }, [prompt, aspectRatio, imageModel, campaign, presetEnabled,
      getPresetContext, getFullPresetContext, buildBrandVisualRules, uploadedImages,
      persistImage, visionFeedbackEnabled, visionRounds, getImageVisionFeedback, referenceStyle, renderCount]);

  // ══════════════════════════════════════════════════════
  // ██  REFERENCE COPY WRAPPER — handles auto-pick + batch
  // ══════════════════════════════════════════════════════
  const generateReferenceCopy = useCallback(async () => {
    // Auto-pick if no explicit target selected
    let targets: Array<{ base64: string; description: string; category: string; filename: string; path: string }> = [];

    if (referenceCopyTarget) {
      // Validate the selected target has a real image
      const raw = referenceCopyTarget.base64?.includes(',')
        ? referenceCopyTarget.base64.split(',')[1]
        : referenceCopyTarget.base64;
      if (!raw || raw.length < 2000) {
        console.warn(`[RefCopy] Selected target "${referenceCopyTarget.filename}" has invalid image (${raw?.length || 0} chars)`);
        setGenerationProgress(`Selected reference image appears blank — pick a different one`);
        setTimeout(() => setGenerationProgress(''), 4000);
        return;
      }
      targets = [referenceCopyTarget];
    } else {
      setGenerationProgress('Auto-picking reference ads...');
      targets = await autoPickReferences(batchRefCount);
      console.log(`[RefCopy] Auto-picked ${targets.length} targets (requested ${batchRefCount})`);
      if (targets.length === 0) {
        setGenerationProgress('No valid ad library references found — open Ad Library and pre-analyze first');
        setTimeout(() => setGenerationProgress(''), 4000);
        return;
      }
    }

    // Batch mode: generate one ad per reference target
    for (let tIdx = 0; tIdx < targets.length; tIdx++) {
      if (generationAbortRef.current?.signal?.aborted) break;
      const target = targets[tIdx];
      const batchLabel = targets.length > 1 ? ` [${tIdx + 1}/${targets.length}]` : '';
      setBatchCurrent(tIdx + 1);
      await generateSingleReferenceCopy(target, batchLabel, tIdx);
    }
  }, [referenceCopyTarget, batchRefCount, autoPickReferences, generateSingleReferenceCopy]);

  // ══════════════════════════════════════════════════════
  // ██  RENDER SELECTED — HTML screenshot → Freepik image
  // ══════════════════════════════════════════════════════
  const renderSelectedVariants = useCallback(async () => {
    const variantIds = Array.from(selectedVariants);
    const toRender = variantIds
      .map(id => htmlVariants.find(v => v.id === id))
      .filter(Boolean) as HtmlAdVariant[];

    if (toRender.length === 0) return;

    // ── Pre-check: is Freepik server running? ──
    setRenderProgress('Checking Freepik server...');
    const serverOk = await checkServerStatus();
    if (!serverOk) {
      console.error('[Render] Freepik server not reachable at localhost:8890');
      setRenderProgress('');
      setGenerationProgress('Freepik server not running — start it first (port 8890)');
      setTimeout(() => setGenerationProgress(''), 5000);
      return;
    }

    const abortController = new AbortController();
    renderAbortRef.current = abortController;
    const signal = abortController.signal;

    setIsRendering(true);
    const totalImages = toRender.length * renderCount;
    setRenderTotal(totalImages);
    setRenderCurrent(0);
    setRenderProgress('Starting render...');

    const allUploadedBase64s = getCleanBase64s(uploadedImages);

    let renderIdx = 0;
    for (const variant of toRender) {
      if (signal.aborted) break;

      // Build reference images: ALL uploaded images + HTML screenshot as layout guide
      const allRefs = [...allUploadedBase64s, variant.screenshotBase64];
      const layoutImgIdx = allRefs.length; // 1-indexed for @img tag

      const { colors: shortColors, font: shortFont } = getShortBrandContext(campaign);

      // INSTRUCTION prompt — keep product as-is, brand colors for layout only
      const promptText = `Recreate @img${layoutImgIdx} layout. Place @img1 product as-is — do NOT recolor it. Apply ${shortColors || 'brand'} colors to background and text only.${shortFont ? ` Font: ${shortFont}.` : ''} ${variant.strategyLabel}. ${prompt || ''}`.trim();

      for (let r = 0; r < renderCount; r++) {
        if (signal.aborted) break;
        renderIdx++;
        setRenderCurrent(renderIdx);
        setRenderProgress(`Rendering ${renderIdx}/${totalImages}: ${variant.strategyLabel}`);

        try {
          const result = await generateImage({
            prompt: promptText,
            model: imageModel,
            aspectRatio: variant.aspectRatio,
            count: 1,
            style: imageStyle,
            styleReference: customStyleImage || undefined,
            referenceImages: allRefs,
            signal,
            onProgress: (msg) => setRenderProgress(`[${renderIdx}/${totalImages}] ${msg}`),
            onWarning: (msg) => setServerWarning(msg),
            onEtaUpdate: (secs) => setGenerationEta(secs),
          });

          if (result.success && result.imageBase64) {
            const renderedImg: RenderedImage = {
              id: `render-${Date.now()}-${renderIdx}-${Math.random().toString(36).slice(2, 6)}`,
              imageBase64: result.imageBase64,
              timestamp: Date.now(),
              model: imageModel,
            };

            // Push to variant's renders array
            setHtmlVariants(prev => prev.map(v =>
              v.id === variant.id ? { ...v, renders: [...v.renders, renderedImg] } : v
            ));

            // Also persist to IndexedDB
            imageCountRef.current += 1;
            const stored: StoredImage = {
              id: renderedImg.id,
              imageBase64: result.imageBase64,
              prompt: prompt || '(HTML→Render)',
              imagePrompt: promptText,
              model: imageModel,
              aspectRatio: variant.aspectRatio,
              pipeline: 'html-to-render',
              timestamp: renderedImg.timestamp,
              label: `Render ${imageCountRef.current}`,
              referenceImageCount: allRefs.length,
              campaignId: campaign?.id,
              campaignBrand: campaign?.brand,
              htmlScreenshot: variant.screenshotBase64,
              htmlSource: variant.html,
              strategyLabel: variant.strategyLabel,
              sourceHtmlId: variant.id,
              inspiredByRef: variant.inspiredBy,
            };
            await persistImage(stored);
          } else {
            setRenderProgress(`Render ${renderIdx} failed: ${result.error || 'unknown'}`);
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (err) {
          if (signal.aborted) break;
          console.error(`Render ${renderIdx} failed:`, err);
          setRenderProgress(`Render ${renderIdx} failed`);
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }

    setIsRendering(false);
    setRenderCurrent(0);
    setRenderTotal(0);
    setRenderProgress('');
    renderAbortRef.current = null;
  }, [selectedVariants, htmlVariants, uploadedImages, buildBrandVisualRules, presetEnabled, getPresetContext,
      campaign, imageModel, prompt, persistImage, renderCount, setServerWarning, setGenerationEta]);

  const handleCancelRender = useCallback(() => {
    if (renderAbortRef.current) {
      renderAbortRef.current.abort();
      setIsRendering(false);
      setRenderProgress('');
      renderAbortRef.current = null;
    }
  }, []);

  // ── Refine: HTML ads → LLM edit + re-screenshot | Freepik images → Freepik edit ──
  const handleRefine = useCallback(async () => {
    if (!selectedImage || !refinePrompt.trim() || isRefining) return;

    const abortController = new AbortController();
    refineAbortRef.current = abortController;
    setIsRefining(true);

    const userMsg = refinePrompt.trim();
    setRefineHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setRefinePrompt('');

    const isHtmlAd = !!selectedImage.htmlSource;

    try {
      if (isHtmlAd) {
        // ── HTML path: send current HTML + edit instruction to LLM ──
        setRefineProgress('LLM editing HTML...');
        const currentHtml = selectedImage.htmlSource!;
        const dim = htmlAdDimensions[(selectedImage.aspectRatio || '9:16') as AspectRatio] || htmlAdDimensions['9:16'];

        const editPrompt = `Here is the current HTML ad creative:

\`\`\`html
${currentHtml}
\`\`\`

USER EDIT REQUEST: ${userMsg}

INSTRUCTIONS:
- Apply ONLY the requested change. Keep everything else exactly the same.
- Maintain the same layout structure, dimensions (${dim.w}x${dim.h}px), colors, fonts, and brand feel.
- Output the COMPLETE modified HTML document. Start with <!DOCTYPE html> and end with </html>.
- Output ONLY HTML, no explanation.`;

        let htmlOutput = '';
        await ollamaService.generateStream(
          editPrompt,
          `You are an HTML ad editor. You receive an existing HTML ad and a user's edit instruction. Apply the edit precisely and return the full modified HTML document. Output ONLY HTML.`,
          {
            model: htmlLlmModel,
            signal: abortController.signal,
            onChunk: (chunk) => {
              htmlOutput += chunk;
              setRefineProgress(`LLM editing... (${htmlOutput.length} chars)`);
            },
          }
        );

        let cleanHtml = extractHtmlDocument(htmlOutput);
        if (!cleanHtml || cleanHtml.length < 50) {
          setRefineHistory(prev => [...prev, { role: 'result', text: 'Failed: LLM returned invalid HTML' }]);
          return;
        }

        // Embed product images if present
        if (uploadedImages.length > 0) {
          cleanHtml = embedProductImages(cleanHtml, uploadedImages);
        }

        // Screenshot the new HTML
        setRefineProgress('Capturing screenshot...');
        const screenshotBase64 = await captureHtmlScreenshot(cleanHtml, dim.w, dim.h);
        if (!screenshotBase64) {
          setRefineHistory(prev => [...prev, { role: 'result', text: 'Failed: Could not screenshot the edited HTML' }]);
          return;
        }

        // Add result to history
        setRefineHistory(prev => [...prev, { role: 'result', text: userMsg, imageBase64: screenshotBase64, htmlSource: cleanHtml }]);

        // Persist
        imageCountRef.current += 1;
        const strategyLabel = extractStrategyLabel(cleanHtml) || selectedImage.strategyLabel || 'Refined HTML';
        const refined: StoredImage = {
          id: `refine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          imageBase64: screenshotBase64,
          prompt: `Refined: ${userMsg}`,
          imagePrompt: editPrompt,
          model: llmModel,
          aspectRatio: selectedImage.aspectRatio || '9:16',
          pipeline: 'html-ad',
          timestamp: Date.now(),
          label: `Refined ${imageCountRef.current}`,
          referenceImageCount: uploadedImages.length,
          campaignId: campaign?.id,
          campaignBrand: campaign?.brand,
          strategyLabel,
          htmlSource: cleanHtml,
          htmlScreenshot: screenshotBase64,
          sourceHtmlId: (selectedImage as any).sourceHtmlId,
        };
        await persistImage(refined);
        setSelectedImage(refined);

      } else {
        // ── Freepik path: send image + instruction to Freepik for edit ──
        setRefineProgress('Sending to Freepik...');
        const currentImageBase64 = selectedImage.imageBase64;
        const editPrompt = `Edit this advertising creative image. Instruction: ${userMsg}. Keep everything else the same — only apply the requested change. Maintain the same composition, layout, and brand feel.`;

        const result = await generateImage({
          prompt: editPrompt,
          model: 'nano-banana-2',
          aspectRatio: selectedImage.aspectRatio || '9:16',
          count: 1,
          style: imageStyle,
          styleReference: customStyleImage || undefined,
          referenceImages: [currentImageBase64],
          signal: abortController.signal,
          onProgress: (msg) => setRefineProgress(msg),
          onWarning: (msg) => setServerWarning(msg),
          onEtaUpdate: (secs) => setGenerationEta(secs),
        });

        if (result.success && result.imageBase64) {
          setRefineHistory(prev => [...prev, { role: 'result', text: userMsg, imageBase64: result.imageBase64 }]);
          imageCountRef.current += 1;
          const refined: StoredImage = {
            id: `refine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            imageBase64: result.imageBase64,
            prompt: `Refined: ${userMsg}`,
            imagePrompt: editPrompt,
            model: 'nano-banana-2',
            aspectRatio: selectedImage.aspectRatio || '9:16',
            pipeline: 'refine',
            timestamp: Date.now(),
            label: `Refined ${imageCountRef.current}`,
            referenceImageCount: 1,
            campaignId: campaign?.id,
            campaignBrand: campaign?.brand,
            strategyLabel: selectedImage.strategyLabel,
            sourceHtmlId: (selectedImage as any).sourceHtmlId,
          };
          await persistImage(refined);
          setSelectedImage(refined);
        } else {
          setRefineHistory(prev => [...prev, { role: 'result', text: `Failed: ${result.error || 'Unknown error'}` }]);
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setRefineHistory(prev => [...prev, { role: 'result', text: `Error: ${String(err).slice(0, 100)}` }]);
      }
    } finally {
      setIsRefining(false);
      setRefineProgress('');
      refineAbortRef.current = null;
    }
  }, [selectedImage, refinePrompt, isRefining, campaign, persistImage, llmModel, htmlLlmModel, uploadedImages, HTML_AD_SYSTEM_PROMPT]);

  // ── Delete image from IndexedDB + update local state (animated) ──
  const removeImage = useCallback(async (id: string) => {
    setDeletingIds(prev => new Set(prev).add(id));
    setTimeout(async () => {
      await storage.deleteImage(id);
      setStoredImages(prev => prev.filter(img => img.id !== id));
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      if (selectedImage?.id === id) setSelectedImage(null);
    }, 350);
  }, [selectedImage]);

  // ── Toggle favorite on image ──
  const toggleFavorite = useCallback(async (id: string) => {
    const updated = await storage.toggleFavorite(id);
    if (updated) {
      setStoredImages(prev => prev.map(img => img.id === id ? { ...img, favorite: updated.favorite } : img));
      if (selectedImage?.id === id) {
        setSelectedImage(prev => prev ? { ...prev, favorite: updated.favorite } : prev);
      }
    }
  }, [selectedImage]);

  // ══════════════════════════════════════════════════════
  // ██  GENERATE — single image (called by batch wrapper)
  // ══════════════════════════════════════════════════════
  const generateSingleImage = useCallback(async (): Promise<boolean> => {
    const dim = aspectDimensions[aspectRatio];
    const imageContext = buildImageContext();
    const brandRules = buildBrandVisualRules();
    const presetContext = getPresetContext();
    const signal = generationAbortRef.current?.signal; // Access abort signal from ref

    const variationHint = '';
    imageCountRef.current += 1;
    const nextLabel = `Ad ${imageCountRef.current}`;
    const pipelineType = !llmEnabled ? 'direct'
      : researchEnabled ? (htmlEnabled ? 'research-html-llm' : 'research-llm')
      : presetEnabled ? (htmlEnabled ? 'preset-html-llm' : 'preset-llm')
      : htmlEnabled ? 'html-llm'
      : 'llm';
    const modelName = imageModel === 'nano-banana-2' ? 'Nano Banana 2' : 'Seedream 5 Lite';

    // ── HTML AD PATH (primary): LLM generates complete HTML ads ──
    if (htmlEnabled && llmEnabled) {
      // HTML ads are handled by generateHtmlAds in the batch wrapper
      // This shouldn't be reached, but just in case:
      await generateHtmlAds(1);
      return true;
    }

    // ── PATH 3 (Freepik direct): User prompt → Image model ──
    if (!llmEnabled) {
      // Quick health check before wasting time
      try {
        const healthOk = await checkServerStatus();
        if (!healthOk) {
          setGenerationProgress('Freepik server not running — start it first');
          setServerWarning('Server at localhost:8890 is not responding');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }
      } catch {
        // Continue anyway — the generateImage call will handle retries
      }
      setGenerationProgress('Sending to image model...');
      setServerWarning('');

      const finalImagePrompt = prompt;

      setGenerationProgress(`Sending to ${modelName}...`);

      // Send ALL uploaded images to Freepik (product + layout refs)
      const allRefBase64s = getCleanBase64s(uploadedImages);
      const result = await generateImage({
        prompt: finalImagePrompt,
        model: imageModel,
        aspectRatio,
        count: batchCount,  // Pass batch count to Freepik natively
        style: imageStyle,
        styleReference: customStyleImage || undefined,
        referenceImages: allRefBase64s,
        signal,
        onProgress: (msg) => setGenerationProgress(msg),
        onWarning: (msg) => setServerWarning(msg),
        onEtaUpdate: (secs) => setGenerationEta(secs),
      });

      if (result.success && result.imageBase64) {
        // Freepik may return multiple images natively
        const allImages = result.imagesBase64 || [result.imageBase64];
        for (let j = 0; j < allImages.length; j++) {
          if (j > 0) imageCountRef.current += 1; // First already counted at top
          const stored: StoredImage = {
            id: `img-${Date.now()}-${j}-${Math.random().toString(36).slice(2, 6)}`,
            imageBase64: allImages[j],
            prompt,
            imagePrompt: finalImagePrompt,
            model: imageModel,
            aspectRatio,
            pipeline: pipelineType,
            timestamp: Date.now(),
            label: `Ad ${imageCountRef.current}`,
            referenceImageCount: allRefBase64s.length,
            referenceImages: allRefBase64s.length > 0 ? allRefBase64s : undefined,
            campaignId: campaign?.id,
            campaignBrand: campaign?.brand,
            heroImageBase64: undefined,
          };
          await persistImage(stored);
        }
        return true;
      } else {
        setGenerationProgress(result.error || 'Image generation failed');
        await new Promise(r => setTimeout(r, 3000));
        // Revert the label counter since this one failed
        imageCountRef.current -= 1;
        return false;
      }
    }

    // ── PATH 5: LLM only — enhance/refine the user prompt (JSON output) ──
    else if (llmEnabled && !presetEnabled && !researchEnabled && !htmlEnabled) {
      setLlmOutput('');
      setGenerationProgress(`Thinking + preloading Freepik...`);

      // Preload Freepik IN PARALLEL with LLM thinking (uploads refs while LLM streams)
      const allRefBase64s = getCleanBase64s(uploadedImages);
      const freepikWarmup = preloadFreepik({
        model: imageModel,
        aspectRatio,
        count: 1,
        style: imageStyle,
        styleReference: customStyleImage || undefined,
        referenceImages: allRefBase64s,
        signal,
        onProgress: (msg) => setGenerationProgress(`LLM thinking... | ${msg}`),
      }).then(ok => {
        setFreepikReady(ok);
        return ok;
      });

      const settings = getSettingsContext();
      const llmPrompt = `Engineer a high-performance static AD CREATIVE as JSON.

USER BRIEF: ${prompt || 'Create a scroll-stopping ad that would win in paid social.'}

${settings}
${imageContext ? `${imageContext}\n` : ''}
${brandRules}${variationHint}
Apply your ad creative expertise: pick the strongest ad format, choose a copy framework that matches the angle, and design a composition that stops the scroll. Format: ${aspectRatio}.

Output a single JSON object. Every creative choice must have strategic intent — this is an AD, not a photo.`;

      try {
        const rawOutput = await ollamaService.generateStream(
          llmPrompt,
          JSON_SYSTEM_PROMPT,
          { model: llmModel, signal, onChunk: (chunk) => setLlmOutput(prev => prev + chunk) }
        );

        // LLM done — check Freepik warmup result
        const freepikOk = await freepikWarmup;
        if (!freepikOk) {
          setGenerationProgress('Freepik server not running — start it first');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }

        // Capture first concept for variation mode
        if (!lastConceptRef.current) lastConceptRef.current = rawOutput.slice(0, 500);

        const { colors: shortColors } = getShortBrandContext(campaign);
        const cleanPrompt = extractImagePrompt(rawOutput, {
          shortColors,
          imageCount: uploadedImages.length,
        });
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const allRefBase64s = getCleanBase64s(uploadedImages);
        const result = await generateImage({
          prompt: cleanPrompt,
          model: imageModel,
          aspectRatio,
          count: 1,
          style: imageStyle,
          styleReference: customStyleImage || undefined,
          referenceImages: allRefBase64s,
          signal,
          onProgress: (msg) => setGenerationProgress(msg),
          onWarning: (msg) => setServerWarning(msg),
          onEtaUpdate: (secs) => setGenerationEta(secs),
        });

        if (result.success && result.imageBase64) {
          const stored: StoredImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            imageBase64: result.imageBase64,
            prompt,
            imagePrompt: cleanPrompt,
            model: imageModel,
            aspectRatio,
            pipeline: pipelineType,
            timestamp: Date.now(),
            label: nextLabel,
            referenceImageCount: allRefBase64s.length,
            referenceImages: allRefBase64s.length > 0 ? allRefBase64s : undefined,
            campaignId: campaign?.id,
            campaignBrand: campaign?.brand,
          };
          await persistImage(stored);
          return true;
        } else {
          setGenerationProgress(result.error || 'Image generation failed');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }
      } catch (err) {
        console.error('LLM prompt enhancement failed:', err);
        setGenerationProgress('LLM failed — check Ollama connection');
        await new Promise(r => setTimeout(r, 2000));
        imageCountRef.current -= 1;
        return false;
      }
    }

    // ── PATH 4: Preset data → LLM generates ad angle + prompt (JSON) → Image model ──
    else if (llmEnabled && presetEnabled && !researchEnabled && !htmlEnabled) {
      setGenerationProgress('Thinking + warming up Freepik...');
      setLlmOutput('');
      const fullPreset = getFullPresetContext();

      if (!fullPreset) {
        setGenerationProgress('No preset data available — set up a campaign with preset first');
        await new Promise(r => setTimeout(r, 3000));
        imageCountRef.current -= 1;
        return false;
      }

      // Preload Freepik IN PARALLEL with LLM thinking
      const allRefBase64s_preload = getCleanBase64s(uploadedImages);
      const freepikWarmup = preloadFreepik({
        model: imageModel,
        aspectRatio,
        count: 1,
        style: imageStyle,
        styleReference: customStyleImage || undefined,
        referenceImages: allRefBase64s_preload,
        signal,
        onProgress: (msg) => setGenerationProgress(`LLM thinking... | ${msg}`),
      }).then(ok => {
        setFreepikReady(ok);
        return ok;
      });

      const settings = getSettingsContext();
      const llmPrompt = `You have the complete BRAND BIBLE below. Internalize every detail — colors, packaging, visual identity, audience psychology, competitive positioning. Then engineer a static AD CREATIVE that this brand would actually run.

USER BRIEF: ${prompt || 'Create a high-performance ad targeting the core audience desire.'}

--- BRAND BIBLE ---
${fullPreset}

${settings}
${imageContext ? `${imageContext}\n` : ''}
${brandRules}${variationHint}
Use the brand data to pick the strongest angle. Match the brand's visual identity exactly — this ad must look like it came from their creative team. Choose the ad format and copy framework that best serves the angle + audience. Output JSON.`;

      setGenerationProgress(`Generating ad angle with ${llmModel}...`);

      try {
        const rawOutput = await ollamaService.generateStream(
          llmPrompt,
          JSON_SYSTEM_PROMPT,
          { model: llmModel, signal, onChunk: (chunk) => setLlmOutput(prev => prev + chunk) }
        );

        // LLM done — check Freepik warmup result
        const freepikOk = await freepikWarmup;
        if (!freepikOk) {
          setGenerationProgress('Freepik server not running — start it first');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }

        // Capture first concept for variation mode
        if (!lastConceptRef.current) lastConceptRef.current = rawOutput.slice(0, 500);

        const { colors: shortColors } = getShortBrandContext(campaign);
        const cleanPrompt = extractImagePrompt(rawOutput, {
          shortColors,
          imageCount: uploadedImages.length,
        });
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const allRefBase64s = getCleanBase64s(uploadedImages);
        const result = await generateImage({
          prompt: cleanPrompt,
          model: imageModel,
          aspectRatio,
          count: 1,
          style: imageStyle,
          styleReference: customStyleImage || undefined,
          referenceImages: allRefBase64s,
          signal,
          onProgress: (msg) => setGenerationProgress(msg),
          onWarning: (msg) => setServerWarning(msg),
          onEtaUpdate: (secs) => setGenerationEta(secs),
        });

        if (result.success && result.imageBase64) {
          const stored: StoredImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            imageBase64: result.imageBase64,
            prompt,
            imagePrompt: cleanPrompt,
            model: imageModel,
            aspectRatio,
            pipeline: pipelineType,
            timestamp: Date.now(),
            label: nextLabel,
            referenceImageCount: allRefBase64s.length,
            referenceImages: allRefBase64s.length > 0 ? allRefBase64s : undefined,
            campaignId: campaign?.id,
            campaignBrand: campaign?.brand,
          };
          await persistImage(stored);
          return true;
        } else {
          setGenerationProgress(result.error || 'Image generation failed');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }
      } catch (err) {
        console.error('LLM prompt generation failed:', err);
        setGenerationProgress('LLM failed — check Ollama connection');
        await new Promise(r => setTimeout(r, 2000));
        imageCountRef.current -= 1;
        return false;
      }
    }

    // ── PATH 4b: LLM → HTML layout → Screenshot → Image model (with optional preset) ──
    else if (llmEnabled && !researchEnabled && htmlEnabled) {
      setGenerationProgress('Generating HTML layout...');
      setLlmOutput('');
      const fullPreset = presetEnabled ? getFullPresetContext() : '';

      // Extract brand colors/fonts for the HTML template
      const brandData = campaign?.presetData?.brand;
      const productData = campaign?.presetData?.product;
      const brandColorHint = brandData?.colors || campaign?.brandColors || '';
      const brandFontHint = brandData?.fonts || campaign?.brandFonts || '';
      const packagingHint = brandData?.packagingDesign || productData?.packaging || '';

      const htmlPrompt = `You are an ad layout designer who deeply understands the brand. Generate a complete HTML ad layout as a COMPOSITION GUIDE.

USER BRIEF: ${prompt || 'Create a high-performance ad layout.'}

${fullPreset ? `--- BRAND BIBLE ---\n${fullPreset}\n` : ''}${brandRules}
DIMENSIONS: ${aspectRatio} (${dim.w}x${dim.h}px)
${brandColorHint ? `BRAND COLORS: ${brandColorHint}` : ''}
${brandFontHint ? `BRAND FONTS: ${brandFontHint}` : ''}
${packagingHint ? `PRODUCT PACKAGING: ${packagingHint}` : ''}

Create a layout guide for a ${aspectRatio} ad (${dim.w}x${dim.h}px). This layout will be screenshotted and used as a COMPOSITION REFERENCE for the image model.

REQUIREMENTS:
- Use the brand's ACTUAL colors as backgrounds, accents, and gradients
- Use brand fonts (load from Google Fonts if needed, or fallback to similar system fonts)
- Design clear ZONES: headline area (compelling copy, not placeholder), product placement area, CTA area
- Use placeholder blocks/shapes for the product (labeled or colored rectangle matching the product)
- Write REAL ad copy — a headline that would stop someone scrolling, and a CTA that drives action
- Use solid color blocks, gradients, and typography to establish visual hierarchy
- This is a LAYOUT WIREFRAME with real brand styling — not a final rendered ad
- Fills the entire ${dim.w}x${dim.h} container with no margin or padding on the outer container
- All styles inline or in a <style> tag — no external CSS

Output ONLY the complete HTML document. Start with <!DOCTYPE html>.`;

      setGenerationProgress(`Creating layout with ${llmModel}...`);

      try {
        // ── PHASE 1: Generate HTML layout ──
        setLlmOutput('─── PHASE 1: GENERATING HTML LAYOUT ───\n\n');
        let htmlOutput = '';
        const htmlGenPromise = ollamaService.generateStream(
          htmlPrompt,
          'You are a world-class ad layout designer. Output only valid HTML. No markdown fences, no explanation — just the HTML document.',
          { model: htmlLlmModel, signal, onChunk: (chunk) => {
            htmlOutput += chunk;
            setLlmOutput(prev => prev + chunk);
          }}
        );
        // 120s timeout — if LLM hangs, don't block forever
        const htmlTimeout = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('HTML generation timed out after 120s')), 120000)
        );
        await Promise.race([htmlGenPromise, htmlTimeout]);

        if (!htmlOutput.trim()) {
          setLlmOutput(prev => prev + '\n─── ⚠ LLM returned empty HTML ───\n');
          setGenerationProgress('LLM returned empty HTML — try again');
          await new Promise(r => setTimeout(r, 2000));
          imageCountRef.current -= 1;
          return false;
        }

        // Extract the HTML from LLM output (strip any non-HTML wrapper)
        let cleanHtml = htmlOutput.trim();
        const docStart = cleanHtml.indexOf('<!DOCTYPE') !== -1 ? cleanHtml.indexOf('<!DOCTYPE') : cleanHtml.indexOf('<html');
        const docEnd = cleanHtml.lastIndexOf('</html>');
        if (docStart >= 0 && docEnd > docStart) {
          cleanHtml = cleanHtml.slice(docStart, docEnd + 7);
        }

        // Screenshot the HTML layout
        setGenerationProgress('Rendering layout wireframe...');
        setLlmOutput(prev => prev + '\n\n─── Rendering layout to image... ───\n');
        const layoutScreenshot = await captureHtmlScreenshot(cleanHtml, dim.w, dim.h);

        const layoutStatus = layoutScreenshot ? '✓ Layout rendered and captured' : '⚠ Layout generated (screenshot failed — continuing without layout ref)';
        setLlmOutput(prev => prev + `─── ${layoutStatus} ───\n`);

        if (layoutScreenshot) {
          setGenerationProgress('Layout captured. Building ad prompt...');
        } else {
          setGenerationProgress('Screenshot failed — generating ad without layout ref...');
        }

        // ── PHASE 2: Build image prompt from layout ──
        setLlmOutput(prev => prev + '\n─── PHASE 2: BUILDING AD PROMPT ───\n\n');

        // Build reference images: ALL uploaded images + layout screenshot
        const allUploadedBase64s = getCleanBase64s(uploadedImages);
        const allRefs = layoutScreenshot ? [...allUploadedBase64s, layoutScreenshot] : allUploadedBase64s;
        // @img tags are 1-indexed: uploaded images first, layout screenshot last
        const layoutImgTag = layoutScreenshot ? `@img${allRefs.length}` : '';

        const { colors: shortColors, font: shortFont } = getShortBrandContext(campaign);

        // INSTRUCTION prompt — keep product as-is, brand colors for layout only
        const imagePromptFromLayout = `Recreate ${layoutImgTag || 'this layout'}. ${uploadedImages.length > 0 ? 'Place @img1 product as-is — do NOT recolor it.' : ''}${shortColors ? ` Apply ${shortColors} to background and text only.` : ''}${shortFont ? ` Font: ${shortFont}.` : ''} ${prompt || 'Product hero, clean, polished ad.'}`.trim();

        setLlmOutput(prev => prev + imagePromptFromLayout + '\n');

        // ── PHASE 3: Send to image model ──
        setLlmOutput(prev => prev + `\n─── PHASE 3: SENDING TO ${modelName.toUpperCase()} ───\n`);
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const result = await generateImage({
          prompt: imagePromptFromLayout,
          model: imageModel,
          aspectRatio,
          count: 1,
          style: imageStyle,
          styleReference: customStyleImage || undefined,
          referenceImages: allRefs,
          signal,
          onProgress: (msg) => setGenerationProgress(msg),
          onWarning: (msg) => setServerWarning(msg),
          onEtaUpdate: (secs) => setGenerationEta(secs),
        });

        if (result.success && result.imageBase64) {
          const stored: StoredImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            imageBase64: result.imageBase64,
            prompt,
            imagePrompt: imagePromptFromLayout,
            model: imageModel,
            aspectRatio,
            pipeline: pipelineType,
            timestamp: Date.now(),
            label: nextLabel,
            referenceImageCount: allRefs.length,
            referenceImages: allRefs.length > 0 ? allRefs : undefined,
            htmlScreenshot: layoutScreenshot || undefined,
            campaignId: campaign?.id,
            campaignBrand: campaign?.brand,
          };
          await persistImage(stored);
          return true;
        } else {
          setGenerationProgress(result.error || 'Image generation failed');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.error('HTML layout generation failed:', errMsg);
        if (errMsg.includes('timed out')) {
          setGenerationProgress('HTML generation timed out — try a simpler prompt or disable HTML mode');
        } else if (errMsg.includes('abort') || err?.name === 'AbortError') {
          setGenerationProgress('Generation cancelled');
        } else {
          setGenerationProgress(`Layout failed: ${errMsg.slice(0, 80)}`);
        }
        setLlmOutput(prev => prev + `\n─── ✗ ERROR: ${errMsg} ───\n`);
        await new Promise(r => setTimeout(r, 2500));
        imageCountRef.current -= 1;
        return false;
      }
    }

    // ── PATH 2: Research → LLM prompt (JSON) → Image model ──
    else if (llmEnabled && researchEnabled && !htmlEnabled) {
      setGenerationProgress('Thinking + preloading Freepik...');
      setLlmOutput('');

      // Preload Freepik IN PARALLEL with LLM thinking
      const allRefBase64s_preload = getCleanBase64s(uploadedImages);
      const freepikWarmup = preloadFreepik({
        model: imageModel,
        aspectRatio,
        count: 1,
        style: imageStyle,
        styleReference: customStyleImage || undefined,
        referenceImages: allRefBase64s_preload,
        signal,
        onProgress: (msg) => setGenerationProgress(`LLM thinking... | ${msg}`),
      }).then(ok => {
        setFreepikReady(ok);
        return ok;
      });

      const researchContext = getResearchContext();
      const settings = getSettingsContext();

      const fullPreset = presetEnabled ? getFullPresetContext() : '';
      const llmPrompt = `You have REAL CUSTOMER RESEARCH below — actual desires, pain points, objections, and language from the target audience. Use this intelligence to engineer an AD CREATIVE that speaks directly to what these people actually want and fear.

USER BRIEF: ${prompt || 'Create an ad that leverages the research insights to stop the scroll and convert.'}

${fullPreset ? `--- BRAND BIBLE ---\n${fullPreset}\n` : presetContext ? `BRAND:\n${presetContext}\n` : ''}
${researchContext ? `--- CUSTOMER RESEARCH ---\n${researchContext}\n` : ''}
${settings}
${imageContext ? `${imageContext}\n` : ''}
${brandRules}${variationHint}
The research tells you WHAT to say. Your ad expertise tells you HOW to say it visually. Pick the ad format and copy framework that best matches the strongest research insight. Output JSON.`;

      setGenerationProgress(`Thinking with ${llmModel}...`);

      try {
        const rawOutput = await ollamaService.generateStream(
          llmPrompt,
          JSON_SYSTEM_PROMPT,
          { model: llmModel, signal, onChunk: (chunk) => setLlmOutput(prev => prev + chunk) }
        );

        // LLM done — check Freepik warmup result
        const freepikOk = await freepikWarmup;
        if (!freepikOk) {
          setGenerationProgress('Freepik server not running — start it first');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }

        // Capture first concept for variation mode
        if (!lastConceptRef.current) lastConceptRef.current = rawOutput.slice(0, 500);

        const { colors: shortColors } = getShortBrandContext(campaign);
        const cleanPrompt = extractImagePrompt(rawOutput, {
          shortColors,
          imageCount: uploadedImages.length,
        });
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const allRefBase64s = getCleanBase64s(uploadedImages);
        const result = await generateImage({
          prompt: cleanPrompt,
          model: imageModel,
          aspectRatio,
          count: 1,
          style: imageStyle,
          styleReference: customStyleImage || undefined,
          referenceImages: allRefBase64s,
          signal,
          onProgress: (msg) => setGenerationProgress(msg),
          onWarning: (msg) => setServerWarning(msg),
          onEtaUpdate: (secs) => setGenerationEta(secs),
        });

        if (result.success && result.imageBase64) {
          const stored: StoredImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            imageBase64: result.imageBase64,
            prompt,
            imagePrompt: cleanPrompt,
            model: imageModel,
            aspectRatio,
            pipeline: pipelineType,
            timestamp: Date.now(),
            label: nextLabel,
            referenceImageCount: allRefBase64s.length,
            referenceImages: allRefBase64s.length > 0 ? allRefBase64s : undefined,
            campaignId: campaign?.id,
            campaignBrand: campaign?.brand,
          };
          await persistImage(stored);
          return true;
        } else {
          setGenerationProgress(result.error || 'Image generation failed');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }
      } catch (err) {
        console.error('LLM prompt generation failed:', err);
        setGenerationProgress('LLM failed — check Ollama connection');
        await new Promise(r => setTimeout(r, 2000));
        imageCountRef.current -= 1;
        return false;
      }
    }

    // ── PATH 1: Research → HTML Layout → Screenshot → Image model ──
    else if (llmEnabled && researchEnabled && htmlEnabled) {
      setGenerationProgress('Generating HTML layout...');
      setLlmOutput('');
      const researchContext = getResearchContext();

      // Extract brand colors/fonts for the HTML template
      const brandData = campaign?.presetData?.brand;
      const productData = campaign?.presetData?.product;
      const brandColorHint = brandData?.colors || campaign?.brandColors || '';
      const brandFontHint = brandData?.fonts || campaign?.brandFonts || '';
      const packagingHint = brandData?.packagingDesign || productData?.packaging || '';

      const fullPreset = presetEnabled ? getFullPresetContext() : '';
      const htmlPrompt = `You are an ad layout designer who uses RESEARCH DATA to inform every creative decision. Generate a complete HTML ad layout as a COMPOSITION GUIDE.

USER BRIEF: ${prompt || 'Create an ad layout that leverages the research insights.'}

${fullPreset ? `--- BRAND BIBLE ---\n${fullPreset}\n` : presetContext ? `BRAND:\n${presetContext}\n` : ''}
${researchContext ? `--- CUSTOMER RESEARCH ---\n${researchContext}\n` : ''}
${brandRules}
DIMENSIONS: ${aspectRatio} (${dim.w}x${dim.h}px)
${brandColorHint ? `BRAND COLORS: ${brandColorHint}` : ''}
${brandFontHint ? `BRAND FONTS: ${brandFontHint}` : ''}
${packagingHint ? `PRODUCT PACKAGING: ${packagingHint}` : ''}

Create a layout guide for a ${aspectRatio} ad (${dim.w}x${dim.h}px). This layout will be screenshotted and used as a COMPOSITION REFERENCE for the image model.

REQUIREMENTS:
- Address the TOP customer desire from research — write REAL ad copy (not placeholder), using the customer's own language
- Use the brand's ACTUAL colors as backgrounds, accents, and gradients
- Use brand fonts (load from Google Fonts if needed, or fallback to similar system fonts)
- Design clear ZONES: headline area, product placement area, CTA area, social proof area
- Use placeholder blocks/shapes for the product (labeled or use a colored rectangle matching the product)
- Include a social proof element from research (customer quote, pain point, or stat)
- The headline and CTA must be compelling ad copy grounded in research findings
- Use solid color blocks, gradients, and typography to establish the visual hierarchy
- This is a LAYOUT WIREFRAME with real brand styling — not a final rendered ad
- Fills the entire ${dim.w}x${dim.h} container with no margin or padding on the outer container
- All styles inline or in a <style> tag — no external CSS

Output ONLY the complete HTML document. Start with <!DOCTYPE html>.`;

      setGenerationProgress(`Creating layout with ${llmModel}...`);

      try {
        // ── PHASE 1: Generate HTML layout ──
        setLlmOutput('─── PHASE 1: GENERATING HTML LAYOUT (with research) ───\n\n');
        let htmlOutput = '';
        const htmlGenPromise = ollamaService.generateStream(
          htmlPrompt,
          'You are a world-class ad layout designer. Output only valid HTML. No markdown fences, no explanation — just the HTML document.',
          { model: htmlLlmModel, signal, onChunk: (chunk) => {
            htmlOutput += chunk;
            setLlmOutput(prev => prev + chunk);
          }}
        );
        const htmlTimeout = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('HTML generation timed out after 120s')), 120000)
        );
        await Promise.race([htmlGenPromise, htmlTimeout]);

        if (!htmlOutput.trim()) {
          setLlmOutput(prev => prev + '\n─── ⚠ LLM returned empty HTML ───\n');
          setGenerationProgress('LLM returned empty HTML — try again');
          await new Promise(r => setTimeout(r, 2000));
          imageCountRef.current -= 1;
          return false;
        }

        // Extract the HTML from LLM output
        let cleanHtml = htmlOutput.trim();
        const docStart = cleanHtml.indexOf('<!DOCTYPE') !== -1 ? cleanHtml.indexOf('<!DOCTYPE') : cleanHtml.indexOf('<html');
        const docEnd = cleanHtml.lastIndexOf('</html>');
        if (docStart >= 0 && docEnd > docStart) {
          cleanHtml = cleanHtml.slice(docStart, docEnd + 7);
        }

        // Screenshot the HTML layout
        setGenerationProgress('Rendering layout wireframe...');
        setLlmOutput(prev => prev + '\n\n─── Rendering layout to image... ───\n');
        const layoutScreenshot = await captureHtmlScreenshot(cleanHtml, dim.w, dim.h);

        const layoutStatus = layoutScreenshot ? '✓ Layout rendered and captured' : '⚠ Layout generated (screenshot failed — continuing without layout ref)';
        setLlmOutput(prev => prev + `─── ${layoutStatus} ───\n`);

        if (layoutScreenshot) {
          setGenerationProgress('Layout captured. Building ad prompt...');
        } else {
          setGenerationProgress('Screenshot failed — generating ad without layout ref...');
        }

        // ── PHASE 2: Build image prompt from layout ──
        setLlmOutput(prev => prev + '\n─── PHASE 2: BUILDING AD PROMPT ───\n\n');

        // Build reference images: ALL uploaded images + layout screenshot
        const allUploadedBase64s = getCleanBase64s(uploadedImages);
        const allRefs = layoutScreenshot ? [...allUploadedBase64s, layoutScreenshot] : allUploadedBase64s;
        const layoutImgTag = layoutScreenshot ? `@img${allRefs.length}` : '';

        const { colors: shortColors, font: shortFont } = getShortBrandContext(campaign);

        // INSTRUCTION prompt — keep product as-is, brand colors for layout only
        const imagePromptFromLayout = `Recreate ${layoutImgTag || 'this layout'}. ${uploadedImages.length > 0 ? 'Place @img1 product as-is — do NOT recolor it.' : ''}${shortColors ? ` Apply ${shortColors} to background and text only.` : ''}${shortFont ? ` Font: ${shortFont}.` : ''} ${prompt || 'Product hero, clean, polished ad.'}`.trim();

        setLlmOutput(prev => prev + imagePromptFromLayout + '\n');

        // ── PHASE 3: Send to image model ──
        setLlmOutput(prev => prev + `\n─── PHASE 3: SENDING TO ${modelName.toUpperCase()} ───\n`);
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const result = await generateImage({
          prompt: imagePromptFromLayout,
          model: imageModel,
          aspectRatio,
          count: 1,
          style: imageStyle,
          styleReference: customStyleImage || undefined,
          referenceImages: allRefs,
          signal,
          onProgress: (msg) => setGenerationProgress(msg),
          onWarning: (msg) => setServerWarning(msg),
          onEtaUpdate: (secs) => setGenerationEta(secs),
        });

        if (result.success && result.imageBase64) {
          const stored: StoredImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            imageBase64: result.imageBase64,
            prompt,
            imagePrompt: imagePromptFromLayout,
            model: imageModel,
            aspectRatio,
            pipeline: pipelineType,
            timestamp: Date.now(),
            label: nextLabel,
            referenceImageCount: allRefs.length,
            referenceImages: allRefs.length > 0 ? allRefs : undefined,
            htmlScreenshot: layoutScreenshot || undefined,
            campaignId: campaign?.id,
            campaignBrand: campaign?.brand,
          };
          await persistImage(stored);
          return true;
        } else {
          setGenerationProgress(result.error || 'Image generation failed');
          await new Promise(r => setTimeout(r, 3000));
          imageCountRef.current -= 1;
          return false;
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.error('HTML layout generation failed:', errMsg);
        if (errMsg.includes('timed out')) {
          setGenerationProgress('HTML generation timed out — try a simpler prompt or disable HTML mode');
        } else if (errMsg.includes('abort') || err?.name === 'AbortError') {
          setGenerationProgress('Generation cancelled');
        } else {
          setGenerationProgress(`Layout failed: ${errMsg.slice(0, 80)}`);
        }
        setLlmOutput(prev => prev + `\n─── ✗ ERROR: ${errMsg} ───\n`);
        await new Promise(r => setTimeout(r, 2500));
        imageCountRef.current -= 1;
        return false;
      }
    }

    return false;
  }, [prompt, aspectRatio, campaign, imageModel, llmEnabled, presetEnabled, htmlEnabled, researchEnabled, llmModel, htmlLlmModel, batchCount, uploadedImages, getResearchContext, getPresetContext, getFullPresetContext, getSettingsContext, buildImageContext, buildBrandVisualRules, persistImage, knowledgeContent]);

  // ══════════════════════════════════════════════════════
  // ██  BATCH GENERATE — orchestrates all generation modes
  // ══════════════════════════════════════════════════════
  const handleGenerate = useCallback(async () => {
    if (isGenerating || isRendering) return;
    // Non-LLM non-refcopy mode requires a prompt
    if (!llmEnabled && !referenceCopyEnabled && !prompt.trim()) return;
    playSound('launch');

    // Validation: Check for missing critical inputs
    const warnings: string[] = [];
    const hasPrompt = prompt.trim().length > 0;
    const hasBrand = campaign?.presetData?.brand || campaign?.brand;
    const hasResearch = currentCycle?.researchFindings &&
      (currentCycle.researchFindings.deepDesires?.length ||
       currentCycle.researchFindings.objections?.length ||
       currentCycle.researchFindings.avatarLanguage?.length);

    if (!hasPrompt && !hasBrand) {
      warnings.push('⚠️ Missing: Add a prompt or load brand preset');
    }
    if (htmlEnabled && !hasPrompt && !hasResearch) {
      warnings.push('⚠️ Tip: Add a prompt or run research for better results');
    }

    // Show warnings if any
    if (warnings.length > 0) {
      const warningText = warnings.join('\n');
      setGenerationProgress(warningText);
      await new Promise(r => setTimeout(r, 2500));
      setGenerationProgress('');
      // Don't block generation, just warn
    }

    // ── Research readiness gate — block if enabled + research is thin ──
    if (researchReadinessCheck && researchEnabled) {
      const rf = currentCycle?.researchFindings;
      const desireCount = rf?.deepDesires?.length || 0;
      const objectionCount = rf?.objections?.length || 0;
      const languageCount = rf?.avatarLanguage?.length || 0;
      const gapCount = rf?.competitorWeaknesses?.length || 0;
      const total = desireCount + objectionCount + languageCount + gapCount;

      if (total < 4) {
        // Research data is too thin — block generation
        const missing: string[] = [];
        if (desireCount === 0) missing.push('customer desires');
        if (objectionCount === 0) missing.push('purchase objections');
        if (languageCount === 0) missing.push('customer language');
        if (gapCount === 0) missing.push('competitor gaps');
        const msg = `Research data insufficient — need more: ${missing.join(', ')}. Run research first or disable research readiness check.`;
        setResearchReadinessWarning(msg);
        setGenerationProgress(msg);
        await new Promise(r => setTimeout(r, 4000));
        setGenerationProgress('');
        return; // BLOCK — don't generate with thin data
      } else if (total < 8) {
        // Thin but usable — warn but don't block
        setResearchReadinessWarning(`Research is thin (${total} insights). Ads may be generic. Consider running more research.`);
        // Continue to generation
      } else {
        setResearchReadinessWarning(''); // Sufficient
      }
    } else {
      setResearchReadinessWarning('');
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    generationAbortRef.current = abortController;

    // Reset concept ref for variation mode
    lastConceptRef.current = '';

    setIsGenerating(true);
    setSelectedImage(null);
    setGeneratingForPrompt(prompt.trim() || '(LLM auto)');
    setGenerationStartTime(Date.now());
    setGenerationElapsed(0);
    // Reset token counters for new generation run
    chunkCountRef.current = 0;
    chunkStartRef.current = 0;
    stepChunkRef.current = 0;
    stepStartRef.current = 0;
    setGenerationEta(MODEL_ETAS[imageModel] || 30);
    setBatchCurrent(0);
    setLlmOutput('');
    // Clear previous vision history
    setVisionHistory([]);
    setShowVisionComparison(false);

    // Auto-scroll gallery to top so placeholder is visible
    requestAnimationFrame(() => {
      galleryScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    try {
      // ── REFERENCE COPY MODE — ad library ref → Freepik direct (auto-pick if no target) ──
      if (referenceCopyEnabled) {
        await generateReferenceCopy();
      }
      // ── HTML AD MODE (primary) ──
      else if (htmlEnabled && llmEnabled) {
        await generateHtmlAds(variantCount);
      }
      // ── FREEPIK MODE (fallback) ──
      else {
        const count = batchCount;
        const loopCount = !llmEnabled ? 1 : count;
        let successes = 0;

        for (let i = 0; i < loopCount; i++) {
          if (abortController.signal.aborted) break;

          setBatchCurrent(i + 1);
          setGenerationStartTime(Date.now());
          setGenerationElapsed(0);
          setGenerationEta(MODEL_ETAS[imageModel] || 30);

          if (loopCount > 1) {
            setGenerationProgress(`Starting ${i + 1}/${loopCount}...`);
          } else if (count > 1 && !llmEnabled) {
            setGenerationProgress(`Generating batch of ${count}...`);
          }

          const ok = await generateSingleImage();
          if (ok) successes++;
          if (!ok && i === 0) break;
        }

        if (successes > 0) {
          setGenerationProgress(`Done — ${successes} image${successes > 1 ? 's' : ''} generated`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        setGenerationProgress('Generation cancelled.');
        await new Promise(r => setTimeout(r, 1500));
      } else {
        console.error('Generation failed:', err);
        setGenerationProgress('Generation failed. Try again.');
        await new Promise(r => setTimeout(r, 2000));
      }
    } finally {
      const wasCancelled = abortController.signal.aborted;
      generationAbortRef.current = null;
      setCurrentHtmlPreview('');
      setGenerationPhase('idle');
      // Only show completion if not cancelled (cancel handler already updated UI)
      if (!wasCancelled) {
        const adsMade = htmlVariants.length;
        if (adsMade > 0) {
          setGenerationProgress(`Done — ${adsMade} ad${adsMade > 1 ? 's' : ''} created`);
          await new Promise(r => setTimeout(r, 2500));
        }
        setIsGenerating(false);
        setGeneratingForPrompt(null);
        setGenerationProgress('');
      }
      targetDesireRef.current = null;
      setGeneratingDesireId(null);
      setBatchCurrent(0);
    }
  }, [prompt, isGenerating, batchCount, variantCount, imageModel, llmEnabled, htmlEnabled, generateSingleImage, generateHtmlAds, htmlVariants.length, referenceCopyEnabled, referenceCopyTarget, generateReferenceCopy, researchReadinessCheck, researchEnabled, currentCycle]);

  // Keep ref in sync so DesireBoard can trigger generation
  handleGenerateRef.current = handleGenerate;

  const handleCancelGeneration = useCallback(() => {
    playSound('stop');
    // Abort generation pipeline
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
    }
    // Also abort any active HTML render
    if (renderAbortRef.current) {
      renderAbortRef.current.abort();
    }
    // Also abort any active refine
    if (refineAbortRef.current) {
      refineAbortRef.current.abort();
    }
    // Force kill Playwright + orphaned Chrome processes
    forceKillFreepik().then(() => {
      setTimeout(() => checkServerStatus().then(setFreepikReady), 2000);
    });
    setIsGenerating(false);
    setIsRendering(false);
    setGeneratingForPrompt(null);
    targetDesireRef.current = null;
    setGeneratingDesireId(null);
    setGenerationProgress('Stopped — killing Freepik browser...');
    setGenerationPhase('idle');
    setCurrentHtmlPreview('');
    setTimeout(() => setGenerationProgress(''), 2500);
  }, []);

  // ── Stable sound callback for DebouncedTextarea ──
  const handleTypingSound = useCallback(() => playSound('typing'), [playSound]);

  // ── Keyboard shortcut ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // ── Research status ──
  const researchComplete = currentCycle?.stages?.research?.status === 'complete';
  const copyComplete = currentCycle?.stages?.copywriting?.status === 'complete';
  const hasResearchData = !!(currentCycle?.researchFindings);
  const hasContext = researchComplete || campaign?.presetData;

  // ── Pipeline label for UI ──
  const getPipelineLabel = () => {
    if (!llmEnabled) return 'Direct to image model';
    const parts: string[] = [];
    if (researchEnabled) parts.push('Research');
    if (presetEnabled) parts.push('Preset');
    const src = parts.length > 0 ? parts.join(' + ') : 'Prompt';
    if (htmlEnabled) return `${src} → LLM → HTML → Image`;
    return `${src} → LLM → Image`;
  };

  // ── Format relative time ──
  const formatTimeAgo = (ts: number) => {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  // ── Model display name ──
  const modelDisplayName = (model: string) => {
    if (model === 'nano-banana-2') return 'Nano Banana 2';
    if (model === 'seedream-5-lite') return 'Seedream 5 Lite';
    return model;
  };

  // ── Pipeline display name ──
  const pipelineDisplayName = (p: string) => {
    if (p === 'direct') return 'Direct';
    if (p === 'research-llm') return 'Research + LLM';
    if (p === 'research-html-llm') return 'Research + HTML + LLM';
    return p;
  };

  // ── Aspect ratio → CSS class ──
  const getAspectClass = (ratio: string) => {
    switch (ratio) {
      case '1:1': return 'aspect-square';
      case '9:16': return 'aspect-[9/16]';
      case '4:5': return 'aspect-[4/5]';
      case '16:9': return 'aspect-video';
      case '2:3': return 'aspect-[2/3]';
      case '3:4': return 'aspect-[3/4]';
      default: return 'aspect-[4/5]';
    }
  };

  // ── Gallery filters ──
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'favorites'>('newest');
  const [gallerySelectMode, setGallerySelectMode] = useState(false);
  const [gallerySelectedIds, setGallerySelectedIds] = useState<Set<string>>(new Set());

  // Pipeline types present in current gallery
  const availablePipelines = [...new Set(storedImages.map(img => img.pipeline).filter(Boolean))];

  const filteredImages = storedImages
    .filter(img => !favoriteFilter || img.favorite)
    .filter(img => !pipelineFilter || img.pipeline === pipelineFilter)
    .filter(img => !desireFilter || img.desireId === desireFilter)
    .sort((a, b) => {
      if (sortBy === 'favorites') return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.timestamp - a.timestamp;
      if (sortBy === 'oldest') return a.timestamp - b.timestamp;
      return b.timestamp - a.timestamp;
    });

  const groupedImages: [string, StoredImage[]][] = (() => {
    const map = new Map<string, StoredImage[]>();
    for (const img of filteredImages) {
      if (!map.has(img.prompt)) map.set(img.prompt, []);
      map.get(img.prompt)!.push(img);
    }
    return Array.from(map.entries());
  })();

  // ── Render ──
  return (
    <div className={`h-full flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-zinc-900' : 'bg-[#f7f7f8]'}`}>

      {/* ── Gallery / Canvas Area ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* ── Animated Dotted Grid Background ── */}
        <div className={`absolute inset-0 nomad-grid-bg ${isGenerating ? 'wave' : ''}`} />

        {/* ── Main Content Area ── */}
        <div ref={galleryScrollRef} className="flex-1 h-full overflow-y-auto px-6 py-6 relative z-10 bg-transparent">

          {/* ── Persistent Error Banner ── */}
          {generationError && (
            <div className={`sticky top-0 z-30 -mx-6 px-6 pt-2 pb-1 mb-2`}>
              <div className={`rounded-xl border px-4 py-2.5 flex items-center gap-3 ${
                theme === 'dark' ? 'bg-red-900/30 border-red-500/40 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-xs font-medium flex-1">{generationError}</span>
                <button
                  onClick={() => setGenerationError(null)}
                  className={`p-1 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-red-800/50' : 'hover:bg-red-100'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ── Generation Status Bar ── */}
          {isGenerating && generatingForPrompt && (
            <div className={`sticky top-0 z-20 -mx-6 px-6 pt-2 pb-2 mb-2 bg-gradient-to-b ${theme === 'dark' ? 'from-zinc-900 via-zinc-900/95' : 'from-[#f7f7f8] via-[#f7f7f8]/95'} to-transparent`}>
              <div className={`rounded-xl border overflow-hidden ${theme === 'dark' ? 'bg-zinc-800/90 border-zinc-700/60' : 'bg-white/95 border-zinc-200/80 shadow-sm'}`}>
                {/* Single compact row: icon · status · tokens · elapsed · code toggle */}
                <div className="px-4 py-2.5 flex items-center gap-3">
                  {/* Pulsing dot */}
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    generationPhase === 'capturing' ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                  }`} />
                  {/* Ad counter */}
                  {batchCurrent > 0 && (
                    <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {batchCurrent}/{htmlEnabled ? variantCount : batchCount}
                    </span>
                  )}
                  {/* Phase label (bold gradient) + vibe word (light) */}
                  <span className="text-[11px] font-bold bg-gradient-to-r from-zinc-800 via-zinc-600 to-zinc-800 dark:from-zinc-200 dark:via-zinc-400 dark:to-zinc-200 bg-clip-text text-transparent">
                    {getPhaseLabel()}
                  </span>
                  {currentVibe && (
                    <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {currentVibe}
                    </span>
                  )}
                  {/* ── Stats: elapsed · tokens · t/s — always visible, one line ── */}
                  <span className={`text-[10px] font-mono tabular-nums flex-shrink-0 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {generationElapsed}s
                    {tokenInfo.liveTokens > 0 && ` · ${tokenInfo.liveTokens} tok`}
                    {tokenInfo.tokensPerSec > 0 && ` · ${tokenInfo.tokensPerSec} t/s`}
                    {generationPhase === 'streaming' && llmOutput && ` · ${(llmOutput.length / 1000).toFixed(1)}k`}
                  </span>
                  {/* Spacer */}
                  <div className="flex-1" />
                  {/* Code toggle */}
                  {htmlEnabled && llmEnabled && (
                    <button
                      onClick={() => setCodeDrawerOpen(v => !v)}
                      className={`text-[10px] font-medium px-2.5 py-1 rounded-md transition-colors flex-shrink-0 ${
                        codeDrawerOpen
                          ? theme === 'dark' ? 'bg-zinc-600 text-zinc-200' : 'bg-zinc-200 text-zinc-800'
                          : theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      {codeDrawerOpen ? 'Hide code' : 'Show code'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Code Drawer (collapsible, shows live HTML code + preview) ── */}
          {codeDrawerOpen && (isGenerating || llmOutput) && htmlEnabled && llmEnabled && (
            <div className={`mb-4 rounded-xl border overflow-hidden ${theme === 'dark' ? 'bg-zinc-800/60 border-zinc-700/50' : 'bg-white border-zinc-200/80 shadow-sm'}`}>
              <div className="flex" style={{ height: '300px', maxHeight: '40vh' }}>
                {/* Left: Code stream */}
                <div className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden font-mono text-[10px] leading-relaxed p-3 ${theme === 'dark' ? 'bg-zinc-900/80' : 'bg-zinc-50'}`}>
                  <pre
                    className="whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: highlightHtml(llmOutput || '', theme === 'dark') }}
                  />
                  <div ref={codeEndRef} />
                </div>
                {/* Right: Live preview */}
                <div className={`w-[280px] flex-shrink-0 border-l flex flex-col items-center justify-center p-3 ${theme === 'dark' ? 'border-zinc-700/50 bg-zinc-800/40' : 'border-zinc-200 bg-zinc-100/50'}`}>
                  {debouncedHtml ? (
                    <>
                      <div style={{
                        width: '240px',
                        height: `${240 * (htmlDim.h / htmlDim.w)}px`,
                        maxHeight: '100%',
                        overflow: 'hidden',
                        position: 'relative',
                        borderRadius: '8px',
                      }} className={`border ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'}`}>
                        <iframe
                          srcDoc={debouncedHtml}
                          style={{
                            width: `${htmlDim.w}px`,
                            height: `${htmlDim.h}px`,
                            transform: `scale(${240 / htmlDim.w})`,
                            transformOrigin: 'top left',
                            border: 'none',
                            pointerEvents: 'none',
                          }}
                          sandbox="allow-same-origin"
                          title="HTML Ad Preview"
                        />
                      </div>
                      <span className={`text-[9px] font-mono mt-1.5 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        {htmlDim.w}x{htmlDim.h}
                      </span>
                      {generationPhase === 'capturing' && (
                        <span className={`text-[9px] font-medium mt-1 px-2 py-0.5 rounded-full ${theme === 'dark' ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600'}`}>
                          Capturing...
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center">
                      <OrbitalLoader
                        size={100}
                        dark={theme === 'dark'}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Desire Board (Desires tab) ── */}
          {activeMode === 'funnel' && (
            <DesireBoard
              theme={theme}
              researchFindings={currentCycle?.researchFindings || null}
              persona={currentCycle?.researchFindings?.persona || null}
              storedImages={storedImages}
              campaign={campaign}
              onGenerateForDesire={handleGenerateForDesire}
              onImageClick={setSelectedImage}
              onSwitchToResearch={() => {
                // Navigate to research tab via AppShell (parent)
                const event = new CustomEvent('nomad-switch-view', { detail: 'research' });
                window.dispatchEvent(event);
              }}
              isGenerating={isGenerating}
              generatingDesireId={generatingDesireId}
            />
          )}

          {/* ── Product Angle Creator (See more tab) ── */}
          {activeMode === 'custom' && (
            <ProductAngleCreator
              theme={theme}
              onSaveToGallery={persistImage}
              onUseAsReference={(b64) => addReferenceImages([b64])}
              campaignId={campaign?.id}
              campaignBrand={campaign?.brand}
            />
          )}

          {/* ── HTML Ad Variants Gallery with Selection ── */}
          {activeMode === 'static' && htmlVariants.length > 0 && (
            <div className={`mb-6 rounded-2xl border p-4 ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-white border-zinc-200/80 shadow-sm'}`}>
              {/* Action bar */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Ad Variants
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${theme === 'dark' ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
                    {htmlVariants.length}
                  </span>
                  {selectedVariants.size > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                      {selectedVariants.size} selected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Select all / deselect */}
                  {selectedVariants.size < htmlVariants.length ? (
                    <button
                      onClick={() => setSelectedVariants(new Set(htmlVariants.map(v => v.id)))}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                    >
                      Select All
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedVariants(new Set())}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                    >
                      Deselect
                    </button>
                  )}
                  {/* Save selected as favorites */}
                  {selectedVariants.size > 0 && !isGenerating && !isRendering && (
                    <button
                      onClick={async () => {
                        for (const vid of selectedVariants) {
                          const img = storedImages.find(i => i.id === vid);
                          if (img) {
                            await storage.saveImage({ ...img, favorite: true });
                            setStoredImages(prev => prev.map(i => i.id === vid ? { ...i, favorite: true } : i));
                          }
                        }
                        setSelectedVariants(new Set());
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${theme === 'dark' ? 'text-blue-400 hover:bg-blue-500/20' : 'text-blue-600 hover:bg-blue-100'}`}
                    >
                      Save Selected
                    </button>
                  )}
                  {/* Render selected via Freepik */}
                  {selectedVariants.size > 0 && !isGenerating && !isRendering && (
                    <button
                      onClick={renderSelectedVariants}
                      className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-colors bg-indigo-600 text-white hover:bg-indigo-500`}
                    >
                      Render Selected ({selectedVariants.size})
                      {renderCount > 1 && <span className="opacity-70 ml-0.5">&times;{renderCount}</span>}
                    </button>
                  )}
                  {/* Render count selector */}
                  {selectedVariants.size > 0 && !isGenerating && !isRendering && (
                    <div className="flex items-center">
                      {[1, 2, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setRenderCount(n)}
                          className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                            renderCount === n
                              ? 'bg-indigo-500/20 text-indigo-400 font-bold'
                              : theme === 'dark' ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600'
                          }`}
                        >
                          &times;{n}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Generate more */}
                  {!isGenerating && !isRendering && (
                    <button
                      onClick={() => handleGenerate()}
                      className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-colors ${theme === 'dark' ? 'bg-zinc-600 text-zinc-200 hover:bg-zinc-500' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}
                    >
                      + {variantCount} more
                    </button>
                  )}
                  {/* Clear */}
                  {!isGenerating && !isRendering && (
                    <button
                      onClick={() => { setHtmlVariants([]); setSelectedVariants(new Set()); setExpandedVariant(null); }}
                      className={`text-[10px] px-2 py-0.5 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {/* Render progress bar */}
              {isRendering && (
                <div className={`mb-3 px-3 py-2 rounded-lg flex items-center gap-3 ${
                  theme === 'dark' ? 'bg-indigo-900/20 border border-indigo-800/40' : 'bg-indigo-50 border border-indigo-200'
                }`}>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[10px] font-medium truncate ${theme === 'dark' ? 'text-indigo-300' : 'text-indigo-700'}`}>
                      {renderProgress || `Rendering ${renderCurrent}/${renderTotal}...`}
                    </div>
                  </div>
                  <div className={`w-20 h-1.5 rounded-full overflow-hidden flex-shrink-0 ${theme === 'dark' ? 'bg-indigo-900/50' : 'bg-indigo-200'}`}>
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${renderTotal > 0 ? (renderCurrent / renderTotal) * 100 : 0}%` }}
                    />
                  </div>
                  <button
                    onClick={handleCancelRender}
                    className={`text-[9px] px-2 py-0.5 rounded font-medium flex-shrink-0 ${theme === 'dark' ? 'text-indigo-400 hover:bg-indigo-800/50' : 'text-indigo-600 hover:bg-indigo-100'}`}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Variant grid */}
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(2, Math.floor(gridCols / 2))}, minmax(0, 1fr))` }}>
                {htmlVariants.map((variant) => {
                  const isSelected = selectedVariants.has(variant.id);
                  const isExpanded = expandedVariant === variant.id;
                  return (
                    <div key={variant.id} className="flex flex-col">
                      <div
                        className={`group relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${
                          isSelected
                            ? theme === 'dark' ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-blue-500 ring-2 ring-blue-400/30'
                            : theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        {/* Selection circle (top-right) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVariants(prev => {
                              const next = new Set(prev);
                              if (next.has(variant.id)) next.delete(variant.id);
                              else next.add(variant.id);
                              return next;
                            });
                          }}
                          className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : theme === 'dark'
                                ? 'border-zinc-500 bg-zinc-800/80 text-transparent group-hover:border-zinc-400'
                                : 'border-zinc-300 bg-white/80 text-transparent group-hover:border-zinc-400'
                          }`}
                        >
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                        {/* Inspired-by badge (top-left) */}
                        {variant.inspiredBy && (
                          <span className={`absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded text-[8px] font-medium backdrop-blur-sm ${
                            theme === 'dark' ? 'bg-violet-900/60 text-violet-300' : 'bg-violet-100/90 text-violet-700'
                          }`}>
                            {variant.inspiredBy}
                          </span>
                        )}
                        {/* Image (click opens detail modal) */}
                        <div
                          onClick={() => setSelectedImage({
                            id: variant.id,
                            imageBase64: variant.screenshotBase64,
                            prompt: prompt || '(HTML ad)',
                            imagePrompt: `HTML Ad: ${variant.strategyLabel}`,
                            model: llmModel,
                            aspectRatio: variant.aspectRatio,
                            pipeline: 'html-ad',
                            timestamp: variant.timestamp,
                            label: variant.strategyLabel,
                            referenceImageCount: uploadedImages.filter(img => img.type === 'product').length,
                            htmlSource: variant.html,
                            strategyLabel: variant.strategyLabel,
                            inspiredByRef: variant.inspiredBy,
                          })}
                        >
                          <div className={getAspectClass(variant.aspectRatio)}>
                            <img
                              src={`data:image/png;base64,${variant.screenshotBase64}`}
                              alt={variant.strategyLabel}
                              className="absolute inset-0 w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          {/* Bottom bar: strategy label + render count */}
                          <div className={`absolute bottom-0 left-0 right-0 px-2 py-1.5 flex items-end justify-between ${theme === 'dark' ? 'bg-gradient-to-t from-black/80 to-transparent' : 'bg-gradient-to-t from-black/60 to-transparent'}`}>
                            <span className="text-[10px] font-medium text-white truncate">
                              {variant.strategyLabel}
                            </span>
                            {variant.renders.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedVariant(isExpanded ? null : variant.id);
                                }}
                                className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/80 text-white hover:bg-indigo-500 transition-colors flex-shrink-0 ml-1"
                              >
                                {variant.renders.length} render{variant.renders.length !== 1 ? 's' : ''} {isExpanded ? '\u25B2' : '\u25BC'}
                              </button>
                            )}
                          </div>
                          {/* Vision QA badge */}
                          {variant.visionFeedback && (
                            <div className="absolute top-2 right-2 z-10">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium backdrop-blur-sm ${
                                theme === 'dark' ? 'bg-violet-900/70 text-violet-300' : 'bg-violet-100/90 text-violet-700'
                              }`}>
                                QA
                              </span>
                            </div>
                          )}
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                        </div>
                      </div>
                      {/* Vision feedback (collapsed by default, shown on click) */}
                      {variant.visionFeedback && isExpanded && (
                        <div className={`mt-1 rounded-lg border p-2.5 text-[11px] whitespace-pre-wrap leading-relaxed ${
                          theme === 'dark' ? 'bg-violet-900/10 border-violet-800/30 text-zinc-300' : 'bg-violet-50 border-violet-200 text-zinc-700'
                        }`}>
                          <p className={`text-[9px] uppercase tracking-wider font-semibold mb-1 ${theme === 'dark' ? 'text-violet-400' : 'text-violet-600'}`}>Vision QA</p>
                          {variant.visionFeedback}
                        </div>
                      )}
                      {/* Expandable render strip */}
                      {isExpanded && variant.renders.length > 0 && (
                        <div className={`mt-1 rounded-lg border overflow-hidden ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'}`}>
                          <div className="flex gap-1.5 p-1.5 overflow-x-auto">
                            {variant.renders.map((r) => (
                              <button
                                key={r.id}
                                onClick={() => setSelectedImage({
                                  id: r.id,
                                  imageBase64: r.imageBase64,
                                  prompt: prompt || '(HTML→Render)',
                                  model: r.model,
                                  aspectRatio: variant.aspectRatio,
                                  pipeline: 'html-to-render',
                                  timestamp: r.timestamp,
                                  label: `Render: ${variant.strategyLabel}`,
                                  referenceImageCount: 0,
                                  htmlScreenshot: variant.screenshotBase64,
                                  htmlSource: variant.html,
                                  strategyLabel: variant.strategyLabel,
                                  sourceHtmlId: variant.id,
                                })}
                                className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border transition-all hover:scale-105 ${
                                  theme === 'dark' ? 'border-zinc-600 hover:border-zinc-400' : 'border-zinc-300 hover:border-zinc-500'
                                }`}
                              >
                                <img
                                  src={`data:image/png;base64,${r.imageBase64}`}
                                  alt="Render"
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Generate More card */}
                {!isGenerating && (
                  <button
                    onClick={handleGenerate}
                    className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${getAspectClass(aspectRatio)} ${
                      theme === 'dark'
                        ? 'border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300'
                        : 'border-zinc-300 hover:border-zinc-400 text-zinc-400 hover:text-zinc-600'
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="text-[10px] font-medium">Generate {variantCount} More</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Image Gallery ── */}
          {activeMode === 'static' && storedImages.length > 0 && (
            <div>
              {/* Header + filter */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Creatives
                    <span className={`font-normal ml-1.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{filteredImages.length}</span>
                  </h2>
                  {/* Grid column selector */}
                  <div className="flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={theme === 'dark' ? 'text-zinc-600' : 'text-zinc-300'}>
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                    <select
                      value={gridCols}
                      onChange={(e) => setGridCols(Number(e.target.value))}
                      className={`text-[10px] font-medium py-0.5 px-1 rounded border appearance-none cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-400'
                          : 'bg-white border-zinc-200 text-zinc-500'
                      }`}
                    >
                      {GRID_OPTIONS.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {/* All / Saved */}
                  <button
                    onClick={() => { setFavoriteFilter(false); setPipelineFilter(null); }}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${!favoriteFilter && !pipelineFilter ? (theme === 'dark' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-white') : (theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600')}`}
                  >All</button>
                  <button
                    onClick={() => { setFavoriteFilter(true); setPipelineFilter(null); }}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 ${favoriteFilter ? (theme === 'dark' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-white') : (theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600')}`}
                  >Saved</button>

                  {/* Pipeline filter pills */}
                  {availablePipelines.length > 1 && <>
                    <span className={`text-[9px] mx-0.5 ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-300'}`}>|</span>
                    {availablePipelines.map(p => {
                      const label = p === 'html-ad' ? 'HTML' : p === 'reference-copy' ? 'Ref Copy' : p === 'html-to-render' ? 'Render' : p === 'direct' ? 'Direct' : p.split('-')[0];
                      const active = pipelineFilter === p;
                      const color = p === 'html-ad' ? 'emerald' : p === 'reference-copy' ? 'purple' : p === 'html-to-render' ? 'indigo' : 'zinc';
                      return (
                        <button
                          key={p}
                          onClick={() => { setPipelineFilter(active ? null : p); setFavoriteFilter(false); }}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
                            active
                              ? `bg-${color}-500/20 text-${color}-${theme === 'dark' ? '300' : '600'} ring-1 ring-${color}-500/30`
                              : theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                          }`}
                        >{label}</button>
                      );
                    })}
                  </>}

                  {/* Sort */}
                  <span className={`text-[9px] mx-0.5 ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-300'}`}>|</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className={`text-[9px] font-medium py-0.5 px-1.5 rounded border appearance-none cursor-pointer ${
                      theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-white border-zinc-200 text-zinc-500'
                    }`}
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="favorites">Saved first</option>
                  </select>

                  {/* Select mode + Export */}
                  <button
                    onClick={() => { setGallerySelectMode(!gallerySelectMode); setGallerySelectedIds(new Set()); }}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
                      gallerySelectMode
                        ? (theme === 'dark' ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-600')
                        : (theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600')
                    }`}
                  >{gallerySelectMode ? `${gallerySelectedIds.size} selected` : 'Select'}</button>

                  {gallerySelectMode && (
                    <button
                      onClick={() => {
                        if (gallerySelectedIds.size === filteredImages.length) {
                          setGallerySelectedIds(new Set());
                        } else {
                          setGallerySelectedIds(new Set(filteredImages.map(img => img.id)));
                        }
                      }}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >{gallerySelectedIds.size === filteredImages.length ? 'Deselect all' : 'Select all'}</button>
                  )}
                  {gallerySelectMode && gallerySelectedIds.size > 0 && (
                    <>
                      <button
                        onClick={async () => {
                          const imgs = storedImages.filter(img => gallerySelectedIds.has(img.id));
                          for (const img of imgs) {
                            const link = document.createElement('a');
                            link.href = img.imageBase64.startsWith('data:') ? img.imageBase64 : `data:image/png;base64,${img.imageBase64}`;
                            link.download = `nomad-${img.label || img.id}-${img.pipeline || 'ad'}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            await new Promise(r => setTimeout(r, 250));
                          }
                          setGallerySelectMode(false);
                          setGallerySelectedIds(new Set());
                        }}
                        className={`px-2 py-0.5 rounded-full text-[9px] font-semibold transition-colors ${
                          theme === 'dark' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                      >Export ({gallerySelectedIds.size})</button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete ${gallerySelectedIds.size} selected images?`)) return;
                          const ids = Array.from(gallerySelectedIds);
                          for (const id of ids) await storage.deleteImage(id);
                          setStoredImages(prev => prev.filter(img => !gallerySelectedIds.has(img.id)));
                          if (selectedImage && gallerySelectedIds.has(selectedImage.id)) setSelectedImage(null);
                          setGallerySelectMode(false);
                          setGallerySelectedIds(new Set());
                        }}
                        className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
                          theme === 'dark' ? 'text-red-400 hover:bg-red-900/30' : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                      >Delete ({gallerySelectedIds.size})</button>
                    </>
                  )}

                  {/* Clear all */}
                  {filteredImages.length > 0 && !gallerySelectMode && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete all ${filteredImages.length} images?`)) return;
                        for (const img of filteredImages) { await storage.deleteImage(img.id); }
                        setStoredImages(prev => prev.filter(img => !filteredImages.some(f => f.id === img.id)));
                        setSelectedImage(null);
                      }}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${theme === 'dark' ? 'text-red-400 hover:bg-red-900/30' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}
                    >Clear all</button>
                  )}
                </div>
              </div>

              {/* ── Vision QA Timeline ── */}
              {showVisionComparison && visionHistory.length > 0 && (
                <div className={`mb-6 rounded-xl border overflow-hidden ${theme === 'dark' ? 'bg-zinc-900/80 border-violet-500/30' : 'bg-violet-50/30 border-violet-200'}`}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-4 py-2.5 border-b ${theme === 'dark' ? 'border-violet-500/20' : 'border-violet-200/60'}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-violet-500 animate-pulse' : 'bg-emerald-500'}`} />
                      <span className={`text-xs font-semibold ${theme === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>
                        Vision QA
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${theme === 'dark' ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-600'}`}>
                        {visionHistory.length - 1} revision{visionHistory.length - 1 !== 1 ? 's' : ''}
                      </span>
                      {!isGenerating && visionHistory.length > 1 && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${theme === 'dark' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                          done
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowVisionComparison(false)}
                      className={`p-1 rounded transition-colors ${theme === 'dark' ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Timeline — first + latest side by side, then scrollable history below */}
                  <div className="p-4">
                    {/* Before / After comparison */}
                    {visionHistory.length >= 2 && (
                      <div className="flex gap-4 mb-4">
                        {/* Original */}
                        <div className="flex-1">
                          <p className={`text-[9px] uppercase tracking-widest font-bold mb-1.5 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>Original</p>
                          <div className={`relative rounded-lg overflow-hidden border ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                            <img
                              src={visionHistory[0].screenshot.startsWith('data:') ? visionHistory[0].screenshot : `data:image/png;base64,${visionHistory[0].screenshot}`}
                              alt="Original"
                              className="w-full object-contain"
                              style={{ maxHeight: '280px' }}
                            />
                          </div>
                        </div>
                        {/* Arrow */}
                        <div className="flex items-center pt-5">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={theme === 'dark' ? 'text-violet-500' : 'text-violet-400'}>
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </div>
                        {/* Latest */}
                        <div className="flex-1">
                          <p className={`text-[9px] uppercase tracking-widest font-bold mb-1.5 ${theme === 'dark' ? 'text-violet-400' : 'text-violet-600'}`}>
                            Round {visionHistory[visionHistory.length - 1].round}
                          </p>
                          <div className={`relative rounded-lg overflow-hidden border-2 ${theme === 'dark' ? 'border-violet-500/50 ring-1 ring-violet-500/20' : 'border-violet-400 ring-1 ring-violet-400/20'}`}>
                            <img
                              src={visionHistory[visionHistory.length - 1].screenshot.startsWith('data:') ? visionHistory[visionHistory.length - 1].screenshot : `data:image/png;base64,${visionHistory[visionHistory.length - 1].screenshot}`}
                              alt="Latest"
                              className="w-full object-contain"
                              style={{ maxHeight: '280px' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Revision history — scrollable row of all intermediate steps */}
                    {visionHistory.length > 2 && (
                      <div>
                        <p className={`text-[9px] uppercase tracking-widest font-bold mb-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                          All revisions
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
                          {visionHistory.map((snap, idx) => (
                            <div key={idx} className="flex-shrink-0 flex flex-col gap-1" style={{ scrollSnapAlign: 'start', width: '120px' }}>
                              <div className={`relative rounded-lg overflow-hidden border ${
                                idx === visionHistory.length - 1
                                  ? (theme === 'dark' ? 'border-violet-500' : 'border-violet-400')
                                  : idx === 0
                                    ? (theme === 'dark' ? 'border-zinc-600' : 'border-zinc-300')
                                    : (theme === 'dark' ? 'border-zinc-700/50' : 'border-zinc-200')
                              }`}>
                                <img
                                  src={snap.screenshot.startsWith('data:') ? snap.screenshot : `data:image/png;base64,${snap.screenshot}`}
                                  alt={`Round ${snap.round}`}
                                  className="w-full object-contain"
                                  style={{ maxHeight: '120px' }}
                                />
                                <div className={`absolute top-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-bold ${
                                  idx === 0
                                    ? 'bg-zinc-900/60 text-zinc-400'
                                    : idx === visionHistory.length - 1
                                      ? 'bg-violet-600/80 text-white'
                                      : 'bg-zinc-800/60 text-zinc-400'
                                }`}>
                                  {idx === 0 ? 'v0' : `v${snap.round}`}
                                </div>
                              </div>
                              {idx > 0 && snap.feedback && (
                                <p className={`text-[8px] leading-tight line-clamp-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`} title={snap.feedback}>
                                  {snap.feedback.slice(0, 80)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Single image (only original, no revisions yet) */}
                    {visionHistory.length === 1 && (
                      <div className="flex items-center gap-3">
                        <div className={`w-24 rounded-lg overflow-hidden border ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                          <img
                            src={visionHistory[0].screenshot.startsWith('data:') ? visionHistory[0].screenshot : `data:image/png;base64,${visionHistory[0].screenshot}`}
                            alt="Reviewing..."
                            className="w-full object-contain"
                          />
                        </div>
                        <div className="flex-1">
                          <p className={`text-xs font-medium ${theme === 'dark' ? 'text-violet-300' : 'text-violet-600'}`}>
                            {isGenerating ? 'Reviewing ad...' : 'Review complete'}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                            MiniCPM is checking brand compliance, copy accuracy, and visual quality
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Prompt groups */}
              {groupedImages.map(([promptText, images]) => {
                const first = images[0];
                const isGeneratingForThisGroup = isGenerating && generatingForPrompt === promptText;
                return (
                  <div key={promptText} className="mb-6">
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-2 px-0.5">
                      <p className={`text-xs truncate font-medium max-w-[55%] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`} title={promptText}>
                        {promptText}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${theme === 'dark' ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>{first.aspectRatio}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${theme === 'dark' ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>{modelDisplayName(first.model)}</span>
                        <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{formatTimeAgo(first.timestamp)}</span>
                        <button
                          onClick={async () => {
                            for (const img of images) {
                              await storage.deleteImage(img.id);
                            }
                            setStoredImages(prev => prev.filter(p => !images.some(img => img.id === p.id)));
                            if (selectedImage && images.some(img => img.id === selectedImage.id)) setSelectedImage(null);
                          }}
                          className={`p-0.5 rounded transition-colors ${theme === 'dark' ? 'text-zinc-600 hover:text-red-400' : 'text-zinc-300 hover:text-red-400'}`}
                          title="Delete group"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Image grid — configurable columns */}
                    <div className="grid gap-2 items-start" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                      {/* Placeholder card (generating for this group) */}
                      {isGeneratingForThisGroup && (
                        <div className={`col-span-2 ${getAspectClass(aspectRatio)} relative rounded-xl overflow-hidden border-2 border-dashed flex flex-col items-center justify-center shadow-inner ${theme === 'dark' ? 'border-zinc-600 bg-gradient-to-br from-zinc-800 via-zinc-800 to-zinc-700' : 'border-zinc-300 bg-gradient-to-br from-zinc-50 via-white to-zinc-100'}`}>
                          <OrbitalLoader
                            size={80}
                            dark={theme === 'dark'}
                          />
                        </div>
                      )}

                      {images.map((img) => {
                        const isSelected = gallerySelectMode && gallerySelectedIds.has(img.id);
                        const durationSec = img.generationDurationMs ? (img.generationDurationMs / 1000).toFixed(1) : null;
                        const pipelineShort = img.pipeline === 'reference-copy' ? 'Clone' : img.pipeline?.includes('html') ? 'HTML' : img.pipeline === 'direct' ? 'Direct' : img.pipeline?.includes('llm') ? 'LLM' : null;
                        const hasVisionQA = img.visionRounds && img.visionRounds.length > 1;
                        const visionPassed = img.visionRounds?.some(r => r.status === 'passed');
                        return (
                        <div
                          key={img.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (deletingIds.has(img.id)) return;
                            if (gallerySelectMode) {
                              setGallerySelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(img.id)) next.delete(img.id); else next.add(img.id);
                                return next;
                              });
                            } else {
                              setSelectedImage(selectedImage?.id === img.id ? null : img);
                            }
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && !deletingIds.has(img.id) && (gallerySelectMode
                            ? setGallerySelectedIds(prev => { const next = new Set(prev); if (next.has(img.id)) next.delete(img.id); else next.add(img.id); return next; })
                            : setSelectedImage(selectedImage?.id === img.id ? null : img)
                          )}
                          className={`group relative rounded-xl overflow-hidden text-left transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? 'ring-2 ring-blue-500 shadow-[0_4px_16px_rgba(59,130,246,0.2)]'
                              : selectedImage?.id === img.id
                                ? 'ring-2 ' + (theme === 'dark' ? 'ring-white/30' : 'ring-zinc-900/20') + ' shadow-[0_4px_16px_rgba(0,0,0,0.15)] -translate-y-1'
                                : 'ring-1 ' + (theme === 'dark' ? 'ring-zinc-800 hover:ring-zinc-600' : 'ring-zinc-200 hover:ring-zinc-300') + ' shadow-sm hover:shadow-md hover:-translate-y-0.5'
                          }`}
                          style={deletingIds.has(img.id) ? { animation: 'nomad-card-delete 0.35s ease-out forwards', pointerEvents: 'none' } : undefined}
                        >
                          <div className={`${getAspectClass(img.aspectRatio)} overflow-hidden ${theme === 'dark' ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                            <img src={`data:image/png;base64,${img.imageBase64}`} alt={img.label} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" />
                          </div>
                          {/* Select mode checkbox */}
                          {gallerySelectMode && (
                            <div className="absolute top-1.5 left-1.5 z-20">
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-blue-500 border-blue-500' : 'bg-black/30 border-white/60 backdrop-blur-sm'
                              }`}>
                                {isSelected && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Hover: favorite (hidden in select mode) */}
                          {!gallerySelectMode && (
                            <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(img.id); }}
                                className="p-1 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill={img.favorite ? '#ef4444' : 'none'} stroke={img.favorite ? '#ef4444' : 'white'} strokeWidth="2">
                                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {/* Hover: delete (hidden in select mode) */}
                          {!gallerySelectMode && (
                            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <button
                                onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                                className="p-1 rounded-full bg-black/40 backdrop-blur-sm hover:bg-red-500/80 transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {/* Vision QA badge — top right, always visible */}
                          {hasVisionQA && (
                            <div className="absolute top-1.5 right-1.5 z-10 group-hover:opacity-0 transition-opacity">
                              <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm ${
                                visionPassed
                                  ? 'bg-green-500/80 text-white'
                                  : 'bg-violet-500/80 text-white'
                              }`}>
                                {visionPassed ? 'QA' : `${img.visionRounds!.length}R`}
                              </span>
                            </div>
                          )}
                          {/* Bottom info bar */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent px-2 pb-1.5 pt-6">
                            <div className="flex items-center gap-1">
                              {pipelineShort && (
                                <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                  img.pipeline === 'reference-copy' ? 'bg-purple-500/50 text-purple-100' :
                                  img.pipeline?.includes('html') ? 'bg-blue-500/50 text-blue-100' :
                                  'bg-white/20 text-white/80'
                                }`}>{pipelineShort}</span>
                              )}
                              {durationSec && (
                                <span className="text-[8px] text-white/50 font-mono ml-auto">{durationSec}s</span>
                              )}
                            </div>
                          </div>
                          {/* Favorite indicator (always visible when favorited, hidden in select mode) */}
                          {img.favorite && !gallerySelectMode && (
                            <div className="absolute top-1 left-1 group-hover:opacity-0 transition-opacity">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Generating State (big loader when no variants yet and code drawer closed) ── */}
          {activeMode === 'static' && isGenerating && htmlEnabled && llmEnabled && htmlVariants.length === 0 && !codeDrawerOpen && (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-5">
              <OrbitalLoader
                size={160}
                dark={theme === 'dark'}
              />
              {/* Phase label + vibe word */}
              <div className="flex flex-col items-center gap-1">
                <span className={`text-sm font-bold bg-gradient-to-r bg-clip-text text-transparent ${theme === 'dark' ? 'from-zinc-200 via-zinc-400 to-zinc-200' : 'from-zinc-700 via-zinc-500 to-zinc-700'}`}>
                  {getPhaseLabel()}
                </span>
                {currentVibe && (
                  <span className={`text-xs ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {currentVibe}
                  </span>
                )}
                <span className={`text-[10px] font-mono tabular-nums mt-1 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  {generationElapsed}s
                </span>
              </div>
            </div>
          )}

          {/* ── Empty State ── */}
          {activeMode === 'static' && !isGenerating && storedImages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center min-h-[400px]">
              <div className={`w-20 h-20 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] border border-dashed flex items-center justify-center ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                <NomadIcon size={32} className={theme === 'dark' ? 'text-zinc-600' : 'text-zinc-300'} />
              </div>
              <div>
                <p className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>Generate winning ad creatives</p>
                <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {hasContext ? 'Research data ready — generation will use your insights' : 'Describe your ad or run research first for smarter output'}
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Bottom Bar ── */}
      <div className={`flex-shrink-0 px-6 py-4 ${theme === 'dark' ? 'border-t border-zinc-800' : 'border-t border-zinc-200'}`}>
        {/* Mode Tabs */}
        <div className="flex justify-center gap-2 mb-4">
          {modes.map((mode) => (
            <button
              key={mode.key}
              onClick={() => { if (activeMode !== mode.key) playSound('navigate'); setActiveMode(mode.key); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                activeMode === mode.key
                  ? theme === 'dark'
                    ? 'bg-zinc-700 text-white shadow-[0_1px_3px_rgba(0,0,0,0.4),0_2px_6px_rgba(0,0,0,0.2)] -translate-y-px'
                    : 'bg-zinc-900 text-white shadow-[0_1px_3px_rgba(0,0,0,0.2),0_2px_6px_rgba(0,0,0,0.1)] -translate-y-px'
                  : theme === 'dark'
                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.3)] hover:-translate-y-px'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.08)] hover:-translate-y-px'
              }`}
            >
              <span className="text-xs">{mode.icon}</span>
              {mode.label}
            </button>
          ))}
        </div>

        {/* Prompt Input Area (hidden on Desires tab — generation happens through desire cards) */}
        {activeMode !== 'funnel' && <div className="max-w-[960px] mx-auto">
          {/* Reference Copy target indicator + style brief */}
          {referenceCopyEnabled && (
            <div className={`mb-2 rounded-xl border ${
              theme === 'dark' ? 'bg-purple-500/10 border-purple-500/30' : 'bg-purple-50 border-purple-200'
            }`}>
              <div className="flex items-center gap-3 px-3 py-2">
                {referenceCopyTarget ? (
                  <>
                    <img
                      src={referenceCopyTarget.base64}
                      alt="Reference"
                      className="w-12 h-12 rounded-lg object-cover border border-purple-400/30"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`}>
                        {referenceCopyTarget.filename}
                      </p>
                      <p className={`text-[10px] truncate ${theme === 'dark' ? 'text-purple-400/70' : 'text-purple-500'}`}>
                        {referenceCopyTarget.category} — {referenceCopyTarget.description.slice(0, 80)}...
                      </p>
                    </div>
                    <button
                      onClick={() => setShowAdLibrary(true)}
                      className={`text-[10px] px-2 py-1 rounded-md font-medium ${theme === 'dark' ? 'text-purple-300 hover:bg-purple-500/20' : 'text-purple-600 hover:bg-purple-100'}`}
                    >
                      Change
                    </button>
                    <button
                      onClick={() => { setReferenceCopyTarget(null); localStorage.removeItem('make_reference_copy_target'); setReferenceStyle(''); localStorage.removeItem('make_reference_style'); }}
                      className={`text-[10px] px-1.5 py-1 rounded-md ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowAdLibrary(true)}
                    className={`flex-1 text-xs font-medium py-2 text-center rounded-lg border border-dashed transition-colors ${
                      theme === 'dark' ? 'text-purple-400 border-purple-500/40 hover:bg-purple-500/10' : 'text-purple-600 border-purple-300 hover:bg-purple-50'
                    }`}
                  >
                    Select a reference ad from library to copy
                  </button>
                )}
              </div>

              {/* Style brief — describes the layout/composition/vibe to copy */}
              {referenceCopyTarget && (
                <div className={`px-3 pb-2.5 border-t ${theme === 'dark' ? 'border-purple-500/20' : 'border-purple-200/60'}`}>
                  <div className="flex items-center justify-between mt-2 mb-1">
                    <span className={`text-[9px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-purple-400/60' : 'text-purple-400'}`}>
                      Style brief
                    </span>
                    {referenceStyle && (
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${theme === 'dark' ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-600'}`}>
                        {referenceStyle.split(/\s+/).length} words
                      </span>
                    )}
                  </div>
                  <textarea
                    value={referenceStyle}
                    onChange={(e) => { setReferenceStyle(e.target.value); localStorage.setItem('make_reference_style', e.target.value); }}
                    placeholder="Describe the layout style to copy — e.g. &quot;minimalist white bg, product centered upper 60%, bold dark headline at top, ingredient pills across bottom third, brand logo bottom-right&quot;"
                    rows={2}
                    className={`w-full text-[11px] leading-relaxed rounded-lg px-2.5 py-2 resize-none focus:outline-none transition-colors placeholder:italic ${
                      theme === 'dark'
                        ? 'bg-zinc-900/50 text-purple-200 placeholder:text-purple-500/40 border border-purple-500/20 focus:border-purple-500/40'
                        : 'bg-white text-purple-900 placeholder:text-purple-300 border border-purple-200 focus:border-purple-400'
                    }`}
                  />
                </div>
              )}
            </div>
          )}

          <div className={`rounded-2xl border overflow-hidden transition-shadow duration-200 ${theme === 'dark' ? 'bg-zinc-800/60 border-zinc-700/60 shadow-[0_1px_3px_rgba(0,0,0,0.15),0_2px_8px_rgba(0,0,0,0.08)] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.12)]' : 'bg-zinc-50 border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.03)] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.04)]'}`} onDragOver={handleImageDragOver} onDrop={handleImageDrop}>
            <DebouncedTextarea
              textareaRef={promptRef}
              value={prompt}
              onChange={setPrompt}
              onSound={handleTypingSound}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={!llmEnabled
                ? 'Describe your ad — paste or drop images to use as reference'
                : 'Optional brief — LLM will generate ad angles from your data'}
              rows={3}
              className={`w-full px-5 py-4 bg-transparent resize-none text-sm focus:outline-none ${theme === 'dark' ? 'text-zinc-100 placeholder-zinc-500' : 'text-zinc-800 placeholder-zinc-400'}`}
            />

            {/* Template badge */}
            {templateHtml && (
              <div className={`flex items-center gap-2 px-4 pb-2 ${uploadedImages.length === 0 ? 'border-t pt-2' : ''} ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                <span className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full text-xs font-medium border ${theme === 'dark' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' : 'bg-indigo-50 text-indigo-600 border-indigo-200'}`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" />
                  </svg>
                  Template: {templateLabel || 'HTML'}
                  <button
                    onClick={() => { setTemplateHtml(null); setTemplateLabel(''); }}
                    className={`ml-0.5 p-0.5 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-indigo-500/20' : 'hover:bg-indigo-100'}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              </div>
            )}

            {/* Uploaded Images - Display as type-colored chips */}
            {uploadedImages.length > 0 && (
              <div className={`flex flex-wrap gap-2 px-4 pb-3 border-t pt-2 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                {uploadedImages.map((img, idx) => {
                  const chipColors: Record<string, string> = theme === 'dark' ? {
                    product: 'bg-blue-900/30 text-blue-300 border-blue-800/50',
                    layout: 'bg-purple-900/30 text-purple-300 border-purple-800/50',
                  } : {
                    product: 'bg-blue-50 text-blue-700 border-blue-200',
                    layout: 'bg-purple-50 text-purple-700 border-purple-200',
                  };
                  const colors = chipColors[img.type] || chipColors.product;
                  return (
                    <div key={idx} className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs font-medium border ${colors}`}>
                      <img
                        src={img.base64}
                        alt={img.label}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                      <span className="text-[9px] uppercase font-bold opacity-60">{img.type}</span>
                      <span className="max-w-[80px] truncate">@img{idx + 1}</span>
                      <button
                        onClick={() => removeUploadedImage(idx)}
                        className="ml-0.5 opacity-50 hover:opacity-100 cursor-pointer text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Row: Context chips + Controls */}
            <div className={`flex items-center justify-between px-5 py-2.5 border-t ${theme === 'dark' ? 'border-zinc-800 bg-zinc-800/30' : 'border-zinc-100 bg-zinc-50'}`}>
              <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
                {/* Pipeline label */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${theme === 'dark' ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-100 text-zinc-500'}`}>
                  {htmlEnabled && llmEnabled ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  ) : (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freepikReady ? 'bg-emerald-500' : freepikReady === false ? 'bg-red-400' : 'bg-zinc-300'}`} />
                  )}
                  {referenceCopyEnabled ? 'Reference Copy' : htmlEnabled && llmEnabled ? 'HTML Ads' : getPipelineLabel()}
                </span>
                {/* Freepik controls — always visible when Freepik pipeline is active */}
                {!(htmlEnabled && llmEnabled) && (
                  <>
                    <button
                      onClick={async () => {
                        setFreepikReady(null);
                        const ok = await restartFreepikBrowser();
                        if (ok) {
                          setTimeout(() => checkServerStatus().then(setFreepikReady), 1000);
                        } else {
                          setFreepikReady(false);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors whitespace-nowrap ${
                        theme === 'dark' ? 'bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200'
                      }`}
                      title="Restart Freepik browser (soft)"
                    >
                      Restart
                    </button>
                    <button
                      onClick={async () => {
                        setFreepikReady(null);
                        setGenerationProgress('Force killing Playwright...');
                        await forceKillFreepik();
                        setTimeout(() => {
                          checkServerStatus().then(setFreepikReady);
                          setGenerationProgress('');
                        }, 2000);
                      }}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors whitespace-nowrap ${
                        theme === 'dark' ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                      title="Force kill ALL Playwright + Chrome processes (nuclear option)"
                    >
                      Force Kill
                    </button>
                  </>
                )}

                {/* Preset indicator */}
                {presetEnabled && campaign?.presetData && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap ${theme === 'dark' ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                    {campaign.brand} preset
                  </span>
                )}

                {/* Research status chips */}
                {researchEnabled && researchComplete && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap ${theme === 'dark' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    Research
                  </span>
                )}
                {researchEnabled && copyComplete && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap ${theme === 'dark' ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-700'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                    Taste
                  </span>
                )}

                {/* Ad Library References toggle */}
                <button
                  onClick={() => setAdLibraryEnabled(v => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap ${
                    adLibraryEnabled
                      ? theme === 'dark' ? 'bg-violet-900/40 text-violet-300 border border-violet-500/30' : 'bg-violet-50 text-violet-600 border border-violet-200'
                      : theme === 'dark' ? 'text-zinc-600 hover:text-zinc-400 border border-transparent' : 'text-zinc-300 hover:text-zinc-500 border border-transparent'
                  }`}
                  title={adLibraryEnabled
                    ? 'Reference ads from your library are injected into the LLM prompt for layout + copy inspiration. Click to disable.'
                    : 'Ad library references OFF — LLM will generate without reference ads. Click to enable.'
                  }
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${adLibraryEnabled ? 'bg-violet-500' : theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300'}`} />
                  {adLibraryEnabled ? 'Refs ON' : 'Refs OFF'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Upload — Arrow up icon */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-2 rounded-lg transition-all relative ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
                  title="Upload brand asset (image or PDF)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {uploadedImages.length > 0 && (
                    <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${theme === 'dark' ? 'bg-blue-500' : 'bg-blue-400'}`} />
                  )}
                </button>

                {/* Ad Library — Image icon */}
                <button
                  onClick={() => setShowAdLibrary(true)}
                  className={`p-2 rounded-lg transition-all relative ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
                  title="Browse ad library"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>

                {/* Knowledge — Brain icon */}
                <button
                  onClick={() => setShowKnowledge(true)}
                  className={`p-2 rounded-lg transition-all relative ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
                  title="Knowledge"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
                    <path d="M9 21h6" />
                    <path d="M10 17v-2.5" />
                    <path d="M14 17v-2.5" />
                  </svg>
                  {knowledgeContent.trim() && (
                    <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${theme === 'dark' ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                  )}
                </button>

                {/* Brand DNA — Diamond icon */}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('nomad-open-brand-hub'))}
                  className={`p-2 rounded-lg transition-all relative ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
                  title="Brand DNA"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3h12l4 6-10 13L2 9z" />
                    <path d="M2 9h20" />
                    <path d="M10 3l-4 6" />
                    <path d="M14 3l4 6" />
                    <path d="M12 22l-4-13" />
                    <path d="M12 22l4-13" />
                  </svg>
                  {(campaign?.presetData || uploadedImages.length > 0) && (
                    <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${theme === 'dark' ? 'bg-amber-500' : 'bg-amber-400'}`} />
                  )}
                </button>

                {/* Settings — Sliders icon */}
                <button
                  ref={settingsButtonRef}
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-2 rounded-lg transition-all ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
                    <path d="M1 14h6M9 8h6M17 16h6" />
                  </svg>
                </button>

                {/* Settings Popover — Portal */}
                {showSettings &&
                  createPortal(
                    <div
                      ref={popoverRef}
                      className={`fixed w-[280px] rounded-xl z-[9999] flex flex-col max-h-[75vh] overflow-hidden ${theme === 'dark' ? 'bg-zinc-900 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_0_1px_rgba(0,0,0,0.6)]' : 'bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]'}`}
                      style={{
                        bottom: `${popoverPos.bottom}px`,
                        right: `${popoverPos.right}px`,
                      }}
                    >
                      <div className="overflow-y-auto px-4 py-3 space-y-3">

                        {/* ── OUTPUT ── */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className={`text-[9px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>Output</p>
                            <button
                              onClick={() => setShowSettings(false)}
                              className={`p-0.5 rounded transition-colors ${theme === 'dark' ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          </div>

                          {/* Aspect ratio */}
                          <div className="flex flex-wrap gap-0.5 mb-2">
                            {(['9:16', '4:5', '1:1', '16:9', '2:3', '3:4']).map(val => (
                              <button key={val} onClick={() => setAspectRatio(val as AspectRatio)}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                                  aspectRatio === val
                                    ? 'bg-zinc-900 text-white' + (theme === 'dark' ? ' !bg-zinc-200 !text-zinc-900' : '')
                                    : theme === 'dark' ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                                }`}
                              >{val}</button>
                            ))}
                          </div>

                          {/* Image model */}
                          <div className={`flex rounded-md overflow-hidden border ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                            {[['nano-banana-2', 'Nano Banana'], ['seedream-5-lite', 'Seedream']].map(([val, label]) => (
                              <button key={val} onClick={() => setImageModel(val)}
                                className={`flex-1 py-1 text-[10px] font-medium transition-all ${
                                  imageModel === val
                                    ? 'bg-zinc-900 text-white' + (theme === 'dark' ? ' !bg-zinc-200 !text-zinc-900' : '')
                                    : theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                                }`}
                              >{label}</button>
                            ))}
                          </div>

                          {/* Style */}
                          <div>
                            <p className={`text-[9px] uppercase tracking-widest font-bold mb-1.5 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>Style</p>
                            <div className="flex flex-wrap gap-1">
                              {[
                                ['', 'None'],
                                ['photo', 'Photo'],
                                ['digital-art', 'Digital Art'],
                                ['3d', '3D'],
                                ['painting', 'Painting'],
                                ['anime', 'Anime'],
                                ['cinematic', 'Cinematic'],
                                ['sketch', 'Sketch'],
                              ].map(([val, label]) => (
                                <button key={val} onClick={() => { setImageStyle(val); setCustomStyleImage(''); localStorage.setItem('make_image_style', val); localStorage.removeItem('make_custom_style_image'); }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                                    imageStyle === val && !customStyleImage
                                      ? 'bg-zinc-900 text-white' + (theme === 'dark' ? ' !bg-zinc-200 !text-zinc-900' : '')
                                      : theme === 'dark' ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                                  }`}
                                >{label}</button>
                              ))}
                            </div>

                            {/* Custom styles */}
                            {savedCustomStyles.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {savedCustomStyles.map((cs, csIdx) => (
                                  <button key={csIdx}
                                    onClick={() => {
                                      setImageStyle('');
                                      setCustomStyleImage(cs.base64);
                                      setCustomStyleName(cs.name);
                                      localStorage.setItem('make_image_style', '');
                                      localStorage.setItem('make_custom_style_image', cs.base64);
                                      localStorage.setItem('make_custom_style_name', cs.name);
                                    }}
                                    className={`group relative px-2 py-0.5 rounded text-[10px] font-medium transition-all border ${
                                      customStyleImage === cs.base64
                                        ? 'bg-purple-500/20 border-purple-400/40 text-purple-400'
                                        : theme === 'dark' ? 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600' : 'border-zinc-200 text-zinc-400 hover:text-zinc-600'
                                    }`}
                                  >
                                    {cs.name}
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const updated = savedCustomStyles.filter((_, i) => i !== csIdx);
                                        setSavedCustomStyles(updated);
                                        localStorage.setItem('make_saved_custom_styles', JSON.stringify(updated));
                                        if (customStyleImage === cs.base64) {
                                          setCustomStyleImage('');
                                          localStorage.removeItem('make_custom_style_image');
                                        }
                                      }}
                                      className="ml-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 cursor-pointer"
                                    >x</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Add custom style */}
                            <div className="mt-2">
                              <label className={`flex items-center gap-1.5 cursor-pointer text-[10px] ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>
                                <span>+ Custom style from image</span>
                                <input type="file" accept="image/*" className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      const b64 = reader.result as string;
                                      const name = window.prompt('Style name:', file.name.replace(/\.[^.]+$/, '')) || file.name.replace(/\.[^.]+$/, '');
                                      // Save to custom styles list
                                      const newStyle = { name, base64: b64 };
                                      const updated = [...savedCustomStyles, newStyle];
                                      setSavedCustomStyles(updated);
                                      localStorage.setItem('make_saved_custom_styles', JSON.stringify(updated));
                                      // Auto-select it
                                      setImageStyle('');
                                      setCustomStyleImage(b64);
                                      setCustomStyleName(name);
                                      localStorage.setItem('make_image_style', '');
                                      localStorage.setItem('make_custom_style_image', b64);
                                      localStorage.setItem('make_custom_style_name', name);
                                    };
                                    reader.readAsDataURL(file);
                                    e.target.value = ''; // Reset input
                                  }}
                                />
                              </label>
                              {customStyleImage && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <img src={customStyleImage} alt="Style ref" className="w-8 h-8 rounded object-cover border border-purple-400/30" />
                                  <span className={`text-[10px] ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>{customStyleName}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ── PIPELINE ── */}
                        <div className={`border-t pt-3 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                          <p className={`text-[9px] uppercase tracking-widest font-bold mb-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>Pipeline</p>

                          {/* LLM toggle */}
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className={`text-[11px] font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>LLM thinking</span>
                              <p className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>{llmEnabled ? 'Analyses brand + refs before generating' : 'Off — prompt goes straight to Freepik'}</p>
                            </div>
                            <button onClick={() => { const next = !llmEnabled; setLlmEnabled(next); if (!next) { setPresetEnabled(false); setHtmlEnabled(false); setResearchEnabled(false); } }}
                              className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-3 ${llmEnabled ? 'bg-blue-500' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                            >
                              <span className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${llmEnabled ? 'left-[14px]' : 'left-[2px]'}`} />
                            </button>
                          </div>

                          {llmEnabled && (
                            <>
                              {/* Data fed to LLM */}
                              <div className="flex gap-1 mb-2">
                                <button onClick={() => setPresetEnabled(!presetEnabled)}
                                  className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all border ${
                                    presetEnabled
                                      ? 'bg-blue-500/10 border-blue-400/30 text-blue-600' + (theme === 'dark' ? ' !text-blue-400' : '')
                                      : theme === 'dark' ? 'border-zinc-700 text-zinc-600' : 'border-zinc-200 text-zinc-400'
                                  }`}
                                >{presetEnabled ? '●' : '○'} Brand data</button>
                                <button onClick={() => setResearchEnabled(!researchEnabled)}
                                  className={`px-2 py-0.5 rounded text-[9px] font-medium transition-all border ${
                                    researchEnabled
                                      ? 'bg-blue-500/10 border-blue-400/30 text-blue-600' + (theme === 'dark' ? ' !text-blue-400' : '')
                                      : theme === 'dark' ? 'border-zinc-700 text-zinc-600' : 'border-zinc-200 text-zinc-400'
                                  }`}
                                >{researchEnabled ? '●' : '○'} Research</button>
                              </div>

                              {/* Mode */}
                              <p className={`text-[9px] mb-1 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>Mode</p>
                              <div className={`flex rounded-md overflow-hidden border mb-2 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                                <button onClick={() => { setHtmlEnabled(false); setReferenceCopyEnabled(false); }}
                                  className={`flex-1 py-1.5 text-[10px] font-medium transition-all ${
                                    !htmlEnabled && !referenceCopyEnabled ? 'bg-blue-500 text-white' : theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                                  }`}
                                >Image</button>
                                <button onClick={() => { setHtmlEnabled(true); setReferenceCopyEnabled(false); }}
                                  className={`flex-1 py-1.5 text-[10px] font-medium transition-all border-x ${
                                    htmlEnabled ? 'bg-blue-500 text-white border-blue-500' : (theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 border-zinc-800' : 'text-zinc-400 hover:text-zinc-600 border-zinc-200')
                                  }`}
                                >HTML ad</button>
                                <button onClick={() => { const next = !referenceCopyEnabled; setReferenceCopyEnabled(next); localStorage.setItem('make_reference_copy', String(next)); if (next) setHtmlEnabled(false); }}
                                  className={`flex-1 py-1.5 text-[10px] font-medium transition-all ${
                                    referenceCopyEnabled ? 'bg-purple-500 text-white' : theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
                                  }`}
                                >Clone ref</button>
                              </div>
                            </>
                          )}

                          {/* HTML sub-options */}
                          {htmlEnabled && llmEnabled && (
                            <div className={`space-y-1.5 mb-2 pl-2 border-l-2 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>Variants</span>
                                <input type="number" min="1" max="10" value={variantCount}
                                  onChange={(e) => { setVariantCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1))); localStorage.setItem('html_variant_count', e.target.value); }}
                                  className={`w-12 text-[10px] font-medium rounded px-1.5 py-0.5 text-center focus:outline-none ${theme === 'dark' ? 'text-zinc-200 bg-zinc-800 border border-zinc-700' : 'text-zinc-800 bg-white border border-zinc-200'}`}
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>Freepik renders</span>
                                <div className="flex gap-0.5">
                                  {[1, 2, 5].map(n => (
                                    <button key={n} onClick={() => setRenderCount(n)}
                                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${renderCount === n ? 'bg-blue-500 text-white' : theme === 'dark' ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-100 text-zinc-500'}`}
                                    >{n}</button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>Auto-render</span>
                                <button onClick={() => { localStorage.setItem('html_auto_render', (!autoRenderHtml).toString()); window.location.reload(); }}
                                  className={`relative w-7 h-[16px] rounded-full transition-colors ${autoRenderHtml ? 'bg-blue-500' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                                >
                                  <span className={`absolute top-[2px] w-3 h-3 bg-white rounded-full shadow transition-transform ${autoRenderHtml ? 'left-[12px]' : 'left-[2px]'}`} />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Clone ref batch */}
                          {referenceCopyEnabled && (
                            <div className={`flex items-center justify-between mb-2 pl-2 border-l-2 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                              <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>Ads to make</span>
                              <div className="flex gap-0.5">
                                {[1, 3, 5].map(n => (
                                  <button key={n} onClick={() => { setBatchRefCount(n); localStorage.setItem('make_batch_ref_count', String(n)); }}
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${batchRefCount === n ? 'bg-purple-500 text-white' : theme === 'dark' ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-100 text-zinc-500'}`}
                                  >{n}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── MODELS ── */}
                        {llmEnabled && (
                          <div className={`border-t pt-3 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                            <p className={`text-[9px] uppercase tracking-widest font-bold mb-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>Models</p>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>Ad strategy</span>
                                <select value={llmModel} onChange={(e) => { setLlmModel(e.target.value); localStorage.setItem('make_llm_model', e.target.value); }}
                                  className={`text-[10px] font-medium rounded px-1.5 py-0.5 focus:outline-none cursor-pointer ${theme === 'dark' ? 'text-zinc-300 bg-zinc-800 border border-zinc-700' : 'text-zinc-700 bg-white border border-zinc-200'}`}
                                >
                                  <option value="qwen3.5:35b">Qwen 3.5 35B</option>
                                  <option value="local:qwen3.5:35b">Qwen 35B Local</option>
                                  <option value="qwen3.5:9b">Qwen 3.5 9B</option>
                                  <option value="local:qwen3.5:9b">Qwen 9B Local</option>
                                  <option value="qwen3.5:0.8b">Qwen 0.8B</option>
                                  <option value="lfm2.5-thinking:latest">LFM 2.5</option>
                                </select>
                              </div>
                              {htmlEnabled && (
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>HTML coder</span>
                                  <select value={htmlLlmModel} onChange={(e) => { setHtmlLlmModel(e.target.value); localStorage.setItem('make_html_llm_model', e.target.value); }}
                                    className={`text-[10px] font-medium rounded px-1.5 py-0.5 focus:outline-none cursor-pointer ${theme === 'dark' ? 'text-zinc-300 bg-zinc-800 border border-zinc-700' : 'text-zinc-700 bg-white border border-zinc-200'}`}
                                  >
                                    <option value="qwen3.5:35b">Qwen 3.5 35B</option>
                                    <option value="local:qwen3.5:35b">Qwen 35B Local</option>
                                    <option value="qwen3.5:9b">Qwen 3.5 9B</option>
                                    <option value="local:qwen3.5:9b">Qwen 9B Local</option>
                                    <option value="qwen3.5:0.8b">Qwen 0.8B</option>
                                    <option value="lfm2.5-thinking:latest">LFM 2.5</option>
                                  </select>
                                </div>
                              )}
                              {(htmlEnabled || referenceCopyEnabled) && (
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>Vision QA</span>
                                  <div className="flex items-center gap-1.5">
                                    {visionFeedbackEnabled && (
                                      <input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={visionRounds}
                                        onChange={(e) => { const v = Math.max(1, Math.min(50, parseInt(e.target.value) || 1)); setVisionRounds(v); localStorage.setItem('make_vision_rounds', String(v)); }}
                                        className={`w-10 text-center text-[9px] font-medium rounded px-1 py-0.5 focus:outline-none ${theme === 'dark' ? 'text-violet-300 bg-zinc-800 border border-zinc-700' : 'text-violet-700 bg-white border border-zinc-200'}`}
                                      />
                                    )}
                                    <button onClick={() => { const next = !visionFeedbackEnabled; setVisionFeedbackEnabled(next); localStorage.setItem('make_vision_feedback', String(next)); }}
                                      className={`relative w-7 h-[16px] rounded-full transition-colors ${visionFeedbackEnabled ? 'bg-violet-500' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                                    >
                                      <span className={`absolute top-[2px] w-3 h-3 bg-white rounded-full shadow transition-transform ${visionFeedbackEnabled ? 'left-[12px]' : 'left-[2px]'}`} />
                                    </button>
                                  </div>
                                </div>
                              )}
                              {/* Research readiness gate */}
                              {researchEnabled && (
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>Research gate</span>
                                  <button onClick={() => { const next = !researchReadinessCheck; setResearchReadinessCheck(next); localStorage.setItem('make_research_readiness', String(next)); }}
                                    className={`relative w-7 h-[16px] rounded-full transition-colors ${researchReadinessCheck ? 'bg-amber-500' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                                  >
                                    <span className={`absolute top-[2px] w-3 h-3 bg-white rounded-full shadow transition-transform ${researchReadinessCheck ? 'left-[12px]' : 'left-[2px]'}`} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Research data */}
                        {researchEnabled && hasResearchData && (
                          <div className={`border-t pt-2 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                            <button onClick={() => setShowResearchSummary(!showResearchSummary)}
                              className={`text-[10px] font-medium transition-colors ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                            >{showResearchSummary ? '▾' : '▸'} Research</button>
                            {showResearchSummary && currentCycle?.researchFindings && (
                              <div className={`rounded p-2 mt-1 text-[9px] space-y-0.5 border ${theme === 'dark' ? 'bg-blue-900/20 border-blue-800/40 text-zinc-300' : 'bg-blue-50 border-blue-200 text-zinc-700'}`}>
                                {currentCycle.researchFindings.deepDesires?.length > 0 && <div>Desires: {currentCycle.researchFindings.deepDesires.length}</div>}
                                {currentCycle.researchFindings.objections?.length > 0 && <div>Objections: {currentCycle.researchFindings.objections.length}</div>}
                                {currentCycle.researchFindings.avatarLanguage?.length > 0 && <div>Language: {currentCycle.researchFindings.avatarLanguage.length}</div>}
                                {currentCycle.researchFindings.competitorWeaknesses?.length > 0 && <div>Gaps: {currentCycle.researchFindings.competitorWeaknesses.length}</div>}
                              </div>
                            )}
                          </div>
                        )}

                      </div>

                      {/* Footer */}
                      <div className={`px-4 py-2 border-t ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                        <p className={`text-[9px] font-mono ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-400'}`}>{getPipelineLabel()}</p>
                      </div>
                    </div>,
                    document.body
                  )}

                {/* Research readiness warning */}
                {researchReadinessWarning && (
                  <div className={`px-3 py-1.5 rounded-lg text-[10px] font-medium mb-1 ${theme === 'dark' ? 'bg-amber-900/30 text-amber-300 border border-amber-700/40' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {researchReadinessWarning}
                  </div>
                )}

                {/* Generate Button with variant/batch count */}
                <div className="flex items-center gap-0">
                  {/* Count stepper — minus */}
                  {(htmlEnabled ? variantCount > 1 : batchCount > 1) && (
                    <button
                      onClick={(e) => {
                        const step = e.shiftKey ? 10 : 1;
                        htmlEnabled ? setVariantCount(Math.max(1, variantCount - step)) : setBatchCount(Math.max(1, batchCount - step));
                      }}
                      disabled={isGenerating}
                      className={`w-7 h-10 flex items-center justify-center transition-colors disabled:opacity-50 ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700'}`}
                      title="Shift+click for -10"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
                    </button>
                  )}
                  {isGenerating ? (
                    <button
                      onClick={handleCancelGeneration}
                      className="h-10 px-4 rounded-full flex items-center justify-center gap-1.5 transition-all duration-200 bg-red-500 text-white hover:bg-red-600 shadow-[0_1px_3px_rgba(239,68,68,0.3),0_2px_6px_rgba(239,68,68,0.15)]"
                      title="Cancel generation"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      <span className="text-xs font-semibold">Stop</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleGenerate}
                      disabled={!llmEnabled && !prompt.trim()}
                      className={`h-10 rounded-full flex items-center justify-center gap-1.5 transition-all duration-200 px-4 ${
                        !llmEnabled && !prompt.trim()
                          ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                          : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-[0_1px_3px_rgba(0,0,0,0.2),0_2px_6px_rgba(0,0,0,0.1)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.25),0_4px_12px_rgba(0,0,0,0.12)] hover:-translate-y-px active:translate-y-0 active:shadow-[0_1px_2px_rgba(0,0,0,0.15)]'
                      }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L12 22M12 2L5 9M12 2L19 9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {htmlEnabled && llmEnabled ? (
                        <span className="text-xs font-semibold flex items-center gap-0.5">
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={variantCount}
                            onChange={e => setVariantCount(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                            onClick={e => e.stopPropagation()}
                            className="w-8 bg-transparent text-center text-xs font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:bg-white/20 rounded"
                          />
                          ad{variantCount > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold">
                          {batchCount > 1 ? `×${batchCount}` : 'Go'}
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      const step = e.shiftKey ? 10 : 1;
                      htmlEnabled ? setVariantCount(Math.min(200, variantCount + step)) : setBatchCount(Math.min(20, batchCount + step));
                    }}
                    disabled={isGenerating}
                    className={`w-7 h-10 flex items-center justify-center transition-colors disabled:opacity-50 ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700'}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Keyboard hint */}
          <p className={`text-center text-[11px] mt-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
            ⌘ + Enter to generate
          </p>
        </div>}
      </div>

      {/* ── Detail Modal (replaces sidebar) ── */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setSelectedImage(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className={`relative z-10 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex ${
              theme === 'dark'
                ? 'bg-zinc-900 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)]'
                : 'bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className={`flex-1 flex items-center justify-center p-6 min-w-0 ${theme === 'dark' ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
              <img
                src={`data:image/png;base64,${selectedImage.imageBase64}`}
                alt={selectedImage.label}
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm"
              />
            </div>

            {/* Info sidebar */}
            <div className={`w-72 border-l p-5 overflow-y-auto flex-shrink-0 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-sm font-bold ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>{selectedImage.label}</h3>
                <button
                  onClick={() => setSelectedImage(null)}
                  className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className={`rounded-lg p-2.5 ${theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-50'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Model</p>
                    <p className={`text-[11px] font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{modelDisplayName(selectedImage.model)}</p>
                  </div>
                  <div className={`rounded-lg p-2.5 ${theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-50'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Ratio</p>
                    <p className={`text-[11px] font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{selectedImage.aspectRatio}</p>
                  </div>
                  <div className={`rounded-lg p-2.5 ${theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-50'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Pipeline</p>
                    <p className={`text-[11px] font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{pipelineDisplayName(selectedImage.pipeline)}</p>
                  </div>
                  <div className={`rounded-lg p-2.5 ${theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-50'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Refs</p>
                    {selectedImage.referenceImages && selectedImage.referenceImages.length > 0 ? (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {selectedImage.referenceImages.map((refImg, i) => (
                          <img
                            key={i}
                            src={refImg.startsWith('data:') ? refImg : `data:image/png;base64,${refImg}`}
                            alt={`@img${i + 1}`}
                            className={`w-10 h-10 rounded-md object-cover border ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}
                            title={`@img${i + 1}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className={`text-[11px] font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{selectedImage.referenceImageCount || 'None'}</p>
                    )}
                  </div>
                </div>

                {selectedImage.htmlScreenshot && (
                  <div className={`rounded-lg p-2.5 border ${theme === 'dark' ? 'bg-purple-900/20 border-purple-800/40' : 'bg-purple-50 border-purple-100'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-1.5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-400'}`}>Layout Wireframe</p>
                    <img
                      src={`data:image/png;base64,${selectedImage.htmlScreenshot}`}
                      alt="HTML Layout"
                      className={`w-full rounded-md border shadow-sm ${theme === 'dark' ? 'border-purple-800/40' : 'border-purple-200'}`}
                    />
                  </div>
                )}

                {selectedImage.campaignBrand && (
                  <div className={`rounded-lg p-2.5 ${theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-50'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Campaign</p>
                    <p className={`text-[11px] font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{selectedImage.campaignBrand}</p>
                  </div>
                )}

                <div className={`rounded-lg p-2.5 ${theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-50'}`}>
                  <p className={`text-[9px] uppercase tracking-wider font-semibold mb-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Prompt</p>
                  <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{selectedImage.prompt}</p>
                </div>

                {selectedImage.imagePrompt && selectedImage.imagePrompt !== selectedImage.prompt && (
                  <div className={`rounded-lg p-2.5 border ${theme === 'dark' ? 'bg-blue-900/20 border-blue-800/40' : 'bg-blue-50 border-blue-100'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-1 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-400'}`}>Final Prompt</p>
                    <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>{selectedImage.imagePrompt}</p>
                  </div>
                )}

                {/* Vision QA Iterations — round-by-round browser */}
                {selectedImage.visionRounds && selectedImage.visionRounds.length > 0 ? (
                  <div className={`rounded-lg border overflow-hidden ${theme === 'dark' ? 'bg-violet-900/10 border-violet-800/40' : 'bg-violet-50/50 border-violet-200'}`}>
                    {/* Header */}
                    <div className={`px-2.5 py-2 flex items-center justify-between ${theme === 'dark' ? 'bg-violet-900/20' : 'bg-violet-100/50'}`}>
                      <p className={`text-[9px] uppercase tracking-wider font-semibold ${theme === 'dark' ? 'text-violet-400' : 'text-violet-600'}`}>
                        Vision QA — {selectedImage.visionRounds.length} round{selectedImage.visionRounds.length > 1 ? 's' : ''}
                      </p>
                      {selectedImage.visionRounds.length > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setVisionRoundIdx(Math.max(0, visionRoundIdx - 1))}
                            disabled={visionRoundIdx === 0}
                            className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors disabled:opacity-30 ${theme === 'dark' ? 'text-violet-300 hover:bg-violet-800/40' : 'text-violet-600 hover:bg-violet-200'}`}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                          </button>
                          <span className={`text-[9px] font-mono font-semibold min-w-[2rem] text-center ${theme === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>
                            {visionRoundIdx + 1}/{selectedImage.visionRounds.length}
                          </span>
                          <button
                            onClick={() => setVisionRoundIdx(Math.min(selectedImage.visionRounds!.length - 1, visionRoundIdx + 1))}
                            disabled={visionRoundIdx >= (selectedImage.visionRounds?.length || 1) - 1}
                            className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors disabled:opacity-30 ${theme === 'dark' ? 'text-violet-300 hover:bg-violet-800/40' : 'text-violet-600 hover:bg-violet-200'}`}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Round thumbnail strip */}
                    {selectedImage.visionRounds.length > 1 && (
                      <div className={`px-2.5 py-1.5 flex gap-1 overflow-x-auto border-b ${theme === 'dark' ? 'border-violet-800/30' : 'border-violet-200/60'}`}>
                        {selectedImage.visionRounds.map((round, ri) => (
                          <button
                            key={ri}
                            onClick={() => setVisionRoundIdx(ri)}
                            className={`shrink-0 relative rounded-md overflow-hidden transition-all ${
                              ri === visionRoundIdx
                                ? 'ring-2 ring-violet-500 shadow-md'
                                : theme === 'dark' ? 'ring-1 ring-zinc-700 opacity-60 hover:opacity-90' : 'ring-1 ring-zinc-200 opacity-60 hover:opacity-90'
                            }`}
                            title={`Round ${round.round}: ${round.status}`}
                          >
                            <img
                              src={`data:image/png;base64,${round.imageBase64}`}
                              alt={`Round ${round.round}`}
                              className="w-9 h-9 object-cover"
                            />
                            {/* Status dot */}
                            <span className={`absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-white/50 ${
                              round.status === 'passed' ? 'bg-green-400' :
                              round.status === 'revised' ? 'bg-amber-400' :
                              round.status === 'candidate' ? 'bg-blue-400' :
                              'bg-zinc-400'
                            }`} />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Active round detail */}
                    {(() => {
                      const round = selectedImage.visionRounds![Math.min(visionRoundIdx, selectedImage.visionRounds!.length - 1)];
                      if (!round) return null;
                      return (
                        <div className="px-2.5 py-2 space-y-1.5">
                          {/* Status badge + round label */}
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              round.status === 'passed' ? 'bg-green-500/20 text-green-400' :
                              round.status === 'revised' ? 'bg-amber-500/20 text-amber-400' :
                              round.status === 'candidate' ? 'bg-blue-500/20 text-blue-400' :
                              theme === 'dark' ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-200 text-zinc-500'
                            }`}>
                              {round.status === 'original' ? 'Original' :
                               round.status === 'candidate' ? `Candidate` :
                               round.status === 'passed' ? 'Passed' :
                               `Revision ${round.round}`}
                            </span>
                            <span className={`text-[9px] font-mono ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                              Round {round.round}
                            </span>
                          </div>

                          {/* Feedback */}
                          {round.feedback && round.feedback !== 'Original' && (
                            <div>
                              <p className={`text-[9px] font-semibold mb-0.5 ${theme === 'dark' ? 'text-violet-400' : 'text-violet-500'}`}>Feedback</p>
                              <p className={`text-[10px] leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{round.feedback}</p>
                            </div>
                          )}

                          {/* Prompt used */}
                          {round.prompt && (
                            <details className="group">
                              <summary className={`text-[9px] font-semibold cursor-pointer select-none ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>
                                Prompt used
                              </summary>
                              <p className={`text-[10px] leading-relaxed mt-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>{round.prompt}</p>
                            </details>
                          )}

                          {/* Click to preview this round's image */}
                          {round.imageBase64 !== selectedImage.imageBase64 && (
                            <button
                              onClick={() => setSelectedImage(prev => prev ? { ...prev, imageBase64: round.imageBase64 } : prev)}
                              className={`text-[9px] font-medium transition-colors ${theme === 'dark' ? 'text-violet-400 hover:text-violet-300' : 'text-violet-600 hover:text-violet-700'}`}
                            >
                              View this version
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : selectedImage.visionFeedback ? (
                  /* Fallback: simple text feedback if no rounds array */
                  <div className={`rounded-lg p-2.5 border ${theme === 'dark' ? 'bg-violet-900/20 border-violet-800/40' : 'bg-violet-50 border-violet-100'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-1 ${theme === 'dark' ? 'text-violet-400' : 'text-violet-600'}`}>Vision QA</p>
                    <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>{selectedImage.visionFeedback}</p>
                  </div>
                ) : null}

                <div className={`rounded-lg p-2.5 ${theme === 'dark' ? 'bg-zinc-800/80' : 'bg-zinc-50'}`}>
                  <p className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Created</p>
                  <p className={`text-[11px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {new Date(selectedImage.timestamp).toLocaleString()}
                    {selectedImage.generationDurationMs && (
                      <span className={`ml-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>({Math.round(selectedImage.generationDurationMs / 1000)}s)</span>
                    )}
                  </p>
                </div>

                {/* Strategy label */}
                {selectedImage.strategyLabel && (
                  <div className={`rounded-lg px-2.5 py-2 border ${theme === 'dark' ? 'bg-indigo-900/20 border-indigo-800/40' : 'bg-indigo-50 border-indigo-100'}`}>
                    <p className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-400'}`}>Strategy</p>
                    <p className={`text-[11px] font-medium ${theme === 'dark' ? 'text-indigo-300' : 'text-indigo-700'}`}>{selectedImage.strategyLabel}</p>
                  </div>
                )}

                {/* HTML source (collapsible) */}
                {selectedImage.htmlSource && (
                  <details className={`rounded-lg p-2.5 border ${theme === 'dark' ? 'bg-zinc-800/80 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                    <summary className={`text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>
                      View HTML Source
                    </summary>
                    <pre className="text-[9px] font-mono mt-2 max-h-48 overflow-auto bg-zinc-900 text-zinc-300 rounded-md p-2 whitespace-pre-wrap break-words">
                      {selectedImage.htmlSource}
                    </pre>
                  </details>
                )}

                {/* Use as Template */}
                {selectedImage.htmlSource && (
                  <button
                    onClick={() => {
                      setTemplateHtml(selectedImage.htmlSource || null);
                      setTemplateLabel(selectedImage.strategyLabel || 'HTML Template');
                      setSelectedImage(null);
                    }}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                      theme === 'dark'
                        ? 'text-indigo-300 bg-indigo-900/30 hover:bg-indigo-900/50 border-indigo-800/40'
                        : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                    </svg>
                    Use as Template
                  </button>
                )}

                {/* ── Refine Chat ── */}
                <div className={`pt-3 border-t ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className={`text-[9px] uppercase tracking-wider font-semibold ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Refine</p>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${
                      selectedImage.htmlSource
                        ? theme === 'dark' ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-500'
                        : theme === 'dark' ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-50 text-amber-500'
                    }`}>
                      {selectedImage.htmlSource ? 'LLM' : 'Freepik'}
                    </span>
                  </div>

                  {/* Refine history */}
                  {refineHistory.length > 0 && (
                    <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
                      {refineHistory.map((msg, i) => (
                        <div key={i} className={`rounded-lg p-2 text-[11px] ${
                          msg.role === 'user'
                            ? theme === 'dark' ? 'bg-blue-900/30 text-blue-300 border border-blue-800/50' : 'bg-blue-50 text-blue-700 border border-blue-100'
                            : msg.imageBase64
                              ? theme === 'dark' ? 'bg-emerald-900/30 border border-emerald-800/50' : 'bg-emerald-50 border border-emerald-100'
                              : theme === 'dark' ? 'bg-red-900/30 text-red-400 border border-red-800/50' : 'bg-red-50 text-red-600 border border-red-100'
                        }`}>
                          {msg.role === 'user' ? (
                            <span>{msg.text}</span>
                          ) : msg.imageBase64 ? (
                            <div>
                              <img
                                src={`data:image/png;base64,${msg.imageBase64}`}
                                alt="Refined"
                                className="w-full rounded-md mt-1 cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => {
                                  const update: Partial<StoredImage> = { imageBase64: msg.imageBase64! };
                                  if (msg.htmlSource) update.htmlSource = msg.htmlSource;
                                  setSelectedImage(prev => prev ? { ...prev, ...update } : prev);
                                }}
                              />
                              <p className={`text-[9px] mt-1 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>Click to use this version</p>
                            </div>
                          ) : (
                            <span>{msg.text}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Refine input */}
                  <div className="flex gap-1.5">
                    <textarea
                      ref={refineInputRef}
                      value={refinePrompt}
                      onChange={(e) => { setRefinePrompt(e.target.value); playSound('typing'); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleRefine();
                        }
                      }}
                      placeholder={selectedImage.htmlSource
                        ? 'e.g. make the headline bigger, change CTA to red...'
                        : 'e.g. make the background darker, add a badge...'
                      }
                      rows={2}
                      disabled={isRefining}
                      className={`flex-1 text-[11px] px-2.5 py-2 rounded-lg border resize-none focus:outline-none disabled:opacity-50 ${
                        theme === 'dark'
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500 focus:border-blue-500'
                          : 'bg-white border-zinc-200 text-zinc-800 placeholder-zinc-400 focus:border-blue-300'
                      }`}
                    />
                    <button
                      onClick={handleRefine}
                      disabled={!refinePrompt.trim() || isRefining}
                      className={`self-end px-3 py-2 rounded-lg text-[10px] font-semibold transition-colors ${
                        isRefining
                          ? theme === 'dark' ? 'bg-amber-900/40 text-amber-400 cursor-wait' : 'bg-amber-100 text-amber-600 cursor-wait'
                          : refinePrompt.trim()
                            ? theme === 'dark' ? 'bg-zinc-100 text-zinc-900 hover:bg-white' : 'bg-zinc-900 text-white hover:bg-zinc-800'
                            : theme === 'dark' ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                      }`}
                    >
                      {isRefining ? 'Refining...' : 'Refine'}
                    </button>
                  </div>
                  {refineProgress && (
                    <p className={`text-[9px] mt-1 animate-pulse ${theme === 'dark' ? 'text-amber-400' : 'text-amber-500'}`}>{refineProgress}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = `data:image/png;base64,${selectedImage.imageBase64}`;
                      a.download = `${selectedImage.label.replace(/\s+/g, '-').toLowerCase()}.png`;
                      a.click();
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                      theme === 'dark' ? 'text-zinc-300 bg-zinc-800 hover:bg-zinc-700' : 'text-zinc-700 bg-zinc-100 hover:bg-zinc-200'
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Download
                  </button>
                  <button
                    onClick={() => toggleFavorite(selectedImage.id)}
                    className={`flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                      selectedImage.favorite
                        ? theme === 'dark' ? 'text-red-400 bg-red-900/30 hover:bg-red-900/50' : 'text-red-500 bg-red-50 hover:bg-red-100'
                        : theme === 'dark' ? 'text-zinc-500 bg-zinc-800 hover:bg-zinc-700' : 'text-zinc-500 bg-zinc-100 hover:bg-zinc-200'
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={selectedImage.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { removeImage(selectedImage.id); setSelectedImage(null); }}
                    className={`flex items-center justify-center px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                      theme === 'dark' ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30' : 'text-red-500 hover:text-red-700 hover:bg-red-50'
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Knowledge Popup (full-screen overlay with blur) ── */}
      {/* ── Preset / Brand Popup ── */}
      {showPreset && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8" onClick={() => setShowPreset(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
          <div
            className={`relative z-10 w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden ${
              theme === 'dark'
                ? 'bg-zinc-900 border border-zinc-700/60 shadow-[0_24px_80px_rgba(0,0,0,0.5)]'
                : 'bg-white border border-zinc-200/80 shadow-[0_24px_80px_rgba(0,0,0,0.15)]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <div>
                <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
                  {campaign?.brand || 'Brand'} Preset
                </h2>
                <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Brand data + assets — shared across Research & Make
                </p>
              </div>
              <button
                onClick={() => setShowPreset(false)}
                className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto">

              {/* Brand Assets Section (with labels, descriptions, types) */}
              <div
                className={`p-5 border-b ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files).filter(
                    f => f.type.startsWith('image/') || f.type === 'application/pdf'
                  );
                  if (files.length > 0) processUploadedFiles(files);
                }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className={`font-mono text-[10px] uppercase tracking-[0.15em] font-bold ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Brand Assets
                    {uploadedImages.length > 0 && <span className="ml-1.5 text-zinc-500">({uploadedImages.length})</span>}
                    {pdfProcessing && <span className="ml-1.5 text-amber-400 animate-pulse">Processing PDF...</span>}
                  </p>
                  <input
                    ref={presetFileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) processUploadedFiles(files);
                      if (presetFileInputRef.current) presetFileInputRef.current.value = '';
                    }}
                    className="hidden"
                  />
                </div>

                {/* Image cards */}
                {uploadedImages.length > 0 && (
                  <div className="space-y-3 mb-3">
                    {uploadedImages.map((img, idx) => (
                      <div key={idx} className={`flex gap-3 p-3 rounded-xl border ${
                        theme === 'dark' ? 'border-zinc-800 bg-zinc-800/30' : 'border-zinc-200 bg-zinc-50'
                      }`}>
                        {/* Thumbnail */}
                        <div className="relative shrink-0">
                          <img
                            src={img.base64}
                            alt={img.label}
                            className={`w-20 h-20 object-cover rounded-lg border ${
                              theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'
                            }`}
                          />
                          <div className={`absolute bottom-1 left-1 px-1 py-0.5 rounded text-[8px] font-mono font-bold ${
                            theme === 'dark' ? 'bg-black/70 text-zinc-300' : 'bg-black/60 text-white'
                          }`}>
                            @img{idx + 1}
                          </div>
                        </div>
                        {/* Metadata */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={img.label}
                              onChange={(e) => updateReferenceImage(idx, { label: e.target.value })}
                              placeholder="Label (e.g. Product front)"
                              className={`flex-1 text-xs px-2 py-1 rounded-md border font-medium ${
                                theme === 'dark'
                                  ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder-zinc-600'
                                  : 'bg-white border-zinc-200 text-zinc-800 placeholder-zinc-400'
                              }`}
                            />
                            <select
                              value={img.type}
                              onChange={(e) => {
                                const newType = e.target.value as ReferenceImage['type'];
                                if (newType === img.type) return;
                                // Max 1 layout — demote any existing layout to product
                                const current = campaign?.referenceImages as ReferenceImage[] | undefined;
                                if (!current) return;
                                const updated = current.map((im, i) => {
                                  if (i === idx) return { ...im, type: newType };
                                  if (newType === 'layout' && im.type === 'layout') return { ...im, type: 'product' as const };
                                  return im;
                                });
                                updateCampaign({ referenceImages: updated });
                              }}
                              className={`text-[10px] px-1.5 py-1 rounded-md border ${
                                theme === 'dark'
                                  ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                                  : 'bg-white border-zinc-200 text-zinc-600'
                              }`}
                            >
                              <option value="product">Product</option>
                              <option value="layout">Layout</option>
                            </select>
                            {analyzingImageIdx === idx ? (
                              <button
                                onClick={cancelAnalyze}
                                className="px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer"
                                title="Stop analysis"
                              >
                                Stop
                              </button>
                            ) : (
                              <button
                                onClick={() => analyzeReferenceImage(idx)}
                                disabled={analyzingImageIdx !== null}
                                className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${
                                  analyzingImageIdx !== null
                                    ? 'opacity-40 cursor-not-allowed'
                                    : theme === 'dark'
                                      ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                                      : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                                }`}
                                title="Analyze with vision model"
                              >
                                Analyze
                              </button>
                            )}
                            <button
                              onClick={() => removeUploadedImage(idx)}
                              className="p-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                              title="Remove image"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <textarea
                            value={img.description}
                            onChange={(e) => updateReferenceImage(idx, { description: e.target.value })}
                            placeholder="Describe what this image shows (e.g. White spray bottle, brown Simpletics branding, front angle)"
                            rows={2}
                            className={`w-full text-[11px] px-2 py-1.5 rounded-md border resize-none leading-relaxed ${
                              theme === 'dark'
                                ? 'bg-zinc-900 border-zinc-700 text-zinc-300 placeholder-zinc-600'
                                : 'bg-white border-zinc-200 text-zinc-700 placeholder-zinc-400'
                            }`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone / Add more — always visible */}
                <div
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                    theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500 text-zinc-500' : 'border-zinc-200 hover:border-zinc-400 text-zinc-400'
                  }`}
                  onClick={() => presetFileInputRef.current?.click()}
                >
                  <p className="text-xs">{uploadedImages.length > 0 ? 'Drop or click to add more' : 'Drop or click to add product photos or a layout reference'}</p>
                  {uploadedImages.length === 0 && (
                    <p className="text-[10px] mt-1">Product = your actual product photos. Layout = a single reference for ad composition/structure.</p>
                  )}
                </div>
              </div>

              {/* Collapsible Preset Sections */}
              {campaign?.presetData && (() => {
                const preset = campaign.presetData!;
                const borderCls = theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200';
                const bgCls = theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-50';
                const hoverCls = theme === 'dark' ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100/50';
                const labelCls = theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400';
                const valCls = theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700';
                const headerCls = theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600';

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
                      onClick={() => setPresetSections(prev => ({ ...prev, [id]: !prev[id] }))}
                      className={`w-full flex items-center justify-between gap-2 px-5 py-3 ${hoverCls} transition-colors border-b ${borderCls}`}
                    >
                      <span className={`font-mono text-[10px] uppercase tracking-[0.15em] font-bold ${headerCls}`}>
                        {title}{subtitle && <span className={`ml-1.5 font-normal normal-case tracking-normal ${labelCls}`}>{subtitle}</span>}
                      </span>
                      <span className={`text-[10px] ${labelCls} shrink-0 transition-transform ${presetSections[id] ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    </button>
                    {presetSections[id] && (
                      <div className={`px-5 py-3 space-y-2 border-b ${borderCls}`}>
                        {children}
                      </div>
                    )}
                  </>
                );

                return (
                  <div>
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
              })()}

              {/* Fallback: no preset */}
              {!campaign?.presetData && campaign && (
                <div className="p-5">
                  <div className={`rounded-xl border p-4 space-y-2 text-xs font-mono ${
                    theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                  }`}>
                    <p><span className="font-bold">Brand:</span> {campaign.brand}</p>
                    <p><span className="font-bold">Audience:</span> {campaign.targetAudience}</p>
                    <p><span className="font-bold">Product:</span> {campaign.productDescription}</p>
                    {campaign.brandColors && <p><span className="font-bold">Colors:</span> {campaign.brandColors}</p>}
                  </div>
                </div>
              )}

              {!campaign && (
                <div className={`text-center py-12 text-sm ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  No campaign selected — create or load a campaign first
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showKnowledge && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8" onClick={() => { if (!knowledgeDirty) setShowKnowledge(false); }}>
          {/* Blur backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />

          {/* Popup card */}
          <div
            className={`relative z-10 w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden ${
              theme === 'dark'
                ? 'bg-zinc-900 border border-zinc-700/60 shadow-[0_24px_80px_rgba(0,0,0,0.5)]'
                : 'bg-white border border-zinc-200/80 shadow-[0_24px_80px_rgba(0,0,0,0.15)]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <div>
                <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>Knowledge</h2>
                <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Everything here feeds directly into the LLM system prompt
                </p>
              </div>
              <div className="flex items-center gap-2">
                {knowledgeDirty && (
                  <button
                    onClick={handleKnowledgeSave}
                    disabled={knowledgeSaving}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      knowledgeSaving
                        ? (theme === 'dark' ? 'bg-zinc-700 text-zinc-500' : 'bg-zinc-100 text-zinc-400')
                        : (theme === 'dark' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-500 text-white hover:bg-blue-600')
                    }`}
                  >
                    {knowledgeSaving ? 'Saving...' : 'Save'}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (knowledgeDirty) {
                      if (confirm('Discard unsaved changes?')) {
                        setKnowledgeDirty(false);
                        knowledge.get().then(store => setKnowledgeContent(store.content || ''));
                        setShowKnowledge(false);
                      }
                    } else {
                      setShowKnowledge(false);
                    }
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Editor area */}
            <div className="flex-1 min-h-0 p-6 overflow-hidden flex flex-col">
              <textarea
                value={knowledgeContent}
                onChange={(e) => { setKnowledgeContent(e.target.value); setKnowledgeDirty(true); }}
                placeholder="Add knowledge for the LLM — ad strategy, frameworks, brand notes, learnings..."
                className={`flex-1 min-h-0 w-full resize-none text-sm leading-relaxed rounded-xl p-4 font-mono focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-zinc-800/50 text-zinc-300 placeholder-zinc-600 border border-zinc-700/50 focus:ring-blue-500/30'
                    : 'bg-zinc-50 text-zinc-700 placeholder-zinc-400 border border-zinc-200 focus:ring-blue-500/20'
                }`}
                spellCheck={false}
              />
              <div className={`flex items-center justify-between mt-3 text-[10px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                <span>{knowledgeContent.length.toLocaleString()} chars</span>
                <span>{knowledgeDirty ? 'Unsaved changes' : 'Saved'}</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Ad Library Browser Modal */}
      {showAdLibrary && (
        <AdLibraryBrowser
          onClose={() => setShowAdLibrary(false)}
          theme={theme}
          onReferenceLayout={(imageBase64, description, category) => {
            // Add as a "layout" type reference image — max 1 layout, replace if exists
            const newRef: ReferenceImage = {
              base64: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`,
              label: `${category} layout reference`,
              description: description.slice(0, 300),
              type: 'layout',
            };
            // Remove any existing layout image, then add new one
            const withoutLayout = uploadedImages.filter(img => img.type !== 'layout');
            updateCampaign({ referenceImages: [...withoutLayout, newRef] });
          }}
          onCopyTarget={referenceCopyEnabled ? (imageBase64, description, category, filename, path) => {
            const target = { base64: imageBase64, description, category, filename, path };
            setReferenceCopyTarget(target);
            localStorage.setItem('make_reference_copy_target', JSON.stringify(target));
          } : undefined}
        />
      )}
    </div>
  );
}
