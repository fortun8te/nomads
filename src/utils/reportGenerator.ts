/**
 * Report Generator — Produces a mini research paper from findings
 * 3-pass LLM pipeline: insights → contradictions → methodology
 */

import type {
  ResearchFindings,
  ResearchAuditTrail,
  ResearchReport,
  KeyInsight,
  Contradiction,
  SourceCitation,
} from '../types';
import { ollamaService } from './ollama';
import { getResearchModelConfig } from './modelConfig';

/**
 * Generate a complete research report from findings + audit trail.
 * Streams progress via onChunk for live UI updates.
 */
export async function generateResearchReport(
  findings: ResearchFindings,
  auditTrail: ResearchAuditTrail | undefined,
  knowledgeStateSummary: string,
  signal?: AbortSignal,
  onChunk?: (text: string) => void
): Promise<ResearchReport> {
  const config = getResearchModelConfig();
  const bigModel = config.orchestratorModel;
  const smallModel = config.compressionModel;

  onChunk?.('\n[REPORT] Generating research report...\n');

  // ── Pass 1: Executive Summary + Key Insights ──
  onChunk?.('[REPORT] Pass 1/3: Executive summary + key insights\n');

  const sourceSummary = auditTrail
    ? `Sources analyzed: ${auditTrail.totalSources} URLs across ${Object.keys(auditTrail.sourcesByType).join(', ')} types.\nIterations: ${auditTrail.iterationsCompleted}\nCoverage: ${Math.round(auditTrail.coverageAchieved * 100)}%`
    : 'Source metadata unavailable';

  const findingsSummary = buildFindingsSummary(findings);

  const pass1Prompt = `You are a senior research analyst writing an executive report.

RESEARCH DATA:
${knowledgeStateSummary.slice(0, 12000)}

FINDINGS SUMMARY:
${findingsSummary.slice(0, 8000)}

${sourceSummary}

Generate a research report in this EXACT JSON format:
{
  "executiveSummary": "2-3 paragraphs summarizing the most important findings. Include specific numbers, named sources, and direct quotes.",
  "keyInsights": [
    {
      "category": "market|audience|competitor|emotional|behavioral|opportunity",
      "insight": "Specific, actionable insight with data",
      "supportingSources": ["url1", "url2"],
      "confidence": 85,
      "verbatimEvidence": ["direct quote from source"]
    }
  ]
}

RULES:
- Minimum 8 key insights across at least 4 categories
- Every insight MUST have at least 1 supporting source URL
- Confidence scores: 90+ for well-sourced facts, 70-89 for triangulated claims, 50-69 for single-source claims
- Executive summary must reference specific data points, not generalities
- Return ONLY valid JSON`;

  let pass1Response = '';
  const pass1Result = await ollamaService.generateStream(
    pass1Prompt,
    'Generate a research report with executive summary and key insights.',
    {
      model: bigModel,
      temperature: 0.4,
      signal,
      onChunk: (chunk) => {
        pass1Response += chunk;
        onChunk?.(chunk);
      },
    }
  );

  const pass1Data = parseJSON<{
    executiveSummary: string;
    keyInsights: KeyInsight[];
  }>(pass1Result, { executiveSummary: '', keyInsights: [] });

  // ── Pass 2: Contradictions + Confidence Scoring ──
  onChunk?.('\n\n[REPORT] Pass 2/3: Contradictions + confidence scoring\n');

  const pass2Prompt = `You are a skeptical research auditor. Your job is to find CONTRADICTIONS in the research.

RESEARCH INSIGHTS:
${JSON.stringify(pass1Data.keyInsights.slice(0, 15), null, 2).slice(0, 6000)}

KNOWLEDGE STATE:
${knowledgeStateSummary.slice(0, 6000)}

Find where sources DISAGREE. Generate JSON:
{
  "contradictions": [
    {
      "topic": "what they disagree about",
      "claimA": { "text": "first claim", "source": "url or source name" },
      "claimB": { "text": opposing claim", "source": "url or source name" },
      "resolution": "which is more likely correct and why"
    }
  ],
  "confidenceByDimension": {
    "market_size": 85,
    "audience_behavior": 72,
    "competitor_landscape": 90,
    "emotional_drivers": 65,
    "purchase_journey": 58,
    "pricing": 80
  },
  "overallConfidence": 75
}

RULES:
- Find at least 3 contradictions (most research has them)
- Be skeptical — single-source claims get low confidence
- Consider recency bias, survivorship bias, sample size issues
- Return ONLY valid JSON`;

  const pass2Result = await ollamaService.generateStream(
    pass2Prompt,
    'Find contradictions and assess confidence in the research.',
    {
      model: bigModel,
      temperature: 0.3,
      signal,
      onChunk: (chunk) => onChunk?.(chunk),
    }
  );

  const pass2Data = parseJSON<{
    contradictions: Contradiction[];
    confidenceByDimension: Record<string, number>;
    overallConfidence: number;
  }>(pass2Result, { contradictions: [], confidenceByDimension: {}, overallConfidence: 50 });

  // ── Pass 3: Methodology + Limitations ──
  onChunk?.('\n\n[REPORT] Pass 3/3: Methodology + limitations\n');

  const pass3Prompt = `Describe the research methodology and limitations.

METADATA:
- Total sources: ${auditTrail?.totalSources || 'unknown'}
- Source types: ${auditTrail ? Object.entries(auditTrail.sourcesByType).map(([k, v]) => `${k}: ${v}`).join(', ') : 'unknown'}
- Models used: ${auditTrail?.modelsUsed?.join(', ') || 'unknown'}
- Duration: ${auditTrail ? Math.round(auditTrail.researchDuration / 60000) + ' minutes' : 'unknown'}
- Iterations: ${auditTrail?.iterationsCompleted || 'unknown'}
- Coverage: ${auditTrail ? Math.round(auditTrail.coverageAchieved * 100) + '%' : 'unknown'}
- Preset: ${auditTrail?.preset || 'unknown'}

Generate JSON:
{
  "methodology": "2-3 sentences describing how the research was conducted",
  "limitations": ["limitation 1", "limitation 2", ...]
}

Include limitations like: geographic bias, language bias, recency of sources, sample size, AI hallucination risk, missing source types.
Return ONLY valid JSON.`;

  const pass3Result = await ollamaService.generateStream(
    pass3Prompt,
    'Describe research methodology and limitations.',
    {
      model: smallModel,
      temperature: 0.3,
      signal,
      onChunk: (chunk) => onChunk?.(chunk),
    }
  );

  const pass3Data = parseJSON<{
    methodology: string;
    limitations: string[];
  }>(pass3Result, { methodology: '', limitations: [] });

  // ── Build source citations ──
  const sourceCitations = buildSourceCitations(auditTrail, pass1Data.keyInsights);

  // ── Assemble final report ──
  const report: ResearchReport = {
    executiveSummary: pass1Data.executiveSummary,
    keyInsights: pass1Data.keyInsights,
    sources: sourceCitations,
    contradictions: pass2Data.contradictions,
    confidenceScore: pass2Data.overallConfidence,
    confidenceByDimension: pass2Data.confidenceByDimension,
    methodology: pass3Data.methodology,
    limitations: pass3Data.limitations,
    generatedAt: Date.now(),
  };

  onChunk?.(`\n\n[REPORT] Complete: ${report.keyInsights.length} insights, ${report.contradictions.length} contradictions, ${report.confidenceScore}% confidence\n`);

  return report;
}

