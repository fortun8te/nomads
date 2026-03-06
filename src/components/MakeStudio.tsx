/**
 * MakeStudio — Ad creative generation tool
 *
 * Three pipeline paths, all ending at image model:
 *
 * 1. Research ON + HTML Layout ON:
 *    Research → LLM generates HTML layout → screenshot as @img1 → Image model → Ad
 *
 * 2. Research ON + HTML Layout OFF:
 *    Research → LLM creates optimized prompt → Image model → Ad
 *
 * 3. Research OFF (default):
 *    User prompt + optional @img uploads → Image model → Ad
 *
 * All generated images are persisted to IndexedDB and displayed in a gallery grid.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCampaign } from '../context/CampaignContext';
import { ollamaService } from '../utils/ollama';
import { generateImage, checkServerStatus } from '../utils/freepikService';
import { storage, type StoredImage } from '../utils/storage';
import { NomadIcon } from './NomadIcon';
import { ShineText } from './ShineText';
import { RandomWordCycler } from './RandomWordCycler';

// ── Types ──

type AdMode = 'static' | 'carousel' | 'proofstack' | 'custom';
type AspectRatio = '1:1' | '9:16' | '4:5' | '16:9';

// ── Component ──

export function MakeStudio() {
  const { campaign, currentCycle } = useCampaign();

  // Core state
  const [activeMode, setActiveMode] = useState<AdMode>('static');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [generationStartTime, setGenerationStartTime] = useState(0);
  const [generationEta, setGenerationEta] = useState(0); // seconds
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [serverWarning, setServerWarning] = useState('');
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
  const [, setBatchSuccesses] = useState(0);

  // Image model settings (always visible — final output is always image model)
  const [imageModel, setImageModel] = useState('nano-banana-2');

  // Pipeline settings
  const [useResearch, setUseResearch] = useState(false);
  const [useHtmlLayout, setUseHtmlLayout] = useState(false);
  const [llmModel, setLlmModel] = useState('gpt-oss:20b');
  const [showResearchSummary, setShowResearchSummary] = useState(false);

  // Image uploads
  const [uploadedImages, setUploadedImages] = useState<string[]>([]); // base64 images

  // Hero image generation (Phase 10)
  const [generateHeroImage, setGenerateHeroImage] = useState(false);
  const [heroImageStyle, setHeroImageStyle] = useState('');

  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const imageCountRef = useRef(0); // Track total images for labeling inside async loops
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

  // Check Freepik server status on mount
  useEffect(() => {
    checkServerStatus().then(setFreepikReady);
  }, []);

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

      @keyframes nomad-grid-pulse {
        0%, 100% { opacity: 0.15; }
        50% { opacity: 0.25; }
      }

      @keyframes nomad-grid-drift {
        0% { transform: translate(0, 0); }
        100% { transform: translate(40px, 40px); }
      }

      .nomad-grid-bg {
        background:
          linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.3) 50%, rgba(99,102,241,0.08) 100%),
          radial-gradient(circle, rgba(113, 113, 122, 0.4) 1.5px, transparent 1.5px),
          radial-gradient(circle, rgba(113, 113, 122, 0.2) 1px, transparent 1px);
        background-size: 100% 100%, 80px 80px, 160px 160px;
        background-position: 0 0, 0 0, 40px 40px;
        background-attachment: fixed;
        animation: nomad-grid-drift 18s linear infinite, nomad-grid-pulse 7s ease-in-out infinite;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Image upload handlers ──
  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64 = event.target.result as string;
          setUploadedImages(prev => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleImageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64 = event.target.result as string;
          setUploadedImages(prev => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeUploadedImage = useCallback((index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ── Clipboard paste handler for images ──
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return; // Let default text paste happen
    e.preventDefault();
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setUploadedImages(prev => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // ── Mode definitions ──
  const modes: { key: AdMode; label: string; icon: string }[] = [
    { key: 'static', label: 'Image', icon: '◻' },
    { key: 'carousel', label: 'Carousel', icon: '▣' },
    { key: 'proofstack', label: 'Proof Stack', icon: '☰' },
    { key: 'custom', label: 'See more', icon: '✦' },
  ];

  // ── Aspect ratio dimensions ──
  const aspectDimensions: Record<AspectRatio, { w: number; h: number }> = {
    '1:1': { w: 400, h: 400 },
    '9:16': { w: 360, h: 640 },
    '4:5': { w: 400, h: 500 },
    '16:9': { w: 640, h: 360 },
  };

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

  // ── Get preset context ──
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

  // ── Build image prompt from @img references ──
  const buildImageRefs = useCallback(() => {
    if (uploadedImages.length === 0) return '';
    return uploadedImages.map((_, i) => `@img${i + 1}`).join(', ') + ' attached as reference images';
  }, [uploadedImages]);

  // ── Generate hero image (Phase 10) ──
  const generateHeroImageForAd = useCallback(async (): Promise<string | null> => {
    if (!generateHeroImage || !campaign) return null;

    try {
      setGenerationProgress('Generating hero image...');
      let heroPrompt = `Hero image for: ${prompt.slice(0, 100)}`;
      if (heroImageStyle) {
        heroPrompt += ` in ${heroImageStyle} style`;
      }
      const result = await generateImage({
        prompt: heroPrompt,
        model: 'nano-banana-2',
        aspectRatio: aspectRatio,
        signal: undefined,
        onProgress: (msg) => setGenerationProgress(`Hero image: ${msg}`),
      });

      if (result.success && result.imageBase64) {
        return result.imageBase64;
      }
      return null;
    } catch (err) {
      console.warn('Hero image generation failed:', err);
      return null;
    }
  }, [generateHeroImage, campaign, prompt, aspectRatio, heroImageStyle]);

  // ── Save image to IndexedDB + update local state ──
  const persistImage = useCallback(async (image: StoredImage) => {
    await storage.saveImage(image);
    setStoredImages(prev => [image, ...prev]);
  }, []);

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
    const imageRefs = buildImageRefs();
    const presetContext = getPresetContext();
    imageCountRef.current += 1;
    const nextLabel = `Ad ${imageCountRef.current}`;
    const pipelineType = !useResearch ? 'direct' : (useHtmlLayout ? 'research-html-llm' : 'research-llm');
    const modelName = imageModel === 'nano-banana-2' ? 'Nano Banana 2' : 'Seedream 5 Lite';

    // ── PATH 3 (Default): User prompt → Image model ──
    if (!useResearch) {
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

      // Start hero image generation in parallel if enabled
      let heroImageBase64: string | null = null;
      let heroPromise: Promise<string | null> | null = null;
      if (generateHeroImage) {
        heroPromise = generateHeroImageForAd();
      }

      const result = await generateImage({
        prompt: finalImagePrompt,
        model: imageModel,
        aspectRatio,
        referenceImages: uploadedImages,
        onProgress: (msg) => setGenerationProgress(msg),
        onWarning: (msg) => setServerWarning(msg),
        onEtaUpdate: (secs) => setGenerationEta(secs),
      });

      // Wait for hero image if it was started
      if (heroPromise) {
        try {
          heroImageBase64 = await heroPromise;
        } catch (err) {
          console.warn('Hero image generation failed:', err);
        }
      }

      if (result.success && result.imageBase64) {
        const stored: StoredImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          imageBase64: result.imageBase64,
          prompt,
          imagePrompt: finalImagePrompt,
          model: imageModel,
          aspectRatio,
          pipeline: pipelineType,
          timestamp: Date.now(),
          label: nextLabel,
          referenceImageCount: uploadedImages.length,
          campaignId: campaign?.id,
          campaignBrand: campaign?.brand,
          heroImageBase64: heroImageBase64 || undefined,
        };
        await persistImage(stored);
        return true;
      } else {
        setGenerationProgress(result.error || 'Image generation failed');
        await new Promise(r => setTimeout(r, 3000));
        // Revert the label counter since this one failed
        imageCountRef.current -= 1;
        return false;
      }
    }

    // ── PATH 2: Research → LLM prompt → Image model ──
    else if (useResearch && !useHtmlLayout) {
      setGenerationProgress('Analyzing research...');
      const researchContext = getResearchContext();

      const llmPrompt = `You are an expert ad creative director. Based on this research about the target audience and product, create a detailed image generation prompt for an AI image model.

USER BRIEF: ${prompt}

${presetContext ? `BRAND:\n${presetContext}\n` : ''}
${researchContext ? `RESEARCH:\n${researchContext}\n` : ''}
${imageRefs ? `REFERENCE IMAGES: ${imageRefs}\n` : ''}

Create a single, detailed image prompt that would generate a compelling ${aspectRatio} ad creative.
The prompt should:
- Target the specific desires and pain points from research
- Use visual language the target audience relates to
- Include specific color, mood, lighting, and composition directions
- Reference any uploaded images as @img1, @img2 etc if provided

Output ONLY the image prompt, nothing else. No explanation.`;

      setGenerationProgress(`Thinking with ${llmModel}...`);

      try {
        const optimizedPrompt = await ollamaService.generateStream(
          llmPrompt,
          'You create image generation prompts. Output only the prompt text.',
          { model: llmModel }
        );

        const cleanPrompt = optimizedPrompt.trim();
        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const result = await generateImage({
          prompt: cleanPrompt,
          model: imageModel,
          aspectRatio,
          referenceImages: uploadedImages,
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
            referenceImageCount: uploadedImages.length,
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

    // ── PATH 1: Research → HTML Layout → Image model ──
    else if (useResearch && useHtmlLayout) {
      setGenerationProgress('Generating HTML layout...');
      const researchContext = getResearchContext();

      const htmlPrompt = `You are an elite ad layout designer. Generate a complete HTML ad layout.

USER BRIEF: ${prompt}

${presetContext ? `BRAND:\n${presetContext}\n` : ''}
${researchContext ? `RESEARCH:\n${researchContext}\n` : ''}

DIMENSIONS: ${aspectRatio} (${dim.w}x${dim.h}px)

Create a visually striking HTML layout for a ${aspectRatio} ad that:
- Addresses the top customer desire from research
- Has a bold headline that hooks in 0.5 seconds
- Uses the brand colors and typography
- Includes social proof elements
- Has a clear CTA
- Uses modern CSS (gradients, shadows, animations)
- Fills the entire ${dim.w}x${dim.h} container

Output ONLY the complete HTML document. Start with <!DOCTYPE html>.`;

      setGenerationProgress(`Creating layout with ${llmModel}...`);

      try {
        await ollamaService.generateStream(
          htmlPrompt,
          'You are a world-class ad designer. Output only valid HTML.',
          { model: llmModel }
        );

        setGenerationProgress('Layout created. Converting to image prompt...');

        const imagePromptFromLayout = `Based on this HTML ad layout design, create a polished, production-ready ad creative image.
Use the HTML layout as the base composition (@img1).
${uploadedImages.length > 0 ? `Product image is @img${uploadedImages.length > 0 ? '2' : '1'}.` : ''}
Style: photorealistic, polished, high-end advertising.
Make it look like a real, professional ad creative.`;

        setGenerationProgress(`Sending to ${modelName}...`);
        setServerWarning('');

        const result = await generateImage({
          prompt: imagePromptFromLayout,
          model: imageModel,
          aspectRatio,
          referenceImages: uploadedImages,
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
            referenceImageCount: uploadedImages.length,
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
        console.error('HTML layout generation failed:', err);
        setGenerationProgress('LLM failed — check Ollama connection');
        await new Promise(r => setTimeout(r, 2000));
        imageCountRef.current -= 1;
        return false;
      }
    }

    return false;
  }, [prompt, aspectRatio, campaign, imageModel, useResearch, useHtmlLayout, llmModel, uploadedImages, getResearchContext, getPresetContext, buildImageRefs, persistImage]);

  // ══════════════════════════════════════════════════════
  // ██  BATCH GENERATE — runs generateSingleImage N times
  // ══════════════════════════════════════════════════════
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    const count = batchCount;

    setIsGenerating(true);
    setSelectedImage(null);
    setGeneratingForPrompt(prompt.trim());
    setGenerationStartTime(Date.now());
    setGenerationElapsed(0);
    setGenerationEta(MODEL_ETAS[imageModel] || 30);
    setBatchCurrent(0);
    setBatchSuccesses(0);

    // Auto-scroll gallery to top so placeholder is visible
    requestAnimationFrame(() => {
      galleryScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    let successes = 0;
    try {
      for (let i = 0; i < count; i++) {
        setBatchCurrent(i + 1);
        setGenerationStartTime(Date.now());
        setGenerationElapsed(0);
        setGenerationEta(MODEL_ETAS[imageModel] || 30);

        if (count > 1) {
          setGenerationProgress(`Starting ${i + 1}/${count}...`);
        }

        const ok = await generateSingleImage();
        if (ok) successes++;

        // If server is down, don't keep trying
        if (!ok && i === 0) break;
      }
    } catch (err) {
      console.error('Batch generation failed:', err);
      setGenerationProgress('Generation failed. Try again.');
      await new Promise(r => setTimeout(r, 2000));
    } finally {
      setBatchSuccesses(successes);
      setIsGenerating(false);
      setGeneratingForPrompt(null);
      if (count > 1 && successes > 0) {
        setGenerationProgress(`Done — ${successes}/${count} generated`);
        await new Promise(r => setTimeout(r, 2000));
      }
      setGenerationProgress('');
      setBatchCurrent(0);
    }
  }, [prompt, isGenerating, batchCount, imageModel, generateSingleImage]);

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
    if (!useResearch) return 'Direct to image model';
    if (useHtmlLayout) return 'Research → HTML → Image model';
    return 'Research → Image model';
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
    <div className="h-full bg-[#f7f7f8] flex flex-col overflow-hidden">

      {/* ── Gallery / Canvas Area ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* ── Animated Dotted Grid Background ── */}
        <div className="absolute inset-0 nomad-grid-bg" />

        {/* ── Main Content Area ── */}
        <div ref={galleryScrollRef} className="flex-1 h-full overflow-y-auto px-6 py-6 relative z-10 bg-transparent">

          {/* ── Full Loading Screen (no images yet) ── */}
          {isGenerating && storedImages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="flex flex-col items-center gap-8 max-w-sm mx-auto text-center">
                <NomadIcon size={80} animated className="text-zinc-700" />
                <div className="h-10 flex items-center justify-center">
                  <RandomWordCycler interval={3000} className="text-xl text-zinc-500" />
                </div>
                <div className="w-64">
                  {batchCount > 1 && batchCurrent > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-zinc-600">{batchCurrent}/{batchCount}</span>
                      <div className="flex-1 h-1 bg-zinc-200 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-500 rounded-full transition-all duration-300" style={{ width: `${(batchCurrent / batchCount) * 100}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="w-full h-1 bg-zinc-200 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-zinc-600 rounded-full transition-all duration-500 ease-out" style={{ width: `${Math.min((generationElapsed / generationEta) * 100, 95)}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <ShineText className="text-[11px] truncate max-w-[180px]" speed={2.5}>{generationProgress}</ShineText>
                    <span className="text-[11px] text-zinc-400 flex-shrink-0 ml-2 tabular-nums">
                      {generationElapsed < generationEta ? `~${Math.max(generationEta - generationElapsed, 1)}s` : `${generationElapsed}s`}
                    </span>
                  </div>
                </div>
                {serverWarning && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
                    <span>&#9888;</span><span>{serverWarning}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Image Gallery ── */}
          {storedImages.length > 0 ? (
            <div>
              {/* ── Sticky Generation Banner (always visible when generating + images exist) ── */}
              {isGenerating && generatingForPrompt && (
                <div className="sticky top-0 z-20 -mx-6 px-6 pt-1 pb-3 mb-4 bg-gradient-to-b from-[#f7f7f8] via-[#f7f7f8] to-transparent">
                  <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] p-4 flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <NomadIcon size={36} animated className="text-zinc-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <ShineText className="text-sm font-medium truncate" speed={2.5}>
                          {generationProgress || 'Starting generation...'}
                        </ShineText>
                        {batchCount > 1 && batchCurrent > 0 && (
                          <span className="text-xs font-semibold text-zinc-500 flex-shrink-0">{batchCurrent}/{batchCount}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-zinc-600 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.min((generationElapsed / (generationEta || 30)) * 100, 95)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-zinc-400 flex-shrink-0 tabular-nums">
                          {generationElapsed < (generationEta || 30) ? `~${Math.max((generationEta || 30) - generationElapsed, 1)}s` : `${generationElapsed}s`}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-[10px] text-zinc-400 bg-zinc-50 px-2 py-1 rounded-lg font-medium">
                      {aspectRatio} · {imageModel === 'nano-banana-2' ? 'NB2' : 'SD5'}
                    </div>
                  </div>
                  {serverWarning && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-600 mt-2 ml-1">
                      <span>&#9888;</span><span>{serverWarning}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Header + filter */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Creatives
                  <span className="text-zinc-400 font-normal ml-1.5">{filteredImages.length}</span>
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFavoriteFilter(false)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${!favoriteFilter ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-600'}`}
                  >All</button>
                  <button
                    onClick={() => setFavoriteFilter(true)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 ${favoriteFilter ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:text-zinc-600'}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill={favoriteFilter ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    Saved
                  </button>
                </div>
              </div>

              {/* Placeholder group (when generating for a NEW prompt not in gallery yet) */}
              {isGenerating && generatingForPrompt && !groupedImages.some(([p]) => p === generatingForPrompt) && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2 px-0.5">
                    <p className="text-xs text-zinc-600 truncate font-medium max-w-[55%]" title={generatingForPrompt}>
                      {generatingForPrompt}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">{aspectRatio}</span>
                      <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">{modelDisplayName(imageModel)}</span>
                      <span className="text-[10px] text-zinc-400">now</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1 items-start">
                    <div className={`col-span-2 ${getAspectClass(aspectRatio)} relative rounded-xl overflow-hidden border-2 border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 via-white to-zinc-100 flex flex-col items-center justify-center gap-2 shadow-inner`}>
                      <NomadIcon size={28} animated className="text-zinc-400" />
                      <RandomWordCycler interval={2500} className="text-[10px] text-zinc-400 text-center px-2 leading-tight" />
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-200 overflow-hidden">
                        <div className="h-full bg-zinc-500 rounded-full transition-all duration-500" style={{ width: `${Math.min((generationElapsed / (generationEta || 30)) * 100, 95)}%` }} />
                      </div>
                      <span className="text-[9px] text-zinc-400 tabular-nums">
                        ~{Math.max((generationEta || 30) - generationElapsed, 1)}s
                      </span>
                    </div>
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
                      <p className="text-xs text-zinc-600 truncate font-medium max-w-[55%]" title={promptText}>
                        {promptText}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">{first.aspectRatio}</span>
                        <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">{modelDisplayName(first.model)}</span>
                        <span className="text-[10px] text-zinc-400">{formatTimeAgo(first.timestamp)}</span>
                      </div>
                    </div>

                    {/* Image grid — ~12 per row at xl, compact */}
                    <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1 items-start">
                      {/* Placeholder card (generating for this group) */}
                      {isGeneratingForThisGroup && (
                        <div className={`col-span-2 ${getAspectClass(aspectRatio)} relative rounded-xl overflow-hidden border-2 border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 via-white to-zinc-100 flex flex-col items-center justify-center gap-2 shadow-inner`}>
                          <NomadIcon size={28} animated className="text-zinc-400" />
                          <RandomWordCycler interval={2500} className="text-[10px] text-zinc-400 text-center px-2 leading-tight" />
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-200 overflow-hidden">
                            <div className="h-full bg-zinc-500 rounded-full transition-all duration-500" style={{ width: `${Math.min((generationElapsed / (generationEta || 30)) * 100, 95)}%` }} />
                          </div>
                          <span className="text-[9px] text-zinc-400 tabular-nums">
                            ~{Math.max((generationEta || 30) - generationElapsed, 1)}s
                          </span>
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
          ) : !isGenerating ? (
            /* ── Empty State ── */
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center min-h-[400px]">
              <div className="w-20 h-20 rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] border border-dashed border-zinc-200 flex items-center justify-center">
                <NomadIcon size={32} className="text-zinc-300" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Generate winning ad creatives</p>
                <p className="text-xs text-zinc-400 mt-1">
                  {hasContext ? 'Research data ready — generation will use your insights' : 'Describe your ad or run research first for smarter output'}
                </p>
              </div>
            </div>
          ) : null}
        </div>

      </div>

      {/* ── Bottom Bar ── */}
      <div className="flex-shrink-0 border-t border-zinc-200/80 bg-white px-6 py-4 shadow-[0_-2px_8px_rgba(0,0,0,0.03),0_-4px_16px_rgba(0,0,0,0.04)]">
        {/* Mode Tabs */}
        <div className="flex justify-center gap-2 mb-4">
          {modes.map((mode) => (
            <button
              key={mode.key}
              onClick={() => setActiveMode(mode.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                activeMode === mode.key
                  ? 'bg-zinc-900 text-white shadow-[0_1px_3px_rgba(0,0,0,0.2),0_2px_6px_rgba(0,0,0,0.1)] -translate-y-px'
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
          <div className="bg-zinc-50 rounded-2xl border border-zinc-200/80 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.03)] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.04)] transition-shadow duration-200" onDragOver={handleImageDragOver} onDrop={handleImageDrop}>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={useResearch
                ? 'Describe your ad concept... Research will enhance the prompt'
                : 'Describe your ad — paste or drop images to use as reference'}
              rows={3}
              className="w-full px-5 py-4 bg-transparent resize-none text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none"
            />

            {/* Uploaded Images - Display as chips */}
            {uploadedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 pb-3 border-t border-zinc-100 pt-2">
                {uploadedImages.map((img, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 pl-1 pr-2.5 py-1 rounded-full text-xs font-medium border border-blue-200">
                    <img
                      src={img}
                      alt={`@img${idx + 1}`}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    <span>@img{idx + 1}</span>
                    <button
                      onClick={() => removeUploadedImage(idx)}
                      className="ml-0.5 text-blue-400 hover:text-blue-700 cursor-pointer text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Row: Context chips + Controls */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-100">
              <div className="flex items-center gap-2">
                {/* Pipeline label */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 text-zinc-500 rounded-full text-[10px] font-medium">
                  <span className={`w-1.5 h-1.5 rounded-full ${freepikReady ? 'bg-emerald-500' : freepikReady === false ? 'bg-red-400' : 'bg-zinc-300'}`} />
                  {getPipelineLabel()}
                </span>

                {/* Research status chips */}
                {useResearch && researchComplete && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Research
                  </span>
                )}
                {useResearch && tasteComplete && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-full text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    Taste
                  </span>
                )}

                {/* Upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2 py-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full text-[11px] transition-colors"
                  title="Upload reference image"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                  Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-3">
                {/* Settings Gear */}
                <button
                  ref={settingsButtonRef}
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1M5.636 5.636l.707.707m11.314 11.314l.707.707M5.636 18.364l.707-.707m11.314-11.314l.707-.707" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>

                {/* Settings Popover — Portal */}
                {showSettings &&
                  createPortal(
                    <div
                      ref={popoverRef}
                      className="fixed w-80 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] p-5 z-[9999] flex flex-col max-h-[70vh] overflow-y-auto"
                      style={{
                        bottom: `${popoverPos.bottom}px`,
                        right: `${popoverPos.right}px`,
                      }}
                    >
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

                      <div className="space-y-4">

                        {/* IMAGE MODEL (always visible) */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-3">Image Model</p>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-zinc-600">Model</span>
                            <select
                              value={imageModel}
                              onChange={(e) => setImageModel(e.target.value)}
                              className="text-sm font-medium text-zinc-800 bg-white border border-zinc-300 rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 cursor-pointer"
                            >
                              <option value="nano-banana-2">Google Nano Banana 2</option>
                              <option value="seedream-5-lite">Seedream 5 Lite</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-600">Aspect ratio</span>
                            <select
                              value={aspectRatio}
                              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                              className="text-sm font-medium text-zinc-800 bg-white border border-zinc-300 rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 cursor-pointer"
                            >
                              <option value="9:16">9:16 Story</option>
                              <option value="4:5">4:5 Post</option>
                              <option value="1:1">1:1 Square</option>
                              <option value="16:9">16:9 Wide</option>
                            </select>
                          </div>
                        </div>

                        {/* HERO IMAGE GENERATION */}
                        <div className="border-t border-zinc-100 pt-4">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-3">Hero Image</p>

                          {/* Generate hero image toggle */}
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-zinc-600">Auto-generate hero</span>
                            <button
                              onClick={() => setGenerateHeroImage(!generateHeroImage)}
                              className={`relative w-10 h-6 rounded-full transition-colors ${generateHeroImage ? 'bg-blue-500' : 'bg-zinc-300'}`}
                            >
                              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${generateHeroImage ? 'left-5' : 'left-1'}`} />
                            </button>
                          </div>

                          {/* Hero image style (only if toggle ON) */}
                          {generateHeroImage && (
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-zinc-600">Style</span>
                                <select
                                  value={heroImageStyle}
                                  onChange={(e) => setHeroImageStyle(e.target.value)}
                                  className="text-xs font-medium text-zinc-800 bg-white border border-zinc-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-500 cursor-pointer"
                                >
                                  <option value="">Auto-detect</option>
                                  <option value="photorealistic">Photorealistic</option>
                                  <option value="illustration">Illustration</option>
                                  <option value="3d">3D Render</option>
                                  <option value="minimalist">Minimalist</option>
                                  <option value="watercolor">Watercolor</option>
                                  <option value="lifestyle">Lifestyle</option>
                                </select>
                              </div>
                              <p className="text-[10px] text-zinc-400 mt-2">Hero image generation adds ~30-60 seconds per ad</p>
                            </div>
                          )}
                        </div>

                        {/* RESEARCH PIPELINE */}
                        <div className="border-t border-zinc-100 pt-4">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-3">Pipeline</p>

                          {/* Use Research toggle */}
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <span className="text-sm text-zinc-600">Use research</span>
                              {!hasResearchData && useResearch && (
                                <p className="text-[10px] text-amber-500 mt-0.5">No research data yet</p>
                              )}
                            </div>
                            <button
                              onClick={() => setUseResearch(!useResearch)}
                              className={`relative w-10 h-6 rounded-full transition-colors ${useResearch ? 'bg-blue-500' : 'bg-zinc-300'}`}
                            >
                              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${useResearch ? 'left-5' : 'left-1'}`} />
                            </button>
                          </div>

                          {/* HTML Layout toggle (only if research ON) */}
                          {useResearch && (
                            <div className="flex items-center justify-between mb-3 pl-3 border-l-2 border-blue-200">
                              <div>
                                <span className="text-sm text-zinc-600">HTML layout first</span>
                                <p className="text-[10px] text-zinc-400">LLM creates layout → @img1</p>
                              </div>
                              <button
                                onClick={() => setUseHtmlLayout(!useHtmlLayout)}
                                className={`relative w-10 h-6 rounded-full transition-colors ${useHtmlLayout ? 'bg-blue-500' : 'bg-zinc-300'}`}
                              >
                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${useHtmlLayout ? 'left-5' : 'left-1'}`} />
                              </button>
                            </div>
                          )}

                          {/* LLM Model (only if research ON) */}
                          {useResearch && (
                            <div className="flex items-center justify-between mb-3 pl-3 border-l-2 border-blue-200">
                              <span className="text-sm text-zinc-600">LLM</span>
                              <select
                                value={llmModel}
                                onChange={(e) => setLlmModel(e.target.value)}
                                className="text-xs font-medium text-zinc-800 bg-white border border-zinc-300 rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
                              >
                                <option value="gpt-oss:20b">GPT-OSS 20B</option>
                                <option value="glm-4.7-flash:q4_K_M">GLM 4.7 Flash</option>
                                <option value="qwen:20b">Qwen 20B</option>
                              </select>
                            </div>
                          )}

                          {/* Research Summary (collapsible) */}
                          {useResearch && hasResearchData && (
                            <>
                              <button
                                onClick={() => setShowResearchSummary(!showResearchSummary)}
                                className="w-full text-left text-xs text-blue-600 hover:text-blue-700 mb-2 font-medium transition-colors pl-3"
                              >
                                {showResearchSummary ? '▼' : '▶'} View research summary
                              </button>
                              {showResearchSummary && currentCycle?.researchFindings && (
                                <div className="bg-blue-50 rounded-lg p-3 text-[11px] text-zinc-700 space-y-1.5 border border-blue-200 ml-3">
                                  {currentCycle.researchFindings.deepDesires?.length > 0 && (
                                    <div><span className="font-semibold text-blue-700">Desires:</span> {currentCycle.researchFindings.deepDesires.length}</div>
                                  )}
                                  {currentCycle.researchFindings.objections?.length > 0 && (
                                    <div><span className="font-semibold text-blue-700">Objections:</span> {currentCycle.researchFindings.objections.length}</div>
                                  )}
                                  {currentCycle.researchFindings.avatarLanguage?.length > 0 && (
                                    <div><span className="font-semibold text-blue-700">Language:</span> {currentCycle.researchFindings.avatarLanguage.length} samples</div>
                                  )}
                                  {currentCycle.researchFindings.whereAudienceCongregates?.length > 0 && (
                                    <div><span className="font-semibold text-blue-700">Platforms:</span> {currentCycle.researchFindings.whereAudienceCongregates.length}</div>
                                  )}
                                  {currentCycle.researchFindings.competitorWeaknesses?.length > 0 && (
                                    <div><span className="font-semibold text-blue-700">Gaps:</span> {currentCycle.researchFindings.competitorWeaknesses.length}</div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* PIPELINE SUMMARY */}
                        <div className="border-t border-zinc-100 pt-3">
                          <div className="bg-zinc-50 rounded-lg p-3 text-[11px] text-zinc-500 leading-relaxed">
                            {!useResearch && (
                              <span>Your prompt → <strong className="text-zinc-700">{imageModel === 'nano-banana-2' ? 'Nano Banana 2' : 'Seedream 5 Lite'}</strong> → Ad creative</span>
                            )}
                            {useResearch && !useHtmlLayout && (
                              <span>Research → <strong className="text-zinc-700">LLM</strong> optimizes prompt → <strong className="text-zinc-700">{imageModel === 'nano-banana-2' ? 'Nano Banana 2' : 'Seedream 5 Lite'}</strong> → Ad creative</span>
                            )}
                            {useResearch && useHtmlLayout && (
                              <span>Research → <strong className="text-zinc-700">LLM</strong> → HTML layout (@img1) → <strong className="text-zinc-700">{imageModel === 'nano-banana-2' ? 'Nano Banana 2' : 'Seedream 5 Lite'}</strong> → Ad creative</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}

                {/* Generate Button with batch count */}
                <div className="flex items-center gap-0">
                  {/* Batch stepper — only shows when > 1 */}
                  {batchCount > 1 && (
                    <button
                      onClick={() => setBatchCount(Math.max(1, batchCount - 1))}
                      disabled={isGenerating}
                      className="w-7 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-50"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
                    </button>
                  )}
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className={`h-10 rounded-full flex items-center justify-center gap-1.5 transition-all duration-200 ${
                      batchCount > 1 ? 'px-4' : 'w-10'
                    } ${
                      isGenerating || !prompt.trim()
                        ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                        : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-[0_1px_3px_rgba(0,0,0,0.2),0_2px_6px_rgba(0,0,0,0.1)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.25),0_4px_12px_rgba(0,0,0,0.12)] hover:-translate-y-px active:translate-y-0 active:shadow-[0_1px_2px_rgba(0,0,0,0.15)]'
                    }`}
                  >
                    {isGenerating ? (
                      <NomadIcon size={18} animated className="text-white" />
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L12 22M12 2L5 9M12 2L19 9" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {batchCount > 1 && (
                          <span className="text-xs font-semibold">×{batchCount}</span>
                        )}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setBatchCount(Math.min(8, batchCount + 1))}
                    disabled={isGenerating}
                    className="w-7 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-50"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Keyboard hint */}
          <p className="text-center text-[11px] text-zinc-400 mt-2">
            ⌘ + Enter to generate
          </p>
        </div>
      </div>

      {/* ── Detail Modal (replaces sidebar) ── */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setSelectedImage(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] max-w-5xl w-full max-h-[90vh] overflow-hidden flex"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className="flex-1 bg-zinc-50 flex items-center justify-center p-6 min-w-0">
              <img
                src={`data:image/png;base64,${selectedImage.imageBase64}`}
                alt={selectedImage.label}
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm"
              />
            </div>

            {/* Info sidebar */}
            <div className="w-72 border-l border-zinc-200 p-5 overflow-y-auto flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-zinc-900">{selectedImage.label}</h3>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-zinc-50 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-0.5">Model</p>
                    <p className="text-[11px] font-medium text-zinc-700">{modelDisplayName(selectedImage.model)}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-0.5">Ratio</p>
                    <p className="text-[11px] font-medium text-zinc-700">{selectedImage.aspectRatio}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-0.5">Pipeline</p>
                    <p className="text-[11px] font-medium text-zinc-700">{pipelineDisplayName(selectedImage.pipeline)}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-0.5">Refs</p>
                    <p className="text-[11px] font-medium text-zinc-700">{selectedImage.referenceImageCount || 'None'}</p>
                  </div>
                </div>

                {selectedImage.campaignBrand && (
                  <div className="bg-zinc-50 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-0.5">Campaign</p>
                    <p className="text-[11px] font-medium text-zinc-700">{selectedImage.campaignBrand}</p>
                  </div>
                )}

                <div className="bg-zinc-50 rounded-lg p-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">Prompt</p>
                  <p className="text-[11px] text-zinc-600 leading-relaxed">{selectedImage.prompt}</p>
                </div>

                {selectedImage.imagePrompt && selectedImage.imagePrompt !== selectedImage.prompt && (
                  <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100">
                    <p className="text-[9px] uppercase tracking-wider text-blue-400 font-semibold mb-1">Final Prompt</p>
                    <p className="text-[11px] text-blue-700 leading-relaxed">{selectedImage.imagePrompt}</p>
                  </div>
                )}

                <div className="bg-zinc-50 rounded-lg p-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-0.5">Created</p>
                  <p className="text-[11px] text-zinc-600">{new Date(selectedImage.timestamp).toLocaleString()}</p>
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
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
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
                        ? 'text-red-500 bg-red-50 hover:bg-red-100'
                        : 'text-zinc-500 bg-zinc-100 hover:bg-zinc-200'
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={selectedImage.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { removeImage(selectedImage.id); setSelectedImage(null); }}
                    className="flex items-center justify-center px-3 py-2 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
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
    </div>
  );
}
