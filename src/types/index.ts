export type StageName = 'research' | 'objections' | 'taste' | 'make' | 'test' | 'memories';
export type CycleMode = 'full' | 'concepting'; // full = all stages, concepting = research + objections + taste only
export type StageStatus = 'pending' | 'in-progress' | 'complete';
export type CampaignStatus = 'active' | 'paused' | 'archived';
export type CycleStatus = 'in-progress' | 'complete';
export type SystemStatus = 'idle' | 'running' | 'paused' | 'error';

// Desire-driven selling framework (from Zakaria Course)
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
  targetSegment: string;
}

export interface Objection {
  objection: string;
  frequency: 'common' | 'moderate' | 'rare';
  impact: 'high' | 'medium' | 'low';
  handlingApproach: string;
  requiredProof: string[];
}

export interface ResearchFindings {
  deepDesires: DeepDesire[];
  objections: Objection[];
  avatarLanguage: string[];
  whereAudienceCongregates: string[];
  whatTheyTriedBefore: string[];
  competitorWeaknesses: string[];
}

export interface StageData {
  status: StageStatus;
  agentOutput: string;
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

  // Actions
  createCampaign: (
    brand: string,
    audience: string,
    goal: string,
    productDescription: string,
    productFeatures: string[],
    productPrice?: string,
    researchMode?: 'interactive' | 'autonomous',
    maxResearchIterations?: number
  ) => Promise<void>;
  startCycle: () => Promise<void>;
  pauseCycle: () => void;
  resumeCycle: () => void;
  completeStage: (stageName: StageName, output: string) => Promise<void>;
  setCampaign: (campaign: Campaign) => void;
}
