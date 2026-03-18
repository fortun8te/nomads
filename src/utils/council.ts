/**
 * Council of Marketing Brains — Orchestration Engine
 *
 * Runs 7 specialized brains SEQUENTIALLY (one at a time for local GPU),
 * synthesizes through 3 council heads, then produces a single master verdict.
 * Each brain has its own temperature setting.
 *
 * Architecture: 7 Brains (sequential) → 3 Council Heads → 1 Master Verdict
 */

import { ollamaService } from './ollama';
import {
  getTextBrains,
  getVisualBrain,
  COUNCIL_HEADS,
  MASTER_VERDICT_PROMPT,
  buildBrainAnalysisPrompt,
  type BrainOutput,
} from './marketingBrains';
import { getResearchModelConfig, getBrainTemperature, getVisionModel } from './modelConfig';
import type { Campaign, ResearchFindings } from '../types';

// ─────────────────────────────────────────────────────────────
// Council Verdict (final output)
// ─────────────────────────────────────────────────────────────

export interface CouncilVerdict {
  strategicDirection: string;
  primaryAdType: string;
  secondaryAdType: string;
  headlineStrategy: {
    hookType: string;
    why: string;
    examples: string[];
  };
  keyInsights: string[];
  gapsToFill: string[];
  confidenceScore: number;
  dissent: string[];
  offerStructure: string;
  visualConcept: string;
  audienceLanguage: string[];
  avoidList: string[];
  // Raw data for downstream stages
  brainOutputs: BrainOutput[];
  councilHeadOutputs: { headId: string; output: string }[];
  iteration: number;
}

// ─────────────────────────────────────────────────────────────
// Build campaign context string for brain prompts
// ─────────────────────────────────────────────────────────────

