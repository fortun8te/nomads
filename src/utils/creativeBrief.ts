/**
 * creativeBrief — Synthesize raw research into a structured CreativeBrief artifact.
 *
 * Uses qwen3.5:4b to extract the most actionable insights from research
 * and desire-analysis output. The resulting CreativeBrief is a compact,
 * typed object that downstream stages (Brand DNA, Angles, Make, Test)
 * can consume instead of full raw research output.
 *
 * The brief includes:
 *   - Top 5 market insights
 *   - Customer psychology (desires, objections, verbatim quotes)
 *   - Competitor gaps
 *   - Recommended positioning statement
 */

import { ollamaService } from './ollama';
import { getResearchModelConfig, getThinkMode } from './modelConfig';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface CreativeBrief {
  /** Top 5 market insights distilled from research */
  topInsights: string[];
  /** Customer psychology extracted from desires + verbatim research */
  customerPsychology: {
    desires: string[];
    objections: string[];
    verbatimQuotes: string[];
  };
  /** Competitor positioning gaps — angles competitors are NOT owning */
  competitorGaps: string[];
  /** Single recommended brand positioning statement */
  recommendedPositioning: string;
  /** Unix timestamp (ms) when this brief was generated */
  generatedAt: number;
}

// ─────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────

const BRIEF_SYSTEM_PROMPT = `You are a creative strategist synthesizing research into a compact creative brief.
Output ONLY valid JSON matching this exact shape (no markdown, no extra keys):
{
  "topInsights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "customerPsychology": {
    "desires": ["desire 1", "desire 2", "desire 3"],
    "objections": ["objection 1", "objection 2", "objection 3"],
    "verbatimQuotes": ["exact quote 1", "exact quote 2", "exact quote 3"]
  },
  "competitorGaps": ["gap 1", "gap 2", "gap 3"],
  "recommendedPositioning": "one clear positioning statement"
}

Rules:
- topInsights: 5 concrete, specific market facts (numbers preferred)
- customerPsychology.desires: what the customer DEEPLY wants (not features)
- customerPsychology.objections: specific reasons they hesitate to buy
- customerPsychology.verbatimQuotes: copy exact quotes from research (use " characters)
- competitorGaps: angles no competitor currently owns — real differentiation opportunities
- recommendedPositioning: 1 sentence. Should be ownable and differentiated.
- Be ruthlessly specific. No vague generalities.`;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n[...truncated for context window]';
}

/** Build a fallback brief from raw text when JSON parsing fails. */
function buildFallbackBrief(_jsonText: string, rawResearch: string): CreativeBrief {
  // Try to pull any content that looks like quotes
  const quoteMatches = rawResearch.match(/"([^"]{20,200})"/g) || [];
  const quotes = quoteMatches
    .slice(0, 5)
    .map((q) => q.replace(/^"|"$/g, ''));

  // Pull first 5 bullet points from research as insights
  const bulletMatches = rawResearch.match(/^[-•]\s+(.+)/gm) || [];
  const insights = bulletMatches
    .slice(0, 5)
    .map((l) => l.replace(/^[-•]\s+/, '').trim());

  return {
    topInsights: insights.length > 0 ? insights : ['Research synthesis incomplete — see raw output'],
    customerPsychology: {
      desires: ['Deep transformation sought — see research'],
      objections: ['Skepticism about results — see research'],
      verbatimQuotes: quotes.length > 0 ? quotes.slice(0, 3) : [],
    },
    competitorGaps: ['Differentiation opportunities identified — see raw research'],
    recommendedPositioning: 'See research findings for positioning recommendation',
    generatedAt: Date.now(),
  };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Generate a structured CreativeBrief from research and desire-analysis output.
 *
 * Both inputs are truncated to fit within model context limits.
 * On JSON parse failure, returns a degraded fallback brief.
 *
 * @param researchOutput   Full research orchestrator output (may be large).
 * @param desireAnalysis   Phase 1 desire-driven analysis output.
 * @param options          Optional abort signal.
 * @returns                Typed CreativeBrief artifact.
 */
