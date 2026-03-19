/**
 * Council Evaluator
 * Dispatches ad creative to each council member persona for independent evaluation
 * Aggregates their feedback into a unified assessment with consensus and outliers
 */

import { allCouncilPersonas } from "./councilPersonas";
import type { CouncilPersona, CouncilEvaluation } from "./councilPersonas";
import { ollamaService } from "./ollama";

export interface CreativeForEvaluation {
  headline: string;
  bodyText: string;
  cta: string;
  offer?: string;
  productName?: string;
  productCategory?: string;
  targetAudience?: string;
}

export interface CouncilReport {
  creative: CreativeForEvaluation;
  timestamp: string;
  evaluations: CouncilEvaluation[];
  consensus: {
    averageScore: number;
    topStrengths: string[];
    topGaps: string[];
    commonThemes: string[];
  };
  outliers: {
    highestScore: { persona: string; score: number };
    lowestScore: { persona: string; score: number };
    mostCritical: { persona: string; mainIssue: string };
  };
  recommendations: {
    priority: string[];
    quickWins: string[];
    structuralChanges: string[];
  };
}

/**
 * Build context string for the persona evaluation
 */
function buildEvaluationContext(creative: CreativeForEvaluation): string {
  return `
AD CREATIVE FOR EVALUATION:
═══════════════════════════════════════

Product: ${creative.productName || "Not specified"}
Category: ${creative.productCategory || "Not specified"}
Target Audience: ${creative.targetAudience || "Not specified"}

HEADLINE:
${creative.headline}

BODY TEXT:
${creative.bodyText}

OFFER:
${creative.offer || "Not specified"}

CALL-TO-ACTION:
${creative.cta}

═══════════════════════════════════════
`;
}

/**
 * Parse evaluation response from LLM
 * Expects JSON format matching CouncilEvaluation structure
 */
function parseEvaluationResponse(
  response: string,
  personaId: string,
  personaName: string
): CouncilEvaluation {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      personaId,
      personaName,
      score: Math.max(1, Math.min(10, parseInt(parsed.score) || 5)),
      findings: Array.isArray(parsed.findings)
        ? parsed.findings
        : [parsed.findings || "See recommendations"],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [parsed.recommendations || "Review findings"],
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths
        : [parsed.strengths || "Neutral"],
      gaps: Array.isArray(parsed.gaps)
        ? parsed.gaps
        : [parsed.gaps || "Review findings"],
    };
  } catch (error) {
    console.warn(
      `Failed to parse evaluation for ${personaName}:`,
      error,
      response
    );
    // Return neutral evaluation on parse failure
    return {
      personaId,
      personaName,
      score: 5,
      findings: ["Evaluation parsing failed; see raw output"],
      recommendations: ["Review response manually"],
      strengths: [],
      gaps: [],
    };
  }
}

/**
 * Evaluate creative with a single persona
 */
async function evaluateWithPersona(
  persona: CouncilPersona,
  creative: CreativeForEvaluation,
  model: string,
  abortSignal?: AbortSignal
): Promise<CouncilEvaluation> {
  const context = buildEvaluationContext(creative);

  const prompt = `${persona.systemPrompt}

${context}

Now evaluate this creative thoroughly. Return a JSON object with:
{
  "score": <1-10 number>,
  "findings": [<list of specific observations>],
  "recommendations": [<actionable improvements>],
  "strengths": [<what it does well>],
  "gaps": [<missing elements or weaknesses>]
}

Be specific. Cite exact phrases from the creative. Provide actionable feedback.`;

  try {
    let fullResponse = "";

    await ollamaService.generateStream(
      prompt,
      model,
      {
        temperature: 0.7,
        top_p: 0.9,
      },
      (chunk: string) => {
        fullResponse += chunk;
      },
      abortSignal
    );

    const evaluation = parseEvaluationResponse(
      fullResponse,
      persona.id,
      persona.name
    );
    return evaluation;
  } catch (error) {
    console.error(`Error evaluating with ${persona.name}:`, error);
    throw error;
  }
}

/**
 * Run full council evaluation on creative
 * Dispatches to all personas in parallel or sequence (configurable)
 */
export async function runCouncilEvaluation(
  creative: CreativeForEvaluation,
  options?: {
    model?: string;
    parallel?: boolean;
    personaIds?: string[]; // If specified, only evaluate with these personas
    onPersonaComplete?: (
      persona: CouncilPersona,
      evaluation: CouncilEvaluation
    ) => void;
    abortSignal?: AbortSignal;
  }
): Promise<CouncilReport> {
  const model = options?.model || "glm-4.7-flash:q4_K_M";
  const parallel = options?.parallel ?? false;
  const personaIds = options?.personaIds || allCouncilPersonas.map((p) => p.id);
  const abortSignal = options?.abortSignal;

  // Filter personas to evaluate
  const personasToEvaluate = allCouncilPersonas.filter((p) =>
    personaIds.includes(p.id)
  );

  const evaluations: CouncilEvaluation[] = [];

  try {
    if (parallel) {
      // Parallel evaluation
      const promises = personasToEvaluate.map((persona) =>
        evaluateWithPersona(persona, creative, model, abortSignal).then(
          (evaluation) => {
            evaluations.push(evaluation);
            options?.onPersonaComplete?.(persona, evaluation);
            return evaluation;
          }
        )
      );
      await Promise.all(promises);
    } else {
      // Sequential evaluation
      for (const persona of personasToEvaluate) {
        const evaluation = await evaluateWithPersona(
          persona,
          creative,
          model,
          abortSignal
        );
        evaluations.push(evaluation);
        options?.onPersonaComplete?.(persona, evaluation);
      }
    }
  } catch (error) {
    if (abortSignal?.aborted) {
      console.log("Council evaluation aborted");
    } else {
      throw error;
    }
  }

  // Build consensus and insights
  const report = buildCouncilReport(creative, evaluations);
  return report;
}

