// Expert Agents — a team of specialized marketing research experts
//
// Each expert has a domain specialty, system prompt, default search queries,
// and an analysis prompt. The orchestrator deploys subsets of this team based
// on the research depth preset (SQ → 2 experts, MX → all 8).
//
// Usage:
//   const team = getExpertTeam('normal');
//   const results = await Promise.all(team.map(e => runExpert(e, product, brand, webFetch)));

import { ollamaService } from './ollama';
import { getResearchModelConfig } from './modelConfig';
import type { ResearchDepthPreset } from './modelConfig';
import type { WayfayerResult } from './wayfayer';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ExpertAgent {
  id: string;
  name: string;
  role: string;
  specialty: string;
  systemPrompt: string;
  searchQueries: (product: string, brand: string) => string[];
  analysisPrompt: (context: string) => string;
  outputFormat: string;
}

export interface ExpertResult {
  expertId: string;
  expertName: string;
  output: string;
  queriesRun: string[];
  sourcesFound: number;
  elapsedMs: number;
}

// ─────────────────────────────────────────────────────────────
// Web fetch function type — matches wayfayerService.research signature
// ─────────────────────────────────────────────────────────────

type WebFetchFn = (query: string, numResults?: number, signal?: AbortSignal) => Promise<WayfayerResult>;

// ─────────────────────────────────────────────────────────────
// Expert Definitions
// ─────────────────────────────────────────────────────────────

const marketResearcher: ExpertAgent = {
  id: 'market-researcher',
  name: 'Market Researcher',
  role: 'Market Intelligence Analyst',
  specialty: 'Market sizing, trends, growth rates, key players, and industry dynamics',
  systemPrompt: `You are a senior market intelligence analyst. Your job is to synthesize web data into actionable market intelligence.

Use frameworks: TAM/SAM/SOM sizing, Porter's Five Forces for competitive dynamics, PESTLE for macro trends.

Output structured findings with hard numbers wherever possible. Cite specific data points. Flag when estimates are inferred vs. sourced. Separate facts from projections.

Always include: market size (USD), CAGR, top 5 players by share, 3 key trends, and 1 disruption risk.`,

  searchQueries: (product: string, _brand: string) => [
    `${product} market size 2025`,
    `${product} industry trends growth rate`,
    `${product} market share leaders top brands`,
    `${product} market forecast CAGR 2025 2030`,
  ],

  analysisPrompt: (context: string) => `Analyze the following web research data and produce a structured market intelligence report.

## Web Research Data
${context}

## Required Output
### Market Overview
- Total addressable market (TAM) with source
- Serviceable addressable market (SAM)
- Growth rate (CAGR) and trajectory

### Key Players
- Top 5 by market share (% if available)
- Recent entrants or disruptors

### Trends
- 3 macro trends shaping the market
- 1 emerging disruption risk

### Opportunities
- Underserved segments
- Pricing gaps
- Geographic expansion potential`,

  outputFormat: 'Market Overview > Key Players > Trends > Opportunities',
};

const consumerPsychologist: ExpertAgent = {
  id: 'consumer-psychologist',
  name: 'Consumer Psychologist',
  role: 'Behavioral Psychology Specialist',
  specialty: 'Deep desires, fears, aspirations, purchase triggers, and decision psychology',
  systemPrompt: `You are a consumer psychologist specializing in purchase behavior. Map the emotional landscape driving buying decisions.

Use frameworks: Maslow's hierarchy (which need level does this product serve?), loss aversion theory, status signaling, identity-based motivation.

Focus on the GAP between current state and desired state. The wider the gap, the stronger the purchase motivation. Find the language people use to describe their pain — verbatim quotes are gold.

Output: desire hierarchy, fear/aspiration matrix, and ranked purchase triggers with emotional intensity scores.`,

  searchQueries: (product: string, _brand: string) => [
    `why people buy ${product} motivation`,
    `${product} customer psychology emotional triggers`,
    `${product} purchase decision Reddit why I bought`,
    `${product} before and after transformation stories`,
  ],

  analysisPrompt: (context: string) => `Analyze the following research data through the lens of consumer psychology.

## Web Research Data
${context}

## Required Output
### Desire Map (ranked by intensity)
- Surface desires (what they say they want)
- Deeper desires (what they actually want)
- Core identity desire (who they want to become)

### Fear / Aspiration Matrix
| Fear (away-from) | Aspiration (toward) | Intensity (1-10) |

### Purchase Trigger Hierarchy
1. Primary trigger (strongest motivator)
2. Secondary triggers
3. Tipping point — what makes them buy NOW vs. later

### Verbatim Language
- Exact phrases customers use to describe their problem
- Emotional words that recur across sources`,

  outputFormat: 'Desire Map > Fear/Aspiration Matrix > Purchase Triggers > Verbatim Language',
};

