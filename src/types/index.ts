// ══════════════════════════════════════════════════════
// ██  NOMADS — Pipeline Stage Types
// ══════════════════════════════════════════════════════

export type StageName =
  | 'research'      // Deep agentic web scraping
  | 'brand-dna'     // Brand identity crystallized from research (hybrid: LLM + user edit)
  | 'persona-dna'   // Detailed customer personas from research (hybrid)
  | 'angles'        // Tiered brainstorm: 50+ ideas → ranked top 10-15, user picks
  | 'strategy'      // Evaluate selected angles — feasibility, execution plan
  | 'copywriting'   // Create messaging per angle — headlines, CTAs, callouts
  | 'production'    // Generate actual ads (Freepik/HTML pipelines)
  | 'test';         // Evaluate produced ads, rank, pick winners

export type CycleMode = 'full' | 'concepting';
// full = all 8 stages
// concepting = research + brand-dna + persona-dna + angles only

export type StageStatus = 'pending' | 'in-progress' | 'complete';
export type CampaignStatus = 'active' | 'paused' | 'archived';
export type CycleStatus = 'in-progress' | 'complete';
export type SystemStatus = 'idle' | 'running' | 'error';

// ─ Ad Library ─
export interface AdLibraryImage {
  filename: string;
  category: string;
  path: string;  // relative path from /ad-library/
  aspectRatio?: string;  // e.g., "1:1", "9:16", "16:9"
  base64?: string;  // loaded on demand
}

// ─ Product page analysis (screenshot + vision + GLM) ─
export interface ProductPageAnalysis {
  url: string;
  productName: string;
  description?: string;
  ingredients?: string[];
  pricing?: { tier: string; price: string; discount?: string }[];
  testimonials?: { text: string; author: string; rating?: number }[];
  guarantees?: string[];
  features?: string[];
  scents?: string[];
  brand_messaging?: string;
  socialProof?: { metric: string; value: string }[];
  visionRawOutput?: string;
  error?: string;
}

// ─ Competitor product intelligence ─
export interface CrawledProduct {
  url: string;
  name: string;
}

export interface CompetitorProductIntelligence {
  brand: string;
  domain: string;
  products: ProductPageAnalysis[];
  summary: {
    totalProducts: number;
    avgPrice?: string;
    priceRange?: string;
    commonIngredients?: string[];
    commonFeatures?: string[];
    brandPositioning?: string;
    guarantees?: string[];
    socialProofHighlights?: string[];
  };
  crawledUrls: string[];
  visionAnalyzed: number;
  elapsed: number;
  error?: string;
}

// ══════════════════════════════════════════════════════
// ██  Research Stage Types
// ══════════════════════════════════════════════════════

export interface DesireLayer {
  level: number;
  description: string;
  example: string;
}

export interface DeepDesire {
  id: string;                   // Stable ID for linking ads/angles to this desire
  surfaceProblem: string;
  layers: DesireLayer[];
  deepestDesire: string;
  desireIntensity: 'low' | 'moderate' | 'high' | 'extreme';
  turningPoint: string;
  amplifiedDesireType: 'loved_ones' | 'identity_status' | 'survival' | 'other';
  targetSegment: string;
}

export type MarketSophisticationLevel = 1 | 2 | 3 | 4;

export interface RootCauseMechanism {
  rootCause: string;
  mechanism: string;
  chainOfYes: string[];
  ahaInsight: string;
}

export interface Objection {
  objection: string;
  frequency: 'common' | 'moderate' | 'rare';
  impact: 'high' | 'medium' | 'low';
  handlingApproach: string;
  requiredProof: string[];
  rootCauseAnswer?: string;
}

export interface AvatarPersona {
  name: string;
  age: string;
  situation: string;
  identity: string;
  dailyLife: string;
  painNarrative: string;
  turningPointMoment: string;
  innerMonologue: string;
  purchaseJourney: string;
  socialInfluence: string;
  failedSolutions: string[];
  languagePatterns: string[];
  deepDesire: string;
  biggestFear: string;
}

