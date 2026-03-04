// Web Search Service - DuckDuckGo API
// Free, no auth required, works reliably

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  number_of_results: number;
}

export const searxngService = {
  async search(query: string): Promise<SearchResponse> {
    try {
      // Try DuckDuckGo first
      const ddgParams = new URLSearchParams({
        q: query,
        format: 'json',
      });

      const response = await fetch(`https://api.duckduckgo.com/?${ddgParams}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const results: SearchResult[] = [];

        // Parse DuckDuckGo results - try both RelatedTopics and Results
        const topics = data.RelatedTopics || [];
        const resultsList = data.Results || [];

        // Combine both sources
        [...topics, ...resultsList].slice(0, 10).forEach((item: any) => {
          if (item.FirstURL && item.Text) {
            results.push({
              title: item.Text.substring(0, 100),
              url: item.FirstURL,
              content: item.Text,
            });
          } else if (item.URL && item.Title) {
            results.push({
              title: item.Title.substring(0, 100),
              url: item.URL,
              content: item.Title,
            });
          }
        });

        if (results.length > 0) {
          return {
            results,
            query,
            number_of_results: results.length,
          };
        }
      }

      // Fallback: Return mock data with message
      console.warn('DuckDuckGo search unavailable, using LLM-only research');
      return {
        results: [],
        query,
        number_of_results: 0,
      };
    } catch (error) {
      console.error('Search error:', error);
      // Return empty results instead of throwing - allows LLM fallback
      return {
        results: [],
        query,
        number_of_results: 0,
      };
    }
  },

  async searchAndSummarize(query: string, maxResults: number = 5): Promise<string> {
    try {
      const response = await this.search(query);
      const topResults = response.results.slice(0, maxResults);

      if (topResults.length === 0) {
        return `No search results found for: ${query}`;
      }

      const resultsText = topResults
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title}\nURL: ${r.url}\nContent: ${r.content.substring(0, 200)}`
        )
        .join('\n\n');

      return `Search Results for "${query}":\n\n${resultsText}`;
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  },

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch('https://api.duckduckgo.com/?q=test&format=json');
      return response.ok;
    } catch {
      return false;
    }
  },
};
