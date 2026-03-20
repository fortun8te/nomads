/**
 * useVectorSearch.ts — React hook for vector search
 *
 * Provides search, indexing, and rebuild functionality with
 * error handling and state management.
 */

import { useCallback, useState } from 'react';
import { vectorSearch, type SearchResult, type VectorSearchOptions } from '../utils/vectorSearch';
import type { MemoryWithEmbedding } from '../utils/vectorSearch';

export interface UseVectorSearchState {
  isSearching: boolean;
  isIndexing: boolean;
  isRebuilding: boolean;
  error: string | null;
}

export function useVectorSearch() {
  const [state, setState] = useState<UseVectorSearchState>({
    isSearching: false,
    isIndexing: false,
    isRebuilding: false,
    error: null,
  });

  const search = useCallback(
    async (
      query: string,
      options?: VectorSearchOptions,
      signal?: AbortSignal
    ): Promise<SearchResult[]> => {
      setState(prev => ({ ...prev, isSearching: true, error: null }));
      try {
        const results = await vectorSearch.search(query, options, signal);
        return results;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Search failed';
        setState(prev => ({ ...prev, error: message }));
        return [];
      } finally {
        setState(prev => ({ ...prev, isSearching: false }));
      }
    },
    []
  );

  const indexMemory = useCallback(
    async (memory: MemoryWithEmbedding, signal?: AbortSignal): Promise<void> => {
      setState(prev => ({ ...prev, isIndexing: true, error: null }));
      try {
        await vectorSearch.indexMemory(memory, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Indexing failed';
        setState(prev => ({ ...prev, error: message }));
        throw error;
      } finally {
        setState(prev => ({ ...prev, isIndexing: false }));
      }
    },
    []
  );

  const rebuild = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setState(prev => ({ ...prev, isRebuilding: true, error: null }));
      try {
        await vectorSearch.rebuild(signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Rebuild failed';
        setState(prev => ({ ...prev, error: message }));
        throw error;
      } finally {
        setState(prev => ({ ...prev, isRebuilding: false }));
      }
    },
    []
  );

  return {
    search,
    indexMemory,
    rebuild,
    ...state,
  };
}
