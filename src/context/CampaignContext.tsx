import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Campaign, Cycle, CampaignContextType, StageName, CycleMode, UserQuestion, UserQuestionAnswer } from '../types';
import { useCycleLoop } from '../hooks/useCycleLoop';
import { useStorage } from '../hooks/useStorage';

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [currentCycle, setCurrentCycle] = useState<Cycle | null>(null);
  const [cycleMode] = useState<CycleMode>('full');

  // Interactive question system
  const [pendingQuestion, setPendingQuestion] = useState<UserQuestion | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<UserQuestionAnswer[]>([]);
  const questionResolverRef = useRef<((answer: string) => void) | null>(null);

  // Called by QuestionModal when user picks an answer
  const answerQuestion = useCallback((answer: string) => {
    if (pendingQuestion && questionResolverRef.current) {
      // Record the answer
      setQuestionAnswers(prev => [...prev, {
        questionId: pendingQuestion.id,
        answer,
        checkpoint: pendingQuestion.checkpoint,
      }]);
      // Resolve the promise so the pipeline continues
      questionResolverRef.current(answer);
      questionResolverRef.current = null;
      setPendingQuestion(null);
    }
  }, [pendingQuestion]);

  // Called by useCycleLoop to show a question and wait for answer
  const askUser = useCallback((question: UserQuestion): Promise<string> => {
    return new Promise<string>((resolve) => {
      questionResolverRef.current = resolve;
      setPendingQuestion(question);
    });
  }, []);

  const {
    isRunning,
    isPaused,
    currentCycle: cycleLoopCycle,
    error: cycleError,
    reviewingStage,
    reviewFindings,
    start,
    pause,
    resume,
    stop,
    resumeAfterReview,
  } = useCycleLoop(askUser);

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
      maxResearchTimeMinutes?: number,
      brandColors?: string,
      brandFonts?: string,
      brandDNA?: Record<string, string>,
      presetData?: Record<string, any>
    ) => {
      // Pull defaults from localStorage (set in Settings), fallback to hardcoded
      const savedIter = localStorage.getItem('max_research_iterations');
      const savedTime = localStorage.getItem('max_research_time_minutes');
      const finalIterations = maxResearchIterations ?? (savedIter ? parseInt(savedIter) : 15);
      const finalTime = maxResearchTimeMinutes ?? (savedTime ? parseInt(savedTime) : 45);

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
        brandColors,
        brandFonts,
        brandDNA,
        presetData,
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
    pendingQuestion,
    questionAnswers,
    answerQuestion,
    reviewingStage,
    reviewFindings,
    resumeAfterReview,
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
