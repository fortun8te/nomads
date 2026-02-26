import { set, get, del } from 'idb-keyval';
import type { Campaign, Cycle } from '../types';

const CAMPAIGNS_KEY = 'campaigns';
const CYCLES_KEY = 'cycles';

export const storage = {
  // Campaign operations
  async saveCampaign(campaign: Campaign): Promise<void> {
    const campaigns = (await get(CAMPAIGNS_KEY)) || {};
    campaigns[campaign.id] = campaign;
    await set(CAMPAIGNS_KEY, campaigns);
  },

  async getCampaign(id: string): Promise<Campaign | null> {
    const campaigns = (await get(CAMPAIGNS_KEY)) || {};
    return campaigns[id] || null;
  },

  async getAllCampaigns(): Promise<Campaign[]> {
    const campaigns = (await get(CAMPAIGNS_KEY)) || {};
    return Object.values(campaigns);
  },

  async deleteCampaign(id: string): Promise<void> {
    const campaigns = (await get(CAMPAIGNS_KEY)) || {};
    delete campaigns[id];
    await set(CAMPAIGNS_KEY, campaigns);
  },

  // Cycle operations
  async saveCycle(cycle: Cycle): Promise<void> {
    const cycles = (await get(CYCLES_KEY)) || {};
    cycles[cycle.id] = cycle;
    await set(CYCLES_KEY, cycles);
  },

  async getCycle(id: string): Promise<Cycle | null> {
    const cycles = (await get(CYCLES_KEY)) || {};
    return cycles[id] || null;
  },

  async getCyclesByCampaign(campaignId: string): Promise<Cycle[]> {
    const cycles = (await get(CYCLES_KEY)) || {};
    return (Object.values(cycles) as Cycle[]).filter(
      (c) => c.campaignId === campaignId
    );
  },

  async updateCycle(cycle: Cycle): Promise<void> {
    await this.saveCycle(cycle);
  },

  // Clear all data
  async clear(): Promise<void> {
    await del(CAMPAIGNS_KEY);
    await del(CYCLES_KEY);
  },
};
