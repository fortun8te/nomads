import { INFRASTRUCTURE } from '../config/infrastructure';

// Model configuration for the research + ad pipeline
//
// Model roster (remote Ollama at 100.74.135.83:11435 via Tailscale proxy):
//   qwen3.5:0.8b  (530MB)  — compression, fast extraction, vision
//   qwen3.5:2b    (1.5GB)  — page compression, memory archiving
//   qwen3.5:4b    (2.8GB)  — researcher synthesis, fast analysis
//   qwen3.5:9b    (6.6GB)  — orchestrator, reflection, desire analysis
//   qwen3.5:27b   (18GB)   — production, make + test, council brains, complex creative
//
// All Qwen 3.5 variants. No other model families.
// All model assignments are configurable via Dashboard → Settings → Research.
// Each role reads from localStorage with fallback to defaults below.

// ─────────────────────────────────────────────────────────────
// Stage-level model assignments (used by useCycleLoop, wayfarer, etc.)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Model role policy (IMPORTANT — do not violate):
//
//   qwen3.5:0.8b — classification and compression only.
//   This model is NOT for conversation. Fast utility model for:
//     · intent classification (agentRouter)
//     · page compression (researchAgents)
//     · format extraction / title generation
//
//   qwen3.5:9b and above — all real conversation, reasoning, strategy.
// ─────────────────────────────────────────────────────────────

export const MODEL_CONFIG: Record<string, string> = {
  research: 'qwen3.5:4b',
  'brand-dna': 'qwen3.5:4b',
  'persona-dna': 'qwen3.5:4b',
  angles: 'qwen3.5:4b',
  strategy: 'qwen3.5:4b',
  copywriting: 'qwen3.5:4b',
  production: 'qwen3.5:9b',
  test: 'qwen3.5:9b',
  vision: 'qwen3.5:2b',
  thinking: 'qwen3.5:4b',
  planner: 'qwen3.5:4b',
  executor: 'qwen3.5:2b',
};

/** Get model for a pipeline stage — reads from localStorage with fallback */
export function getModelForStage(stage: string): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`model_${stage}`);
    if (stored) return stored;
  }
  return MODEL_CONFIG[stage] || 'qwen3.5:4b';
}

/** Vision model — used for screenshot analysis everywhere */
export function getVisionModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('vision_model');
    if (stored) return stored;
  }
  return MODEL_CONFIG.vision;
}

/** Thinking model — used for deep reasoning / chain-of-thought tasks */
export function getThinkingModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('thinking_model');
    if (stored) return stored;
  }
  return MODEL_CONFIG.thinking;
}

/**
 * Get thinking token budget for a specific context
 * Controls how many thinking tokens to allow per LLM call
 * Higher = more reasoning but slower generation
 */
export interface ThinkingBudget {
  maxThinkingTokens?: number;  // max thinking tokens (e.g. 5000, 10000)
  enabled: boolean;             // whether to enable thinking for this context
}

const THINKING_BUDGETS: Record<ThinkContext, ThinkingBudget> = {
  orchestrator: { enabled: true, maxThinkingTokens: 8000 },    // decides what to research
  synthesis: { enabled: true, maxThinkingTokens: 10000 },      // synthesizes findings
  reflection: { enabled: true, maxThinkingTokens: 5000 },      // gap analysis
  strategy: { enabled: true, maxThinkingTokens: 8000 },        // creative strategy
  analysis: { enabled: true, maxThinkingTokens: 6000 },        // deep analysis
  compression: { enabled: false },                             // fast page compression
  extraction: { enabled: false },                              // fact extraction
  title: { enabled: false },                                   // title generation
  vision: { enabled: false },                                  // image analysis
  fast: { enabled: false },                                    // 0.8b fast models
  executor: { enabled: false },                                // plan-act execution
  chat: { enabled: false },                                    // casual conversation
};

/** Get thinking token budget for a given context */
export function getThinkingBudget(context?: ThinkContext): ThinkingBudget {
  if (!context) return { enabled: false };
  return THINKING_BUDGETS[context] ?? { enabled: false };
}

/** Planner model — used by Plan-Act agent for decomposing goals into steps */
export function getPlannerModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('planner_model');
    if (stored) return stored;
  }
  return MODEL_CONFIG.planner;
}

