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
    const prompt = `You are a strategic research director. Given this campaign, identify EXACTLY what research tasks are needed to build competitive intelligence.

Campaign:
- Brand: ${campaign.brand}
- Target Audience: ${campaign.targetAudience}
- Goal: ${campaign.marketingGoal}

You need to understand:
1. Who are the main competitors and HOW are they positioned?
2. What are the target audience's ACTUAL needs (primary vs secondary)?
3. What is the market SHIFT happening right now?
4. What positioning do NO competitors claim (the gap)?
5. What messages are LOSING power vs EMERGING?
6. What price tiers exist and where is money flowing?

Return a JSON array of 5-7 research tasks. Each task focuses on ONE specific aspect.
Format: [
  { "task": "identifier", "description": "specific research goal" },
  ...
]

Example tasks:
- "main_competitors" → "Identify top 3-4 competitors in this space and their positioning"
- "audience_priorities" → "Research what target audience ACTUALLY wants (willingness to pay, non-negotiables)"
- "market_shifts" → "What consumer behavior is changing in this market?"
- "pricing_tiers" → "How is the market segmented by price and what's in each tier?"
- "emerging_messaging" → "What new messaging angles are gaining traction?"
- "positioning_gaps" → "What positioning do competitors avoid or can't claim?"

Return ONLY the JSON array, no other text. Be strategic - think about what you NEED to know to create winning positioning.`;

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
    const prompt = `You are a search strategist who creates queries that ACTUALLY RETURN USEFUL INFORMATION.

Research Task: ${task.task}
Goal: ${task.description}

Generate 5-7 search queries that will find the BEST information for this research. Think about:
- What specific companies or brands should I search for?
- What industry reports or trend analyses exist?
- What forums/communities discuss this topic authentically?
- What data or statistics would prove this point?

Good queries are SPECIFIC. Bad queries are GENERIC.
✓ Good: "Drunk Elephant brand positioning luxury natural skincare"
✗ Bad: "skincare brands"

Return ONLY a JSON array of query strings:
["query 1", "query 2", "query 3", "query 4", "query 5", "query 6", "query 7"]

Make queries that will return REAL, SPECIFIC, USEFUL information that answers the research goal.`;

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
   * Summarizer: Takes raw search results and creates a structured summary
   * Used by searcher agents to extract KEY INSIGHTS (not just compress)
   */
  const summarizeFindings = async (
    task: ResearchTask,
    searchResults: string
  ): Promise<string> => {
    const prompt = `You are a strategic research analyst. Extract KEY FINDINGS from these search results.

Research Task: ${task.task}
Goal: ${task.description}

Search Results:
${searchResults}

Structure your response as:
KEY FINDINGS:
- [Specific finding 1 with evidence]
- [Specific finding 2 with evidence]
- [Specific finding 3 with evidence]

STRATEGIC IMPLICATIONS:
- [What this means for positioning/strategy]
- [Opportunity or threat this reveals]

SPECIFIC DATA/FACTS:
- [Any numbers, prices, market share, quotes]

Be SPECIFIC. Use actual data from the search results. NOT generic statements. Focus on what's STRATEGICALLY USEFUL for competitive positioning.`;

    try {
      const result = await generate(prompt, '', {});
      return result.substring(0, 1500); // Allow longer summaries with structure
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
    onProgress?.(`\n📊 AGENT: Researching "${task.description}"\n`);

    // Step 1: Generate search queries
    onProgress?.(`  🔍 Generating search queries...`);
    const queries = await generateSearchQueries(task);
    onProgress?.(`  ✓ Created ${queries.length} search queries`);

    // Step 2: Execute searches (hits SearXNG placeholder or mock)
    onProgress?.(`\n  🌐 Browsing: ${queries.slice(0, 2).join(", ")}...`);
    const searchResults = await batchSearch(queries);
    onProgress?.(`  ✓ Search complete\n`);

    // Step 3: Summarize findings
    onProgress?.(`  📝 Analyzing findings...`);
    const summary = await summarizeFindings(task, searchResults);
    onProgress?.(`  ✓ Summary complete\n`);

    return {
      task: task.task,
      queries,
      findings: searchResults,
      summary,
    };
  };

  /**
   * Research Brain Synthesis: Combines all searcher agent reports into strategic intelligence
   * Uses the full strategic intelligence framework
   */
  const synthesizeResearch = async (
    campaign: Campaign,
    reports: SearcherAgentReport[]
  ): Promise<string> => {
    const reportsSummary = reports
      .map(
        (r) => `
RESEARCH AREA: ${r.task}
RESEARCH GOAL: ${r.description}
FINDINGS:
${r.summary}
`
      )
      .join('\n\n---\n\n');

    const prompt = `You are a STRATEGIC COMPETITIVE INTELLIGENCE ANALYST. Your job is not to summarize - it's to find the STRATEGIC WEDGE.

Campaign:
- Brand: ${campaign.brand}
- Target Audience: ${campaign.targetAudience}
- Goal: ${campaign.marketingGoal}

RESEARCH FINDINGS FROM AGENTS:
${reportsSummary}

Using these findings, generate a STRATEGIC INTELLIGENCE BRIEF with these sections:

§ COMPETITOR POSITIONING ANALYSIS
  For EACH major competitor mentioned:
    [Competitor Name]
      Core positioning: [What ONE thing are they claiming?]
      Brand permission: [What gives them the right to claim this?]
      Blind spot: [What CAN'T they claim without breaking their brand?]
      Lock-in: [What are they trapped by? (price point, audience, narrative)]
      Vulnerability: [What question always hangs over them?]
      What they DO: [Dominant hook, visual, colors, pacing]
      Why it works: [What emotion/need triggers purchase]

§ AUDIENCE NEED HIERARCHY
  Primary need: [What they MUST have - would pay premium for]
  Secondary needs: [Nice to have but tradeable]
  Trade-off point: [Where they draw the line]
  Non-negotiable: [What they NEVER sacrifice]
  Money location: [Where are they actually spending?]
  Core resentment: [What frustrates them most? (biggest pain)]

§ MARKET DYNAMICS (What's shifting?)
  Consumer behavior change:
    FROM: [Old assumption]
    TO: [New reality]
    Implication: [What this opens up]
  Messaging losing power: [Old claims that don't work - explain why]
  Messaging emerging: [New claims gaining traction - explain why]
  Market movement: [New entrants, consolidation, price stratification]

§ POSITIONING VULNERABILITY MAP
  What can NONE of them claim together?
    Gap description: [Exact positioning no one owns]
    Why it's unclaimed: [Explain the business lock-in]
    Which competitors block it: [Who prevents it]
  What question hangs over each competitor?
    [Competitor A]: [The doubt they can never shake]
    [Competitor B]: [The doubt they can never shake]

§ YOUR STRATEGIC OPPORTUNITY
  Unique positioning (only you can claim this):
    Your claim: [What intersection of needs/attributes no one else claims]
    Why only you: [Explain why competitors can't claim it]
    Competitive moat: [Why can't they copy you even if they tried?]
  Attack angle (where competitors are vulnerable):
    vs [Competitor A]: [Their blind spot, your advantage]
    vs [Competitor B]: [Their lock-in, your freedom]
  Audience resonance (why your position solves their pain):
    Their resentment: [What frustrates them]
    Your answer: [How you eliminate the false choice]

CRITICAL: Be strategically SPECIFIC. Not just what competitors do, but WHY they do it and what they CAN'T claim. This is your strategic wedge.`;

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
    onProgress?.(`\n🧠 RESEARCH BRAIN: Starting strategic analysis for "${campaign.brand}"\n`);
    onProgress?.(`Target: ${campaign.targetAudience}\nGoal: ${campaign.marketingGoal}\n`);

    // Step 1: Research brain decides what to investigate
    onProgress?.(`\n⚙️  Analyzing research needs...`);
    const tasks = await analyzeResearchNeeds(campaign);

    if (tasks.length === 0) {
      onProgress?.(`\n❌ No research tasks identified.`);
      return 'No research tasks identified.';
    }

    onProgress?.(`✓ Identified ${tasks.length} research areas:\n`);
    tasks.forEach((t, i) => {
      onProgress?.(`  ${i + 1}. ${t.description}`);
    });

    // Step 2: Deploy searcher agents (runs in parallel for speed)
    onProgress?.(`\n🚀 Deploying ${tasks.length} searcher agents (running in parallel)...\n`);
    const agentReports = await Promise.all(
      tasks.map((task) =>
        deploySearcherAgent(task, (msg) => {
          onProgress?.(msg);
        })
      )
    );

    onProgress?.(`\n\n🔗 Synthesizing all findings into STRATEGIC BRIEF...\n`);

    // Step 3: Brain synthesizes all findings
    const strategicBrief = await synthesizeResearch(campaign, agentReports);

    onProgress?.(`\n✅ RESEARCH COMPLETE\n`);
    return strategicBrief;
  };

  return {
    executeResearch,
  };
}