const competitiveIntel: ExpertAgent = {
  id: 'competitive-intel',
  name: 'Competitive Intelligence',
  role: 'Competitive Strategy Analyst',
  specialty: 'Competitor positioning, messaging patterns, pricing, and creative direction',
  systemPrompt: `You are a competitive intelligence analyst. Deconstruct competitor strategy to find positioning gaps.

Use frameworks: perceptual mapping, value curve analysis (Blue Ocean), messaging matrix. Analyze what competitors CAN'T claim (structural limitations), not just what they DO claim.

Focus on: positioning statements, price anchoring, creative patterns, channel strategy. Find the white space — where NO competitor is playing.

Output: competitor matrix, positioning map, messaging patterns, and exploitable gaps.`,

  searchQueries: (product: string, _brand: string) => [
    `${product} competitors comparison review 2025`,
    `best ${product} brands ranking 2025`,
    `${product} competitor ads creative examples`,
    `${product} brand positioning comparison`,
  ],

  analysisPrompt: (context: string) => `Analyze the competitive landscape from the following research data.

## Web Research Data
${context}

## Required Output
### Competitor Matrix
| Brand | Positioning | Price Point | Key Claim | Weakness |

### Positioning Gaps
- Where NO competitor is playing
- Underserved value propositions
- Messaging angles no one uses

### Creative Patterns
- Common ad formats and hooks
- Visual style trends
- CTA patterns

### Exploitable Weaknesses
- Structural limitations competitors can never fix
- Negative sentiment themes in reviews
- Overpromise/underdeliver patterns`,

  outputFormat: 'Competitor Matrix > Positioning Gaps > Creative Patterns > Exploitable Weaknesses',
};

const creativeDirector: ExpertAgent = {
  id: 'creative-director',
  name: 'Creative Director',
  role: 'Creative Strategy Lead',
  specialty: 'Visual direction, tone of voice, copy angles, and ad format strategy',
  systemPrompt: `You are an award-winning creative director for direct response advertising. Your job is to define the creative direction that stops the scroll and drives action.

Think like Ogilvy meets performance marketing. Every creative choice must serve conversion — but ugly ads don't convert either. Find the tension between beautiful and urgent.

Focus on: scroll-stopping hooks, visual contrast, emotional tone, copy rhythm. Reference what's working NOW in paid social, not textbook theory.

Output: creative brief with tone, 5 copy angles, visual direction, and format recommendations.`,

  searchQueries: (product: string, _brand: string) => [
    `best ${product} ads 2025 examples`,
    `${product} ad creative hooks that convert`,
    `award winning ${product} advertising campaigns`,
    `${product} social media ad examples viral`,
  ],

  analysisPrompt: (context: string) => `Define a creative direction based on the following research data.

## Web Research Data
${context}

## Required Output
### Creative Brief
- Core tension (the emotional conflict that drives action)
- Tone of voice (3 adjective descriptors + 1 "NOT" descriptor)
- Visual direction (color palette feel, imagery style, layout approach)

### Copy Angles (5 angles, ranked by potential)
For each: hook line, emotional lever, proof mechanism

### Ad Format Recommendations
- Primary format (static, video, carousel, UGC)
- Why this format wins for this product
- Platform-specific adaptations

### Scroll-Stop Techniques
- 3 specific visual or copy devices to arrest attention
- Pattern interrupts that work in this category`,

  outputFormat: 'Creative Brief > Copy Angles > Format Recs > Scroll-Stop Techniques',
};