export interface VisualAnalysis {
  url: string;
  analysisTimestamp: number;
  dominantColors: string[];
  layoutStyle: string;
  visualTone: string;
  keyVisualElements: string[];
  textOverlayStyle: string;
  ctaStyle: string;
  overallImpression: string;
  competitiveInsight: string;
}

export interface VisualFindings {
  competitorVisuals: VisualAnalysis[];
  commonPatterns: string[];
  visualGaps: string[];
  recommendedDifferentiation: string[];
  analysisModel: string;
  totalScreenshots: number;
  totalAnalyzed: number;
}

export interface AdExample {
  adCopy: string;
  headline?: string;
  cta?: string;
  hookAngle: string;
  emotionalDriver: string;
  offerStructure?: string;
  estimatedLongevity?: string;
  sourceUrl: string;
  visualAnalysis?: string;
}

export interface CompetitorProfile {
  brand: string;
  estimatedActiveAds?: number;
  adExamples: AdExample[];
  dominantAngles: string[];
  positioning: string;
}

export interface CompetitorAdIntelligence {
  competitors: CompetitorProfile[];
  industryPatterns: {
    dominantHooks: string[];
    commonEmotionalDrivers: string[];
    unusedAngles: string[];
    dominantFormats: string[];
    commonOffers: string[];
  };
  visionAnalyzed: number;
}

// ─ Purchase Journey Mapping (Layer 4) ─
export interface PurchaseJourneyMap {
  searchTerms: string[];              // What they actually Google
  reviewSites: string[];              // Where they read reviews
  comparisonCriteria: string[];       // What they compare products on
  decisionInfluencers: string[];      // Who/what influences the final decision
  abandonmentReasons: string[];       // Why they bail mid-funnel
  typicalTimeline: string;            // "2 weeks from awareness to purchase"
  firstTouchpoint: string;            // Where they first hear about solutions
  finalTrigger: string;               // The last push before buying
}

// ─ Emotional Landscape (Layer 5) ─
export interface EmotionalLandscape {
  primaryEmotion: string;             // Dominant feeling driving the purchase
  secondaryEmotions: string[];        // Supporting emotions (guilt, hope, etc.)
  identitySignal: string;             // What buying this says about them
  socialPressure: string;             // External pressure to solve/not solve
  shameTriggers: string[];            // What makes them feel bad about the problem
  hopeTriggers: string[];             // What makes them believe change is possible
  emotionalArc: string;               // Before → during → after purchase feeling
}

// ─ Competitive Positioning (Layer 6) ─
export interface CompetitorPosition {
  name: string;
  positioning: string;                // Their core claim
  trappedBy: string;                  // What they can't change without breaking their brand
  adHooks: string[];                  // What hooks they use in advertising
  pricing: string;                    // Price point / strategy
  structuralWeakness: string;         // Fundamental limitation they can't fix
  whatTheyOwn: string;                // The mental real estate they occupy
  customerComplaint: string;          // Top complaint from real reviews
}

// Research audit trail — tracks where findings came from
export interface ResearchSource {
  url: string;
  query: string;              // what search query found this
  source: 'text' | 'visual' | 'meta-ads' | 'reddit' | 'academic' | 'web';
  fetchedAt: number;          // timestamp
  contentLength?: number;     // bytes of content
  extractedSnippet?: string;  // key excerpt
}

export interface ResearchAuditTrail {
  totalSources: number;                    // unique URLs visited
  sourcesByType: Record<string, number>;   // { 'text': 150, 'visual': 5, 'reddit': 20 }
  sourceList: ResearchSource[];            // full list with metadata
  modelsUsed: string[];                    // which models processed this data
  totalTokensGenerated: number;            // sum of all tokens across all phases
  tokensByModel: Record<string, number>;   // { 'qwen3.5:2b': 50000, 'qwen3.5:9b': 120000 }
  phaseTimes: Record<string, number>;      // { 'web-research': 180, 'desire-analysis': 45, ... }
  researchDuration: number;                // total milliseconds
  preset: string;                          // which research preset was used
  iterationsCompleted: number;
  coverageAchieved: number;                // 0-1 scale
}

