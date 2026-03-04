import { useOllama } from './useOllama';
import type { Campaign, DeepDesire, Objection, ResearchFindings } from '../types';

interface ResearchResult {
  processedOutput: string;
  rawOutput: string;
  model: string;
  tokensUsed?: number;
  processingTime?: number;
  researchFindings?: ResearchFindings;
}

/**
 * Desire-Driven Research Agent (Zakaria Framework)
 * Maps deep customer desires, not just surface problems
 * Identifies objections and positioning gaps
 * Works standalone for research/concepting or within full cycle
 */
export function useResearchAgent() {
  const { generate } = useOllama();

  /**
   * Step 1: Map Deep Desires for audience
   * Surface Problem → Layers → Deep Desire
   * Example: "Back pain" → "Can't work" → "Can't provide for family"
   */
  const mapDeepDesires = async (campaign: Campaign, brainModel: string = 'glm-4.7-flash:q4_K_M'): Promise<DeepDesire[]> => {
    const prompt = `You are a consumer psychology expert using the Zakaria Framework for desire mapping.

Campaign:
- Brand: ${campaign.brand}
- Target Audience: ${campaign.targetAudience}
- Marketing Goal: ${campaign.marketingGoal}

For the target audience, identify 3-4 DEEP DESIRES. Map each from surface problem to deep desire.

Structure for EACH desire:
{
  "surfaceProblem": "What they say they want to solve",
  "layers": [
    { "level": 1, "description": "Immediate consequence", "example": "..." },
    { "level": 2, "description": "Secondary impact", "example": "..." },
    { "level": 3, "description": "Life impact", "example": "..." }
  ],
  "deepestDesire": "What they REALLY want (identity, status, loved ones, survival)",
  "desireIntensity": "low|moderate|high|extreme",
  "targetSegment": "Who has this desire most intensely"
}

Example for skincare (Mother):
Surface: "Clean ingredients"
Layer 2: "Products that won't harm kids' skin"
Layer 3: "Being a good, protective mother"
Deep: "Peace of mind that I'm doing right by my kids"

Return ONLY valid JSON array, no other text.`;

    try {
      const result = await generate(prompt, '', { model: brainModel });
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (err) {
      console.error('Error mapping deep desires:', err);
      return [];
    }
  };

  /**
   * Step 2: Identify Objections
   * What stops the deep desire from converting to purchase?
   */
  const identifyObjections = async (campaign: Campaign, desires: DeepDesire[], brainModel: string = 'glm-4.7-flash:q4_K_M'): Promise<Objection[]> => {
    const desiresText = desires.map(d => `${d.targetSegment}: ${d.deepestDesire}`).join('\n');

    const prompt = `You are a sales psychology expert. Given these customer desires, what objections prevent purchase?

Campaign: ${campaign.brand}
Desires:
${desiresText}

Identify 5-7 SPECIFIC objections. For each, rank by:
- How often it comes up (common|moderate|rare)
- How much it blocks sales (high|medium|low)
- How to handle it

JSON format:
{
  "objection": "The specific objection/doubt",
  "frequency": "common|moderate|rare",
  "impact": "high|medium|low",
  "handlingApproach": "How to address this in messaging/creative",
  "requiredProof": ["type of proof needed - testimonial|before-after|mechanism|data|video"]
}

Think deeply about what's REALLY stopping purchase, not generic objections.
Return ONLY valid JSON array.`;

    try {
      const result = await generate(prompt, '', { model: brainModel });
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (err) {
      console.error('Error identifying objections:', err);
      return [];
    }
  };

  /**
   * Step 3: Research Audience Behavior
   * Where do they congregate? What have they tried? What language do they use?
   */
  const researchAudienceBehavior = async (campaign: Campaign, brainModel: string = 'glm-4.7-flash:q4_K_M') => {
    const prompt = `You are a market researcher. Research the ${campaign.targetAudience} audience for ${campaign.brand}.

Return JSON with:
{
  "avatarLanguage": ["buzzword1", "phrase2", "how they describe problems"],
  "whereAudienceCongregates": ["reddit communities", "facebook groups", "forums", "platforms"],
  "whatTheyTriedBefore": ["failed solution 1", "product they abandoned", "approach they discarded"],
  "competitorWeaknesses": ["positioning no one claims", "gap in market", "audience frustration with competitors"]
}

Be specific - not generic.
Return ONLY valid JSON.`;

    try {
      const result = await generate(prompt, '', { model: brainModel });
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { avatarLanguage: [], whereAudienceCongregates: [], whatTheyTriedBefore: [], competitorWeaknesses: [] };
    } catch (err) {
      console.error('Error researching audience behavior:', err);
      return { avatarLanguage: [], whereAudienceCongregates: [], whatTheyTriedBefore: [], competitorWeaknesses: [] };
    }
  };

  /**
   * Main Research Flow: Desire Mapping + Objections + Audience Research
   * Outputs structured ResearchFindings for use in Objections and Taste stages
   */
  const executeResearch = async (
    campaign: Campaign,
    onProgress?: (msg: string) => void,
    brainModel: string = 'glm-4.7-flash:q4_K_M'
  ): Promise<ResearchResult> => {
    const startTime = Date.now();
    onProgress?.(`\n────────────────────────────────────────────────\n`);
    onProgress?.(`RESEARCH PHASE: Desire-Driven Analysis (Zakaria Framework)\n`);
    onProgress?.(`────────────────────────────────────────────────\n\n`);
    onProgress?.(`[CAMPAIGN_DATA]\n`);
    onProgress?.(`Brand: ${campaign.brand}\n`);
    onProgress?.(`Target Audience: ${campaign.targetAudience}\n`);
    onProgress?.(`Marketing Goal: ${campaign.marketingGoal}\n\n`);

    // Step 1: Map Deep Desires
    onProgress?.(`STEP 1: Mapping deep customer desires...\n`);
    const deepDesires = await mapDeepDesires(campaign, brainModel);

    if (deepDesires.length === 0) {
      onProgress?.(`ERROR: Could not identify customer desires.\n`);
      return {
        processedOutput: 'Failed to identify customer desires.',
        rawOutput: 'Failed to identify customer desires.',
        model: brainModel,
        processingTime: Date.now() - startTime,
      };
    }

    onProgress?.(`Identified ${deepDesires.length} deep desire hierarchies:\n`);
    deepDesires.forEach((d, i) => {
      onProgress?.(`  [${i + 1}] ${d.targetSegment}: ${d.deepestDesire}\n`);
      onProgress?.(`       Surface: "${d.surfaceProblem}" (Intensity: ${d.desireIntensity})\n`);
    });

    // Step 2: Identify Objections
    onProgress?.(`\nSTEP 2: Identifying purchase objections...\n`);
    const objections = await identifyObjections(campaign, deepDesires, brainModel);

    onProgress?.(`Found ${objections.length} key objections:\n`);
    objections.slice(0, 3).forEach((o, i) => {
      onProgress?.(`  [${i + 1}] "${o.objection}" (${o.frequency}, impact: ${o.impact})\n`);
    });

    // Step 3: Research Audience Behavior
    onProgress?.(`\nSTEP 3: Researching audience behavior & market gaps...\n`);
    const audienceBehavior = await researchAudienceBehavior(campaign, brainModel);

    onProgress?.(`Audience congregates: ${audienceBehavior.whereAudienceCongregates.slice(0, 2).join(', ')}\n`);
    onProgress?.(`Key language: "${audienceBehavior.avatarLanguage.slice(0, 3).join('", "')}"...\n`);
    onProgress?.(`Market gap: ${audienceBehavior.competitorWeaknesses[0] || 'positioning to claim'}\n`);

    // Synthesize Findings
    const researchFindings: ResearchFindings = {
      deepDesires,
      objections,
      avatarLanguage: audienceBehavior.avatarLanguage,
      whereAudienceCongregates: audienceBehavior.whereAudienceCongregates,
      whatTheyTriedBefore: audienceBehavior.whatTheyTriedBefore,
      competitorWeaknesses: audienceBehavior.competitorWeaknesses,
    };

    const output = `RESEARCH FINDINGS: Desire-Driven Intelligence

DEEP DESIRES (What customers REALLY want):
${deepDesires.map(d => `- ${d.targetSegment}: "${d.deepestDesire}"\n  Surface problem: "${d.surfaceProblem}"\n  Intensity: ${d.desireIntensity}`).join('\n\n')}

KEY OBJECTIONS (What stops purchase):
${objections.slice(0, 5).map(o => `- "${o.objection}" (${o.frequency}, high impact: ${o.impact === 'high' ? 'YES' : 'no'})\n  Handle via: ${o.handlingApproach}`).join('\n\n')}

AUDIENCE BEHAVIOR:
- Where they gather: ${audienceBehavior.whereAudienceCongregates.join(', ')}
- Language they use: ${audienceBehavior.avatarLanguage.join(', ')}
- What they tried before: ${audienceBehavior.whatTheyTriedBefore.join(', ')}
- Market gap: ${audienceBehavior.competitorWeaknesses.join(', ')}

Ready for: Objection Handling → Creative Direction (Taste)`;

    onProgress?.(`\nRESEARCH COMPLETE\n`);
    onProgress?.(`────────────────────────────────────────────────\n\n`);

    const processingTime = Date.now() - startTime;

    return {
      processedOutput: output,
      rawOutput: output,
      model: brainModel,
      processingTime,
      researchFindings,
    };
  };

  return {
    executeResearch,
  };
}