const brandStrategist: ExpertAgent = {
  id: 'brand-strategist',
  name: 'Brand Strategist',
  role: 'Brand Positioning Expert',
  specialty: 'Brand positioning, USP development, personality, and voice guidelines',
  systemPrompt: `You are a brand strategist who builds positioning that can't be copied. Create brand architecture that gives a product unfair competitive advantage.

Use frameworks: brand positioning statement (For [target] who [need], [brand] is the [category] that [benefit] because [reason to believe]), brand archetype theory, USP ladder (feature → benefit → emotional benefit → identity).

Differentiation must be STRUCTURAL, not cosmetic. If a competitor can copy it in 30 days, it's not differentiation.

Output: positioning statement, brand personality, USP ladder, voice guide.`,

  searchQueries: (product: string, brand: string) => [
    `${brand} brand positioning strategy`,
    `brand strategy ${product} category differentiation`,
    `${product} brand personality examples`,
    `brand differentiation ${product} unique selling proposition`,
  ],

  analysisPrompt: (context: string) => `Develop a brand strategy based on the following research data.

## Web Research Data
${context}

## Required Output
### Positioning Statement
For [target audience] who [key need], [brand] is the [category frame] that [key benefit] because [reason to believe].

### Brand Personality
- Archetype (primary + secondary)
- 5 personality traits
- "If this brand were a person, they would..."

### USP Ladder
- Feature level (what it does)
- Functional benefit (why that matters)
- Emotional benefit (how it makes them feel)
- Identity benefit (who it makes them)

### Brand Voice Guide
- Vocabulary: words we use / words we never use
- Sentence style: short/long, active/passive, formal/casual
- Tone shifts: how voice changes across awareness stages`,

  outputFormat: 'Positioning Statement > Brand Personality > USP Ladder > Voice Guide',
};

const audienceAnalyst: ExpertAgent = {
  id: 'audience-analyst',
  name: 'Audience Analyst',
  role: 'Audience Intelligence Specialist',
  specialty: 'Audience profiles, behavioral segments, media habits, and messaging by segment',
  systemPrompt: `You are an audience intelligence specialist. Build data-driven audience profiles that go beyond demographics into psychographics and behavior.

Use frameworks: Jobs-To-Be-Done (what job does this product do for them?), RFM segmentation, behavioral cohort analysis. Demographics describe who they ARE; psychographics describe who they WANT TO BE.

Focus on: media consumption, platform behavior, purchase cadence, community membership, language patterns per segment.

Output: 3 detailed personas, behavioral segments, media map, messaging per segment.`,

  searchQueries: (product: string, _brand: string) => [
    `who buys ${product} demographics age income`,
    `${product} customer persona profile`,
    `${product} audience insights Reddit community`,
    `${product} buyer behavior social media habits`,
  ],

  analysisPrompt: (context: string) => `Build detailed audience profiles from the following research data.

## Web Research Data
${context}

## Required Output
### Persona Profiles (3 distinct segments)
For each persona:
- Name, age range, income bracket
- Job-to-be-done (why they hire this product)
- Day-in-the-life pain moment
- Media diet (platforms, creators, publications)
- Purchase trigger and decision timeline
- Language patterns (how they talk about this problem)

### Behavioral Segments
- Segment 1: [label] — behavior pattern, size estimate
- Segment 2: [label] — behavior pattern, size estimate
- Segment 3: [label] — behavior pattern, size estimate

### Messaging Per Segment
| Segment | Hook Type | Proof Type | CTA Style |`,

  outputFormat: 'Persona Profiles > Behavioral Segments > Messaging Per Segment',
};

const objectionHandler: ExpertAgent = {
  id: 'objection-handler',
  name: 'Objection Handler',
  role: 'Sales Psychology Specialist',
  specialty: 'Purchase objection identification, counter-arguments, and proof points',
  systemPrompt: `You are a sales psychology expert who anticipates and neutralizes purchase objections before they kill the sale.

Use frameworks: objection classification (price, trust, timing, need, authority), Cialdini's persuasion principles (social proof, authority, scarcity, reciprocity, consistency, liking).

Rank objections by SEVERITY (how many sales they kill), not frequency. A rare but deal-killing objection matters more than a common but weak one.

Output: top 10 objections ranked, counter-argument for each, specific proof points.`,

  searchQueries: (product: string, _brand: string) => [
    `${product} complaints negative reviews Reddit`,
    `why not buy ${product} concerns skepticism`,
    `${product} scam or legit honest review`,
    `${product} return rate dissatisfaction reasons`,
  ],

  analysisPrompt: (context: string) => `Identify and pre-empt purchase objections from the following research data.

## Web Research Data
${context}

## Required Output
### Top 10 Objections (ranked by severity)
For each:
- Objection statement (in customer's own words)
- Severity (1-10, how many sales this kills)
- Type (price / trust / timing / need / authority)
- Counter-argument (1-2 sentences)
- Proof point (specific evidence that neutralizes it)
- Where to deploy (ad copy / landing page / email / FAQ)

### Objection Patterns
- Category with most objections
- The #1 silent objection (what they think but don't say)
- Objections that are actually buying signals

### Proof Arsenal
- Social proof assets needed
- Authority signals to develop
- Risk reversal mechanisms`,

  outputFormat: 'Top 10 Objections > Objection Patterns > Proof Arsenal',
};

