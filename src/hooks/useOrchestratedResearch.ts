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
 * Combines Zakaria framework research with web-searching researcher agents
 * glm-4.7 orchestrates multiple lfm-2.5 researchers
 */
export function useOrchestratedResearch() {
  const { executeResearch: executeZakariaResearch } = useResearchAgent();

  const executeOrchestratedResearch = async (
    campaign: Campaign,
    onProgress?: (msg: string) => void,
    enableWebSearch: boolean = true,
    onPauseForInput?: (event: any) => Promise<string>
  ): Promise<OrchestratedResearchResult> => {
    const startTime = Date.now();

    onProgress?.('\n════════════════════════════════════════════════════════════════════\n');
    onProgress?.('ORCHESTRATED RESEARCH: Zakaria Framework + Web Search Agents\n');
    onProgress?.('════════════════════════════════════════════════════════════════════\n\n');

    // Phase 1: Execute Zakaria Framework Research
    onProgress?.('[PHASE 1] Running Zakaria Framework Research (Deep Desires, Objections, Audience)\n\n');
    const zakariaResult = await executeZakariaResearch(
      campaign,
      (msg) => onProgress?.(msg),
      'glm-4.7-flash:q4_K_M'
    );

    if (!zakariaResult.researchFindings) {
      return {
        processedOutput: zakariaResult.processedOutput,
        rawOutput: zakariaResult.rawOutput,
        model: zakariaResult.model,
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

    onProgress?.('\n[PHASE 1 COMPLETE] Zakaria framework research done.\n\n');

    // Phase 2: Web Search Orchestration (if enabled)
    if (!enableWebSearch) {
      onProgress?.('[WEB SEARCH] Skipped. Using Zakaria findings only.\n\n');
      return {
        processedOutput: zakariaResult.processedOutput,
        rawOutput: zakariaResult.rawOutput,
        model: zakariaResult.model,
        processingTime: Date.now() - startTime,
        researchFindings: zakariaResult.researchFindings,
      };
    }

    onProgress?.('[PHASE 2] Orchestrating Web Search Researchers\n');
    onProgress?.(
      'glm-4.7 orchestrator deciding what additional research is needed...\n\n'
    );

    const orchestratorState: OrchestratorState = {
      campaign,
      researchGoals: [
        'Validate competitive positioning gaps',
        'Identify market trends',
        'Find audience congregations',
        'Research competitor weaknesses',
      ],
      completedResearch: [],
      coverageThreshold: 0.8, // Orchestrator needs 80%+ dimensional coverage
    };

    try {
      const webResearchResults = await orchestrator.orchestrateResearch(
        orchestratorState,
        (msg) => onProgress?.(msg),
        onPauseForInput
      );

      onProgress?.('\n[PHASE 2 COMPLETE] Web research orchestration done.\n\n');

      // Combine findings
      const combinedOutput = `${zakariaResult.processedOutput}

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
✓ Deep desire mapping (Zakaria Framework)
✓ Objection identification
✓ Audience behavior research
✓ Web-based competitive analysis
✓ Market trend validation

Ready for: Objection Handling → Creative Direction (Taste)
`;

      return {
        processedOutput: combinedOutput,
        rawOutput: combinedOutput,
        model: 'glm-4.7-flash:q4_K_M (orchestrator) + lfm-2.5 (researchers)',
        processingTime: Date.now() - startTime,
        researchFindings: zakariaResult.researchFindings,
      };
    } catch (error) {
      onProgress?.('\n[WEB SEARCH ERROR] Falling back to Zakaria findings only.\n');
      console.error('Orchestrated research error:', error);

      return {
        processedOutput: zakariaResult.processedOutput,
        rawOutput: zakariaResult.rawOutput,
        model: zakariaResult.model,
        processingTime: Date.now() - startTime,
        researchFindings: zakariaResult.researchFindings,
      };
    }
  };

  return {
    executeOrchestratedResearch,
  };
}
