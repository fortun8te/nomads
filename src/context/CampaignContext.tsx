import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Campaign, Cycle, CampaignContextType, StageName, CycleMode, UserQuestion, UserQuestionAnswer } from '../types';
import { useCycleLoop } from '../hooks/useCycleLoop';
import { useStorage } from '../hooks/useStorage';
import { storage } from '../utils/storage';
import { addMemory } from '../utils/memoryStore';

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [currentCycle, setCurrentCycle] = useState<Cycle | null>(null);
  const [cycleMode] = useState<CycleMode>('full');
  const [isLoaded, setIsLoaded] = useState(false); // true once initial load from IndexedDB is done

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
    currentCycle: cycleLoopCycle,
    error: cycleError,
    start,
    stop,
  } = useCycleLoop(askUser);

  const { saveCampaign, saveCycle, getCyclesByCampaign, getAllCampaigns } = useStorage();

  // Load the most recent campaign from IndexedDB on mount
  useEffect(() => {
    (async () => {
      try {
        const allCampaigns = await getAllCampaigns();
        if (allCampaigns.length > 0) {
          const sorted = allCampaigns.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          setCampaign(sorted[0]);
          const campaignCycles = await getCyclesByCampaign(sorted[0].id);
          setCycles(campaignCycles);
        }
      } catch (err) {
        console.error('Failed to load campaign from storage:', err);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync cycle loop state to context
  useEffect(() => {
    setCurrentCycle(cycleLoopCycle);
  }, [cycleLoopCycle]);

  // When a cycle completes, save key research findings as memories
  const savedCycleIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cycleLoopCycle || cycleLoopCycle.status !== 'complete') return;
    if (savedCycleIdRef.current === cycleLoopCycle.id) return;
    savedCycleIdRef.current = cycleLoopCycle.id;

    const findings = cycleLoopCycle.researchFindings;
    const brand = campaign?.brand || 'brand';

    if (findings) {
      const desireSummary = findings.deepDesires?.length
        ? findings.deepDesires.slice(0, 3).map(d => `${d.targetSegment}: "${d.deepestDesire}"`).join('; ')
        : null;
      if (desireSummary) {
        addMemory('research', `[${brand}] Deep desires — ${desireSummary}`, [brand, 'desires', 'research']);
      }

      if (findings.rootCauseMechanism?.ahaInsight) {
        addMemory('research', `[${brand}] AHA insight — ${findings.rootCauseMechanism.ahaInsight}`, [brand, 'mechanism', 'insight']);
      }

      const objections = findings.objections?.slice(0, 3).map(o => o.objection).join('; ');
      if (objections) {
        addMemory('research', `[${brand}] Key objections — ${objections}`, [brand, 'objections']);
      }
    }

    const verdict = cycleLoopCycle.testVerdict;
    if (verdict?.winner) {
      addMemory('campaign', `[${brand}] Winning concept: "${verdict.winner}". Next cycle: ${verdict.nextCycleImprovement || 'N/A'}`, [brand, 'test', 'winner']);
    }
  }, [cycleLoopCycle, campaign?.brand]);

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

  const updateCampaign = useCallback(async (updates: Partial<Campaign>) => {
    if (!campaign) return;
    const updated = { ...campaign, ...updates, updatedAt: Date.now() };
    await saveCampaign(updated);
    setCampaign(updated);
  }, [campaign, saveCampaign]);

  const clearCampaign = useCallback(() => {
    stop();
    setCampaign(null);
    setCycles([]);
    setCurrentCycle(null);
  }, [stop]);

  // Reset research — delete all cycles for the current campaign, keep campaign itself
  const resetResearch = useCallback(async () => {
    if (!campaign) return;
    stop();
    await storage.deleteCyclesForCampaign(campaign.id);
    setCycles([]);
    setCurrentCycle(null);
  }, [campaign, stop]);

  const startCycle = useCallback(async (mode: CycleMode = cycleMode) => {
    if (!campaign) return;
    await start(campaign, campaign.currentCycle, mode);
  }, [campaign, start, cycleMode]);

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

  // Load an existing campaign by ID (used when selecting a preset that already has a campaign)
  const loadCampaignById = useCallback(async (id: string) => {
    const existing = await storage.getCampaign(id);
    if (existing) {
      stop();
      setCampaign(existing);
      const campaignCycles = await getCyclesByCampaign(existing.id);
      setCycles(campaignCycles);
      setCurrentCycle(null);
    }
  }, [stop, getCyclesByCampaign]);

  const value: CampaignContextType = {
    campaign,
    cycles,
    currentCycle,
    isLoaded,
    systemStatus: isRunning ? 'running' : 'idle',
    error: cycleError,
    pendingQuestion,
    questionAnswers,
    answerQuestion,
    createCampaign,
    updateCampaign,
    startCycle,
    stopCycle,
    completeStage,
    setCampaign,
    clearCampaign,
    resetResearch,
    loadCampaignById,
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
