import { orchestrator, type OrchestratorState } from '../utils/researchAgents';
import { useResearchAgent } from './useResearchAgent';
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
 * Combines desire-driven research with web-searching researcher agents
 * glm-4.7 orchestrates multiple lfm-2.5 researchers
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

    onProgress?.('\n════════════════════════════════════════════════════════════════════\n');
    onProgress?.('ORCHESTRATED RESEARCH: Desire-Driven Analysis + Web Search Agents\n');
    onProgress?.('════════════════════════════════════════════════════════════════════\n\n');

    // Phase 1: Execute Desire-Driven Research
    onProgress?.('[PHASE 1] Running Desire-Driven Research (Deep Desires, Objections, Audience)\n\n');
    const desireResult = await executeDesireResearch(
      campaign,
      (msg) => onProgress?.(msg),
      'glm-4.7-flash:q4_K_M',
      signal
    );

    if (!desireResult.researchFindings) {
      return {
        processedOutput: desireResult.processedOutput,
        rawOutput: desireResult.rawOutput,
        model: desireResult.model,
        processingTime: Date.now() - startTime,
        researchFindings: {
          deepDesires: [],
          objections: [],
          avatarLanguage: [],
          whereAudienceCongregates: [],
          whatTheyTriedBefore: [],
          competitorWeaknesses: [],
        },
      };
    }

    onProgress?.('\n[PHASE 1 COMPLETE] Desire-driven research done.\n\n');

    // Phase 2: Web Search Orchestration (if enabled)
    if (!enableWebSearch) {
      onProgress?.('[WEB SEARCH] Skipped. Using desire-driven findings only.\n\n');
      return {
        processedOutput: desireResult.processedOutput,
        rawOutput: desireResult.rawOutput,
        model: desireResult.model,
        processingTime: Date.now() - startTime,
        researchFindings: desireResult.researchFindings,
      };
    }

    onProgress?.('[PHASE 2] Orchestrating Web Search Researchers\n');
    onProgress?.(
      'glm-4.7 orchestrator deciding what additional research is needed...\n\n'
    );

    const orchestratorState: OrchestratorState = {
      campaign,
      researchGoals: [
        'Find VERBATIM customer language — how real people describe this problem on Reddit, forums, Trustpilot (NOT brand language)',
        'Research competitor ADVERTISING — Meta Ad Library, ad hooks, what visuals/angles are running now',
        'Find NEGATIVE REVIEWS of competitors — Trustpilot 1-star, Amazon complaints, Reddit rants',
        'Validate TURNING POINTS — when does this pain become unbearable? What triggers the purchase?',
        'Research FAILED SOLUTIONS — what specific products did people try before? Why did they fail?',
        'Identify market trends, growth rates, and new entrants disrupting the space',
        'Find competitor STRUCTURAL WEAKNESSES — what can they NEVER claim?',
        'Analyze pricing strategies, willingness-to-pay, and value perception',
        'Research ADJACENT NICHES — what approaches from other industries could work here?',
      ],
      completedResearch: [],
      coverageThreshold: 0.8, // Orchestrator needs 80%+ dimensional coverage
    };

    try {
      const webResearchResults = await orchestrator.orchestrateResearch(
        orchestratorState,
        (msg) => onProgress?.(msg),
        onPauseForInput,
        signal
      );

      onProgress?.('\n[PHASE 2 COMPLETE] Web research orchestration done.\n\n');

      // Combine findings
      const combinedOutput = `${desireResult.processedOutput}

════════════════════════════════════════════════════════════════════
WEB RESEARCH FINDINGS (via Researcher Agents)
════════════════════════════════════════════════════════════════════

${webResearchResults.map((r, i) => {
  const coveredDims = Object.values(r.coverage_graph).filter(Boolean).length;
  const totalDims = Object.keys(r.coverage_graph).length;
  return `[Research ${i + 1}] ${r.query}
Coverage: ${coveredDims}/${totalDims} dimensions
Findings: ${r.findings.substring(0, 500)}...

`;
}).join('\n')}

════════════════════════════════════════════════════════════════════
RESEARCH SYNTHESIS COMPLETE
════════════════════════════════════════════════════════════════════

This research combines:
- Deep desire mapping
- Objection identification
- Audience behavior research
- Web-based competitive analysis
- Market trend validation

Ready for: Objection Handling -> Creative Direction (Taste)
`;

      return {
        processedOutput: combinedOutput,
        rawOutput: combinedOutput,
        model: 'glm-4.7-flash:q4_K_M (orchestrator) + lfm-2.5 (researchers)',
        processingTime: Date.now() - startTime,
        researchFindings: desireResult.researchFindings,
      };
    } catch (error) {
      onProgress?.('\n[WEB SEARCH ERROR] Falling back to desire-driven findings only.\n');
      console.error('Orchestrated research error:', error);

      return {
        processedOutput: desireResult.processedOutput,
        rawOutput: desireResult.rawOutput,
        model: desireResult.model,
        processingTime: Date.now() - startTime,
        researchFindings: desireResult.researchFindings,
      };
    }
  };

  return {
    executeOrchestratedResearch,
  };
}
