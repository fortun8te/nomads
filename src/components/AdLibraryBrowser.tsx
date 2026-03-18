import React, { useState, useEffect, useRef } from 'react';
import { loadAdLibraryManifest, loadAdImageBase64, downloadImage } from '../utils/adLibraryLoader';
import { getCache } from '../utils/adLibraryCache';
import { ollamaService } from '../utils/ollama';
import { getVisionModel } from '../utils/modelConfig';
import { useCampaign } from '../context/CampaignContext';
import type { AdLibraryImage } from '../types';

interface AdLibraryBrowserProps {
  onClose: () => void;
  theme: 'light' | 'dark';
  onUseAsTemplate?: (html: string, label: string) => void;
  onReferenceLayout?: (imageBase64: string, description: string, category: string) => void;
  onCopyTarget?: (imageBase64: string, description: string, category: string, filename: string, path: string) => void;
}

const AD_LIBRARY_CATEGORIES = [
  { key: 'product-hero', label: 'Product Hero', count: 72 },
  { key: 'features-benefits', label: 'Features & Benefits', count: 45 },
  { key: 'lifestyle', label: 'Lifestyle', count: 33 },
  { key: 'social-proof', label: 'Social Proof', count: 22 },
  { key: 'testimonial', label: 'Testimonial', count: 20 },
  { key: 'problem-solution', label: 'Problem-Solution', count: 20 },
  { key: 'comparison', label: 'Comparison', count: 12 },
  { key: 'deals-offers', label: 'Deals & Offers', count: 15 },
  { key: 'before-after', label: 'Before/After', count: 6 },
  { key: 'template', label: 'Template', count: 3 },
];

const AD_LIBRARY_ASPECT_RATIOS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: '1:1', label: 'Square', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="1"/></svg> },
  { key: '9:16', label: 'Portrait', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> },
  { key: '16:9', label: 'Landscape', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 16l5-5 3 3 4-4 8 8"/></svg> },
  { key: '4:3', label: '4:3', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="18" rx="2"/></svg> },
  { key: '3:4', label: 'Tall', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="1"/></svg> },
];

// Extract 4 keywords from a description for hover preview
function extractKeywords(desc: string): string[] {
  const keywords: string[] = [];
  // Extract MOOD
  const moodMatch = desc.match(/MOOD:\s*([^.]+)/i);
  if (moodMatch) keywords.push(moodMatch[1].trim().split(',')[0].trim());
  // Extract layout style
  const layoutMatch = desc.match(/LAYOUT:\s*([^.]+)/i);
  if (layoutMatch) {
    const layout = layoutMatch[1].trim().toLowerCase();
    if (layout.includes('split')) keywords.push('Split Layout');
    else if (layout.includes('grid')) keywords.push('Grid Layout');
    else if (layout.includes('hero')) keywords.push('Hero Layout');
    else if (layout.includes('minimal')) keywords.push('Minimal');
    else if (layout.includes('full')) keywords.push('Full Bleed');
    else keywords.push(layoutMatch[1].trim().split(/[,.]/)[0].slice(0, 20));
  }
  // Extract dominant color
  const colorMatch = desc.match(/COLORS?:\s*([^.]+)/i);
  if (colorMatch) {
    const colors = colorMatch[1].trim().split(',')[0].trim();
    keywords.push(colors.slice(0, 18));
  }
  // Extract CTA style
  const ctaMatch = desc.match(/CTA:\s*([^.]+)/i);
  if (ctaMatch) keywords.push(ctaMatch[1].trim().split(',')[0].slice(0, 18));
  return keywords.slice(0, 4);
}

