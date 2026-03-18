// Model configuration for the research + ad pipeline
//
// Model roster (remote Ollama at 100.74.135.83:11435 via Tailscale proxy):
//   qwen3.5:0.8b  (530MB)  — compression, fast extraction, vision
//   qwen3.5:2b    (1.5GB)  — page compression, memory archiving
//   qwen3.5:4b    (2.8GB)  — researcher synthesis, fast analysis
//   qwen3.5:9b    (6.6GB)  — orchestrator, reflection, desire analysis
//   qwen3.5:27b   (18GB)   — complex reasoning, council brains
//   qwen3.5:35b   (24GB)   — make + test stages, heavy lifting
//
// All Qwen 3.5 variants. No other model families.
// All model assignments are configurable via Dashboard → Settings → Research.
// Each role reads from localStorage with fallback to defaults below.

// ─────────────────────────────────────────────────────────────
// Stage-level model assignments (used by useCycleLoop, wayfayer, etc.)
// ─────────────────────────────────────────────────────────────

export const MODEL_CONFIG: Record<string, string> = {
  research: 'qwen3.5:9b',
  'brand-dna': 'qwen3.5:9b',
  'persona-dna': 'qwen3.5:9b',
  angles: 'qwen3.5:9b',
  strategy: 'qwen3.5:9b',
  copywriting: 'qwen3.5:9b',
  production: 'qwen3.5:35b',
  test: 'qwen3.5:27b',
  vision: 'qwen3.5:0.8b',
  thinking: 'qwen3.5:4b',
  planner: 'qwen3.5:9b',
  executor: 'qwen3.5:2b',
};

/** Get model for a pipeline stage — reads from localStorage with fallback */
export function getModelForStage(stage: string): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`model_${stage}`);
    if (stored) return stored;
  }
  return MODEL_CONFIG[stage] || 'qwen3.5:9b';
}

/** Vision model — used for screenshot analysis everywhere.
 *  Reads from localStorage `vision_model` with fallback to MODEL_CONFIG.vision */
export function getVisionModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('vision_model');
    if (stored) return stored;
  }
  return MODEL_CONFIG.vision;
}

/** Thinking model — used for deep reasoning / chain-of-thought tasks.
 *  Reads from localStorage `thinking_model` with fallback to MODEL_CONFIG.thinking */
export function getThinkingModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('thinking_model');
    if (stored) return stored;
  }
  return MODEL_CONFIG.thinking;
}

/** Planner model — used by Plan-Act agent for decomposing goals into steps. */
export function getPlannerModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('planner_model');
    if (stored) return stored;
  }
  return MODEL_CONFIG.planner;
}

/** Executor model — used by Plan-Act agent for executing individual actions. */
export function getExecutorModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('executor_model');
    if (stored) return stored;
  }
  return MODEL_CONFIG.executor;
}

/** Available vision-capable models for the selector */
export const VISION_MODEL_OPTIONS = [
  { value: 'qwen3.5:0.8b', label: 'Qwen 3.5 0.8B (Fast)' },
  { value: 'qwen3.5:2b', label: 'Qwen 3.5 2B' },
  { value: 'qwen3.5:4b', label: 'Qwen 3.5 4B' },
  { value: 'qwen3.5:9b', label: 'Qwen 3.5 9B' },
] as const;

/** Available thinking models for the selector */
export const THINKING_MODEL_OPTIONS = [
  { value: 'qwen3.5:2b', label: 'Qwen 3.5 2B (Fast)' },
  { value: 'qwen3.5:4b', label: 'Qwen 3.5 4B' },
  { value: 'qwen3.5:9b', label: 'Qwen 3.5 9B' },
  { value: 'qwen3.5:27b', label: 'Qwen 3.5 27B' },
] as const;

/** Available chat/general models for Brand DNA editor etc. */
export const CHAT_MODEL_OPTIONS = [
  { value: 'qwen3.5:0.8b', label: 'Qwen 3.5 0.8B (Fast)' },
  { value: 'qwen3.5:2b', label: 'Qwen 3.5 2B' },
  { value: 'qwen3.5:4b', label: 'Qwen 3.5 4B' },
  { value: 'qwen3.5:9b', label: 'Qwen 3.5 9B' },
  { value: 'qwen3.5:27b', label: 'Qwen 3.5 27B' },
  { value: 'qwen3.5:35b', label: 'Qwen 3.5 35B' },
] as const;

