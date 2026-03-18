import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ANGLE_SHOTS, ANGLE_CATEGORIES, buildAnglePrompt } from '../utils/anglePrompts';
import { generateImage } from '../utils/freepikService';
import { ollamaService } from '../utils/ollama';
import { getVisionModel } from '../utils/modelConfig';
import type { StoredImage } from '../utils/storage';
import type { AngleShot } from '../utils/anglePrompts';

// ── Types ──

interface ProductAngleCreatorProps {
  theme: 'light' | 'dark';
  onSaveToGallery: (image: StoredImage) => Promise<void>;
  onUseAsReference: (base64: string) => void;
  campaignId?: string;
  campaignBrand?: string;
}

interface AngleResult {
  angleId: string;
  label: string;
  imageBase64: string;
  prompt: string;
  timestamp: number;
  saved: boolean;
}

type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5' | '2:3' | '3:4';

// ── Presets (curated shot packs) ──

const PRESETS: { id: string; label: string; desc: string; shotIds: string[] }[] = [
  {
    id: 'quick',
    label: 'Quick 8',
    desc: 'Front, 3/4, side, top, low, macro, studio, floating',
    shotIds: ['rot-front', 'rot-3q-r', 'rot-side-r', 'elev-topdown', 'elev-low30', 'cu-macro', 'lit-studio', 'cre-floating'],
  },
  {
    id: 'rotation-pack',
    label: '360° Spin',
    desc: 'Full rotation orbit — every 30-45°',
    shotIds: ['rot-front', 'rot-30r', 'rot-3q-r', 'rot-60r', 'rot-side-r', 'rot-120r', 'rot-3q-rear-r', 'rot-rear', 'rot-3q-rear-l', 'rot-120l', 'rot-side-l', 'rot-60l', 'rot-3q-l', 'rot-30l'],
  },
  {
    id: 'ecomm',
    label: 'E-Commerce',
    desc: 'Clean shots for product listings',
    shotIds: ['rot-front', 'rot-3q-r', 'rot-side-r', 'rot-rear', 'elev-30up', 'elev-topdown', 'cu-label', 'cu-macro', 'lit-studio', 'lit-highkey', 'surf-marble', 'comp-centered'],
  },
  {
    id: 'social',
    label: 'Social Media',
    desc: 'Lifestyle, creative, eye-catching',
    shotIds: ['rot-front', 'rot-3q-r', 'elev-dutch', 'cu-tight', 'lit-neon', 'lit-golden', 'surf-mirror', 'life-hand', 'life-cafe', 'cre-floating', 'cre-splash', 'cre-bokeh', 'comp-diagonal'],
  },
];

// ── Component ──

