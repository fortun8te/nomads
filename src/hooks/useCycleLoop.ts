import { useState, useCallback, useEffect, useRef } from 'react';
import type { Campaign, Cycle, StageName, StageData } from '../types';
import { useOllama } from './useOllama';
import { useStorage } from './useStorage';
import { getSystemPrompt } from '../utils/prompts';
import { extractCompetitorNames } from '../utils/competitorAnalysis';

const STAGE_ORDER: StageName[] = ['research', 'taste', 'make', 'test', 'memories'];
const STAGE_DELAY = 2000; // 2 second delay between stages

// Helper to create a cycle with new object references (important for React state updates)
function refreshCycleReference(cycle: Cycle): Cycle {
  return {
    ...cycle,
    stages: { ...cycle.stages },
  };
}

function createEmptyStage(): StageData {
  return {
    status: 'pending',
    agentOutput: '',
    artifacts: [],
    startedAt: null,
    completedAt: null,
    readyForNext: false,
  };
}

function createCycle(campaignId: string, cycleNumber: number): Cycle {
  return {
    id: `${campaignId}-cycle-${cycleNumber}`,
    campaignId,
    cycleNumber,
    startedAt: Date.now(),
    completedAt: null,
    stages: {
      research: createEmptyStage(),
      taste: createEmptyStage(),
      make: createEmptyStage(),
      test: createEmptyStage(),
      memories: createEmptyStage(),
    },
    currentStage: 'research',
    status: 'in-progress',
  };
}

export function useCycleLoop() {
  const { generate } = useOllama();
  const { saveCycle, updateCycle } = useStorage();

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentCycle, setCurrentCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleRef = useRef<Cycle | null>(null);
  const isPausedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Execute a single stage
  const executeStage = useCallback(
    async (cycle: Cycle, stageName: StageName, campaign: Campaign) => {
      try {
        const stage = cycle.stages[stageName];
        stage.status = 'in-progress';
        stage.startedAt = Date.now();

        setCurrentCycle(refreshCycleReference(cycle));

        // Build prompt based on stage and previous outputs
        let prompt = '';
        const systemPrompt = getSystemPrompt(stageName);

        if (stageName === 'research') {
          prompt = `Brand: ${campaign.brand}\nTarget Audience: ${campaign.targetAudience}\nMarketing Goal: ${campaign.marketingGoal}`;
        } else if (stageName === 'taste') {
          // Extract competitor insights from research for taste analysis
          const competitors = extractCompetitorNames(cycle.stages.research.agentOutput);
          const competitorContext = competitors.length > 0
            ? `\n\nKEY COMPETITORS TO ANALYZE:\n${competitors.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
            : '';

          prompt = `RESEARCH FINDINGS:\n${cycle.stages.research.agentOutput}${competitorContext}\n\nBased on the research and competitor analysis above, define the creative direction that will:\n1. Win against competitors\n2. Resonate with target audience\n3. Align with brand values from the questionnaire\n\nBe specific about colors, styles, pacing, and messaging.`;
        } else if (stageName === 'make') {
          prompt = `Research: ${cycle.stages.research.agentOutput}\n\nCreative Direction: ${cycle.stages.taste.agentOutput}\n\nGenerate ad creative concepts.`;
        } else if (stageName === 'test') {
          prompt = `Evaluate this creative:\n\n${cycle.stages.make.agentOutput}`;
        } else if (stageName === 'memories') {
          prompt = `Summarize this cycle's learnings:\nResearch: ${cycle.stages.research.agentOutput}\nTaste: ${cycle.stages.taste.agentOutput}\nMake: ${cycle.stages.make.agentOutput}\nTest: ${cycle.stages.test.agentOutput}`;
        }

        // Create abort controller for this stage
        abortControllerRef.current = new AbortController();

        // Generate using Ollama
        const result = await generate(prompt, systemPrompt, {
          signal: abortControllerRef.current.signal,
        });

        stage.agentOutput = result;
        stage.status = 'complete';
        stage.completedAt = Date.now();
        stage.readyForNext = true;

        // Use refreshed reference to ensure React detects the change
        setCurrentCycle(refreshCycleReference(cycle));

        return stage;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stage execution failed';
        setError(msg);
        throw err;
      }
    },
    [generate]
  );

  // Advance to next stage
  const advanceToNextStage = useCallback(
    (cycle: Cycle): { cycle: Cycle; done: boolean } => {
      const currentIndex = STAGE_ORDER.indexOf(cycle.currentStage);
      const nextIndex = currentIndex + 1;

      if (nextIndex >= STAGE_ORDER.length) {
        // Cycle complete
        cycle.status = 'complete';
        cycle.completedAt = Date.now();
        return { cycle, done: true };
      }

      cycle.currentStage = STAGE_ORDER[nextIndex];
      return { cycle, done: false };
    },
    []
  );

  // Main cycle loop
  const runCycle = useCallback(
    async (campaign: Campaign, startCycleNumber: number = 1) => {
      let cycleNumber = startCycleNumber;
      let cycle = createCycle(campaign.id, cycleNumber);
      cycleRef.current = cycle;

      setIsRunning(true);
      setError(null);

      while (true) {
        if (isPausedRef.current) {
          await new Promise((resolve) => {
            timeoutRef.current = setTimeout(resolve, 500);
          });
          continue;
        }

        try {
          // Execute current stage
          await executeStage(cycle, cycle.currentStage, campaign);
          // State already updated in executeStage, but refresh again to be sure
          setCurrentCycle(refreshCycleReference(cycle));

          // Save cycle progress
          await updateCycle(cycle);

          // Delay before next stage
          await new Promise((resolve) => {
            timeoutRef.current = setTimeout(resolve, STAGE_DELAY);
          });

          // Advance to next stage
          const { cycle: updatedCycle, done } = advanceToNextStage(cycle);
          cycle = updatedCycle;
          cycleRef.current = cycle;

          if (done) {
            // Start new cycle
            cycleNumber++;
            cycle = createCycle(campaign.id, cycleNumber);
            cycleRef.current = cycle;
            await saveCycle(cycle);
          }

          setCurrentCycle(refreshCycleReference(cycle));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Cycle error';
          setError(msg);
          setIsRunning(false);
          break;
        }
      }
    },
    [executeStage, advanceToNextStage, updateCycle, saveCycle]
  );

  const start = useCallback(
    async (campaign: Campaign, cycleNumber: number = 1) => {
      if (isRunning) return;
      isPausedRef.current = false;
      setIsPaused(false);
      await runCycle(campaign, cycleNumber);
    },
    [isRunning, runCycle]
  );

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
    // Abort any in-progress stage generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    // Clear the abort controller to allow new requests
    abortControllerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
    isPausedRef.current = false;
    setIsPaused(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isRunning,
    isPaused,
    currentCycle,
    error,
    start,
    pause,
    resume,
    stop,
  };
}