/** Get chat model — used for Brand DNA editor and similar chat features */
export function getChatModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('chat_model');
    if (stored) return stored;
  }
  return 'qwen3.5:9b';
}

// ─────────────────────────────────────────────────────────────
// Research model config — granular per-role assignments
// ─────────────────────────────────────────────────────────────

export interface ResearchModelConfig {
  orchestratorModel: string;          // Decides what to research next (strategic reasoning)
  researcherSynthesisModel: string;   // Synthesizes compressed web pages into findings
  compressionModel: string;           // Compresses raw web pages (fast, small model)
  reflectionModel: string;            // Gap analysis reflection agents
  desireLayerModel: string;           // 7-layer desire analysis
  personaSynthesisModel: string;      // Persona generation (creative + analytical)
  councilBrainModel: string;          // Council of marketing brains
  temperature: number;                // 0-1 global default
  maxContext: number;                 // 2048-32768
}

const RESEARCH_DEFAULTS: ResearchModelConfig = {
  orchestratorModel: 'qwen3.5:9b',
  researcherSynthesisModel: 'qwen3.5:4b',
  compressionModel: 'qwen3.5:2b',
  reflectionModel: 'qwen3.5:9b',
  desireLayerModel: 'qwen3.5:9b',
  personaSynthesisModel: 'qwen3.5:9b',
  councilBrainModel: 'qwen3.5:27b',
  temperature: 0.7,
  maxContext: 8192,
};

/** Get research model config — reads per-role keys from localStorage with backward compat.
 *  Preset model overrides (from applyResearchPreset) take priority over defaults but
 *  user-explicit per-role overrides (from Settings modal) take highest priority. */
export function getResearchModelConfig(): ResearchModelConfig {
  if (typeof window === 'undefined') return RESEARCH_DEFAULTS;

  // Backward compat: if new per-role keys aren't set, fall back to old 'research_model' key
  const legacyModel = localStorage.getItem('research_model') || '';

  // Priority: user-explicit > preset override > defaults
  const presetOrch = localStorage.getItem('preset_orchestrator_model') || '';
  const presetComp = localStorage.getItem('preset_compression_model') || '';
  const presetSynth = localStorage.getItem('preset_synthesis_model') || '';
  const presetRefl = localStorage.getItem('preset_reflection_model') || '';

  const get = (key: string, presetOverride: string, fallback: string) =>
    localStorage.getItem(key) || presetOverride || legacyModel || fallback;

  return {
    orchestratorModel: get('orchestrator_model', presetOrch, RESEARCH_DEFAULTS.orchestratorModel),
    researcherSynthesisModel: get('researcher_synthesis_model', presetSynth, RESEARCH_DEFAULTS.researcherSynthesisModel),
    compressionModel: localStorage.getItem('compression_model') || presetComp || RESEARCH_DEFAULTS.compressionModel,
    reflectionModel: get('reflection_model', presetRefl, RESEARCH_DEFAULTS.reflectionModel),
    desireLayerModel: get('desire_layer_model', '', RESEARCH_DEFAULTS.desireLayerModel),
    personaSynthesisModel: get('persona_synthesis_model', '', RESEARCH_DEFAULTS.personaSynthesisModel),
    councilBrainModel: get('council_brain_model', '', RESEARCH_DEFAULTS.councilBrainModel),
    temperature: parseFloat(localStorage.getItem('research_temperature') || '') || RESEARCH_DEFAULTS.temperature,
    maxContext: parseInt(localStorage.getItem('research_max_context') || '') || RESEARCH_DEFAULTS.maxContext,
  };
}

// ─────────────────────────────────────────────────────────────
// Research intensity limits — configurable via Dashboard
// ─────────────────────────────────────────────────────────────

export interface ResearchLimits {
  maxIterations: number;
  minIterations: number;
  coverageThreshold: number;
  minSources: number;
  maxResearchersPerIteration: number;
  maxTimeMinutes: number;
  parallelCompressionCount: number;
  // Visual scouting limits (Wayfarer Plus — Playwright screenshots + vision analysis)
  maxVisualBatches: number;        // Max visual scout batches (each batch = 5 URLs)
  maxVisualUrls: number;           // Hard cap on total visual URLs analyzed
  // Per-preset model overrides (smaller presets use smaller models for speed)
  orchestratorModel?: string;      // Override orchestrator model for this preset
  compressionModel?: string;       // Override compression model for this preset
  synthesisModel?: string;         // Override researcher synthesis model for this preset
  reflectionModel?: string;        // Override reflection model for this preset
  // Preset behavior flags
  skipReflection: boolean;         // SQ: skip reflection agents entirely
  singlePassResearch: boolean;     // SQ: one-shot research, no iteration loop
  // Max-tier exclusive features
  crossValidation: boolean;        // Re-search to verify claims from multiple sources
  multiLanguageSearch: boolean;    // Search in Spanish, French, German, Japanese etc.
  historicalAnalysis: boolean;     // Search across years (2020-2026) for trend mapping
  communityDeepDive: boolean;     // Dedicated Reddit / Quora / niche forum passes
  competitorAdScrape: boolean;    // Facebook Ad Library, Google Ads scraping
  academicSearch: boolean;         // Google Scholar, PubMed for clinical/scientific backing
}