/** Executor model — used by Plan-Act agent for executing individual actions */
export function getExecutorModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('executor_model');
    if (stored) return stored;
  }
  return MODEL_CONFIG.executor;
}

/**
 * Get chat model — used for Brand DNA editor, ActionSidebar conversation,
 * and any feature that requires real conversation/reasoning.
 *
 * IMPORTANT: Always returns at minimum qwen3.5:9b.
 * Do NOT swap this for a 0.8b model — too small for conversation.
 */
export function getChatModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('chat_model');
    // Guard: never use 0.8b for conversation
    if (stored && !stored.includes('0.8b')) return stored;
  }
  return 'qwen3.5:9b';
}

/** Vision executor settings — tuned for FAST action-oriented responses */
export interface VisionExecutorConfig {
  num_predict: number;
  temperature: number;
  top_p: number;
}

/** Get vision executor config — low tokens, low temp for fast action decisions */
export function getVisionExecutorConfig(): VisionExecutorConfig {
  return {
    num_predict: 80,
    temperature: 0.1,
    top_p: 0.8,
  };
}

/** Get vision verifier config — slightly more tokens for verification reasoning */
export function getVisionVerifierConfig(): VisionExecutorConfig {
  return {
    num_predict: 100,
    temperature: 0.2,
    top_p: 0.85,
  };
}

/** Available vision-capable models for the selector */
export const VISION_MODEL_OPTIONS = [
  { value: 'qwen3.5:0.8b', label: 'Qwen 3.5 0.8B (Fast)' },
  { value: 'qwen3.5:4b', label: 'Qwen 3.5 4B' },
  { value: 'qwen3.5:9b', label: 'Qwen 3.5 9B' },
] as const;

/** Available thinking models for the selector */
export const THINKING_MODEL_OPTIONS = [
  { value: 'qwen3.5:0.8b', label: 'Qwen 3.5 0.8B (Fast)' },
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
] as const;

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
  orchestratorModel: 'qwen3.5:4b',
  researcherSynthesisModel: 'qwen3.5:2b',
  compressionModel: 'qwen3.5:2b',
  reflectionModel: 'qwen3.5:4b',
  desireLayerModel: 'qwen3.5:4b',
  personaSynthesisModel: 'qwen3.5:4b',
  councilBrainModel: 'qwen3.5:9b',
  temperature: 0.7,
  maxContext: 8192,
};

