export type StageName = 'research' | 'objections' | 'taste' | 'make' | 'test' | 'memories';
export type CycleMode = 'full' | 'concepting'; // full = all stages, concepting = research + objections + taste only
export type StageStatus = 'pending' | 'in-progress' | 'complete';
export type CampaignStatus = 'active' | 'paused' | 'archived';
export type CycleStatus = 'in-progress' | 'complete';
export type SystemStatus = 'idle' | 'running' | 'paused' | 'error';

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
  visionRawOutput?: string; // Full minicpm-v output for inspection
  error?: string;
}

// ─ Competitor product intelligence (autonomous multi-product analysis) ─
export interface CrawledProduct {
  url: string;
  name: string;       // Inferred from URL or link text
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
  elapsed: number;      // ms
  error?: string;
}

// Desire-driven selling framework
export interface DesireLayer {
  level: number; // 1 = surface problem, 2+ = deeper layers
  description: string;
  example: string;
}

export interface DeepDesire {
  surfaceProblem: string;
  layers: DesireLayer[];
  deepestDesire: string;
  desireIntensity: 'low' | 'moderate' | 'high' | 'extreme';
  turningPoint: string; // The moment desire becomes unbearable — highest conversion point
  amplifiedDesireType: 'loved_ones' | 'identity_status' | 'survival' | 'other'; // What category of amplified desire
  targetSegment: string; // Narrow sub-avatar, not broad audience
}

export type MarketSophisticationLevel = 1 | 2 | 3 | 4;

export interface RootCauseMechanism {
  rootCause: string; // What's ACTUALLY wrong beneath the symptoms
  mechanism: string; // HOW the solution fixes it (theory, not product)
  chainOfYes: string[]; // Sequential YES statements that build belief
  ahaInsight: string; // The reframe that changes everything
}

export interface Objection {
  objection: string;
  frequency: 'common' | 'moderate' | 'rare';
  impact: 'high' | 'medium' | 'low';
  handlingApproach: string;
  requiredProof: string[];
  rootCauseAnswer?: string; // How the root cause mechanism addresses this objection
}

export interface AvatarPersona {
  name: string; // Fictional name for this sub-avatar
  age: string; // Age range
  situation: string; // Life situation (married, kids, career stage)
  identity: string; // How they see themselves
  dailyLife: string; // What does a typical day look like?
  painNarrative: string; // Their pain story in FIRST PERSON (their words)
  turningPointMoment: string; // The exact moment they decide to buy
  innerMonologue: string; // What they think but don't say out loud
  purchaseJourney: string; // How they'd actually find and buy this product
  socialInfluence: string; // What friends/family/spouse think about the purchase
  failedSolutions: string[]; // Specific things they tried + why each failed
  languagePatterns: string[]; // How they talk about the problem (verbatim)
  deepDesire: string; // Their deepest desire
  biggestFear: string; // What they're most afraid of if they DON'T act
}

export interface VisualAnalysis {
  url: string;
  analysisTimestamp: number;
  dominantColors: string[];       // e.g., ["deep navy", "gold accents", "white space"]
  layoutStyle: string;            // e.g., "clean minimalist with hero image"
  visualTone: string;             // e.g., "premium clinical" or "warm lifestyle"
  keyVisualElements: string[];    // e.g., ["before-after images", "trust badges"]
  textOverlayStyle: string;       // e.g., "bold sans-serif headlines over imagery"
  ctaStyle: string;               // e.g., "prominent orange button, urgency text"
  overallImpression: string;      // 2-3 sentence summary of visual strategy
  competitiveInsight: string;     // What this reveals about competitor strategy
}

export interface VisualFindings {
  competitorVisuals: VisualAnalysis[];
  commonPatterns: string[];               // Visual patterns across competitors
  visualGaps: string[];                   // What NO competitor is doing visually
  recommendedDifferentiation: string[];   // How to look different
  analysisModel: string;                  // "minicpm-v:8b"
  totalScreenshots: number;
  totalAnalyzed: number;
}

export interface AdExample {
  adCopy: string;
  headline?: string;
  cta?: string;
  hookAngle: string;       // "pain-agitate-solution" | "social-proof" | "before-after" | "curiosity" | "authority" | "urgency" | "lifestyle"
  emotionalDriver: string; // "fear of failure" | "aspiration" | "social belonging" | "identity" | "urgency"
  offerStructure?: string; // "30-day free trial" | "50% off" | "money-back guarantee"
  estimatedLongevity?: string; // "90+ days (proven converter)" | "newly launched" | "unknown"
  sourceUrl: string;
  visualAnalysis?: string; // minicpm-v raw output for this specific creative
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
    unusedAngles: string[];   // creative opportunities — what NO competitor does
    dominantFormats: string[];
    commonOffers: string[];
  };
  visionAnalyzed: number;
}

