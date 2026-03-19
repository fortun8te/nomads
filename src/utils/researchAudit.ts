/**
 * Research Audit Trail — Tracks all sources, tokens, and metadata
 * Builds a complete provenance record of where research findings came from
 */

import type { ResearchAuditTrail, ResearchSource } from '../types';
import { tokenTracker } from './tokenStats';
import { getActiveResearchPreset } from './modelConfig';

export interface ResearchMetrics {
  startTime: number;
  endTime?: number;
  totalSources: number;
  sourcesByType: Map<string, number>;
  sourceList: ResearchSource[];
  modelsUsed: Set<string>;
  iterationsCompleted: number;
  coverageAchieved: number;
  totalThinkingTokens?: number;        // Qwen 3.5 thinking tokens across all calls
  thinkingByModel?: Map<string, number>; // thinking token count per model
}

class ResearchAuditCollector {
  private metrics: ResearchMetrics;

  constructor() {
    this.metrics = {
      startTime: Date.now(),
      totalSources: 0,
      sourcesByType: new Map(),
      sourceList: [],
      modelsUsed: new Set(),
      iterationsCompleted: 0,
      coverageAchieved: 0,
      totalThinkingTokens: 0,
      thinkingByModel: new Map(),
    };
  }

  // Add a source that was fetched during research
  addSource(source: Omit<ResearchSource, 'fetchedAt'>) {
    const researchSource: ResearchSource = {
      ...source,
      fetchedAt: Date.now(),
    };
    this.metrics.sourceList.push(researchSource);
    this.metrics.totalSources++;

    const typeKey = source.source;
    this.metrics.sourcesByType.set(typeKey, (this.metrics.sourcesByType.get(typeKey) || 0) + 1);
  }

  // Record which model was used
  addModel(modelName: string) {
    this.metrics.modelsUsed.add(modelName);
  }

  // Update iteration count
  setIterations(count: number) {
    this.metrics.iterationsCompleted = count;
  }

  // Update coverage percentage
  setCoverage(percentage: number) {
    this.metrics.coverageAchieved = percentage;
  }

  // Record thinking tokens
  addThinkingTokens(modelName: string, count: number) {
    this.metrics.totalThinkingTokens = (this.metrics.totalThinkingTokens || 0) + count;
    if (!this.metrics.thinkingByModel) this.metrics.thinkingByModel = new Map();
    this.metrics.thinkingByModel.set(modelName, (this.metrics.thinkingByModel.get(modelName) || 0) + count);
  }

  // Build final audit trail
  buildAuditTrail(): ResearchAuditTrail {
    const endTime = Date.now();
    const duration = endTime - this.metrics.startTime;

    // Get token counts from global tracker
    const snapshot = tokenTracker.getSnapshot();
    const totalTokens = snapshot.sessionTotal || 0;
    const tokensByModel: Record<string, number> = {};
    if (snapshot.activeModel) {
      tokensByModel[snapshot.activeModel] = totalTokens;
    }

    // Build thinking token map
    const thinkingByModel: Record<string, number> = {};
    if (this.metrics.thinkingByModel) {
      for (const [model, count] of this.metrics.thinkingByModel) {
        thinkingByModel[model] = count;
      }
    }

    return {
      totalSources: this.metrics.totalSources,
      sourcesByType: Object.fromEntries(this.metrics.sourcesByType),
      sourceList: this.metrics.sourceList,
      modelsUsed: Array.from(this.metrics.modelsUsed),
      totalTokensGenerated: totalTokens,
      tokensByModel,
      phaseTimes: {}, // Will be populated by orchestrator with phase-specific times
      researchDuration: duration,
      preset: getActiveResearchPreset(),
      iterationsCompleted: this.metrics.iterationsCompleted,
      coverageAchieved: this.metrics.coverageAchieved,
      totalThinkingTokens: this.metrics.totalThinkingTokens || 0,
      thinkingTokensByModel: thinkingByModel,
    };
  }
}

// Global audit collector instance
let auditCollector: ResearchAuditCollector | null = null;

export function createResearchAudit(): ResearchAuditCollector {
  auditCollector = new ResearchAuditCollector();
  return auditCollector;
}

export function getResearchAudit(): ResearchAuditCollector | null {
  return auditCollector;
}

export function recordResearchSource(source: Omit<ResearchSource, 'fetchedAt'>) {
  auditCollector?.addSource(source);
}

export function recordResearchModel(modelName: string) {
  auditCollector?.addModel(modelName);
}

export function buildResearchAuditTrail(): ResearchAuditTrail | undefined {
  return auditCollector?.buildAuditTrail();
}