const LIMITS_DEFAULTS: ResearchLimits = {
  maxIterations: 30,
  minIterations: 8,
  coverageThreshold: 0.99,
  minSources: 75,
  maxResearchersPerIteration: 5,
  maxTimeMinutes: 90,
  parallelCompressionCount: 1,
  maxVisualBatches: 1,
  maxVisualUrls: 5,
  skipReflection: false,
  singlePassResearch: false,
  crossValidation: false,
  multiLanguageSearch: false,
  historicalAnalysis: false,
  communityDeepDive: false,
  competitorAdScrape: false,
  academicSearch: false,
};

// ─────────────────────────────────────────────────────────────
// Research Depth Presets
// ─────────────────────────────────────────────────────────────

export type ResearchDepthPreset = 'super-quick' | 'quick' | 'normal' | 'extended' | 'max';

export interface ResearchPresetDef {
  id: ResearchDepthPreset;
  label: string;
  shortLabel: string;
  description: string;
  time: string;
  color: string;           // Tailwind accent color class
  limits: ResearchLimits;
}

export const RESEARCH_PRESETS: ResearchPresetDef[] = [
  {
    id: 'super-quick',
    label: 'Super Quick',
    shortLabel: 'SQ',
    description: 'Single-pass scan — fast directional take, no iteration',
    time: '~5 min',
    color: 'sky',
    limits: {
      maxIterations: 3,
      minIterations: 1,
      coverageThreshold: 0.40,
      minSources: 5,
      maxResearchersPerIteration: 2,
      maxTimeMinutes: 5,
      parallelCompressionCount: 2,
      maxVisualBatches: 0,
      maxVisualUrls: 0,
      // SQ uses smallest models for speed
      orchestratorModel: 'qwen3.5:4b',
      compressionModel: 'qwen3.5:0.8b',
      synthesisModel: 'qwen3.5:2b',
      reflectionModel: undefined,
      // SQ skips reflection and does single-pass
      skipReflection: true,
      singlePassResearch: true,
      crossValidation: false,
      multiLanguageSearch: false,
      historicalAnalysis: false,
      communityDeepDive: false,
      competitorAdScrape: false,
      academicSearch: false,
    },
  },
  {
    id: 'quick',
    label: 'Quick',
    shortLabel: 'QK',
    description: 'Solid overview — iterates until key gaps filled',
    time: '~30 min',
    color: 'emerald',
    limits: {
      maxIterations: 10,
      minIterations: 3,
      coverageThreshold: 0.65,
      minSources: 20,
      maxResearchersPerIteration: 3,
      maxTimeMinutes: 30,
      parallelCompressionCount: 2,
      maxVisualBatches: 0,
      maxVisualUrls: 0,
      // QK uses mid-tier models
      orchestratorModel: 'qwen3.5:4b',
      compressionModel: 'qwen3.5:2b',
      synthesisModel: 'qwen3.5:4b',
      reflectionModel: 'qwen3.5:4b',
      skipReflection: false,
      singlePassResearch: false,
      crossValidation: false,
      multiLanguageSearch: false,
      historicalAnalysis: false,
      communityDeepDive: false,
      competitorAdScrape: false,
      academicSearch: false,
    },
  },
  {
    id: 'normal',
    label: 'Normal',
    shortLabel: 'NR',
    description: 'Full analysis with reflection — production quality',
    time: '~90 min',
    color: 'violet',
    limits: {
      maxIterations: 25,
      minIterations: 6,
      coverageThreshold: 0.80,
      minSources: 60,
      maxResearchersPerIteration: 4,
      maxTimeMinutes: 90,
      parallelCompressionCount: 2,
      maxVisualBatches: 1,
      maxVisualUrls: 5,
      // NR uses default models (9b orchestrator, 2b compression, 4b synthesis)
      skipReflection: false,
      singlePassResearch: false,
      crossValidation: false,
      multiLanguageSearch: false,
      historicalAnalysis: false,
      communityDeepDive: false,
      competitorAdScrape: false,
      academicSearch: false,
    },
  },
  {
    id: 'extended',
    label: 'Extended',
    shortLabel: 'EX',
    description: 'Deep dive + visual scouting + cross-validation + community passes',
    time: '~2 hrs',
    color: 'amber',
    limits: {
      maxIterations: 40,
      minIterations: 10,
      coverageThreshold: 0.90,
      minSources: 150,
      maxResearchersPerIteration: 5,
      maxTimeMinutes: 120,
      parallelCompressionCount: 3,
      maxVisualBatches: 3,
      maxVisualUrls: 15,
      // EX uses full-size models
      orchestratorModel: 'qwen3.5:9b',
      compressionModel: 'qwen3.5:4b',
      synthesisModel: 'qwen3.5:9b',
      reflectionModel: 'qwen3.5:9b',
      skipReflection: false,
      singlePassResearch: false,
      crossValidation: true,
      multiLanguageSearch: false,
      historicalAnalysis: false,
      communityDeepDive: true,
      competitorAdScrape: true,
      academicSearch: false,
    },
  },
  {
    id: 'max',
    label: 'Maximum',
    shortLabel: 'MX',
    description: 'Exhaustive — every angle, every source, deep visuals, multi-language',
    time: '~5 hrs',
    color: 'red',
    limits: {
      maxIterations: 80,
      minIterations: 20,
      coverageThreshold: 0.95,
      minSources: 300,
      maxResearchersPerIteration: 5,
      maxTimeMinutes: 300,
      parallelCompressionCount: 4,
      maxVisualBatches: 8,
      maxVisualUrls: 40,
      // MX uses largest available models
      orchestratorModel: 'qwen3.5:27b',
      compressionModel: 'qwen3.5:4b',
      synthesisModel: 'qwen3.5:9b',
      reflectionModel: 'qwen3.5:27b',
      skipReflection: false,
      singlePassResearch: false,
      crossValidation: true,
      multiLanguageSearch: true,
      historicalAnalysis: true,
      communityDeepDive: true,
      competitorAdScrape: true,
      academicSearch: true,
    },
  },
];

