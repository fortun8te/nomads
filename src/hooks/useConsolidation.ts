/**
 * useConsolidation.ts
 *
 * React hook for consolidation integration
 * ────────────────────────────────────────
 *
 * Uses ConsolidationService (consolidationService.ts) which operates on the
 * legacy Memory[] from memoryStore. For the newer episodic/semantic/procedural
 * consolidation, see ConsolidationEngine (consolidationEngine.ts) which works
 * with MemoryService (memoryService.ts).
 *
 * Provides:
 * - Auto-trigger consolidation (schedule + threshold)
 * - Manual trigger via button
 * - UI state for progress feedback
 * - Metrics display (context reduction %, archiving progress)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ConsolidationService } from '../utils/consolidationService';
import type { ConsolidationResult } from '../utils/consolidationService';
import { useMemories } from '../utils/memoryStore'; // Legacy hook; provides Memory[] for ConsolidationService
import { useCampaign } from '../context/CampaignContext';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ConsolidationState {
  isRunning: boolean;
  result: ConsolidationResult | null;
  error: string | null;
  progress: {
    currentGroup: number;
    totalGroups: number;
    currentStatus: string;
  };
}

export interface UseConsolidationReturn {
  consolidationState: ConsolidationState;
  triggerConsolidation: (manual?: boolean) => Promise<void>;
  resetState: () => void;
  shouldAutoTrigger: boolean;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useConsolidation(): UseConsolidationReturn {
  const allMemories = useMemories();
  const { currentCycle } = useCampaign();

  const [consolidationState, setConsolidationState] = useState<ConsolidationState>({
    isRunning: false,
    result: null,
    error: null,
    progress: { currentGroup: 0, totalGroups: 0, currentStatus: '' },
  });

  // Bug fix: shouldAutoTrigger is tracked as state so consumers re-render when it
  // changes. Using only a ref meant the returned value was always the value at the
  // last render — mutation of shouldAutoTriggerRef.current in a useEffect does NOT
  // cause a re-render, so consumers saw a permanently-stale false.
  const [shouldAutoTrigger, setShouldAutoTrigger] = useState(false);
  // Bug fix: use a ref for the isRunning guard so triggerConsolidation's identity
  // stays stable and doesn't change every time isRunning toggles.
  const isRunningRef = useRef(false);
  isRunningRef.current = consolidationState.isRunning;

  // Check if consolidation should auto-trigger
  useEffect(() => {
    const { should, reason } = ConsolidationService.shouldTriggerConsolidation(allMemories);
    setShouldAutoTrigger(should);

    // Optional: Auto-trigger at threshold
    if (should && reason === 'threshold' && !isRunningRef.current) {
      console.log(`[useConsolidation] Auto-triggering consolidation (${reason})`);
      // Uncommenting the next line enables auto-trigger:
      // triggerConsolidation(false);
    }
  }, [allMemories]);

  // Manual or automatic trigger
  const triggerConsolidation = useCallback(
    async (manual = true) => {
      if (isRunningRef.current) return;

      setConsolidationState(prev => ({
        ...prev,
        isRunning: true,
        error: null,
      }));

      try {
        const triggeringMode = manual ? 'manual' : 'threshold';
        const cycleId = currentCycle?.id || 'unknown-cycle';

        console.log(`[useConsolidation] Starting consolidation (${triggeringMode})`);

        // Run consolidation
        const result = await ConsolidationService.consolidateWeekly(
          allMemories,
          triggeringMode,
          cycleId
        );

        setConsolidationState(prev => ({
          ...prev,
          isRunning: false,
          result,
          error: result.error || null,
        }));

        console.log(`[useConsolidation] Consolidation complete:`, {
          successfulCompressions: result.successfulCompressions,
          contextReduction: `${result.contextReductionPercent}%`,
          archivedCount: result.totalEpisodicArchived,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setConsolidationState(prev => ({
          ...prev,
          isRunning: false,
          error: errorMsg,
        }));
        console.error('[useConsolidation] Consolidation failed:', err);
      }
    },
    [allMemories, currentCycle?.id]
  );

  const resetState = useCallback(() => {
    setConsolidationState({
      isRunning: false,
      result: null,
      error: null,
      progress: { currentGroup: 0, totalGroups: 0, currentStatus: '' },
    });
  }, []);

  return {
    consolidationState,
    triggerConsolidation,
    resetState,
    shouldAutoTrigger,
  };
}
