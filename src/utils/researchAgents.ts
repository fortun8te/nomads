import { ollamaService } from './ollama';
import { searxngService } from './searxng';
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
}

export interface ResearchPauseEvent {
  type: 'pause_for_input';
  question: string;
  context: string; // Why is glm asking?
  suggestedAnswers?: string[]; // Optional suggestions
}

// Researcher agent - executes single research task with SearXNG web search
export const researcherAgent = {
  async research(query: ResearchQuery, onChunk?: (chunk: string) => void): Promise<ResearchResult> {
    try {
      onChunk?.(`Searching for: "${query.topic}"...\n`);

      // Step 1: Get real web search results from SearXNG
      const searchResults = await searxngService.searchAndSummarize(query.topic, 5);
      onChunk?.(`Found ${searchResults.split('\n').length} relevant sources\n`);

      // Step 2: Synthesize findings with LLM
      const synthesisPrompt = `You are a research analyst synthesizing web search results for marketing research.

Search Results:
${searchResults}

Topic: ${query.topic}
Context: ${query.context}
Depth: ${query.depth}

Based on the search results above, provide:
1. Key insights (2-3 paragraphs)
2. Notable trends or patterns
3. Specific evidence from sources

Identify which of these dimensions you've covered in your research:
- Market size and trends
- Competitor analysis
- Customer objections
- Emerging trends
- Regional differences
- Pricing strategies
- Channel effectiveness
- Brand positioning gaps
- Psychological triggers
- Media consumption patterns

Format as:
FINDINGS: [Your synthesis here]
COVERAGE: [dimension: covered/uncovered, dimension: covered/uncovered, ...]
SOURCES: [URLs from the search results]`;

      const response = await ollamaService.generateStream(
        synthesisPrompt,
        'You are synthesizing web research to inform marketing strategy. Be specific and cite sources. Clearly identify which research dimensions you covered.',
        {
          model: 'lfm-2.5:q4_K_M', // Fast model for synthesis
          onChunk,
        }
      );

      // Parse response to build coverage graph
      const coverage_graph = buildCoverageGraph(response);

      return {
        query: query.topic,
        findings: response,
        sources: extractSources(response),
        coverage_graph,
      };
    } catch (error) {
      console.error('Research agent error:', error);
      // Fallback to LLM-only research if SearXNG fails
      try {
        onChunk?.('(SearXNG unavailable, using LLM-only research)\n');
        const fallbackPrompt = `You are a research analyst. Provide insights on this topic based on your knowledge:
Topic: ${query.topic}
Context: ${query.context}

Note which research dimensions you cover in your analysis (market size, competitors, objections, trends, regional factors, pricing, channels, positioning, psychology, media patterns).`;

        const response = await ollamaService.generateStream(
          fallbackPrompt,
          'Provide research insights. Note which dimensions you cover.',
          {
            model: 'lfm-2.5:q4_K_M',
            onChunk,
          }
        );

        const coverage_graph = buildCoverageGraph(response);

        return {
          query: query.topic,
          findings: response,
          sources: [],
          coverage_graph,
        };
      } catch (fallbackError) {
        console.error('Research fallback error:', fallbackError);
        throw fallbackError;
      }
    }
  },
};

