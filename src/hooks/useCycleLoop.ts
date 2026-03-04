import { useState, useCallback, useEffect, useRef } from 'react';
import type { Campaign, Cycle, StageName, StageData, CycleMode } from '../types';
import { useOllama } from './useOllama';
import { useStorage } from './useStorage';
import { useOrchestratedResearch } from './useOrchestratedResearch';
import { getSystemPrompt } from '../utils/prompts';
import { getModelForStage } from '../utils/modelConfig';

const FULL_STAGE_ORDER: StageName[] = ['research', 'objections', 'taste', 'make', 'test', 'memories'];
const CONCEPTING_STAGE_ORDER: StageName[] = ['research', 'objections', 'taste'];
const STAGE_DELAY = 2000; // 2 second delay between stages

function getStageOrder(mode: CycleMode): StageName[] {
  return mode === 'concepting' ? CONCEPTING_STAGE_ORDER : FULL_STAGE_ORDER;
}

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

function createCycle(campaignId: string, cycleNumber: number, mode: CycleMode = 'full'): Cycle {
  return {
    id: `${campaignId}-cycle-${cycleNumber}`,
    campaignId,
    cycleNumber,
    startedAt: Date.now(),
    completedAt: null,
    stages: {
      research: createEmptyStage(),
      objections: createEmptyStage(),
      taste: createEmptyStage(),
      make: createEmptyStage(),
      test: createEmptyStage(),
      memories: createEmptyStage(),
    },
    currentStage: 'research',
    status: 'in-progress',
    mode,
  };
}

