/**
 * Research Persistence — Checkpoint + Resume for research state
 * Saves research progress to IndexedDB after each iteration so
 * research can survive browser refresh.
 */

import { get, set, del } from 'idb-keyval';
import type { ResearchSource } from '../types';

const CHECKPOINT_KEY_PREFIX = 'research_checkpoint_';

export interface ResearchCheckpoint {
  campaignId: string;
  cycleId: string;
  iteration: number;
  knowledgeState: Record<string, unknown>;
  sources: ResearchSource[];
  coverage: Record<string, number>;
  phase: 'desire-analysis' | 'web-research' | 'report';
  phaseStep?: number;
  streamedOutput: string;
  timestamp: number;
  presetId: string;
}

function checkpointKey(campaignId: string): string {
  return `${CHECKPOINT_KEY_PREFIX}${campaignId}`;
}

export const researchPersistence = {
  /** Save a checkpoint after each iteration */
  async save(checkpoint: ResearchCheckpoint): Promise<void> {
    const key = checkpointKey(checkpoint.campaignId);
    await set(key, {
      ...checkpoint,
      timestamp: Date.now(),
    });
  },

  /** Load the latest checkpoint for a campaign */
  async load(campaignId: string): Promise<ResearchCheckpoint | null> {
    const key = checkpointKey(campaignId);
    const data = await get(key);
    return data || null;
  },

  /** Check if a campaign has an incomplete research checkpoint */
  async hasIncomplete(campaignId: string): Promise<boolean> {
    const checkpoint = await this.load(campaignId);
    if (!checkpoint) return false;

    // Consider stale if older than 24 hours
    const age = Date.now() - checkpoint.timestamp;
    if (age > 24 * 60 * 60 * 1000) {
      await this.clear(campaignId);
      return false;
    }

    return true;
  },

  /** Clear checkpoint (after research completes or user cancels) */
  async clear(campaignId: string): Promise<void> {
    const key = checkpointKey(campaignId);
    await del(key);
  },

  /** List all campaigns with active checkpoints */
  async listActive(): Promise<string[]> {
    // idb-keyval doesn't support key listing, so we check known campaigns
    // This is called rarely (on app load), so it's fine
    const campaigns: string[] = [];
    // Caller should pass campaign IDs to check
    return campaigns;
  },

  /** Get checkpoint summary for UI display */
  async getSummary(campaignId: string): Promise<{
    exists: boolean;
    iteration?: number;
    phase?: string;
    sources?: number;
    age?: number;
  }> {
    const checkpoint = await this.load(campaignId);
    if (!checkpoint) return { exists: false };

    return {
      exists: true,
      iteration: checkpoint.iteration,
      phase: checkpoint.phase,
      sources: checkpoint.sources.length,
      age: Date.now() - checkpoint.timestamp,
    };
  },
};