/** Get research model config — reads per-role keys from localStorage with backward compat */
export function getResearchModelConfig(): ResearchModelConfig {
  if (typeof window === 'undefined') return RESEARCH_DEFAULTS;

  // Backward compat: if new per-role keys aren't set, fall back to old 'research_model' key
  const legacyModel = localStorage.getItem('research_model') || '';
  const get = (key: string, fallback: string) =>
    localStorage.getItem(key) || legacyModel || fallback;

  return {
    orchestratorModel: get('orchestrator_model', RESEARCH_DEFAULTS.orchestratorModel),
    researcherSynthesisModel: get('researcher_synthesis_model', RESEARCH_DEFAULTS.researcherSynthesisModel),
    compressionModel: localStorage.getItem('compression_model') || RESEARCH_DEFAULTS.compressionModel,
    reflectionModel: get('reflection_model', RESEARCH_DEFAULTS.reflectionModel),
    desireLayerModel: get('desire_layer_model', RESEARCH_DEFAULTS.desireLayerModel),
    personaSynthesisModel: get('persona_synthesis_model', RESEARCH_DEFAULTS.personaSynthesisModel),
    councilBrainModel: get('council_brain_model', RESEARCH_DEFAULTS.councilBrainModel),
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
  // Max-tier exclusive features
  crossValidation: boolean;        // Re-search to verify claims from multiple sources
  multiLanguageSearch: boolean;    // Search in Spanish, French, German, Japanese etc.
  historicalAnalysis: boolean;     // Search across years (2020-2026) for trend mapping
  communityDeepDive: boolean;     // Dedicated Reddit / Quora / niche forum passes
  competitorAdScrape: boolean;    // Facebook Ad Library, Google Ads scraping
  academicSearch: boolean;         // Google Scholar, PubMed for clinical/scientific backing
  maxVisualBatches: number;       // Max visual scout batches per research run
  maxVisualUrls: number;          // Max total URLs to screenshot for visual analysis
  skipReflection: boolean;        // Skip reflection agents (SQ mode — faster)
  singlePassResearch: boolean;    // Exit after first research iteration (SQ mode)
  useSubagents: boolean;          // Spawn parallel SubagentManager workers (NR/EX/MX only)
}

const LIMITS_DEFAULTS: ResearchLimits = {
  maxIterations: 30,
  minIterations: 8,
  coverageThreshold: 0.99,
  minSources: 75,
  maxResearchersPerIteration: 5,
  maxTimeMinutes: 90,
  parallelCompressionCount: 1,
  crossValidation: false,
  multiLanguageSearch: false,
  historicalAnalysis: false,
  communityDeepDive: false,
  competitorAdScrape: false,
  academicSearch: false,
  maxVisualBatches: 0,
  maxVisualUrls: 0,
  skipReflection: false,
  singlePassResearch: false,
  useSubagents: false,
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
    description: 'Surface scan, enough for a quick take',
    time: '~5 min',
    color: 'sky',
    limits: {
      maxIterations: 5,
      minIterations: 2,
      coverageThreshold: 0.55,
      minSources: 8,
      maxResearchersPerIteration: 3,
      maxTimeMinutes: 5,
      parallelCompressionCount: 1,
      crossValidation: false,
      multiLanguageSearch: false,
      historicalAnalysis: false,
      communityDeepDive: false,
      competitorAdScrape: false,
      academicSearch: false,
      maxVisualBatches: 0,
      maxVisualUrls: 0,
      skipReflection: true,
      singlePassResearch: true,
      useSubagents: false,
    },
  },
  {
    id: 'quick',
    label: 'Quick',
    shortLabel: 'QK',
    description: 'Solid overview with real data',
    time: '~30 min',
    color: 'emerald',
    limits: {
      maxIterations: 12,
      minIterations: 4,
      coverageThreshold: 0.75,
      minSources: 25,
      maxResearchersPerIteration: 4,
      maxTimeMinutes: 30,
      parallelCompressionCount: 1,
      crossValidation: false,
      multiLanguageSearch: false,
      historicalAnalysis: false,
      communityDeepDive: false,
      competitorAdScrape: false,
      academicSearch: false,
      maxVisualBatches: 0,
      maxVisualUrls: 0,
      skipReflection: false,
      singlePassResearch: false,
      useSubagents: false,
    },
  },
  {
    id: 'normal',
    label: 'Normal',
    shortLabel: 'NR',
    description: 'Thorough analysis, production quality',
    time: '~90 min',
    color: 'blue',
    limits: {
      maxIterations: 30,
      minIterations: 8,
      coverageThreshold: 0.99,
      minSources: 75,
      maxResearchersPerIteration: 5,
      maxTimeMinutes: 90,
      parallelCompressionCount: 1,
      crossValidation: false,
      multiLanguageSearch: false,
      historicalAnalysis: false,
      communityDeepDive: false,
      competitorAdScrape: false,
      academicSearch: false,
      maxVisualBatches: 1,
      maxVisualUrls: 5,
      skipReflection: false,
      singlePassResearch: false,
      useSubagents: true,
    },
  },
  {
    id: 'extended',
    label: 'Extended',
    shortLabel: 'EX',
    description: 'Deep dive + visual competitor analysis, cross-validation',
    time: '~2 hrs',
    color: 'sky',
    limits: {
      maxIterations: 45,
      minIterations: 12,
      coverageThreshold: 0.99,
      minSources: 200,
      maxResearchersPerIteration: 5,
      maxTimeMinutes: 120,
      parallelCompressionCount: 2,
      crossValidation: true,
      multiLanguageSearch: false,
      historicalAnalysis: false,
      communityDeepDive: true,
      competitorAdScrape: true,
      academicSearch: false,
      maxVisualBatches: 3,
      maxVisualUrls: 15,
      skipReflection: false,
      singlePassResearch: false,
      useSubagents: true,
    },
  },
  {
    id: 'max',
    label: 'Maximum',
    shortLabel: 'MX',
    description: 'Exhaustive — every angle, every source, every language, deep visuals',
    time: '~5 hrs',
    color: 'red',
    limits: {
      maxIterations: 100,
      minIterations: 25,
      coverageThreshold: 0.995,
      minSources: 400,
      maxResearchersPerIteration: 5,
      maxTimeMinutes: 300,
      parallelCompressionCount: 4,
      crossValidation: true,
      multiLanguageSearch: true,
      historicalAnalysis: true,
      communityDeepDive: true,
      competitorAdScrape: true,
      academicSearch: true,
      maxVisualBatches: 5,
      maxVisualUrls: 30,
      skipReflection: false,
      singlePassResearch: false,
      useSubagents: true,
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
  localStorage.setItem('research_cross_validation', String(l.crossValidation));
  localStorage.setItem('research_multi_language', String(l.multiLanguageSearch));
  localStorage.setItem('research_historical_analysis', String(l.historicalAnalysis));
  localStorage.setItem('research_community_deep_dive', String(l.communityDeepDive));
  localStorage.setItem('research_competitor_ad_scrape', String(l.competitorAdScrape));
  localStorage.setItem('research_academic_search', String(l.academicSearch));
  localStorage.setItem('max_visual_batches', String(l.maxVisualBatches));
  localStorage.setItem('max_visual_urls', String(l.maxVisualUrls));
  localStorage.setItem('research_skip_reflection', String(l.skipReflection));
  localStorage.setItem('research_single_pass', String(l.singlePassResearch));
  localStorage.setItem('research_use_subagents', String(l.useSubagents));
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
    crossValidation: getBool('research_cross_validation', LIMITS_DEFAULTS.crossValidation),
    multiLanguageSearch: getBool('research_multi_language', LIMITS_DEFAULTS.multiLanguageSearch),
    historicalAnalysis: getBool('research_historical_analysis', LIMITS_DEFAULTS.historicalAnalysis),
    communityDeepDive: getBool('research_community_deep_dive', LIMITS_DEFAULTS.communityDeepDive),
    competitorAdScrape: getBool('research_competitor_ad_scrape', LIMITS_DEFAULTS.competitorAdScrape),
    academicSearch: getBool('research_academic_search', LIMITS_DEFAULTS.academicSearch),
    maxVisualBatches: getInt('max_visual_batches', LIMITS_DEFAULTS.maxVisualBatches),
    maxVisualUrls: getInt('max_visual_urls', LIMITS_DEFAULTS.maxVisualUrls),
    skipReflection: getBool('research_skip_reflection', LIMITS_DEFAULTS.skipReflection),
    singlePassResearch: getBool('research_single_pass', LIMITS_DEFAULTS.singlePassResearch),
    useSubagents: getBool('research_use_subagents', LIMITS_DEFAULTS.useSubagents),
  };
}

// ─────────────────────────────────────────────────────────────
// Model Tier system — one-click presets for all model assignments
// ─────────────────────────────────────────────────────────────

export type ModelTier = 'light' | 'standard' | 'quality' | 'maximum';

export interface ModelTierDef {
  id: ModelTier;
  label: string;
  description: string;
  /** [fast model, capable model] — fast for compression/extraction, capable for reasoning */
  models: [string, string];
}

export const MODEL_TIERS: ModelTierDef[] = [
  { id: 'light',    label: 'Light',    description: '0.8b + 2b — fastest, least VRAM',   models: ['qwen3.5:0.8b', 'qwen3.5:2b'] },
  { id: 'standard', label: 'Standard', description: '2b + 4b — good balance',            models: ['qwen3.5:2b',   'qwen3.5:4b'] },
  { id: 'quality',  label: 'Quality',  description: '4b + 9b — higher quality output',   models: ['qwen3.5:4b',   'qwen3.5:9b'] },
  { id: 'maximum',  label: 'Maximum',  description: '9b + 27b — best quality, most VRAM', models: ['qwen3.5:9b',  'qwen3.5:27b'] },
];

/** Apply a model tier — sets all stage + research role model assignments */
export function applyModelTier(tierId: ModelTier): void {
  const tier = MODEL_TIERS.find(t => t.id === tierId);
  if (!tier) return;
  const [fast, capable] = tier.models;

  // Stage-level assignments
  const stageAssignments: Record<string, string> = {
    research: capable,
    'brand-dna': capable,
    'persona-dna': capable,
    angles: capable,
    strategy: capable,
    copywriting: capable,
    production: capable,
    test: capable,
    vision: fast,
    thinking: capable,
    planner: capable,
    executor: fast,
  };
  for (const [stage, model] of Object.entries(stageAssignments)) {
    localStorage.setItem(`model_${stage}`, model);
  }

  // Research role assignments
  localStorage.setItem('orchestrator_model', capable);
  localStorage.setItem('researcher_synthesis_model', fast);
  localStorage.setItem('compression_model', fast);
  localStorage.setItem('reflection_model', capable);
  localStorage.setItem('desire_layer_model', capable);
  localStorage.setItem('persona_synthesis_model', capable);
  localStorage.setItem('council_brain_model', capable);

  // Chat model
  localStorage.setItem('chat_model', capable);

  // Vision model
  localStorage.setItem('vision_model', fast);
  localStorage.setItem('thinking_model', capable);
  localStorage.setItem('planner_model', capable);
  localStorage.setItem('executor_model', fast);

  // Store the active tier
  localStorage.setItem('model_tier', tierId);
}

/** Get the active model tier */
export function getActiveModelTier(): ModelTier {
  const stored = localStorage.getItem('model_tier');
  if (stored && MODEL_TIERS.some(t => t.id === stored)) return stored as ModelTier;
  return 'standard';
}

// ─────────────────────────────────────────────────────────────
// Think mode — global toggle for Qwen 3.5 thinking
// ─────────────────────────────────────────────────────────────

/**
 * Context-aware think mode — decides automatically based on task type.
 * No manual toggle needed; the system picks the right mode per situation.
 *
 * Think ON:  orchestrator decisions, synthesis, strategy, complex analysis
 * Think OFF: compression, extraction, title generation, vision, small models, greetings
 */
export type ThinkContext =
  | 'orchestrator'    // deciding what to research next → think
  | 'synthesis'       // synthesizing research findings → think
  | 'reflection'      // evaluating coverage gaps → think
  | 'strategy'        // creative/brand strategy → think
  | 'analysis'        // deep analysis tasks → think
  | 'compression'     // page compression → no think
  | 'extraction'      // fact extraction → no think
  | 'title'           // auto-title generation → no think
  | 'vision'          // image analysis → no think
  | 'fast'            // 0.8b fast path, greetings → no think
  | 'executor'        // plan-act executor → no think
  | 'chat';           // casual chat → no think

const THINK_CONTEXTS: Record<ThinkContext, boolean> = {
  orchestrator: true,
  synthesis: true,
  reflection: true,
  strategy: true,
  analysis: true,
  compression: false,
  extraction: false,
  title: false,
  vision: false,
  fast: false,
  executor: false,
  chat: false,
};

/** Get think mode for a given context. Defaults to false for unknown contexts. */
export function getThinkMode(context?: ThinkContext): boolean {
  if (!context) return false;
  return THINK_CONTEXTS[context] ?? false;
}

/** @deprecated — think mode is now automatic. Kept for settings UI compat. */
export function setThinkMode(_enabled: boolean): void {
  // no-op — think mode is context-driven now
}

// ─────────────────────────────────────────────────────────────
// Ollama endpoint URL — configurable via Settings
// ─────────────────────────────────────────────────────────────

/** Get the user-configured Ollama endpoint (or default) */
export function getOllamaEndpoint(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('ollama_endpoint');
    if (stored) return stored;
  }
  return INFRASTRUCTURE.ollamaUrl;
}

