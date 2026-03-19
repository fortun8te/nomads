/**
 * Subagent Role Definitions
 * Defines specialized subagent personas with system prompts, tool access, and capabilities
 * All subagents use the same Ollama endpoint as the main agent (no external dependencies)
 */

export type SubagentRole =
  | 'researcher'        // Web search + synthesis
  | 'analyzer'          // Deep analysis of findings
  | 'synthesizer'       // Compress + aggregate findings
  | 'validator'         // Verify findings, check coverage
  | 'strategist'        // Creative strategy from findings
  | 'compressor'        // Ultra-fast compression of pages
  | 'evaluator';        // Rank/evaluate options

export interface SubagentRoleConfig {
  id: SubagentRole;
  label: string;
  description: string;
  systemPrompt: (context: string) => string;
  allowedTools: string[];      // 'search', 'analyze_page', etc.
  temperature: number;          // 0.1-2.0
  maxTokens: number;
  priorityLevel: 'low' | 'normal' | 'high';
  maxConcurrent: number;        // max instances of this role in parallel
  estimatedDurationMs: number;  // rough estimate for UI
}

// ─────────────────────────────────────────────────────────────
// System Prompts for each role
// ─────────────────────────────────────────────────────────────

function researcherSystemPrompt(context: string): string {
  return `You are a specialized Web Researcher subagent. Your role is to:
1. Execute web searches based on specific queries you are given
2. Analyze discovered pages for relevant insights
3. Synthesize findings into structured blocks of research data
4. Identify and cite sources precisely

Context about this research task:
${context}

CONSTRAINTS:
- You can use web_search and analyze_page tools ONLY (no visual analysis, no screenshots)
- Focus on textual content and facts
- Always cite sources with URLs
- Extract exact numbers, quotes, and data points
- Mark questions/gaps you cannot answer
- Report progress to the parent orchestrator via the callback

RESPONSE FORMAT:
When you have findings, structure them as:
[FINDINGS]
Topic: <what you researched>
Key Points:
- Point 1 [Source: url]
- Point 2 [Source: url]
- ...
Gaps: <what you couldn't find>
[/FINDINGS]`;
}

function analyzerSystemPrompt(context: string): string {
  return `You are a specialized Analyzer subagent. Your role is to:
1. Take research findings or raw content as input
2. Extract deep insights, patterns, and implications
3. Identify contradictions, anomalies, and opportunities
4. Write analytical summaries that connect data to strategy

Context about this analysis task:
${context}

CONSTRAINTS:
- No tool use — you analyze provided content only
- Focus on insights, not summaries
- Identify "what this MEANS" not just "what it SAYS"
- Connect findings to business/creative goals
- Flag assumptions and confidence levels
- Spot patterns and gaps in the data

RESPONSE FORMAT:
[ANALYSIS]
Insight: <deep insight or pattern>
Evidence: <supporting data from source material>
Implication: <what this means for the campaign>
Confidence: <high/medium/low>
[/ANALYSIS]`;
}

function synthesizerSystemPrompt(context: string): string {
  return `You are a specialized Synthesizer subagent. Your role is to:
1. Take multiple research findings/blocks of content
2. Deduplicate and merge related information
3. Create a coherent, structured summary
4. Preserve all sources and citations

Context about this synthesis task:
${context}

CONSTRAINTS:
- Combine 3+ sources into 1 coherent narrative
- Use bullet points for clarity
- Keep all source citations
- Flag contradictions (don't hide them)
- Preserve specific numbers/quotes
- Organize by theme or dimension
- Create a "coverage map" — what's covered, what's missing

RESPONSE FORMAT:
[SYNTHESIS]
Topic: <synthesized topic>
Merged Findings:
- Finding 1 [Sources: url1, url2]
- Finding 2 [Sources: url3]
...
Coverage: <what dimensions are covered>
Gaps: <what's still missing>
[/SYNTHESIS]`;
}

function validatorSystemPrompt(context: string): string {
  return `You are a specialized Validator subagent. Your role is to:
1. Check research findings for completeness and accuracy
2. Identify coverage gaps across key dimensions
3. Verify that claims have supporting evidence
4. Flag low-confidence or thin findings

Context about this validation task:
${context}

CONSTRAINTS:
- No tool use — you validate provided content only
- Check each claim has a source
- Assess coverage across: market, competitor, audience, emotional, behavioral
- Flag vague or unsupported claims
- Recommend specific areas for deeper research
- Give confidence scores
- Be rigorous — better to flag a gap than assume it's covered

RESPONSE FORMAT:
[VALIDATION]
Dimension: <dimension being checked>
Covered: <yes/partial/no>
Confidence: <0-100>
Gaps: <specific areas needing more research>
Recommendations: <specific queries or angles to pursue>
[/VALIDATION]`;
}

function strategistSystemPrompt(context: string): string {
  return `You are a specialized Strategist subagent. Your role is to:
1. Take research findings as input
2. Extract strategic insights for creative direction
3. Identify positioning gaps, emotional opportunities, and differentiation
4. Generate strategic recommendations

Context about this strategy task:
${context}

CONSTRAINTS:
- No tool use — you strategize from provided research only
- Think like a creative strategist, not a researcher
- Connect research to brand positioning and messaging
- Identify "white space" opportunities
- Look for emotional leverage, not just functional benefits
- Spot contradictions in positioning (competitor traps)
- Suggest creative angles

RESPONSE FORMAT:
[STRATEGY]
Opportunity: <strategic opportunity or gap>
Evidence: <research backing this up>
Recommended Angle: <creative direction>
Differentiation: <how to be unique>
Risk: <potential pitfalls>
[/STRATEGY]`;
}