function buildCampaignContext(campaign: Campaign): string {
  const parts: string[] = [
    `CAMPAIGN BRIEF:`,
    `Brand: ${campaign.brand}`,
    `Product: ${campaign.productDescription}`,
    `Features: ${campaign.productFeatures?.join(', ') || 'N/A'}`,
    `Price: ${campaign.productPrice || 'N/A'}`,
    `Target Audience: ${campaign.targetAudience}`,
    `Marketing Goal: ${campaign.marketingGoal}`,
  ];

  const p = campaign.presetData;
  if (p) {
    // ── BRAND DNA (deep extraction) ──
    const b = p.brand;
    if (b) {
      parts.push('\n=== BRAND DNA ===');
      if (b.name) parts.push(`Brand Name: ${b.name}`);
      if (b.positioning) parts.push(`Positioning: ${b.positioning}`);
      if (b.brandWhy) parts.push(`Brand WHY: ${b.brandWhy}`);
      if (b.tone || b.toneOfVoice) parts.push(`Tone of Voice: ${b.tone || b.toneOfVoice}`);
      if (b.personality) parts.push(`Brand Personality: ${b.personality}`);
      if (b.bigEnemy) parts.push(`Big Enemy: ${b.bigEnemy}`);
      if (b.missionStatement) parts.push(`Mission: ${b.missionStatement}`);
      if (b.visionStatement) parts.push(`Vision: ${b.visionStatement}`);
      if (b.coreValues) parts.push(`Core Values: ${b.coreValues}`);
      if (b.brandPromise) parts.push(`Brand Promise: ${b.brandPromise}`);
      if (b.founderPersona) parts.push(`Founder: ${b.founderPersona}`);
      if (b.foundingStory) parts.push(`Founding Story: ${b.foundingStory}`);
      if (b.pivotalMilestones) parts.push(`Milestones: ${b.pivotalMilestones}`);
      if (b.emotionalDifferentiation) parts.push(`Emotional Differentiation: ${b.emotionalDifferentiation}`);
      if (b.nicheDefinition) parts.push(`Niche: ${b.nicheDefinition}`);
      if (b.marketPosition) parts.push(`Market Position: ${b.marketPosition}`);
      if (b.targetNeedsUnmet) parts.push(`Unmet Needs: ${b.targetNeedsUnmet}`);
      if (b.buyingExperience) parts.push(`Buying Experience: ${b.buyingExperience}`);
      if (b.colors) parts.push(`Colors: ${b.colors}`);
      if (b.fonts) parts.push(`Fonts: ${b.fonts}`);
      if (b.imageStyle) parts.push(`Image Style: ${b.imageStyle}`);
      if (b.visualIdentity) parts.push(`Visual Identity: ${b.visualIdentity}`);
      if (b.categoryBeliefs?.length) parts.push(`Category Beliefs:\n${b.categoryBeliefs.map((c: string) => `  - ${c}`).join('\n')}`);
    }

    // ── AUDIENCE (deep extraction) ──
    const a = p.audience;
    if (a) {
      parts.push('\n=== TARGET AUDIENCE ===');
      if (a.name) parts.push(`Persona: ${a.name}`);
      if (a.ageRange) parts.push(`Age: ${a.ageRange}`);
      if (a.location) parts.push(`Location: ${a.location}`);
      if (a.income) parts.push(`Income: ${a.income}`);
      if (a.job) parts.push(`Job: ${a.job}`);
      if (a.currentSituation) parts.push(`Current Situation: ${a.currentSituation}`);
      if (a.desiredSituation) parts.push(`Desired Situation: ${a.desiredSituation}`);
      // Pain points (all levels)
      if (a.painPoints) {
        const pp = a.painPoints;
        parts.push('Pain Points:');
        if (pp.primary) parts.push(`  Primary: ${pp.primary}`);
        if (pp.secondary) parts.push(`  Secondary: ${pp.secondary}`);
        if (pp.tertiary) parts.push(`  Tertiary: ${pp.tertiary}`);
        if (pp.quaternary) parts.push(`  Quaternary: ${pp.quaternary}`);
        if (pp.deepestPain) parts.push(`  Deepest: ${pp.deepestPain}`);
      }
      // Values
      if (a.values) {
        const v = a.values;
        parts.push('Values:');
        Object.entries(v).forEach(([k, val]) => {
          if (val) parts.push(`  ${k}: ${val}`);
        });
      }
      // Platforms
      if (a.platforms) {
        parts.push('Platforms:');
        Object.entries(a.platforms).forEach(([k, val]) => {
          if (val) parts.push(`  ${k}: ${val}`);
        });
      }
      if (a.purchaseHistory) parts.push(`Purchase History: ${a.purchaseHistory}`);
      if (a.failedSolutions) parts.push(`Failed Solutions: ${a.failedSolutions}`);
      if (a.buyingTriggers) parts.push(`Buying Triggers: ${a.buyingTriggers}`);
      if (a.buyingJourney) parts.push(`Buying Journey: ${a.buyingJourney}`);
      if (a.identityShift) parts.push(`Identity Shift: ${a.identityShift}`);
      if (a.deepDesire) parts.push(`Deep Desire: ${a.deepDesire}`);
      if (a.decisionMakingStyle) parts.push(`Decision Style: ${a.decisionMakingStyle}`);
      if (a.loyaltyTriggers) parts.push(`Loyalty Triggers: ${a.loyaltyTriggers}`);
      if (a.deepestFears) parts.push(`Deepest Fears: ${a.deepestFears}`);
      if (a.dealBreakers) parts.push(`Deal Breakers: ${a.dealBreakers}`);
      if (a.trustFactors) parts.push(`Trust Factors: ${a.trustFactors}`);
      // Psychographic triggers
      if (a.psychographicTriggers) {
        const pt = a.psychographicTriggers;
        if (pt.respondTo) parts.push(`Responds To: ${pt.respondTo}`);
        if (pt.turnOff) parts.push(`Turn-offs: ${pt.turnOff}`);
        if (pt.anxieties) parts.push(`Anxieties: ${pt.anxieties}`);
        if (pt.aspirations) parts.push(`Aspirations: ${pt.aspirations}`);
      }
    }

    // ── PRODUCT (deep extraction) ──
    const pr = p.product;
    if (pr) {
      parts.push('\n=== PRODUCT ===');
      if (pr.name) parts.push(`Product Name: ${pr.name}`);
      if (pr.category) parts.push(`Category: ${pr.category}`);
      if (pr.ingredients) parts.push(`Ingredients: ${pr.ingredients}`);
      if (pr.keyBenefits) parts.push(`Key Benefits: ${pr.keyBenefits}`);
      if (pr.pricing) parts.push(`Pricing: ${pr.pricing}`);
      if (pr.mechanism) parts.push(`Mechanism: ${pr.mechanism}`);
      if (pr.usage) parts.push(`Usage: ${pr.usage}`);
      if (pr.proof) parts.push(`Proof: ${pr.proof}`);
      if (pr.shelfLife) parts.push(`Shelf Life: ${pr.shelfLife}`);
      if (pr.uniqueMechanism) parts.push(`Unique Mechanism: ${pr.uniqueMechanism}`);
      if (pr.clinicalResults) parts.push(`Clinical Results: ${pr.clinicalResults}`);
      if (pr.socialProof) parts.push(`Social Proof: ${pr.socialProof}`);
    }

    // ── COMPETITIVE (deep extraction) ──
    const c = p.competitive;
    if (c) {
      parts.push('\n=== COMPETITIVE LANDSCAPE ===');
      if (c.competitors?.length) {
        c.competitors.forEach((comp: any) => {
          parts.push(`\nCompetitor: ${comp.name || 'Unknown'}`);
          if (comp.positioning) parts.push(`  Positioning: ${comp.positioning}`);
          if (comp.pricing) parts.push(`  Pricing: ${comp.pricing}`);
          if (comp.strengths) parts.push(`  Strengths: ${comp.strengths}`);
          if (comp.weaknesses) parts.push(`  Weaknesses: ${comp.weaknesses}`);
          if (comp.advertising) parts.push(`  Advertising: ${comp.advertising}`);
        });
      }
      if (c.marketGaps) parts.push(`Market Gaps: ${c.marketGaps}`);
      if (c.whitespace) parts.push(`Whitespace: ${c.whitespace}`);
    }

    // ── STRATEGY (if preset includes it) ──
    const s = p.strategy;
    if (s) {
      parts.push('\n=== PRESET STRATEGY ===');
      if (s.primaryAngle) parts.push(`Primary Angle: ${s.primaryAngle}`);
      if (s.supportingAngles?.length) parts.push(`Supporting Angles: ${s.supportingAngles.join(', ')}`);
      if (s.toneDirection) parts.push(`Tone Direction: ${s.toneDirection}`);
      if (s.visualDirection) parts.push(`Visual Direction: ${s.visualDirection}`);
    }
  }

  return parts.join('\n');
}