// Orchestrator - manages researcher deployment and evaluation
export const orchestrator = {
  async orchestrateResearch(
    state: OrchestratorState,
    onProgressUpdate?: (message: string) => void,
    onPauseForInput?: (event: ResearchPauseEvent) => Promise<string>
  ): Promise<ResearchResult[]> {
    const allResults: ResearchResult[] = [...state.completedResearch];
    let iteration = 0;
    const maxIterations = 3; // Prevent infinite loops

    while (iteration < maxIterations) {
      iteration++;
      onProgressUpdate?.(`[Orchestrator] Evaluating research coverage & identifying gaps (iteration ${iteration})...`);

      // Ask glm-4.7 what to research next
      const evaluationPrompt = buildEvaluationPrompt(state, allResults, state.campaign.researchMode);

      try {
        const decision = await ollamaService.generate(
          evaluationPrompt,
          'You decide what research is needed. Be specific about topics.',
          'glm-4.7-flash:q4_K_M' // Smart orchestrator model
        );

        const nextTopics = parseOrchestratorDecision(decision);

        // Handle questions in interactive mode
        if (nextTopics[0]?.question && state.campaign.researchMode === 'interactive' && onPauseForInput) {
          onProgressUpdate?.(`\n[Orchestrator] Pausing for user input...\n`);
          const userAnswer = await onPauseForInput({
            type: 'pause_for_input',
            question: nextTopics[0].question,
            context: nextTopics[0].questionContext || 'Clarification needed',
            suggestedAnswers: state.campaign.productFeatures, // Use product features as suggestions
          });

          // Store user answer and continue
          if (!state.userProvidedContext) state.userProvidedContext = {};
          state.userProvidedContext[nextTopics[0].question] = userAnswer;
          onProgressUpdate?.(`User provided: ${userAnswer}\n`);
          continue; // Re-evaluate with user context
        }

        if (nextTopics.length === 0 || !nextTopics[0].shouldContinue) {
          onProgressUpdate?.('✓ Research phase complete - orchestrator satisfied with coverage');
          break;
        }

        // Deploy researchers in parallel (batch size of 3)
        onProgressUpdate?.(`Deploying ${nextTopics.length} researcher agents...`);
        const parallelResults = await Promise.all(
          nextTopics.slice(0, 3).map((topic) =>
            researcherAgent.research(
              {
                topic: topic.query,
                context: topic.context,
                depth: topic.depth,
              },
              (chunk) => {
                onProgressUpdate?.(`[Researcher] ${chunk}`);
              }
            )
          )
        );

        allResults.push(...parallelResults);

        // Evaluate coverage across all research results
        const coverageStatus = evaluateCoverage(allResults);
        const coveredDimensions = Object.values(coverageStatus).filter(Boolean).length;
        const totalDimensions = Object.keys(coverageStatus).length;
        const coveragePercentage = (coveredDimensions / totalDimensions) * 100;

        onProgressUpdate?.(
          `Research coverage: ${coveragePercentage.toFixed(0)}% (${coveredDimensions}/${totalDimensions} dimensions covered, threshold: ${(state.coverageThreshold * 100).toFixed(0)}%)`
        );

        if (coveragePercentage / 100 >= state.coverageThreshold) {
          onProgressUpdate?.('✓ Coverage threshold reached - research phase complete');
          break;
        }
      } catch (error) {
        console.error('Orchestrator error:', error);
        throw error;
      }
    }

    return allResults;
  },
};

// Helper functions
function extractSources(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urls = text.match(urlRegex) || [];

  const sourceRegex = /(?:from|via|source:|sources:)\s*([^.]+)/gi;
  const sourceMatches = text.match(sourceRegex) || [];

  return [...new Set([...urls, ...sourceMatches])].slice(0, 5);
}

interface OrchestratorDecision {
  query: string;
  context: string;
  depth: 'quick' | 'thorough';
  shouldContinue: boolean;
  question?: string; // If glm needs clarification from user
  questionContext?: string;
}

