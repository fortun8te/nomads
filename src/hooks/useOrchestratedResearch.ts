import { orchestrator, type OrchestratorState } from '../utils/researchAgents';
import { useResearchAgent } from './useResearchAgent';
import { runCouncil, extractFindingsFromVerdict, type CouncilVerdict } from '../utils/council';
import { getResearchModelConfig, getResearchLimits, getActiveResearchPreset } from '../utils/modelConfig';
import { createResearchAudit, buildResearchAuditTrail, recordResearchModel } from '../utils/researchAudit';
import type { Campaign, ResearchFindings } from '../types';

interface OrchestratedResearchResult {
  processedOutput: string;
  rawOutput: string;
  model: string;
  processingTime: number;
  researchFindings: ResearchFindings;
}

/**
 * Orchestrated Research Hook
 *
 * FLIPPED FLOW — Web research first, then brains analyze enriched data:
 *   Phase 1: Web Research — gather real-world data (Wayfayer + SearXNG)
 *   Phase 2: Desire-Driven Deep Dive — 4-layer structured analysis
 *   Phase 3: Council of Marketing Brains — 7 brains analyze sequentially with all data
 *   Phase 4: Council Re-run — if confidence < 8, re-analyze with all context
 *   Phase 5: Competitor Ad Intelligence — optional
 *
 * The council verdict feeds ALL downstream stages.
 */