/** Summarize existing findings for brain context */
function summarizeFindings(findings: ResearchFindings): string {
  const parts: string[] = [];

  if (findings.deepDesires?.length) {
    parts.push('DEEP DESIRES:');
    findings.deepDesires.forEach(d => {
      parts.push(`- ${d.targetSegment}: "${d.surfaceProblem}" → "${d.deepestDesire}" (${d.desireIntensity})`);
      if (d.turningPoint) parts.push(`  Turning point: ${d.turningPoint}`);
    });
  }

  if (findings.rootCauseMechanism?.rootCause) {
    parts.push(`\nROOT CAUSE: ${findings.rootCauseMechanism.rootCause}`);
    parts.push(`MECHANISM: ${findings.rootCauseMechanism.mechanism}`);
    parts.push(`AHA: "${findings.rootCauseMechanism.ahaInsight}"`);
  }

  if (findings.objections?.length) {
    parts.push('\nOBJECTIONS:');
    findings.objections.slice(0, 5).forEach(o => {
      parts.push(`- "${o.objection}" (${o.frequency}, impact: ${o.impact})`);
    });
  }

  if (findings.persona?.name) {
    const p = findings.persona;
    parts.push(`\nAVATAR: "${p.name}", ${p.age} — ${p.situation}`);
    if (p.painNarrative) parts.push(`Pain: "${p.painNarrative.slice(0, 200)}"`);
    if (p.languagePatterns?.length) parts.push(`Language: ${p.languagePatterns.slice(0, 4).join(', ')}`);
  }

  if (findings.avatarLanguage?.length) {
    parts.push(`\nAUDIENCE LANGUAGE: ${findings.avatarLanguage.slice(0, 5).join(', ')}`);
  }

  if (findings.competitorWeaknesses?.length) {
    parts.push('\nCOMPETITOR GAPS:');
    findings.competitorWeaknesses.slice(0, 4).forEach(w => parts.push(`- ${w}`));
  }

  if (findings.marketSophistication) {
    parts.push(`\nMARKET SOPHISTICATION: Level ${findings.marketSophistication}`);
  }

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Strip model noise + extract JSON
// ─────────────────────────────────────────────────────────────

function stripModelNoise(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function extractJSON(text: string, type: 'array' | 'object'): any {
  const stripped = stripModelNoise(text);
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = stripped.match(pattern);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // Clean common issues
      const cleaned = match[0]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/'/g, '"')
        .replace(/[\x00-\x1f]/g, ' ');
      try {
        return JSON.parse(cleaned);
      } catch {
        console.warn('Council JSON parse failed after cleanup');
      }
    }
  }
  return type === 'array' ? [] : {};
}