/**
 * Build consensus report from all evaluations
 */
function buildCouncilReport(
  creative: CreativeForEvaluation,
  evaluations: CouncilEvaluation[]
): CouncilReport {
  if (evaluations.length === 0) {
    return {
      creative,
      timestamp: new Date().toISOString(),
      evaluations: [],
      consensus: {
        averageScore: 0,
        topStrengths: [],
        topGaps: [],
        commonThemes: [],
      },
      outliers: {
        highestScore: { persona: "", score: 0 },
        lowestScore: { persona: "", score: 10 },
        mostCritical: { persona: "", mainIssue: "" },
      },
      recommendations: {
        priority: [],
        quickWins: [],
        structuralChanges: [],
      },
    };
  }

  // Calculate average score
  const scores = evaluations.map((e) => e.score);
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Find outliers
  const highestEval = evaluations.reduce((prev, current) =>
    prev.score > current.score ? prev : current
  );
  const lowestEval = evaluations.reduce((prev, current) =>
    prev.score < current.score ? prev : current
  );

  // Aggregate strengths and gaps
  const allStrengths = evaluations.flatMap((e) => e.strengths).filter(Boolean);
  const allGaps = evaluations.flatMap((e) => e.gaps).filter(Boolean);
  const allRecommendations = evaluations
    .flatMap((e) => e.recommendations)
    .filter(Boolean);

  // Find most common themes
  const strengthCounts = countOccurrences(allStrengths);
  const gapCounts = countOccurrences(allGaps);

  const topStrengths = Object.entries(strengthCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([text]) => text);

  const topGaps = Object.entries(gapCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([text]) => text);

  // Categorize recommendations
  const priority = allRecommendations.filter(
    (r) =>
      r.toLowerCase().includes("must") ||
      r.toLowerCase().includes("critical") ||
      r.toLowerCase().includes("fix")
  );
  const quickWins = allRecommendations.filter(
    (r) =>
      r.toLowerCase().includes("simple") ||
      r.toLowerCase().includes("add") ||
      r.toLowerCase().includes("easy") ||
      r.length < 100
  );
  const structuralChanges = allRecommendations.filter(
    (r) => r.toLowerCase().includes("reframe") || r.toLowerCase().includes("restructure")
  );

  // Identify most critical persona
  const mostCritical = evaluations.reduce((prev, current) =>
    current.gaps.length > prev.gaps.length ? current : prev
  );

  return {
    creative,
    timestamp: new Date().toISOString(),
    evaluations,
    consensus: {
      averageScore: Math.round(averageScore * 10) / 10,
      topStrengths,
      topGaps,
      commonThemes: extractCommonThemes(evaluations),
    },
    outliers: {
      highestScore: {
        persona: highestEval.personaName,
        score: highestEval.score,
      },
      lowestScore: {
        persona: lowestEval.personaName,
        score: lowestEval.score,
      },
      mostCritical: {
        persona: mostCritical.personaName,
        mainIssue: mostCritical.gaps[0] || "Multiple gaps identified",
      },
    },
    recommendations: {
      priority: [...new Set(priority)].slice(0, 3),
      quickWins: [...new Set(quickWins)].slice(0, 3),
      structuralChanges: [...new Set(structuralChanges)].slice(0, 3),
    },
  };
}

/**
 * Helper: Count occurrences of similar text
 */
function countOccurrences(items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = item.toLowerCase().trim();
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/**
 * Helper: Extract common themes across evaluations
 */
function extractCommonThemes(evaluations: CouncilEvaluation[]): string[] {
  // Look for patterns in persona agreement
  const themes: string[] = [];

  // Check if multiple personas mentioned similar issues
  const allFindings = evaluations.flatMap((e) => e.findings);
  const findingCounts = countOccurrences(allFindings);

  // If multiple personas mentioned same issue, it's a theme
  for (const [finding, count] of Object.entries(findingCounts)) {
    if (count >= 2 && finding.length > 20) {
      themes.push(finding);
    }
  }

  return themes.slice(0, 3);
}

/**
 * Helper: Generate executive summary
 */
export function generateCouncilSummary(report: CouncilReport): string {
  const { consensus, evaluations, recommendations } = report;

  const summary = `
COUNCIL EVALUATION SUMMARY
═════════════════════════════════════════

Average Score: ${consensus.averageScore}/10
Evaluators: ${evaluations.length} personas

TOP STRENGTHS:
${consensus.topStrengths.map((s) => `• ${s}`).join("\n")}

TOP GAPS:
${consensus.topGaps.map((g) => `• ${g}`).join("\n")}

PRIORITY RECOMMENDATIONS:
${recommendations.priority.map((r) => `• ${r}`).join("\n")}

QUICK WINS:
${recommendations.quickWins.map((w) => `• ${w}`).join("\n")}

═════════════════════════════════════════
  `;

  return summary;
}