export function ProductAngleCreator({
  theme,
  onSaveToGallery,
  onUseAsReference,
  campaignId,
  campaignBrand,
}: ProductAngleCreatorProps) {
  // Source image
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings
  const [imageModel, setImageModel] = useState<string>(() =>
    localStorage.getItem('angle_model') || 'nano-banana-2'
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() =>
    (localStorage.getItem('angle_aspect') as AspectRatio) || '1:1'
  );

  useEffect(() => { localStorage.setItem('angle_model', imageModel); }, [imageModel]);
  useEffect(() => { localStorage.setItem('angle_aspect', aspectRatio); }, [aspectRatio]);

  // Selection — category-level toggles + preset shortcuts
  const [selectedCats, setSelectedCats] = useState<Set<string>>(() => new Set());

  // Compute selected shots from selected categories
  const selectedShots = useMemo(() => {
    return ANGLE_SHOTS.filter(s => selectedCats.has(s.category));
  }, [selectedCats]);

  // Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAngleLabel, setCurrentAngleLabel] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [warningMsg, setWarningMsg] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Custom preset mode (overrides category selection with specific shot IDs)
  const [customShotIds, setCustomShotIds] = useState<string[] | null>(null);

  // Results
  const [results, setResults] = useState<AngleResult[]>([]);
  const [failedAngles, setFailedAngles] = useState<Set<string>>(new Set());

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Helpers ──

  const isDark = theme === 'dark';

  const stripBase64Prefix = (b64: string) =>
    b64.includes(',') ? b64.split(',')[1] : b64;

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  // ── Effective shots list (preset overrides category selection) ──
  const effectiveShots: AngleShot[] = useMemo(() => {
    if (customShotIds) {
      return customShotIds.map(id => ANGLE_SHOTS.find(s => s.id === id)).filter(Boolean) as AngleShot[];
    }
    return selectedShots;
  }, [customShotIds, selectedShots]);

  // ── Upload ──

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setProductImage(base64);
      setResults([]);
      setFailedAngles(new Set());

      setIsAnalyzing(true);
      setProductDescription('');
      try {
        const raw = stripBase64Prefix(base64);
        const desc = await ollamaService.generateStream(
          'Describe this product in 15-20 words. Focus on: what it is, shape, color, material, any visible text/branding. Be specific and factual.',
          'You describe products for photography direction. Short, factual, no opinions.',
          { model: getVisionModel(), images: [raw], temperature: 0.3 }
        );
        setProductDescription(desc.trim());
      } catch {
        setProductDescription('(Vision analysis unavailable)');
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  // ── Category toggles ──

  const toggleCat = (key: string) => {
    setCustomShotIds(null); // Clear preset when manually toggling
    setSelectedCats(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setCustomShotIds(preset.shotIds);
    setSelectedCats(new Set()); // Clear category selection
  };

  const selectAllCats = () => {
    setCustomShotIds(null);
    setSelectedCats(new Set(ANGLE_CATEGORIES.map(c => c.key)));
  };

  const clearSelection = () => {
    setCustomShotIds(null);
    setSelectedCats(new Set());
  };

  // ── Generation ──

  const handleGenerate = useCallback(async () => {
    if (!productImage || effectiveShots.length === 0) return;

    const shots = effectiveShots;
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setCurrentIdx(0);
    setTotalCount(shots.length);
    setElapsedMs(0);
    setFailedAngles(new Set());
    setProgressMsg('Starting...');
    setWarningMsg('');

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 1000);

    const rawImage = stripBase64Prefix(productImage);

    for (let i = 0; i < shots.length; i++) {
      if (controller.signal.aborted) break;

      const shot = shots[i];
      setCurrentIdx(i + 1);
      setCurrentAngleLabel(shot.label);
      setProgressMsg(`Generating ${shot.label}...`);

      const prompt = buildAnglePrompt(shot, campaignBrand ? `${campaignBrand} brand` : undefined);

      try {
        const result = await generateImage({
          prompt,
          model: imageModel,
          aspectRatio,
          count: 1,
          referenceImages: [rawImage],
          signal: controller.signal,
          onProgress: (msg) => setProgressMsg(msg),
          onWarning: (msg) => setWarningMsg(msg),
        });

        if (result.success && result.imageBase64) {
          setResults(prev => [...prev, {
            angleId: shot.id,
            label: shot.label,
            imageBase64: result.imageBase64.startsWith('data:')
              ? result.imageBase64
              : `data:image/png;base64,${result.imageBase64}`,
            prompt,
            timestamp: Date.now(),
            saved: false,
          }]);
          setWarningMsg('');
        } else {
          console.warn(`[AngleCreator] ${shot.label} failed:`, result.error);
          setFailedAngles(prev => new Set(prev).add(shot.id));
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) break;
        console.warn(`[AngleCreator] ${shot.label} error:`, err);
        setFailedAngles(prev => new Set(prev).add(shot.id));
      }
    }

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setIsGenerating(false);
    setProgressMsg('');
    abortRef.current = null;
  }, [productImage, effectiveShots, imageModel, aspectRatio, campaignBrand]);

  const handleCancel = () => { abortRef.current?.abort(); };

  // ── Save actions ──

  const handleSaveOne = useCallback(async (result: AngleResult) => {
    await onSaveToGallery({
      id: `angle-${result.angleId}-${result.timestamp}`,
      imageBase64: result.imageBase64,
      prompt: result.prompt,
      model: imageModel,
      aspectRatio,
      pipeline: 'angle-creator',
      timestamp: result.timestamp,
      label: `Angle: ${result.label}`,
      referenceImageCount: 1,
      campaignId,
      campaignBrand,
    });
    setResults(prev => prev.map(r =>
      r.angleId === result.angleId ? { ...r, saved: true } : r
    ));
  }, [imageModel, aspectRatio, campaignId, campaignBrand, onSaveToGallery]);

  const handleSaveAll = useCallback(async () => {
    for (const result of results) {
      if (!result.saved) {
        await onSaveToGallery({
          id: `angle-${result.angleId}-${result.timestamp}`,
          imageBase64: result.imageBase64,
          prompt: result.prompt,
          model: imageModel,
          aspectRatio,
          pipeline: 'angle-creator',
          timestamp: result.timestamp,
          label: `Angle: ${result.label}`,
          referenceImageCount: 1,
          campaignId,
          campaignBrand,
        });
      }
    }
    setResults(prev => prev.map(r => ({ ...r, saved: true })));
  }, [results, imageModel, aspectRatio, campaignId, campaignBrand, onSaveToGallery]);

  // ── Render ──

  const shotCount = effectiveShots.length;
  const pct = totalCount > 0 ? Math.round((currentIdx / totalCount) * 100) : 0;
  const activePreset = customShotIds ? PRESETS.find(p => JSON.stringify(p.shotIds) === JSON.stringify(customShotIds)) : null;

  return (
    <div>
      {/* ── Settings Bar ── */}
      <div className={`flex items-center gap-3 mb-4 pb-3 border-b ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
        <h2 className={`text-xs font-bold uppercase tracking-wider mr-auto ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
          Angle Creator
        </h2>
        <div className="flex gap-0.5">
          {(['1:1', '9:16', '4:5', '16:9'] as AspectRatio[]).map(val => (
            <button key={val} onClick={() => setAspectRatio(val)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                aspectRatio === val
                  ? isDark ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-900 text-white'
                  : isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >{val}</button>
          ))}
        </div>
        <div className={`flex rounded-md overflow-hidden border ${isDark ? 'border-zinc-700' : 'border-zinc-200'}`}>
          {[['nano-banana-2', 'Nano Banana'], ['seedream-5-lite', 'Seedream']].map(([val, label]) => (
            <button key={val} onClick={() => setImageModel(val)}
              className={`px-2 py-0.5 text-[10px] font-medium transition-all ${
                imageModel === val
                  ? isDark ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-900 text-white'
                  : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── Upload + Selection ── */}
      <div className="flex gap-5 mb-4">
        {/* Upload Zone */}
        <div className="w-40 flex-shrink-0">
          {productImage ? (
            <div className="relative">
              <img src={productImage} alt="Product"
                className={`w-full aspect-square object-contain rounded-xl border ${
                  isDark ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-200 bg-white'
                }`}
              />
              <button
                onClick={() => { setProductImage(null); setProductDescription(''); setResults([]); setFailedAngles(new Set()); }}
                className={`absolute top-1 right-1 p-1 rounded-lg transition-colors ${
                  isDark ? 'bg-zinc-900/80 hover:bg-zinc-900 text-zinc-400' : 'bg-white/80 hover:bg-white text-zinc-500'
                }`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
              <div className={`mt-1.5 text-[9px] leading-relaxed ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {isAnalyzing ? <span className="animate-pulse">Analyzing...</span> : productDescription}
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className={`w-full aspect-square flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                isDark
                  ? 'border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300'
                  : 'border-zinc-300 hover:border-zinc-400 text-zinc-400 hover:text-zinc-600'
              }`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-[9px] font-medium text-center px-2">Drop photo<br />or click</span>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e.target.files)} />
        </div>

        {/* Right side: Presets + Category cards */}
        <div className="flex-1 min-w-0">
          {/* Preset packs */}
          <div className="mb-3">
            <div className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>Quick packs</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                    activePreset?.id === preset.id
                      ? isDark
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                        : 'bg-blue-50 border-blue-300 text-blue-700'
                      : isDark
                        ? 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                        : 'border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700'
                  }`}
                >
                  {preset.label}
                  <span className={`ml-1 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>{preset.shotIds.length}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Category toggle cards */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                Categories
              </span>
              <div className="flex gap-1">
                <button onClick={selectAllCats} className={`text-[9px] px-1 ${isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>all</button>
                <button onClick={clearSelection} className={`text-[9px] px-1 ${isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>none</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ANGLE_CATEGORIES.map(cat => {
                const count = ANGLE_SHOTS.filter(s => s.category === cat.key).length;
                const active = selectedCats.has(cat.key) && !customShotIds;
                return (
                  <button
                    key={cat.key}
                    onClick={() => toggleCat(cat.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                      active
                        ? isDark
                          ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
                          : 'bg-zinc-900 text-white border-zinc-900'
                        : isDark
                          ? 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                          : 'border-zinc-200 text-zinc-500 hover:border-zinc-400'
                    }`}
                  >
                    {cat.label}
                    <span className={`ml-1 ${active ? (isDark ? 'text-zinc-600' : 'text-zinc-400') : (isDark ? 'text-zinc-600' : 'text-zinc-400')}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selection summary */}
          <div className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {shotCount > 0 ? (
              <>{shotCount} shot{shotCount !== 1 ? 's' : ''} selected{activePreset ? ` — ${activePreset.desc}` : ''}</>
            ) : (
              'Pick a pack or tap categories'
            )}
          </div>
        </div>
      </div>

      {/* ── Generate / Progress / Stop ── */}
      {productImage && (
        <div className={`sticky top-0 z-20 -mx-6 px-6 py-2 mb-3 ${isDark ? 'bg-zinc-900/95' : 'bg-[#f7f7f8]/95'} backdrop-blur-sm`}>
          {isGenerating ? (
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold tabular-nums ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                      {currentIdx}/{totalCount}
                    </span>
                    <span className={`text-[10px] truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {currentAngleLabel}
                    </span>
                    <span className={`text-[10px] tabular-nums ml-auto ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {formatElapsed(elapsedMs)}
                    </span>
                  </div>
                </div>
                <button onClick={handleCancel}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex-shrink-0 ${
                    isDark ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >Stop</button>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
                <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              {(progressMsg || warningMsg) && (
                <div className="flex gap-2 mt-1">
                  {progressMsg && <span className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{progressMsg}</span>}
                  {warningMsg && <span className="text-[9px] text-amber-500">{warningMsg}</span>}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleGenerate} disabled={shotCount === 0}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  shotCount === 0
                    ? isDark ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                    : isDark ? 'bg-white text-zinc-900 hover:bg-zinc-100 shadow-lg' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-lg'
                }`}
              >
                {shotCount === 0 ? 'Select angles above' : `Generate ${shotCount} Angle${shotCount !== 1 ? 's' : ''}`}
              </button>
              {results.length > 0 && (
                <button onClick={handleSaveAll}
                  className={`px-3 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                    isDark ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >Save All ({results.length})</button>
              )}
            </div>
          )}
          {!isGenerating && results.length > 0 && (
            <div className={`text-[9px] mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {results.length} done{failedAngles.size > 0 ? `, ${failedAngles.size} failed` : ''} — {formatElapsed(elapsedMs)}
            </div>
          )}
        </div>
      )}

      {/* ── Results Grid ── */}
      {results.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {results.map((result) => (
            <div key={result.angleId}
              className={`group relative rounded-lg overflow-hidden border transition-all ${
                isDark ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-200 hover:border-zinc-400'
              }`}
            >
              <img src={result.imageBase64} alt={result.label} className="w-full aspect-square object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-5">
                <span className="text-[8px] font-medium text-white/90">{result.label}</span>
              </div>
              {result.saved && (
                <div className="absolute top-1 left-1">
                  <span className="p-0.5 rounded bg-emerald-600/80 text-white block">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                </div>
              )}
              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {!result.saved && (
                  <button onClick={() => handleSaveOne(result)} title="Save"
                    className="p-1 rounded bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                    </svg>
                  </button>
                )}
                <button onClick={() => onUseAsReference(stripBase64Prefix(result.imageBase64))} title="Use as ref"
                  className="p-1 rounded bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty ── */}
      {!productImage && results.length === 0 && (
        <div className={`text-center py-10 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          <p className="text-xs">Upload a photo, pick a pack, generate</p>
        </div>
      )}
    </div>
  );
}