export function AdLibraryBrowser({ onClose, theme, onReferenceLayout, onCopyTarget }: AdLibraryBrowserProps) {
  const { campaign } = useCampaign();
  const [selectedCategory, setSelectedCategory] = useState<string>('product-hero');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | null>(null);
  const [allImages, setAllImages] = useState<AdLibraryImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<(AdLibraryImage & { id?: string; base64?: string }) | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [descriptions, setDescriptions] = useState<Record<string, any>>({});
  const [view, setView] = useState<'library' | 'saved' | 'upload'>('library');
  const [savedAds, setSavedAds] = useState<any[]>([]);
  const [_uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [_analyzeAbortRef] = useState({ signal: null as AbortSignal | null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  // Load manifest and descriptions on mount
  useEffect(() => {
    (async () => {
      const manifest = await loadAdLibraryManifest();
      setAllImages(manifest.images);

      // Load descriptions from cache
      const cache = await getCache();
      if (cache) {
        const descMap: Record<string, any> = {};
        cache.descriptions.forEach((desc: any) => {
          descMap[desc.filename] = desc;
        });
        setDescriptions(descMap);
      }

      // Load saved ads for this brand from localStorage
      if (campaign) {
        const saved = localStorage.getItem(`saved-ads-${campaign.id}`);
        if (saved) {
          setSavedAds(JSON.parse(saved));
        }
      }

      setLoading(false);
    })();
  }, [campaign]);

  // Load image base64 when image is selected
  useEffect(() => {
    if (!selectedImage) {
      setSelectedImageBase64(null);
      return;
    }
    (async () => {
      const base64 = await loadAdImageBase64(selectedImage.path);
      setSelectedImageBase64(base64);
    })();
  }, [selectedImage]);

  // Filter images by category and aspect ratio
  const displayedImages = allImages.filter(img => {
    const categoryMatch = selectedCategory === 'all' || img.category === selectedCategory;
    // Aspect ratio filtering
    const aspectRatioMatch = !selectedAspectRatio || img.aspectRatio === selectedAspectRatio;
    return categoryMatch && aspectRatioMatch;
  });

  // Handle custom ad upload and analysis
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(file);
    setUploadProgress('Reading file...');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        if (!base64) return;

        const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

        setUploadProgress('Analyzing with minicpm...');

        // Analyze with minicpm using same prompt as library analysis
        const desc = await ollamaService.generateStream(
          `Describe this ad's design in detail so someone could recreate it in HTML/CSS. Include ALL of these:

LAYOUT: Exact structure (e.g. "full-bleed dark background, product centered in top 60%, text block bottom 40%")
PRODUCT: Size relative to ad (e.g. "product takes up ~50% of height, centered horizontally"), styling (shadow, angle, background behind it)
HEADLINE: Exact text if readable, font style (bold/light/serif/sans), approximate size relative to ad width, color, position
SUBTEXT: Any supporting text, size relative to headline, color
CTA: Button or text, color, shape, position, text content if readable
COLORS: List exact colors you see (e.g. "background: deep navy #1a1a3e, headline: white, accent: coral/orange")
SPACING: How much whitespace/breathing room, padding from edges
MOOD: Premium/playful/clinical/bold/minimal/energetic

Be specific enough that this description alone could be used as a prompt to generate an identical ad layout.`,
          'Describe this ad design in reproducible detail for HTML/CSS recreation.',
          { model: getVisionModel(), images: [rawBase64] }
        );

        setUploadProgress('Categorizing ad...');

        // Simple categorization based on description
        const descLower = desc.toLowerCase();
        let category = 'product-hero';
        if (descLower.includes('before') || descLower.includes('after')) category = 'before-after';
        else if (descLower.includes('vs') || descLower.includes('comparison')) category = 'comparison';
        else if (descLower.includes('deal') || descLower.includes('offer') || descLower.includes('price')) category = 'deals-offers';
        else if (descLower.includes('review') || descLower.includes('testimonial') || descLower.includes('quote')) category = 'testimonial';
        else if (descLower.includes('problem') || descLower.includes('solution')) category = 'problem-solution';
        else if (descLower.includes('social') || descLower.includes('proof') || descLower.includes('rating')) category = 'social-proof';
        else if (descLower.includes('lifestyle') || descLower.includes('model') || descLower.includes('person')) category = 'lifestyle';
        else if (descLower.includes('feature') || descLower.includes('benefit') || descLower.includes('ingredient')) category = 'features-benefits';

        const newAd = {
          id: `custom-${Date.now()}`,
          filename: file.name,
          category,
          description: desc.trim(),
          base64: base64,
          uploadedAt: Date.now(),
          brandId: campaign?.id,
        };

        // Save to localStorage
        const updated = [...savedAds, newAd];
        setSavedAds(updated);
        if (campaign) {
          localStorage.setItem(`saved-ads-${campaign.id}`, JSON.stringify(updated));
        }

        setUploadingFile(null);
        setUploadProgress('');
        setSelectedImage(newAd as any);
        setView('saved');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error analyzing custom ad:', error);
      setUploadProgress(`Error: ${String(error).slice(0, 50)}`);
    }
  };

  const saveCurrentLibraryAd = () => {
    if (!selectedImage || !campaign) return;
    const newAd = {
      id: `saved-${Date.now()}`,
      filename: selectedImage.filename,
      category: selectedImage.category,
      description: descriptions[selectedImage.filename]?.description || '',
      base64: selectedImageBase64,
      librarySource: true,
      savedAt: Date.now(),
      brandId: campaign.id,
    };
    const updated = [...savedAds, newAd];
    setSavedAds(updated);
    localStorage.setItem(`saved-ads-${campaign.id}`, JSON.stringify(updated));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className={`relative z-10 h-full flex flex-col m-4 rounded-2xl overflow-hidden ${
        isDark ? 'bg-zinc-900 border border-zinc-700/50' : 'bg-white border border-zinc-200'
      }`} style={{ position: 'relative' }}>
        {/* Header */}
        <div className={`flex-shrink-0 border-b ${
          isDark ? 'border-zinc-700/50' : 'border-zinc-200'
        }`}>
          <div className={`px-6 py-4 flex items-center justify-between`}>
            <h2 className={`text-lg font-bold flex items-center gap-2 ${
              isDark ? 'text-zinc-100' : 'text-zinc-900'
            }`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Ad Library
            </h2>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Tabs */}
          <div className={`flex gap-0 px-2 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-100/50'}`}>
            <button
              onClick={() => setView('library')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                view === 'library'
                  ? isDark ? 'border-blue-500 text-white' : 'border-blue-500 text-zinc-900'
                  : isDark ? 'border-transparent text-zinc-400' : 'border-transparent text-zinc-600'
              }`}
            >
              Library ({allImages.length})
            </button>
            <button
              onClick={() => setView('saved')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                view === 'saved'
                  ? isDark ? 'border-blue-500 text-white' : 'border-blue-500 text-zinc-900'
                  : isDark ? 'border-transparent text-zinc-400' : 'border-transparent text-zinc-600'
              }`}
            >
              Saved ({savedAds.length})
            </button>
            <button
              onClick={() => { setView('upload'); fileInputRef.current?.click(); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                view === 'upload'
                  ? isDark ? 'border-blue-500 text-white' : 'border-blue-500 text-zinc-900'
                  : isDark ? 'border-transparent text-zinc-400' : 'border-transparent text-zinc-600'
              }`}
            >
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left sidebar - Categories & Aspect Ratios (only in library view) */}
          {view === 'library' && (
            <div className={`w-48 border-r flex flex-col overflow-y-auto ${
              isDark ? 'border-zinc-700/50 bg-zinc-800/30' : 'border-zinc-200 bg-zinc-50'
            }`}>
              {/* Categories Section */}
              <div className={`px-2 py-3 border-b ${isDark ? 'border-zinc-700/30' : 'border-zinc-200'}`}>
                <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Categories
                </div>
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors rounded mb-1 ${
                    selectedCategory === 'all'
                      ? isDark ? 'bg-blue-600/40 text-white' : 'bg-blue-100 text-blue-900'
                      : isDark ? 'text-zinc-300 hover:bg-zinc-700/30' : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  All Categories
                </button>
                {AD_LIBRARY_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors rounded mb-1 ${
                      selectedCategory === cat.key
                        ? isDark ? 'bg-blue-600/40 text-white font-medium' : 'bg-blue-100 text-blue-900 font-medium'
                        : isDark ? 'text-zinc-300 hover:bg-zinc-700/30' : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="font-medium truncate">{cat.label}</div>
                    <div className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{cat.count}</div>
                  </button>
                ))}
              </div>

              {/* Aspect Ratios Section */}
              <div className={`px-2 py-3`}>
                <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Aspect Ratios
                </div>
                <button
                  onClick={() => setSelectedAspectRatio(null)}
                  className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors rounded mb-1 ${
                    !selectedAspectRatio
                      ? isDark ? 'bg-amber-600/40 text-white' : 'bg-amber-100 text-amber-900'
                      : isDark ? 'text-zinc-300 hover:bg-zinc-700/30' : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  All Ratios
                </button>
                {AD_LIBRARY_ASPECT_RATIOS.map(ratio => (
                  <button
                    key={ratio.key}
                    onClick={() => setSelectedAspectRatio(ratio.key)}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors rounded mb-1 flex items-center gap-2 ${
                      selectedAspectRatio === ratio.key
                        ? isDark ? 'bg-amber-600/40 text-white font-medium' : 'bg-amber-100 text-amber-900 font-medium'
                        : isDark ? 'text-zinc-300 hover:bg-zinc-700/30' : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <span>{ratio.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium">{ratio.label}</div>
                      <div className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{ratio.key}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Center - Grid of images or saved ads */}
          <div className="flex-1 overflow-y-auto p-4">
            {view === 'library' && (
              <>
                {loading ? (
                  <div className={`flex items-center justify-center h-full ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Loading...
                  </div>
                ) : displayedImages.length === 0 ? (
                  <div className={`flex items-center justify-center h-full ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    No images in this category
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2">
                    {displayedImages.map(img => (
                      <button
                        key={img.filename}
                        onClick={() => setSelectedImage(img)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer group ${
                          selectedImage?.filename === img.filename
                            ? isDark ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-blue-500 ring-2 ring-blue-400/30'
                            : isDark ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        <img
                          src={`/ad-library/${img.path}`}
                          alt={img.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex flex-col justify-end p-1.5 opacity-0 group-hover:opacity-100`}>
                          {(() => {
                            const desc = descriptions[img.filename]?.description;
                            const kw = desc ? extractKeywords(desc) : [];
                            return kw.length > 0 ? (
                              <div className="flex flex-wrap gap-0.5 mb-0.5">
                                {kw.map((k, i) => (
                                  <span key={i} className="text-[7px] px-1 py-0.5 rounded bg-white/20 text-white backdrop-blur-sm leading-tight">
                                    {k}
                                  </span>
                                ))}
                              </div>
                            ) : null;
                          })()}
                          <span className={`text-[8px] px-1 py-0.5 rounded bg-black/60 text-white truncate w-full text-center`}>
                            {img.category}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === 'saved' && (
              <>
                {savedAds.length === 0 ? (
                  <div className={`flex items-center justify-center h-full text-center ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    <div>
                      <p className="mb-2">No saved ads yet</p>
                      <p className="text-xs">Upload or save from library</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    {savedAds.map(ad => (
                      <button
                        key={ad.id}
                        onClick={() => setSelectedImage(ad as any)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer group ${
                          selectedImage?.id === ad.id
                            ? isDark ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-blue-500 ring-2 ring-blue-400/30'
                            : isDark ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        {ad.base64 && (
                          <img
                            src={ad.base64}
                            alt={ad.filename}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-end p-1`}>
                          <span className={`text-[7px] px-1 py-0.5 rounded bg-black/60 text-white truncate w-full text-center`}>
                            {ad.category}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === 'upload' && (
              <div className={`flex items-center justify-center h-full ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {uploadProgress ? (
                  <div className="text-center">
                    <div className="mb-2 animate-spin"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg></div>
                    <p>{uploadProgress}</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="mb-2">Click "Upload" to select an image</p>
                    <p className="text-xs">Will analyze with minicpm and auto-categorize</p>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Detail popup modal with blur backdrop — absolute to stay within modal container */}
      {selectedImage && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" onClick={() => setSelectedImage(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <div
            onClick={e => e.stopPropagation()}
            className={`relative z-50 w-[520px] max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col ${
              isDark ? 'bg-zinc-900 border border-zinc-700/50' : 'bg-white border border-zinc-200'
            }`}
          >
            {/* Modal header */}
            <div className={`flex items-center justify-between px-5 py-3 border-b flex-shrink-0 ${
              isDark ? 'border-zinc-700/50' : 'border-zinc-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                  isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                }`}>
                  {AD_LIBRARY_CATEGORIES.find(c => c.key === selectedImage.category)?.label || selectedImage.category}
                </span>
                {selectedImage.aspectRatio && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    isDark ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    {selectedImage.aspectRatio}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Large image preview */}
              <div className="flex justify-center">
                {selectedImage.base64 ? (
                  <img
                    src={selectedImage.base64}
                    alt={selectedImage.filename}
                    className="max-h-[340px] rounded-xl border object-contain"
                  />
                ) : selectedImageBase64 ? (
                  <img
                    src={selectedImageBase64}
                    alt={selectedImage.filename}
                    className="max-h-[340px] rounded-xl border object-contain"
                  />
                ) : (
                  <div className={`w-full aspect-square max-h-[340px] rounded-xl border-2 border-dashed flex items-center justify-center ${
                    isDark ? 'border-zinc-700 bg-zinc-900/50' : 'border-zinc-300 bg-zinc-100/50'
                  }`}>
                    <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Loading...</span>
                  </div>
                )}
              </div>

              {/* Keywords row */}
              {(() => {
                const desc = descriptions[selectedImage.filename]?.description || (selectedImage as any).description;
                const kw = desc ? extractKeywords(desc) : [];
                return kw.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {kw.map((k, i) => (
                      <span key={i} className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${
                        isDark ? 'bg-zinc-800 text-zinc-300 border border-zinc-700' : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                      }`}>
                        {k}
                      </span>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* Description */}
              {(() => {
                const desc = descriptions[selectedImage.filename]?.description || (selectedImage as any).description;
                if (!desc) return null;
                // Parse sections from the description
                const sections: { label: string; text: string }[] = [];
                const labels = ['LAYOUT', 'PRODUCT', 'HEADLINE', 'SUBTEXT', 'CTA', 'COLORS', 'SPACING', 'MOOD'];
                labels.forEach(label => {
                  const regex = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=${labels.filter(l => l !== label).map(l => l + ':').join('|')}|$)`, 'i');
                  const match = desc.match(regex);
                  if (match && match[1].trim()) {
                    sections.push({ label, text: match[1].trim() });
                  }
                });
                return sections.length > 0 ? (
                  <div className={`rounded-xl p-4 space-y-3 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Design Breakdown
                    </span>
                    {sections.map(s => (
                      <div key={s.label}>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${
                          s.label === 'COLORS' ? (isDark ? 'text-amber-400' : 'text-amber-600')
                          : s.label === 'MOOD' ? (isDark ? 'text-purple-400' : 'text-purple-600')
                          : s.label === 'CTA' ? (isDark ? 'text-green-400' : 'text-green-600')
                          : isDark ? 'text-zinc-500' : 'text-zinc-400'
                        }`}>
                          {s.label}
                        </span>
                        <p className={`text-[10px] leading-relaxed mt-0.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                          {s.text.slice(0, 200)}{s.text.length > 200 ? '...' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : desc ? (
                  <div className={`rounded-xl p-4 ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                    <span className={`text-[10px] uppercase font-bold tracking-wider block mb-2 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Description
                    </span>
                    <p className={`text-[10px] leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {desc.slice(0, 400)}{desc.length > 400 ? '...' : ''}
                    </p>
                  </div>
                ) : null;
              })()}

              {/* Filename */}
              <code className={`text-[9px] break-all block text-center ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {selectedImage.filename}
              </code>
            </div>

            {/* Modal footer actions */}
            <div className={`flex gap-2 px-5 py-3 border-t flex-shrink-0 ${
              isDark ? 'border-zinc-700/50 bg-zinc-900' : 'border-zinc-200 bg-zinc-50'
            }`}>
              {view === 'library' && !selectedImage.id?.startsWith('saved') && (
                <>
                  <button
                    onClick={saveCurrentLibraryAd}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isDark
                        ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                    }`}
                  >
                    Save
                  </button>
                  {onReferenceLayout && selectedImageBase64 && (
                    <button
                      onClick={() => {
                        const desc = descriptions[selectedImage.filename]?.description || (selectedImage as any).description || '';
                        onReferenceLayout(selectedImageBase64, desc, selectedImage.category);
                        onClose();
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        isDark
                          ? 'bg-purple-600/80 text-white hover:bg-purple-600'
                          : 'bg-purple-500 text-white hover:bg-purple-600'
                      }`}
                    >
                      Reference this layout
                    </button>
                  )}
                  {onCopyTarget && selectedImageBase64 && (
                    <button
                      onClick={() => {
                        const desc = descriptions[selectedImage.filename]?.description || (selectedImage as any).description || '';
                        onCopyTarget(selectedImageBase64, desc, selectedImage.category, selectedImage.filename, selectedImage.path);
                        onClose();
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        isDark
                          ? 'bg-purple-500 text-white hover:bg-purple-400'
                          : 'bg-purple-600 text-white hover:bg-purple-500'
                      }`}
                    >
                      Copy This Ad
                    </button>
                  )}
                </>
              )}

              {view === 'saved' && (
                <button
                  onClick={() => {
                    const updated = savedAds.filter(ad => ad.id !== selectedImage.id);
                    setSavedAds(updated);
                    if (campaign) {
                      localStorage.setItem(`saved-ads-${campaign.id}`, JSON.stringify(updated));
                    }
                    setSelectedImage(null);
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isDark
                      ? 'bg-red-600/80 text-white hover:bg-red-600'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  Delete
                </button>
              )}

              <button
                onClick={() => navigator.clipboard.writeText(selectedImage.filename)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isDark
                    ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                    : 'bg-zinc-200 text-zinc-900 hover:bg-zinc-300'
                }`}
              >
                Copy Filename
              </button>

              {(selectedImage.base64 || selectedImageBase64) && (
                <button
                  onClick={() => downloadImage(selectedImage.base64 || selectedImageBase64!, selectedImage.filename)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isDark
                      ? 'bg-blue-600/80 text-white hover:bg-blue-600'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  Download
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
