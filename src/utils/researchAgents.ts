import { ollamaService } from './ollama';
import { wayfarerService } from './wayfarer';
// Framework constants available for future prompt enrichment
// import { DESIRE_INTENSITY_GUIDE, FOUR_LAYER_RESEARCH } from './desireFramework';
import type { Campaign } from '../types';

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
// Compression — reduce raw page content to relevant facts
// ─────────────────────────────────────────────────────────────

async function compressPage(
  pageContent: string,
  pageTitle: string,
  pageUrl: string,
  researchQuery: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!pageContent || pageContent.length < 200) return '';

  // Truncate very long pages to fit model context window
  const truncated = pageContent.slice(0, 8000);

  const prompt = `Extract ONLY the facts relevant to "${researchQuery}" from this page.

Source: ${pageUrl}
Title: ${pageTitle}

Content:
${truncated}

Rules:
- Extract specific facts, numbers, quotes, claims relevant to the research query
- Ignore navigation, ads, boilerplate, cookie notices
- Keep source attribution (who said it, what study, what data)
- Maximum 300 words
- If nothing relevant, output exactly: NO_RELEVANT_CONTENT

RELEVANT FACTS:`;

  try {
    const compressed = await ollamaService.generateStream(
      prompt,
      'Extract relevant facts from web pages. Be concise and specific. Preserve numbers and quotes.',
      { model: 'lfm-2.5:q4_K_M', signal }
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
): Promise<string> {
  // Filter out failed pages
  const validPages = pages.filter(
    (p) => p.source !== 'failed' && p.content && p.content.length >= 200
  );

  if (validPages.length === 0) return '';

  onChunk?.(`Compressing ${validPages.length} pages into key findings...\n`);

  // Compress in batches of 3 (don't overwhelm Ollama)
  const compressed: string[] = [];
  for (let i = 0; i < validPages.length; i += 3) {
    const batch = validPages.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map((p) => compressPage(p.content, p.title, p.url, researchQuery, signal))
    );
    compressed.push(...batchResults.filter(Boolean));
    onChunk?.(`  Compressed ${Math.min(i + 3, validPages.length)}/${validPages.length} pages\n`);
  }

  return compressed.join('\n\n');
}

// ─────────────────────────────────────────────────────────────
// Researcher Agent — web search + compress + synthesize
// ─────────────────────────────────────────────────────────────

