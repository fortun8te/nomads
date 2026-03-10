import { useState, useCallback, useEffect, useRef } from 'react';
import type { Campaign, Cycle, StageName, StageData, CycleMode, UserQuestion, QuestionCheckpoint, ResearchFindings } from '../types';
import type { ResearchPauseEvent } from '../utils/researchAgents';
import { useOllama } from './useOllama';
import { useStorage } from './useStorage';
import { useOrchestratedResearch } from './useOrchestratedResearch';
import { getSystemPrompt, getCheckpointQuestionPrompt } from '../utils/prompts';
import { getModelForStage } from '../utils/modelConfig';
import { getFrameworkContext } from '../utils/desireFramework';

/** Generate a persona context block for injection into downstream stage prompts */
function buildPersonaContext(findings: any): string {
  const persona = findings?.persona;
  if (!persona?.name) return '';

  return `
TARGET PERSONA: "${persona.name}" (${persona.age})
${persona.situation}
Identity: ${persona.identity}
Pain (in their words): "${persona.painNarrative}"
Inner monologue: "${persona.innerMonologue}"
Turning point: ${persona.turningPointMoment}
Deep desire: "${persona.deepDesire}"
Biggest fear: "${persona.biggestFear}"
How they talk: ${persona.languagePatterns?.slice(0, 4).map((l: string) => `"${l}"`).join(', ') || 'N/A'}
Purchase journey: ${persona.purchaseJourney}
Social influence: ${persona.socialInfluence}
`;
}

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