/** Build a text summary of findings for the LLM */
function buildFindingsSummary(findings: ResearchFindings): string {
  const parts: string[] = [];

  if (findings.deepDesires?.length) {
    parts.push(`DEEP DESIRES (${findings.deepDesires.length}):`);
    for (const d of findings.deepDesires.slice(0, 5)) {
      parts.push(`  - ${d.surfaceProblem} → ${d.deepestDesire} [${d.desireIntensity}]`);
    }
  }

  if (findings.objections?.length) {
    parts.push(`\nOBJECTIONS (${findings.objections.length}):`);
    for (const o of findings.objections.slice(0, 8)) {
      parts.push(`  - ${o.objection} [${o.frequency}/${o.impact}]`);
    }
  }

  if (findings.verbatimQuotes?.length) {
    parts.push(`\nVERBATIM QUOTES (${findings.verbatimQuotes.length}):`);
    for (const q of findings.verbatimQuotes.slice(0, 10)) {
      parts.push(`  "${q}"`);
    }
  }

  if (findings.competitorWeaknesses?.length) {
    parts.push(`\nCOMPETITOR WEAKNESSES: ${findings.competitorWeaknesses.join(', ')}`);
  }

  if (findings.purchaseJourney) {
    parts.push(`\nPURCHASE JOURNEY:`);
    parts.push(`  Search terms: ${findings.purchaseJourney.searchTerms?.join(', ')}`);
    parts.push(`  Review sites: ${findings.purchaseJourney.reviewSites?.join(', ')}`);
  }

  if (findings.emotionalLandscape) {
    parts.push(`\nEMOTIONAL LANDSCAPE:`);
    parts.push(`  Primary: ${findings.emotionalLandscape.primaryEmotion}`);
    parts.push(`  Secondary: ${findings.emotionalLandscape.secondaryEmotions?.join(', ')}`);
  }

  if (findings.competitivePositioning?.length) {
    parts.push(`\nCOMPETITIVE POSITIONING (${findings.competitivePositioning.length}):`);
    for (const c of findings.competitivePositioning.slice(0, 5)) {
      parts.push(`  - ${c.name}: ${c.positioning} | weakness: ${c.structuralWeakness}`);
    }
  }

  return parts.join('\n');
}

/** Build source citations from audit trail */
function buildSourceCitations(
  auditTrail: ResearchAuditTrail | undefined,
  insights: KeyInsight[]
): SourceCitation[] {
  if (!auditTrail?.sourceList) return [];

  // Map URLs to insight indices
  const urlToInsights = new Map<string, number[]>();
  for (let i = 0; i < insights.length; i++) {
    for (const url of insights[i].supportingSources || []) {
      if (!urlToInsights.has(url)) urlToInsights.set(url, []);
      urlToInsights.get(url)!.push(i);
    }
  }

  return auditTrail.sourceList.slice(0, 100).map(src => ({
    url: src.url,
    title: src.extractedSnippet?.slice(0, 80) || src.url,
    relevanceScore: urlToInsights.has(src.url) ? 90 : 50,
    citedInInsights: urlToInsights.get(src.url) || [],
    fetchedAt: src.fetchedAt,
    contentType: src.source,
  }));
}

/** Safely parse JSON from LLM output */
function parseJSON<T>(text: string, fallback: T): T {
  try {
    // Find JSON object in the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {
    // Try to fix common issues
    try {
      const cleaned = text
        .replace(/```json?\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch { /* fall through */ }
  }
  return fallback;
}
