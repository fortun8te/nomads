import { useState, useCallback } from 'react';
import { storage } from '../utils/storage';
import type { Campaign, Cycle } from '../types';

export function useStorage() {
  const [error, setError] = useState<string | null>(null);

  const saveCampaign = useCallback(async (campaign: Campaign) => {
    try {
      await storage.saveCampaign(campaign);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save campaign';
      setError(msg);
      throw err;
    }
  }, []);

  const getCampaign = useCallback(async (id: string) => {
    try {
      const campaign = await storage.getCampaign(id);
      setError(null);
      return campaign;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get campaign';
      setError(msg);
      throw err;
    }
  }, []);

  const getAllCampaigns = useCallback(async () => {
    try {
      const campaigns = await storage.getAllCampaigns();
      setError(null);
      return campaigns;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get campaigns';
      setError(msg);
      throw err;
    }
  }, []);

  const saveCycle = useCallback(async (cycle: Cycle) => {
    try {
      await storage.saveCycle(cycle);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save cycle';
      setError(msg);
      throw err;
    }
  }, []);

  const getCyclesByCampaign = useCallback(async (campaignId: string) => {
    try {
      const cycles = await storage.getCyclesByCampaign(campaignId);
      setError(null);
      return cycles;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get cycles';
      setError(msg);
      throw err;
    }
  }, []);

  const updateCycle = useCallback(async (cycle: Cycle) => {
    try {
      await storage.updateCycle(cycle);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update cycle';
      setError(msg);
      throw err;
    }
  }, []);

  return {
    error,
    saveCampaign,
    getCampaign,
    getAllCampaigns,
    saveCycle,
    getCyclesByCampaign,
    updateCycle,
  };
}
