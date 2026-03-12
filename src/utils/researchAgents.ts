import { ollamaService } from './ollama';
import { wayfarerService } from './wayfarer';
import { getResearchModelConfig, getResearchLimits } from './modelConfig';
import { getMethodologySummary, METHODOLOGY_STEPS } from './researchMethodology';
import { recordResearchSource } from './researchAudit';
import type { Campaign } from '../types';

/** Build a compact brand context block from preset + reference images */
function buildOrchestratorBrandContext(campaign: Campaign): string {
  const parts: string[] = [];
  const p = campaign.presetData;
  if (p?.brand) {
    const b = p.brand;
    if (b.name) parts.push(`Brand: ${b.name}`);
    if (b.positioning) parts.push(`Positioning: ${b.positioning}`);
    if (b.packagingDesign) parts.push(`Packaging: ${b.packagingDesign}`);
    if (b.toneOfVoice) parts.push(`Tone: ${b.toneOfVoice}`);
  }
  if (p?.product) {
    if (p.product.name) parts.push(`Product: ${p.product.name}`);
    if (p.product.ingredients) parts.push(`Ingredients: ${p.product.ingredients}`);
  }
  const imgs = campaign.referenceImages;
  if (imgs?.length) {
    const descs = (imgs as any[])
      .filter((img: any) => typeof img !== 'string' && img.description)
      .map((img: any) => `  ${img.label}: ${img.description}`)
      .slice(0, 3);
    if (descs.length) parts.push(`Ref Images:\n${descs.join('\n')}`);
  }
  return parts.length ? `\nBrand Context:\n${parts.join('\n')}\n` : '';
}

export interface ResearchQuery {
  topic: string;
  context: string;
  depth: 'quick' | 'thorough';
}

export interface ResearchResult {
  query: string;
  findings: string;
  sources: string[];
  coverage_graph: Record<string, boolean>; // Dimensional coverage tracking
}

export interface CoverageGraph {
  market_size_trends: boolean;
  competitor_analysis: boolean;
  customer_objections: boolean;
  emerging_trends: boolean;
  regional_differences: boolean;
  pricing_strategies: boolean;
  channel_effectiveness: boolean;
  brand_positioning_gaps: boolean;
  psychological_triggers: boolean;
  media_consumption_patterns: boolean;
  // Methodology-driven dimensions (9-step framework)
  amazon_research: boolean;
  reddit_research: boolean;
  identity_markers: boolean;
  ad_style_analysis: boolean;
  market_sophistication: boolean;
  visual_competitive_analysis: boolean;
  [key: string]: boolean; // Allow additional dimensions
}

export interface OrchestratorState {
  campaign: Campaign;
  researchGoals: string[];
  completedResearch: ResearchResult[];
  coverageThreshold: number; // Percentage of dimensions that must be covered (0.0 - 1.0)
  userProvidedContext?: Record<string, string>; // Answers to questions glm asked
  reflectionSuggestedTopics?: string[]; // Gaps found by reflection agent
}

export interface ResearchPauseEvent {
  type: 'pause_for_input';
  question: string;
  context: string; // Why is glm asking?
  suggestedAnswers?: string[]; // Optional suggestions
}

// ─────────────────────────────────────────────────────────────
// Knowledge State — structured summary of what we've learned
// ─────────────────────────────────────────────────────────────

interface KnowledgeState {
  competitors: string[];      // Named competitors we've identified
  pricePoints: string[];      // Specific prices/ranges found
  verbatimQuotes: string[];   // Real customer language (max 10)
  objections: string[];       // Identified purchase objections
  communities: string[];      // Platforms/communities where audience lives
  statistics: string[];       // Key numbers (market size, growth, etc.)
  turningPoints: string[];    // Moments that trigger purchase
  failedSolutions: string[];  // What they tried that didn't work
  summary: string;            // Compact text version for prompts
}