export const researcherAgent = {
  async research(query: ResearchQuery, onChunk?: (chunk: string) => void, signal?: AbortSignal): Promise<ResearchResult> {
    try {
      onChunk?.(`Searching: "${query.topic}"...\n`);

      // Step 1: Fetch full page content via Wayfarer
      const wayfarerResult = await wayfarerService.research(query.topic, 10);
      const meta = wayfarerResult.meta;
      onChunk?.(`Fetched ${meta.success}/${meta.total} pages (${meta.elapsed}s)\n`);

      // Step 2: Compress each page to relevant facts
      let compressedContent: string;

      if (meta.success > 0) {
        compressedContent = await compressFindings(wayfarerResult.pages, query.topic, onChunk, signal);
      } else {
        // Wayfarer returned nothing — fall back to LLM-only
        onChunk?.('No web results, using LLM knowledge only\n');
        compressedContent = '';
      }

      // Step 3: Synthesize compressed findings with LLM
      const hasWebData = compressedContent.length > 100;
      const synthesisPrompt = `You are a research analyst synthesizing ${hasWebData ? 'web research findings' : 'your knowledge'} for desire-driven marketing.

${hasWebData ? `Compressed Web Research Findings:\n${compressedContent}` : '(No web data available — use your training knowledge)'}

Topic: ${query.topic}
Context: ${query.context}
Depth: ${query.depth}

KEY FRAMEWORK: People don't buy products — they buy fulfillment of desires.
Look for: TURNING POINTS (when pain becomes unbearable), AMPLIFIED DESIRES (loved ones, identity, survival), ROOT CAUSES (why nothing else worked), and VERBATIM LANGUAGE (how real people actually talk about this problem).

Provide:
1. Key insights (2-3 paragraphs, cite specific sources when available)
2. VERBATIM QUOTES: Extract exact customer language — phrases, complaints, desires in THEIR words (not brand speak)
3. Specific evidence, numbers, and data points
4. AHA INSIGHTS: Anything surprising or counterintuitive

Identify which of these dimensions your research covers:
- Market size and trends
- Competitor analysis (including their advertising)
- Customer objections (real complaints, not hypothetical)
- Emerging trends
- Regional differences
- Pricing strategies
- Channel effectiveness
- Brand positioning gaps
- Psychological triggers (desires, fears, turning points)
- Media consumption patterns

Format:
FINDINGS: [Your synthesis]
VERBATIM: [Exact quotes from real people if found]
COVERAGE: [dimension: covered/uncovered, ...]
SOURCES: [URLs cited]`;

      const response = await ollamaService.generateStream(
        synthesisPrompt,
        'Synthesize research findings for marketing strategy. Be specific, cite sources. Identify which dimensions you covered.',
        {
          model: 'qwen3.5:9b', // Upgraded from lfm-2.5 — 1.2B too small for strategic synthesis
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
          { model: 'qwen3.5:9b', onChunk, signal }
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
    const maxIterations = state.campaign.maxResearchIterations || 3;
    const maxTimeMs = (state.campaign.maxResearchTimeMinutes || 10) * 60 * 1000;
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
        onProgressUpdate?.(`\nTime limit reached (${elapsedMin}min / ${state.campaign.maxResearchTimeMinutes || 10}min) — wrapping up research`);
        break;
      }

      iteration++;
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      onProgressUpdate?.(`\n[Orchestrator] Iteration ${iteration}/${maxIterations} — evaluating gaps... (${elapsedSec}s elapsed)`);

      // Build evaluation prompt (includes reflection suggestions if available)
      const evaluationPrompt = buildEvaluationPrompt(state, allResults, state.campaign.researchMode);

      try {
        // Buffer orchestrator decision — show a trimmed summary, not raw tokens
        let decisionBuffer = '';
        const decision = await ollamaService.generateStream(
          evaluationPrompt,
          'You decide what research is needed. Be specific about topics.',
          {
            model: 'glm-4.7-flash:q4_K_M',
            signal,
            onChunk: (c) => { decisionBuffer += c; },
          }
        );
        // Show first meaningful line of the decision
        const decisionPreview = decisionBuffer.split('\n').find(l => l.trim().length > 10)?.trim();
        if (decisionPreview) {
          onProgressUpdate?.(`  [Orchestrator] Decision: ${decisionPreview.slice(0, 120)}${decisionPreview.length > 120 ? '...' : ''}\n`);
        }

        const nextTopics = parseOrchestratorDecision(decision);

        // Handle questions in interactive mode
        if (nextTopics[0]?.question && state.campaign.researchMode === 'interactive' && onPauseForInput) {
          onProgressUpdate?.(`\n[Orchestrator] Pausing for user input...\n`);
          const userAnswer = await onPauseForInput({
            type: 'pause_for_input',
            question: nextTopics[0].question,
            context: nextTopics[0].questionContext || 'Clarification needed',
            suggestedAnswers: Array.isArray(state.campaign.productFeatures) ? state.campaign.productFeatures : undefined,
          });

          if (!state.userProvidedContext) state.userProvidedContext = {};
          state.userProvidedContext[nextTopics[0].question] = userAnswer;
          onProgressUpdate?.(`User provided: ${userAnswer}\n`);
          continue;
        }

        // Skip question topics in autonomous mode
        if (nextTopics[0]?.question && state.campaign.researchMode === 'autonomous') {
          onProgressUpdate?.(`[Orchestrator] Skipping clarification question in autonomous mode\n`);
          continue;
        }

        if (nextTopics.length === 0 || !nextTopics[0].shouldContinue) {
          onProgressUpdate?.('Orchestrator satisfied with coverage — research complete');
          break;
        }

        // Deploy researchers in parallel (up to 5)
        const researchTopics = nextTopics.slice(0, 5).filter((t) => t.query.length > 0);
        onProgressUpdate?.(`Deploying ${researchTopics.length} researcher agents...\n`);
        researchTopics.forEach((t) => {
          onProgressUpdate?.(`  [Orchestrator] → "${t.query}"\n`);
        });

        const parallelResults = await Promise.all(
          researchTopics.map((topic) => {
            // Buffer streaming output — only emit structured messages, not token-by-token LFM output
            let synthesisBuffer = '';
            let isSynthesizing = false;
            return researcherAgent.research(
              { topic: topic.query, context: topic.context, depth: topic.depth },
              (chunk) => {
                // Structured messages (search, fetch, compress) — emit directly
                if (chunk.includes('Searching:') || chunk.includes('Fetched') || chunk.includes('Compress') || chunk.includes('No web results') || chunk.includes('Web search failed') || chunk.includes('LLM knowledge')) {
                  if (isSynthesizing && synthesisBuffer.length > 0) {
                    // Flush synthesis buffer as summary
                    const summary = synthesisBuffer.slice(0, 200).replace(/\n/g, ' ').trim();
                    onProgressUpdate?.(`  [Researcher] Synthesis: ${summary}${synthesisBuffer.length > 200 ? '...' : ''}\n`);
                    synthesisBuffer = '';
                    isSynthesizing = false;
                  }
                  onProgressUpdate?.(`  [Researcher] ${chunk}`);
                } else {
                  // LFM synthesis tokens — buffer them
                  isSynthesizing = true;
                  synthesisBuffer += chunk;
                }
              },
              signal
            ).then((result) => {
              // After researcher finishes, emit a synthesis summary if we have buffered text
              if (synthesisBuffer.length > 0) {
                const summary = synthesisBuffer.slice(0, 300).replace(/\n/g, ' ').trim();
                onProgressUpdate?.(`  [Researcher] Synthesis: ${summary}${synthesisBuffer.length > 300 ? '...' : ''}\n`);
              }
              return result;
            });
          })
        );

        allResults.push(...parallelResults);

        // Evaluate coverage
        const coverageStatus = evaluateCoverage(allResults);
        const coveredDimensions = Object.values(coverageStatus).filter(Boolean).length;
        const totalDimensions = Object.keys(coverageStatus).length;
        const coveragePercentage = (coveredDimensions / totalDimensions) * 100;

        onProgressUpdate?.(
          `Coverage: ${coveragePercentage.toFixed(0)}% (${coveredDimensions}/${totalDimensions} dimensions, threshold: ${(state.coverageThreshold * 100).toFixed(0)}%)`
        );

        // Always run reflection agent after iteration 1+ (not just when below threshold)
        // This ensures we catch overconfidence even when coverage looks "complete"
        const MIN_ITERATIONS_BEFORE_EXIT = 3;
        if (iteration >= 1 && iteration < maxIterations) {
          onProgressUpdate?.(`\nRunning reflection agent (150% bar mode)...\n`);

          // Buffer reflection streaming — only emit structured messages
          let reflectionBuffer = '';
          const reflectionAngles = await reflectionAgent.evaluateGaps(
            state,
            allResults,
            (chunk) => {
              // Structured messages — emit directly
              if (chunk.includes('[150% BAR]') || chunk.includes('Overconfidence Risk') || chunk.includes('Found') || chunk.includes('new research angles')) {
                onProgressUpdate?.(`  [Reflection] ${chunk}`);
              } else {
                // LFM streaming tokens — buffer
                reflectionBuffer += chunk;
              }
            },
            signal
          );
          // Emit reflection summary
          if (reflectionBuffer.length > 0) {
            const summary = reflectionBuffer.slice(0, 400).replace(/\n/g, ' ').trim();
            onProgressUpdate?.(`  [Reflection] Analysis: ${summary}${reflectionBuffer.length > 400 ? '...' : ''}\n`);
          }

          if (reflectionAngles.length > 0) {
            state.reflectionSuggestedTopics = reflectionAngles.slice(0, 5);
            onProgressUpdate?.(
              `Reflection found ${reflectionAngles.length} gaps — feeding top 5 into next iteration`
            );
          }
        }

        // Require minimum iterations before allowing coverage exit
        // This forces at least 2 rounds of web research for depth
        if (iteration >= MIN_ITERATIONS_BEFORE_EXIT && coveragePercentage / 100 >= state.coverageThreshold) {
          onProgressUpdate?.('Coverage threshold reached — research complete');
          break;
        } else if (iteration < MIN_ITERATIONS_BEFORE_EXIT) {
          onProgressUpdate?.(`Iteration ${iteration} of minimum ${MIN_ITERATIONS_BEFORE_EXIT} — continuing research for depth`);
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

      onChunk?.(`[150% BAR] Covered: ${10 - gaps.length}/10. Missing: ${gaps.join(', ') || 'none declared'}\n`);

      const reflectionPrompt = `You are a RUTHLESS research strategist at 150% thoroughness bar. Your job is to find the AHA MOMENTS — not just fill gaps, but find INSIGHTS that change the entire strategy.

CORE PRINCIPLE: "All products are winners. Some are just easier because the desire is so intense that NOT taking action has unbearable consequences."

We need research deep enough to find:
- The TURNING POINT: The exact moment this audience can't tolerate the pain anymore
- VERBATIM LANGUAGE: How REAL PEOPLE (not brands) describe this problem
- The ROOT CAUSE nobody talks about: Why everything else failed
- The STRUCTURAL WEAKNESS: What competitors can NEVER claim

Campaign: ${state.campaign.brand} | ${state.campaign.productDescription} | Target: ${state.campaign.targetAudience}

RESEARCH COMPLETED (${completedResults.length} queries):
${completedResults.map((r, i) => `${i + 1}. "${r.query}" → ${Object.values(r.coverage_graph).filter(Boolean).length}/10 dimensions`).join('\n')}

MISSING DIMENSIONS:
${gaps.length > 0 ? gaps.map((g, i) => `[GAP ${i + 1}] ${g}`).join('\n') : 'NONE DECLARED — OVERCONFIDENCE RISK! Are we REALLY done?'}

DESIRE FRAMEWORK CHECKS:
1. Do we know the TURNING POINT for each sub-avatar? (The moment they MUST buy)
2. Do we have VERBATIM QUOTES from real customers? (Reddit posts, Trustpilot reviews, forum complaints)
3. Do we understand the ROOT CAUSE? (Why nothing else worked — the "aha" explanation)
4. Do we know the MARKET SOPHISTICATION level? (Virgin / Early / Crowded / Skeptical)
5. Have we mapped what they TRIED BEFORE and WHY it failed? (Specific products + specific reasons)

COMPETITIVE INTELLIGENCE CHECKS:
6. Did we check COMPETITOR ADS? (Meta Ad Library, "brand name ads", what hooks work?)
7. Did we find what competitors are TRAPPED by? (Can't change without breaking their brand)
8. Did we search for NEGATIVE REVIEWS of competitors? (Trustpilot 1-star, Amazon complaints)
9. What are ADJACENT NICHES doing that we can steal? (Different industry, same desire)
10. Did we find CONTRADICTIONS? (What brands claim vs what users actually say)

EMOTIONAL INTELLIGENCE CHECKS:
11. Do we know what their SPOUSE/FRIENDS think about this purchase?
12. What makes them feel STUPID for trying yet another product?
13. What would make them feel SMART for choosing this one?
14. Is there a STATUS signal in this purchase? (What does buying this SAY about them?)

The best research reveals: "Wait, customers don't actually care about X — they care about Y!"

Output HYPERSPECIFIC research queries (not vague):
BAD: "Research social media sentiment"
GOOD: "trustpilot reviews [competitor] [product] complaints"
GOOD: "reddit [specific subreddit] [product] reviews recommendations"
GOOD: "meta ad library [competitor] [niche] ads"
GOOD: "[niche] before and after results real"
GOOD: "why [previous solution] doesn't work [problem]"

Format:
OVERCONFIDENCE RISK: [LOW/MEDIUM/HIGH/CRITICAL]
AHA POTENTIAL: [What kind of breakthrough insight are we still missing?]
VERBATIM GAP: [Do we have enough real customer language? YES/NO — what's missing?]

AGGRESSIVE NEW RESEARCH ANGLES:
1. [hyperspecific query]
2. [hyperspecific query]
3. [hyperspecific query]
4. [hyperspecific query]
5. [hyperspecific query]`;

      const response = await ollamaService.generateStream(
        reflectionPrompt,
        'Be BRUTALLY critical. Find what we DON\'T know. Suggest specific web research.',
        { model: 'glm-4.7-flash:q4_K_M', onChunk, signal } // Upgraded from lfm-2.5 — reflection needs strategic depth
      );

      // Extract risk level
      const riskMatch = response.match(/OVERCONFIDENCE RISK:\s*(\w+)/i);
      if (riskMatch) {
        onChunk?.(`⚠️ Overconfidence Risk: ${riskMatch[1]}\n`);
      }

      // Extract research angles
      const anglesMatch = response.match(/AGGRESSIVE NEW RESEARCH ANGLES:\s*([\s\S]*?)$/i);
      if (!anglesMatch) return [];

      const angles = anglesMatch[1]
        .split('\n')
        .filter((line) => /^\d+\.\s+/.test(line))
        .map((line) => line.replace(/^\d+\.\s+/, '').trim())
        .filter((angle) => angle.length > 5 && !angle.startsWith('['));

      onChunk?.(`Found ${angles.length} new research angles\n`);
      return angles;
    } catch (error) {
      console.error('Reflection agent error:', error);
      return [];
    }
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function extractSources(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urls = text.match(urlRegex) || [];
  return [...new Set(urls)].slice(0, 10);
}

interface OrchestratorDecision {
  query: string;
  context: string;
  depth: 'quick' | 'thorough';
  shouldContinue: boolean;
  question?: string;
  questionContext?: string;
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

  // Extract research topics
  const lines = decision.split('\n');
  for (const line of lines) {
    if (line.includes('RESEARCH:') || line.includes('INVESTIGATE:')) {
      const topic = line.replace(/.*(?:RESEARCH|INVESTIGATE):\s*/i, '').trim();
      if (topic) {
        topics.push({
          query: topic,
          context: 'Marketing research for campaign optimization',
          depth: 'thorough',
          shouldContinue: true,
        });
      }
    }
  }

  // No structured format — end research
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

function buildEvaluationPrompt(
  state: OrchestratorState,
  results: ResearchResult[],
  researchMode: 'interactive' | 'autonomous' = 'autonomous'
): string {
  const interactiveNote = researchMode === 'interactive'
    ? `\n\nYou can ask the user for clarification:
Format: QUESTION: [your clarifying question]`
    : '';

  const reflectionNote = state.reflectionSuggestedTopics?.length
    ? `\n\n🔍 REFLECTION AGENT FLAGGED THESE GAPS (high-priority):
${state.reflectionSuggestedTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}
Consider these angles for next research deployment.`
    : '';

  return `You are evaluating research completeness for a desire-driven ad campaign. Be THOROUGH — don't mark dimensions as covered unless we have SPECIFIC data with evidence.

FRAMEWORK: People don't buy products — they buy fulfillment of desires. We need research deep enough to find:
- TURNING POINTS (when pain becomes unbearable → highest conversion)
- VERBATIM LANGUAGE (how real people talk about this — NOT brand speak)
- ROOT CAUSES (why nothing else worked for them)
- AHA INSIGHTS (surprising truths that change the whole strategy)

Campaign:
- Brand: ${state.campaign.brand}
- Product: ${state.campaign.productDescription}
- Features: ${Array.isArray(state.campaign.productFeatures) ? state.campaign.productFeatures.join(', ') : (state.campaign.productFeatures || 'Not specified')}
- Target: ${state.campaign.targetAudience}
- Goal: ${state.campaign.marketingGoal}
${state.userProvidedContext ? `\nUser Context:\n${Object.entries(state.userProvidedContext).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}

Research Goals:
${state.researchGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Research So Far (${results.length} queries):
${results.map((r) => {
  const covered = Object.values(r.coverage_graph).filter(Boolean).length;
  const total = Object.keys(r.coverage_graph).length;
  return `- "${r.query}": ${covered}/${total} dimensions`;
}).join('\n')}

10 Dimensions to cover (ALL must have REAL data, not just mentions):
1. Market size & trends (actual numbers, growth rates, TAM)
2. Competitor analysis (specific competitors, their strategies, their ADVERTISING — hooks, visuals, ad creative)
3. Customer objections (REAL complaints from Trustpilot, Reddit, Amazon reviews — not hypothetical)
4. Emerging trends (what's changing in this market RIGHT NOW — TikTok trends, new entrants)
5. Regional differences (geography matters? Where is demand strongest?)
6. Pricing strategies (actual price points, willingness-to-pay, value perception)
7. Channel effectiveness (where do ads work? Meta, TikTok, Google, YouTube?)
8. Brand positioning gaps (what NO competitor claims because of structural constraints)
9. Psychological triggers (desires at TURNING POINT intensity, fears, identity threats)
10. Media consumption patterns (where does this audience spend time? Which creators/influencers?)

CRITICAL RESEARCH PRIORITIES:
- Search for COMPETITOR ADS specifically (Meta Ad Library, "brand name" ads, ad examples in niche)
- Search for REAL USER OPINIONS (Reddit threads, Trustpilot reviews, Amazon reviews with complaints)
- Search for VERBATIM QUOTES (how real people describe this problem in their own words)
- Search for what FAILED (products/solutions people tried that didn't work → why → objections)
- Look for ADJACENT NICHES doing something we can steal/adapt
${reflectionNote}

If gaps remain, list 3-5 HYPERSPECIFIC research queries:
RESEARCH: [specific topic 1]
RESEARCH: [specific topic 2]
RESEARCH: [specific topic 3]
RESEARCH: [specific topic 4]
RESEARCH: [specific topic 5]

BAD queries: "Research social media sentiment" (too vague)
GOOD queries: "trustpilot reviews [competitor] complaints 2025" or "reddit r/[subreddit] [product] recommendations"

Include at LEAST one competitor-advertising query and one real-user-opinion query.
If need user input: QUESTION: [question]
If ALL 10 dimensions are thoroughly covered with REAL evidence: COMPLETE: true${interactiveNote}`;
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
    };

    Object.entries(dimensionMap).forEach(([keyword, dimension]) => {
      const regex = new RegExp(`${keyword}[^,]*covered`, 'i');
      if (regex.test(coverageText)) {
        defaultGraph[dimension] = true;
      }
    });
  }

  // Fallback: scan full text for dimension keywords
  // Require 2+ different keyword matches to mark as covered — single mentions are too easy to hit
  const heuristicMap: Array<{ keywords: string[]; dimension: keyof CoverageGraph; minMatches: number }> = [
    { keywords: ['market size', 'tam ', 'total addressable', 'market worth', 'billion', 'million dollar', 'market growth', 'market value'], dimension: 'market_size_trends', minMatches: 2 },
    { keywords: ['competitor', 'competing brand', 'rival', 'vs ', 'compared to', 'market leader', 'alternative brand'], dimension: 'competitor_analysis', minMatches: 2 },
    { keywords: ['objection', 'skeptic', 'doubt', 'concern about', 'hesitat', 'barrier to purchase', 'why they don\'t buy', 'reluctan'], dimension: 'customer_objections', minMatches: 2 },
    { keywords: ['emerging trend', 'growing trend', 'new trend', 'trending', 'rise of', 'shift toward', 'increasingly'], dimension: 'emerging_trends', minMatches: 2 },
    { keywords: ['region', 'country', 'geographic', 'local market', 'europe', 'asia', 'north america', 'urban', 'rural'], dimension: 'regional_differences', minMatches: 2 },
    { keywords: ['pricing', 'price point', 'price range', 'cost of', 'premium pric', 'affordable', 'budget', 'value for money', 'willingness to pay'], dimension: 'pricing_strategies', minMatches: 2 },
    { keywords: ['channel', 'distribution', 'retail', 'e-commerce', 'online store', 'marketplace', 'direct-to-consumer', 'dtc', 'wholesale'], dimension: 'channel_effectiveness', minMatches: 2 },
    { keywords: ['positioning', 'brand position', 'unique selling', 'usp', 'differentiat', 'brand identity', 'brand perception', 'gap in market'], dimension: 'brand_positioning_gaps', minMatches: 2 },
    { keywords: ['psycholog', 'emotional', 'trigger', 'fear of', 'desire for', 'motivation', 'cognitive', 'bias', 'persuasion', 'social proof'], dimension: 'psychological_triggers', minMatches: 2 },
    { keywords: ['media consumption', 'social media', 'instagram', 'tiktok', 'youtube', 'podcast', 'influencer', 'content consumption', 'advertising channel'], dimension: 'media_consumption_patterns', minMatches: 2 },
  ];

  heuristicMap.forEach(({ keywords, dimension, minMatches }) => {
    if (!defaultGraph[dimension]) {
      const matches = keywords.filter((kw) => lower.includes(kw));
      if (matches.length >= minMatches) {
        defaultGraph[dimension] = true;
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
