/**
 * Vector Memory — Cross-cycle semantic recall using Ollama embeddings
 * Stores research findings as embeddings in IndexedDB for similarity search.
 * Uses nomic-embed-text via Ollama for embedding generation.
 */

import { get, set } from 'idb-keyval';
import { getOllamaHost } from './ollama';

const MEMORY_STORE_KEY = 'vector_memory_entries';
const EMBED_MODEL = 'nomic-embed-text';

export interface MemoryEntry {
  id: string;
  text: string;
  embedding: number[];
  source: 'research' | 'desire' | 'objection' | 'competitor' | 'insight' | 'report';
  campaignId: string;
  cycleNumber: number;
  createdAt: number;
  metadata?: Record<string, string>;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number; // cosine similarity 0-1
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

class VectorMemory {
  private cache: MemoryEntry[] | null = null;

  /** Generate embedding for text via Ollama */
  async embed(text: string): Promise<number[]> {
    const host = getOllamaHost();
    try {
      const resp = await fetch(`${host}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        console.error(`Embedding failed: ${resp.status}`);
        return [];
      }

      const data = await resp.json();
      // Ollama returns { embeddings: [[...]] } for single input
      return data.embeddings?.[0] || [];
    } catch (err) {
      console.error('Embedding error:', err);
      return [];
    }
  }

  /** Batch embed multiple texts */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const host = getOllamaHost();
    try {
      const resp = await fetch(`${host}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!resp.ok) return texts.map(() => []);

      const data = await resp.json();
      return data.embeddings || texts.map(() => []);
    } catch {
      return texts.map(() => []);
    }
  }

  /** Store a memory entry (auto-generates embedding) */
  async store(entry: Omit<MemoryEntry, 'id' | 'embedding' | 'createdAt'>): Promise<string> {
    const embedding = await this.embed(entry.text);
    if (embedding.length === 0) {
      console.warn('Skipping memory store — embedding failed');
      return '';
    }

    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full: MemoryEntry = {
      ...entry,
      id,
      embedding,
      createdAt: Date.now(),
    };

    const entries = await this.loadAll();
    entries.push(full);
    await set(MEMORY_STORE_KEY, entries);
    this.cache = entries;

    return id;
  }

  /** Store multiple entries in batch (more efficient) */
  async storeBatch(entries: Omit<MemoryEntry, 'id' | 'embedding' | 'createdAt'>[]): Promise<number> {
    if (entries.length === 0) return 0;

    const texts = entries.map(e => e.text);
    const embeddings = await this.embedBatch(texts);

    const existing = await this.loadAll();
    let stored = 0;

    for (let i = 0; i < entries.length; i++) {
      if (embeddings[i].length === 0) continue;

      const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${i}`;
      existing.push({
        ...entries[i],
        id,
        embedding: embeddings[i],
        createdAt: Date.now(),
      });
      stored++;
    }

    await set(MEMORY_STORE_KEY, existing);
    this.cache = existing;
    return stored;
  }

  /** Search for similar entries */
  async search(query: string, topK: number = 5): Promise<MemorySearchResult[]> {
    const queryEmb = await this.embed(query);
    if (queryEmb.length === 0) return [];

    const entries = await this.loadAll();
    const scored = entries
      .map(entry => ({
        entry,
        score: cosineSimilarity(queryEmb, entry.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  /** Search within a specific campaign */
  async searchByCampaign(
    campaignId: string,
    query: string,
    topK: number = 5
  ): Promise<MemorySearchResult[]> {
    const queryEmb = await this.embed(query);
    if (queryEmb.length === 0) return [];

    const entries = await this.loadAll();
    const scored = entries
      .filter(e => e.campaignId === campaignId)
      .map(entry => ({
        entry,
        score: cosineSimilarity(queryEmb, entry.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  /** Get all entries for a campaign */
  async getByCampaign(campaignId: string): Promise<MemoryEntry[]> {
    const entries = await this.loadAll();
    return entries.filter(e => e.campaignId === campaignId);
  }

  /** Get total count */
  async count(): Promise<number> {
    const entries = await this.loadAll();
    return entries.length;
  }

  /** Delete entries for a campaign */
  async deleteByCampaign(campaignId: string): Promise<number> {
    const entries = await this.loadAll();
    const remaining = entries.filter(e => e.campaignId !== campaignId);
    const deleted = entries.length - remaining.length;
    await set(MEMORY_STORE_KEY, remaining);
    this.cache = remaining;
    return deleted;
  }

  /** Clear all memory */
  async clear(): Promise<void> {
    await set(MEMORY_STORE_KEY, []);
    this.cache = null;
  }

  /** Load all entries from IndexedDB */
  private async loadAll(): Promise<MemoryEntry[]> {
    if (this.cache) return this.cache;
    this.cache = (await get(MEMORY_STORE_KEY)) || [];
    return this.cache;
  }
}

// Singleton
export const vectorMemory = new VectorMemory();