const culturalScanner: ExpertAgent = {
  id: 'cultural-scanner',
  name: 'Cultural Scanner',
  role: 'Cultural Trends Analyst',
  specialty: 'Cultural trends, zeitgeist moments, language patterns, and platform-specific hooks',
  systemPrompt: `You are a cultural trends analyst who spots emerging movements before they peak. Connect products to cultural moments for relevance and virality.

Track: TikTok micro-trends, Reddit sentiment shifts, generational attitude changes, meme formats, linguistic drift. The best ads don't sell — they join a conversation already happening.

Focus on what's RISING (not peaked). A trend at 80% awareness is too late. Find the 15-30% awareness window where early adopters are evangelizing.

Output: 5 cultural insights, trending language, platform hooks, moment opportunities.`,

  searchQueries: (product: string, _brand: string) => [
    `${product} TikTok trends viral 2025`,
    `${product} cultural moment zeitgeist 2025`,
    `gen z ${product} attitudes opinions Reddit`,
    `${product} memes social media trending`,
  ],

  analysisPrompt: (context: string) => `Identify cultural trends and opportunities from the following research data.

## Web Research Data
${context}

## Required Output
### Cultural Insights (5 trends)
For each:
- Trend name and description
- Awareness stage (emerging / growing / peaking / declining)
- Relevance to this product (direct / adjacent / stretch)
- Activation idea (how to ride this trend in an ad)

### Trending Language
- 5 phrases/terms gaining usage in this category
- Platform-specific slang (TikTok vs Reddit vs Instagram)
- Words that signal insider status

### Platform-Specific Hooks
| Platform | Hook Format | Example | Why It Works |

### Moment Opportunities
- Seasonal or calendar moments to activate around
- Newsjacking potential (recurring news themes)
- Community events or milestones to reference`,

  outputFormat: 'Cultural Insights > Trending Language > Platform Hooks > Moment Opportunities',
};

// ─────────────────────────────────────────────────────────────
// All experts registry
// ─────────────────────────────────────────────────────────────

export const ALL_EXPERTS: ExpertAgent[] = [
  marketResearcher,
  consumerPsychologist,
  competitiveIntel,
  creativeDirector,
  brandStrategist,
  audienceAnalyst,
  objectionHandler,
  culturalScanner,
];

/** Look up a single expert by ID */
export function getExpert(id: string): ExpertAgent | undefined {
  return ALL_EXPERTS.find(e => e.id === id);
}

// ─────────────────────────────────────────────────────────────
// Team selection by depth preset
// ─────────────────────────────────────────────────────────────

const TEAM_BY_DEPTH: Record<ResearchDepthPreset, string[]> = {
  'super-quick': ['market-researcher', 'consumer-psychologist'],
  'quick':       ['market-researcher', 'consumer-psychologist', 'competitive-intel', 'audience-analyst'],
  'normal':      ['market-researcher', 'consumer-psychologist', 'competitive-intel', 'audience-analyst', 'creative-director', 'objection-handler'],
  'extended':    ['market-researcher', 'consumer-psychologist', 'competitive-intel', 'audience-analyst', 'creative-director', 'objection-handler', 'brand-strategist'],
  'max':         ['market-researcher', 'consumer-psychologist', 'competitive-intel', 'audience-analyst', 'creative-director', 'objection-handler', 'brand-strategist', 'cultural-scanner'],
};

/**
 * Returns the expert team for a given research depth preset.
 * SQ: 2 experts, QK: 4, NR: 6, EX: 7, MX: all 8.
 */
export function getExpertTeam(depth: ResearchDepthPreset): ExpertAgent[] {
  const ids = TEAM_BY_DEPTH[depth] || TEAM_BY_DEPTH['normal'];
  return ids.map(id => ALL_EXPERTS.find(e => e.id === id)).filter((e): e is ExpertAgent => !!e);
}

// ─────────────────────────────────────────────────────────────
// Run a single expert
// ─────────────────────────────────────────────────────────────

/**
 * Executes a full expert research cycle:
 *   1. Generate search queries using the expert's query template
 *   2. Fetch web data via the provided webFetch function (wayfayer API)
 *   3. Compress raw web content using the compression model
 *   4. Run the expert's analysis prompt through the orchestrator model
 *   5. Return structured output
 *
 * @param expert    - The expert agent definition
 * @param product   - Product name / description
 * @param brand     - Brand name
 * @param webFetch  - Web search function (same API as wayfayerService.research)
 * @param signal    - Optional AbortSignal for cancellation
 * @param onChunk   - Optional streaming callback for analysis output
 */
