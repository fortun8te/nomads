/**
 * vectorSearch.ts — Hybrid semantic + keyword search for memories
 *
 * Features:
 * - Dense vector search via Ollama embeddings (nomic-embed-text, 384-dim)
 * - BM25-style keyword fallback
 * - 70/30 fusion by default
 * - IndexedDB storage for embeddings
 * - Cold-start graceful degradation (keyword-only if Ollama unavailable)
 * - LRU embedding cache (avoid recomputing)
 */

import type { Memory } from './memoryStore'; // Legacy flat type; vector search indexes both old and new memories
import { INFRASTRUCTURE } from '../config/infrastructure';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface MemoryWithEmbedding extends Memory {
  embedding?: number[];
  embeddingModel?: string;
  embeddingComputedAt?: string;
}

export interface SearchResult {
  id: string;
  memory: MemoryWithEmbedding;
  score: number;
  scoreBreakdown: {
    vectorScore: number;
    keywordScore: number;
    finalScore: number;
    matchedTags?: string[];
    matchContext?: string;
  };
  rank: number;
}

export interface VectorSearchOptions {
  type?: Memory['type'];
  limit?: number;
  threshold?: number;
  weights?: {
    vector: number;
    keyword: number;
  };
}

export interface SearchIndexStats {
  totalMemories: number;
  withEmbeddings: number;
  embeddingModel?: string;
  lastRebuild?: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'nomic-embed-text';
// Embedding dimensions: 384 (nomic-embed-text)
const VECTOR_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;
const DEFAULT_THRESHOLD = 0.65;
const KEYWORD_THRESHOLD = 0.3;

// IndexedDB stores
const MEMORIES_STORE = 'vector_memories';
const EMBEDDINGS_STORE = 'vector_embeddings';
const METADATA_STORE = 'vector_metadata';
const IDB_NAME = 'nomads-vector-search';

// ─────────────────────────────────────────────────────────────
// Embedding Cache (LRU, in-memory)
// ─────────────────────────────────────────────────────────────

class EmbeddingCache {
  private cache = new Map<string, number[]>();
  private maxSize = 100;

  private hash(text: string): string {
    // Simple hash: good enough for cache key
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h = ((h << 5) - h) + c;
      h = h & h; // Convert to 32-bit integer
    }
    return h.toString(36);
  }

  get(text: string): number[] | undefined {
    return this.cache.get(this.hash(text));
  }

  set(text: string, embedding: number[]): void {
    const key = this.hash(text);
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value as string;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, embedding);
  }

  clear(): void {
    this.cache.clear();
  }
}

const embeddingCache = new EmbeddingCache();

// ─────────────────────────────────────────────────────────────
// IndexedDB Initialization
// ─────────────────────────────────────────────────────────────

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create stores if they don't exist
      if (!db.objectStoreNames.contains(MEMORIES_STORE)) {
        db.createObjectStore(MEMORIES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(EMBEDDINGS_STORE)) {
        const embStore = db.createObjectStore(EMBEDDINGS_STORE, { keyPath: 'id' });
        embStore.createIndex('computedAt', 'computedAt');
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE);
      }
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Embedding Computation
// ─────────────────────────────────────────────────────────────

