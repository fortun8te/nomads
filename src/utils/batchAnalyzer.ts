/**
 * Batch Analyzer — Parallel crawl + compress + synthesize pipeline
 * Crawls X pages simultaneously, compresses in parallel batches,
 * then synthesizes findings from the merged corpus.
 */

import { wayfayerService, type CrawlPageResult } from './wayfayer';
import { ollamaService } from './ollama';
import { getResearchModelConfig } from './modelConfig';
import { WorkerPool } from './workerPool';
import { ollamaLimiter } from './rateLimiter';
import { recordResearchSource } from './researchAudit';

export interface BatchAnalysisResult {
  pages: CrawlPageResult[];
  compressed: string[];
  synthesis: string;
  stats: {
    totalPages: number;
    successfulPages: number;
    totalChars: number;
    compressedChars: number;
    elapsedMs: number;
  };
}

/**
 * Crawl multiple URLs simultaneously, compress each page in parallel batches,
 * then synthesize all compressed content into a unified summary.
 */
export async function batchAnalyze(
  urls: string[],
  config: {
    crawlConcurrency?: number;
    compressionBatchSize?: number;
    topic?: string;
  } = {},
  signal?: AbortSignal,
  onProgress?: (msg: string) => void
): Promise<BatchAnalysisResult> {
  const start = Date.now();
  const {
    crawlConcurrency = 10,
    compressionBatchSize = 5,
    topic = 'general research',
  } = config;

  const modelConfig = getResearchModelConfig();

  // Step 1: Batch crawl all URLs
  onProgress?.(`[Batch] Crawling ${urls.length} pages (concurrency: ${crawlConcurrency})...`);
  const crawlResult = await wayfayerService.batchCrawl(urls, crawlConcurrency, signal);

  const successPages = crawlResult.results.filter(r => !r.error && r.content_length > 150);
  onProgress?.(`[Batch] ${successPages.length}/${urls.length} pages fetched successfully`);

  // Record sources
  for (const page of successPages) {
    recordResearchSource({
      url: page.url,
      query: topic,
      source: 'web',
      contentLength: page.content_length,
    });
  }

  if (successPages.length === 0) {
    return {
      pages: crawlResult.results,
      compressed: [],
      synthesis: '',
      stats: {
        totalPages: urls.length,
        successfulPages: 0,
        totalChars: 0,
        compressedChars: 0,
        elapsedMs: Date.now() - start,
      },
    };
  }

  // Step 2: Compress pages in parallel batches
  onProgress?.(`[Batch] Compressing ${successPages.length} pages (batch size: ${compressionBatchSize})...`);

  const pool = new WorkerPool<CrawlPageResult, string>(compressionBatchSize, (stats) => {
    onProgress?.(`[Batch] Compressed ${stats.completed}/${successPages.length} (${stats.failed} failed)`);
  });

  const compressed = await pool.runSettled(
    successPages,
    async (page) => {
      return ollamaLimiter.withLimit(async () => {
        const result = await ollamaService.generateStream(
          `Compress this web page content into key facts, statistics, and insights.\n\nURL: ${page.url}\n\nContent:\n${page.content.slice(0, 8000)}`,
          `Extract and compress key information about "${topic}". Return ONLY facts, numbers, quotes, and insights. No filler.`,
          {
            model: modelConfig.compressionModel,
            temperature: 0.3,
            signal,
          }
        );
        return result;
      }, 'low');
    },
    signal
  );

  const compressedTexts = compressed
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value);

  onProgress?.(`[Batch] ${compressedTexts.length} pages compressed`);

  // Step 3: Synthesize
  if (compressedTexts.length === 0) {
    return {
      pages: crawlResult.results,
      compressed: [],
      synthesis: '',
      stats: {
        totalPages: urls.length,
        successfulPages: successPages.length,
        totalChars: successPages.reduce((s, p) => s + p.content_length, 0),
        compressedChars: 0,
        elapsedMs: Date.now() - start,
      },
    };
  }

  onProgress?.(`[Batch] Synthesizing from ${compressedTexts.length} compressed pages...`);

  const mergedCorpus = compressedTexts.join('\n\n---\n\n');

  const synthesis = await ollamaLimiter.withLimit(async () => {
    return ollamaService.generateStream(
      `Synthesize the following compressed research data into a coherent analysis.\n\nTopic: ${topic}\n\nData from ${compressedTexts.length} sources:\n\n${mergedCorpus.slice(0, 16000)}`,
      `You are a research analyst. Synthesize the data into: key findings, patterns, contradictions, statistics, and insights. Be specific — use numbers, names, and direct quotes.`,
      {
        model: modelConfig.researcherSynthesisModel,
        temperature: 0.5,
        signal,
      }
    );
  }, 'normal');

  onProgress?.(`[Batch] Analysis complete`);

  return {
    pages: crawlResult.results,
    compressed: compressedTexts,
    synthesis,
    stats: {
      totalPages: urls.length,
      successfulPages: successPages.length,
      totalChars: successPages.reduce((s, p) => s + p.content_length, 0),
      compressedChars: compressedTexts.reduce((s, t) => s + t.length, 0),
      elapsedMs: Date.now() - start,
    },
  };
}