export function useCycleLoop(askUser?: (question: UserQuestion) => Promise<string>) {
  const { generate } = useOllama();
  const { executeOrchestratedResearch } = useOrchestratedResearch();
  const { saveCycle, updateCycle } = useStorage();

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentCycle, setCurrentCycle] = useState<Cycle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewingStage, setReviewingStage] = useState<StageName | null>(null);
  const [reviewFindings, setReviewFindings] = useState<ResearchFindings | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleRef = useRef<Cycle | null>(null);
  const isPausedRef = useRef(false);
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
    if (now - lastUpdateRef.current >= 150) {
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
      }, 150);
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

  // Resume after research review
  const resumeAfterReview = useCallback(
    (updatedFindings?: ResearchFindings) => {
      if (updatedFindings && cycleRef.current) {
        cycleRef.current.researchFindings = updatedFindings;
      }
      setReviewingStage(null);
      setReviewFindings(null);
      isPausedRef.current = false;
      setIsPaused(false);
    },
    []
  );

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
        } else if (stageName === 'objections') {
          // Objection Handling Stage — Root Cause + Mechanism framework
          const findings = cycle.researchFindings;
          if (!findings || findings.objections.length === 0) {
            // Generate objections inline from desires instead of giving up
            const fallbackDesires = findings?.deepDesires?.map(d => `- ${d.targetSegment}: "${d.deepestDesire}"`).join('\n') || '- General audience';
            const rootCause = findings?.rootCauseMechanism;
            const fallbackPrompt = `You are a sales copywriter using the root cause + mechanism framework for objection handling.

Based on these customer desires for ${campaign.brand} (${campaign.productDescription}):
${fallbackDesires}

Root Cause: ${rootCause?.rootCause || 'Not yet identified'}
Mechanism: ${rootCause?.mechanism || 'Not yet identified'}
AHA Insight: "${rootCause?.ahaInsight || 'Not yet identified'}"

Generate 5 objection-handling blocks. For each:
OBJECTION: [the specific doubt in their language]
ACKNOWLEDGE: [show empathy — you get it]
ROOT CAUSE REFRAME: [why everything else failed — the "aha"]
MECHANISM ANSWER: [how this specifically fixes the root cause]
PROOF NEEDED: [evidence type — testimonial/before-after/mechanism demo/data]
DESIRE HOOK: [reconnect to their deep desire]

Be specific, powerful, and use customer language — not brand speak.`;

            abortControllerRef.current = new AbortController();
            const stageStartTime = Date.now();
            result = await generate(fallbackPrompt, getSystemPrompt('objections'), {
              model: getModelForStage('objections'),
              signal: abortControllerRef.current.signal,
              onChunk: (chunk) => {
                stage.agentOutput += chunk;
                throttledSetCycle(cycle);
              },
            });
            stage.model = getModelForStage('objections');
            stage.processingTime = Date.now() - stageStartTime;
            stage.rawOutput = result;
          } else {
            const rootCause = findings.rootCauseMechanism;
            const marketSoph = findings.marketSophistication || 3;
            const sophisticationNote = marketSoph <= 2
              ? 'Market is relatively unsophisticated — objection handling can be direct and mechanism-focused.'
              : marketSoph === 3
              ? 'Market is CROWDED — objections require NEW MECHANISM explanation. Show WHY this is different from everything else.'
              : 'Market is SKEPTICAL (Level 4) — objections require OVERWHELMING PROOF. Lead with personal stories and evidence, not claims.';

            const personaBlock = buildPersonaContext(findings);
            const prompt = `You are a sales copywriter using the root cause + mechanism framework for objection handling.

${getFrameworkContext('objections')}

MARKET SOPHISTICATION: Level ${marketSoph}
${sophisticationNote}
${personaBlock ? `${personaBlock}` : ''}

Customer Desires (deep, not surface):
${findings.deepDesires.map(d => `- SUB-AVATAR: ${d.targetSegment}
  Deep Desire: "${d.deepestDesire}" (${d.desireIntensity})
  Turning Point: ${d.turningPoint || 'N/A'}
  Amplified Type: ${d.amplifiedDesireType || 'other'}`).join('\n')}

ROOT CAUSE MECHANISM:
- Root Cause: ${rootCause?.rootCause || 'Not identified'}
- Mechanism: ${rootCause?.mechanism || 'Not identified'}
- AHA Insight: "${rootCause?.ahaInsight || 'Not identified'}"

Key Objections to Handle:
${findings.objections.slice(0, 6).map(o => `- "${o.objection}"
  Frequency: ${o.frequency}, Impact: ${o.impact}
  Approach: ${o.handlingApproach}
  Mechanism Answer: ${o.rootCauseAnswer || 'N/A'}`).join('\n\n')}

${findings.whatTheyTriedBefore?.length > 0 ? `What They Tried Before (and it FAILED):\n${findings.whatTheyTriedBefore.map(t => `- ${t}`).join('\n')}\n` : ''}
${findings.verbatimQuotes?.length ? `Verbatim Customer Language:\n${findings.verbatimQuotes.slice(0, 5).map(q => `"${q}"`).join('\n')}\n` : ''}
For EACH objection, use the ROOT CAUSE framework:
1. ACKNOWLEDGE: Show you understand their doubt in THEIR language
2. ROOT CAUSE: Reveal WHY everything else failed (the "aha" moment)
3. MECHANISM: Show HOW this product fixes the root cause (not just "it's better")
4. PROOF: Specify the type of proof that dissolves doubt (testimonial/before-after/mechanism demo/data)
5. DESIRE RECONNECT: Remind them what they REALLY want (deep desire, not surface)

Format as:
OBJECTION: [objection text — in their language]
ACKNOWLEDGE: [Show you get it — use their words]
ROOT CAUSE REFRAME: [Why everything else failed — the "aha"]
MECHANISM ANSWER: [How this specifically fixes the root cause]
PROOF NEEDED: [Specific proof type + what it should show]
DESIRE HOOK: [Reconnect to their deep desire / turning point]

Be specific, powerful, and use THEIR language — not brand speak.`;

            const systemPrompt = getSystemPrompt('objections');
            // Fresh abort controller for this stage (same pattern as taste/make/test/memories)
            abortControllerRef.current = new AbortController();
            const stageStartTime = Date.now();
            result = await generate(prompt, systemPrompt, {
              model: getModelForStage('objections'),
              signal: abortControllerRef.current.signal,
              onChunk: (chunk) => {
                stage.agentOutput += chunk;
                throttledSetCycle(cycle);
              },
            });
            stage.model = getModelForStage('objections');
            stage.processingTime = Date.now() - stageStartTime;
            stage.rawOutput = result;
          }
        } else {
          let prompt = '';
          if (stageName === 'taste') {
            // Desire-Driven Creative Direction with Market Sophistication
            const findings = cycle.researchFindings;
            const objectionsOutput = cycle.stages.objections?.agentOutput || '';

            if (findings && findings.deepDesires.length > 0) {
              const competitorGaps = findings.competitorWeaknesses.join(', ');
              const rootCause = findings.rootCauseMechanism;
              const marketSoph = findings.marketSophistication || 3;

              const sophisticationStrategy = marketSoph === 1
                ? 'INTRODUCE the mechanism. This is a virgin market — just show it works. Simple, clear, direct.'
                : marketSoph === 2
                ? 'Make BIGGER claims. Early competition — compete on degree, speed, power. "3x more effective."'
                : marketSoph === 3
                ? 'Introduce a NEW MECHANISM. Crowded market — don\'t just say "better." Explain WHY via root cause. New angle, new explanation.'
                : 'Lead with IDENTITY + OVERWHELMING PROOF. Skeptical market — they\'ve tried everything. Start with someone JUST LIKE THEM who succeeded. Before-afters, testimonials, guarantees.';

              const tastePersonaBlock = buildPersonaContext(findings);
              prompt = `You are a creative strategist using desire-driven positioning.

${getFrameworkContext('taste')}

MARKET SOPHISTICATION: Level ${marketSoph}
MESSAGING STRATEGY: ${sophisticationStrategy}
${tastePersonaBlock ? `${tastePersonaBlock}` : ''}

Customer Desires (Ranked by Power):
${findings.deepDesires.map((d, i) => `${i + 1}. SUB-AVATAR: ${d.targetSegment}
   DEEP DESIRE: "${d.deepestDesire}" (${d.desireIntensity})
   TURNING POINT: ${d.turningPoint || 'Not identified'}
   AMPLIFIED TYPE: ${d.amplifiedDesireType || 'other'}
   Surface: "${d.surfaceProblem}"`).join('\n\n')}

ROOT CAUSE + MECHANISM:
- Root Cause: ${rootCause?.rootCause || 'N/A'}
- Mechanism: ${rootCause?.mechanism || 'N/A'}
- AHA Insight: "${rootCause?.ahaInsight || 'N/A'}"
- Belief Chain: ${rootCause?.chainOfYes?.map((s, i) => `${i + 1}. "${s}"`).join(' → ') || 'N/A'}

Objection Handling Strategy:
${objectionsOutput.slice(0, 1500)}

Market Gaps (unclaimed positioning):
${competitorGaps}

${findings.avatarLanguage?.length > 0 ? `Audience Language (VERBATIM — use these exact phrases):\n${findings.avatarLanguage.slice(0, 8).map(l => `"${l}"`).join(', ')}\n` : ''}
${findings.verbatimQuotes?.length ? `Real Customer Quotes:\n${findings.verbatimQuotes.slice(0, 5).map(q => `"${q}"`).join('\n')}\n` : ''}
${findings.visualFindings ? `
VISUAL COMPETITIVE INTELLIGENCE:
Competitor Visual Patterns: ${findings.visualFindings.commonPatterns.join('; ')}
Visual Gaps (unclaimed): ${findings.visualFindings.visualGaps.join('; ')}
Recommended Visual Differentiation: ${findings.visualFindings.recommendedDifferentiation.join('; ')}

Individual Competitor Visuals:
${findings.visualFindings.competitorVisuals.slice(0, 3).map((v: any) =>
  `- ${v.url}: Tone=${v.visualTone}, Colors=${v.dominantColors.join(',')}, Elements=${v.keyVisualElements.join(',')}`
).join('\n')}

USE THIS VISUAL INTELLIGENCE to make our creative direction VISUALLY DISTINCT from competitors.
` : ''}
${userAnswersRef.current['mid-pipeline'] ? `\nUSER DIRECTION: "${userAnswersRef.current['mid-pipeline']}". Prioritize this.\n` : ''}
Define the Creative Direction:

1. PRIMARY DESIRE ANGLE: Which deep desire to lead with? Why?
2. TURNING POINT HOOK: How do we activate the turning point moment in the creative?
3. ROOT CAUSE REVEAL: How do we introduce the "aha" insight visually/verbally?
4. MECHANISM DEMO: How do we show the mechanism in action?
5. MARKET SOPHISTICATION TACTICS: Given Level ${marketSoph}, what specific approach?
   ${marketSoph >= 3 ? '- Need NEW MECHANISM explanation (not just "better")' : ''}
   ${marketSoph >= 4 ? '- Need IDENTITY-LED creative (someone just like them)' : ''}
6. PROOF STRATEGY: What types of proof, and how to present them?
7. COMPETITIVE POSITIONING: Own what gap? Attack what weakness?

Visual & Messaging Specs:
- Visual Direction: [colors, mood, aesthetic that supports the desire + mechanism]
- Messaging Tone: [language style — use audience verbatim, not brand speak]
- System 1 (Emotion): [What triggers the emotional response in <2 seconds?]
- System 2 (Logic): [What builds belief through mechanism + proof?]
- Copy Angles: [5 messaging variations — each tied to a different desire/objection combo]
- Objection-Handling Visuals: [how to show proof without feeling like a sales pitch]
${findings.visualFindings ? `- Visual Differentiation: [Based on competitor visual analysis — what exact visual choices make us look DIFFERENT? Colors competitors DON'T use, layouts they avoid, elements we can own]` : ''}

Remember: System 1 (emotion) gets the click. System 2 (logic) gets the purchase. You need BOTH.`;
            } else {
              // Fallback if research findings unavailable
              prompt = `Define creative direction for ${campaign.brand} targeting ${campaign.targetAudience}.

Research findings:
${cycle.stages.research.agentOutput}

Create a strategic creative direction that:\n1. Aligns with audience psychology\n2. Differentiates from competitors\n3. Will resonate emotionally\n\nBe specific about colors, pacing, tone, and messaging angles.`;
            }
          } else if (stageName === 'make') {
            // Multi-Angle Asset Generation — using Taste + Phase 3 competitor intelligence
            const findings = cycle.researchFindings;
            const competitorAds = findings?.competitorAds;

            // Use makeAgent if Phase 3 completed (has competitor ads)
            if (competitorAds && competitorAds.competitors.length > 0) {
              try {
                const { generateMakeConcepts } = await import('../utils/makeAgent');

                // Build Taste findings object from agentOutput text
                const tasteFindings: any = {
                  brandVoice: 'professional yet approachable',
                  recommendedColors: ['#1a1a1a', '#ff6b35', '#ffffff'],
                  brandTone: 'authority + lifestyle',
                  positioning: 'premium but accessible',
                  recommendedCopyAngles: ['transformation', 'social proof', 'uniqueness'],
                  visualStyle: 'clean, modern, benefit-focused',
                  adFormats: ['static image', 'carousel', 'video testimonial'],
                  unusedEmotionalSpace: ['belonging', 'discovery'],
                };

                abortControllerRef.current = new AbortController();
                const stageStartTime = Date.now();

                const makeOutput = await generateMakeConcepts(
                  campaign,
                  tasteFindings,
                  competitorAds,
                  (msg) => {
                    stage.agentOutput += msg + '\n';
                    throttledSetCycle(cycle);
                  },
                  abortControllerRef.current.signal
                );

                // Format output for display
                result = makeOutput.concepts
                  .map(
                    (c) =>
                      `---CONCEPT ${c.conceptNumber}---
Hook Angle: ${c.hookAngle}
Emotional Driver: ${c.emotionalDriver}
Headline: ${c.headline}
Body: ${c.body}
CTA: ${c.cta}
${c.offer ? `Offer: ${c.offer}` : ''}
Format: ${c.adFormat}
Visual Direction: ${c.visualDirection}
Rationale: ${c.rationale}`
                  )
                  .join('\n\n');

                // Store artifacts + metadata
                stage.artifacts = makeOutput.concepts;
                stage.processingTime = Date.now() - stageStartTime;
                stage.rawOutput = result;
              } catch (err) {
                console.warn('Make agent failed, falling back to text generation:', err);
                prompt = `Research: ${cycle.stages.research.agentOutput}\n\nCompetitor Ads Found: ${competitorAds.competitors.length} competitors\n\nGenerate 3 different ad creative concepts leveraging competitor insights.`;
              }
            } else {
              // Fallback: no competitor ads available
              prompt = `Research: ${cycle.stages.research.agentOutput}\n\nNo competitor ad intelligence available. Generate 3 creative concepts based on research findings.`;
            }
          } else if (stageName === 'test') {
            // Test Stage: Evaluate creative against desire framework + market sophistication
            const findings = cycle.researchFindings;
            const creativeAssets = cycle.stages.make.agentOutput;

            if (findings && findings.deepDesires.length > 0) {
              const rootCause = findings.rootCauseMechanism;
              const marketSoph = findings.marketSophistication || 3;

              prompt = `You are a direct response ad strategist evaluating creative effectiveness.

${getFrameworkContext('test')}

MARKET SOPHISTICATION: Level ${marketSoph}

TARGET DESIRES:
${findings.deepDesires.map(d => `- ${d.targetSegment}: "${d.deepestDesire}" (${d.desireIntensity})
  Turning Point: ${d.turningPoint || 'N/A'}`).join('\n')}

ROOT CAUSE MECHANISM:
- AHA: "${rootCause?.ahaInsight || 'N/A'}"
- Mechanism: ${rootCause?.mechanism || 'N/A'}

TOP OBJECTIONS:
${findings.objections.slice(0, 3).map(o => `- "${o.objection}" (${o.impact} impact)`).join('\n')}

CREATIVE ASSETS TO EVALUATE:
${creativeAssets}

For EACH of the 3 concepts, evaluate against the framework:

1. DESIRE ACTIVATION: Does it tap into the DEEP desire or just the surface problem?
   - Does it reference the TURNING POINT moment?
   - Does it trigger an AMPLIFIED desire (loved ones / identity / survival)?

2. ROOT CAUSE + MECHANISM: Does it reveal the "aha" insight?
   - Does it explain WHY nothing else worked?
   - Does it make the product feel INEVITABLE (not just "another option")?

3. SYSTEM 1 + SYSTEM 2: Does it have BOTH emotional hook AND logical proof?
   - System 1: Will this STOP THE SCROLL in <2 seconds?
   - System 2: Does it BUILD BELIEF through mechanism + evidence?

4. MARKET SOPHISTICATION FIT: Is the messaging right for Level ${marketSoph}?
   ${marketSoph >= 4 ? '- Does it lead with IDENTITY (someone like them) instead of claims?' : ''}
   ${marketSoph === 3 ? '- Does it introduce a NEW MECHANISM, not just "better"?' : ''}

5. AUDIENCE LANGUAGE: Does it use THEIR words or brand speak?
   ${findings.avatarLanguage?.length > 0 ? `Real audience language: ${findings.avatarLanguage.slice(0, 4).map(l => `"${l}"`).join(', ')}` : ''}

6. OBJECTION HANDLING: Which objections does it address/miss?

7. COMPETITIVE DIFFERENTIATION: Does it own a gap competitors CAN'T claim?
${findings.visualFindings ? `
8. VISUAL DIFFERENTIATION: Based on competitor visual analysis:
   Competitor visual patterns: ${findings.visualFindings.commonPatterns.slice(0, 3).join('; ')}
   - Does our creative look DIFFERENT from competitors?
   - Does it own the visual gaps we identified?
   - Would someone scrolling past STOP because this looks unfamiliar in the category?
` : ''}
RANKING:
- Which angle will drive highest conversion? Why?
- Which angle best matches market sophistication Level ${marketSoph}?
- Which has the strongest HOOK (System 1)?
- Which builds the strongest BELIEF (System 2)?

VERDICT:
[Lead with X, test Y as variant, rework/skip Z because...]
[Key improvement for next cycle]`;
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

      isRunningRef.current = true;
      setIsRunning(true);
      setError(null);

      // Reset user answers for this cycle
      userAnswersRef.current = {};

      // Pre-research checkpoint
      const stageOutputs: Record<string, string> = {};
      const preResearchAnswer = await askCheckpointQuestion('pre-research', campaign, stageOutputs);
      if (preResearchAnswer) {
        // Inject user direction into campaign context for research
        campaign = { ...campaign, productFeatures: [...campaign.productFeatures, `[User direction: ${preResearchAnswer}]`] };
      }

      while (isRunningRef.current) {
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

          // Capture stage output for checkpoint questions
          const completedStage = cycle.currentStage;
          stageOutputs[completedStage] = cycle.stages[completedStage]?.processedOutput || cycle.stages[completedStage]?.agentOutput || '';

          // Save cycle progress
          await updateCycle(cycle);

          // Research review: if research just completed and interactive mode is on, show review modal
          if (completedStage === 'research' && isInteractive()) {
            setReviewingStage('research');
            setReviewFindings(cycle.researchFindings || null);
            isPausedRef.current = true;
            setIsPaused(true);
            // Return from loop to wait for review to complete
            return;
          }

          // Mid-pipeline checkpoint: after objections, before taste
          if (completedStage === 'objections') {
            const midAnswer = await askCheckpointQuestion('mid-pipeline', campaign, stageOutputs);
            if (midAnswer) {
              stageOutputs['user_creative_direction'] = midAnswer;
            }
          }

          // Pre-make checkpoint: after taste, before make
          if (completedStage === 'taste') {
            const preMakeAnswer = await askCheckpointQuestion('pre-make', campaign, stageOutputs);
            if (preMakeAnswer) {
              stageOutputs['user_make_direction'] = preMakeAnswer;
            }
          }

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
    isPaused,
    currentCycle,
    error,
    reviewingStage,
    reviewFindings,
    start,
    pause,
    resume,
    stop, // Now exported for use in CampaignContext
    resumeAfterReview,
  };
}
