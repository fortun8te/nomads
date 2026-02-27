import { useOllama } from './useOllama';
import { batchSearch } from '../utils/search';
import type { Campaign } from '../types';

interface ResearchTask {
  task: string;
  description: string;
}

interface SearcherAgentReport {
  task: string;
  queries: string[];
  findings: string;
  summary: string;
}

/**
 * Research Brain - Orchestrates the multi-agent research process
 * 1. Decides what to research
 * 2. Deploys generic searcher agents
 * 3. Collects and synthesizes findings
 */
export function useResearchAgent() {
  const { generate } = useOllama();

  /**
   * Research Brain: Analyzes campaign and decides what research is needed
   * Returns list of research tasks to deploy agents for
   */
  const analyzeResearchNeeds = async (campaign: Campaign): Promise<ResearchTask[]> => {
    const prompt = `You are a research planning expert. Given this campaign, decide what specific research tasks are needed.

Campaign:
- Brand: ${campaign.brand}
- Target Audience: ${campaign.targetAudience}
- Goal: ${campaign.marketingGoal}

Return a JSON array of research tasks. Each task should be specific and searchable. Example format:
[
  { "task": "competitor_positioning", "description": "Research how main competitors position themselves" },
  { "task": "audience_needs", "description": "Research target audience's primary needs and pain points" },
  { "task": "market_trends", "description": "Research emerging trends in this market" }
]

Return ONLY the JSON array, no other text.`;

    try {
      const result = await generate(prompt, '', {});
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (err) {
      console.error('Error analyzing research needs:', err);
      return [];
    }
  };

  /**
   * Searcher Agent Generator: Takes a research task and creates search queries
   * This is a GENERIC agent - same code, different tasks
   */
  const generateSearchQueries = async (task: ResearchTask): Promise<string[]> => {
    const prompt = `You are a search strategy expert. Given this research task, generate 4-5 specific, searchable queries.

Task: ${task.task}
Description: ${task.description}

Return ONLY a JSON array of search query strings. Example:
["query 1", "query 2", "query 3", "query 4", "query 5"]

Make queries specific and likely to return relevant results.`;

    try {
      const result = await generate(prompt, '', {});
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (err) {
      console.error('Error generating search queries:', err);
      return [];
    }
  };

  /**
   * Summarizer: Takes raw search results and creates a brief summary
   * Used by searcher agents to condense findings
   */
  const summarizeFindings = async (
    task: ResearchTask,
    searchResults: string
  ): Promise<string> => {
    const prompt = `You are a research analyst. Summarize these findings in 2-3 sentences.

Task: ${task.task} - ${task.description}

Search Results:
${searchResults}

Provide a brief, actionable summary of the key findings. Be specific and avoid generic statements.`;

    try {
      const result = await generate(prompt, '', {});
      return result.substring(0, 500); // Keep summaries short
    } catch (err) {
      console.error('Error summarizing findings:', err);
      return 'Unable to summarize findings.';
    }
  };

  /**
   * Deploy Searcher Agent: Generic agent that executes a research task
   * Takes a task, generates queries, searches, and summarizes
   */
  const deploySearcherAgent = async (
    task: ResearchTask,
    onProgress?: (msg: string) => void
  ): Promise<SearcherAgentReport> => {
    onProgress?.(`[Agent] Starting research on: ${task.task}`);

    // Step 1: Generate search queries
    onProgress?.(`[Agent] Generating search queries for: ${task.description}`);
    const queries = await generateSearchQueries(task);

    // Step 2: Execute searches (hits SearXNG placeholder or mock)
    onProgress?.(`[Agent] Searching ${queries.length} queries...`);
    const searchResults = await batchSearch(queries);

    // Step 3: Summarize findings
    onProgress?.(`[Agent] Summarizing findings...`);
    const summary = await summarizeFindings(task, searchResults);

    onProgress?.(`[Agent] Complete: ${task.task}`);

    return {
      task: task.task,
      queries,
      findings: searchResults,
      summary,
    };
  };

  /**
   * Research Brain Synthesis: Combines all searcher agent reports into strategic intelligence
   */
  const synthesizeResearch = async (
    campaign: Campaign,
    reports: SearcherAgentReport[]
  ): Promise<string> => {
    const reportsSummary = reports
      .map(
        (r) => `
RESEARCH TASK: ${r.task}
SUMMARY: ${r.summary}
`
      )
      .join('\n---\n');

    const prompt = `You are a strategic competitive intelligence analyst. Synthesize these research findings into a strategic intelligence brief.

Campaign:
- Brand: ${campaign.brand}
- Target Audience: ${campaign.targetAudience}
- Goal: ${campaign.marketingGoal}

Research Findings:
${reportsSummary}

Generate a STRATEGIC INTELLIGENCE BRIEF that includes:

§ COMPETITOR POSITIONING ANALYSIS
  For each major competitor:
  - Core positioning claim
  - Brand permission (why they can claim this)
  - Blind spots (what they CAN'T claim)
  - Vulnerabilities (what questions hang over them)

§ AUDIENCE NEED HIERARCHY
  - Primary need
  - Secondary needs
  - Non-negotiables
  - Money location
  - Core resentment

§ MARKET DYNAMICS
  - What's shifting
  - Messaging losing power
  - Messaging emerging
  - Market gaps

§ YOUR STRATEGIC OPPORTUNITY
  - Unique positioning
  - Why only you can claim it
  - Competitive moat
  - Attack angles

Be strategic and specific. This brief should guide creative strategy.`;

    try {
      const result = await generate(prompt, '', {});
      return result;
    } catch (err) {
      console.error('Error synthesizing research:', err);
      return 'Unable to synthesize research findings.';
    }
  };

  /**
   * Main Research Flow: Brain -> Agents -> Synthesis
   */
  const executeResearch = async (
    campaign: Campaign,
    onProgress?: (msg: string) => void
  ): Promise<string> => {
    onProgress?.('[Research Brain] Analyzing what research is needed...');

    // Step 1: Research brain decides what to investigate
    const tasks = await analyzeResearchNeeds(campaign);
    onProgress?.(`[Research Brain] Deploying ${tasks.length} searcher agents...`);

    if (tasks.length === 0) {
      onProgress?.('[Research Brain] No research tasks identified.');
      return 'No research tasks identified.';
    }

    // Step 2: Deploy searcher agents (runs in parallel for speed)
    const agentReports = await Promise.all(
      tasks.map((task) =>
        deploySearcherAgent(task, (msg) => {
          onProgress?.(msg);
        })
      )
    );

    onProgress?.('[Research Brain] Synthesizing agent reports into strategic brief...');

    // Step 3: Brain synthesizes all findings
    const strategicBrief = await synthesizeResearch(campaign, agentReports);

    return strategicBrief;
  };

  return {
    executeResearch,
  };
}