export async function generateCreativeBrief(
  researchOutput: string,
  desireAnalysis: string,
  options: { signal?: AbortSignal } = {},
): Promise<CreativeBrief> {
  const { signal } = options;

  // Truncate to keep within 4b's 32K context (prompt + system overhead)
  const researchTruncated = truncate(researchOutput, 10_000);
  const desireTruncated = truncate(desireAnalysis, 6_000);

  const userPrompt = `DESIRE ANALYSIS:
${desireTruncated}

RESEARCH FINDINGS:
${researchTruncated}

Synthesize the above into a CreativeBrief JSON object. Extract the most actionable insights.
Output ONLY the JSON object.`;

  let jsonBuffer = '';

  try {
    await ollamaService.generateStream(
      userPrompt,
      BRIEF_SYSTEM_PROMPT,
      {
        model: getResearchModelConfig().desireLayerModel, // qwen3.5:4b
        temperature: 0.3,
        num_predict: 1200,
        think: getThinkMode('synthesis'),
        signal,
        onChunk: (chunk) => {
          jsonBuffer += chunk;
        },
      },
    );

    // Extract JSON — model may wrap in markdown code fences
    const jsonMatch = jsonBuffer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[creativeBrief] No JSON found in model output — using fallback');
      return buildFallbackBrief(jsonBuffer, researchOutput);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<CreativeBrief> & {
      customerPsychology?: Partial<CreativeBrief['customerPsychology']>;
    };

    // Validate and fill missing fields
    const brief: CreativeBrief = {
      topInsights: Array.isArray(parsed.topInsights) && parsed.topInsights.length > 0
        ? parsed.topInsights.slice(0, 5)
        : ['See research findings'],
      customerPsychology: {
        desires: Array.isArray(parsed.customerPsychology?.desires)
          ? parsed.customerPsychology!.desires!.slice(0, 5)
          : [],
        objections: Array.isArray(parsed.customerPsychology?.objections)
          ? parsed.customerPsychology!.objections!.slice(0, 5)
          : [],
        verbatimQuotes: Array.isArray(parsed.customerPsychology?.verbatimQuotes)
          ? parsed.customerPsychology!.verbatimQuotes!.slice(0, 10)
          : [],
      },
      competitorGaps: Array.isArray(parsed.competitorGaps)
        ? parsed.competitorGaps.slice(0, 5)
        : [],
      recommendedPositioning: typeof parsed.recommendedPositioning === 'string' && parsed.recommendedPositioning.length > 0
        ? parsed.recommendedPositioning
        : 'See research for positioning guidance',
      generatedAt: Date.now(),
    };

    return brief;
  } catch (err) {
    if (signal?.aborted) throw err;
    console.error('[creativeBrief] generateCreativeBrief error:', err);
    return buildFallbackBrief(jsonBuffer, researchOutput);
  }
}

/**
 * Serialize a CreativeBrief to a compact text block suitable for
 * injection into LLM prompts (Make, Test, Angles stages).
 */
export function briefToPromptBlock(brief: CreativeBrief): string {
  const lines: string[] = [
    '=== CREATIVE BRIEF ===',
    '',
    'TOP MARKET INSIGHTS:',
    ...brief.topInsights.map((i, n) => `${n + 1}. ${i}`),
    '',
    'CUSTOMER DESIRES:',
    ...brief.customerPsychology.desires.map((d) => `- ${d}`),
    '',
    'PURCHASE OBJECTIONS:',
    ...brief.customerPsychology.objections.map((o) => `- ${o}`),
    '',
  ];

  if (brief.customerPsychology.verbatimQuotes.length > 0) {
    lines.push('VERBATIM CUSTOMER LANGUAGE:');
    brief.customerPsychology.verbatimQuotes.slice(0, 5).forEach((q) => {
      lines.push(`  "${q}"`);
    });
    lines.push('');
  }

  if (brief.competitorGaps.length > 0) {
    lines.push('COMPETITOR GAPS (unclaimed angles):');
    brief.competitorGaps.forEach((g) => lines.push(`- ${g}`));
    lines.push('');
  }

  lines.push(`RECOMMENDED POSITIONING:\n${brief.recommendedPositioning}`);
  lines.push('');
  lines.push('=== END BRIEF ===');

  return lines.join('\n');
}