// ─ Taste Stage: Creative Direction ─
export interface TasteFindings {
  brandVoice: string;                    // How the brand speaks (e.g., "authority + friendly")
  recommendedColors: string[];           // e.g., ["deep navy", "gold", "white"]
  brandTone: string;                     // e.g., "premium clinical" or "warm lifestyle"
  positioning: string;                   // Market position statement
  recommendedCopyAngles: string[];       // e.g., ["transformation", "social proof", "exclusivity"]
  visualStyle: string;                   // e.g., "minimalist + bold typography"
  adFormats: string[];                   // e.g., ["static image", "carousel", "video testimonial"]
  unusedEmotionalSpace: string[];        // What emotions competitors don't target
}

// ─ Make Stage: Ad Concepts ─
export interface AdConcept {
  conceptNumber: number;                 // 1, 2, or 3
  hookAngle: string;                     // from unusedAngles (e.g., "before-after")
  emotionalDriver: string;               // from validated emotions
  headline: string;
  body: string;                          // 2-3 sentences
  cta: string;                           // button text
  offer?: string;                        // if applicable
  adFormat: string;                      // e.g., "static image" or "carousel"
  visualDirection: string;               // e.g., "lifestyle hero + product detail"
  colors: string[];                      // from taste
  mjml: string;                          // MJML markup for layout
  html?: string;                         // Compiled HTML (generated later)
  rationale: string;                     // Why this angle + emotion combo works
}

export interface MakeOutput {
  concepts: AdConcept[];
  adDimensions: string[];                // aspect ratios used (e.g., ["1:1", "9:16"])
  processingTime: number;
}

export interface ResearchFindings {
  deepDesires: DeepDesire[];
  objections: Objection[];
  avatarLanguage: string[]; // Verbatim phrases from real people, not brand language
  whereAudienceCongregates: string[];
  whatTheyTriedBefore: string[]; // Failed solutions + WHY they failed
  competitorWeaknesses: string[];
  marketSophistication?: MarketSophisticationLevel; // 1-4 determines messaging strategy
  rootCauseMechanism?: RootCauseMechanism; // The belief-building chain
  verbatimQuotes?: string[]; // Raw customer quotes from Reddit, Trustpilot, forums
  persona?: AvatarPersona; // Detailed sub-avatar persona synthesis
  visualFindings?: VisualFindings; // Visual intelligence from competitor screenshots
  competitorAds?: CompetitorAdIntelligence; // Competitor ad creative intelligence
}

export interface StageData {
  status: StageStatus;
  agentOutput: string;
  processedOutput?: string; // Final processed output for downstream stages (separate from agentOutput which shows thought process)
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

// Interactive question system — AI asks the user for direction at key checkpoints
export type QuestionCheckpoint = 'pre-research' | 'mid-pipeline' | 'pre-make';

export interface UserQuestion {
  id: string;
  question: string;
  options: string[]; // 3 AI-generated options (user can also type custom)
  checkpoint: QuestionCheckpoint;
  context?: string; // Brief summary of why the AI is asking this
}

export interface UserQuestionAnswer {
  questionId: string;
  answer: string; // The selected option text or custom text
  checkpoint: QuestionCheckpoint;
}

export interface Cycle {
  id: string;
  campaignId: string;
  cycleNumber: number;
  startedAt: number;
  completedAt: number | null;
  stages: {
    research: StageData;
    objections: StageData;
    taste: StageData;
    make: StageData;
    test: StageData;
    memories: StageData;
  };
  currentStage: StageName;
  status: CycleStatus;
  mode: CycleMode;
  researchFindings?: ResearchFindings;
  pendingResearchQuestion?: ResearchQuestion; // When research pauses for clarification
}

export type ResearchMode = 'interactive' | 'autonomous';

export interface Campaign {
  id: string;
  brand: string;
  targetAudience: string;
  marketingGoal: string;
  productDescription: string;
  productFeatures: string[];
  productPrice?: string;
  researchMode: ResearchMode; // interactive = ask user for clarifications, autonomous = figure it out
  maxResearchIterations: number; // max rounds before giving up (default: 5)
  maxResearchTimeMinutes: number; // max total research time in minutes (default: 10)
  currentCycle: number;
  createdAt: number;
  updatedAt: number;
  status: CampaignStatus;
  adDimensions?: string[];               // e.g., ["1:1", "9:16", "16:9"] — defaults to ["1:1", "9:16"]
  brandColors?: string;                  // Brand color palette + psychology (e.g., "Sage green (trust), charcoal (authority)")
  brandFonts?: string;                   // Brand fonts + usage (e.g., "Inter for body, Playfair for headlines")
  brandDNA?: Record<string, string>;     // All extra form fields from detailed campaign setup
  presetData?: Record<string, any>;      // Full preset object (brand, audience, product, competitive, messaging, platforms, etc.)
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

  // Interactive question system
  pendingQuestion: UserQuestion | null;
  questionAnswers: UserQuestionAnswer[];
  answerQuestion: (answer: string) => void;

  // Research review system (interactive mode)
  reviewingStage: StageName | null;
  reviewFindings: ResearchFindings | null;
  resumeAfterReview: (updatedFindings?: ResearchFindings) => void;

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
    brandDNA?: Record<string, string>
  ) => Promise<void>;
  startCycle: () => Promise<void>;
  pauseCycle: () => void;
  resumeCycle: () => void;
  completeStage: (stageName: StageName, output: string) => Promise<void>;
  setCampaign: (campaign: Campaign) => void;
}