/** Set the Ollama endpoint URL */
export function setOllamaEndpoint(url: string): void {
  localStorage.setItem('ollama_endpoint', url);
}

// ─────────────────────────────────────────────────────────────
// Agent max duration
// ─────────────────────────────────────────────────────────────

export type AgentDuration = '30m' | '1h' | '2h' | '5h' | 'unlimited';

export const AGENT_DURATION_OPTIONS: { value: AgentDuration; label: string }[] = [
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '5h', label: '5 hours' },
  { value: 'unlimited', label: 'Unlimited' },
];

export function getAgentMaxDuration(): AgentDuration {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('agent_max_duration');
    if (stored && AGENT_DURATION_OPTIONS.some(o => o.value === stored)) return stored as AgentDuration;
  }
  return '5h';
}

export function setAgentMaxDuration(dur: AgentDuration): void {
  localStorage.setItem('agent_max_duration', dur);
}

// ─────────────────────────────────────────────────────────────
// Workspace path
// ─────────────────────────────────────────────────────────────

export function getWorkspacePath(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('workspace_path') || '';
  }
  return '';
}

export function setWorkspacePath(path: string): void {
  localStorage.setItem('workspace_path', path);
}

// ─────────────────────────────────────────────────────────────
// localStorage migration — clears dead keys from old versions
// ─────────────────────────────────────────────────────────────

