export type StageName = 'research' | 'objections' | 'taste' | 'make' | 'test' | 'memories';
export type CycleMode = 'full' | 'concepting'; // full = all stages, concepting = research + objections + taste only
export type StageStatus = 'pending' | 'in-progress' | 'complete';
export type CampaignStatus = 'active' | 'paused' | 'archived';
export type CycleStatus = 'in-progress' | 'complete';
export type SystemStatus = 'idle' | 'running' | 'paused' | 'error';

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
    maxResearchTimeMinutes?: number
  ) => Promise<void>;
  startCycle: () => Promise<void>;
  pauseCycle: () => void;
  resumeCycle: () => void;
  completeStage: (stageName: StageName, output: string) => Promise<void>;
  setCampaign: (campaign: Campaign) => void;
}
