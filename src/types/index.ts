export type StageName = 'research' | 'taste' | 'make' | 'test' | 'memories';
export type StageStatus = 'pending' | 'in-progress' | 'complete';
export type CampaignStatus = 'active' | 'paused' | 'archived';
export type CycleStatus = 'in-progress' | 'complete';
export type SystemStatus = 'idle' | 'running' | 'paused' | 'error';

export interface StageData {
  status: StageStatus;
  agentOutput: string;
  artifacts: any[];
  startedAt: number | null;
  completedAt: number | null;
  readyForNext: boolean;
}

export interface Cycle {
  id: string;
  campaignId: string;
  cycleNumber: number;
  startedAt: number;
  completedAt: number | null;
  stages: {
    research: StageData;
    taste: StageData;
    make: StageData;
    test: StageData;
    memories: StageData;
  };
  currentStage: StageName;
  status: CycleStatus;
}

export interface Campaign {
  id: string;
  brand: string;
  targetAudience: string;
  marketingGoal: string;
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
  createCampaign: (brand: string, audience: string, goal: string) => Promise<void>;
  startCycle: () => Promise<void>;
  pauseCycle: () => void;
  resumeCycle: () => void;
  completeStage: (stageName: StageName, output: string) => Promise<void>;
  setCampaign: (campaign: Campaign) => void;
}