export async function runExpert(
  expert: ExpertAgent,
  product: string,
  brand: string,
  webFetch: WebFetchFn,
  signal?: AbortSignal,
  onChunk?: (chunk: string) => void,
): Promise<ExpertResult> {
  const startTime = Date.now();
  const config = getResearchModelConfig();
  const queries = expert.searchQueries(product, brand);
  let totalSources = 0;

  // ── Step 1: Fetch web data for all queries ──
  const rawTexts: string[] = [];
  for (const query of queries) {
    if (signal?.aborted) break;
    try {
      const result = await webFetch(query, 10, signal);
      const pageText = result.text?.slice(0, 12000) || '';
      if (pageText.length > 50) {
        rawTexts.push(`[Query: ${query}]\n${pageText}`);
      }
      totalSources += result.meta?.success || 0;
    } catch (err) {
      if (signal?.aborted) throw err;
      // Non-fatal: skip this query
    }
  }

  if (signal?.aborted) {
    return { expertId: expert.id, expertName: expert.name, output: '', queriesRun: queries, sourcesFound: totalSources, elapsedMs: Date.now() - startTime };
  }

  // ── Step 2: Compress raw web content ──
  let compressedContext = '';
  if (rawTexts.length > 0) {
    const combinedRaw = rawTexts.join('\n\n---\n\n').slice(0, 30000);
    try {
      compressedContext = await ollamaService.generateStream(
        `Compress the following web research into key facts, data points, and quotes relevant to ${expert.specialty}. Remove boilerplate, navigation, ads. Keep specific numbers, percentages, brand names, and verbatim customer quotes.\n\n${combinedRaw}`,
        'You are a research compression agent. Extract and preserve the most valuable data points. Be concise but preserve specifics.',
        {
          model: config.compressionModel,
          temperature: 0.3,
          num_predict: 2000,
          signal,
        }
      );
    } catch (err) {
      if (signal?.aborted) throw err;
      // Fallback: use raw text truncated
      compressedContext = combinedRaw.slice(0, 6000);
    }
  }

  if (signal?.aborted) {
    return { expertId: expert.id, expertName: expert.name, output: '', queriesRun: queries, sourcesFound: totalSources, elapsedMs: Date.now() - startTime };
  }

  // ── Step 3: Run expert analysis ──
  const analysisInput = compressedContext.length > 100
    ? compressedContext
    : `No web data available. Analyze based on your expertise for: ${product} (brand: ${brand}). Note: findings are from general knowledge only, not live data.`;

  const analysisOutput = await ollamaService.generateStream(
    expert.analysisPrompt(analysisInput),
    expert.systemPrompt,
    {
      model: config.orchestratorModel,
      temperature: 0.7,
      num_predict: 3000,
      signal,
      onChunk,
    }
  );

  return {
    expertId: expert.id,
    expertName: expert.name,
    output: analysisOutput,
    queriesRun: queries,
    sourcesFound: totalSources,
    elapsedMs: Date.now() - startTime,
  };
}

// ─────────────────────────────────────────────────────────────
// Run full expert team
// ─────────────────────────────────────────────────────────────

/**
 * Runs a full team of experts sequentially (to avoid overloading Ollama)
 * and returns all results.
 */
export async function runExpertTeam(
  depth: ResearchDepthPreset,
  product: string,
  brand: string,
  webFetch: WebFetchFn,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
): Promise<ExpertResult[]> {
  const team = getExpertTeam(depth);
  const results: ExpertResult[] = [];

  onProgress?.(`\nDeploying ${team.length} expert agents [${depth}]:\n`);
  for (const expert of team) {
    onProgress?.(`  - ${expert.name} (${expert.role})\n`);
  }
  onProgress?.('\n');

  for (const expert of team) {
    if (signal?.aborted) break;

    onProgress?.(`[${expert.name}] Starting analysis...\n`);

    const result = await runExpert(
      expert,
      product,
      brand,
      webFetch,
      signal,
      (chunk) => onProgress?.(chunk),
    );

    results.push(result);
    onProgress?.(`\n[${expert.name}] Complete (${(result.elapsedMs / 1000).toFixed(1)}s, ${result.sourcesFound} sources)\n\n`);
  }

  return results;
}