async function getEmbeddingFromOllama(
  text: string,
  signal?: AbortSignal
): Promise<number[]> {
  const endpoint = INFRASTRUCTURE.ollamaUrl;

  try {
    const response = await fetch(`${endpoint}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama embed failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.embeddings || !Array.isArray(data.embeddings) || data.embeddings.length === 0) {
      throw new Error('No embeddings returned from Ollama');
    }

    return data.embeddings[0];
  } catch (error) {
    console.warn('[vectorSearch] Ollama embedding failed:', error);
    throw error;
  }
}

async function getOrComputeEmbedding(
  text: string,
  signal?: AbortSignal
): Promise<number[]> {
  // 1. Check in-memory cache
  const cached = embeddingCache.get(text);
  if (cached) return cached;

  // 2. Try Ollama
  try {
    const embedding = await getEmbeddingFromOllama(text, signal);
    embeddingCache.set(text, embedding);
    return embedding;
  } catch {
    // 3. Fallback: return empty embedding (signals keyword-only mode)
    console.warn('[vectorSearch] Falling back to keyword-only search');
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Vector Math
// ─────────────────────────────────────────────────────────────

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0) return 0;
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// ─────────────────────────────────────────────────────────────
// Keyword Search (BM25-style)
// ─────────────────────────────────────────────────────────────

function extractMatchedTags(tags: string[], query: string): string[] {
  const queryTerms = query.split(/\s+/).filter(t => t.length > 2);
  return tags.filter(tag =>
    queryTerms.some(term => tag.toLowerCase().includes(term))
  );
}

function extractSnippet(content: string, query: string): string {
  const q = query.toLowerCase();
  const idx = content.toLowerCase().indexOf(q);
  if (idx === -1) return content.slice(0, 100);

  const start = Math.max(0, idx - 30);
  const end = Math.min(content.length, idx + q.length + 30);
  return content.slice(start, end);
}

function keywordSearch(
  query: string,
  memories: MemoryWithEmbedding[]
): Record<string, number> {
  const queryTerms = query
    .split(/\s+/)
    .filter(t => t.length > 2)
    .map(t => t.toLowerCase());

  const scores: Record<string, number> = {};

  for (const memory of memories) {
    let score = 0;

    // 1. Tag match bonus (exact substring hit)
    for (const term of queryTerms) {
      if (memory.tags.some(tag => tag.toLowerCase().includes(term))) {
        score += 0.3;
      }
    }

    // 2. Content substring match (TF-like)
    const contentLower = memory.content.toLowerCase();
    for (const term of queryTerms) {
      const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
      score += matches * 0.05;
    }

    // 3. Recency boost (30-day half-life)
    const daysSinceAccess =
      (Date.now() - new Date(memory.lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24);
    const recencyMultiplier = Math.exp(-daysSinceAccess / 30);
    score *= recencyMultiplier;

    // 4. Normalize to [0, 1]
    scores[memory.id] = Math.min(score, 1);
  }

  return scores;
}

// ─────────────────────────────────────────────────────────────
// Search Core
// ─────────────────────────────────────────────────────────────

async function hybridSearch(
  query: string,
  allMemories: MemoryWithEmbedding[],
  options?: VectorSearchOptions,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q || allMemories.length === 0) return [];

  // Parallel: get query embedding + keyword search
  const [queryEmbedding, keywordScores] = await Promise.all([
    getOrComputeEmbedding(q, signal),
    Promise.resolve(keywordSearch(q, allMemories)),
  ]);

  const vectorWeight = options?.weights?.vector ?? VECTOR_WEIGHT;
  const keywordWeight = options?.weights?.keyword ?? KEYWORD_WEIGHT;
  const threshold = options?.threshold ?? (queryEmbedding.length > 0 ? DEFAULT_THRESHOLD : KEYWORD_THRESHOLD);

  // Compute scores for all memories
  const results = allMemories.map((memory) => {
    const vectorScore =
      queryEmbedding.length > 0
        ? Math.max(0, cosineSimilarity(queryEmbedding, memory.embedding || []))
        : 0;

    const keywordScore = keywordScores[memory.id] || 0;

    const finalScore = vectorWeight * vectorScore + keywordWeight * keywordScore;

    return {
      id: memory.id,
      memory,
      score: finalScore,
      scoreBreakdown: {
        vectorScore,
        keywordScore,
        finalScore,
        matchedTags: extractMatchedTags(memory.tags, q),
        matchContext: extractSnippet(memory.content, q),
      },
      rank: 0,
    };
  });

  // Filter by threshold
  const filtered = results.filter(r => r.score >= threshold);

  // Sort by score (desc), add rank
  const sorted = filtered
    .sort((a, b) => b.score - a.score)
    .map((r, idx) => ({ ...r, rank: idx + 1 }));

  // Apply limit
  return sorted.slice(0, options?.limit ?? 10);
}

// ─────────────────────────────────────────────────────────────
// Service: VectorSearchService
// ─────────────────────────────────────────────────────────────

export const vectorSearch = {
  async search(
    query: string,
    options?: VectorSearchOptions,
    signal?: AbortSignal
  ): Promise<SearchResult[]> {
    try {
      const db = await openDB();
      const tx = db.transaction([MEMORIES_STORE], 'readonly');
      const store = tx.objectStore(MEMORIES_STORE);

      let memories: MemoryWithEmbedding[] = [];

      if (options?.type) {
        // Query by type index (if available)
        memories = (await new Promise((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () =>
            resolve((request.result as MemoryWithEmbedding[]).filter(m => m.type === options.type));
          request.onerror = () => reject(request.error);
        })) as MemoryWithEmbedding[];
      } else {
        // Get all memories
        memories = (await new Promise((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result as MemoryWithEmbedding[]);
          request.onerror = () => reject(request.error);
        })) as MemoryWithEmbedding[];
      }

      return hybridSearch(query, memories, options, signal);
    } catch (error) {
      console.warn('[vectorSearch] Search failed:', error);
      return [];
    }
  },

  async indexMemory(memory: MemoryWithEmbedding, signal?: AbortSignal): Promise<void> {
    try {
      // Compute embedding if missing
      if (!memory.embedding || memory.embedding.length === 0) {
        memory.embedding = await getOrComputeEmbedding(memory.content, signal);
        memory.embeddingModel = EMBEDDING_MODEL;
        memory.embeddingComputedAt = new Date().toISOString();
      }

      // Store in IndexedDB
      const db = await openDB();
      const tx = db.transaction([MEMORIES_STORE, EMBEDDINGS_STORE], 'readwrite');

      const memStore = tx.objectStore(MEMORIES_STORE);
      const embStore = tx.objectStore(EMBEDDINGS_STORE);

      await new Promise<void>((resolve, reject) => {
        memStore.put(memory);
        embStore.put({
          id: memory.id,
          vector: memory.embedding,
          model: memory.embeddingModel,
          computedAt: memory.embeddingComputedAt,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.warn('[vectorSearch] Indexing failed:', error);
      throw error;
    }
  },

  async rebuild(signal?: AbortSignal): Promise<void> {
    try {
      const db = await openDB();
      const tx = db.transaction([MEMORIES_STORE], 'readonly');
      const store = tx.objectStore(MEMORIES_STORE);

      const memories = (await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as MemoryWithEmbedding[]);
        request.onerror = () => reject(request.error);
      })) as MemoryWithEmbedding[];

      // Recompute all embeddings
      for (const memory of memories) {
        if (signal?.aborted) break;
        await this.indexMemory(memory, signal);
      }

      // Update metadata
      const metaTx = db.transaction([METADATA_STORE], 'readwrite');
      const metaStore = metaTx.objectStore(METADATA_STORE);

      await new Promise<void>((resolve, reject) => {
        metaStore.put(
          {
            lastRebuild: new Date().toISOString(),
            version: 1,
            embeddingModel: EMBEDDING_MODEL,
          },
          'search-index'
        );
        metaTx.oncomplete = () => resolve();
        metaTx.onerror = () => reject(metaTx.error);
      });
    } catch (error) {
      console.warn('[vectorSearch] Rebuild failed:', error);
      throw error;
    }
  },

  async getIndexStats(): Promise<SearchIndexStats> {
    try {
      const db = await openDB();

      const memTx = db.transaction([MEMORIES_STORE], 'readonly');
      const memStore = memTx.objectStore(MEMORIES_STORE);
      const totalMemories = (await new Promise((resolve, reject) => {
        const request = memStore.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })) as number;

      const embTx = db.transaction([EMBEDDINGS_STORE], 'readonly');
      const embStore = embTx.objectStore(EMBEDDINGS_STORE);
      const withEmbeddings = (await new Promise((resolve, reject) => {
        const request = embStore.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })) as number;

      const metaTx = db.transaction([METADATA_STORE], 'readonly');
      const metaStore = metaTx.objectStore(METADATA_STORE);
      const metadata = (await new Promise((resolve, reject) => {
        const request = metaStore.get('search-index');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })) as Record<string, unknown> | undefined;

      return {
        totalMemories,
        withEmbeddings,
        embeddingModel: (metadata?.embeddingModel as string) || EMBEDDING_MODEL,
        lastRebuild: (metadata?.lastRebuild as string) || undefined,
      };
    } catch (error) {
      console.warn('[vectorSearch] Failed to get stats:', error);
      return { totalMemories: 0, withEmbeddings: 0 };
    }
  },

  async clearEmbeddingCache(): Promise<void> {
    embeddingCache.clear();
  },

  async getEmbedding(text: string, signal?: AbortSignal): Promise<number[]> {
    return getOrComputeEmbedding(text, signal);
  },
};