/** Apply a research depth preset — writes all values to localStorage */
export function applyResearchPreset(presetId: ResearchDepthPreset): void {
  const preset = RESEARCH_PRESETS.find(p => p.id === presetId);
  if (!preset) return;
  const l = preset.limits;
  localStorage.setItem('research_depth_preset', presetId);
  localStorage.setItem('max_research_iterations', String(l.maxIterations));
  localStorage.setItem('min_research_iterations', String(l.minIterations));
  localStorage.setItem('coverage_target', String(l.coverageThreshold));
  localStorage.setItem('min_research_sources', String(l.minSources));
  localStorage.setItem('max_researchers_per_iteration', String(l.maxResearchersPerIteration));
  localStorage.setItem('max_research_time_minutes', String(l.maxTimeMinutes));
  localStorage.setItem('parallel_compression_count', String(l.parallelCompressionCount));
  localStorage.setItem('max_visual_batches', String(l.maxVisualBatches));
  localStorage.setItem('max_visual_urls', String(l.maxVisualUrls));
  localStorage.setItem('research_skip_reflection', String(l.skipReflection));
  localStorage.setItem('research_single_pass', String(l.singlePassResearch));
  localStorage.setItem('research_cross_validation', String(l.crossValidation));
  localStorage.setItem('research_multi_language', String(l.multiLanguageSearch));
  localStorage.setItem('research_historical_analysis', String(l.historicalAnalysis));
  localStorage.setItem('research_community_deep_dive', String(l.communityDeepDive));
  localStorage.setItem('research_competitor_ad_scrape', String(l.competitorAdScrape));
  localStorage.setItem('research_academic_search', String(l.academicSearch));
  // Store per-preset model overrides
  if (l.orchestratorModel) localStorage.setItem('preset_orchestrator_model', l.orchestratorModel);
  else localStorage.removeItem('preset_orchestrator_model');
  if (l.compressionModel) localStorage.setItem('preset_compression_model', l.compressionModel);
  else localStorage.removeItem('preset_compression_model');
  if (l.synthesisModel) localStorage.setItem('preset_synthesis_model', l.synthesisModel);
  else localStorage.removeItem('preset_synthesis_model');
  if (l.reflectionModel) localStorage.setItem('preset_reflection_model', l.reflectionModel);
  else localStorage.removeItem('preset_reflection_model');
}