export function useCycleLoop() {
  const { generate } = useOllama();
  const { executeOrchestratedResearch } = useOrchestratedResearch();
  const { saveCycle, updateCycle } = useStorage();

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentCycle, setCurrentCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleRef = useRef<Cycle | null>(null);
  const isPausedRef = useRef(false);
  const isRunningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Execute a single stage
  const executeStage = useCallback(
    async (cycle: Cycle, stageName: StageName, campaign: Campaign) => {
      try {
        const stage = cycle.stages[stageName];
        stage.status = 'in-progress';
        stage.startedAt = Date.now();

        console.debug(`[CycleLoop] Starting stage: ${stageName}`, {
          cycle: cycle.id,
          campaign: campaign.brand,
        });

        setCurrentCycle(refreshCycleReference(cycle));

        // Build prompt based on stage and previous outputs
        let result = '';
        const systemPrompt = getSystemPrompt(stageName);

        if (stageName === 'research') {
          // Orchestrated research: Zakaria Framework + Web Search Researchers
          const researchResult = await executeOrchestratedResearch(
            campaign,
            (msg) => {
              stage.agentOutput += msg + '\n';
              setCurrentCycle(refreshCycleReference(cycle));
            },
            true // Enable web search orchestration
          );

          result = researchResult.processedOutput;
          stage.rawOutput = researchResult.rawOutput;
          stage.model = researchResult.model;
          stage.processingTime = researchResult.processingTime;

          // Capture research findings for downstream stages
          cycle.researchFindings = researchResult.researchFindings;
        } else if (stageName === 'objections') {
          // Objection Handling Stage - Create targeted messaging for key objections
          const findings = cycle.researchFindings;
          if (!findings || findings.objections.length === 0) {
            result = 'No objections identified in research phase.';
          } else {
            const prompt = `You are a sales copywriter specializing in objection handling.

Customer Desires (from research):
${findings.deepDesires.map(d => `- ${d.targetSegment}: "${d.deepestDesire}"`).join('\n')}

Key Objections to Handle:
${findings.objections.slice(0, 5).map(o => `- "${o.objection}"\n  Frequency: ${o.frequency}, Impact: ${o.impact}\n  Approach: ${o.handlingApproach}`).join('\n\n')}

For EACH objection, create specific messaging that:
1. Acknowledges the objection (shows you understand)
2. Explains why this product is different (mechanism)
3. Provides required proof type (${findings.objections[0]?.requiredProof?.join(', ') || 'testimonials'})
4. Reconnects to deep desire

Format as:
OBJECTION: [objection text]
MESSAGING: [copy angle that handles this]
PROOF NEEDED: [type of proof]

Be specific and powerful.`;

            const systemPrompt = getSystemPrompt('objections');
            const stageStartTime = Date.now();
            result = await generate(prompt, systemPrompt, {
              model: 'glm-4.7-flash:q4_K_M',
              signal: abortControllerRef.current?.signal,
            });
            stage.model = 'glm-4.7-flash:q4_K_M';
            stage.processingTime = Date.now() - stageStartTime;
            stage.rawOutput = result;
          }
        } else {
          let prompt = '';
          if (stageName === 'taste') {
            // Desire-Driven Creative Direction
            const findings = cycle.researchFindings;
            const objectionsOutput = cycle.stages.objections?.agentOutput || '';

            if (findings && findings.deepDesires.length > 0) {
              // Use desires to inform creative direction
              const competitorGaps = findings.competitorWeaknesses.join(', ');

              prompt = `You are a creative strategist using the Zakaria Framework.

Customer Desires (Ranked by Power):
${findings.deepDesires.map((d, i) => `${i + 1}. ${d.targetSegment}: DEEP DESIRE = "${d.deepestDesire}"\n   Surface: "${d.surfaceProblem}" (Intensity: ${d.desireIntensity})`).join('\n\n')}

Key Objections & Messaging Angles:
${objectionsOutput}

Market Gaps (What competitors DON'T claim):
${competitorGaps}

Define the Creative Direction that:
1. LEADS with the strongest desire (not product features)
2. OWNS the market gap (positioning no one else claims)
3. ADDRESSES top objections through visual/messaging style
4. USES audience language: ${findings.avatarLanguage.slice(0, 3).join(', ')}

Specify:
- Primary Desire Angle: [which desire to lead with]
- Secondary Angles: [other desires to mention]
- Visual Direction: [colors, mood, aesthetic that supports desires]
- Messaging Tone: [language style that resonates]
- Objection-Handling Visuals: [how to show proof visually]
- Copy Angles: [3-5 messaging variations tied to different desires]

Remember: People buy desires, not products.`;
            } else {
              // Fallback if research findings unavailable
              prompt = `Define creative direction for ${campaign.brand} targeting ${campaign.targetAudience}.

Research findings:
${cycle.stages.research.agentOutput}

Create a strategic creative direction that:\n1. Aligns with audience psychology\n2. Differentiates from competitors\n3. Will resonate emotionally\n\nBe specific about colors, pacing, tone, and messaging angles.`;
            }
          } else if (stageName === 'make') {
            // Multi-Angle Asset Generation based on Desires + Objections
            const findings = cycle.researchFindings;
            const creativeDirection = cycle.stages.taste.agentOutput;

            if (findings && findings.deepDesires.length > 0) {
              prompt = `You are a creative copywriter generating ad variations for ${campaign.brand}.

DESIRES TO ACTIVATE:
${findings.deepDesires.map(d => `- "${d.deepestDesire}" (${d.targetSegment})`).join('\n')}

CREATIVE DIRECTION:
${creativeDirection}

TOP OBJECTIONS TO ADDRESS:
${findings.objections.slice(0, 2).map(o => `- "${o.objection}"`).join('\n')}

Generate 3 DIFFERENT AD CONCEPTS, each targeting different psychology:

ANGLE 1: DESIRE-FOCUSED (Lead with what they REALLY want)
- Copy: [Headline that activates primary desire]
- Subheading: [Connect to deep desire]
- CTA: [Action tied to desire fulfillment]

ANGLE 2: OBJECTION-HANDLING (Address the doubt directly)
- Copy: [Show why this is different]
- Proof: [Mechanism or testimonial angle]
- CTA: [Lower objection threshold]

ANGLE 3: SOCIAL PROOF (Peers are getting this desire)
- Copy: [Real person, real result]
- Proof: [Before/after or testimonial]
- CTA: [Join others]

For each angle, specify:
- Headline copy (specific, not generic)
- Body copy (45-60 words, uses audience language)
- Visual concept (what image/video would show)
- CTA button text`;
            } else {
              prompt = `Research: ${cycle.stages.research.agentOutput}\n\nCreative Direction: ${creativeDirection}\n\nGenerate 3 different ad creative concepts with copy variations.`;
            }
          } else if (stageName === 'test') {
            // Test Stage: Evaluate creative against desire framework
            const findings = cycle.researchFindings;
            const creativeAssets = cycle.stages.make.agentOutput;

            if (findings && findings.deepDesires.length > 0) {
              prompt = `You are a creative strategist evaluating ad effectiveness.

TARGET DESIRES:
${findings.deepDesires.map(d => `- ${d.deepestDesire} (Intensity: ${d.desireIntensity})`).join('\n')}

TOP OBJECTIONS TO OVERCOME:
${findings.objections.slice(0, 3).map(o => `- "${o.objection}"`).join('\n')}

CREATIVE ASSETS:
${creativeAssets}

For EACH of the 3 concepts, evaluate:
1. DESIRE ACTIVATION: Does it tap into the deep desire or just surface problem?
2. OBJECTION HANDLING: Which objections does it address/ignore?
3. AUDIENCE RESONANCE: Will the ${campaign.targetAudience} respond to this tone/language?
4. COMPETITIVE DIFFERENTIATION: How does this own the market gap?
5. CONVERSION LIKELIHOOD: Which angle will convert best? Why?

Ranking:
- Which angle will drive highest conversion? Why?
- Which angle addresses the most powerful objection?
- Which angle speaks most directly to the deep desire?

Recommendation:
[Which angle to lead with, which to test as variant, which to skip]`;
            } else {
              prompt = `Evaluate this creative for effectiveness:\n\n${creativeAssets}\n\nRate on: relevance, clarity, persuasiveness, differentiation`;
            }
          } else if (stageName === 'memories') {
            // Memories: Capture what worked in desire-driven framework
            const findings = cycle.researchFindings;
            const testEvaluation = cycle.stages.test.agentOutput;

            prompt = `You are a marketing strategist documenting learnings from this campaign cycle.

RESEARCH FINDINGS:
Deep Desires Identified: ${findings?.deepDesires.map(d => d.deepestDesire).join(', ') || 'N/A'}
Top Objections: ${findings?.objections.slice(0, 2).map(o => o.objection).join(', ') || 'N/A'}

CREATIVE TESTED:
${cycle.stages.make.agentOutput}

PERFORMANCE EVALUATION:
${testEvaluation}

DOCUMENT THE LEARNINGS:

§ WHAT DESIRES RESONATED MOST
[Which deep desire should we lead with in next cycle?]

§ CRITICAL OBJECTIONS WE MISSED
[Were there objections we didn't handle well?]

§ WINNING ANGLE
[Which creative angle performed best and why?]

§ AUDIENCE INSIGHTS FOR NEXT CYCLE
[What did we learn about this audience that we didn't know?]

§ LANGUAGE THAT WORKED
[Specific phrases/angles that resonated with the audience]

§ COMPETITIVE POSITION CAPTURED
[Did we own the positioning gap we identified?]

§ FOR NEXT CYCLE
[3-5 specific things to optimize]`;
          }

          // Create abort controller for this stage
          abortControllerRef.current = new AbortController();

          // Generate using Ollama with stage-specific model
          const stageStartTime = Date.now();
          const modelForStage = getModelForStage(stageName);
          result = await generate(prompt, systemPrompt, {
            model: modelForStage,
            signal: abortControllerRef.current.signal,
          });

          // Capture metadata for this stage
          stage.model = modelForStage;
          stage.processingTime = Date.now() - stageStartTime;
          stage.rawOutput = result;
        }

        stage.agentOutput = result;
        stage.status = 'complete';
        stage.completedAt = Date.now();
        stage.readyForNext = true;

        const duration = (stage.completedAt - (stage.startedAt || 0));
        console.debug(`[CycleLoop] Stage complete: ${stageName}`, {
          duration: `${duration}ms`,
          outputLength: result.length,
          model: stage.model,
        });

        // Use refreshed reference to ensure React detects the change
        setCurrentCycle(refreshCycleReference(cycle));

        return stage;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stage execution failed';
        console.error(`[CycleLoop] Stage failed: ${stageName}`, msg);
        setError(msg);
        throw err;
      }
    },
    [generate, executeOrchestratedResearch]
  );

  // Advance to next stage
  const advanceToNextStage = useCallback(
    (cycle: Cycle): { cycle: Cycle; done: boolean } => {
      const stageOrder = getStageOrder(cycle.mode);
      const currentIndex = stageOrder.indexOf(cycle.currentStage);
      const nextIndex = currentIndex + 1;

      if (nextIndex >= stageOrder.length) {
        // Cycle complete
        cycle.status = 'complete';
        cycle.completedAt = Date.now();
        return { cycle, done: true };
      }

      cycle.currentStage = stageOrder[nextIndex];
      return { cycle, done: false };
    },
    []
  );

  // Main cycle loop
  const runCycle = useCallback(
    async (campaign: Campaign, startCycleNumber: number = 1, mode: CycleMode = 'full') => {
      let cycleNumber = startCycleNumber;
      let cycle = createCycle(campaign.id, cycleNumber, mode);
      cycleRef.current = cycle;

      console.debug('[CycleLoop] Starting cycle:', {
        cycleId: cycle.id,
        campaign: campaign.brand,
        mode,
        startTime: new Date().toISOString(),
      });

      isRunningRef.current = true;
      setIsRunning(true);
      setError(null);

      while (isRunningRef.current) {
        if (isPausedRef.current) {
          console.debug('[CycleLoop] Cycle paused');
          await new Promise((resolve) => {
            timeoutRef.current = setTimeout(resolve, 500);
          });
          continue;
        }

        try {
          // Execute current stage
          console.debug(`[CycleLoop] Executing stage: ${cycle.currentStage}`);
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
            console.debug('[CycleLoop] Cycle complete, starting new cycle:', cycleNumber + 1);
            // Start new cycle
            cycleNumber++;
            cycle = createCycle(campaign.id, cycleNumber);
            cycleRef.current = cycle;
            await saveCycle(cycle);
          }

          setCurrentCycle(refreshCycleReference(cycle));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Cycle error';
          console.error('[CycleLoop] Cycle error:', msg, err);
          if (!msg.includes('aborted')) {
            setError(msg);
          }
          // Only stop on actual errors, not on abort
          if (!err || !(err instanceof Error) || !err.message.includes('aborted')) {
            isRunningRef.current = false;
            setIsRunning(false);
          }
        }
      }

      // Ensure cleanup on exit
      isRunningRef.current = false;
      setIsRunning(false);
      console.debug('[CycleLoop] Cycle stopped at:', new Date().toISOString());
    },
    [executeStage, advanceToNextStage, updateCycle, saveCycle]
  );

  const start = useCallback(
    async (campaign: Campaign, cycleNumber: number = 1, mode: CycleMode = 'full') => {
      if (isRunning) return;
      isPausedRef.current = false;
      setIsPaused(false);
      await runCycle(campaign, cycleNumber, mode);
    },
    [isRunning, runCycle]
  );

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
    // Abort in-progress request to free up Ollama
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    isPausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setError(null);

    // Clear all pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Abort any in-progress request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      isRunningRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
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
    stop, // Now exported for use in CampaignContext
  };
}