// ─────────────────────────────────────────────────────────────
// ROUND 1: Run brains SEQUENTIALLY (one at a time for local GPU)
// ─────────────────────────────────────────────────────────────

async function runBrains(
  campaign: Campaign,
  existingFindings: ResearchFindings | undefined,
  competitorScreenshots: string[] | undefined,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<BrainOutput[]> {
  const campaignContext = buildCampaignContext(campaign);
  const findingsText = existingFindings ? summarizeFindings(existingFindings) : '';

  const textBrains = getTextBrains();
  const visualBrain = getVisualBrain();

  onProgress(`[COUNCIL] Round 1 — Running ${textBrains.length} Marketing Brains sequentially\n\n`);

  const results: BrainOutput[] = [];

  // Run text brains ONE AT A TIME — critical for local GPU (no thrashing)
  for (const brain of textBrains) {
    if (signal?.aborted) throw new Error('Aborted');

    onProgress(`\n${'─'.repeat(48)}\n`);
    onProgress(`[BRAIN:${brain.id}] ${brain.name} analyzing...\n`);
    onProgress(`${'─'.repeat(48)}\n`);

    const prompt = buildBrainAnalysisPrompt(brain, campaignContext, findingsText);
    let rawOutput = '';

    try {
      const researchModel = getResearchModelConfig().councilBrainModel;
      const brainTemp = getBrainTemperature(brain.id);
      rawOutput = await ollamaService.generateStream(prompt, brain.systemPrompt, {
        model: researchModel,
        temperature: brainTemp,
        signal,
        onChunk: (chunk) => onProgress(chunk),
      });
      onProgress('\n');
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error(`Brain ${brain.id} failed:`, err);
      onProgress(`[BRAIN:${brain.id}] Failed — using fallback\n`);
      results.push(createFallbackBrainOutput(brain.id, brain.name));
      continue;
    }

    const parsed = extractJSON(rawOutput, 'object');
    const confidence = parsed.confidence || 5;
    results.push({
      brainId: brain.id,
      brainName: brain.name,
      insights: parsed.insights || [],
      recommendations: parsed.recommendations || [],
      adTypeVote: parsed.adTypeVote || 'problem-solution',
      headlineHookVote: parsed.headlineHookVote || 'curiosity',
      headlineExamples: parsed.headlineExamples || [],
      confidence,
      keyQuote: parsed.keyQuote || '',
      gapsIdentified: parsed.gapsIdentified || [],
      rawOutput,
    });

    onProgress(`[BRAIN:${brain.id}] Done (confidence: ${confidence}/10)\n`);
  }

  // Visual Brain — runs after text brains (if screenshots available)
  if (visualBrain && competitorScreenshots?.length) {
    if (signal?.aborted) throw new Error('Aborted');

    onProgress(`\n${'─'.repeat(48)}\n`);
    onProgress(`[BRAIN:visual] Visual Brain analyzing ${competitorScreenshots.length} images...\n`);
    onProgress(`${'─'.repeat(48)}\n`);

    const prompt = `Analyze these ${competitorScreenshots.length} competitor ad screenshots.
${campaignContext}

Identify visual patterns, gaps, and opportunities. Output JSON:
{
  "insights": ["visual patterns found"],
  "recommendations": ["visual strategy recommendations"],
  "adTypeVote": "which ad type competitors use most",
  "headlineHookVote": "which hook type would differentiate visually",
  "headlineExamples": ["headline ideas based on visual gaps"],
  "confidence": 7,
  "keyQuote": "most important visual insight",
  "gapsIdentified": ["visual territory no competitor occupies"]
}
Return ONLY valid JSON.`;

    let rawOutput = '';
    try {
      rawOutput = await ollamaService.generateStream(prompt, visualBrain.systemPrompt, {
        model: getVisionModel(),
        images: competitorScreenshots,
        signal,
        onChunk: (chunk) => onProgress(chunk),
      });
      onProgress('\n');

      const parsed = extractJSON(rawOutput, 'object');
      results.push({
        brainId: 'visual',
        brainName: 'Visual Brain',
        insights: parsed.insights || [],
        recommendations: parsed.recommendations || [],
        adTypeVote: parsed.adTypeVote || 'product-focused',
        headlineHookVote: parsed.headlineHookVote || 'curiosity',
        headlineExamples: parsed.headlineExamples || [],
        confidence: parsed.confidence || 5,
        keyQuote: parsed.keyQuote || '',
        gapsIdentified: parsed.gapsIdentified || [],
        rawOutput,
      });
      onProgress('[BRAIN:visual] Done\n');
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error('Visual Brain failed:', err);
      onProgress('[BRAIN:visual] Failed — no visual intelligence\n');
      results.push(createFallbackBrainOutput('visual', 'Visual Brain'));
    }
  } else {
    results.push(createFallbackBrainOutput('visual', 'Visual Brain'));
  }

  onProgress(`\n[COUNCIL] Round 1 complete — ${results.length} brains reported\n`);

  // Log vote tallies
  const adTypeVotes: Record<string, number> = {};
  const hookVotes: Record<string, number> = {};
  results.forEach(r => {
    adTypeVotes[r.adTypeVote] = (adTypeVotes[r.adTypeVote] || 0) + 1;
    hookVotes[r.headlineHookVote] = (hookVotes[r.headlineHookVote] || 0) + 1;
  });
  onProgress(`  Ad Type Votes: ${Object.entries(adTypeVotes).map(([k, v]) => `${k}(${v})`).join(', ')}\n`);
  onProgress(`  Hook Votes: ${Object.entries(hookVotes).map(([k, v]) => `${k}(${v})`).join(', ')}\n\n`);

  return results;
}

function createFallbackBrainOutput(id: string, name: string): BrainOutput {
  return {
    brainId: id,
    brainName: name,
    insights: [],
    recommendations: [],
    adTypeVote: 'problem-solution',
    headlineHookVote: 'curiosity',
    headlineExamples: [],
    confidence: 0,
    keyQuote: '',
    gapsIdentified: [],
    rawOutput: '',
  };
}

// ─────────────────────────────────────────────────────────────
// ROUND 2: Council Heads synthesize brain outputs
// ─────────────────────────────────────────────────────────────

async function runCouncilHeads(
  brainOutputs: BrainOutput[],
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<{ headId: string; output: string }[]> {
  onProgress('[COUNCIL] Round 2 — 3 Council Heads synthesizing\n\n');

  // Run heads SEQUENTIALLY — same reason as brains: single local GPU can't handle parallel inference
  const results: { headId: string; output: string }[] = [];

  for (const head of COUNCIL_HEADS) {
    if (signal?.aborted) throw new Error('Aborted');

    onProgress(`\n${'─'.repeat(40)}\n`);
    onProgress(`[HEAD:${head.id}] ${head.name} synthesizing...\n`);

    // Gather inputs for this head
    const relevantBrains = brainOutputs.filter(b => head.synthesizes.includes(b.brainId));
    const otherBrains = brainOutputs.filter(b => !head.synthesizes.includes(b.brainId));

    let inputText = 'BRAIN INPUTS (your primary sources):\n';
    relevantBrains.forEach(b => {
      inputText += `\n--- ${b.brainName} (confidence: ${b.confidence}/10) ---\n`;
      inputText += `Key Quote: "${b.keyQuote}"\n`;
      inputText += `Insights:\n${b.insights.map(i => `- ${i}`).join('\n')}\n`;
      inputText += `Recommendations:\n${b.recommendations.map(r => `- ${r}`).join('\n')}\n`;
      inputText += `Ad Type Vote: ${b.adTypeVote} | Hook Vote: ${b.headlineHookVote}\n`;
      if (b.headlineExamples.length) inputText += `Headlines: ${b.headlineExamples.join(' | ')}\n`;
      if (b.gapsIdentified.length) inputText += `Gaps: ${b.gapsIdentified.join(', ')}\n`;
    });

    // For Challenge Head, include summary of all other brains too
    if (head.id === 'challenge-head') {
      inputText += '\nOTHER BRAIN SUMMARIES (for cross-referencing):\n';
      otherBrains.forEach(b => {
        inputText += `${b.brainName}: ${b.keyQuote} (confidence: ${b.confidence}/10, voted: ${b.adTypeVote})\n`;
      });
    }

    let rawOutput = '';
    try {
      rawOutput = await ollamaService.generateStream(inputText, head.systemPrompt, {
        model: getResearchModelConfig().councilBrainModel,
        signal,
        onChunk: (chunk) => onProgress(chunk),
      });
      onProgress('\n');
      onProgress(`[HEAD:${head.id}] Done\n`);
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error(`Council head ${head.id} failed:`, err);
      rawOutput = `[${head.name} failed to synthesize]`;
      onProgress(`[HEAD:${head.id}] Failed\n`);
    }

    results.push({ headId: head.id, output: rawOutput });
  }

  onProgress(`\n[COUNCIL] Round 2 complete — ${results.length} heads reported\n\n`);
  return results;
}

// ─────────────────────────────────────────────────────────────
// ROUND 3: Master Verdict
// ─────────────────────────────────────────────────────────────

async function runMasterVerdict(
  councilHeadOutputs: { headId: string; output: string }[],
  brainOutputs: BrainOutput[],
  iteration: number,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<CouncilVerdict> {
  onProgress('[COUNCIL] Round 3 — Master Verdict\n\n');

  let inputText = 'COUNCIL HEAD REPORTS:\n\n';
  councilHeadOutputs.forEach(h => {
    const headDef = COUNCIL_HEADS.find(ch => ch.id === h.headId);
    inputText += `═══ ${headDef?.name || h.headId} ═══\n${h.output}\n\n`;
  });

  // Add aggregate vote data
  const adTypeVotes: Record<string, number> = {};
  const hookVotes: Record<string, number> = {};
  const allHeadlines: string[] = [];
  const allGaps: string[] = [];
  brainOutputs.forEach(b => {
    adTypeVotes[b.adTypeVote] = (adTypeVotes[b.adTypeVote] || 0) + 1;
    hookVotes[b.headlineHookVote] = (hookVotes[b.headlineHookVote] || 0) + 1;
    allHeadlines.push(...b.headlineExamples);
    allGaps.push(...b.gapsIdentified);
  });

  inputText += `\nAGGREGATE VOTES:\n`;
  inputText += `Ad Types: ${Object.entries(adTypeVotes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;
  inputText += `Hook Types: ${Object.entries(hookVotes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(', ')}\n`;
  inputText += `Headlines proposed: ${allHeadlines.length}\n`;
  inputText += `Gaps identified: ${[...new Set(allGaps)].length}\n`;

  let rawOutput = '';
  try {
    rawOutput = await ollamaService.generateStream(inputText, MASTER_VERDICT_PROMPT, {
      model: getResearchModelConfig().councilBrainModel,
      signal,
      onChunk: (chunk) => onProgress(chunk),
    });
    onProgress('\n');
  } catch (err) {
    if (signal?.aborted) throw err;
    console.error('Master verdict failed:', err);
    onProgress('[COUNCIL] Master verdict generation failed\n');
    return createFallbackVerdict(brainOutputs, councilHeadOutputs, iteration);
  }

  const parsed = extractJSON(rawOutput, 'object');

  const verdict: CouncilVerdict = {
    strategicDirection: parsed.strategicDirection || 'Analysis inconclusive — run with more data',
    primaryAdType: parsed.primaryAdType || getMajorityVote(adTypeVotes),
    secondaryAdType: parsed.secondaryAdType || 'problem-solution',
    headlineStrategy: {
      hookType: parsed.headlineStrategy?.hookType || getMajorityVote(hookVotes),
      why: parsed.headlineStrategy?.why || '',
      examples: parsed.headlineStrategy?.examples || allHeadlines.slice(0, 5),
    },
    keyInsights: parsed.keyInsights || [],
    gapsToFill: parsed.gapsToFill || [...new Set(allGaps)],
    confidenceScore: parsed.confidenceScore || 5,
    dissent: parsed.dissent || [],
    offerStructure: parsed.offerStructure || '',
    visualConcept: parsed.visualConcept || '',
    audienceLanguage: parsed.audienceLanguage || [],
    avoidList: parsed.avoidList || [],
    brainOutputs,
    councilHeadOutputs,
    iteration,
  };

  onProgress(`\n[COUNCIL] Verdict delivered (confidence: ${verdict.confidenceScore}/10)\n`);
  onProgress(`  Primary: ${verdict.primaryAdType} | Secondary: ${verdict.secondaryAdType}\n`);
  onProgress(`  Hook: ${verdict.headlineStrategy.hookType}\n`);
  onProgress(`  Gaps remaining: ${verdict.gapsToFill.length}\n\n`);

  return verdict;
}

function getMajorityVote(votes: Record<string, number>): string {
  const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'problem-solution';
}

function createFallbackVerdict(
  brainOutputs: BrainOutput[],
  councilHeadOutputs: { headId: string; output: string }[],
  iteration: number
): CouncilVerdict {
  return {
    strategicDirection: 'Council failed to reach consensus — use brain outputs directly',
    primaryAdType: 'problem-solution',
    secondaryAdType: 'testimonial',
    headlineStrategy: { hookType: 'curiosity', why: 'Safe default', examples: [] },
    keyInsights: brainOutputs.flatMap(b => b.insights).slice(0, 5),
    gapsToFill: brainOutputs.flatMap(b => b.gapsIdentified).slice(0, 5),
    confidenceScore: 3,
    dissent: ['Council failed to synthesize — check individual brain outputs'],
    offerStructure: '',
    visualConcept: '',
    audienceLanguage: [],
    avoidList: [],
    brainOutputs,
    councilHeadOutputs,
    iteration,
  };
}

// ─────────────────────────────────────────────────────────────
// Main Council Runner (with agentic loop)
// ─────────────────────────────────────────────────────────────

export interface CouncilOptions {
  maxIterations?: number;        // default 2
  confidenceThreshold?: number;  // stop if confidence >= this (default 7)
  enableWebResearch?: boolean;   // fill gaps with web research between iterations
  competitorScreenshots?: string[];  // base64 images for Visual Brain
}

/**
 * Run the full council pipeline.
 *
 * If the council identifies gaps AND confidence is below threshold,
 * it returns the verdict with gapsToFill populated. The caller
 * (useOrchestratedResearch) is responsible for running web research
 * and calling runCouncil again with updated findings.
 */
export async function runCouncil(
  campaign: Campaign,
  existingFindings?: ResearchFindings,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
  options?: CouncilOptions
): Promise<CouncilVerdict> {
  const progress = onProgress || (() => {});
  const maxIterations = options?.maxIterations ?? 2;
  const confidenceThreshold = options?.confidenceThreshold ?? 7;
  const screenshots = options?.competitorScreenshots;

  let currentFindings = existingFindings;
  let verdict: CouncilVerdict | null = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (signal?.aborted) throw new Error('Aborted');

    progress(`\n${'═'.repeat(68)}\n`);
    progress(`COUNCIL OF MARKETING BRAINS — Iteration ${iteration}/${maxIterations}\n`);
    progress(`${'═'.repeat(68)}\n\n`);

    // Round 1: All brains analyze
    const brainOutputs = await runBrains(
      campaign,
      currentFindings,
      screenshots,
      progress,
      signal
    );

    if (signal?.aborted) throw new Error('Aborted');

    // Round 2: Council heads synthesize
    const councilHeadOutputs = await runCouncilHeads(
      brainOutputs,
      progress,
      signal
    );

    if (signal?.aborted) throw new Error('Aborted');

    // Round 3: Master verdict
    verdict = await runMasterVerdict(
      councilHeadOutputs,
      brainOutputs,
      iteration,
      progress,
      signal
    );

    // Check if we should stop
    if (verdict.confidenceScore >= confidenceThreshold) {
      progress(`[COUNCIL] Confidence ${verdict.confidenceScore}/10 >= threshold ${confidenceThreshold} — DONE\n`);
      break;
    }

    if (verdict.gapsToFill.length === 0) {
      progress(`[COUNCIL] No gaps identified — DONE\n`);
      break;
    }

    if (iteration < maxIterations) {
      progress(`[COUNCIL] Confidence ${verdict.confidenceScore}/10 < threshold ${confidenceThreshold}\n`);
      progress(`[COUNCIL] ${verdict.gapsToFill.length} gaps identified — web research needed\n`);
      progress(`[COUNCIL] Gaps to fill:\n`);
      verdict.gapsToFill.forEach((gap, i) => {
        progress(`  ${i + 1}. ${gap}\n`);
      });
      progress(`\n[COUNCIL] Returning for web research before re-running...\n\n`);
      // Return verdict with gaps — caller handles web research and re-calls
      break;
    }
  }

  return verdict!;
}

// ─────────────────────────────────────────────────────────────
// Utility: Extract structured data from verdict for ResearchFindings
// ─────────────────────────────────────────────────────────────

/** Convert council verdict into data that populates ResearchFindings fields */
export function extractFindingsFromVerdict(verdict: CouncilVerdict): Partial<ResearchFindings> {
  const desireBrain = verdict.brainOutputs.find(b => b.brainId === 'desire');
  const avatarBrain = verdict.brainOutputs.find(b => b.brainId === 'avatar');
  const offerBrain = verdict.brainOutputs.find(b => b.brainId === 'offer');
  const contrarian = verdict.brainOutputs.find(b => b.brainId === 'contrarian');
  const persuasion = verdict.brainOutputs.find(b => b.brainId === 'persuasion');

  // ── Audience language: merge verdict + avatar brain insights + persuasion quotes ──
  const avatarLanguage = [
    ...verdict.audienceLanguage,
    ...(avatarBrain?.insights.filter(i => i.includes('"')).slice(0, 5) || []),
    ...(persuasion?.insights.filter(i => i.includes('"')).slice(0, 3) || []),
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  // ── Verbatim quotes: collect keyQuotes from all brains ──
  const verbatimQuotes = verdict.brainOutputs
    .map(b => b.keyQuote)
    .filter(q => q && q.length > 5)
    .slice(0, 10);

  // ── Competitor weaknesses: merge desire + contrarian gaps ──
  const competitorWeaknesses = [
    ...(desireBrain?.gapsIdentified || []),
    ...(contrarian?.gapsIdentified || []),
    ...verdict.gapsToFill,
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 10);

  // ── Where audience congregates: extract from avatar brain ──
  const whereAudienceCongregates = avatarBrain?.recommendations
    .filter(r => /reddit|forum|facebook|tiktok|youtube|community|group|review/i.test(r))
    .slice(0, 5) || [];

  // ── What they tried before: extract from offer brain ──
  const whatTheyTriedBefore = offerBrain?.insights
    .filter(i => /tried|switch|used|before|alternative|competitor|previous/i.test(i))
    .slice(0, 5) || [];

  return {
    avatarLanguage,
    verbatimQuotes,
    competitorWeaknesses,
    whereAudienceCongregates,
    whatTheyTriedBefore,
    councilVerdict: verdict,
  };
}