/** Get the active research depth preset (or 'custom' if values were tweaked) */
export function getActiveResearchPreset(): ResearchDepthPreset | 'custom' {
  const stored = localStorage.getItem('research_depth_preset');
  if (stored && RESEARCH_PRESETS.some(p => p.id === stored)) {
    return stored as ResearchDepthPreset;
  }
  return 'normal'; // default
}

/** Get research intensity limits from localStorage with fallback to defaults */
export function getResearchLimits(): ResearchLimits {
  if (typeof window === 'undefined') return LIMITS_DEFAULTS;

  const getInt = (key: string, fallback: number) => {
    const v = parseInt(localStorage.getItem(key) || '');
    return isNaN(v) ? fallback : v;
  };
  const getFloat = (key: string, fallback: number) => {
    const v = parseFloat(localStorage.getItem(key) || '');
    return isNaN(v) ? fallback : v;
  };

  const getBool = (key: string, fallback: boolean) => {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === 'true';
  };

  return {
    maxIterations: getInt('max_research_iterations', LIMITS_DEFAULTS.maxIterations),
    minIterations: getInt('min_research_iterations', LIMITS_DEFAULTS.minIterations),
    coverageThreshold: getFloat('coverage_target', LIMITS_DEFAULTS.coverageThreshold),
    minSources: getInt('min_research_sources', LIMITS_DEFAULTS.minSources),
    maxResearchersPerIteration: getInt('max_researchers_per_iteration', LIMITS_DEFAULTS.maxResearchersPerIteration),
    maxTimeMinutes: getInt('max_research_time_minutes', LIMITS_DEFAULTS.maxTimeMinutes),
    parallelCompressionCount: getInt('parallel_compression_count', LIMITS_DEFAULTS.parallelCompressionCount),
    maxVisualBatches: getInt('max_visual_batches', LIMITS_DEFAULTS.maxVisualBatches),
    maxVisualUrls: getInt('max_visual_urls', LIMITS_DEFAULTS.maxVisualUrls),
    orchestratorModel: localStorage.getItem('preset_orchestrator_model') || undefined,
    compressionModel: localStorage.getItem('preset_compression_model') || undefined,
    synthesisModel: localStorage.getItem('preset_synthesis_model') || undefined,
    reflectionModel: localStorage.getItem('preset_reflection_model') || undefined,
    skipReflection: getBool('research_skip_reflection', LIMITS_DEFAULTS.skipReflection),
    singlePassResearch: getBool('research_single_pass', LIMITS_DEFAULTS.singlePassResearch),
    crossValidation: getBool('research_cross_validation', LIMITS_DEFAULTS.crossValidation),
    multiLanguageSearch: getBool('research_multi_language', LIMITS_DEFAULTS.multiLanguageSearch),
    historicalAnalysis: getBool('research_historical_analysis', LIMITS_DEFAULTS.historicalAnalysis),
    communityDeepDive: getBool('research_community_deep_dive', LIMITS_DEFAULTS.communityDeepDive),
    competitorAdScrape: getBool('research_competitor_ad_scrape', LIMITS_DEFAULTS.competitorAdScrape),
    academicSearch: getBool('research_academic_search', LIMITS_DEFAULTS.academicSearch),
  };
}

// ─────────────────────────────────────────────────────────────
// Per-brain temperature settings
// ─────────────────────────────────────────────────────────────

const BRAIN_TEMP_DEFAULTS: Record<string, number> = {
  desire: 0.8,
  persuasion: 0.7,
  offer: 0.6,
  creative: 0.9,
  avatar: 0.7,
  contrarian: 0.85,
  visual: 0.5,
};

/** Get temperature for a specific brain — checks localStorage override first */
export function getBrainTemperature(brainId: string): number {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`brain_temp_${brainId}`);
    if (stored) {
      const val = parseFloat(stored);
      if (!isNaN(val) && val >= 0 && val <= 2) return val;
    }
  }
  return BRAIN_TEMP_DEFAULTS[brainId] ?? 0.7;
}

/** Set temperature for a specific brain */
export function setBrainTemperature(brainId: string, temp: number): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`brain_temp_${brainId}`, temp.toString());
  }
}

/** Get all brain temperature defaults (for UI rendering) */
export function getAllBrainTempDefaults(): Record<string, number> {
  return { ...BRAIN_TEMP_DEFAULTS };
}