function buildKnowledgeState(results: ResearchResult[]): KnowledgeState {
  const state: KnowledgeState = {
    competitors: [], pricePoints: [], verbatimQuotes: [], objections: [],
    communities: [], statistics: [], turningPoints: [], failedSolutions: [],
    summary: '',
  };

  const allFindings = results.map(r => r.findings).join('\n');
  if (!allFindings) return state;

  // Extract named competitors (capitalized words near "competitor", "vs", "brand", "company")
  const compPatterns = [
    /(?:competitor|brand|company|versus|vs\.?)\s*:?\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/gi,
    /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s+(?:offers?|sells?|charges?|positions?|claims?|advertises?)/g,
  ];
  for (const pattern of compPatterns) {
    const matches = allFindings.matchAll(pattern);
    for (const m of matches) {
      const name = m[1]?.trim();
      if (name && name.length > 2 && name.length < 40 && !/^(The|This|That|They|Their|These|Our|But|And|For|With|From|Into|What|Which|Where|When|How|Who|Why)$/.test(name)) {
        state.competitors.push(name);
      }
    }
  }
  state.competitors = [...new Set(state.competitors)].slice(0, 30);

  // Extract price points ($XX, $XX.XX, $XX-$XX, XX% off)
  const priceMatches = allFindings.match(/\$\d+(?:\.\d{2})?(?:\s*[-–to]+\s*\$\d+(?:\.\d{2})?)?|\d+%\s+(?:off|discount|cheaper)/gi) || [];
  state.pricePoints = [...new Set(priceMatches)].slice(0, 10);

  // Extract verbatim quotes (text in quotation marks that sounds like a real person)
  const quoteMatches = allFindings.match(/"([^"]{20,200})"/g) || [];
  state.verbatimQuotes = quoteMatches
    .map(q => q.replace(/^"|"$/g, ''))
    .filter(q => /\b(I|my|me|we|our|feel|tried|hate|love|wish|bought|stopped|switched)\b/i.test(q))
    .slice(0, 25);

  // Extract objections (lines mentioning complaints, reasons not to buy)
  const objLines = allFindings.split('\n').filter(l =>
    /(?:objection|complaint|concern|reason not|hesitat|worry|afraid|too expensive|doesn't work|waste|scam|skeptic)/i.test(l)
  );
  state.objections = objLines.map(l => l.trim().slice(0, 150)).slice(0, 20);

  // Extract communities/platforms
  const communityPatterns = /\b(r\/\w+|Reddit|TikTok|Instagram|Facebook|YouTube|Amazon|Trustpilot|Twitter|X\.com|Pinterest|LinkedIn|Quora|forums?)\b/gi;
  const commMatches = allFindings.match(communityPatterns) || [];
  state.communities = [...new Set(commMatches.map(c => c.trim()))].slice(0, 20);

  // Extract key statistics (numbers with context)
  const statLines = allFindings.split('\n').filter(l =>
    /\$?\d+(?:\.\d+)?(?:\s*(?:billion|million|%|percent|users?|customers?))/i.test(l) && l.trim().length > 15
  );
  state.statistics = statLines.map(l => l.trim().slice(0, 150)).slice(0, 20);

  // Extract turning points / triggers
  const triggerLines = allFindings.split('\n').filter(l =>
    /(?:turning point|trigger|moment|finally|last straw|breaking point|tipping|when I|realized|enough)/i.test(l)
  );
  state.turningPoints = triggerLines.map(l => l.trim().slice(0, 150)).slice(0, 15);

  // Extract failed solutions
  const failLines = allFindings.split('\n').filter(l =>
    /(?:tried|failed|didn't work|gave up|switched from|stopped using|waste of|disappointed)/i.test(l)
  );
  state.failedSolutions = failLines.map(l => l.trim().slice(0, 150)).slice(0, 20);

  // Build compact summary for injection into prompts
  const parts: string[] = [];
  if (state.competitors.length) parts.push(`COMPETITORS FOUND: ${state.competitors.join(', ')}`);
  if (state.pricePoints.length) parts.push(`PRICES FOUND: ${state.pricePoints.join(', ')}`);
  if (state.statistics.length) parts.push(`KEY STATS:\n${state.statistics.slice(0, 5).map(s => `  - ${s}`).join('\n')}`);
  if (state.verbatimQuotes.length) parts.push(`VERBATIM QUOTES (${state.verbatimQuotes.length}):\n${state.verbatimQuotes.slice(0, 5).map(q => `  "${q}"`).join('\n')}`);
  if (state.objections.length) parts.push(`OBJECTIONS IDENTIFIED:\n${state.objections.slice(0, 5).map(o => `  - ${o}`).join('\n')}`);
  if (state.communities.length) parts.push(`AUDIENCE FOUND ON: ${state.communities.join(', ')}`);
  if (state.turningPoints.length) parts.push(`TURNING POINTS:\n${state.turningPoints.slice(0, 3).map(t => `  - ${t}`).join('\n')}`);
  if (state.failedSolutions.length) parts.push(`FAILED SOLUTIONS:\n${state.failedSolutions.slice(0, 5).map(f => `  - ${f}`).join('\n')}`);

  state.summary = parts.join('\n\n');
  return state;
}

// ─────────────────────────────────────────────────────────────
// Compression — reduce raw page content to relevant facts
// ─────────────────────────────────────────────────────────────

async function compressPage(
  pageContent: string,
  pageTitle: string,
  pageUrl: string,
  researchQuery: string,
  signal?: AbortSignal,
  knowledgeSummary?: string,
): Promise<string> {
  if (!pageContent || pageContent.length < 200) return '';

  // Truncate very long pages — keep enough for meaningful extraction
  // LFM-2.5 has a 32K context window, so 24K content + prompt is safe
  const truncated = pageContent.slice(0, 24000);

  // Tell compressor what we already know so it focuses on NEW information
  const knowledgeBlock = knowledgeSummary
    ? `\nWE ALREADY KNOW (skip repeating these — extract NEW info only):\n${knowledgeSummary.slice(0, 1500)}\n`
    : '';

  const prompt = `Extract facts relevant to "${researchQuery}" from this page.
${knowledgeBlock}
Source: ${pageUrl}
Title: ${pageTitle}

Content:
${truncated}

EXTRACT these types of data (PRIORITIZE what we DON'T already know):
- NUMBERS: market size, growth rates, percentages, prices, user counts
- QUOTES: verbatim customer language, complaints, reviews (keep exact wording in "quotes")
- COMPETITORS: names, positioning, pricing, strengths, weaknesses
- OBJECTIONS: real complaints, reasons for switching, failed solutions
- EVIDENCE: study results, clinical data, expert opinions with attribution
- NEW INSIGHT: anything surprising or contradicting what we already know

Rules:
- Keep source attribution (who said it, what study)
- Preserve exact quotes in quotation marks
- SKIP facts we already have — focus on NEW data points
- Maximum 400 words
- If nothing NEW or relevant, output: NO_RELEVANT_CONTENT

FACTS:`;

  try {
    const compressed = await ollamaService.generateStream(
      prompt,
      'Extract relevant facts from web pages. Be concise and specific. Preserve numbers and quotes.',
      { model: getResearchModelConfig().compressionModel, signal }
    );

    if (compressed.includes('NO_RELEVANT_CONTENT')) return '';
    return `[${pageTitle}](${pageUrl}):\n${compressed}`;
  } catch {
    return '';
  }
}

async function compressFindings(
  pages: Array<{ content: string; title: string; url: string; source: string }>,
  researchQuery: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  knowledgeSummary?: string,
): Promise<string> {
  // Filter out failed pages
  const validPages = pages.filter(
    (p) => p.source !== 'failed' && p.content && p.content.length >= 200
  );

  if (validPages.length === 0) return '';

  const concurrency = getResearchLimits().parallelCompressionCount;
  onChunk?.(`Compressing ${validPages.length} pages into key findings (concurrency: ${concurrency})...\n`);

  // Compress in parallel batches — remote GPU handles concurrent small-model calls fine
  const compressed: string[] = [];
  for (let batchStart = 0; batchStart < validPages.length; batchStart += concurrency) {
    if (signal?.aborted) break;
    const batch = validPages.slice(batchStart, batchStart + concurrency);
    const batchResults = await Promise.all(
      batch.map(p => compressPage(p.content, p.title, p.url, researchQuery, signal, knowledgeSummary))
    );
    for (const result of batchResults) {
      if (result) compressed.push(result);
    }
    const done = Math.min(batchStart + concurrency, validPages.length);
    onChunk?.(`  Compressed ${done}/${validPages.length} pages\n`);
  }

  return compressed.join('\n\n');
}

// ─────────────────────────────────────────────────────────────
// Researcher Agent — web search + compress + synthesize
// ─────────────────────────────────────────────────────────────

export const researcherAgent = {
  async research(query: ResearchQuery, onChunk?: (chunk: string) => void, signal?: AbortSignal, knowledgeSummary?: string): Promise<ResearchResult> {
    try {
      onChunk?.(`Searching: "${query.topic}"...\n`);

      // Step 1: Fetch full page content via Wayfarer
      const wayfarerResult = await wayfarerService.research(query.topic, 20, signal);
      const meta = wayfarerResult.meta;
      onChunk?.(`Fetched ${meta.success}/${meta.total} pages (${meta.elapsed}s)\n`);

      // Record all fetched sources in audit trail
      wayfarerResult.sources.forEach((src) => {
        recordResearchSource({
          url: src.url,
          query: query.topic,
          source: 'text', // text-only wayfarer
          contentLength: src.snippet?.length || 0,
          extractedSnippet: src.snippet,
        });
      });

      // Step 2: Compress each page to relevant facts (context-aware: skip what we already know)
      let compressedContent: string;

      if (meta.success > 0) {
        compressedContent = await compressFindings(wayfarerResult.pages, query.topic, onChunk, signal, knowledgeSummary);
      } else {
        // Wayfarer returned nothing — fall back to LLM-only
        onChunk?.('No web results, using LLM knowledge only\n');
        compressedContent = '';
      }

      // Step 3: Synthesize compressed findings with LLM (context-aware)
      const hasWebData = compressedContent.length > 100;

      // Build knowledge-aware synthesis context
      const knowledgeHint = knowledgeSummary
        ? `\nWE ALREADY KNOW (don't repeat — focus on NEW insights):\n${knowledgeSummary.slice(0, 800)}\n`
        : '';

      const synthesisPrompt = `Synthesize ${hasWebData ? 'these web research findings' : 'your knowledge'} for desire-driven ad campaign strategy.

${hasWebData ? `Research Data:\n${compressedContent}` : '(No web data — use training knowledge)'}
${knowledgeHint}
Topic: ${query.topic}
Context: ${query.context}

Synthesize into these sections (SKIP sections where you found nothing new):

FINDINGS:
- NEW insights not in "WE ALREADY KNOW" above
- Specific numbers, data points with source attribution
- What's SURPRISING or contradicts existing knowledge?

VERBATIM:
- Exact quotes from real customers/users (preserve their language, slang, typos)
- How they describe the PROBLEM (not how brands describe it)

COMPETITORS:
- Named competitors with SPECIFIC claims, prices, positioning
- What they CAN'T claim (structural limitations)

EVIDENCE:
- Numbers: market size, growth %, prices, user counts
- Studies or reports with attribution

COVERAGE: [dimension: covered/uncovered]
Dimensions: market_size, competitors, objections, trends, regional, pricing, channels, positioning, psychology, media

Be specific. Real names, real numbers, real quotes. No generic marketing-speak. If a section has nothing new, write "Nothing new found" and move on.`;

      const response = await ollamaService.generateStream(
        synthesisPrompt,
        'Synthesize research findings for marketing strategy. Be specific, cite sources. Identify which dimensions you covered.',
        {
          model: getResearchModelConfig().researcherSynthesisModel,
          onChunk,
          signal,
        }
      );

      const coverage_graph = buildCoverageGraph(response);

      return {
        query: query.topic,
        findings: response,
        sources: [
          ...wayfarerResult.sources.map((s) => s.url),
          ...extractSources(response),
        ],
        coverage_graph,
      };
    } catch (error) {
      console.error('Research agent error:', error);
      // Fallback to LLM-only research
      try {
        onChunk?.('Web search failed, using LLM knowledge only\n');
        const fallbackPrompt = `You are a research analyst. Provide insights on this topic based on your knowledge:
Topic: ${query.topic}
Context: ${query.context}

Cover as many dimensions as possible: market size, competitors, objections, trends, regional, pricing, channels, positioning, psychology, media patterns.`;

        const response = await ollamaService.generateStream(
          fallbackPrompt,
          'Provide research insights. Note which dimensions you cover.',
          { model: getResearchModelConfig().researcherSynthesisModel, onChunk, signal }
        );

        return {
          query: query.topic,
          findings: response,
          sources: [],
          coverage_graph: buildCoverageGraph(response),
        };
      } catch (fallbackError) {
        console.error('Research fallback error:', fallbackError);
        throw fallbackError;
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────
// Orchestrator — manages researchers + reflection agent
// ─────────────────────────────────────────────────────────────

export const orchestrator = {
  async orchestrateResearch(
    state: OrchestratorState,
    onProgressUpdate?: (message: string) => void,
    onPauseForInput?: (event: ResearchPauseEvent) => Promise<string>,
    signal?: AbortSignal
  ): Promise<ResearchResult[]> {
    const allResults: ResearchResult[] = [...state.completedResearch];
    let iteration = 0;
    const limits = getResearchLimits();
    const maxIterations = limits.maxIterations;
    const maxTimeMs = limits.maxTimeMinutes * 60 * 1000;
    const startTime = Date.now();

    while (iteration < maxIterations) {
      // Check abort signal
      if (signal?.aborted) {
        onProgressUpdate?.('\nResearch aborted by user');
        break;
      }

      // Check time limit
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxTimeMs) {
        const elapsedMin = (elapsed / 60000).toFixed(1);
        onProgressUpdate?.(`\nTime limit reached (${elapsedMin}min / ${limits.maxTimeMinutes}min) — wrapping up research`);
        break;
      }

      iteration++;
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      onProgressUpdate?.(`\n[Orchestrator] Iteration ${iteration}/${maxIterations} — evaluating gaps... (${elapsedSec}s elapsed)`);

      // Build knowledge state — structured summary of WHAT we actually know
      const knowledge = buildKnowledgeState(allResults);
      if (iteration === 1 || iteration % 3 === 0) {
        // Show knowledge snapshot periodically so user sees intelligence building
        const knownCount = [knowledge.competitors, knowledge.pricePoints, knowledge.verbatimQuotes, knowledge.objections, knowledge.statistics].reduce((sum, arr) => sum + arr.length, 0);
        if (knownCount > 0) {
          onProgressUpdate?.(`[Knowledge] ${knowledge.competitors.length} competitors, ${knowledge.pricePoints.length} prices, ${knowledge.verbatimQuotes.length} quotes, ${knowledge.objections.length} objections, ${knowledge.statistics.length} stats\n`);
        }
      }

      // Build evaluation prompt (includes knowledge state + reflection suggestions)
      const evaluationPrompt = buildEvaluationPrompt(state, allResults, state.campaign.researchMode, knowledge);

      try {
        // Stream orchestrator thinking live — throttled to avoid UI overload
        let decisionBuffer = '';
        let lastThinkEmit = 0;
        const decision = await ollamaService.generateStream(
          evaluationPrompt,
          'You decide what research is needed. Be specific about topics.',
          {
            model: getResearchModelConfig().orchestratorModel,
            signal,
            onChunk: (c) => {
              decisionBuffer += c;
              // Emit thinking tokens every 200ms so user sees live reasoning
              const now = Date.now();
              if (now - lastThinkEmit >= 200 && decisionBuffer.length > 0) {
                // Emit accumulated buffer as thinking
                const chunk = decisionBuffer.replace(/\n/g, ' ').trim();
                if (chunk.length > 5) {
                  onProgressUpdate?.(`[Orchestrator thinking] ${chunk}\n`);
                }
                decisionBuffer = '';
                lastThinkEmit = now;
              }
            },
          }
        );
        // Flush any remaining buffer
        if (decisionBuffer.trim().length > 5) {
          onProgressUpdate?.(`[Orchestrator thinking] ${decisionBuffer.replace(/\n/g, ' ').trim()}\n`);
        }

        const nextTopics = parseOrchestratorDecision(decision);

        // Apply quality filter to reject trend-chasing and BS queries
        const filteredTopics = nextTopics.filter((topic) => {
          if (!topic.query) return true; // Keep empty (COMPLETE, QUESTION)
          if (!isQualityQuery(topic.query)) {
            onProgressUpdate?.(`  [Filter] Rejected low-quality query: "${topic.query}"\n`);
            return false;
          }
          return true;
        });

        // Force-inject reflection-suggested topics if orchestrator didn't include them
        if (state.reflectionSuggestedTopics?.length && filteredTopics.length > 0 && filteredTopics[0].shouldContinue) {
          const existingQueries = new Set(filteredTopics.map(t => t.query.toLowerCase()));
          const forcedTopics = state.reflectionSuggestedTopics
            .filter(t => !existingQueries.has(t.toLowerCase()))
            .slice(0, 2)
            .map(t => ({ query: t, context: 'Forced from reflection agent gap analysis', depth: 'thorough' as const, shouldContinue: true }));
          if (forcedTopics.length > 0) {
            filteredTopics.push(...forcedTopics);
            onProgressUpdate?.(`  [Orchestrator] Injecting ${forcedTopics.length} reflection-forced queries\n`);
          }
          // Clear after use
          state.reflectionSuggestedTopics = undefined;
        }

        // Handle questions in interactive mode
        if (filteredTopics[0]?.question && state.campaign.researchMode === 'interactive' && onPauseForInput) {
          onProgressUpdate?.(`\n[Orchestrator] Pausing for user input...\n`);
          const userAnswer = await onPauseForInput({
            type: 'pause_for_input',
            question: filteredTopics[0].question,
            context: filteredTopics[0].questionContext || 'Clarification needed',
            suggestedAnswers: Array.isArray(state.campaign.productFeatures) ? state.campaign.productFeatures : undefined,
          });

          if (!state.userProvidedContext) state.userProvidedContext = {};
          state.userProvidedContext[filteredTopics[0].question] = userAnswer;
          onProgressUpdate?.(`User provided: ${userAnswer}\n`);
          continue;
        }

        // Skip question topics in autonomous mode
        if (filteredTopics[0]?.question && state.campaign.researchMode === 'autonomous') {
          onProgressUpdate?.(`[Orchestrator] Skipping clarification question in autonomous mode\n`);
          continue;
        }

        if (filteredTopics.length === 0 || !filteredTopics[0].shouldContinue) {
          onProgressUpdate?.('Orchestrator satisfied with coverage — research complete');
          break;
        }

        // Deploy researchers (up to N per iteration) — dedup against already-run queries
        const existingQueries = allResults.map(r => r.query);
        const dedupedTopics = filteredTopics.slice(0, limits.maxResearchersPerIteration).filter((t) => {
          if (t.query.length === 0) return false;
          if (isDuplicateQuery(t.query, existingQueries)) {
            onProgressUpdate?.(`  [Dedup] Skipping "${t.query}" — too similar to previous query\n`);
            return false;
          }
          return true;
        });
        const researchTopics = dedupedTopics;
        if (researchTopics.length === 0) {
          onProgressUpdate?.('All proposed queries are duplicates of previous research — wrapping up\n');
          break;
        }
        onProgressUpdate?.(`Deploying ${researchTopics.length} researcher agents...\n`);
        researchTopics.forEach((t) => {
          const gapNote = t.context && t.context !== 'Marketing research for campaign optimization'
            ? ` (filling: ${t.context})`
            : '';
          onProgressUpdate?.(`  [Orchestrator] → "${t.query}"${gapNote}\n`);
        });

        // Run researchers SEQUENTIALLY — each one does compress + synthesize (LLM calls)
        // On local GPU, parallel LLM calls cause thrashing and garbled output
        for (const topic of researchTopics) {
          if (signal?.aborted) break;
          onProgressUpdate?.(`\n  [Researcher] Starting: "${topic.query}"\n`);

          let synthesisBuffer = '';
          let isSynthesizing = false;
          let lastSynthEmit = 0;

          const result = await researcherAgent.research(
            { topic: topic.query, context: topic.context, depth: topic.depth },
            (chunk) => {
              // Structured messages — emit directly
              if (chunk.includes('Searching:') || chunk.includes('Fetched') || chunk.includes('Compress') || chunk.includes('No web results') || chunk.includes('Web search failed') || chunk.includes('LLM knowledge')) {
                if (isSynthesizing && synthesisBuffer.length > 0) {
                  onProgressUpdate?.(`  [Researcher] ${synthesisBuffer.replace(/\n/g, ' ').trim()}\n`);
                  synthesisBuffer = '';
                  isSynthesizing = false;
                }
                onProgressUpdate?.(`  [Researcher] ${chunk}`);
              } else {
                // Synthesis tokens — stream live with throttling
                isSynthesizing = true;
                synthesisBuffer += chunk;
                const now = Date.now();
                if (now - lastSynthEmit >= 300 && synthesisBuffer.trim().length > 10) {
                  onProgressUpdate?.(`  [Researcher] ${synthesisBuffer.replace(/\n/g, ' ').trim()}\n`);
                  synthesisBuffer = '';
                  lastSynthEmit = now;
                }
              }
            },
            signal,
            knowledge.summary, // Context-aware: compressor skips what we already know
          );

          // Flush remaining synthesis buffer
          if (synthesisBuffer.trim().length > 0) {
            onProgressUpdate?.(`  [Researcher] ${synthesisBuffer.replace(/\n/g, ' ').trim()}\n`);
          }

          allResults.push(result);
          onProgressUpdate?.(`  [Researcher] Done: "${topic.query}" — ${result.sources.length} sources\n`);
        }

        // Track total unique sources across all research
        const totalSources = new Set(allResults.flatMap(r => r.sources)).size;
        onProgressUpdate?.(`Total unique sources: ${totalSources}\n`);

        // Visual Scout: if orchestrator requested VISUAL_SCOUT, dispatch visual analysis
        const visualScoutUrls = researchTopics
          .flatMap(t => t.visualScoutUrls || [])
          .filter(Boolean);

        if (visualScoutUrls.length > 0 && !(state as any)._visualFindings) {
          onProgressUpdate?.(`\n[Visual Scout] Orchestrator requested visual analysis of ${visualScoutUrls.length} URLs\n`);
          try {
            const { visualScoutAgent } = await import('./visualScoutAgent');
            const { visualProgressStore } = await import('./visualProgressStore');
            const cappedUrls = visualScoutUrls.slice(0, 5);
            const visualFindings = await visualScoutAgent.analyzeCompetitorVisuals(
              cappedUrls,
              state.campaign,
              onProgressUpdate,
              signal,
              // Structured progress events → text chunks + visual store
              (event) => {
                switch (event.type) {
                  case 'screenshot_batch_start':
                    visualProgressStore.startBatch(event.urls);
                    break;
                  case 'screenshot_start':
                    onProgressUpdate?.(`[Visual Scout] Capturing ${event.index + 1}/${event.total}: ${event.url}\n`);
                    visualProgressStore.setCapturing(event.url);
                    break;
                  case 'screenshot_done':
                    onProgressUpdate?.(`[Visual Scout] ${event.error ? 'Failed' : 'Captured'} ${event.index + 1}/${event.total}: ${event.url.slice(0, 60)}${event.error ? ` — ${event.error}` : ''}\n`);
                    visualProgressStore.setCaptured(event.url, event.thumbnail, event.error);
                    break;
                  case 'analysis_start':
                    onProgressUpdate?.(`[Visual Scout] Analyzing visual ${event.index + 1}/${event.total}: ${event.url.slice(0, 50)}...\n`);
                    visualProgressStore.setAnalyzing(event.url);
                    break;
                  case 'analysis_done':
                    if (event.findings) {
                      onProgressUpdate?.(`[Visual Scout] → ${event.url.slice(0, 40)}: tone=${event.findings.tone || '?'}, colors=${(event.findings.colors || []).slice(0, 2).join(', ') || '?'}\n`);
                      visualProgressStore.setAnalyzed(event.url, event.findings);
                    }
                    break;
                  case 'synthesis_start':
                    onProgressUpdate?.(`[Visual Scout] Synthesizing patterns across ${event.count} sites...\n`);
                    visualProgressStore.setSynthesisStatus('running');
                    break;
                  case 'synthesis_done':
                    if (event.patterns.length) onProgressUpdate?.(`[Visual Scout] Patterns: ${event.patterns.slice(0, 2).join('; ')}\n`);
                    if (event.gaps.length) onProgressUpdate?.(`[Visual Scout] Gaps: ${event.gaps.slice(0, 2).join('; ')}\n`);
                    visualProgressStore.setSynthesisStatus('done', event.patterns, event.gaps);
                    break;
                }
              }
            );
            (state as any)._visualFindings = visualFindings;
            onProgressUpdate?.(`[Visual Scout] Visual analysis complete — ${visualFindings.totalAnalyzed} sites analyzed\n`);
          } catch (err) {
            onProgressUpdate?.(`[Visual Scout] Visual analysis failed: ${err}\n`);
          }
        }

        // Evaluate coverage
        const coverageStatus = evaluateCoverage(allResults);
        const coveredDimensions = Object.values(coverageStatus).filter(Boolean).length;
        const totalDimensions = Object.keys(coverageStatus).length;
        const coveragePercentage = (coveredDimensions / totalDimensions) * 100;

        onProgressUpdate?.(
          `Coverage: ${coveragePercentage.toFixed(0)}% (${coveredDimensions}/${totalDimensions} dimensions, threshold: ${(state.coverageThreshold * 100).toFixed(0)}%)`
        );

        // Emit structured metrics for UI display
        const iterEndSec = Math.round((Date.now() - startTime) / 1000);
        const sourcesNow = new Set(allResults.flatMap(r => r.sources)).size;
        onProgressUpdate?.(`[METRICS] ${JSON.stringify({
          iteration,
          maxIterations,
          elapsedSec: iterEndSec,
          coveragePct: coveragePercentage.toFixed(0),
          coveredDims: coveredDimensions,
          totalDims: totalDimensions,
          totalSources: sourcesNow,
          queriesThisIteration: researchTopics.length,
          totalQueries: allResults.length,
        })}\n`);

        // Always run 3-perspective reflection agents after iteration 1+
        // Devil's Advocate, Depth Auditor, Coverage Checker — each contributes gap suggestions
        const MIN_ITERATIONS_BEFORE_EXIT = limits.minIterations;
        if (iteration >= 1 && iteration < maxIterations) {
          onProgressUpdate?.(`\nRunning 3 reflection agents (Devil's Advocate → Depth Auditor → Coverage Checker)...\n`);

          const reflectionAngles = await reflectionAgent.evaluateGaps(
            state,
            allResults,
            (chunk) => {
              // Structured messages — emit directly to UI
              if (chunk.includes('[150% BAR]') || chunk.includes('[Reflection') || chunk.includes('angles') || chunk.includes('Visual Scout')) {
                onProgressUpdate?.(chunk);
              }
              // Skip raw LLM tokens from reflection — too noisy
            },
            signal
          );

          if (reflectionAngles.length > 0) {
            state.reflectionSuggestedTopics = reflectionAngles.slice(0, 8);
            onProgressUpdate?.(
              `\nReflection found ${reflectionAngles.length} gaps — feeding top ${Math.min(reflectionAngles.length, 8)} into next iteration\n`
            );
          }
        }

        // Require minimum iterations AND minimum sources before allowing exit
        const MIN_SOURCES = limits.minSources;
        const currentSources = new Set(allResults.flatMap(r => r.sources)).size;
        if (iteration >= MIN_ITERATIONS_BEFORE_EXIT && coveragePercentage / 100 >= state.coverageThreshold && currentSources >= MIN_SOURCES) {
          onProgressUpdate?.(`Coverage threshold reached with ${currentSources} sources — research complete`);
          break;
        } else if (iteration < MIN_ITERATIONS_BEFORE_EXIT) {
          onProgressUpdate?.(`Iteration ${iteration} of minimum ${MIN_ITERATIONS_BEFORE_EXIT} — continuing research for depth`);
        } else if (currentSources < MIN_SOURCES) {
          onProgressUpdate?.(`Only ${currentSources}/${MIN_SOURCES} sources — continuing research for depth`);
        }
      } catch (error) {
        console.error('Orchestrator error:', error);
        throw error;
      }
    }

    return allResults;
  },
};

// ─────────────────────────────────────────────────────────────
// Reflection Agent — 150% bar gap detection
// ─────────────────────────────────────────────────────────────

export const reflectionAgent = {
  /**
   * 3 reflection perspectives — sequential, each builds on the previous.
   * 1. Devil's Advocate — find where research is WRONG, biased, based on assumptions
   * 2. Depth Auditor — demand specific numbers, named sources, exact quotes, verifiable claims
   * 3. Coverage Checker — count data points per dimension, find geographic/temporal gaps
   * Each contributes gap suggestions. Dedup across all 3 → up to 8 topics injected into next iteration.
   */
  async evaluateGaps(
    state: OrchestratorState,
    completedResults: ResearchResult[],
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string[]> {
    try {
      const coverage = evaluateCoverage(completedResults);
      const gaps = Object.entries(coverage)
        .filter(([, covered]) => !covered)
        .map(([dimension]) => dimension);

      const totalDims = Object.keys(coverage).length;
      onChunk?.(`[150% BAR] Covered: ${totalDims - gaps.length}/${totalDims}. Missing: ${gaps.join(', ') || 'none declared'}\n`);

      const knowledge = buildKnowledgeState(completedResults);
      const reflectionModel = getResearchModelConfig().reflectionModel;

      // Shared context block for all 3 perspectives
      const sharedContext = `Campaign: ${state.campaign.brand} | ${state.campaign.productDescription} | Target: ${state.campaign.targetAudience}
${buildOrchestratorBrandContext(state.campaign)}

${'═'.repeat(50)}
WHAT WE ACTUALLY KNOW (extracted facts):
${knowledge.summary || '(Nothing extracted yet — very early stage)'}
${'═'.repeat(50)}

RESEARCH COMPLETED (${completedResults.length} queries):
${completedResults.map((r, i) => `${i + 1}. "${r.query}" → ${Object.values(r.coverage_graph).filter(Boolean).length}/10 dimensions`).join('\n')}

FACTUAL INVENTORY:
- Competitors: ${knowledge.competitors.length > 0 ? `${knowledge.competitors.length} (${knowledge.competitors.slice(0, 5).join(', ')})` : 'ZERO — CRITICAL'}
- Price points: ${knowledge.pricePoints.length > 0 ? knowledge.pricePoints.slice(0, 5).join(', ') : 'ZERO'}
- Verbatim quotes: ${knowledge.verbatimQuotes.length > 0 ? `${knowledge.verbatimQuotes.length}` : 'ZERO'}
- Objections: ${knowledge.objections.length > 0 ? `${knowledge.objections.length}` : 'ZERO'}
- Turning points: ${knowledge.turningPoints.length > 0 ? `${knowledge.turningPoints.length}` : 'ZERO'}
- Failed solutions: ${knowledge.failedSolutions.length > 0 ? `${knowledge.failedSolutions.length}` : 'ZERO'}
- Communities: ${knowledge.communities.length > 0 ? knowledge.communities.join(', ') : 'ZERO'}
- Statistics: ${knowledge.statistics.length > 0 ? `${knowledge.statistics.length}` : 'ZERO'}

DIMENSIONAL GAPS: ${gaps.length > 0 ? gaps.join(', ') : 'NONE DECLARED — OVERCONFIDENCE RISK!'}`;

      const allAngles: string[] = [];

      // ── Perspective 1: Devil's Advocate ──
      onChunk?.(`\n[Reflection: Devil's Advocate] Finding where research is WRONG...\n`);
      if (!signal?.aborted) {
        const devilPrompt = `You are the DEVIL'S ADVOCATE on a research team. Your ONLY job is to find where the research is WRONG, BIASED, or based on ASSUMPTIONS rather than evidence.

${sharedContext}

YOUR TASK — be RUTHLESSLY skeptical:
1. What conclusions are based on ASSUMPTION not EVIDENCE? Call them out specifically.
2. Where is the research BIASED? (confirmation bias, survivorship bias, selection bias)
3. What CONTRADICTIONS exist in the findings? (Brand claims vs user reality)
4. What ALTERNATIVE EXPLANATIONS haven't been considered?
5. What would a SKEPTICAL customer say about these findings?
6. Where are we PROJECTING marketer assumptions onto real customers?

For each weakness found, propose a SPECIFIC query to get REAL evidence:
BAD: "Research sentiment about product"
GOOD: "reddit [subreddit] '[competitor name]' disappointed OR 'waste of money' OR 'doesn't work'"

Output:
BIAS RISK: [what assumption are we making that could be wrong?]
CONTRADICTION: [what evidence contradicts our current narrative?]

RESEARCH TO VERIFY:
1. [hyperspecific query to test an assumption]
2. [hyperspecific query to find contradicting evidence]
3. [hyperspecific query to check alternative explanation]`;

        try {
          const response = await ollamaService.generateStream(devilPrompt, 'Be RUTHLESSLY skeptical. Challenge every assumption.', { model: reflectionModel, onChunk, signal });
          const angles = extractResearchAngles(response);
          allAngles.push(...angles);
          onChunk?.(`  [Devil's Advocate] Found ${angles.length} angles\n`);
        } catch (err) {
          if (signal?.aborted) throw err;
          onChunk?.(`  [Devil's Advocate] Failed: ${err}\n`);
        }
      }

      // ── Perspective 2: Depth Auditor ──
      onChunk?.(`\n[Reflection: Depth Auditor] Demanding specifics...\n`);
      if (!signal?.aborted) {
        const depthPrompt = `You are the DEPTH AUDITOR. Your job is to ensure every claim has SPECIFIC, VERIFIABLE evidence — not vague assertions.

${sharedContext}

YOUR AUDIT CRITERIA — FAIL anything that lacks specifics:
1. NAMED SOURCES: Every competitor must have a real company name + URL. Not "various competitors".
2. EXACT NUMBERS: Market size must be "$X billion", not "large market". Growth must be "X%", not "growing".
3. VERBATIM QUOTES: Must be real customer words from real platforms. Not "customers say they want...".
4. SPECIFIC PRICES: "$29.99/month" not "competitively priced".
5. NAMED COMMUNITIES: "r/SkincareAddiction" not "skincare forums".
6. DATED EVIDENCE: "2024 study by [org]" not "studies show".
7. PURCHASE JOURNEY: Exact search terms people use, exact review sites they visit.
8. EMOTIONAL SPECIFICS: "Shame when spouse notices aging" not "emotional concerns".

For EACH gap in specificity, propose a query to get the real data:
GOOD: "amazon [product category] best seller reviews 2024 2025"
GOOD: "[competitor] trustpilot reviews 1 star complaints"
GOOD: "reddit [subreddit] 'how much' OR 'is it worth' [product type]"
GOOD: "meta ad library [competitor] active ads"

SPECIFICITY FAILURES:
[list each vague claim that needs real evidence]

RESEARCH TO GET SPECIFICS:
1. [query targeting a specific data gap]
2. [query targeting a specific data gap]
3. [query targeting a specific data gap]`;

        try {
          const response = await ollamaService.generateStream(depthPrompt, 'Demand specific evidence. Reject vague claims.', { model: reflectionModel, onChunk, signal });
          const angles = extractResearchAngles(response);
          allAngles.push(...angles);
          onChunk?.(`  [Depth Auditor] Found ${angles.length} angles\n`);
        } catch (err) {
          if (signal?.aborted) throw err;
          onChunk?.(`  [Depth Auditor] Failed: ${err}\n`);
        }
      }

      // ── Perspective 3: Coverage Checker ──
      onChunk?.(`\n[Reflection: Coverage Checker] Counting data points per dimension...\n`);
      if (!signal?.aborted) {
        const coveragePrompt = `You are the COVERAGE CHECKER. Your job is to count ACTUAL DATA POINTS per research dimension and find BLIND SPOTS.

${sharedContext}

REQUIRED MINIMUMS (must have 5+ specific data points each):
1. Market size/trends — numbers, growth rates, TAM data
2. Competitor analysis — named brands with positioning, pricing, ad hooks
3. Customer objections — real complaints from reviews/forums
4. Emerging behaviors — new approaches, adoption shifts
5. Regional differences — geographic demand patterns
6. Pricing strategies — specific price points, value perception
7. Channel effectiveness — which platforms convert
8. Positioning gaps — what NO competitor can claim
9. Psychological triggers — turning points, fears, identity
10. Media consumption — where audience spends time
11. Purchase journey — exact decision path, search terms, review sites

For EACH dimension, count actual data points in our research:
[Dimension]: [X] data points — ${'{'}PASS if 5+, FAIL if <5}

Then identify GEOGRAPHIC and TEMPORAL blind spots:
- Are findings US-only? Europe? Global?
- Are findings current (2024-2025) or outdated?
- Are we missing a demographic segment?

BLIND SPOTS:
[list gaps not covered by dimensional analysis]

RESEARCH TO FILL GAPS:
1. [query for worst-scoring dimension]
2. [query for geographic blind spot]
3. [query for temporal blind spot]

VISUAL_SCOUT: [competitor URLs to screenshot, if visual analysis lacking]
AD_SCOUT: [ad library / marketing URLs to screenshot, if ad creative analysis is missing]`;

        try {
          const response = await ollamaService.generateStream(coveragePrompt, 'Count data points. Find blind spots.', { model: reflectionModel, onChunk, signal });
          const angles = extractResearchAngles(response);
          allAngles.push(...angles);
          onChunk?.(`  [Coverage Checker] Found ${angles.length} angles\n`);

          // Check if coverage checker requested visual scouting (VISUAL_SCOUT or AD_SCOUT)
          const scoutDirective = response.includes('VISUAL_SCOUT:') || response.includes('AD_SCOUT:');
          if (scoutDirective && !(state as any)._visualFindings) {
            // Collect URLs from both VISUAL_SCOUT and AD_SCOUT directives
            const allScoutUrls: string[] = [];
            for (const directive of ['VISUAL_SCOUT', 'AD_SCOUT']) {
              const match = response.match(new RegExp(`${directive}:\\s*(.+)`, 'i'));
              if (match) {
                const urls = match[1]
                  .split(/[,\s]+/)
                  .map(u => u.trim().replace(/[\[\]]/g, ''))
                  .filter(u => u.startsWith('http'));
                allScoutUrls.push(...urls);
              }
            }
            const dedupedUrls = [...new Set(allScoutUrls)];
            if (dedupedUrls.length > 0) {
              const hasAdScout = response.includes('AD_SCOUT:');
              const label = hasAdScout ? 'Ad Scout' : 'Visual Scout';
              onChunk?.(`\n[${label}] Coverage Checker requested visual analysis of ${dedupedUrls.length} URLs\n`);
              try {
                const { visualScoutAgent } = await import('./visualScoutAgent');
                const { visualProgressStore } = await import('./visualProgressStore');
                const visualFindings = await visualScoutAgent.analyzeCompetitorVisuals(
                  dedupedUrls.slice(0, 5),
                  state.campaign,
                  onChunk ? (msg: string | undefined) => onChunk(msg || '') : undefined,
                  signal,
                  // Rich progress events → text chunks + visual store
                  (event) => {
                    if (event.type === 'screenshot_batch_start') { visualProgressStore.startBatch(event.urls); }
                    if (event.type === 'screenshot_start') { onChunk?.(`[${label}] Capturing ${event.index + 1}/${event.total}: ${event.url}\n`); visualProgressStore.setCapturing(event.url); }
                    if (event.type === 'screenshot_done') { onChunk?.(`[${label}] ${event.error ? 'Failed' : 'Captured'} ${event.index + 1}/${event.total}\n`); visualProgressStore.setCaptured(event.url, event.thumbnail, event.error); }
                    if (event.type === 'analysis_start') { onChunk?.(`[${label}] Analyzing visual ${event.index + 1}/${event.total}...\n`); visualProgressStore.setAnalyzing(event.url); }
                    if (event.type === 'analysis_done' && event.findings) { onChunk?.(`[${label}] → tone=${event.findings.tone || '?'}, colors=${(event.findings.colors || []).slice(0, 2).join(', ') || '?'}\n`); visualProgressStore.setAnalyzed(event.url, event.findings); }
                    if (event.type === 'synthesis_start') { onChunk?.(`[${label}] Synthesizing ${event.count} sites...\n`); visualProgressStore.setSynthesisStatus('running'); }
                    if (event.type === 'synthesis_done') { visualProgressStore.setSynthesisStatus('done', event.patterns, event.gaps); }
                  }
                );
                (state as any)._visualFindings = visualFindings;
                onChunk?.(`[${label}] Visual analysis complete — ${visualFindings.totalAnalyzed} sites analyzed\n`);
              } catch (err) {
                onChunk?.(`[${label}] Visual analysis failed: ${err}\n`);
              }
            }
          }
        } catch (err) {
          if (signal?.aborted) throw err;
          onChunk?.(`  [Coverage Checker] Failed: ${err}\n`);
        }
      }

      // Dedup angles across all 3 perspectives
      const seen = new Set<string>();
      const deduped = allAngles.filter(angle => {
        const key = angle.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      onChunk?.(`\n[Reflection] 3 perspectives found ${allAngles.length} total angles → ${deduped.length} after dedup\n`);
      return deduped.slice(0, 8);
    } catch (error) {
      console.error('Reflection agent error:', error);
      return [];
    }
  },
};

/** Extract numbered research angles from reflection agent output */
function extractResearchAngles(response: string): string[] {
  const anglesMatch = response.match(/RESEARCH\s+TO\s+(?:VERIFY|GET\s+SPECIFICS|FILL\s+GAPS):\s*([\s\S]*?)(?=\n\n[A-Z]|\n*$)/i)
    || response.match(/AGGRESSIVE\s+NEW\s+RESEARCH\s+ANGLES:\s*([\s\S]*?)$/i)
    || response.match(/(?:^|\n)\d+\.\s+["']?[a-z]/im);

  if (!anglesMatch) {
    // Fallback: try to find any numbered list items that look like queries
    const lines = response.split('\n');
    return lines
      .filter(line => /^\s*\d+[\.\)]\s+/.test(line))
      .map(line => line.replace(/^\s*\d+[\.\)]\s+/, '').trim())
      .filter(line => line.length > 15 && line.length < 200 && !line.startsWith('What') && !line.startsWith('Where') && !line.startsWith('Do '))
      .slice(0, 4);
  }

  const section = anglesMatch[1] || anglesMatch[0];
  return section
    .split('\n')
    .filter((line: string) => /^\s*\d+[\.\)]\s+/.test(line))
    .map((line: string) => line.replace(/^\s*\d+[\.\)]\s+/, '').trim())
    .filter((angle: string) => angle.length > 5 && !angle.startsWith('['))
    .slice(0, 4);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function extractSources(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urls = text.match(urlRegex) || [];
  return [...new Set(urls)].slice(0, 10);
}

/**
 * Quality filter — reject obvious noise but DON'T require specific platform mentions.
 * Previous version was too aggressive — rejected valid queries like
 * "collagen supplement absorption mechanisms clinical studies" because
 * it didn't contain reddit/trustpilot/etc. Now we only reject known-bad patterns.
 */
function isQualityQuery(query: string): boolean {
  const lower = query.toLowerCase();
  // REJECT: Aesthetic trend-chasing (no business signal)
  const badPatterns = [/aesthetic\s+trend/i, /clean\s+girl/i, /viral\s+trend/i, /tiktok.*aesthetic/i, /trending.*hashtag/i];
  if (badPatterns.some(p => p.test(query))) return false;
  // REJECT: Celebrity, unrelated noise
  if (/celebrity|kardashian|elon/.test(lower)) return false;
  // REJECT: too short to be meaningful
  if (lower.split(/\s+/).length < 3) return false;
  // ACCEPT: anything that isn't explicitly rejected — let the research run
  return true;
}

interface OrchestratorDecision {
  query: string;
  context: string;
  depth: 'quick' | 'thorough';
  shouldContinue: boolean;
  question?: string;
  questionContext?: string;
  visualScoutUrls?: string[]; // URLs for visual analysis via minicpm-v
}

function parseOrchestratorDecision(decision: string): OrchestratorDecision[] {
  const topics: OrchestratorDecision[] = [];

  // Check for QUESTION
  const questionMatch = decision.match(/QUESTION:\s*(.+?)(?=\n|$)/i);
  if (questionMatch) {
    return [{
      query: '',
      context: '',
      depth: 'quick',
      shouldContinue: true,
      question: questionMatch[1].trim(),
      questionContext: 'Orchestrator needs clarification',
    }];
  }

  // Check for COMPLETE
  if (decision.toLowerCase().includes('complete') && decision.toLowerCase().includes('true')) {
    return [{ query: '', context: '', depth: 'quick', shouldContinue: false }];
  }

  const lines = decision.split('\n');

  // ── Strategy 1: Explicit RESEARCH: / INVESTIGATE: prefix ──
  // Now supports "RESEARCH: [query] — fills [gap]" format for gap-aware queries
  for (const line of lines) {
    if (line.includes('RESEARCH:') || line.includes('INVESTIGATE:')) {
      const raw = line.replace(/.*(?:RESEARCH|INVESTIGATE):\s*/i, '').trim();
      // Split on " — fills " or " - fills " to extract gap context
      const gapSplit = raw.split(/\s*[—–-]+\s*fills?\s*/i);
      const topic = gapSplit[0]?.trim();
      const gapContext = gapSplit[1]?.trim();
      if (topic && topic.length >= 10 && isViableQuery(topic)) {
        topics.push({
          query: topic,
          context: gapContext || 'Marketing research for campaign optimization',
          depth: 'thorough',
          shouldContinue: true,
        });
      }
    }
  }

  // ── Strategy 2: Numbered lists (1. ... / 1) ... ) ──
  if (topics.length === 0) {
    for (const line of lines) {
      const numberedMatch = line.match(/^\s*\d+[\.\)]\s+(.+)/);
      if (numberedMatch) {
        let topic = numberedMatch[1]
          .replace(/^["']|["']$/g, '')  // strip wrapping quotes
          .replace(/\s*\(.*?\)\s*$/, '') // strip trailing parenthetical
          .trim();
        // Skip lines that are clearly explanations, not queries
        if (topic.length >= 10 && topic.length <= 200 && !topic.startsWith('This ') && !topic.startsWith('The ') && !topic.startsWith('We ') && isViableQuery(topic)) {
          topics.push({
            query: topic,
            context: 'Marketing research for campaign optimization',
            depth: 'thorough',
            shouldContinue: true,
          });
        }
      }
    }
  }

  // ── Strategy 3: Bullet points (- ... / • ... / * ...) ──
  if (topics.length === 0) {
    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[-•*]\s+(.+)/);
      if (bulletMatch) {
        let topic = bulletMatch[1]
          .replace(/^["']|["']$/g, '')
          .replace(/\s*\(.*?\)\s*$/, '')
          .trim();
        if (topic.length >= 10 && topic.length <= 200 && !topic.startsWith('This ') && !topic.startsWith('The ') && !topic.startsWith('We ') && isViableQuery(topic)) {
          topics.push({
            query: topic,
            context: 'Marketing research for campaign optimization',
            depth: 'thorough',
            shouldContinue: true,
          });
        }
      }
    }
  }

  // ── Strategy 4: Quoted strings anywhere in the text ──
  if (topics.length === 0) {
    const quotedMatches = decision.match(/"([^"]{15,150})"/g);
    if (quotedMatches) {
      for (const match of quotedMatches.slice(0, 5)) {
        const topic = match.replace(/^"|"$/g, '').trim();
        if (isViableQuery(topic)) {
          topics.push({
            query: topic,
            context: 'Marketing research for campaign optimization',
            depth: 'thorough',
            shouldContinue: true,
          });
        }
      }
    }
  }

  // Parse VISUAL_SCOUT: directive for screenshot analysis
  const visualLines = lines.filter(l => l.includes('VISUAL_SCOUT:'));
  if (visualLines.length > 0) {
    const urls: string[] = [];
    for (const vl of visualLines) {
      const urlPart = vl.replace(/.*VISUAL_SCOUT:\s*/i, '').trim();
      const extracted = urlPart
        .split(/[,\s]+/)
        .map(u => u.trim().replace(/[\[\]]/g, ''))
        .filter(u => u.startsWith('http'));
      urls.push(...extracted);
    }
    if (urls.length > 0) {
      if (topics.length > 0) {
        topics[0].visualScoutUrls = urls;
      } else {
        topics.push({
          query: '',
          context: 'Visual analysis of competitor pages',
          depth: 'thorough',
          shouldContinue: true,
          visualScoutUrls: urls,
        });
      }
    }
  }

  // Parse AD_SCOUT: directive for ad creative / marketing page screenshot analysis
  const adScoutLines = lines.filter(l => l.includes('AD_SCOUT:'));
  if (adScoutLines.length > 0) {
    const adUrls: string[] = [];
    for (const al of adScoutLines) {
      const urlPart = al.replace(/.*AD_SCOUT:\s*/i, '').trim();
      const extracted = urlPart
        .split(/[,\s]+/)
        .map(u => u.trim().replace(/[\[\]]/g, ''))
        .filter(u => u.startsWith('http'));
      adUrls.push(...extracted);
    }
    if (adUrls.length > 0) {
      // Merge into existing visualScoutUrls (same pipeline, different source directive)
      if (topics.length > 0) {
        const existing = topics[0].visualScoutUrls || [];
        topics[0].visualScoutUrls = [...existing, ...adUrls];
      } else {
        topics.push({
          query: '',
          context: 'Visual analysis of ad creatives and marketing pages',
          depth: 'thorough',
          shouldContinue: true,
          visualScoutUrls: adUrls,
        });
      }
    }
  }

  // No parseable queries found — end research
  if (topics.length === 0) {
    topics.push({
      query: '',
      context: '',
      depth: 'quick',
      shouldContinue: false,
    });
  }

  return topics;
}

/**
 * Check if a new query is too similar to one we already ran.
 * Uses token overlap (Jaccard similarity) on lowercased words.
 * Threshold: 0.6 (60%+ word overlap = too similar, skip it).
 */
function isDuplicateQuery(newQuery: string, existingQueries: string[]): boolean {
  const newTokens = new Set(newQuery.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2));
  if (newTokens.size === 0) return false;

  for (const existing of existingQueries) {
    const existTokens = new Set(existing.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2));
    if (existTokens.size === 0) continue;

    // Jaccard similarity: |intersection| / |union|
    let intersection = 0;
    for (const t of newTokens) {
      if (existTokens.has(t)) intersection++;
    }
    const union = new Set([...newTokens, ...existTokens]).size;
    const similarity = intersection / union;
    if (similarity >= 0.6) return true;
  }
  return false;
}

/** Lightweight query viability check — rejects obviously bad queries but doesn't require specific platforms */
function isViableQuery(topic: string): boolean {
  // REJECT: truncated queries ending in comma/paren
  if (/[,)]$/.test(topic) && !/\bOR\b|\bAND\b/.test(topic)) return false;
  // REJECT: too vague
  if (/^trends?\s|^insights?\s|^social media sentiment$|^general interest$|^what people$/i.test(topic)) return false;
  // REJECT: just a single word
  if (topic.split(/\s+/).length < 3) return false;
  return true;
}

function buildEvaluationPrompt(
  state: OrchestratorState,
  results: ResearchResult[],
  researchMode: 'interactive' | 'autonomous' = 'autonomous',
  knowledge?: KnowledgeState
): string {
  const interactiveNote = researchMode === 'interactive'
    ? `\n\nYou can ask the user for clarification:
Format: QUESTION: [your clarifying question]`
    : '';

  const reflectionNote = state.reflectionSuggestedTopics?.length
    ? `\n\nREFLECTION AGENT FLAGGED THESE GAPS (high-priority):
${state.reflectionSuggestedTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}
Consider these angles for next research deployment.`
    : '';

  // Build a structured "what we know" section from knowledge state
  const knowledgeSection = knowledge?.summary
    ? `\n${'─'.repeat(50)}
WHAT WE KNOW SO FAR (structured facts extracted from ${results.length} queries):
${knowledge.summary}
${'─'.repeat(50)}

WHAT'S STILL MISSING? Look at the gaps:
${!knowledge.competitors.length ? '- NO named competitors found yet — CRITICAL gap' : ''}
${!knowledge.pricePoints.length ? '- NO specific price points found — need pricing data' : ''}
${!knowledge.verbatimQuotes.length ? '- NO verbatim customer quotes — need real language' : ''}
${!knowledge.objections.length ? '- NO purchase objections identified — need friction points' : ''}
${!knowledge.turningPoints.length ? '- NO turning points found — need trigger moments' : ''}
${!knowledge.failedSolutions.length ? '- NO failed solutions mapped — need "tried X, didn\'t work"' : ''}
${!knowledge.communities.length ? '- NO audience communities found — where do they talk?' : ''}
`.replace(/\n{3,}/g, '\n\n')
    : '';

  const limits = getResearchLimits();

  return `You are the RESEARCH ORCHESTRATOR for a desire-driven ad campaign. You decide what to research next.

YOUR MANDATE: This research must be DEEPER and MORE EXHAUSTIVE than anything a human researcher or any AI could produce. You are building the most comprehensive market intelligence document ever created for this brand.

ANTI-COMPLACENCY RULES (CRITICAL — fight your tendency to stop early):
- NEVER use the words "sufficient", "adequate", "good enough", or "comprehensive enough"
- You need ${limits.minSources}+ unique sources before you can even CONSIDER stopping
- You need 15+ VERBATIM quotes from real customers (Reddit, Trustpilot, Amazon)
- You need 8+ NAMED competitors with specific positioning data
- COMPLETE: true is ONLY allowed when ALL 16 dimensions have 5+ SPECIFIC data points each
- If you're tempted to say "research is complete" — you're almost certainly wrong. Keep going.
- Your SATISFICING BIAS is your biggest enemy. Fight it. The user wants 10x more depth than you think is "enough".

FRAMEWORK: People don't buy products — they buy fulfillment of desires. We need:
- TURNING POINTS (when pain becomes unbearable — the exact moment)
- VERBATIM LANGUAGE (how real people talk about this — NOT brand speak)
- ROOT CAUSES (why nothing else worked for them)
- AHA INSIGHTS (surprising truths that change the whole strategy)
- PURCHASE JOURNEY (exact search terms, review sites, comparison criteria)
- EMOTIONAL LANDSCAPE (shame, hope, identity, social pressure)

Campaign:
- Brand: ${state.campaign.brand}
- Product: ${state.campaign.productDescription}
- Features: ${Array.isArray(state.campaign.productFeatures) ? state.campaign.productFeatures.join(', ') : (state.campaign.productFeatures || 'Not specified')}
- Target: ${state.campaign.targetAudience}
- Goal: ${state.campaign.marketingGoal}
${buildOrchestratorBrandContext(state.campaign)}${state.userProvidedContext ? `\nUser Context:\n${Object.entries(state.userProvidedContext).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}

Research Goals:
${state.researchGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}
${knowledgeSection}
Queries Completed (${results.length}):
${results.map((r) => {
  const covered = Object.values(r.coverage_graph).filter(Boolean).length;
  const total = Object.keys(r.coverage_graph).length;
  return `- "${r.query}" (${covered}/${total} dims)`;
}).join('\n')}

16 Dimensions (ALL need 5+ SPECIFIC data points with evidence):
1. Market size & trends (exact numbers, growth rates, TAM, market reports)
2. Competitor analysis (8+ named competitors, their ads, hooks, visuals, pricing)
3. Customer sentiment (BALANCED — what they love AND hate, from Reddit/Trustpilot/Amazon reviews)
4. Emerging behaviors (new approaches, adoption patterns, category disruptors)
5. Regional differences (where demand is strongest, geographic pricing)
6. Pricing strategies (specific price points, bundles, value perception, willingness-to-pay)
7. Channel effectiveness (which platforms work for ads, organic vs paid performance)
8. Brand positioning gaps (what NO competitor can claim — structural limitations)
9. Psychological triggers (turning points, fears, identity, shame/hope)
10. Media consumption (where audience spends time, which creators, which platforms)
11. Amazon research (40+ quotes from reviews, Q&A patterns, star distribution drivers)
12. Reddit research (50+ quotes, subreddit language, holy grail products, failed solutions)
13. Identity markers (values, visual markers, language patterns, influencers, tribal signals)
14. Ad style analysis (UGC vs professional, emotional vs logical, bright vs dark side)
15. Market sophistication (level 1-5 with evidence, positioning strategy recommendation)
16. Visual competitive analysis (competitor visual styles, layout patterns, color palettes)

${'═'.repeat(50)}
9-STEP COMPREHENSIVE RESEARCH METHODOLOGY
${'═'.repeat(50)}
You MUST systematically cover ALL 9 steps. This is a 25+ page research document, not a quick summary.

${METHODOLOGY_STEPS.map((s, i) => `STEP ${i + 1}: ${s.name.toUpperCase()}
${s.description}
Key goals: ${s.goals.slice(0, 4).join(' | ')}
Query patterns: ${s.queryTemplates.slice(0, 3).join(' | ')}`).join('\n\n')}

CRITICAL PLATFORM-SPECIFIC SEARCHES:
- AMAZON: "site:amazon.com {product} reviews" | "amazon {product} 1 star reviews complaints" | "amazon {product} switched from"
- REDDIT: "site:reddit.com {product}" | "reddit r/{subreddit} honest review" | "site:reddit.com {category} holy grail"
- SOCIAL: "tiktok {product} viral" | "facebook ad library {category}" | "{category} instagram ads best performing"
- IDENTITY: "{audience} influencers trust" | "{audience} language slang how they talk" | "{audience} tribe signals"
- AD STYLE: "{category} best performing ads 2025" | "UGC vs professional ads {category}" | "{category} ad creative what converts"

${(() => {
  // Dynamic methodology progress tracking
  const covGraph = evaluateCoverage(results);
  const coveredDims = Object.entries(covGraph).filter(([, v]) => v).map(([k]) => k);
  return getMethodologySummary(
    coveredDims,
    results.length,
    knowledge?.verbatimQuotes?.length || 0,
    knowledge?.competitors?.length || 0
  );
})()}

SOURCE LINK REQUIREMENT: Every finding must trace back to a specific source (URL, subreddit, Amazon listing, etc.)
${'═'.repeat(50)}
${reflectionNote}

YOUR DECISION PROCESS:
1. COUNT the specific data points per dimension from WHAT WE KNOW above
2. ANY dimension with <5 data points = CRITICAL GAP that needs filling
3. Check which of the 9 METHODOLOGY STEPS have been covered — uncovered steps are HIGH PRIORITY
4. For each gap, propose a HYPERSPECIFIC query tied to a methodology step
5. Each query MUST explain what GAP it fills: "RESEARCH: [query] — fills [gap name] (Step N)"
6. STOP CRITERIA: ALL 16 dimensions have 5+ data points AND ${limits.minSources}+ sources AND 40+ verbatim quotes AND 10+ named competitors AND all 9 methodology steps addressed

If gaps remain, list 3-5 HYPERSPECIFIC queries with gap + step explanations:
RESEARCH: [specific query] — fills [which gap] (Step N: name)
RESEARCH: [specific query] — fills [which gap] (Step N: name)

REJECT: trend-chasing, vague sentiment queries, celebrity gossip, generic trends
GOOD: "reddit r/[subreddit] [product] real reviews 2024" | "amazon [competitor] 1 star reviews complaints" | "[competitor] meta ad library ads 2025" | "[product type] trustpilot reviews frustrated" | "who switched from [A] to [B] why reddit"

VISUAL_SCOUT: [competitor URLs to screenshot] — when you've found landing pages worth analyzing visually
AD_SCOUT: [ad library or visual marketing URLs to screenshot] — for analyzing competitor ad creatives, Facebook Ad Library pages, Google Ads previews, landing pages, and visual marketing sites

If need user input: QUESTION: [question]
ONLY if ALL 16 dimensions have 5+ specific data points AND ${limits.minSources}+ unique sources AND all 9 methodology steps addressed: COMPLETE: true${interactiveNote}`;
}

function buildCoverageGraph(response: string): CoverageGraph {
  const defaultGraph: CoverageGraph = {
    market_size_trends: false,
    competitor_analysis: false,
    customer_objections: false,
    emerging_trends: false,
    regional_differences: false,
    pricing_strategies: false,
    channel_effectiveness: false,
    brand_positioning_gaps: false,
    psychological_triggers: false,
    media_consumption_patterns: false,
    visual_competitive_analysis: false,
    amazon_research: false,
    reddit_research: false,
    identity_markers: false,
    ad_style_analysis: false,
    market_sophistication: false,
  };

  const lower = response.toLowerCase();

  // First try structured COVERAGE: section
  const coverageMatch = response.match(/COVERAGE:\s*([^\n]+(?:\n[^\n]*)*)/i);
  if (coverageMatch) {
    const coverageText = coverageMatch[1];
    const dimensionMap: Record<string, keyof CoverageGraph> = {
      'market size': 'market_size_trends',
      'competitor': 'competitor_analysis',
      'objection': 'customer_objections',
      'trend': 'emerging_trends',
      'regional': 'regional_differences',
      'pricing': 'pricing_strategies',
      'channel': 'channel_effectiveness',
      'positioning': 'brand_positioning_gaps',
      'psychological': 'psychological_triggers',
      'media': 'media_consumption_patterns',
      'amazon': 'amazon_research',
      'reddit': 'reddit_research',
      'identity': 'identity_markers',
      'ad style': 'ad_style_analysis',
      'sophistication': 'market_sophistication',
      'visual': 'visual_competitive_analysis',
    };

    Object.entries(dimensionMap).forEach(([keyword, dimension]) => {
      const regex = new RegExp(`${keyword}[^,]*covered`, 'i');
      if (regex.test(coverageText)) {
        defaultGraph[dimension] = true;
      }
    });
  }

  // Fallback: scan full text for dimension keywords
  // Require 3+ different keyword matches AND substantial surrounding content — brief mentions don't count
  const heuristicMap: Array<{ keywords: string[]; dimension: keyof CoverageGraph; minMatches: number }> = [
    { keywords: ['market size', 'tam ', 'total addressable', 'market worth', 'billion', 'million dollar', 'market growth', 'market value'], dimension: 'market_size_trends', minMatches: 4 },
    { keywords: ['competitor', 'competing brand', 'rival', 'vs ', 'compared to', 'market leader', 'alternative brand'], dimension: 'competitor_analysis', minMatches: 4 },
    { keywords: ['objection', 'skeptic', 'doubt', 'concern about', 'hesitat', 'barrier to purchase', 'why they don\'t buy', 'reluctan'], dimension: 'customer_objections', minMatches: 4 },
    { keywords: ['emerging trend', 'growing trend', 'new trend', 'trending', 'rise of', 'shift toward', 'increasingly'], dimension: 'emerging_trends', minMatches: 4 },
    { keywords: ['region', 'country', 'geographic', 'local market', 'europe', 'asia', 'north america', 'urban', 'rural'], dimension: 'regional_differences', minMatches: 4 },
    { keywords: ['pricing', 'price point', 'price range', 'cost of', 'premium pric', 'affordable', 'budget', 'value for money', 'willingness to pay'], dimension: 'pricing_strategies', minMatches: 4 },
    { keywords: ['channel', 'distribution', 'retail', 'e-commerce', 'online store', 'marketplace', 'direct-to-consumer', 'dtc', 'wholesale'], dimension: 'channel_effectiveness', minMatches: 4 },
    { keywords: ['positioning', 'brand position', 'unique selling', 'usp', 'differentiat', 'brand identity', 'brand perception', 'gap in market'], dimension: 'brand_positioning_gaps', minMatches: 4 },
    { keywords: ['psycholog', 'emotional', 'trigger', 'fear of', 'desire for', 'motivation', 'cognitive', 'bias', 'persuasion', 'social proof'], dimension: 'psychological_triggers', minMatches: 4 },
    { keywords: ['media consumption', 'social media', 'instagram', 'tiktok', 'youtube', 'podcast', 'influencer', 'content consumption', 'advertising channel'], dimension: 'media_consumption_patterns', minMatches: 4 },
    { keywords: ['visual', 'screenshot', 'layout', 'color palette', 'visual tone', 'design style', 'visual approach', 'cta design', 'visual gap'], dimension: 'visual_competitive_analysis', minMatches: 4 },
    // Methodology-driven dimensions
    { keywords: ['amazon', 'amazon review', 'amazon.com', '1-star', '5-star', 'amazon q&a', 'verified purchase', 'amazon rating', 'amazon best seller'], dimension: 'amazon_research', minMatches: 3 },
    { keywords: ['reddit', 'subreddit', 'r/', 'redditor', 'upvote', 'reddit thread', 'reddit post', 'holy grail', 'reddit recommendation'], dimension: 'reddit_research', minMatches: 3 },
    { keywords: ['identity', 'tribe', 'tribal', 'belonging', 'identity marker', 'status signal', 'values', 'cultural', 'aspirational', 'influencer they follow', 'community identity'], dimension: 'identity_markers', minMatches: 3 },
    { keywords: ['ad style', 'ugc', 'user generated', 'professional ad', 'hook pattern', 'ad format', 'video ad', 'creative approach', 'ad creative', 'bright side', 'dark side', 'emotional appeal', 'logical appeal'], dimension: 'ad_style_analysis', minMatches: 3 },
    { keywords: ['sophistication level', 'market sophistication', 'level 1', 'level 2', 'level 3', 'level 4', 'level 5', 'saturated market', 'disillusioned', 'skeptical market', 'new mechanism', 'depositioning'], dimension: 'market_sophistication', minMatches: 3 },
  ];

  heuristicMap.forEach(({ keywords, dimension, minMatches }) => {
    if (!defaultGraph[dimension]) {
      const matches = keywords.filter((kw) => lower.includes(kw));
      // Require 3+ keyword matches AND at least 200 chars of content around matches
      // This prevents superficial mentions from marking a dimension as covered
      if (matches.length >= minMatches) {
        let contentChars = 0;
        for (const kw of matches) {
          const idx = lower.indexOf(kw);
          if (idx >= 0) {
            // Count chars in a 300-char window around each match
            contentChars += Math.min(lower.slice(Math.max(0, idx - 50), idx + 250).length, 300);
          }
        }
        if (contentChars >= 300) {
          defaultGraph[dimension] = true;
        }
      }
    }
  });

  return defaultGraph;
}

function evaluateCoverage(results: ResearchResult[]): CoverageGraph {
  const merged: CoverageGraph = {
    market_size_trends: false,
    competitor_analysis: false,
    customer_objections: false,
    emerging_trends: false,
    regional_differences: false,
    pricing_strategies: false,
    channel_effectiveness: false,
    brand_positioning_gaps: false,
    psychological_triggers: false,
    media_consumption_patterns: false,
    visual_competitive_analysis: false,
    amazon_research: false,
    reddit_research: false,
    identity_markers: false,
    ad_style_analysis: false,
    market_sophistication: false,
  };

  results.forEach((result) => {
    Object.keys(merged).forEach((key) => {
      if (result.coverage_graph[key]) {
        merged[key as keyof CoverageGraph] = true;
      }
    });
  });

  return merged;
}