const MIGRATION_VERSION = 2;

/** Run once on first load — removes dead localStorage keys from old model configs */
export function runSettingsMigration(): void {
  if (typeof window === 'undefined') return;
  const migrated = parseInt(localStorage.getItem('settings_migration_version') || '0');
  if (migrated >= MIGRATION_VERSION) return;

  // Dead keys from old model families (GLM, LFM, gpt-oss, minicpm)
  const deadKeys = [
    'research_model',         // replaced by per-role keys + tier system
    'ollama_host',            // replaced by ollama_endpoint
    'model_glm',
    'model_lfm',
    'model_gpt_oss',
    'model_minicpm',
    'glm_model',
    'lfm_model',
    'gpt_oss_model',
    'minicpm_model',
    'minicpm_v_model',
    'vision_model_minicpm',
  ];

  for (const key of deadKeys) {
    localStorage.removeItem(key);
  }

  localStorage.setItem('settings_migration_version', String(MIGRATION_VERSION));
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
  // MX-tier brains
  data: 0.3,
  meme: 0.95,
  luxury: 0.6,
  scrappy: 0.9,
  psychology: 0.5,
  cultural: 0.8,
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

// ─────────────────────────────────────────────────────────────
// Council scaling config — brain/head count per preset
// ─────────────────────────────────────────────────────────────

export interface CouncilScalingConfig {
  skipCouncil: boolean;          // SQ/QK: skip council entirely
  brainIds: string[];            // which brains to run
  councilHeadCount: number;      // how many heads synthesize
  councilHeadIds: string[];      // which head IDs to use
  creativeEngineEnabled: boolean; // run creative engine after verdict
}

/**
 * Get council scaling config based on the active research preset.
 * SQ/QK: skip council entirely, just use orchestrator decisions
 * NR: 4 brains -> 1 verdict (via single head pass)
 * EX: 7 brains -> 2 council heads -> 1 verdict
 * MX: 12+ brains -> 4 council heads -> 1 master verdict
 */
export function getCouncilScaling(): CouncilScalingConfig {
  const preset = getActiveResearchPreset();

  switch (preset) {
    case 'super-quick':
    case 'quick':
      return {
        skipCouncil: true,
        brainIds: [],
        councilHeadCount: 0,
        councilHeadIds: [],
        creativeEngineEnabled: false,
      };
    case 'normal':
      return {
        skipCouncil: false,
        brainIds: ['desire', 'persuasion', 'creative', 'contrarian'],
        councilHeadCount: 1,
        councilHeadIds: ['strategy-head'],
        creativeEngineEnabled: true,
      };
    case 'extended':
      return {
        skipCouncil: false,
        brainIds: ['desire', 'persuasion', 'offer', 'creative', 'avatar', 'contrarian', 'visual'],
        councilHeadCount: 2,
        councilHeadIds: ['strategy-head', 'creative-head'],
        creativeEngineEnabled: true,
      };
    case 'max':
      return {
        skipCouncil: false,
        brainIds: [
          'desire', 'persuasion', 'offer', 'creative', 'avatar', 'contrarian', 'visual',
          'data', 'meme', 'luxury', 'scrappy', 'psychology', 'cultural',
        ],
        councilHeadCount: 4,
        councilHeadIds: ['strategy-head', 'creative-head', 'challenge-head', 'culture-head'],
        creativeEngineEnabled: true,
      };
    default:
      // custom or unknown — use NR defaults
      return {
        skipCouncil: false,
        brainIds: ['desire', 'persuasion', 'creative', 'contrarian'],
        councilHeadCount: 1,
        councilHeadIds: ['strategy-head'],
        creativeEngineEnabled: true,
      };
  }
}
