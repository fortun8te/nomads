import { useState, useCallback, useEffect, useRef } from 'react';
import type { Campaign, Cycle, StageName, StageData, CycleMode, UserQuestion, QuestionCheckpoint } from '../types';
import type { ResearchPauseEvent } from '../utils/researchAgents';
import { useOllama } from './useOllama';
import { useStorage } from './useStorage';
import { useOrchestratedResearch } from './useOrchestratedResearch';
import { getSystemPrompt, getCheckpointQuestionPrompt } from '../utils/prompts';
import { getModelForStage } from '../utils/modelConfig';
import { playSound, startSoundLoop, stopSoundLoop } from './useSoundEngine';
import { generateResearchReport } from '../utils/reportGenerator';
import { visualProgressStore } from '../utils/visualProgressStore';
import { tokenTracker } from '../utils/tokenStats';


const FULL_STAGE_ORDER: StageName[] = ['research', 'brand-dna', 'persona-dna', 'angles', 'strategy', 'copywriting', 'production', 'test'];
const CONCEPTING_STAGE_ORDER: StageName[] = ['research', 'brand-dna', 'persona-dna', 'angles'];
const STAGE_DELAY = 500; // 500ms delay between stages (snappy)

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
  const stageOrder = getStageOrder(mode);
  const stages = {} as Record<StageName, StageData>;
  for (const name of FULL_STAGE_ORDER) {
    stages[name] = createEmptyStage();
  }
  return {
    id: `${campaignId}-cycle-${cycleNumber}`,
    campaignId,
    cycleNumber,
    startedAt: Date.now(),
    completedAt: null,
    stages,
    currentStage: stageOrder[0],
    status: 'in-progress',
    mode,
  };
}

