/**
 * PLACEHOLDER FOR SEARXNG INTEGRATION
 * Currently mocks search results
 * TODO: Replace with actual SearXNG HTTP calls when ready
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Placeholder search function
 * Will be replaced with SearXNG integration
 * For now: Returns mock data
 */
export async function search(query: string): Promise<SearchResult[]> {
  // TODO: Replace with actual SearXNG call
  // const response = await fetch('http://localhost:8888/search', {
  //   params: { q: query, format: 'json' }
  // });
  // return response.json().results;

  // Mock for now
  console.log(`[SEARXNG PLACEHOLDER] Would search: "${query}"`);
  return [
    {
      title: "Mock Result 1",
      url: "https://example.com/1",
      snippet: `Information about "${query}"...`,
    },
    {
      title: "Mock Result 2",
      url: "https://example.com/2",
      snippet: `More details on "${query}"...`,
    },
  ];
}

/**
 * Batch search multiple queries and return combined results
 * Used by searcher agents
 */
export async function batchSearch(queries: string[]): Promise<string> {
  const allResults: { query: string; results: SearchResult[] }[] = [];

  for (const query of queries) {
    const results = await search(query);
    allResults.push({ query, results });
  }

  // Format for summarization
  return allResults
    .map(
      (r) =>
        `Query: "${r.query}"\nResults:\n${r.results.map((res) => `- ${res.title}: ${res.snippet}`).join("\n")}`
    )
    .join("\n\n");
}
