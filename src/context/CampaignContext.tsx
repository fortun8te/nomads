import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Campaign, Cycle, CampaignContextType, StageName, CycleMode } from '../types';
import { useCycleLoop } from '../hooks/useCycleLoop';
import { useStorage } from '../hooks/useStorage';

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [currentCycle, setCurrentCycle] = useState<Cycle | null>(null);
  const [cycleMode] = useState<CycleMode>('full');

  const {
    isRunning,
    isPaused,
    currentCycle: cycleLoopCycle,
    error: cycleError,
    start,
    pause,
    resume,
    stop,
  } = useCycleLoop();

  const { saveCampaign, saveCycle, getCyclesByCampaign } = useStorage();

  // Sync cycle loop state to context
  useEffect(() => {
    setCurrentCycle(cycleLoopCycle);
  }, [cycleLoopCycle]);

  const createCampaign = useCallback(
    async (
      brand: string,
      targetAudience: string,
      marketingGoal: string,
      productDescription: string,
      productFeatures: string[],
      productPrice?: string,
      researchMode: 'interactive' | 'autonomous' = 'autonomous',
      maxResearchIterations?: number,
      maxResearchTimeMinutes?: number
    ) => {
      // Pull defaults from localStorage (set in Settings), fallback to hardcoded
      const savedIter = localStorage.getItem('max_research_iterations');
      const savedTime = localStorage.getItem('max_research_time_minutes');
      const finalIterations = maxResearchIterations ?? (savedIter ? parseInt(savedIter) : 3);
      const finalTime = maxResearchTimeMinutes ?? (savedTime ? parseInt(savedTime) : 10);

      // Stop any running cycle from previous campaign
      stop();

      const newCampaign: Campaign = {
        id: `campaign-${Date.now()}`,
        brand,
        targetAudience,
        marketingGoal,
        productDescription,
        productFeatures,
        productPrice,
        researchMode,
        maxResearchIterations: finalIterations,
        maxResearchTimeMinutes: finalTime,
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
    [saveCampaign, stop]
  );

  const clearCampaign = useCallback(() => {
    stop();
    setCampaign(null);
    setCycles([]);
    setCurrentCycle(null);
  }, [stop]);

  const startCycle = useCallback(async (mode: CycleMode = cycleMode) => {
    if (!campaign) return;
    await start(campaign, campaign.currentCycle, mode);
  }, [campaign, start, cycleMode]);

  const pauseCycle = useCallback(() => {
    pause();
  }, [pause]);

  const resumeCycle = useCallback(() => {
    resume();
  }, [resume]);

  const stopCycle = useCallback(() => {
    stop();
  }, [stop]);

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

  const value: CampaignContextType & { clearCampaign: () => void; stopCycle: () => void } = {
    campaign,
    cycles,
    currentCycle,
    systemStatus: isRunning ? 'running' : isPaused ? 'paused' : 'idle',
    error: cycleError,
    createCampaign,
    startCycle,
    pauseCycle,
    resumeCycle,
    stopCycle,
    completeStage,
    setCampaign,
    clearCampaign,
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