export function useCycleLoop(askUser?: (question: UserQuestion) => Promise<string>) {
  const { generate } = useOllama();
  const { executeOrchestratedResearch } = useOrchestratedResearch();
  const { saveCycle, updateCycle } = useStorage();

  const [isRunning, setIsRunning] = useState(false);
  const [currentCycle, setCurrentCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleRef = useRef<Cycle | null>(null);
  const isRunningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userAnswersRef = useRef<Record<string, string>>({});

  // Throttle React state updates to prevent UI freeze from per-token re-renders
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCycleRef = useRef<Cycle | null>(null);
  const throttledSetCycle = useCallback((cycle: Cycle) => {
    latestCycleRef.current = cycle; // always store the latest
    const now = Date.now();
    // 80ms throttle — matches tokenStats for smooth live streaming
    if (now - lastUpdateRef.current >= 80) {
      lastUpdateRef.current = now;
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
      setCurrentCycle(refreshCycleReference(cycle));
    } else if (!pendingUpdateRef.current) {
      pendingUpdateRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        pendingUpdateRef.current = null;
        setCurrentCycle(refreshCycleReference(latestCycleRef.current!));
      }, 80);
    }
  }, []);

  // Check if interactive mode is enabled
  const isInteractive = (): boolean => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pipeline_mode') === 'interactive';
    }
    return false;
  };

  // Adapter: convert ResearchPauseEvent → askUser system for interactive research
  const handleResearchPauseForInput = useCallback(async (event: ResearchPauseEvent): Promise<string> => {
    if (!askUser) return 'Continue automatically';
    const question: UserQuestion = {
      id: `research-q-${Date.now()}`,
      question: event.question,
      options: event.suggestedAnswers || ['Continue automatically', 'Focus deeper on this area', 'Skip this angle'],
      checkpoint: 'mid-pipeline' as QuestionCheckpoint,
      context: event.context,
    };
    return askUser(question);
  }, [askUser]);

  // Generate a question using GLM and wait for user answer
  const askCheckpointQuestion = useCallback(async (
    checkpoint: QuestionCheckpoint,
    campaign: Campaign,
    stageOutputs: Record<string, string>
  ): Promise<string | null> => {
    if (!isInteractive() || !askUser) return null;

    try {
      const brief = `Brand: ${campaign.brand}\nAudience: ${campaign.targetAudience}\nGoal: ${campaign.marketingGoal}\nProduct: ${campaign.productDescription}\nFeatures: ${campaign.productFeatures.join(', ')}\nPrice: ${campaign.productPrice || 'N/A'}`;

      const { system, prompt } = getCheckpointQuestionPrompt(checkpoint, brief, stageOutputs);

      // Generate question using GLM
      const response = await generate(prompt, system, {
        model: getModelForStage('research'), // GLM for question generation
        signal: abortControllerRef.current?.signal,
      });

      // Parse JSON response
      const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length < 3) {
        console.warn('Invalid question format from GLM:', parsed);
        return null;
      }

      // Create the question object
      const question: UserQuestion = {
        id: `q-${checkpoint}-${Date.now()}`,
        question: parsed.question,
        options: parsed.options.slice(0, 3),
        checkpoint,
        context: parsed.context || undefined,
      };

      // Show question and wait for answer
      const answer = await askUser(question);
      userAnswersRef.current[checkpoint] = answer;
      return answer;
    } catch (err) {
      console.warn('Question generation failed, continuing without input:', err);
      return null;
    }
  }, [askUser, generate]);

  // Execute a single stage
  const executeStage = useCallback(
    async (cycle: Cycle, stageName: StageName, campaign: Campaign) => {
      try {
        const stage = cycle.stages[stageName];

        // If resuming a previously aborted stage, clear partial output to avoid duplicates
        if (stage.status === 'in-progress' && stage.agentOutput) {
          stage.agentOutput = '';
        }

        stage.status = 'in-progress';
        stage.startedAt = Date.now();

        // Start thinking sound loop
        startSoundLoop('thinking');

        setCurrentCycle(refreshCycleReference(cycle));

        // Build prompt based on stage and previous outputs
        let result = '';
        const systemPrompt = getSystemPrompt(stageName);

        if (stageName === 'research') {
          // Orchestrated research: Desire-Driven Analysis + Web Search Researchers
          // Create abort controller for research stage
          abortControllerRef.current = new AbortController();
          const researchResult = await executeOrchestratedResearch(
            campaign,
            (msg) => {
              stage.agentOutput += msg + '\n';
              throttledSetCycle(cycle);
            },
            true, // Enable web search orchestration
            campaign.researchMode === 'interactive' ? handleResearchPauseForInput : undefined,
            abortControllerRef.current.signal
          );

          result = researchResult.processedOutput;
          stage.rawOutput = researchResult.rawOutput;
          stage.model = researchResult.model;
          stage.processingTime = researchResult.processingTime;

          // Capture research findings for downstream stages
          cycle.researchFindings = researchResult.researchFindings;

          // Generate research report (mini research paper)
          try {
            const report = await generateResearchReport(
              cycle.researchFindings || { deepDesires: [], objections: [], avatarLanguage: [], whereAudienceCongregates: [], whatTheyTriedBefore: [], competitorWeaknesses: [] },
              cycle.researchFindings?.auditTrail,
              researchResult.rawOutput?.slice(0, 12000) || '',
              abortControllerRef.current?.signal,
              (msg) => {
                stage.agentOutput += msg;
                throttledSetCycle(cycle);
              }
            );
            if (cycle.researchFindings) {
              cycle.researchFindings.researchReport = report;
            }
          } catch (reportErr) {
            // Report generation is non-critical — don't fail the pipeline
            console.warn('Report generation failed:', reportErr);
            stage.agentOutput += '\n[REPORT] Generation failed — continuing pipeline\n';
          }
        } else {
          // ── All non-research stages: generate with stage-specific prompt ──
          let prompt = '';

          if (stageName === 'brand-dna') {
            // Brand DNA: LLM drafts brand identity from research findings
            const findings = cycle.researchFindings;
            const hasFindings = findings && (findings.deepDesires?.length > 0 || findings.competitorWeaknesses?.length > 0);
            prompt = `You are a brand strategist. Based on the research findings below, draft a comprehensive Brand DNA document for ${campaign.brand}.

RESEARCH CONTEXT:
${hasFindings ? `Deep Desires: ${(findings.deepDesires || []).map(d => `${d.targetSegment}: "${d.deepestDesire}"`).join(', ') || 'Not yet identified'}
Competitor Weaknesses: ${(findings.competitorWeaknesses || []).join(', ') || 'Not yet identified'}
Market Sophistication: Level ${findings.marketSophistication || 3}` : cycle.stages.research.agentOutput?.slice(0, 2000) || 'Research produced limited findings. Generate based on campaign brief.'}

Product: ${campaign.productDescription}
Features: ${campaign.productFeatures.join(', ')}

Draft the Brand DNA:
§ BRAND IDENTITY
Name, tagline, mission, core values

§ VOICE & PERSONALITY
Tone of voice, personality traits, how the brand speaks

§ POSITIONING
Where this brand sits vs competitors, what gap it owns

§ VISUAL IDENTITY
Recommended colors (hex), fonts, mood keywords, logo direction

§ DIFFERENTIATORS
What makes this brand impossible to copy

Be specific and strategic. Every choice should connect back to the research insights.`;

          } else if (stageName === 'persona-dna') {
            // Persona DNA: LLM drafts detailed customer personas
            const findings = cycle.researchFindings;
            const hasFindings = findings && (findings.deepDesires?.length > 0 || findings.objections?.length > 0);
            prompt = `You are a customer research specialist. Based on the research findings, create 2-3 detailed customer personas for ${campaign.brand}.

RESEARCH CONTEXT:
${hasFindings ? `Deep Desires: ${(findings.deepDesires || []).map(d => `${d.targetSegment}: "${d.deepestDesire}" (${d.desireIntensity})`).join('\n') || 'Not yet identified'}
Objections: ${(findings.objections || []).map(o => o.objection).join(', ') || 'Not yet identified'}
Avatar Language: ${findings.avatarLanguage?.slice(0, 5).join(', ') || 'N/A'}
What They Tried Before: ${findings.whatTheyTriedBefore?.join(', ') || 'N/A'}` : cycle.stages.research.agentOutput?.slice(0, 2000) || 'Research produced limited findings. Generate based on campaign brief.'}

${cycle.brandDNA ? `Brand DNA: ${cycle.brandDNA.name} — ${cycle.brandDNA.positioning}` : ''}

For EACH persona, provide:
§ PERSONA [number]: [Name, age, role]
Demographics, psychographics, pain points, desires, language they use, objections, media habits, buying triggers, and a "day in the life" narrative.

Make them feel like REAL people, not marketing abstractions. Use specific details and actual language patterns from the research.`;

          } else if (stageName === 'angles') {
            // Angles: Tiered brainstorm — generate many, then rank
            const findings = cycle.researchFindings;
            const hasFindings = findings && (findings.deepDesires?.length > 0 || findings.objections?.length > 0);
            prompt = `You are a creative director brainstorming ad angles for ${campaign.brand}.

RESEARCH CONTEXT:
${hasFindings ? `Deep Desires: ${(findings.deepDesires || []).map(d => `- ${d.targetSegment}: "${d.deepestDesire}"`).join('\n') || 'Not yet identified'}
Root Cause: ${findings.rootCauseMechanism?.rootCause || 'N/A'}
Mechanism: ${findings.rootCauseMechanism?.mechanism || 'N/A'}
AHA Insight: "${findings.rootCauseMechanism?.ahaInsight || 'N/A'}"
Objections: ${(findings.objections || []).map(o => o.objection).join(', ') || 'Not yet identified'}` : 'Research produced limited findings. Generate creative angles based on campaign brief.'}

${cycle.brandDNA ? `Brand: ${cycle.brandDNA.name} — ${cycle.brandDNA.positioning}\nVoice: ${cycle.brandDNA.voiceTone}` : ''}
${cycle.personas ? `Personas: ${cycle.personas.map(p => p.name).join(', ')}` : ''}

Generate 30+ ad angle ideas. For each:
- HOOK: 1-line angle summary (the ad concept in one sentence)
- TYPE: desire / objection / social-proof / mechanism / contrast / story / urgency / identity
- TARGET PERSONA: which persona this targets
- EMOTIONAL LEVER: what emotion drives this angle
- RATIONALE: why this angle will work
- STRENGTH: 1-10 rating

Then RANK the top 15 by strength. Be creative, be bold, think from the customer's perspective — not the brand's.`;

          } else if (stageName === 'strategy') {
            // Strategy: Creative Strategy — Bridge Framework
            const findings = cycle.researchFindings;
            prompt = `You are a creative strategist building a comprehensive Creative Strategy for ${campaign.brand}.

Your job: synthesize ALL research into the "Bridge Framework" — mapping the customer's CURRENT STATE through the PRODUCT (bridge) to their DESIRED STATE and IDEAL LIFE.

=== RESEARCH INPUT ===
${findings?.deepDesires?.length ? `DEEP DESIRES:\n${findings.deepDesires.map(d => `- Surface: "${d.surfaceProblem}" → Deepest: "${d.deepestDesire}" (${d.desireIntensity}) [${d.targetSegment}]`).join('\n')}` : ''}
${findings?.objections?.length ? `\nOBJECTIONS:\n${findings.objections.map(o => `- "${o.objection}" (${o.frequency}, ${o.impact} impact)`).join('\n')}` : ''}
${findings?.whatTheyTriedBefore ? `\nWHAT THEY TRIED BEFORE:\n${findings.whatTheyTriedBefore.map(t => `- ${t}`).join('\n')}` : ''}
${findings?.rootCauseMechanism ? `\nROOT CAUSE MECHANISM:\n- AHA: "${findings.rootCauseMechanism.ahaInsight}"\n- Mechanism: "${findings.rootCauseMechanism.mechanism}"` : ''}
${findings?.verbatimQuotes ? `\nVERBATIM QUOTES:\n${findings.verbatimQuotes.slice(0, 8).map(q => `- "${q}"`).join('\n')}` : ''}
${findings?.avatarLanguage ? `\nAUDIENCE LANGUAGE:\n${findings.avatarLanguage.slice(0, 10).map(l => `- "${l}"`).join('\n')}` : ''}
${findings ? `\nMARKET SOPHISTICATION: Level ${findings.marketSophistication || 3}` : ''}
${cycle.brandDNA ? `\nBRAND: ${cycle.brandDNA.name} — ${cycle.brandDNA.positioning}\nVoice: ${cycle.brandDNA.voiceTone}` : ''}
${cycle.personas ? `\nPERSONAS:\n${cycle.personas.map(p => `- ${p.name}: desires [${p.desires.slice(0, 2).join(', ')}], pains [${p.painPoints.slice(0, 2).join(', ')}]`).join('\n')}` : ''}
${cycle.angles ? `\nTOP ANGLES:\n${cycle.angles.filter(a => a.selected || a.strength >= 7).slice(0, 8).map(a => `- "${a.hook}" (${a.type}, strength: ${a.strength})`).join('\n')}` : ''}

PRODUCT: ${campaign.productDescription}
FEATURES: ${campaign.productFeatures.join(', ')}

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON matching this exact structure:
{
  "currentState": {
    "painPoints": ["specific pain 1", "specific pain 2", ...],
    "frustrations": ["frustration 1", "frustration 2", ...],
    "triedBefore": ["solution 1", "solution 2", ...],
    "emotionalState": "one sentence describing their emotional reality"
  },
  "bridge": {
    "mechanism": "the unique mechanism that makes this product work",
    "uniqueAngle": "what makes this product different from everything else",
    "proofPoints": ["proof 1", "proof 2", ...]
  },
  "desiredState": {
    "desires": ["desire 1", "desire 2", ...],
    "transformation": "the before→after transformation story in 2-3 sentences",
    "turningPoints": ["turning point 1", "turning point 2", ...]
  },
  "idealLife": {
    "vision": "what their life looks like when the desire is fully satisfied",
    "identity": "who they become — the identity shift"
  },
  "messaging": {
    "headlines": ["headline 1", "headline 2", "headline 3", "headline 4", "headline 5"],
    "proofHierarchy": ["strongest proof first", "second strongest", ...],
    "conversationStarters": ["hook 1", "hook 2", "hook 3"],
    "toneAndVoice": "describe the exact tone and voice to use"
  },
  "awarenessLevel": "unaware|problem-aware|solution-aware|product-aware|most-aware",
  "positioningStatement": "one powerful positioning statement"
}

Be specific. Use the customer's actual language from the research. No generic marketing speak.`;

          } else if (stageName === 'copywriting') {
            // Copywriting: Create messaging per angle
            const findings = cycle.researchFindings;
            prompt = `You are a direct response copywriter creating ad messaging for ${campaign.brand}.

${cycle.strategies ? `APPROVED ANGLES:\n${cycle.strategies.filter(s => s.feasibility !== 'low').map(s => `- Angle: ${s.angleId}\n  Plan: ${s.executionPlan}\n  Format: ${s.recommendedFormats.join(', ')}`).join('\n')}` : `STRATEGY:\n${cycle.stages.strategy.agentOutput?.slice(0, 2000) || 'No strategy available'}`}

${findings ? `Audience Language: ${findings.avatarLanguage?.slice(0, 5).map(l => `"${l}"`).join(', ') || 'N/A'}
Verbatim Quotes: ${findings.verbatimQuotes?.slice(0, 3).map(q => `"${q}"`).join(', ') || 'N/A'}` : ''}
${cycle.brandDNA ? `Brand Voice: ${cycle.brandDNA.voiceTone}\nPersonality: ${cycle.brandDNA.personality}` : ''}
${cycle.personas ? `Personas: ${cycle.personas.map(p => `${p.name} — desires: ${p.desires.slice(0, 2).join(', ')}`).join('; ')}` : ''}

For EACH approved angle, create 3 copy variations:
§ ANGLE: [angle name]
  VARIATION 1:
    Headline: [5-10 words, scroll-stopping]
    Subtext: [1-2 sentences expanding the hook]
    CTA: [action-oriented, desire-connected]
    Callouts: [3-4 bullet points of proof/benefits]
  VARIATION 2: [different emotional angle]
  VARIATION 3: [different format/tone]

Use THEIR language — not brand speak. Every word should feel like it came from the customer's mouth.`;

          } else if (stageName === 'production') {
            // Production: stub — MakeStudio handles actual ad generation
            prompt = `Production stage for ${campaign.brand}.

This stage generates actual ad creatives using the copy blocks and strategy from previous stages.

${cycle.stages.copywriting.agentOutput ? `COPY AVAILABLE:\n${cycle.stages.copywriting.agentOutput.slice(0, 1500)}` : 'No copy blocks available yet.'}

Summarize the production plan:
1. Which copy blocks to produce first
2. Recommended formats and dimensions
3. Visual direction based on brand DNA
4. Priority order for ad generation`;

          } else if (stageName === 'test') {
            // Test: Evaluate produced ads
            const findings = cycle.researchFindings;
            const productionOutput = cycle.stages.production.agentOutput;

            prompt = `You are a direct response ad strategist evaluating creative effectiveness for ${campaign.brand}.

${findings ? `TARGET DESIRES:\n${(findings.deepDesires || []).map(d => `- ${d.targetSegment}: "${d.deepestDesire}" (${d.desireIntensity})`).join('\n') || 'Not yet identified'}

ROOT CAUSE: "${findings.rootCauseMechanism?.ahaInsight || 'N/A'}"
MARKET SOPHISTICATION: Level ${findings.marketSophistication || 3}` : ''}

CREATIVE ASSETS TO EVALUATE:
${productionOutput || 'No production output available'}

Score each concept on these 5 dimensions (1-10 scale):
1. desireActivation — does it tap deep desire or just surface?
2. rootCauseReveal — does it explain the "aha" mechanism?
3. emotionalLogical — emotional hook (System 1) AND logical proof (System 2)?
4. audienceLanguage — uses their actual words or generic brand speak?
5. competitiveDiff — owns a gap competitors can't claim?

For each concept assign a verdict: "lead" (run as primary), "test" (run as A/B variant), or "skip" (not worth testing).

Output your evaluation as ONLY a valid JSON object with this exact structure (no markdown, no explanation outside JSON):
{
  "concepts": [
    {
      "name": "concept name or identifier",
      "scores": {
        "desireActivation": 7,
        "rootCauseReveal": 5,
        "emotionalLogical": 8,
        "audienceLanguage": 6,
        "competitiveDiff": 9
      },
      "totalScore": 35,
      "verdict": "lead",
      "notes": "brief evaluation notes"
    }
  ],
  "winner": "name of the winning concept",
  "nextCycleImprovement": "key improvement recommendation for next cycle"
}`;
          }

          // Create abort controller for this stage
          abortControllerRef.current = new AbortController();

          // Generate using Ollama with stage-specific model — stream chunks live into agentOutput
          const stageStartTime = Date.now();
          const modelForStage = getModelForStage(stageName);
          result = await generate(prompt, systemPrompt, {
            model: modelForStage,
            signal: abortControllerRef.current.signal,
            onChunk: (chunk) => {
              stage.agentOutput += chunk;
              throttledSetCycle(cycle);
            },
          });

          // Capture metadata for this stage
          stage.model = modelForStage;
          stage.processingTime = Date.now() - stageStartTime;
          stage.rawOutput = result;
        }

        // For research stage, keep the progressive output (agent thought process)
        // instead of overwriting with final synthesis
        if (stageName !== 'research') {
          stage.agentOutput = result;
        }
        // Store processedOutput separately for downstream stages
        stage.processedOutput = result;

        // Parse strategy stage JSON into structured CreativeStrategy
        if (stageName === 'strategy' && result) {
          try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              cycle.creativeStrategy = parsed;
            }
          } catch {
            // Strategy output wasn't valid JSON — keep raw text
            console.warn('Failed to parse creative strategy JSON');
          }
        }

        // Parse test stage JSON into structured TestVerdict
        if (stageName === 'test' && result) {
          try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.concepts && Array.isArray(parsed.concepts)) {
                cycle.testVerdict = parsed;
              }
            }
          } catch {
            // Test output wasn't valid JSON — keep raw text
            console.warn('Failed to parse test verdict JSON');
          }
        }

        stage.status = 'complete';
        stage.completedAt = Date.now();
        stage.readyForNext = true;

        // Stop thinking sound, play stage complete AHA
        stopSoundLoop('thinking');
        playSound('stageComplete');

        // Use refreshed reference to ensure React detects the change
        setCurrentCycle(refreshCycleReference(cycle));

        return stage;
      } catch (err) {
        stopSoundLoop('thinking');
        playSound('error');
        const msg = err instanceof Error ? err.message : 'Stage execution failed';
        setError(msg);
        throw err;
      }
    },
    [generate, executeOrchestratedResearch, throttledSetCycle, handleResearchPauseForInput]
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

      isRunningRef.current = true;
      setIsRunning(true);
      setError(null);

      // Reset per-run stores
      userAnswersRef.current = {};
      visualProgressStore.reset();
      tokenTracker.resetSession();

      // Pre-research checkpoint
      const stageOutputs: Record<string, string> = {};
      const preResearchAnswer = await askCheckpointQuestion('pre-research', campaign, stageOutputs);
      if (preResearchAnswer) {
        // Inject user direction into campaign context for research
        campaign = { ...campaign, productFeatures: [...campaign.productFeatures, `[User direction: ${preResearchAnswer}]`] };
      }

      while (isRunningRef.current) {
        try {
          // Execute current stage
          await executeStage(cycle, cycle.currentStage, campaign);
          // State already updated in executeStage, but refresh again to be sure
          setCurrentCycle(refreshCycleReference(cycle));

          // Capture stage output for checkpoint questions
          const completedStage = cycle.currentStage;
          stageOutputs[completedStage] = cycle.stages[completedStage]?.processedOutput || cycle.stages[completedStage]?.agentOutput || '';

          // Save cycle progress
          await updateCycle(cycle);

          // Mid-pipeline checkpoint: after angles, before strategy
          if (completedStage === 'angles') {
            const midAnswer = await askCheckpointQuestion('mid-pipeline', campaign, stageOutputs);
            if (midAnswer) {
              stageOutputs['user_creative_direction'] = midAnswer;
            }
          }

          // Pre-production checkpoint: after copywriting, before production
          if (completedStage === 'copywriting') {
            const preMakeAnswer = await askCheckpointQuestion('pre-make', campaign, stageOutputs);
            if (preMakeAnswer) {
              stageOutputs['user_make_direction'] = preMakeAnswer;
            }
          }

          // Delay before next stage (abortable)
          if (!isRunningRef.current) break;
          await new Promise((resolve) => {
            timeoutRef.current = setTimeout(resolve, STAGE_DELAY);
          });
          if (!isRunningRef.current) break;

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
          const isAbort = msg.includes('aborted') || msg.includes('Abort') || (err instanceof DOMException && err.name === 'AbortError');
          if (!isAbort) {
            setError(msg);
          }
          // On abort: stop() already set isRunningRef=false, just break out
          if (isAbort) {
            break;
          }
          // On real errors: stop the loop
          isRunningRef.current = false;
          setIsRunning(false);
          break;
        }
      }

      // Ensure cleanup on exit
      isRunningRef.current = false;
      setIsRunning(false);
    },
    [executeStage, advanceToNextStage, updateCycle, saveCycle, askCheckpointQuestion]
  );

  const start = useCallback(
    async (campaign: Campaign, cycleNumber: number = 1, mode: CycleMode = 'full') => {
      if (isRunning) return;
      await runCycle(campaign, cycleNumber, mode);
    },
    [isRunning, runCycle]
  );

  const stop = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    setError(null);

    // Stop thinking sound
    stopSoundLoop('thinking');

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

    // Reset current stage status from 'in-progress' back to 'pending'
    // so the UI doesn't show "Running" / "Processing" after stop
    const cycle = cycleRef.current;
    if (cycle) {
      const stage = cycle.stages[cycle.currentStage];
      if (stage && stage.status === 'in-progress') {
        stage.status = 'pending';
        // Keep any partial output for resume
      }
      setCurrentCycle(refreshCycleReference(cycle));
    }

    // Flush any pending throttled update
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      isRunningRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    isRunning,
    currentCycle,
    error,
    start,
    stop,
  };
}