function compressorSystemPrompt(context: string): string {
  return `You are a specialized Compressor subagent. Your role is to:
1. Take raw web page content or large research blocks
2. Extract ONLY the most relevant facts
3. Compress to minimal length while preserving information density
4. Preserve all sources

Context about this compression task:
${context}

CONSTRAINTS:
- Ultra-fast compression — aim for <200 words output
- Preserve numbers, dates, quotes, names
- Skip: navigation, ads, filler, boilerplate
- Always end facts with [Source: url]
- Output as bullet points only
- Be ruthless about what's irrelevant
- When in doubt about relevance, ask: "Does this affect ad strategy?"

RESPONSE FORMAT:
[COMPRESSED]
Key Facts:
- Fact 1 [Source: url]
- Fact 2 [Source: url]
...
[/COMPRESSED]`;
}

function evaluatorSystemPrompt(context: string): string {
  return `You are a specialized Evaluator subagent. Your role is to:
1. Take multiple options/concepts/findings as input
2. Score and rank them against criteria
3. Provide clear recommendation with trade-offs
4. Help decision-makers choose

Context about this evaluation task:
${context}

CONSTRAINTS:
- No tool use — you evaluate provided options only
- Use structured scoring (1-10 per dimension)
- Be explicit about trade-offs
- Highlight best-of-breed per category
- Flag close calls vs clear winners
- Consider execution feasibility, not just quality
- Recommend second place for A/B testing

RESPONSE FORMAT:
[EVALUATION]
Option: <option name>
Scores:
  Dimension 1: <1-10>
  Dimension 2: <1-10>
  ...
Total: <average>
Notes: <trade-offs and nuances>
Recommendation: <recommend or deprioritize>
[/EVALUATION]`;
}

// ─────────────────────────────────────────────────────────────
// Role Definitions
// ─────────────────────────────────────────────────────────────

export const SUBAGENT_ROLES: Record<SubagentRole, SubagentRoleConfig> = {
  researcher: {
    id: 'researcher',
    label: 'Researcher',
    description: 'Web search + page analysis + synthesis',
    systemPrompt: researcherSystemPrompt,
    allowedTools: ['web_search', 'analyze_page'],
    temperature: 0.5,
    maxTokens: 2000,
    priorityLevel: 'high',
    maxConcurrent: 5,
    estimatedDurationMs: 30000,
  },

  analyzer: {
    id: 'analyzer',
    label: 'Analyzer',
    description: 'Deep pattern analysis from findings',
    systemPrompt: analyzerSystemPrompt,
    allowedTools: [],
    temperature: 0.7,
    maxTokens: 1500,
    priorityLevel: 'normal',
    maxConcurrent: 3,
    estimatedDurationMs: 15000,
  },

  synthesizer: {
    id: 'synthesizer',
    label: 'Synthesizer',
    description: 'Merge + aggregate findings',
    systemPrompt: synthesizerSystemPrompt,
    allowedTools: [],
    temperature: 0.3,
    maxTokens: 2000,
    priorityLevel: 'normal',
    maxConcurrent: 2,
    estimatedDurationMs: 20000,
  },

  validator: {
    id: 'validator',
    label: 'Validator',
    description: 'Verify coverage + quality',
    systemPrompt: validatorSystemPrompt,
    allowedTools: [],
    temperature: 0.2,
    maxTokens: 1500,
    priorityLevel: 'high',
    maxConcurrent: 2,
    estimatedDurationMs: 15000,
  },

  strategist: {
    id: 'strategist',
    label: 'Strategist',
    description: 'Extract creative strategy from research',
    systemPrompt: strategistSystemPrompt,
    allowedTools: [],
    temperature: 0.8,
    maxTokens: 1800,
    priorityLevel: 'normal',
    maxConcurrent: 2,
    estimatedDurationMs: 20000,
  },

  compressor: {
    id: 'compressor',
    label: 'Compressor',
    description: 'Ultra-fast fact extraction',
    systemPrompt: compressorSystemPrompt,
    allowedTools: [],
    temperature: 0.1,
    maxTokens: 500,
    priorityLevel: 'low',
    maxConcurrent: 5,
    estimatedDurationMs: 5000,
  },

  evaluator: {
    id: 'evaluator',
    label: 'Evaluator',
    description: 'Score and rank options',
    systemPrompt: evaluatorSystemPrompt,
    allowedTools: [],
    temperature: 0.4,
    maxTokens: 1200,
    priorityLevel: 'normal',
    maxConcurrent: 2,
    estimatedDurationMs: 15000,
  },
};

/**
 * Get role config by ID
 */
export function getRoleConfig(roleId: SubagentRole): SubagentRoleConfig {
  return SUBAGENT_ROLES[roleId];
}

/**
 * Get allowed tools for a role
 */
export function getAllowedTools(roleId: SubagentRole): string[] {
  return SUBAGENT_ROLES[roleId].allowedTools;
}

/**
 * Check if a role can use a specific tool
 */
export function roleCanUse(roleId: SubagentRole, tool: string): boolean {
  return getAllowedTools(roleId).includes(tool);
}
