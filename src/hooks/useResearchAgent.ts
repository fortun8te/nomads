import { useOllama } from './useOllama';
import { DESIRE_INTENSITY_GUIDE, MARKET_SOPHISTICATION, ROOT_CAUSE_MECHANISM } from '../utils/desireFramework';
import type { Campaign, DeepDesire, Objection, ResearchFindings, RootCauseMechanism, MarketSophisticationLevel, AvatarPersona } from '../types';

interface ResearchResult {
  processedOutput: string;
  rawOutput: string;
  model: string;
  tokensUsed?: number;
  processingTime?: number;
  researchFindings?: ResearchFindings;
}

/**
 * Desire-Driven Research Agent (4-Layer Framework)
 * Layer 1: Avatar — WHO are they? Sub-avatars, desires, turning points
 * Layer 2: Problem — Root cause + mechanism (WHY nothing else worked)
 * Layer 3: Solution — Theory of the fix (not the product)
 * Layer 4: Product — Feature → Desire mapping + market sophistication
 */
export function useResearchAgent() {
  const { generate } = useOllama();

  /**
   * Strip model-internal content that isn't part of the JSON output:
   *  - <think>...</think> blocks (GLM-4.7, Qwen3, lfm2.5-thinking, etc.)
   *  - ```json ... ``` code-fence wrappers
   */
  const stripModelNoise = (raw: string): string =>
    raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')  // thinking blocks
      .replace(/```(?:json)?\s*/gi, '')            // opening code fences
      .replace(/```\s*/g, '')                      // closing code fences
      .trim();

  /** Helper: Robust JSON extraction with cleanup + retry */
  const extractJSON = async (
    result: string,
    type: 'array' | 'object',
    retryPrompt: string | null,
    brainModel: string,
    signal?: AbortSignal,
    onProgress?: (msg: string) => void
  ): Promise<any> => {
    const stripped = stripModelNoise(result);
    const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
    const jsonMatch = stripped.match(pattern);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Clean common JSON issues
        const cleaned = jsonMatch[0]
          .replace(/,\s*([}\]])/g, '$1') // trailing commas
          .replace(/'/g, '"') // single quotes
          .replace(/[\x00-\x1f]/g, ' '); // control chars
        try {
          return JSON.parse(cleaned);
        } catch {
          console.warn('JSON parse failed after cleanup');
        }
      }
    }
    // Retry with simpler prompt
    if (retryPrompt) {
      onProgress?.('  Retrying with simpler prompt...\n');
      const retry = await generate(retryPrompt, '', { model: brainModel, signal });
      const retryStripped = stripModelNoise(retry);
      const retryMatch = retryStripped.match(pattern);
      if (retryMatch) {
        try { return JSON.parse(retryMatch[0]); } catch { /* give up */ }
      }
    }
    return type === 'array' ? [] : {};
  };

  /** Build rich brand context from preset data + reference images */
  const buildBrandContext = (campaign: Campaign): string => {
    const parts: string[] = [];
    const p = campaign.presetData;
    if (p) {
      const b = p.brand;
      if (b) {
        if (b.name) parts.push(`Brand: ${b.name}`);
        if (b.tagline) parts.push(`Tagline: "${b.tagline}"`);
        if (b.positioning) parts.push(`Positioning: ${b.positioning}`);
        if (b.packagingDesign) parts.push(`Packaging: ${b.packagingDesign}`);
        if (b.visualIdentity) parts.push(`Visual Identity: ${b.visualIdentity}`);
        if (b.imageStyle) parts.push(`Image Style: ${b.imageStyle}`);
        if (b.toneOfVoice) parts.push(`Tone: ${b.toneOfVoice}`);
      }
      const prod = p.product;
      if (prod) {
        if (prod.name) parts.push(`Product: ${prod.name}`);
        if (prod.ingredients) parts.push(`Ingredients: ${prod.ingredients}`);
        if (prod.packaging) parts.push(`Product Packaging: ${prod.packaging}`);
        if (prod.variantVibe) parts.push(`Variant Vibe: ${prod.variantVibe}`);
      }
      const aud = p.audience;
      if (aud) {
        if (aud.primarySegment) parts.push(`Primary Segment: ${aud.primarySegment}`);
        if (aud.secondarySegments) parts.push(`Secondary Segments: ${aud.secondarySegments}`);
        if (aud.purchaseBarriers?.length) parts.push(`Purchase Barriers: ${aud.purchaseBarriers.join(', ')}`);
      }
    }
    // Reference image descriptions
    const imgs = campaign.referenceImages;
    if (imgs?.length) {
      const imgDescs = (imgs as any[]).map((img: any, i: number) => {
        if (typeof img === 'string') return `Image ${i + 1}: (no description)`;
        return `Image ${i + 1} [${img.type || 'other'}] "${img.label || ''}": ${img.description || '(no description)'}`;
      }).filter((d: string) => !d.includes('(no description)'));
      if (imgDescs.length > 0) {
        parts.push(`Reference Images:\n${imgDescs.join('\n')}`);
      }
    }
    return parts.length > 0 ? `\nBRAND CONTEXT:\n${parts.join('\n')}\n` : '';
  };

  /**
   * LAYER 1: Avatar + Deep Desire Mapping
   * Surface Problem → Layers → Deep Desire → Turning Point
   * Identifies NARROW sub-avatars with amplified desires
   */
  const mapDeepDesires = async (campaign: Campaign, brainModel: string = 'glm-4.7-flash:q4_K_M', signal?: AbortSignal, onProgress?: (msg: string) => void): Promise<DeepDesire[]> => {
    const brandCtx = buildBrandContext(campaign);
    const prompt = `You are a consumer psychology expert specializing in desire mapping.

${DESIRE_INTENSITY_GUIDE}

Campaign:
- Brand: ${campaign.brand}
- Target Audience: ${campaign.targetAudience}
- Product: ${campaign.productDescription}
- Marketing Goal: ${campaign.marketingGoal}
${brandCtx}
TASK: Identify 3-4 DEEP DESIRES. For each, map from surface problem down to the deepest desire.

CRITICAL: Go NARROW with sub-avatars. Don't say "women who want better skin" — say "mothers 30-40 who noticed aging after pregnancy and feel they've 'let themselves go'".

CRITICAL: Identify the TURNING POINT — the moment where pain becomes unbearable and they MUST buy.

Structure for EACH desire:
{
  "surfaceProblem": "What they SAY they want to solve",
  "layers": [
    { "level": 1, "description": "Immediate consequence", "example": "Real example in their words" },
    { "level": 2, "description": "What this means for their life", "example": "..." },
    { "level": 3, "description": "Identity/relationship/survival impact", "example": "..." }
  ],
  "deepestDesire": "What they REALLY want (identity, status, loved ones, survival)",
  "desireIntensity": "low|moderate|high|extreme",
  "turningPoint": "The specific moment/event where this desire becomes unbearable and they MUST act",
  "amplifiedDesireType": "loved_ones|identity_status|survival|other",
  "targetSegment": "NARROW sub-avatar with specific demographics and psychographics"
}

Example for skincare:
{
  "surfaceProblem": "Want anti-aging skincare",
  "layers": [
    { "level": 1, "description": "Noticing wrinkles and dull skin", "example": "I look tired even when I slept well" },
    { "level": 2, "description": "Feeling invisible/older than peers", "example": "My husband doesn't compliment me anymore" },
    { "level": 3, "description": "Identity crisis — no longer recognizes herself", "example": "I used to be the pretty one in my friend group" }
  ],
  "deepestDesire": "Feel attractive and desired again — reclaim her identity as a beautiful woman",
  "desireIntensity": "extreme",
  "turningPoint": "Sees a photo of herself at a family event and doesn't recognize who she's become",
  "amplifiedDesireType": "identity_status",
  "targetSegment": "Women 35-45 who were attractive in their 20s, now post-kids, feeling invisible to partners"
}

Return ONLY valid JSON array, no other text.`;

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          onProgress?.(`  [Layer 1] Retry ${attempt}/${maxRetries} — model returned too little, trying again...\n`);
        } else {
          onProgress?.('  [Layer 1] Mapping deep desires + turning points...\n');
        }

        const result = await generate(
          attempt === 0 ? prompt : `${prompt}\n\nIMPORTANT: You MUST output a valid JSON array with 3-4 desire objects. Start with [ and end with ]. No other text.`,
          attempt === 0 ? '' : 'You are a consumer psychology expert. Output ONLY a JSON array of desire objects.',
          {
            model: brainModel,
            signal,
            onChunk: (chunk) => onProgress?.(chunk),
          }
        );
        onProgress?.('\n');

        // Check if response is too short (model likely returned error/refusal)
        if (result.trim().length < 50) {
          onProgress?.(`  [Layer 1] Model returned only ${result.trim().length} chars — too short for valid JSON\n`);
          if (attempt < maxRetries) continue; // Retry
          return [];
        }

        const parsed = await extractJSON(result, 'array', null, brainModel, signal, onProgress);
        if (parsed.length > 0) return parsed;

        // Parsed empty — retry if we have attempts left
        if (attempt < maxRetries) {
          onProgress?.(`  [Layer 1] JSON parsing returned empty — retrying...\n`);
          continue;
        }
        return [];
      } catch (err) {
        console.error(`Error mapping deep desires (attempt ${attempt}):`, err);
        if (attempt < maxRetries) continue;
        return [];
      }
    }
    return [];
  };

  /**
   * LAYER 2: Root Cause + Mechanism
   * Why does the problem exist? What's the "aha" explanation?
   * Builds the belief chain that makes the product feel inevitable
   */
  const analyzeRootCauseMechanism = async (
    campaign: Campaign,
    desires: DeepDesire[],
    brainModel: string = 'glm-4.7-flash:q4_K_M',
    signal?: AbortSignal,
    onProgress?: (msg: string) => void
  ): Promise<RootCauseMechanism> => {
    const desiresText = desires.map(d =>
      `- ${d.targetSegment}: Surface="${d.surfaceProblem}" → Deep="${d.deepestDesire}" (${d.desireIntensity})`
    ).join('\n');

    const brandCtx2 = buildBrandContext(campaign);
    const prompt = `You are a persuasion scientist. Build the BELIEF CHAIN for this product.

${ROOT_CAUSE_MECHANISM}

Campaign:
- Brand: ${campaign.brand}
- Product: ${campaign.productDescription}
- Features: ${campaign.productFeatures.join(', ')}
- Target: ${campaign.targetAudience}
${brandCtx2}
Customer Desires:
${desiresText}

TASK: Build the Root Cause + Mechanism that makes this product feel INEVITABLE.

Return JSON:
{
  "rootCause": "What's ACTUALLY wrong beneath the symptoms — the explanation that makes them say 'THAT'S why nothing else worked!'",
  "mechanism": "HOW to fix it (the theory of the solution, not the product features)",
  "chainOfYes": [
    "Statement 1 they'd agree with (obvious truth)",
    "Statement 2 that builds on it",
    "Statement 3 that introduces the root cause",
    "Statement 4 that presents the mechanism",
    "Statement 5 that makes the product the inevitable answer"
  ],
  "ahaInsight": "The single reframe that changes everything — the 'wait, THAT'S the real problem?' moment"
}

The product should feel like the INEVITABLE conclusion, not a sales pitch.
Return ONLY valid JSON.`;

    try {
      onProgress?.('  [Layer 2] Analyzing root cause + building belief chain...\n');
      const result = await generate(prompt, '', { model: brainModel, signal, onChunk: (chunk) => onProgress?.(chunk) });
      onProgress?.('\n');
      const parsed = await extractJSON(result, 'object', null, brainModel, signal);
      if (parsed.rootCause) return parsed as RootCauseMechanism;
      return { rootCause: '', mechanism: '', chainOfYes: [], ahaInsight: '' };
    } catch (err) {
      console.error('Error analyzing root cause:', err);
      return { rootCause: '', mechanism: '', chainOfYes: [], ahaInsight: '' };
    }
  };

  /**
   * LAYER 3: Objections + What They've Tried
   * What stops the deep desire from converting to purchase?
   * Why did previous solutions fail? What's different here?
   */
  const identifyObjections = async (campaign: Campaign, desires: DeepDesire[], rootCause: RootCauseMechanism, brainModel: string = 'glm-4.7-flash:q4_K_M', signal?: AbortSignal, onProgress?: (msg: string) => void): Promise<Objection[]> => {
    const desiresText = desires.map(d =>
      `${d.targetSegment}: "${d.deepestDesire}" (turning point: ${d.turningPoint})`
    ).join('\n');

    const brandCtx3 = buildBrandContext(campaign);
    const prompt = `You are a sales psychology expert. Given these customer desires and the root cause mechanism, what objections prevent purchase?

Campaign: ${campaign.brand}
Product: ${campaign.productDescription}
${brandCtx3}
Customer Desires:
${desiresText}

Root Cause Insight: "${rootCause.ahaInsight}"
Mechanism: "${rootCause.mechanism}"

TASK: Identify 5-7 SPECIFIC objections. Think about:
- What they've TRIED BEFORE that failed (and why they're skeptical now)
- What they've HEARD from competitors that made them doubt
- What their SPOUSE/FRIENDS would say if they bought this
- What makes them feel STUPID for trying yet another product
- The MONEY objection (is it worth it given past failures?)

For each objection, explain how the root cause mechanism addresses it.

JSON format:
{
  "objection": "The specific objection/doubt in THEIR language",
  "frequency": "common|moderate|rare",
  "impact": "high|medium|low",
  "handlingApproach": "How to address this in messaging/creative",
  "requiredProof": ["type of proof needed - testimonial|before-after|mechanism|data|video"],
  "rootCauseAnswer": "How the root cause mechanism specifically dissolves this objection"
}

Think deeply about what's REALLY stopping purchase, not generic objections.
Return ONLY valid JSON array.`;

    try {
      onProgress?.('  [Layer 3] Identifying purchase objections...\n');
      const result = await generate(prompt, '', { model: brainModel, signal, onChunk: (chunk) => onProgress?.(chunk) });
      onProgress?.('\n');
      let parsed = await extractJSON(
        result, 'array',
        `List 5 purchase objections for ${campaign.brand} targeting ${campaign.targetAudience}. Product: ${campaign.productDescription}. Return ONLY a JSON array of objects with keys: objection, frequency (common/moderate/rare), impact (high/medium/low), handlingApproach, requiredProof (array of strings), rootCauseAnswer (string).

Example: [{"objection":"It is too expensive","frequency":"common","impact":"high","handlingApproach":"Compare daily cost to alternatives","requiredProof":["testimonial","before-after"],"rootCauseAnswer":"Addresses root cause so you only buy once"}]`,
        brainModel, signal, onProgress
      );

      // If JSON parsing failed or returned empty, generate fallback objections from desires
      if (!Array.isArray(parsed) || parsed.length === 0) {
        onProgress?.('  [Layer 3] JSON extraction failed — generating objections from desires...\n');
        parsed = desires.slice(0, 5).map(d => ({
          objection: `"Does this actually solve ${d.surfaceProblem}?" — skepticism after trying other solutions`,
          frequency: 'common' as const,
          impact: 'high' as const,
          handlingApproach: `Address through root cause mechanism: ${rootCause.rootCause || 'unique approach'}`,
          requiredProof: ['testimonial', 'before-after'],
          rootCauseAnswer: rootCause.ahaInsight || 'This addresses the root cause, not just symptoms',
        }));
      }

      return parsed;
    } catch (err) {
      console.error('Error identifying objections:', err);
      // Even on error, return fallback objections rather than empty
      return desires.slice(0, 3).map(d => ({
        objection: `"Will this really help with ${d.surfaceProblem}?"`,
        frequency: 'common' as const,
        impact: 'high' as const,
        handlingApproach: 'Demonstrate mechanism with proof',
        requiredProof: ['testimonial', 'before-after'],
        rootCauseAnswer: rootCause.ahaInsight || 'Addresses root cause directly',
      }));
    }
  };

  /**
   * LAYER 4: Avatar Behavior + Market Sophistication
   * Where do they congregate? What language do they use?
   * How sophisticated is this market? (determines messaging strategy)
   */
  const researchAvatarAndMarket = async (
    campaign: Campaign,
    desires: DeepDesire[],
    brainModel: string = 'glm-4.7-flash:q4_K_M',
    signal?: AbortSignal,
    onProgress?: (msg: string) => void
  ) => {
    const subAvatars = desires.map(d => d.targetSegment).join(', ');

    const brandCtx4 = buildBrandContext(campaign);
    const prompt = `You are a market researcher specializing in avatar deep-dives.

${MARKET_SOPHISTICATION}

Campaign:
- Brand: ${campaign.brand}
- Product: ${campaign.productDescription}
- Sub-Avatars: ${subAvatars}
${brandCtx4}
TASK: Research these specific sub-avatars deeply.

Return JSON with:
{
  "avatarLanguage": [
    "exact phrase they use on Reddit/forums",
    "how they describe the problem (NOT brand language)",
    "slang, abbreviations, insider terms",
    "emotional phrases from reviews/complaints"
  ],
  "whereAudienceCongregates": [
    "specific subreddits (r/xyz)",
    "specific Facebook groups",
    "specific forums or communities",
    "specific YouTube channels/TikTok creators they follow"
  ],
  "whatTheyTriedBefore": [
    "specific product/brand they tried + WHY it failed",
    "approach they tried + WHY it didn't work",
    "DIY solution they attempted + what went wrong"
  ],
  "competitorWeaknesses": [
    "what competitors OWN that TRAPS them",
    "positioning gap no one claims",
    "audience frustration with competitors (from reviews)",
    "the ONE THING competitors can never claim"
  ],
  "marketSophistication": 1-4,
  "sophisticationReason": "Why this level — what has the audience been exposed to?"
}

For avatarLanguage: Think about how they'd post on Reddit, NOT how a brand would describe them.
BAD: "consumers seeking anti-aging solutions"
GOOD: "I've tried literally everything and my skin still looks like sh*t"

Return ONLY valid JSON.`;

    try {
      onProgress?.('  [Layer 4] Deep-diving avatar behavior + market sophistication...\n');
      const result = await generate(prompt, '', { model: brainModel, signal, onChunk: (chunk) => onProgress?.(chunk) });
      onProgress?.('\n');
      return await extractJSON(result, 'object', null, brainModel, signal);
    } catch (err) {
      console.error('Error researching avatar and market:', err);
      return {
        avatarLanguage: [], whereAudienceCongregates: [],
        whatTheyTriedBefore: [], competitorWeaknesses: [],
        marketSophistication: 3, sophisticationReason: 'Unknown'
      };
    }
  };

  /**
   * NEW: Competitor Landscape + Positioning Map
   * Who owns what? What's trapped? What's unclaimed?
   */
  const mapCompetitorLandscape = async (campaign: Campaign, brainModel: string = 'glm-4.7-flash:q4_K_M', signal?: AbortSignal, onProgress?: (msg: string) => void): Promise<string[]> => {
    const brandCtx5 = buildBrandContext(campaign);
    const prompt = `You are a competitive strategist. Map the competitor landscape for ${campaign.brand} targeting ${campaign.targetAudience}.

Product: ${campaign.productDescription}
Marketing goal: ${campaign.marketingGoal}
${brandCtx5}
For 3-4 main competitors in this space, identify:
- What they OWN (their core positioning claim that defines them)
- What they're TRAPPED by (can't change without breaking their brand/audience)
- What question always HANGS over them (the doubt customers have but competitors can't address)
- What they're DOING in advertising (hooks, visuals, messaging style)

Then identify the UNCLAIMED TERRITORY — the positioning gap none of them can claim because of their structural constraints.

Return JSON array of positioning gaps / competitor weaknesses:
["Specific gap 1 — why no one claims it", "Specific gap 2 — structural reason", "Specific gap 3", "Specific gap 4", "Specific gap 5"]

Each entry should be a specific, actionable positioning opportunity with the WHY.
Return ONLY valid JSON array.`;

    try {
      onProgress?.('  [Layer 4] Mapping competitor positioning landscape...\n');
      const result = await generate(prompt, '', { model: brainModel, signal, onChunk: (chunk) => onProgress?.(chunk) });
      onProgress?.('\n');
      return await extractJSON(result, 'array', null, brainModel, signal);
    } catch (err) {
      console.error('Error mapping competitor landscape:', err);
      return [];
    }
  };

  /**
   * PERSONA SYNTHESIS: Create a rich, detailed avatar persona
   * Synthesizes all 4 layers into a living, breathing character profile
   * This persona gets passed to EVERY downstream stage
   */
  const synthesizePersona = async (
    campaign: Campaign,
    desires: DeepDesire[],
    rootCause: RootCauseMechanism,
    objections: Objection[],
    avatarData: any,
    brainModel: string = 'glm-4.7-flash:q4_K_M',
    signal?: AbortSignal,
    onProgress?: (msg: string) => void
  ): Promise<AvatarPersona> => {
    // Pick the highest-intensity desire to build the primary persona around
    const primaryDesire = desires.sort((a, b) => {
      const order = { extreme: 4, high: 3, moderate: 2, low: 1 };
      return (order[b.desireIntensity] || 0) - (order[a.desireIntensity] || 0);
    })[0];

    const brandCtx6 = buildBrandContext(campaign);
    const prompt = `You are a consumer psychologist creating a DETAILED avatar persona.

You have deep research on this audience. Now synthesize it into ONE vivid, specific person — NOT a broad demographic, but a REAL character you can picture.

RESEARCH DATA:
Campaign: ${campaign.brand} — ${campaign.productDescription}
${brandCtx6}

Primary Sub-Avatar: ${primaryDesire.targetSegment}
Deep Desire: "${primaryDesire.deepestDesire}" (${primaryDesire.desireIntensity})
Turning Point: ${primaryDesire.turningPoint || 'Not identified'}
Surface Problem: "${primaryDesire.surfaceProblem}"
Amplified Desire: ${primaryDesire.amplifiedDesireType}

Root Cause: "${rootCause.rootCause || 'Not identified'}"
AHA Insight: "${rootCause.ahaInsight || 'Not identified'}"

Top Objections:
${objections.slice(0, 3).map(o => `- "${o.objection}"`).join('\n')}

Failed Solutions: ${(avatarData.whatTheyTriedBefore || []).join(', ')}
Their Language: ${(avatarData.avatarLanguage || []).slice(0, 5).join(', ')}
Where They Hang Out: ${(avatarData.whereAudienceCongregates || []).join(', ')}

TASK: Create a VIVID persona. Write it like you're describing someone you know personally.

Return JSON:
{
  "name": "A realistic first name for this persona",
  "age": "Specific age or narrow range (e.g., '34' or '32-36')",
  "situation": "Life situation in 1-2 sentences (family, career, living situation)",
  "identity": "How they see themselves — their self-image and values (1-2 sentences)",
  "dailyLife": "What a typical day looks like — morning routine, work, evening (2-3 sentences)",
  "painNarrative": "Their pain story in FIRST PERSON — how THEY would describe the problem to a close friend. Use their language, not brand speak. (3-4 sentences)",
  "turningPointMoment": "The specific moment/event that makes them say 'I HAVE to do something about this NOW' (2 sentences)",
  "innerMonologue": "What they think but never say out loud — their private fears and hopes about this problem (2-3 sentences)",
  "purchaseJourney": "How they'd actually find and evaluate this product — what they'd Google, who they'd ask, what would convince them (2-3 sentences)",
  "socialInfluence": "What their friends/family/spouse would say if they bought this — supportive? Skeptical? Judgmental? (1-2 sentences)",
  "failedSolutions": ["Specific product/approach #1 they tried + why it failed", "Product #2 + why it failed", "Product #3 + why it failed"],
  "languagePatterns": ["Exact phrase they'd use on Reddit", "How they'd Google this", "How they'd describe the problem to a friend", "Slang/insider term they use"],
  "deepDesire": "What they REALLY want in one powerful sentence",
  "biggestFear": "What they're most afraid of if they DON'T act — the consequence of doing nothing"
}

Make this person REAL. Give them quirks, specific details, emotional texture.
Return ONLY valid JSON.`;

    try {
      onProgress?.('  Synthesizing avatar persona...\n');
      const result = await generate(prompt, '', { model: brainModel, signal, onChunk: (chunk) => onProgress?.(chunk) });
      onProgress?.('\n');
      const parsed = await extractJSON(result, 'object', null, brainModel, signal);
      if (parsed.name) return parsed as AvatarPersona;
      return {
        name: primaryDesire.targetSegment.split(' ')[0] || 'Unknown',
        age: '30-40',
        situation: primaryDesire.targetSegment,
        identity: '',
        dailyLife: '',
        painNarrative: primaryDesire.surfaceProblem,
        turningPointMoment: primaryDesire.turningPoint || '',
        innerMonologue: '',
        purchaseJourney: '',
        socialInfluence: '',
        failedSolutions: avatarData.whatTheyTriedBefore || [],
        languagePatterns: avatarData.avatarLanguage || [],
        deepDesire: primaryDesire.deepestDesire,
        biggestFear: '',
      };
    } catch (err) {
      console.error('Error synthesizing persona:', err);
      return {
        name: 'Unknown',
        age: '',
        situation: '',
        identity: '',
        dailyLife: '',
        painNarrative: '',
        turningPointMoment: '',
        innerMonologue: '',
        purchaseJourney: '',
        socialInfluence: '',
        failedSolutions: [],
        languagePatterns: [],
        deepDesire: primaryDesire?.deepestDesire || '',
        biggestFear: '',
      };
    }
  };

  /**
   * Main Research Flow: 4-Layer Desire-Driven Analysis + Persona Synthesis
   * Layer 1: Avatar + Deep Desires + Turning Points
   * Layer 2: Root Cause + Mechanism (Belief Building)
   * Layer 3: Objections + Failed Solutions
   * Layer 4: Avatar Behavior + Market Sophistication + Competitor Map
   * Synthesis: Detailed Avatar Persona
   */
  const executeResearch = async (
    campaign: Campaign,
    onProgress?: (msg: string) => void,
    brainModel: string = 'glm-4.7-flash:q4_K_M',
    signal?: AbortSignal
  ): Promise<ResearchResult> => {
    const startTime = Date.now();
    onProgress?.(`\n────────────────────────────────────────────────\n`);
    onProgress?.(`RESEARCH PHASE: 4-Layer Desire-Driven Analysis\n`);
    onProgress?.(`────────────────────────────────────────────────\n\n`);
    onProgress?.(`[CAMPAIGN_DATA]\n`);
    onProgress?.(`Brand: ${campaign.brand}\n`);
    onProgress?.(`Target Audience: ${campaign.targetAudience}\n`);
    onProgress?.(`Product: ${campaign.productDescription}\n`);
    onProgress?.(`Marketing Goal: ${campaign.marketingGoal}\n\n`);

    // ──────────────────────────────────────────
    // LAYER 1: Avatar + Deep Desire Mapping
    // ──────────────────────────────────────────
    onProgress?.(`LAYER 1: Avatar — Mapping deep desires + turning points...\n`);
    const deepDesires = await mapDeepDesires(campaign, brainModel, signal, onProgress);

    if (deepDesires.length === 0) {
      onProgress?.(`ERROR: Could not identify customer desires.\n`);
      return {
        processedOutput: 'Failed to identify customer desires.',
        rawOutput: 'Failed to identify customer desires.',
        model: brainModel,
        processingTime: Date.now() - startTime,
      };
    }

    onProgress?.(`Found ${deepDesires.length} desire hierarchies:\n`);
    deepDesires.forEach((d, i) => {
      onProgress?.(`  [${i + 1}] ${d.targetSegment}\n`);
      onProgress?.(`       "${d.surfaceProblem}" → "${d.deepestDesire}"\n`);
      onProgress?.(`       Intensity: ${d.desireIntensity} | Type: ${d.amplifiedDesireType || 'other'}\n`);
      if (d.turningPoint) onProgress?.(`       Turning Point: ${d.turningPoint}\n`);
    });

    // ──────────────────────────────────────────
    // LAYER 2: Root Cause + Mechanism
    // ──────────────────────────────────────────
    onProgress?.(`\nLAYER 2: Problem — Root cause + belief chain...\n`);
    const rootCauseMechanism = await analyzeRootCauseMechanism(campaign, deepDesires, brainModel, signal, onProgress);

    if (rootCauseMechanism.ahaInsight) {
      onProgress?.(`  AHA Insight: "${rootCauseMechanism.ahaInsight}"\n`);
      onProgress?.(`  Root Cause: ${rootCauseMechanism.rootCause}\n`);
      onProgress?.(`  Mechanism: ${rootCauseMechanism.mechanism}\n`);
      if (rootCauseMechanism.chainOfYes.length > 0) {
        onProgress?.(`  Belief Chain (${rootCauseMechanism.chainOfYes.length} steps):\n`);
        rootCauseMechanism.chainOfYes.forEach((step, i) => {
          onProgress?.(`    ${i + 1}. "${step}"\n`);
        });
      }
    }

    // ──────────────────────────────────────────
    // LAYER 3: Objections + Failed Solutions
    // ──────────────────────────────────────────
    onProgress?.(`\nLAYER 3: Objections — What stops purchase...\n`);
    const objections = await identifyObjections(campaign, deepDesires, rootCauseMechanism, brainModel, signal, onProgress);

    onProgress?.(`Found ${objections.length} key objections:\n`);
    objections.slice(0, 4).forEach((o, i) => {
      onProgress?.(`  [${i + 1}] "${o.objection}" (${o.frequency}, impact: ${o.impact})\n`);
      if (o.rootCauseAnswer) onProgress?.(`       Mechanism answer: ${o.rootCauseAnswer.slice(0, 80)}...\n`);
    });

    // ──────────────────────────────────────────
    // LAYER 4: Avatar Behavior + Market Sophistication + Competitors
    // ──────────────────────────────────────────
    onProgress?.(`\nLAYER 4: Market — Avatar behavior + sophistication + competitors...\n`);

    // Run avatar research and competitor landscape in parallel
    const [avatarAndMarket, competitorGaps] = await Promise.all([
      researchAvatarAndMarket(campaign, deepDesires, brainModel, signal, onProgress),
      mapCompetitorLandscape(campaign, brainModel, signal, onProgress),
    ]);

    const marketSoph = (avatarAndMarket.marketSophistication || 3) as MarketSophisticationLevel;
    onProgress?.(`  Market Sophistication: Level ${marketSoph}`);
    if (avatarAndMarket.sophisticationReason) {
      onProgress?.(` — ${avatarAndMarket.sophisticationReason}`);
    }
    onProgress?.('\n');

    if (avatarAndMarket.avatarLanguage?.length > 0) {
      onProgress?.(`  Avatar language: "${avatarAndMarket.avatarLanguage.slice(0, 3).join('", "')}"\n`);
    }
    if (avatarAndMarket.whereAudienceCongregates?.length > 0) {
      onProgress?.(`  Congregates: ${avatarAndMarket.whereAudienceCongregates.slice(0, 3).join(', ')}\n`);
    }
    if (avatarAndMarket.whatTheyTriedBefore?.length > 0) {
      onProgress?.(`  Failed solutions: ${avatarAndMarket.whatTheyTriedBefore.slice(0, 2).join('; ')}\n`);
    }

    // Merge competitor gaps
    const allCompetitorWeaknesses = [
      ...(avatarAndMarket.competitorWeaknesses || []),
      ...competitorGaps,
    ].filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i);

    onProgress?.(`  Positioning gaps: ${competitorGaps.length} found\n`);
    competitorGaps.slice(0, 3).forEach((gap: string, i: number) => {
      onProgress?.(`    [${i + 1}] ${gap}\n`);
    });

    // ──────────────────────────────────────────
    // PERSONA SYNTHESIS: Create rich avatar persona
    // ──────────────────────────────────────────
    onProgress?.(`\nSYNTHESIS: Building detailed avatar persona...\n`);
    const persona = await synthesizePersona(
      campaign, deepDesires, rootCauseMechanism, objections, avatarAndMarket,
      brainModel, signal, onProgress
    );

    if (persona.name) {
      onProgress?.(`  PERSONA: "${persona.name}" — ${persona.age}\n`);
      onProgress?.(`  Situation: ${persona.situation}\n`);
      onProgress?.(`  Identity: ${persona.identity}\n`);
      onProgress?.(`  Deep Desire: "${persona.deepDesire}"\n`);
      onProgress?.(`  Biggest Fear: "${persona.biggestFear}"\n`);
      onProgress?.(`  Turning Point: "${persona.turningPointMoment}"\n`);
      if (persona.innerMonologue) {
        onProgress?.(`  Inner Monologue: "${persona.innerMonologue.slice(0, 120)}..."\n`);
      }
    }

    // ──────────────────────────────────────────
    // Synthesize all 4 layers + persona into ResearchFindings
    // ──────────────────────────────────────────
    const researchFindings: ResearchFindings = {
      deepDesires,
      objections,
      avatarLanguage: avatarAndMarket.avatarLanguage || [],
      whereAudienceCongregates: avatarAndMarket.whereAudienceCongregates || [],
      whatTheyTriedBefore: avatarAndMarket.whatTheyTriedBefore || [],
      competitorWeaknesses: allCompetitorWeaknesses,
      marketSophistication: marketSoph,
      rootCauseMechanism,
      persona,
    };

    const sophisticationStrategy = marketSoph === 1
      ? 'INTRODUCE the mechanism (virgin market)'
      : marketSoph === 2
      ? 'Make BIGGER claims (early competition)'
      : marketSoph === 3
      ? 'Introduce NEW MECHANISM (crowded market)'
      : 'OVERWHELMING PROOF + personal identification (skeptical market)';

    const output = `RESEARCH FINDINGS: 4-Layer Desire-Driven Intelligence

AVATAR PERSONA — "${persona.name || 'Unknown'}"
Age: ${persona.age || 'N/A'} | ${persona.situation || ''}
Identity: ${persona.identity || 'N/A'}
Daily Life: ${persona.dailyLife || 'N/A'}

Pain Narrative (in their words):
"${persona.painNarrative || 'N/A'}"

Inner Monologue (what they think but don't say):
"${persona.innerMonologue || 'N/A'}"

Turning Point: ${persona.turningPointMoment || 'N/A'}
Purchase Journey: ${persona.purchaseJourney || 'N/A'}
Social Influence: ${persona.socialInfluence || 'N/A'}

Failed Solutions:
${persona.failedSolutions?.map(s => `- ${s}`).join('\n') || '- N/A'}

How they talk: ${persona.languagePatterns?.map(l => `"${l}"`).join(', ') || 'N/A'}

Deep Desire: "${persona.deepDesire || 'N/A'}"
Biggest Fear: "${persona.biggestFear || 'N/A'}"

════════════════════════════════════════════════════════════════════

LAYER 1 — DEEP DESIRES:
${deepDesires.map(d => `- SUB-AVATAR: ${d.targetSegment}
  Surface: "${d.surfaceProblem}"
  Deep Desire: "${d.deepestDesire}" (${d.desireIntensity})
  Turning Point: ${d.turningPoint || 'Not identified'}
  Amplified Type: ${d.amplifiedDesireType || 'other'}`).join('\n\n')}

LAYER 2 — ROOT CAUSE + MECHANISM:
- Root Cause: ${rootCauseMechanism.rootCause || 'Not identified'}
- Mechanism: ${rootCauseMechanism.mechanism || 'Not identified'}
- AHA Insight: "${rootCauseMechanism.ahaInsight || 'Not identified'}"
- Belief Chain: ${rootCauseMechanism.chainOfYes?.map((s, i) => `${i + 1}. "${s}"`).join(' → ') || 'None'}

LAYER 3 — KEY OBJECTIONS:
${objections.slice(0, 5).map(o => `- "${o.objection}" (${o.frequency}, impact: ${o.impact})
  Handle via: ${o.handlingApproach}
  Mechanism answer: ${o.rootCauseAnswer || 'N/A'}`).join('\n\n')}

LAYER 4 — MARKET INTELLIGENCE:
- Market Sophistication: Level ${marketSoph} — ${sophisticationStrategy}
- Where they gather: ${(avatarAndMarket.whereAudienceCongregates || []).join(', ')}
- Their language: ${(avatarAndMarket.avatarLanguage || []).join(', ')}
- What they tried before: ${(avatarAndMarket.whatTheyTriedBefore || []).join(', ')}
- Positioning gaps: ${allCompetitorWeaknesses.join(', ')}

Ready for: Web Research Orchestration → Objection Handling → Creative Direction`;

    onProgress?.(`\n4-LAYER RESEARCH + PERSONA COMPLETE\n`);
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
