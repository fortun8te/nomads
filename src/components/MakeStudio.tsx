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

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { ollamaService } from '../utils/ollama';
import { generateImage, checkServerStatus, restartFreepikBrowser } from '../utils/freepikService';
import { storage, type StoredImage } from '../utils/storage';
import { knowledge } from '../utils/knowledge';
import { NomadIcon } from './NomadIcon';
import { ShineText } from './ShineText';
import { OrbitalLoader } from './OrbitalLoader';
import { tokenTracker, type TokenInfo } from '../utils/tokenStats';
import type { ReferenceImage } from '../types';
import { toPng } from 'html-to-image';
import { SIMPLETICS_PRESET } from '../utils/presetCampaigns';
import { pdfToImages } from '../utils/pdfUtils';
import { AdLibraryBrowser } from './AdLibraryBrowser';
import { getRelevantReferences } from '../utils/adLibraryCache';

// ── Types ──

type AdMode = 'static' | 'funnel' | 'custom';
type AspectRatio = '1:1' | '9:16' | '4:5' | '16:9' | '2:3' | '3:4';

/** Extract the image prompt from LLM JSON output, falling back to raw text.
 *  Always prefixes with "advertising creative" context so the image model
 *  knows to produce an ad, not a stock photo. */
function extractImagePrompt(raw: string): string {
  const trimmed = raw.trim();
  let prompt = trimmed;

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
      } else if (parsed.global_context?.scene_description) {
        prompt = parsed.global_context.scene_description;
      }
    }
  } catch {
    // JSON parse failed — use raw text
  }

  // Ensure the image model knows this is an AD, not a photo
  const adPrefix = 'Professional social media advertising creative for a DTC brand campaign. ';
  if (!prompt.toLowerCase().includes('advertising') && !prompt.toLowerCase().includes('ad creative') && !prompt.toLowerCase().includes('ad image')) {
    prompt = adPrefix + prompt;
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
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for rendering with timeout
    await new Promise(r => setTimeout(r, 800));

    // Capture the iframe body
    const body = iframeDoc.body;
    if (!body) return null;

    // Add timeout to image capture (toPng can hang on bad HTML)
    const capturePromise = toPng(body, {
      width,
      height,
      style: { margin: '0', padding: '0' },
      canvasWidth: width,
      canvasHeight: height,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Screenshot capture timeout')), 5000)
    );

    const dataUrl = await Promise.race([capturePromise, timeoutPromise]);
    return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  } catch (err) {
    console.error('HTML screenshot capture failed:', err);
    // Silently continue without layout screenshot
    return null;
  } finally {
    document.body.removeChild(container);
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
  const docStart = clean.indexOf('<!DOCTYPE') !== -1 ? clean.indexOf('<!DOCTYPE') : clean.indexOf('<html');
  const docEnd = clean.lastIndexOf('</html>');
  if (docStart >= 0 && docEnd > docStart) {
    clean = clean.slice(docStart, docEnd + 7);
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

  // Core state
  const [activeMode, setActiveMode] = useState<AdMode>('static');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [generationStartTime, setGenerationStartTime] = useState(0);
  const [_generationEta, setGenerationEta] = useState(0); // seconds
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [_serverWarning, setServerWarning] = useState('');
  const [freepikReady, setFreepikReady] = useState<boolean | null>(null); // null = unchecked

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
  const [batchMode, setBatchMode] = useState<'concepts' | 'variations'>('concepts');
  const lastConceptRef = useRef<string>(''); // Stores first concept for variation mode

  // HTML Ad variant state
  const [htmlVariants, setHtmlVariants] = useState<HtmlAdVariant[]>([]);
  const [currentHtmlPreview, setCurrentHtmlPreview] = useState<string>('');
  const [variantCount, setVariantCount] = useState(1);
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'streaming' | 'capturing' | 'between'>('idle');
  const [debouncedHtml, setDebouncedHtml] = useState('');
  const [codeDrawerOpen, setCodeDrawerOpen] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);
  const [templateLabel, setTemplateLabel] = useState<string>('');
  const codeEndRef = useRef<HTMLDivElement>(null);

  // Token tracker state (live progress from ollamaService)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>(tokenTracker.get());
  useEffect(() => {
    return tokenTracker.subscribe(() => setTokenInfo(tokenTracker.get()));
  }, []);

  // Fun rotating status words (cycles during generation)
  const STATUS_WORDS: Record<string, string[]> = {
    loading: ['Loading model...', 'Warming up VRAM...', 'Waking up neurons...', 'Booting brain...', 'Initializing vibes...'],
    thinking: ['Thinking...', 'Pondering...', 'Contemplating...', 'Brainstorming...', 'Ideating...'],
    streaming: ['Writing HTML...', 'Crafting markup...', 'Composing layout...', 'Designing...', 'Building ad...'],
    capturing: ['Screenshotting...', 'Capturing pixels...', 'Rendering...', 'Snapping...'],
    freepik: ['Sending to Freepik...', 'Generating pixels...', 'Creating imagery...', 'Painting...', 'Rendering creative...'],
    enhancing: ['Enhancing prompt...', 'Adding ad expertise...', 'Combobulating...', 'Strategizing...', 'Optimizing copy...'],
  };
  const [statusWordIdx, setStatusWordIdx] = useState(0);
  useEffect(() => {
    if (!isGenerating) { setStatusWordIdx(0); return; }
    const interval = setInterval(() => setStatusWordIdx(i => i + 1), 3500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const getStatusWord = (phase: string): string => {
    const words = STATUS_WORDS[phase] || STATUS_WORDS.streaming;
    return words[statusWordIdx % words.length];
  };

  // Image model settings (always visible — final output is always image model)
  const [imageModel, setImageModel] = useState('nano-banana-2');

  // Pipeline toggles (LLM is master — others depend on it)
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [presetEnabled, setPresetEnabled] = useState(true);   // Inject campaign/brand data
  const [htmlEnabled, setHtmlEnabled] = useState(true);       // HTML ads = default mode
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [llmModel, setLlmModel] = useState('glm-4.7-flash:q4_K_M');
  const [showResearchSummary, setShowResearchSummary] = useState(false);

  // LLM streaming output (visible during generation)
  const [llmOutput, setLlmOutput] = useState('');
  const llmOutputRef = useRef<HTMLDivElement>(null);

  // Ad library browser
  const [showAdLibrary, setShowAdLibrary] = useState(false);
  const [adLibraryEnabled, setAdLibraryEnabled] = useState(true);  // Inject reference ads into prompts

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
    if (files.length > 0) processUploadedFiles(files);
  }, [processUploadedFiles]);

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
          model: 'minicpm-v:8b',
          images: [rawBase64],
          onChunk: (chunk) => {
            accumulated += chunk;
            updateReferenceImage(index, { description: accumulated.trim() });
          },
        }
      );
    } catch (err) {
      console.error('Vision analysis failed:', err);
      updateReferenceImage(index, { description: `[Analysis failed: ${err instanceof Error ? err.message : 'unknown error'}]` });
    } finally {
      setAnalyzingImageIdx(null);
    }
  }, [uploadedImages, updateReferenceImage, campaign]);

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
    { key: 'funnel', label: 'Funnel', icon: '▽' },
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
  "prompt_for_image_model": "Advertising creative for Simpletics Vanilla Voyage: Polished DTC ad campaign image. Over-the-shoulder intimate POV — a woman's hand with natural nails holds the white spray bottle with warm brown (#8B6F47) branding @img1 up near sun-kissed wavy hair, mid-spray — fine mist catches golden sunlight between bottle and hair. Product hero: white bottle, brown label, actuator pressed, mist visible. Setting echoes brand palette: warm wood shelf, white marble counter, warm brown towel, sun-drenched bathroom. Golden backlight creates rim light on hair and illuminates spray particles. Shallow depth of field, background soft bokeh. Premium paid Instagram ad composition — aspirational, effortless, brand-consistent."
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
  "prompt_for_image_model": "START with 'Advertising creative for [brand]:' then one dense paragraph describing the COMPLETE ad image. MUST include: (1) 'advertising creative' or 'ad campaign image' framing. (2) Product's EXACT appearance from brand data — packaging colors, shape, label. (3) What the product is DOING in the scene. (4) Brand colors deliberately used in background/props/lighting. (5) Camera angle and composition. (6) Lighting and mood. (7) Must look like a polished paid social ad, NOT a stock photo. (8) If product reference images exist, place @img tags RIGHT NEXT TO the product description — e.g. '...white spray bottle with brown branding @img1 being held...'"
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
  const HTML_AD_SYSTEM_PROMPT = `You are an HTML AD DESIGNER for paid social (Instagram, TikTok, Facebook). You output a single complete HTML document that gets screenshotted as the final ad image.

CRITICAL — THIS IS A SOCIAL AD, NOT A WEBSITE:
- Think billboard, not brochure. Maximum 3-4 text elements (headline + subtext + CTA).
- Headline HUGE — minimum 56px. Readable at phone-screen size.
- Product image must be MASSIVE — 40-60% of the ad area, never tiny or thumbnailed.
- If the product image has a transparent background, let it BLEND into the design. No white boxes around it.
- Use 2-3 colors max. White space is power.

TECHNICAL:
1. Exactly ${htmlDim.w}x${htmlDim.h}px. Outer container: <div style="width:${htmlDim.w}px;height:${htmlDim.h}px;overflow:hidden;position:relative;">
2. CSS in <style> or inline. MUST include this font link: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">. No JS, no iframes.
3. Product images: <img src="{{PRODUCT_IMG_1}}">. System injects real images.
4. Start with <!-- Strategy: [FORMAT] - [FRAMEWORK] --> then <!-- Inspired by: Reference #N --> (if reference ads were provided), then <!DOCTYPE html>. Output ONLY HTML.

PRODUCT IMAGE RULES (NON-NEGOTIABLE):
- Product must be the VISUAL HERO. Giant, dominant, unmissable.
- If the product has a transparent/white background, use object-fit: contain with NO background box.
- Let the product float naturally on the ad background — no white rectangles or boxes around it.
- Drop shadow (filter: drop-shadow) works great on transparent product images for depth.
- Minimum 350px in smallest dimension. Product should feel like you could reach out and grab it.
- Consider angled/tilted product placement for dynamic energy (transform: rotate(-5deg)).

TYPOGRAPHY RULES (NON-NEGOTIABLE):
- Font: font-family: 'Suisse Intl', 'Inter', system-ui, sans-serif — this exact stack, no exceptions.
- Headline: 56-80px, font-weight: 800 (ExtraBold). Must be readable from 3 feet away.
- Subtext/prices: 20-28px, font-weight: 600 (SemiBold). One line, max two.
- Body text: 16-20px, font-weight: 400 or 500 (Regular/Medium).
- CTA button text: 20-24px, font-weight: 700 (Bold). High contrast button.
- Small tags/badges: 12-16px, font-weight: 500 (Medium).
- NEVER use font-weight below 400. NEVER use text smaller than 12px.

COLOR RULES (READ CAREFULLY):
- Brand blue: #5383F0 — use this for CTAs, buttons, badges, and accent elements.
- Use the brand's PRIMARY colors from the brand data for backgrounds and text.
- Variant/scent accent colors (like brown for vanilla) are ONLY for tiny accents or tags, NOT for backgrounds, CTAs, or headlines.
- CTA buttons: #5383F0 background with white text. This is the brand's action color.
- Background options: clean white/off-white, soft gradient (white → light blue #EBF0FD), or dark navy (#1E2A3A → #2E3138).
- NEVER make the whole ad one accent/variant color. The brand identity > the scent variant.

AD FORMATS — you MUST use different ones across a batch. Pick one per ad:
- PRODUCT HERO: Product huge + centered or dynamically placed. Bold headline overlapping. CTA at bottom.
- BEFORE/AFTER: Split layout showing transformation. "Before" flat/boring hair, "After" textured/styled. Strong contrast.
- SOCIAL PROOF: Large product image + floating review cards with glassmorphism (backdrop-blur, semi-transparent bg). Star ratings. "200,000+ customers" type headline.
- BENEFIT BADGES: Product centered with floating pill badges around it ("Paraben Free", "5 Ingredients", "Real Himalayan Salt").
- URGENCY/OFFER: Price callout ($20 vs $50+), strikethrough pricing, "Limited" feel. Product + bold offer text.
- LIFESTYLE SPLIT: Half text/half product. Text side has headline + CTA, product side has large product on gradient.
- TESTIMONIAL: Big quote text + product below/beside + customer name + stars. Clean and trust-building.
- TIKTOK NATIVE: Looks like organic TikTok content. "TikTok's Favorite" badge, casual energy, platform logos.

COPY RULES:
- Write copy that sounds like a real DTC brand, not generic marketing.
- Use the brand's actual language and proof points from the brand data.
- Each ad in a batch MUST have a UNIQUE headline — never repeat the same copy.
- Good copy patterns: "The [product] that actually works", "[Bold claim]. [Proof].", "[Number] customers can't be wrong", "Your [routine] is lying to you"
- BAD copy: generic wellness speak, overly formal, anything that sounds like a template.

SIMPLICITY CHECK — before outputting, verify:
✓ Can I read the headline in under 2 seconds?
✓ Is the product image LARGE and well-integrated (no white box around it)?
✓ Are there 4 or fewer text elements?
✓ Does this look like a real Instagram/TikTok ad from a DTC brand?
✓ VARIATION: Is this layout/format DIFFERENT from other ads in this batch?
✓ Are colors consistent with the brand's website, NOT the scent variant color?`;


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
    // Taste output
    if (currentCycle.stages?.taste?.status === 'complete' && currentCycle.stages.taste.agentOutput) {
      parts.push(`CREATIVE DIRECTION:\n${currentCycle.stages.taste.agentOutput.slice(0, 500)}`);
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

  // ── Build rich image context for LLM (replaces generic @img refs) ──
  // Also builds instructions for how to reference @img tags in prompt_for_image_model
  const buildImageContext = useCallback(() => {
    if (uploadedImages.length === 0) return '';
    const lines = uploadedImages.map((img, i) => {
      const tag = `@img${i + 1}`;
      const desc = img.description ? `: ${img.description}` : '';
      return `${tag} [${img.type}] "${img.label}"${desc}`;
    });
    const productImgs = uploadedImages.filter(img => img.type === 'product');
    const imgTagInstructions = productImgs.length > 0
      ? `\n\nIMPORTANT — @img TAG USAGE IN prompt_for_image_model:
When writing the "prompt_for_image_model" field, you MUST include @img tags for product reference images.
${productImgs.map((img, _i) => {
  const globalIdx = uploadedImages.indexOf(img) + 1;
  return `- Use @img${globalIdx} to reference "${img.label}"${img.description ? ` (${img.description})` : ''}`;
}).join('\n')}
Place @img tags NEXT TO the product description in the prompt, e.g.: "...a white spray bottle with brown branding @img1 being held up near..."
The @img tag tells the image model to use that uploaded reference for visual accuracy. Without it, the model won't match the actual product appearance.`
      : '';
    return `REFERENCE IMAGES:\n${lines.join('\n')}\n\nUse these images as visual reference. Product images show the ACTUAL product to feature prominently. Layout images show the composition/structure to be inspired by. Match the product's exact appearance, colors, and packaging in your ad composition.${imgTagInstructions}`;
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

  // ── Get cached ad library references (pre-analyzed, instant) ──
  const getAdLibraryContext = useCallback(async (): Promise<string> => {
    const productType = campaign?.productDescription || campaign?.presetData?.product?.oneLiner || '';
    const brandVibe = campaign?.presetData?.brand?.imageStyle || campaign?.presetData?.brand?.positioning || '';
    return getRelevantReferences(productType, brandVibe, 8);
  }, [campaign]);

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

    for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;

      const adStartTime = Date.now();
      setBatchCurrent(i + 1);
      setGenerationProgress(`Creating ad ${i + 1} of ${count}...`);
      setGenerationPhase('streaming');
      setLlmOutput('');
      setCurrentHtmlPreview('');

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

      // Build the full prompt
      const adPrompt = `Design a ${aspectRatio} (${dim.w}x${dim.h}px) HTML ad creative.

USER BRIEF: ${prompt || 'Create a high-performance paid social ad.'}

${fullPreset ? `--- BRAND BIBLE ---\n${fullPreset}\n` : presetContext ? `BRAND:\n${presetContext}\n` : ''}
${researchContext ? `--- CUSTOMER RESEARCH ---\n${researchContext}\n` : ''}
${adLibraryContext}${brandRules}
${productPlaceholders}${variationInstruction}${templateInstruction}

Create a complete, production-ready HTML ad. This screenshot IS the final deliverable — make it polished and compelling.`;

      try {
        let htmlOutput = '';
        await ollamaService.generateStream(
          adPrompt,
          HTML_AD_SYSTEM_PROMPT,
          {
            model: llmModel,
            signal,
            onChunk: (chunk) => {
              htmlOutput += chunk;
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

          // Parse which reference ad inspired this design
          const inspiredMatch = cleanHtml.match(/<!--\s*Inspired by:\s*(.+?)\s*-->/i);
          const inspiredBy = inspiredMatch ? inspiredMatch[1].trim() : undefined;

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
          };
          await persistImage(stored);
        } else {
          setGenerationProgress(`Ad ${i + 1} screenshot failed, skipping...`);
          await new Promise(r => setTimeout(r, 1000));
        }

        // Smooth transition between variants
        if (i < count - 1) {
          setGenerationPhase('between');
          setGenerationProgress(`Ad ${i + 1} done — starting next...`);
          await new Promise(r => setTimeout(r, 600));
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
    setGenerationProgress('');
    setGenerationPhase('idle');
  }, [aspectRatio, buildBrandVisualRules, presetEnabled, getFullPresetContext, researchEnabled, getResearchContext, getPresetContext, buildProductImagePlaceholders, prompt, uploadedImages, llmModel, campaign, persistImage, HTML_AD_SYSTEM_PROMPT, templateHtml, getAdLibraryContext, adLibraryEnabled]);

  // ══════════════════════════════════════════════════════
  // ██  RENDER SELECTED — HTML screenshot → Freepik image
  // ══════════════════════════════════════════════════════
  const renderSelectedVariants = useCallback(async () => {
    const variantIds = Array.from(selectedVariants);
    const toRender = variantIds
      .map(id => htmlVariants.find(v => v.id === id))
      .filter(Boolean) as HtmlAdVariant[];

    if (toRender.length === 0) return;

    const abortController = new AbortController();
    renderAbortRef.current = abortController;
    const signal = abortController.signal;

    setIsRendering(true);
    const totalImages = toRender.length * renderCount;
    setRenderTotal(totalImages);
    setRenderCurrent(0);
    setRenderProgress('Starting render...');

    const productImgs = uploadedImages.filter(img => img.type === 'product');
    const productRefBase64s = productImgs.map(img => img.base64);
    const brandRules = buildBrandVisualRules();
    const presetContext = presetEnabled ? getPresetContext() : '';

    let renderIdx = 0;
    for (const variant of toRender) {
      if (signal.aborted) break;

      // Build reference images: product images + HTML screenshot as layout guide
      const allRefs = [...productRefBase64s, variant.screenshotBase64];
      const layoutImgIdx = allRefs.length; // 1-indexed for @img tag

      const productDesc = productImgs.length > 0
        ? productImgs.map((img, j) =>
            `@img${j + 1} (${img.label}: ${img.description || 'product shot'})`
          ).join(', ')
        : '';

      const promptText = `Professional DTC advertising creative for paid social (Instagram/TikTok/Facebook).
${campaign?.brand ? `Brand: ${campaign.brand}.` : ''}
Ad concept: "${variant.strategyLabel}".
${productDesc ? `Product references: ${productDesc}.` : ''}
@img${layoutImgIdx} is the HTML AD LAYOUT — be INSPIRED by its composition, color placement, and visual hierarchy. Place elements in similar zones but create a polished, production-quality ad image.
${presetContext ? `Brand context: ${presetContext}` : ''}
${brandRules}
The product must be prominently visible and the visual hero. This must look like a polished paid social ad, not a stock photo. Dynamic, scroll-stopping, brand-consistent.`;

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
            model: llmModel,
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
  }, [selectedImage, refinePrompt, isRefining, campaign, persistImage, llmModel, uploadedImages, HTML_AD_SYSTEM_PROMPT]);

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

    // Build variation context if in variation mode and we have a first concept
    const variationHint = batchMode === 'variations' && lastConceptRef.current
      ? `\n\nVARIATION MODE: Create a VARIATION of this concept — same core idea, different execution:\n${lastConceptRef.current}\nKeep the same product, angle, and message but change: composition, camera angle, lighting, color treatment, or model pose. Make it distinct but recognizably the same campaign.\n`
      : '';
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

      // Only send product-type images to Freepik (not guidelines, brand assets, etc.)
      const productRefBase64s = uploadedImages.filter(img => img.type === 'product').map(img => img.base64);
      const result = await generateImage({
        prompt: finalImagePrompt,
        model: imageModel,
        aspectRatio,
        count: batchCount,  // Pass batch count to Freepik natively
        referenceImages: productRefBase64s,
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
            referenceImageCount: productRefBase64s.length,
            referenceImages: productRefBase64s.length > 0 ? productRefBase64s : undefined,
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
      setGenerationProgress(`Enhancing prompt with ${llmModel}...`);

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

        // Capture first concept for variation mode
        if (!lastConceptRef.current) lastConceptRef.current = rawOutput.slice(0, 500);

        const cleanPrompt = extractImagePrompt(rawOutput);
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const productRefBase64s = uploadedImages.filter(img => img.type === 'product').map(img => img.base64);
        const result = await generateImage({
          prompt: cleanPrompt,
          model: imageModel,
          aspectRatio,
          count: 1,
          referenceImages: productRefBase64s,
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
            referenceImageCount: productRefBase64s.length,
            referenceImages: productRefBase64s.length > 0 ? productRefBase64s : undefined,
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
      setGenerationProgress('Analyzing preset data...');
      setLlmOutput('');
      const fullPreset = getFullPresetContext();

      if (!fullPreset) {
        setGenerationProgress('No preset data available — set up a campaign with preset first');
        await new Promise(r => setTimeout(r, 3000));
        imageCountRef.current -= 1;
        return false;
      }

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

        // Capture first concept for variation mode
        if (!lastConceptRef.current) lastConceptRef.current = rawOutput.slice(0, 500);

        const cleanPrompt = extractImagePrompt(rawOutput);
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const productRefBase64s = uploadedImages.filter(img => img.type === 'product').map(img => img.base64);
        const result = await generateImage({
          prompt: cleanPrompt,
          model: imageModel,
          aspectRatio,
          count: 1,
          referenceImages: productRefBase64s,
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
            referenceImageCount: productRefBase64s.length,
            referenceImages: productRefBase64s.length > 0 ? productRefBase64s : undefined,
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
          { model: llmModel, signal, onChunk: (chunk) => {
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

        // Build reference images: only product images + layout screenshot
        const productImgs = uploadedImages.filter(img => img.type === 'product');
        const productRefBase64s = productImgs.map(img => img.base64);
        const allRefs = layoutScreenshot ? [...productRefBase64s, layoutScreenshot] : productRefBase64s;
        // @img tags are 1-indexed: product images first, layout screenshot last
        const layoutImgTag = layoutScreenshot ? `@img${allRefs.length}` : '';

        const productDesc = productImgs.length > 0
          ? `Product reference images: ${productImgs.map((img, i) => `@img${i + 1} (${img.label}: ${img.description || 'product shot'})`).join(', ')}.`
          : '';
        const layoutRef = layoutScreenshot
          ? `${layoutImgTag} is the HTML LAYOUT WIREFRAME — use it as a COMPOSITION GUIDE for where to place elements (product zone, headline area, CTA area). Follow its visual hierarchy and color scheme.`
          : '';

        const imagePromptFromLayout = `Professional social media advertising creative for a DTC brand campaign. Create a polished, production-ready AD IMAGE following this composition layout.
${productDesc}
${layoutRef}
The product must be prominently visible, recognizable, and PART OF A DYNAMIC SCENE — being used, held, or in action.
Use the brand colors from the layout. Follow the visual hierarchy — product zone gets the product, headline zone stays clean for text overlay.
This must look like a PAID SOCIAL AD (Instagram/TikTok/Facebook), not a stock photo. Dynamic, scroll-stopping, brand-consistent.`;

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
      setGenerationProgress('Analyzing research...');
      setLlmOutput('');
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

        // Capture first concept for variation mode
        if (!lastConceptRef.current) lastConceptRef.current = rawOutput.slice(0, 500);

        const cleanPrompt = extractImagePrompt(rawOutput);
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const productRefBase64s = uploadedImages.filter(img => img.type === 'product').map(img => img.base64);
        const result = await generateImage({
          prompt: cleanPrompt,
          model: imageModel,
          aspectRatio,
          count: 1,
          referenceImages: productRefBase64s,
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
            referenceImageCount: productRefBase64s.length,
            referenceImages: productRefBase64s.length > 0 ? productRefBase64s : undefined,
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
          { model: llmModel, signal, onChunk: (chunk) => {
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

        // Build reference images: only product images + layout screenshot
        const productImgs = uploadedImages.filter(img => img.type === 'product');
        const productRefBase64s = productImgs.map(img => img.base64);
        const allRefs = layoutScreenshot ? [...productRefBase64s, layoutScreenshot] : productRefBase64s;
        const layoutImgTag = layoutScreenshot ? `@img${allRefs.length}` : '';

        const productDesc = productImgs.length > 0
          ? `Product reference images: ${productImgs.map((img, i) => `@img${i + 1} (${img.label}: ${img.description || 'product shot'})`).join(', ')}.`
          : '';
        const layoutRef = layoutScreenshot
          ? `${layoutImgTag} is the HTML LAYOUT WIREFRAME — use it as a COMPOSITION GUIDE for where to place elements (product zone, headline area, CTA area). Follow its visual hierarchy and color scheme.`
          : '';

        const imagePromptFromLayout = `Professional social media advertising creative for a DTC brand campaign. Create a polished, production-ready AD IMAGE following this composition layout.
${productDesc}
${layoutRef}
The product must be prominently visible, recognizable, and PART OF A DYNAMIC SCENE — being used, held, or in action.
Use the brand colors from the layout. Follow the visual hierarchy — product zone gets the product, headline zone stays clean for text overlay.
This must look like a PAID SOCIAL AD (Instagram/TikTok/Facebook), not a stock photo. Dynamic, scroll-stopping, brand-consistent.`;

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
  }, [prompt, aspectRatio, campaign, imageModel, llmEnabled, presetEnabled, htmlEnabled, researchEnabled, llmModel, batchCount, uploadedImages, getResearchContext, getPresetContext, getFullPresetContext, getSettingsContext, buildImageContext, buildBrandVisualRules, persistImage, knowledgeContent]);

  // ══════════════════════════════════════════════════════
  // ██  BATCH GENERATE — orchestrates all generation modes
  // ══════════════════════════════════════════════════════
  const handleGenerate = useCallback(async () => {
    if ((!llmEnabled && !prompt.trim()) || isGenerating || isRendering) return;

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
    setGenerationEta(MODEL_ETAS[imageModel] || 30);
    setBatchCurrent(0);
    setLlmOutput('');

    // Auto-scroll gallery to top so placeholder is visible
    requestAnimationFrame(() => {
      galleryScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    try {
      // ── HTML AD MODE (primary) ──
      if (htmlEnabled && llmEnabled) {
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
      generationAbortRef.current = null;
      setCurrentHtmlPreview('');
      setGenerationPhase('idle');
      // Show completion briefly before clearing
      const adsMade = htmlVariants.length;
      if (adsMade > 0) {
        setGenerationProgress(`Done — ${adsMade} ad${adsMade > 1 ? 's' : ''} created`);
        await new Promise(r => setTimeout(r, 2500));
      }
      setIsGenerating(false);
      setGeneratingForPrompt(null);
      setGenerationProgress('');
      setBatchCurrent(0);
    }
  }, [prompt, isGenerating, batchCount, variantCount, imageModel, llmEnabled, htmlEnabled, generateSingleImage, generateHtmlAds, htmlVariants.length]);

  const handleCancelGeneration = useCallback(() => {
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
      setIsGenerating(false);
      setGeneratingForPrompt(null);
      setGenerationProgress('Cancelled');
      setGenerationPhase('idle');
      setTimeout(() => setGenerationProgress(''), 1500);
    }
  }, []);

  // ── Keyboard shortcut ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // ── Research status ──
  const researchComplete = currentCycle?.stages?.research?.status === 'complete';
  const tasteComplete = currentCycle?.stages?.taste?.status === 'complete';
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

  // ── Filtered + grouped images ──
  const filteredImages = favoriteFilter
    ? storedImages.filter(img => img.favorite)
    : storedImages;

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
                  {/* Status text with shimmer + rotating fun words */}
                  <ShineText variant={theme === 'dark' ? 'dark' : 'light'} className="text-[11px] font-semibold">
                    {generationPhase === 'streaming'
                      ? (tokenInfo.isModelLoading ? getStatusWord('loading')
                        : tokenInfo.isThinking ? getStatusWord('thinking')
                        : getStatusWord('streaming'))
                      : generationPhase === 'capturing' ? getStatusWord('capturing')
                      : generationPhase === 'between' ? 'Next variant...'
                      : generationProgress?.includes('Enhancing') ? getStatusWord('enhancing')
                      : generationProgress?.includes('Freepik') || generationProgress?.includes('Sending to') ? getStatusWord('freepik')
                      : generationProgress || 'Generating...'}
                  </ShineText>
                  {/* Token count (only when streaming) */}
                  {generationPhase === 'streaming' && tokenInfo.liveTokens > 0 && (
                    <span className={`text-[10px] font-mono tabular-nums flex-shrink-0 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {tokenInfo.liveTokens} tok
                    </span>
                  )}
                  {/* HTML chars */}
                  {generationPhase === 'streaming' && llmOutput && (
                    <span className={`text-[10px] font-mono tabular-nums flex-shrink-0 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {(llmOutput.length / 1000).toFixed(1)}k chars
                    </span>
                  )}
                  {/* Elapsed */}
                  <span className={`text-[10px] font-medium tabular-nums flex-shrink-0 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {generationElapsed}s
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
                    <OrbitalLoader
                      size={120}
                      dark={theme === 'dark'}
                      status={tokenInfo.isModelLoading ? getStatusWord('loading') : tokenInfo.isThinking ? getStatusWord('thinking') : getStatusWord('streaming')}
                      detail={[
                        tokenInfo.liveTokens > 0 ? `${tokenInfo.liveTokens} tok` : null,
                        `${generationElapsed}s`,
                      ].filter(Boolean).join(' · ')}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── HTML Ad Variants Gallery with Selection ── */}
          {htmlVariants.length > 0 && (
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
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                        </div>
                      </div>
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
          {storedImages.length > 0 && (
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFavoriteFilter(false)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${!favoriteFilter ? (theme === 'dark' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-white') : (theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600')}`}
                  >All</button>
                  <button
                    onClick={() => setFavoriteFilter(true)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 ${favoriteFilter ? (theme === 'dark' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-white') : (theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600')}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill={favoriteFilter ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    Saved
                  </button>
                  {filteredImages.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete all ${filteredImages.length} images?`)) return;
                        for (const img of filteredImages) {
                          await storage.deleteImage(img.id);
                        }
                        setStoredImages(prev => prev.filter(img => !filteredImages.some(f => f.id === img.id)));
                        setSelectedImage(null);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${theme === 'dark' ? 'text-red-400 hover:bg-red-900/30' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>

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
                    <div className="grid gap-1 items-start" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                      {/* Placeholder card (generating for this group) */}
                      {isGeneratingForThisGroup && (
                        <div className={`col-span-2 ${getAspectClass(aspectRatio)} relative rounded-xl overflow-hidden border-2 border-dashed flex flex-col items-center justify-center shadow-inner ${theme === 'dark' ? 'border-zinc-600 bg-gradient-to-br from-zinc-800 via-zinc-800 to-zinc-700' : 'border-zinc-300 bg-gradient-to-br from-zinc-50 via-white to-zinc-100'}`}>
                          <OrbitalLoader
                            size={80}
                            dark={theme === 'dark'}
                            status={generationProgress?.includes('Sending') ? getStatusWord('freepik') : `${generationElapsed}s`}
                          />
                        </div>
                      )}

                      {images.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => !deletingIds.has(img.id) && setSelectedImage(selectedImage?.id === img.id ? null : img)}
                          className={`group relative rounded-lg overflow-hidden border text-left transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_2px_4px_rgba(0,0,0,0.06)] hover:-translate-y-1 ${
                            selectedImage?.id === img.id
                              ? 'border-zinc-900 ring-1 ring-zinc-900/10 shadow-[0_4px_12px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.06)] -translate-y-1'
                              : 'border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_1px_rgba(0,0,0,0.03)] hover:border-zinc-300'
                          }`}
                          style={deletingIds.has(img.id) ? { animation: 'nomad-card-delete 0.35s ease-out forwards', pointerEvents: 'none' } : undefined}
                        >
                          <div className={`${getAspectClass(img.aspectRatio)} overflow-hidden bg-zinc-100`}>
                            <img src={`data:image/png;base64,${img.imageBase64}`} alt={img.label} className="w-full h-full object-cover" loading="lazy" />
                          </div>
                          {/* Hover: favorite */}
                          <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(img.id); }}
                              className="p-1 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill={img.favorite ? '#ef4444' : 'none'} stroke={img.favorite ? '#ef4444' : 'white'} strokeWidth="2.5">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                              </svg>
                            </button>
                          </div>
                          {/* Hover: delete */}
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button
                              onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                              className="p-1 rounded-full bg-black/30 backdrop-blur-sm hover:bg-red-500/80 transition-colors"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {/* Bottom badge */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent px-1.5 py-1 pt-4">
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] font-semibold text-white/80 bg-white/20 px-1 py-0.5 rounded">{img.model === 'nano-banana-2' ? 'G' : 'S'}</span>
                              <span className="text-[8px] text-white/60">{img.label}</span>
                            </div>
                          </div>
                          {/* Favorite indicator (always visible when favorited) */}
                          {img.favorite && (
                            <div className="absolute top-1 left-1 group-hover:opacity-0 transition-opacity">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Generating State (big loader when no variants yet and code drawer closed) ── */}
          {isGenerating && htmlEnabled && llmEnabled && htmlVariants.length === 0 && !codeDrawerOpen && (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
              <OrbitalLoader
                size={200}
                dark={theme === 'dark'}
                status={
                  tokenInfo.isModelLoading ? getStatusWord('loading') :
                  tokenInfo.isThinking ? getStatusWord('thinking') :
                  generationPhase === 'streaming' ? getStatusWord('streaming') :
                  generationPhase === 'capturing' ? getStatusWord('capturing') :
                  generationProgress || 'Generating...'
                }
                detail={[
                  tokenInfo.liveTokens > 0 ? `${tokenInfo.liveTokens} tokens` : null,
                  llmOutput ? `${(llmOutput.length / 1000).toFixed(1)}k chars` : null,
                  `${generationElapsed}s`,
                ].filter(Boolean).join(' · ')}
              />
            </div>
          )}

          {/* ── Empty State ── */}
          {!isGenerating && storedImages.length === 0 && (
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
              onClick={() => setActiveMode(mode.key)}
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

        {/* Prompt Input Area */}
        <div className="max-w-3xl mx-auto">
          <div className={`rounded-2xl border overflow-hidden transition-shadow duration-200 ${theme === 'dark' ? 'bg-zinc-800/60 border-zinc-700/60 shadow-[0_1px_3px_rgba(0,0,0,0.15),0_2px_8px_rgba(0,0,0,0.08)] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.12)]' : 'bg-zinc-50 border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.03)] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.04)]'}`} onDragOver={handleImageDragOver} onDrop={handleImageDrop}>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
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
            <div className={`flex items-center justify-between px-4 py-2.5 border-t ${theme === 'dark' ? 'border-zinc-800 bg-zinc-800/30' : 'border-zinc-100 bg-zinc-50'}`}>
              <div className="flex items-center gap-2">
                {/* Pipeline label */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${theme === 'dark' ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-100 text-zinc-500'}`}>
                  {htmlEnabled && llmEnabled ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  ) : (
                    <span className={`w-1.5 h-1.5 rounded-full ${freepikReady ? 'bg-emerald-500' : freepikReady === false ? 'bg-red-400' : 'bg-zinc-300'}`} />
                  )}
                  {htmlEnabled && llmEnabled ? 'HTML Ads' : getPipelineLabel()}
                </span>
                {freepikReady === false && !(htmlEnabled && llmEnabled) && (
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
                    className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
                      theme === 'dark' ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                    title="Force-restart the Freepik browser"
                  >
                    Restart
                  </button>
                )}

                {/* Preset indicator */}
                {presetEnabled && campaign?.presetData && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${theme === 'dark' ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                    {campaign.brand} preset
                  </span>
                )}

                {/* Research status chips */}
                {researchEnabled && researchComplete && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Research
                  </span>
                )}
                {researchEnabled && tasteComplete && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-full text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    Taste
                  </span>
                )}

                {/* Ad Library References toggle */}
                <button
                  onClick={() => setAdLibraryEnabled(v => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                    adLibraryEnabled
                      ? theme === 'dark' ? 'bg-violet-900/40 text-violet-300 border border-violet-500/30' : 'bg-violet-50 text-violet-600 border border-violet-200'
                      : theme === 'dark' ? 'text-zinc-600 hover:text-zinc-400 border border-transparent' : 'text-zinc-300 hover:text-zinc-500 border border-transparent'
                  }`}
                  title={adLibraryEnabled
                    ? 'Reference ads from your library are injected into the LLM prompt for layout + copy inspiration. Click to disable.'
                    : 'Ad library references OFF — LLM will generate without reference ads. Click to enable.'
                  }
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${adLibraryEnabled ? 'bg-violet-500' : theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300'}`} />
                  {adLibraryEnabled ? 'Refs ON' : 'Refs OFF'}
                </button>

                {/* Ad Library browser button */}
                <button
                  onClick={() => setShowAdLibrary(true)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                  title="Browse ad library"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  Ad Library
                </button>

                {/* Upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                  title="Upload brand asset (image or PDF)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                  Upload
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

              <div className="flex items-center gap-3">
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

                {/* Brand / Preset — Diamond icon */}
                <button
                  onClick={() => setShowPreset(true)}
                  className={`p-2 rounded-lg transition-all relative ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}
                  title="Brand preset & assets"
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
                      className={`fixed w-80 rounded-2xl p-5 z-[9999] flex flex-col max-h-[70vh] overflow-y-auto ${theme === 'dark' ? 'bg-zinc-900 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.6)]' : 'bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]'}`}
                      style={{
                        bottom: `${popoverPos.bottom}px`,
                        right: `${popoverPos.right}px`,
                      }}
                    >
                      <div className={`flex items-center justify-between mb-5 pb-4 border-b ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                        <h3 className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>Settings</h3>
                        <button
                          onClick={() => setShowSettings(false)}
                          className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="space-y-4">

                        {/* IMAGE MODEL (always visible) */}
                        <div>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Image Model</p>
                          <div className="flex items-center justify-between mb-3">
                            <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>Model</span>
                            <select
                              value={imageModel}
                              onChange={(e) => setImageModel(e.target.value)}
                              className={`text-sm font-medium rounded-lg px-3 py-2 focus:outline-none cursor-pointer ${
                                theme === 'dark'
                                  ? 'text-zinc-200 bg-zinc-800 border border-zinc-700 focus:border-zinc-500'
                                  : 'text-zinc-800 bg-white border border-zinc-300 focus:border-zinc-500'
                              }`}
                            >
                              <option value="nano-banana-2">Google Nano Banana 2</option>
                              <option value="seedream-5-lite">Seedream 5 Lite</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>Aspect ratio</span>
                            <select
                              value={aspectRatio}
                              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                              className={`text-sm font-medium rounded-lg px-3 py-2 focus:outline-none cursor-pointer ${
                                theme === 'dark'
                                  ? 'text-zinc-200 bg-zinc-800 border border-zinc-700 focus:border-zinc-500'
                                  : 'text-zinc-800 bg-white border border-zinc-300 focus:border-zinc-500'
                              }`}
                            >
                              <option value="9:16">9:16 Story / Reels</option>
                              <option value="4:5">4:5 Instagram</option>
                              <option value="1:1">1:1 Feed</option>
                              <option value="16:9">16:9 Landscape</option>
                              <option value="2:3">2:3 Pinterest</option>
                              <option value="3:4">3:4 Portrait</option>
                            </select>
                          </div>
                        </div>

                        {/* PIPELINE TOGGLES */}
                        <div className={`border-t pt-4 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                          <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Pipeline</p>

                          {/* LLM toggle (master) */}
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className={`text-sm font-medium ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>LLM</span>
                              <p className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Enhance prompts + ad expertise</p>
                            </div>
                            <button
                              onClick={() => {
                                const next = !llmEnabled;
                                setLlmEnabled(next);
                                if (!next) { setPresetEnabled(false); setHtmlEnabled(false); setResearchEnabled(false); }
                              }}
                              className={`relative w-10 h-6 rounded-full transition-colors ${llmEnabled ? 'bg-blue-500' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                            >
                              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${llmEnabled ? 'left-5' : 'left-1'}`} />
                            </button>
                          </div>

                          {/* Sub-toggles (depend on LLM) */}
                          <div className={`space-y-2 mb-3 pl-3 border-l-2 transition-opacity ${llmEnabled ? 'border-blue-200 opacity-100' : (theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200') + ' opacity-40 pointer-events-none'}`}>
                            {/* Preset Data */}
                            <div className="flex items-center justify-between">
                              <div>
                                <span className={`text-[13px] ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>Use preset</span>
                                <p className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Inject campaign/brand data</p>
                              </div>
                              <button
                                onClick={() => setPresetEnabled(!presetEnabled)}
                                disabled={!llmEnabled}
                                className={`relative w-9 h-5 rounded-full transition-colors ${presetEnabled && llmEnabled ? 'bg-blue-500' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${presetEnabled && llmEnabled ? 'left-4' : 'left-0.5'}`} />
                              </button>
                            </div>

                            {/* Use Research */}
                            <div className="flex items-center justify-between">
                              <div>
                                <span className={`text-[13px] ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>Use research</span>
                                <p className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Inject research findings</p>
                                {researchEnabled && !hasResearchData && (
                                  <p className="text-[10px] text-amber-500 font-medium">No research data yet</p>
                                )}
                              </div>
                              <button
                                onClick={() => setResearchEnabled(!researchEnabled)}
                                disabled={!llmEnabled}
                                className={`relative w-9 h-5 rounded-full transition-colors ${researchEnabled && llmEnabled ? 'bg-blue-500' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${researchEnabled && llmEnabled ? 'left-4' : 'left-0.5'}`} />
                              </button>
                            </div>

                            {/* HTML Layout */}
                            <div className="flex items-center justify-between">
                              <div>
                                <span className={`text-[13px] ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>HTML Ads</span>
                                <p className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Generate complete ad creatives as HTML</p>
                              </div>
                              <button
                                onClick={() => setHtmlEnabled(!htmlEnabled)}
                                disabled={!llmEnabled}
                                className={`relative w-9 h-5 rounded-full transition-colors ${htmlEnabled && llmEnabled ? 'bg-blue-500' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${htmlEnabled && llmEnabled ? 'left-4' : 'left-0.5'}`} />
                              </button>
                            </div>

                          </div>

                          {/* LLM Model (visible when LLM on) */}
                          {llmEnabled && (
                            <div className="flex items-center justify-between mb-3">
                              <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>LLM model</span>
                              <select
                                value={llmModel}
                                onChange={(e) => setLlmModel(e.target.value)}
                                className={`text-xs font-medium rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer ${
                                  theme === 'dark'
                                    ? 'text-zinc-200 bg-zinc-800 border border-zinc-700'
                                    : 'text-zinc-800 bg-white border border-zinc-300'
                                }`}
                              >
                                <option value="glm-4.7-flash:q4_K_M">GLM 4.7 Flash</option>
                                <option value="qwen3.5:9b">Qwen 3.5 9B</option>
                                <option value="lfm2.5-thinking:latest">LFM 2.5 (1.2B)</option>
                              </select>
                            </div>
                          )}

                          {/* Research Summary (collapsible) */}
                          {researchEnabled && hasResearchData && (
                            <>
                              <button
                                onClick={() => setShowResearchSummary(!showResearchSummary)}
                                className={`w-full text-left text-xs mb-2 font-medium transition-colors ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                              >
                                {showResearchSummary ? '▼' : '▶'} View research summary
                              </button>
                              {showResearchSummary && currentCycle?.researchFindings && (
                                <div className={`rounded-lg p-3 text-[11px] space-y-1.5 border ${
                                  theme === 'dark' ? 'bg-blue-900/20 border-blue-800/40 text-zinc-300' : 'bg-blue-50 border-blue-200 text-zinc-700'
                                }`}>
                                  {currentCycle.researchFindings.deepDesires?.length > 0 && (
                                    <div><span className={`font-semibold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>Desires:</span> {currentCycle.researchFindings.deepDesires.length}</div>
                                  )}
                                  {currentCycle.researchFindings.objections?.length > 0 && (
                                    <div><span className={`font-semibold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>Objections:</span> {currentCycle.researchFindings.objections.length}</div>
                                  )}
                                  {currentCycle.researchFindings.avatarLanguage?.length > 0 && (
                                    <div><span className={`font-semibold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>Language:</span> {currentCycle.researchFindings.avatarLanguage.length} samples</div>
                                  )}
                                  {currentCycle.researchFindings.competitorWeaknesses?.length > 0 && (
                                    <div><span className={`font-semibold ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>Gaps:</span> {currentCycle.researchFindings.competitorWeaknesses.length}</div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* PIPELINE SUMMARY */}
                        <div className={`border-t pt-3 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                          <div className={`rounded-lg p-3 text-[11px] leading-relaxed ${theme === 'dark' ? 'bg-zinc-800/80 text-zinc-400' : 'bg-zinc-50 text-zinc-500'}`}>
                            <span>{getPipelineLabel()}</span>
                          </div>
                        </div>

                      </div>
                    </div>,
                    document.body
                  )}

                {/* Batch mode toggle — only shows when > 1 */}
                {batchCount > 1 && !(htmlEnabled && llmEnabled) && (
                  <div className={`flex items-center rounded-full p-0.5 mr-2 ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                    <button
                      onClick={() => setBatchMode('concepts')}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                        batchMode === 'concepts'
                          ? theme === 'dark' ? 'bg-zinc-600 text-white' : 'bg-white text-zinc-900 shadow-sm'
                          : theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
                      }`}
                    >
                      Concepts
                    </button>
                    <button
                      onClick={() => setBatchMode('variations')}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                        batchMode === 'variations'
                          ? theme === 'dark' ? 'bg-zinc-600 text-white' : 'bg-white text-zinc-900 shadow-sm'
                          : theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
                      }`}
                    >
                      Variations
                    </button>
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
        </div>
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
                      onChange={(e) => setRefinePrompt(e.target.value)}
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
                                // Max 1 layout — if selecting layout, check if another layout already exists
                                if (newType === 'layout') {
                                  const existingLayoutIdx = uploadedImages.findIndex((other, otherIdx) => otherIdx !== idx && other.type === 'layout');
                                  if (existingLayoutIdx !== -1) {
                                    // Demote existing layout to product
                                    const updated = uploadedImages.map((im, i) => {
                                      if (i === existingLayoutIdx) return { ...im, type: 'product' as const };
                                      if (i === idx) return { ...im, type: newType };
                                      return im;
                                    });
                                    updateCampaign({ referenceImages: updated });
                                    return;
                                  }
                                }
                                updateReferenceImage(idx, { type: newType });
                              }}
                              className={`text-[10px] px-1.5 py-1 rounded-md border ${
                                theme === 'dark'
                                  ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                                  : 'bg-white border-zinc-200 text-zinc-600'
                              }`}
                            >
                              <option value="product">Product</option>
                              <option value="layout">Layout{uploadedImages.some((other, otherIdx) => otherIdx !== idx && other.type === 'layout') ? ' (replaces current)' : ''}</option>
                            </select>
                            <button
                              onClick={() => analyzeReferenceImage(idx)}
                              disabled={analyzingImageIdx === idx}
                              className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${
                                analyzingImageIdx === idx
                                  ? 'bg-purple-500/20 text-purple-400 cursor-wait'
                                  : theme === 'dark'
                                    ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                                    : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                              }`}
                              title="Analyze with vision model (minicpm-v) → summarize with Qwen 3.5"
                            >
                              {analyzingImageIdx === idx ? 'Scanning...' : 'Analyze'}
                            </button>
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
        />
      )}
    </div>
  );
}
