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
      { model: 'lfm2.5-thinking:latest', signal }
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
      const wayfarerResult = await wayfarerService.research(query.topic, 20);
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
    const maxIterations = state.campaign.maxResearchIterations || 15;
    const maxTimeMs = (state.campaign.maxResearchTimeMinutes || 45) * 60 * 1000;
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
        // Stream orchestrator thinking live — throttled to avoid UI overload
        let decisionBuffer = '';
        let lastThinkEmit = 0;
        const decision = await ollamaService.generateStream(
          evaluationPrompt,
          'You decide what research is needed. Be specific about topics.',
          {
            model: 'glm-4.7-flash:q4_K_M',
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

        // Deploy researchers in parallel (up to 8)
        const researchTopics = filteredTopics.slice(0, 8).filter((t) => t.query.length > 0);
        onProgressUpdate?.(`Deploying ${researchTopics.length} researcher agents...\n`);
        researchTopics.forEach((t) => {
          onProgressUpdate?.(`  [Orchestrator] → "${t.query}"\n`);
        });

        const parallelResults = await Promise.all(
          researchTopics.map((topic) => {
            // Stream synthesis tokens live with throttling — user sees what researchers find in real-time
            let synthesisBuffer = '';
            let isSynthesizing = false;
            let lastSynthEmit = 0;
            return researcherAgent.research(
              { topic: topic.query, context: topic.context, depth: topic.depth },
              (chunk) => {
                // Structured messages (search, fetch, compress) — emit directly
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
              signal
            ).then((result) => {
              // Flush remaining synthesis buffer
              if (synthesisBuffer.trim().length > 0) {
                onProgressUpdate?.(`  [Researcher] ${synthesisBuffer.replace(/\n/g, ' ').trim()}\n`);
              }
              return result;
            });
          })
        );

        allResults.push(...parallelResults);

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
            const visualFindings = await visualScoutAgent.analyzeCompetitorVisuals(
              visualScoutUrls.slice(0, 5), // Cap at 5 URLs
              state.campaign,
              onProgressUpdate,
              signal
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

        // Always run reflection agent after iteration 1+ (not just when below threshold)
        // This ensures we catch overconfidence even when coverage looks "complete"
        const MIN_ITERATIONS_BEFORE_EXIT = 8;
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

          // Check if reflection agent requested visual scouting
          if (reflectionBuffer.includes('VISUAL_SCOUT:') && !(state as any)._visualFindings) {
            const visualMatch = reflectionBuffer.match(/VISUAL_SCOUT:\s*(.+)/i);
            if (visualMatch) {
              const reflectionVisualUrls = visualMatch[1]
                .split(/[,\s]+/)
                .map(u => u.trim().replace(/[\[\]]/g, ''))
                .filter(u => u.startsWith('http'));
              if (reflectionVisualUrls.length > 0) {
                onProgressUpdate?.(`\n[Visual Scout] Reflection agent requested visual analysis of ${reflectionVisualUrls.length} URLs\n`);
                try {
                  const { visualScoutAgent } = await import('./visualScoutAgent');
                  const visualFindings = await visualScoutAgent.analyzeCompetitorVisuals(
                    reflectionVisualUrls.slice(0, 5),
                    state.campaign,
                    onProgressUpdate,
                    signal
                  );
                  (state as any)._visualFindings = visualFindings;
                  onProgressUpdate?.(`[Visual Scout] Visual analysis complete — ${visualFindings.totalAnalyzed} sites analyzed\n`);
                } catch (err) {
                  onProgressUpdate?.(`[Visual Scout] Visual analysis failed: ${err}\n`);
                }
              }
            }
          }
        }

        // Require minimum iterations AND minimum sources before allowing exit
        const MIN_SOURCES = 50;
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

VISUAL INTELLIGENCE CHECKS:
15. Did we SCREENSHOT competitor websites/ads? (Visual reveals what text can't — colors, layout, CTA design)
16. Do we know what COLORS, LAYOUTS, and VISUAL STYLES competitors use?
17. Have we identified VISUAL GAPS — what no competitor does visually?
18. Can we differentiate through VISUAL APPROACH, not just messaging?

${(state as any)?._visualFindings ? `EXISTING VISUAL ANALYSIS:
${((state as any)._visualFindings.competitorVisuals || []).map((v: any) => `- ${v.url}: tone=${v.visualTone}, colors=${v.dominantColors?.join(',')} elements=${v.keyVisualElements?.join(',')}`).join('\n')}
Common Patterns: ${(state as any)._visualFindings.commonPatterns?.join('; ') || 'none yet'}
Visual Gaps: ${(state as any)._visualFindings.visualGaps?.join('; ') || 'none yet'}
` : 'NO VISUAL ANALYSIS DONE YET — consider requesting VISUAL_SCOUT for competitor URLs.'}

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
5. [hyperspecific query]

VISUAL_SCOUT: [competitor URLs to screenshot and analyze, if visual analysis is lacking]`;

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

// Query quality filter — reject trend-chasing and BS
function isQualityQuery(query: string): boolean {
  const lower = query.toLowerCase();
  // REJECT: Aesthetic trend-chasing (no business signal)
  const badPatterns = [/aesthetic\s+trend/i, /clean\s+girl/i, /viral\s+trend/i, /tiktok.*aesthetic/i, /trending.*hashtag/i];
  if (badPatterns.some(p => p.test(query))) return false;
  // REJECT: Celebrity, unrelated noise
  if (/celebrity|kardashian|elon/.test(lower)) return false;
  // ACCEPT: Must have business signal
  const goodPatterns = [/trustpilot|amazon.*review|reddit/i, /meta.*ad|facebook.*ad|ad.*library/i, /market\s+size|cagr/i, /objection|complaint/i, /customer.*behavior/i, /pricing/i, /channel.*effective/i, /positioning|gap/i];
  return goodPatterns.some(p => p.test(query));
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

  // Extract research topics with VALIDATION
  const lines = decision.split('\n');
  for (const line of lines) {
    if (line.includes('RESEARCH:') || line.includes('INVESTIGATE:')) {
      const topic = line.replace(/.*(?:RESEARCH|INVESTIGATE):\s*/i, '').trim();
      // QUALITY CHECK: reject truncated, vague, or non-specific queries
      const isTruncated = topic.match(/[,)]$/) && !topic.includes('OR') && !topic.includes('AND');
      const isVague = /^trends?\s|^insights?\s|social media sentiment|general interest|what people/i.test(topic);
      const hasSpecificity = /(".*?")|(\d{4})|reddit|trustpilot|amazon|meta|tiktok|instagram|youtube|podcast|[A-Z][a-z]+\s+[A-Z]/i.test(topic);
      if (topic && topic.length >= 10 && !isTruncated && !isVague && hasSpecificity && isQualityQuery(topic)) {
        topics.push({
          query: topic,
          context: 'Marketing research for campaign optimization',
          depth: 'thorough',
          shouldContinue: true,
        });
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
      // Attach visual scout URLs to first topic, or create a dedicated one
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

  // No structured format and no visual scout — end research
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
1. Market size & trends (actual numbers, growth rates, TAM from reports/studies)
2. Competitor analysis (specific competitors, their strategies, their ADVERTISING — hooks, visuals, ad creative)
3. Customer sentiment & objections (BALANCED feedback from Trustpilot, Reddit, Amazon reviews — understand what satisfied customers LOVE + barriers stopping adoption, NOT cherry-picked 1-star reviews)
4. Emerging customer behaviors (new ways customers approach this problem, adoption patterns, shifting preferences — NOT just viral aesthetics)
5. Regional differences (geography matters? Where is demand strongest?)
6. Pricing strategies (actual price points, willingness-to-pay, value perception)
7. Channel effectiveness (where do ads work? Meta, TikTok, Google, YouTube?)
8. Brand positioning gaps (what NO competitor claims because of structural constraints)
9. Psychological triggers (desires at TURNING POINT intensity, fears, identity threats)
10. Media consumption patterns (where does this audience spend time? Which creators/influencers?)

CRITICAL RESEARCH PRIORITIES:
- Search for COMPETITOR ADS specifically (Meta Ad Library, "brand name" ads, ad examples in niche)
- Search for REAL CUSTOMER FEEDBACK (Reddit threads, Trustpilot reviews, Amazon reviews — understand satisfaction distribution + pain points, not just extremes)
- Search for VERBATIM QUOTES (how real people describe this problem in their own words)
- Search for what FAILED (products/solutions people tried that didn't work → why → objections)
- Look for ADJACENT NICHES doing something we can steal/adapt

RESEARCH METHODOLOGY (CRITICAL):
- DO NOT cherry-pick 1-star reviews or 5-star reviews in isolation
- DO sample DISTRIBUTION of sentiment (understand the bell curve, not the extremes)
- DO find ROOT CAUSES ("I gave up because..." beats "I hated it!")
- DO NOT assume Reddit complaints = market reality (vocal minorities != majority)
- DO look for early adopters AND hesitant customers (different motivations)
${reflectionNote}

If gaps remain, list 3-5 HYPERSPECIFIC research queries:
RESEARCH: [specific topic 1]
RESEARCH: [specific topic 2]
RESEARCH: [specific topic 3]
RESEARCH: [specific topic 4]
RESEARCH: [specific topic 5]

REJECT these queries (trend-chasing without business relevance):
- "aesthetic trends" or "viral trends" without customer context (e.g., "clean girl aesthetic") — NO
- Hashtag chasing (e.g., "TikTok #skincare trending 2025") — NO
- Celebrity gossip or unrelated cultural moments — NO
- Generic trend reports not tied to customer pain/behavior — NO
- "What's trending?" without specific customer insights — NO

BAD queries: "Research social media sentiment" (too vague) | "TikTok clean girl aesthetic" (trend-chasing, no business relevance) | "trustpilot reviews [competitor] complaints" (biased cherry-picking)
GOOD queries: "reddit r/[subreddit] [product] reviews and discussion 2024" | "amazon reviews [competitor] real customer feedback analysis" | "trustpilot [competitor] reviews what do customers say" | "who switched from [competitor A] to [competitor B] why" | "[competitor] ad examples meta ad library 2025"

Include at LEAST one competitor-advertising query and one real-user-opinion query.
Only continue research if you're gathering SIGNAL (market data, customer opinions, competitor strategies), not NOISE (viral aesthetics).

VISUAL INTELLIGENCE:
You can request VISUAL ANALYSIS of competitor websites/ads. A vision model (minicpm-v:8b) will screenshot and analyze them.
To request visual scouting, add this line:
VISUAL_SCOUT: https://competitor1.com, https://competitor2.com
Request this when you've found competitor landing pages or ad examples worth visually analyzing.
This reveals: color palettes, layout patterns, visual tone, CTA design, and visual gaps competitors miss.
You can combine RESEARCH: and VISUAL_SCOUT: in the same response.

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
    visual_competitive_analysis: false,
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
  // Require 3+ different keyword matches AND substantial surrounding content — brief mentions don't count
  const heuristicMap: Array<{ keywords: string[]; dimension: keyof CoverageGraph; minMatches: number }> = [
    { keywords: ['market size', 'tam ', 'total addressable', 'market worth', 'billion', 'million dollar', 'market growth', 'market value'], dimension: 'market_size_trends', minMatches: 3 },
    { keywords: ['competitor', 'competing brand', 'rival', 'vs ', 'compared to', 'market leader', 'alternative brand'], dimension: 'competitor_analysis', minMatches: 3 },
    { keywords: ['objection', 'skeptic', 'doubt', 'concern about', 'hesitat', 'barrier to purchase', 'why they don\'t buy', 'reluctan'], dimension: 'customer_objections', minMatches: 3 },
    { keywords: ['emerging trend', 'growing trend', 'new trend', 'trending', 'rise of', 'shift toward', 'increasingly'], dimension: 'emerging_trends', minMatches: 3 },
    { keywords: ['region', 'country', 'geographic', 'local market', 'europe', 'asia', 'north america', 'urban', 'rural'], dimension: 'regional_differences', minMatches: 3 },
    { keywords: ['pricing', 'price point', 'price range', 'cost of', 'premium pric', 'affordable', 'budget', 'value for money', 'willingness to pay'], dimension: 'pricing_strategies', minMatches: 3 },
    { keywords: ['channel', 'distribution', 'retail', 'e-commerce', 'online store', 'marketplace', 'direct-to-consumer', 'dtc', 'wholesale'], dimension: 'channel_effectiveness', minMatches: 3 },
    { keywords: ['positioning', 'brand position', 'unique selling', 'usp', 'differentiat', 'brand identity', 'brand perception', 'gap in market'], dimension: 'brand_positioning_gaps', minMatches: 3 },
    { keywords: ['psycholog', 'emotional', 'trigger', 'fear of', 'desire for', 'motivation', 'cognitive', 'bias', 'persuasion', 'social proof'], dimension: 'psychological_triggers', minMatches: 3 },
    { keywords: ['media consumption', 'social media', 'instagram', 'tiktok', 'youtube', 'podcast', 'influencer', 'content consumption', 'advertising channel'], dimension: 'media_consumption_patterns', minMatches: 3 },
    { keywords: ['visual', 'screenshot', 'layout', 'color palette', 'visual tone', 'design style', 'visual approach', 'cta design', 'visual gap'], dimension: 'visual_competitive_analysis', minMatches: 3 },
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
        if (contentChars >= 200) {
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
