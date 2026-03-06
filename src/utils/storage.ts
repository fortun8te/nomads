import { set, get, del } from 'idb-keyval';
import type { Campaign, Cycle } from '../types';

const CAMPAIGNS_KEY = 'campaigns';
const CYCLES_KEY = 'cycles';
const GENERATED_IMAGES_KEY = 'generated_images';

// ── Generated Image (persisted to IndexedDB) ──
export interface StoredImage {
  id: string;
  imageBase64: string;          // The actual image data
  prompt: string;               // User's original prompt
  imagePrompt?: string;         // Final prompt sent to image model (may differ from user prompt)
  model: string;                // 'nano-banana-2' | 'seedream-5-lite'
  aspectRatio: string;          // '1:1' | '9:16' | '4:5' | '16:9'
  pipeline: string;             // 'direct' | 'research-llm' | 'research-html-llm'
  timestamp: number;
  label: string;                // 'Ad 1', 'Ad 2', etc.
  referenceImageCount: number;  // How many @img refs were used
  campaignId?: string;          // Which campaign this was for
  campaignBrand?: string;       // Brand name for display
  favorite?: boolean;           // User favorited this image
}

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
    // Ensure we only save serializable data (strip researchFindings if it contains non-serializable objects)
    const serializableCycle = {
      ...cycle,
      // Ensure researchFindings is plain JSON
      researchFindings: cycle.researchFindings ? JSON.parse(JSON.stringify(cycle.researchFindings)) : undefined,
    };
    const cycles = (await get(CYCLES_KEY)) || {};
    cycles[cycle.id] = serializableCycle;
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

  // ── Generated Image operations ──
  async saveImage(image: StoredImage): Promise<void> {
    const images = (await get(GENERATED_IMAGES_KEY)) || {};
    images[image.id] = image;
    await set(GENERATED_IMAGES_KEY, images);
  },

  async getImage(id: string): Promise<StoredImage | null> {
    const images = (await get(GENERATED_IMAGES_KEY)) || {};
    return images[id] || null;
  },

  async getAllImages(): Promise<StoredImage[]> {
    const images = (await get(GENERATED_IMAGES_KEY)) || {};
    return (Object.values(images) as StoredImage[]).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  },

  async toggleFavorite(id: string): Promise<StoredImage | null> {
    const images = (await get(GENERATED_IMAGES_KEY)) || {};
    const img = images[id];
    if (!img) return null;
    img.favorite = !img.favorite;
    images[id] = img;
    await set(GENERATED_IMAGES_KEY, images);
    return img as StoredImage;
  },

  async deleteImage(id: string): Promise<void> {
    const images = (await get(GENERATED_IMAGES_KEY)) || {};
    delete images[id];
    await set(GENERATED_IMAGES_KEY, images);
  },

  async getImageCount(): Promise<number> {
    const images = (await get(GENERATED_IMAGES_KEY)) || {};
    return Object.keys(images).length;
  },

  // Clear all data
  async clear(): Promise<void> {
    await del(CAMPAIGNS_KEY);
    await del(CYCLES_KEY);
  },
};