export interface ResearchFindings {
  deepDesires: DeepDesire[];
  objections: Objection[];
  avatarLanguage: string[];
  whereAudienceCongregates: string[];
  whatTheyTriedBefore: string[];
  competitorWeaknesses: string[];
  marketSophistication?: MarketSophisticationLevel;
  rootCauseMechanism?: RootCauseMechanism;
  verbatimQuotes?: string[];
  persona?: AvatarPersona;
  visualFindings?: VisualFindings;
  competitorAds?: CompetitorAdIntelligence;
  // New deep research layers
  purchaseJourney?: PurchaseJourneyMap;
  emotionalLandscape?: EmotionalLandscape;
  competitivePositioning?: CompetitorPosition[];
  // Council of Marketing Brains output
  councilVerdict?: any;  // CouncilVerdict from council.ts (avoid circular import)
  // Research audit trail — complete provenance
  auditTrail?: ResearchAuditTrail;
  // Research report — generated mini research paper
  researchReport?: ResearchReport;
}

// ══════════════════════════════════════════════════════
// ██  Research Report — Mini Research Paper
// ══════════════════════════════════════════════════════

export interface KeyInsight {
  category: 'market' | 'audience' | 'competitor' | 'emotional' | 'behavioral' | 'opportunity';
  insight: string;
  supportingSources: string[];
  confidence: number;  // 0-100
  verbatimEvidence: string[];
}

export interface Contradiction {
  topic: string;
  claimA: { text: string; source: string };
  claimB: { text: string; source: string };
  resolution?: string;
}

export interface SourceCitation {
  url: string;
  title: string;
  relevanceScore: number;  // 0-100
  citedInInsights: number[];
  fetchedAt: number;
  contentType: string;
}

export interface ResearchReport {
  executiveSummary: string;
  keyInsights: KeyInsight[];
  sources: SourceCitation[];
  contradictions: Contradiction[];
  confidenceScore: number;  // 0-100 overall
  confidenceByDimension: Record<string, number>;
  methodology: string;
  limitations: string[];
  generatedAt: number;
}

// ══════════════════════════════════════════════════════
// ██  Brand DNA — Crystallized from Research
// ══════════════════════════════════════════════════════

export interface StyleDNA {
  sourceImages: string[];        // filenames/paths analyzed
  layoutPatterns: string[];      // "centered product", "split layout"
  colorPalette: string[];        // extracted hex codes
  typographyStyle: string;       // "bold sans-serif headlines"
  moodAndTone: string;           // "clean minimal", "bold maximalist"
  compositionRules: string[];    // "product takes 40%+ of frame"
  textPlacement: string[];       // "headline top-left", "CTA bottom-center"
  rawAnalysis: string;           // full vision model output
}

export interface BrandDNA {
  name: string;
  tagline: string;
  mission: string;
  values: string[];
  voiceTone: string;
  personality: string;
  positioning: string;
  visualIdentity: {
    primaryColors: string[];
    accentColors: string[];
    fonts: string[];
    logoDescription: string;
    moodKeywords: string[];
  };
  styleDNA?: StyleDNA;
  differentiators: string[];
  rawLLMDraft: string;
}

// ══════════════════════════════════════════════════════
// ██  Persona DNA — Detailed Customer Personas
// ══════════════════════════════════════════════════════

export interface PersonaDNA {
  id: string;
  name: string;                  // "Sarah, 34, working mom"
  demographics: string;
  psychographics: string;
  painPoints: string[];
  desires: string[];
  language: string[];            // actual phrases they use
  objections: string[];
  mediaHabits: string;
  buyingTriggers: string[];
  dayInLife: string;
  rawLLMDraft: string;
}