export function useOrchestratedResearch() {
  const { executeResearch: executeDesireResearch } = useResearchAgent();

  const executeOrchestratedResearch = async (
    campaign: Campaign,
    onProgress?: (msg: string) => void,
    enableWebSearch: boolean = true,
    onPauseForInput?: (event: any) => Promise<string>,
    signal?: AbortSignal
  ): Promise<OrchestratedResearchResult> => {
    const startTime = Date.now();
    const limits = getResearchLimits();
    const activePreset = getActiveResearchPreset();
    const researchConfig = getResearchModelConfig();

    // Initialize audit trail to track all sources and tokens
    createResearchAudit();
    recordResearchModel(researchConfig.orchestratorModel);
    recordResearchModel(researchConfig.compressionModel);
    recordResearchModel(researchConfig.desireLayerModel);

    onProgress?.('\n════════════════════════════════════════════════════════════════════\n');
    onProgress?.(`ORCHESTRATED RESEARCH [${activePreset.toUpperCase()}]: Web → Analysis → Council\n`);
    onProgress?.(`Models: orch=${researchConfig.orchestratorModel} comp=${researchConfig.compressionModel} synth=${researchConfig.researcherSynthesisModel}\n`);
    onProgress?.(`Limits: ${limits.maxIterations} iters, ${limits.minSources} sources, ${limits.maxVisualBatches} visual batches\n`);
    onProgress?.('════════════════════════════════════════════════════════════════════\n\n');

    // Initialize findings
    let researchFindings: ResearchFindings = {
      deepDesires: [],
      objections: [],
      avatarLanguage: [],
      whereAudienceCongregates: [],
      whatTheyTriedBefore: [],
      competitorWeaknesses: [],
    };

    let councilVerdict: CouncilVerdict | null = null;
    let councilOutput = '';
    let webResearchContext = ''; // Accumulated web findings text — fed into desire analysis + council

    // ──────────────────────────────────────────────────
    // PHASE 1: Web Research — gather real-world data FIRST
    // This gives brains actual data to analyze instead of guessing
    // ──────────────────────────────────────────────────
    if (enableWebSearch && !signal?.aborted) {
      onProgress?.('[PHASE 1] Web Research — Gathering real-world intelligence\n\n');

      const researchGoals = [
        'Find VERBATIM customer language — how real people describe this problem on Reddit, forums, Trustpilot (NOT brand language)',
        'Research competitor ADVERTISING — Meta Ad Library, ad hooks, what visuals/angles are running now',
        'Find NEGATIVE REVIEWS of competitors — Trustpilot 1-star, Amazon complaints, Reddit rants',
        'Validate TURNING POINTS — when does this pain become unbearable? What triggers the purchase?',
        'Research FAILED SOLUTIONS — what specific products did people try before? Why did they fail?',
        'Identify market trends, growth rates, and new entrants disrupting the space',
        'Find competitor STRUCTURAL WEAKNESSES — what can they NEVER claim?',
        'Analyze pricing strategies, willingness-to-pay, and value perception',
        'Research ADJACENT NICHES — what approaches from other industries could work here?',
      ];

      const orchestratorState: OrchestratorState = {
        campaign,
        researchGoals,
        completedResearch: [],
        coverageThreshold: getResearchLimits().coverageThreshold,
      };

      try {
        const webResearchResults = await orchestrator.orchestrateResearch(
          orchestratorState,
          (msg) => {
            councilOutput += msg;
            onProgress?.(msg);
          },
          onPauseForInput,
          signal
        );

        onProgress?.('\n[PHASE 1 COMPLETE] Web research done.\n\n');

        // ── Extract structured data from web research ──
        // Build a context string with ALL findings for downstream consumption
        const findingsBlocks: string[] = [];
        webResearchResults.forEach((r) => {
          if (r.findings && r.findings.length > 50) {
            findingsBlocks.push(`[Research: ${r.query}]\n${r.findings}`);
          }
        });
        webResearchContext = findingsBlocks.join('\n\n---\n\n');

        // Extract structured findings from web research text using keyword heuristics
        const allFindings = webResearchResults.map(r => r.findings).join('\n');

        // Extract verbatim language (look for quoted text in web findings)
        const verbatimMatches = allFindings.match(/"([^"]{10,200})"/g);
        if (verbatimMatches) {
          researchFindings.avatarLanguage = verbatimMatches
            .map(m => m.replace(/^"|"$/g, ''))
            .filter(m => m.length > 10 && m.length < 200)
            .slice(0, 15);
        }

        // Extract competitor mentions
        const competitorWeaknesses: string[] = [];
        const weaknessPatterns = [/weakness[es]*[:.\s]+([^\n]+)/gi, /gap[s]*[:.\s]+([^\n]+)/gi, /can(?:'t| not|never)\s+claim\s+([^\n]+)/gi, /structural(?:ly)?\s+(?:limited|trapped|constrained)\s*[:.\s]+([^\n]+)/gi];
        for (const pat of weaknessPatterns) {
          let m;
          while ((m = pat.exec(allFindings)) !== null) {
            if (m[1]?.trim().length > 10) competitorWeaknesses.push(m[1].trim());
          }
        }
        if (competitorWeaknesses.length > 0) {
          researchFindings.competitorWeaknesses = competitorWeaknesses.slice(0, 10);
        }

        // Extract where audience congregates from web findings
        const communityPatterns = [/r\/\w+/g, /facebook\s+group[s]*\s*[:.\-]?\s*"?([^"\n]+)/gi, /subreddit[s]*[:.\s]+([^\n]+)/gi];
        const communities: string[] = [];
        for (const pat of communityPatterns) {
          const matches = allFindings.match(pat);
          if (matches) communities.push(...matches.map(m => m.trim()));
        }
        if (communities.length > 0) {
          researchFindings.whereAudienceCongregates = [...new Set(communities)].slice(0, 10);
        }

        // Merge visual findings if captured
        const visualFindings = orchestratorState._visualFindings;
        if (visualFindings) {
          researchFindings.visualFindings = visualFindings;
        }

        // Summary for output
        const totalSources = new Set(webResearchResults.flatMap(r => r.sources)).size;
        onProgress?.(`Web research extracted: ${researchFindings.avatarLanguage.length} verbatim quotes, ${researchFindings.competitorWeaknesses.length} competitor weaknesses, ${researchFindings.whereAudienceCongregates.length} communities, ${totalSources} unique sources\n`);
        onProgress?.(`Web context: ${(webResearchContext.length / 1000).toFixed(0)}K chars available for downstream phases\n\n`);

        // ── Structured phase summary for UI ──
        const summaryLines = [
          `\n${'═'.repeat(68)}`,
          `WEB RESEARCH FINDINGS SUMMARY`,
          `${'═'.repeat(68)}`,
          `Sources scraped: ${totalSources} unique URLs`,
          `Queries completed: ${webResearchResults.length}`,
          `Web context: ${(webResearchContext.length / 1000).toFixed(0)}K chars`,
          ``,
          `Extracted:`,
          `  Verbatim quotes: ${researchFindings.avatarLanguage.length}`,
          `  Competitor weaknesses: ${researchFindings.competitorWeaknesses.length}`,
          `  Communities found: ${researchFindings.whereAudienceCongregates.length}`,
        ];
        if (researchFindings.avatarLanguage.length > 0) {
          summaryLines.push(`  Sample language: "${researchFindings.avatarLanguage[0]}"`);
        }
        if (researchFindings.competitorWeaknesses.length > 0) {
          summaryLines.push(`  Top weakness: ${researchFindings.competitorWeaknesses[0]}`);
        }
        summaryLines.push('');
        const summaryText = summaryLines.join('\n');
        onProgress?.(summaryText);
        councilOutput += summaryText;
      } catch (err) {
        if (signal?.aborted) throw err;
        const errMsg = err instanceof Error ? err.message : String(err);
        onProgress?.(`\n[PHASE 1 ERROR] Web research failed: ${errMsg}\n`);
        onProgress?.('  → Is Wayfayer running on port 8889? Is SearXNG up on port 8888?\n');
        onProgress?.('  → Continuing with LLM analysis only.\n\n');
        console.error('Web research error:', err);
      }
    }

    // ──────────────────────────────────────────────────
    // PHASE 2: Desire-Driven Deep Dive (4-layer analysis)
    // Now has web data to work with for enriched analysis
    // ──────────────────────────────────────────────────
    if (!signal?.aborted) {
      onProgress?.('[PHASE 2] Desire-Driven Deep Dive (4-Layer Analysis)\n\n');

      try {
        const desireResult = await executeDesireResearch(
          campaign,
          (msg) => onProgress?.(msg),
          researchConfig.desireLayerModel,
          signal,
          webResearchContext || undefined  // Pass web findings so desire analysis uses real data
        );

        if (desireResult.researchFindings) {
          // Merge desire findings
          researchFindings = {
            ...researchFindings,
            deepDesires: desireResult.researchFindings.deepDesires || researchFindings.deepDesires,
            objections: desireResult.researchFindings.objections || researchFindings.objections,
            avatarLanguage: [
              ...researchFindings.avatarLanguage,
              ...(desireResult.researchFindings.avatarLanguage || []),
            ].filter((v, i, a) => a.indexOf(v) === i),
            whereAudienceCongregates: desireResult.researchFindings.whereAudienceCongregates || [],
            whatTheyTriedBefore: desireResult.researchFindings.whatTheyTriedBefore || [],
            competitorWeaknesses: [
              ...researchFindings.competitorWeaknesses,
              ...(desireResult.researchFindings.competitorWeaknesses || []),
            ].filter((v, i, a) => a.indexOf(v) === i),
            marketSophistication: desireResult.researchFindings.marketSophistication,
            rootCauseMechanism: desireResult.researchFindings.rootCauseMechanism,
            persona: desireResult.researchFindings.persona,
            purchaseJourney: desireResult.researchFindings.purchaseJourney,
            emotionalLandscape: desireResult.researchFindings.emotionalLandscape,
            competitivePositioning: desireResult.researchFindings.competitivePositioning,
          };
          councilOutput += '\n' + desireResult.processedOutput;
        }

        onProgress?.('\n[PHASE 2 COMPLETE] Deep desire analysis done.\n\n');
      } catch (err) {
        if (signal?.aborted) throw err;
        const errMsg = err instanceof Error ? err.message : String(err);
        onProgress?.(`\n[PHASE 2 ERROR] Desire analysis failed: ${errMsg}\n`);
        onProgress?.('  → Continuing with web findings only.\n\n');
        console.error('Desire research error:', err);
      }
    }

    // ──────────────────────────────────────────────────
    // PHASE 3: Council of Marketing Brains
    // NOW has web data + desire findings to analyze — much richer context
    // 7 brains (sequential) → 3 heads → 1 verdict
    // ──────────────────────────────────────────────────
    if (!signal?.aborted) {
      onProgress?.('[PHASE 3] Council of Marketing Brains — 7 Brains Analyzing (Sequential)\n\n');

      try {
        // Get competitor screenshots if available (for Visual Brain)
        const competitorScreenshots = campaign.referenceImages
          ?.filter(img => img.type === 'layout' || img.type === 'product')
          .map(img => img.base64)
          .filter(Boolean) as string[] | undefined;

        councilVerdict = await runCouncil(
          campaign,
          researchFindings,  // NOW enriched with web data + desire analysis
          (msg) => {
            councilOutput += msg;
            onProgress?.(msg);
          },
          signal,
          {
            maxIterations: 2,  // Allow council to iterate if confidence is low
            confidenceThreshold: 7,
            competitorScreenshots,
          }
        );

        // Extract findings from council
        const councilFindings = extractFindingsFromVerdict(councilVerdict);
        researchFindings = { ...researchFindings, ...councilFindings };
        researchFindings.councilVerdict = councilVerdict;

        onProgress?.('\n[PHASE 3 COMPLETE] Council verdict delivered.\n\n');
      } catch (err) {
        if (signal?.aborted) throw err;
        const errMsg = err instanceof Error ? err.message : String(err);
        onProgress?.(`\n[COUNCIL ERROR] Council failed: ${errMsg}\n`);
        onProgress?.('  → Is Ollama running? Check the connection at Settings → Ollama URL\n');
        onProgress?.('  → Using web + desire findings only.\n\n');
        console.error('Council error:', err);
      }
    }

    // ──────────────────────────────────────────────────
    // PHASE 4: Competitor Ad Intelligence (optional)
    // ──────────────────────────────────────────────────
    if (!signal?.aborted && researchFindings.competitorWeaknesses.length > 0) {
      onProgress?.(`${'═'.repeat(68)}\n`);
      onProgress?.('[PHASE 4] Competitor Ad Intelligence\n');
      onProgress?.(`${'═'.repeat(68)}\n\n`);
      try {
        const { analyzeCompetitorAds } = await import('../utils/competitorAdsAgent');
        const competitorAds = await analyzeCompetitorAds(
          campaign,
          researchFindings,
          (msg) => {
            councilOutput += msg;
            onProgress?.(msg);
          },
          signal
        );
        researchFindings.competitorAds = competitorAds;
        const totalAds = competitorAds.competitors.reduce((s: number, c: any) => s + c.adExamples.length, 0);
        onProgress?.(`\n[PHASE 4 COMPLETE] ${totalAds} ad examples across ${competitorAds.competitors.length} competitors | ${competitorAds.visionAnalyzed} vision-analyzed\n\n`);
      } catch (err) {
        onProgress?.('[PHASE 4] Competitor ad intelligence skipped\n\n');
        console.warn('Competitor ads phase failed:', err);
      }
    }

    // ──────────────────────────────────────────────────
    // VALIDATION: Warn if findings are minimal
    // ──────────────────────────────────────────────────
    const findingsScore =
      (researchFindings.deepDesires.length > 0 ? 1 : 0) +
      (researchFindings.objections.length > 0 ? 1 : 0) +
      (researchFindings.avatarLanguage.length > 0 ? 1 : 0) +
      (researchFindings.competitorWeaknesses.length > 0 ? 1 : 0) +
      (researchFindings.rootCauseMechanism ? 1 : 0) +
      (researchFindings.persona ? 1 : 0);

    if (findingsScore < 3) {
      onProgress?.(`\n[WARNING] Research findings are thin (${findingsScore}/6 categories populated).\n`);
      onProgress?.('  → Downstream stages will generate based on campaign brief instead.\n');
      onProgress?.('  → For better results: check Ollama connection, try different models, or add more product details.\n\n');
    }

    // ──────────────────────────────────────────────────
    // SYNTHESIS: Final output
    // ──────────────────────────────────────────────────
    const verdictSummary = councilVerdict ? `
${'═'.repeat(68)}
COUNCIL VERDICT (Confidence: ${councilVerdict.confidenceScore}/10)
${'═'.repeat(68)}

Strategic Direction: ${councilVerdict.strategicDirection}
Primary Ad Type: ${councilVerdict.primaryAdType}
Secondary Ad Type: ${councilVerdict.secondaryAdType}
Headline Hook: ${councilVerdict.headlineStrategy.hookType} — ${councilVerdict.headlineStrategy.why}
Headlines: ${councilVerdict.headlineStrategy.examples.join(' | ')}
Offer: ${councilVerdict.offerStructure}
Visual Concept: ${councilVerdict.visualConcept}
Audience Language: ${councilVerdict.audienceLanguage.join(', ')}

Key Insights:
${councilVerdict.keyInsights.map((i, idx) => `  ${idx + 1}. ${i}`).join('\n')}

Avoid:
${councilVerdict.avoidList.map(a => `  - ${a}`).join('\n')}

Dissent (where brains disagreed):
${councilVerdict.dissent.map(d => `  - ${d}`).join('\n')}
` : '';

    const finalOutput = councilOutput + verdictSummary + `
${'═'.repeat(68)}
RESEARCH COMPLETE
${'═'.repeat(68)}

Phases completed:
- Phase 1: Web research (Wayfayer + SearXNG) — ${new Set(([] as string[]).concat(...(researchFindings.avatarLanguage || []))).size > 0 ? 'verbatim data gathered' : 'web data gathered'}
- Phase 2: 4-layer desire analysis — desires, root cause, objections, market
- Phase 3: Council of Marketing Brains — 7 brains → 3 heads → verdict
${researchFindings.visualFindings ? '- Visual competitive intelligence\n' : ''}${researchFindings.competitorAds ? '- Competitor ad intelligence\n' : ''}
Ready for: Brand DNA → Persona DNA → Angles`;

    onProgress?.('\nRESEARCH COMPLETE\n');
    onProgress?.(`${'═'.repeat(68)}\n\n`);

    // Finalize audit trail
    const auditTrail = buildResearchAuditTrail();
    if (auditTrail) {
      researchFindings.auditTrail = auditTrail;
      onProgress?.(`\n[AUDIT] Research provenance: ${auditTrail.totalSources} sources, ${auditTrail.totalTokensGenerated} tokens generated\n`);
    }

    return {
      processedOutput: finalOutput,
      rawOutput: finalOutput,
      model: `wayfarer + council + ${researchConfig.orchestratorModel}`,
      processingTime: Date.now() - startTime,
      researchFindings,
    };
  };

  return {
    executeOrchestratedResearch,
  };
}