function parseOrchestratorDecision(decision: string): OrchestratorDecision[] {
  // Parse glm's structured decision about what to research
  const topics: OrchestratorDecision[] = [];

  // Check for QUESTION: [user input needed]
  const questionMatch = decision.match(/QUESTION:\s*(.+?)(?=\n|$)/i);
  if (questionMatch) {
    return [{
      query: '',
      context: '',
      depth: 'quick',
      shouldContinue: true,
      question: questionMatch[1].trim(),
      questionContext: 'glm needs clarification to continue research',
    }];
  }

  // Look for research decisions in the format:
  // RESEARCH_NEEDED: [topic]
  // or COMPLETE: true
  if (decision.toLowerCase().includes('complete') && decision.toLowerCase().includes('true')) {
    return [{ query: '', context: '', depth: 'quick', shouldContinue: false }];
  }

  // Extract research topics from response
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

  // If no structured format found, extract key insights
  if (topics.length === 0) {
    topics.push({
      query: 'Additional competitive analysis',
      context: 'Marketing research',
      depth: 'quick',
      shouldContinue: false, // End research if no structured decision
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
    ? `\n\nIMPORTANT: You can ask the user for clarification if needed.
Format: QUESTION: [your clarifying question]
Example: QUESTION: What is your product's primary differentiator vs competitors?`
    : '';

  return `You are evaluating research completeness for an ad campaign.

Campaign Details:
- Brand: ${state.campaign.brand}
- Product: ${state.campaign.productDescription}
- Features: ${state.campaign.productFeatures?.join(', ') || 'Not specified'}
- Target Audience: ${state.campaign.targetAudience}
- Goal: ${state.campaign.marketingGoal}
${state.userProvidedContext ? `\nUser-Provided Context:\n${Object.entries(state.userProvidedContext).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : ''}

Research Completed So Far:
${results.map((r) => {
  const covered = Object.values(r.coverage_graph).filter(Boolean).length;
  const total = Object.keys(r.coverage_graph).length;
  return `- ${r.query}: ${covered}/${total} dimensions covered`;
}).join('\n')}

Your Job: Evaluate research COVERAGE across 10 dimensions:
1. Market size & trends
2. Competitor analysis
3. Customer objections & pain points
4. Emerging market trends
5. Regional/cultural differences
6. Pricing strategies
7. Channel effectiveness
8. Brand positioning gaps
9. Psychological triggers
10. Media consumption patterns

If dimensions are missing, request targeted research to fill gaps. Use reflection-based approach: consider what perspectives are missing, what contradictions exist, and what an expert would criticize.

Format:
If incomplete: RESEARCH: [SPECIFIC gap to fill with evidence of why]
If you need user input: QUESTION: [your question]
If complete: COMPLETE: true${interactiveNote}`;
}

// Build coverage graph from research response
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

  const coverageMatch = response.match(/COVERAGE:\s*([^\n]+(?:\n[^\n]*)*)/i);
  if (!coverageMatch) return defaultGraph;

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

  // Mark dimensions as covered if mentioned with "covered" keyword
  Object.entries(dimensionMap).forEach(([keyword, dimension]) => {
    const regex = new RegExp(`${keyword}[^,]*covered`, 'i');
    if (regex.test(coverageText)) {
      defaultGraph[dimension] = true;
    }
  });

  return defaultGraph;
}

// Evaluate overall coverage across all research results
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

  // Merge all coverage graphs - if ANY result covered a dimension, mark as covered
  results.forEach((result) => {
    Object.keys(merged).forEach((key) => {
      if (result.coverage_graph[key]) {
        merged[key as keyof CoverageGraph] = true;
      }
    });
  });

  return merged;
}

// Reflection Agent - identifies research gaps and suggests new angles
export const reflectionAgent = {
  async evaluateGaps(
    state: OrchestratorState,
    completedResults: ResearchResult[],
    onChunk?: (chunk: string) => void
  ): Promise<string[]> {
    try {
      const coverage = evaluateCoverage(completedResults);
      const gaps = Object.entries(coverage)
        .filter(([, covered]) => !covered)
        .map(([dimension]) => dimension);

      onChunk?.(`\n[Reflection Agent] Analyzing research gaps...\n`);
      onChunk?.(`Missing dimensions: ${gaps.join(', ')}\n`);

      const reflectionPrompt = `You are a research reflection agent. Based on the campaign and completed research, identify what perspectives are missing and suggest new research angles.

Campaign:
- Brand: ${state.campaign.brand}
- Product: ${state.campaign.productDescription}
- Target: ${state.campaign.targetAudience}
- Goal: ${state.campaign.marketingGoal}

Research completed so far:
${completedResults.map((r) => `- ${r.query}: covered ${Object.values(r.coverage_graph).filter(Boolean).length} dimensions`).join('\n')}

Research gaps (not yet covered):
${gaps.join(', ')}

REFLECTION QUESTIONS:
1. What stakeholder perspectives are missing?
2. What contradictions exist in the research?
3. What would a skeptical expert criticize about this research?
4. What regional or cultural factors are unexplored?
5. What second-order effects are we ignoring?

Based on these gaps and questions, suggest NEW specific research angles that would fill these gaps.

Format as:
NEW_RESEARCH_ANGLES:
1. [specific angle]
2. [specific angle]
3. [specific angle]`;

      const response = await ollamaService.generateStream(
        reflectionPrompt,
        'You critically evaluate research gaps and suggest novel investigation angles.',
        {
          model: 'lfm-2.5:q4_K_M',
          onChunk,
        }
      );

      // Extract new research angles from response
      const anglesMatch = response.match(/NEW_RESEARCH_ANGLES:\s*([\s\S]*?)(?=$|REFLECTION)/);
      if (!anglesMatch) return [];

      const angles = anglesMatch[1]
        .split('\n')
        .filter((line) => /^\d+\.\s+/.test(line))
        .map((line) => line.replace(/^\d+\.\s+/, '').trim())
        .filter((angle) => angle.length > 0);

      onChunk?.(`Identified ${angles.length} new research angles to explore\n`);
      return angles;
    } catch (error) {
      console.error('Reflection agent error:', error);
      return [];
    }
  },
};