// ══════════════════════════════════════════════════════
// ██  Angles — Tiered Brainstorm
// ══════════════════════════════════════════════════════

export type AngleType = 'desire' | 'objection' | 'social-proof' | 'mechanism' | 'contrast' | 'story' | 'urgency' | 'identity';

export interface AngleIdea {
  id: string;
  hook: string;                  // 1-line angle summary
  type: AngleType;
  targetPersona: string;         // persona id
  emotionalLever: string;
  rationale: string;
  strength: number;              // 1-10 auto-ranked
  selected: boolean;             // user picked this
  desireId?: string;             // Links angle to specific DeepDesire
}

// ══════════════════════════════════════════════════════
// ██  Strategy — Angle Evaluation
// ══════════════════════════════════════════════════════

export interface StrategyEval {
  angleId: string;
  feasibility: 'high' | 'medium' | 'low';
  executionPlan: string;
  strengths: string[];
  weaknesses: string[];
  requirements: string[];        // "needs testimonial", "needs product close-up"
  recommendedFormats: string[];  // "9:16 story", "1:1 feed"
  verdict: string;
}

// ══════════════════════════════════════════════════════
// ██  Copywriting — Messaging per Angle
// ══════════════════════════════════════════════════════

export interface CopyBlock {
  id: string;
  angleId: string;
  variant: number;               // 1, 2, 3 per angle
  headline: string;
  subtext: string;
  cta: string;
  callouts: string[];
  bodyText?: string;
  tone: string;
  personaId: string;
  desireId?: string;             // Inherited from parent angle
}

// ══════════════════════════════════════════════════════
// ██  Creative Strategy — Bridge Framework
// ══════════════════════════════════════════════════════

export interface CreativeStrategy {
  currentState: {
    painPoints: string[];
    frustrations: string[];
    triedBefore: string[];
    emotionalState: string;
  };
  bridge: {
    mechanism: string;
    uniqueAngle: string;
    proofPoints: string[];
  };
  desiredState: {
    desires: string[];
    transformation: string;
    turningPoints: string[];
  };
  idealLife: {
    vision: string;
    identity: string;
  };
  messaging: {
    headlines: string[];
    proofHierarchy: string[];
    conversationStarters: string[];
    toneAndVoice: string;
  };
  awarenessLevel: string;
  positioningStatement: string;
}

// ══════════════════════════════════════════════════════
// ██  Test Stage — Creative Evaluation Verdict
// ══════════════════════════════════════════════════════

export interface TestConceptScore {
  desireActivation: number;     // 1-10
  rootCauseReveal: number;      // 1-10
  emotionalLogical: number;     // 1-10
  audienceLanguage: number;     // 1-10
  competitiveDiff: number;      // 1-10
}

export interface TestConceptVerdict {
  name: string;
  scores: TestConceptScore;
  totalScore: number;
  verdict: 'lead' | 'test' | 'skip';
  notes: string;
}

export interface TestVerdict {
  concepts: TestConceptVerdict[];
  winner: string;
  nextCycleImprovement: string;
}

// ══════════════════════════════════════════════════════
// ██  Legacy Taste/Make types (kept for compatibility)
// ══════════════════════════════════════════════════════

export interface TasteFindings {
  brandVoice: string;
  recommendedColors: string[];
  brandTone: string;
  positioning: string;
  recommendedCopyAngles: string[];
  visualStyle: string;
  adFormats: string[];
  unusedEmotionalSpace: string[];
}

export interface AdConcept {
  conceptNumber: number;
  hookAngle: string;
  emotionalDriver: string;
  headline: string;
  body: string;
  cta: string;
  offer?: string;
  adFormat: string;
  visualDirection: string;
  colors: string[];
  mjml: string;
  html?: string;
  rationale: string;
}

