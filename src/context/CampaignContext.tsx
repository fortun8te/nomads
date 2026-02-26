import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Campaign, Cycle, CampaignContextType, StageName } from '../types';
import { useCycleLoop } from '../hooks/useCycleLoop';
import { useStorage } from '../hooks/useStorage';

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [currentCycle, setCurrentCycle] = useState<Cycle | null>(null);

  const {
    isRunning,
    isPaused,
    currentCycle: cycleLoopCycle,
    error: cycleError,
    start,
    pause,
    resume,
  } = useCycleLoop();

  const { saveCampaign, saveCycle, getCyclesByCampaign } = useStorage();

  // Sync cycle loop state to context
  useEffect(() => {
    setCurrentCycle(cycleLoopCycle);
  }, [cycleLoopCycle]);

  const createCampaign = useCallback(
    async (brand: string, targetAudience: string, marketingGoal: string) => {
      const newCampaign: Campaign = {
        id: `campaign-${Date.now()}`,
        brand,
        targetAudience,
        marketingGoal,
        currentCycle: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
      };

      await saveCampaign(newCampaign);
      setCampaign(newCampaign);
      setCycles([]);
      setCurrentCycle(null);
    },
    [saveCampaign]
  );

  const startCycle = useCallback(async () => {
    if (!campaign) return;
    await start(campaign, campaign.currentCycle);
  }, [campaign, start]);

  const pauseCycle = useCallback(() => {
    pause();
  }, [pause]);

  const resumeCycle = useCallback(() => {
    resume();
  }, [resume]);

  const completeStage = useCallback(
    async (stageName: StageName, output: string) => {
      if (!currentCycle) return;
      const updated = { ...currentCycle };
      updated.stages[stageName] = {
        ...updated.stages[stageName],
        agentOutput: output,
      };
      await saveCycle(updated);
      setCurrentCycle(updated);
    },
    [currentCycle, saveCycle]
  );

  const loadCycles = useCallback(async () => {
    if (!campaign) return;
    const loadedCycles = await getCyclesByCampaign(campaign.id);
    setCycles(loadedCycles);
  }, [campaign, getCyclesByCampaign]);

  // Load cycles when campaign changes
  useEffect(() => {
    loadCycles();
  }, [campaign, loadCycles]);

  const value: CampaignContextType = {
    campaign,
    cycles,
    currentCycle,
    systemStatus: isRunning ? 'running' : isPaused ? 'paused' : 'idle',
    error: cycleError,
    createCampaign,
    startCycle,
    pauseCycle,
    resumeCycle,
    completeStage,
    setCampaign,
  };

  return (
    <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>
  );
}

export function useCampaign(): CampaignContextType {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error('useCampaign must be used within CampaignProvider');
  }
  return context;
}
