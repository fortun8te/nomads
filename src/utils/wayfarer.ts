// Wayfarer — TypeScript client for the Wayfarer web research API
// Replaces the old searxng.ts (DuckDuckGo snippets) with full page scraping

export interface WayfarerPage {
  url: string;
  title: string;
  content: string;   // Full page text (not a snippet)
  snippet: string;   // Original search engine snippet
  source: string;    // "article" | "markdown" | "failed"
}

export interface WayfarerSource {
  url: string;
  title: string;
  snippet: string;
}

export interface WayfarerMeta {
  total: number;
  success: number;
  elapsed: number;
  error?: string | null;
}

export interface WayfarerResult {
  query: string;
  text: string;             // All pages concatenated with --- separators
  pages: WayfarerPage[];
  sources: WayfarerSource[];
  meta: WayfarerMeta;
}

const DEFAULT_HOST = 'http://localhost:8889';

function getHost(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('wayfarer_host');
    if (stored) return stored;
  }
  return DEFAULT_HOST;
}

export const wayfarerService = {
  getHost,

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${getHost()}/health`, { signal: AbortSignal.timeout(5000) });
      return resp.ok;
    } catch {
      return false;
    }
  },

  async research(query: string, numResults: number = 10): Promise<WayfarerResult> {
    try {
      const resp = await fetch(`${getHost()}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          num_results: numResults,
          concurrency: 20,
          extract_mode: 'article',
        }),
      });

      if (!resp.ok) {
        console.error(`Wayfarer error: ${resp.status} ${resp.statusText}`);
        return emptyResult(query);
      }

      return await resp.json();
    } catch (error) {
      console.error('Wayfarer fetch error:', error);
      return emptyResult(query);
    }
  },

  async batchResearch(
    queries: Array<{ query: string; num_results?: number }>
  ): Promise<WayfarerResult[]> {
    try {
      const resp = await fetch(`${getHost()}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: queries.map((q) => ({
            query: q.query,
            num_results: q.num_results ?? 10,
          })),
          concurrency: 20,
          extract_mode: 'article',
        }),
      });

      if (!resp.ok) {
        console.error(`Wayfarer batch error: ${resp.status}`);
        return queries.map((q) => emptyResult(q.query));
      }

      const data = await resp.json();
      return data.results;
    } catch (error) {
      console.error('Wayfarer batch error:', error);
      return queries.map((q) => emptyResult(q.query));
    }
  },

  // Drop-in replacement for searxngService.searchAndSummarize()
  // Returns concatenated page text ready for LLM consumption
  async searchAndScrape(query: string, maxResults: number = 10): Promise<string> {
    const result = await this.research(query, maxResults);
    if (result.text && result.text.length > 0) {
      return result.text;
    }
    return `No web results found for: "${query}"`;
  },
};

function emptyResult(query: string): WayfarerResult {
  return {
    query,
    text: '',
    pages: [],
    sources: [],
    meta: { total: 0, success: 0, elapsed: 0, error: 'Wayfarer unavailable' },
  };
}

// Re-export as searxngService for backward compatibility during migration
export const searxngService = {
  async search(query: string) {
    const result = await wayfarerService.research(query, 10);
    return {
      results: result.sources.map((s) => ({
        title: s.title,
        url: s.url,
        content: s.snippet,
      })),
      query,
      number_of_results: result.sources.length,
    };
  },

  async searchAndSummarize(query: string, maxResults: number = 5): Promise<string> {
    return wayfarerService.searchAndScrape(query, maxResults);
  },

  async healthCheck(): Promise<boolean> {
    return wayfarerService.healthCheck();
  },
};