export interface MakeOutput {
  concepts: AdConcept[];
  adDimensions: string[];
  processingTime: number;
}

// ══════════════════════════════════════════════════════
// ██  Stage + Cycle Core Types
// ══════════════════════════════════════════════════════

export interface StageData {
  status: StageStatus;
  agentOutput: string;
  processedOutput?: string;
  rawOutput?: string;
  model?: string;
  tokensUsed?: number;
  processingTime?: number;
  artifacts: any[];
  startedAt: number | null;
  completedAt: number | null;
  readyForNext: boolean;
}

export interface ResearchQuestion {
  question: string;
  context: string;
  suggestedAnswers?: string[];
}

export type QuestionCheckpoint = 'pre-research' | 'mid-pipeline' | 'pre-make';

export interface UserQuestion {
  id: string;
  question: string;
  options: string[];
  checkpoint: QuestionCheckpoint;
  context?: string;
}

export interface UserQuestionAnswer {
  questionId: string;
  answer: string;
  checkpoint: QuestionCheckpoint;
}

export interface Cycle {
  id: string;
  campaignId: string;
  cycleNumber: number;
  startedAt: number;
  completedAt: number | null;
  stages: Record<StageName, StageData>;
  currentStage: StageName;
  status: CycleStatus;
  mode: CycleMode;
  // Research output
  researchFindings?: ResearchFindings;
  pendingResearchQuestion?: ResearchQuestion;
  // DNA stages (hybrid: LLM drafts, user edits)
  brandDNA?: BrandDNA;
  personas?: PersonaDNA[];
  // Angles + downstream
  angles?: AngleIdea[];
  strategies?: StrategyEval[];
  copyBlocks?: CopyBlock[];
  creativeStrategy?: CreativeStrategy;
  // Test stage verdict
  testVerdict?: TestVerdict;
}

export type ResearchMode = 'interactive' | 'autonomous';

export interface ReferenceImage {
  base64: string;
  label: string;
  description: string;
  type: 'product' | 'layout';
}

export interface Campaign {
  id: string;
  brand: string;
  targetAudience: string;
  marketingGoal: string;
  productDescription: string;
  productFeatures: string[];
  productPrice?: string;
  researchMode: ResearchMode;
  maxResearchIterations: number;
  maxResearchTimeMinutes: number;
  currentCycle: number;
  createdAt: number;
  updatedAt: number;
  status: CampaignStatus;
  adDimensions?: string[];
  brandColors?: string;
  brandFonts?: string;
  brandDNA?: Record<string, string>;
  presetData?: Record<string, any>;
  referenceImages?: ReferenceImage[];
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export interface CampaignContextType {
  campaign: Campaign | null;
  cycles: Cycle[];
  currentCycle: Cycle | null;
  systemStatus: SystemStatus;
  error: string | null;
  isLoaded: boolean;

  // Interactive question system
  pendingQuestion: UserQuestion | null;
  questionAnswers: UserQuestionAnswer[];
  answerQuestion: (answer: string) => void;

  // Actions
  createCampaign: (
    brand: string,
    audience: string,
    goal: string,
    productDescription: string,
    productFeatures: string[],
    productPrice?: string,
    researchMode?: 'interactive' | 'autonomous',
    maxResearchIterations?: number,
    maxResearchTimeMinutes?: number,
    brandColors?: string,
    brandFonts?: string,
    brandDNA?: Record<string, string>,
    presetData?: Record<string, any>
  ) => Promise<void>;
  updateCampaign: (updates: Partial<Campaign>) => Promise<void>;
  startCycle: () => Promise<void>;
  stopCycle: () => void;
  clearCampaign: () => void;
  resetResearch: () => Promise<void>;
  loadCampaignById: (id: string) => Promise<void>;
  completeStage: (stageName: StageName, output: string) => Promise<void>;
  setCampaign: (campaign: Campaign) => void;
}
