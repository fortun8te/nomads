/**
 * agentTools — Tool registry and execution system for the agent
 *
 * Each tool has a typed interface, tracks token/model/duration stats,
 * and reports progress via onProgress callback.
 *
 * Tools: web-search, web-deep-dive, document-write, file-analyze,
 *        compress, memory-search, think, computer-task
 */

import { ollamaService } from './ollama';
import { wayfayerService } from './wayfayer';
import { addDocument } from './documentStore';
import { searchMemories, getMemories } from './memoryStore';
import { addItem, type FSNode } from './fsStore';
import { getChatModel, getResearchModelConfig, getThinkingModel } from './modelConfig';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ToolParams {
  instruction: string;
  context?: string;
  files?: string[];
  urls?: string[];
}

export interface ToolResult {
  success: boolean;
  output: string;
  artifacts?: { type: string; name: string; content: string }[];
  tokensUsed?: number;
  model?: string;
  duration?: number;
}

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  icon: string;
  execute: (
    params: ToolParams,
    signal?: AbortSignal,
    onProgress?: (msg: string) => void,
  ) => Promise<ToolResult>;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function compressionModel(): string {
  return getResearchModelConfig().compressionModel;
}

function chatModel(): string {
  return getChatModel();
}

/** Rough token estimate (chars / 4) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─────────────────────────────────────────────────────────────
// Tool: web-search
// ─────────────────────────────────────────────────────────────

const webSearchTool: AgentTool = {
  id: 'web-search',
  name: 'Web Search',
  description: 'Batch search via Wayfarer — generates queries, searches in parallel, compresses and synthesizes results',
  icon: '🔍',
  async execute(params, signal, onProgress) {
    const start = Date.now();
    const model = compressionModel();
    let totalTokens = 0;

    // Step 1: Generate search queries via LLM
    onProgress?.('Generating search queries...');
    const queryPrompt = `Given this research instruction, generate 3-5 focused search queries. Output ONLY the queries, one per line, no numbering or bullets.\n\nInstruction: ${params.instruction}${params.context ? `\n\nContext: ${params.context}` : ''}`;
    const queryResult = await ollamaService.generateStream(queryPrompt, 'You generate concise web search queries. Output only the queries, one per line.', {
      model,
      temperature: 0.3,
      num_predict: 100,
      signal,
    });
    totalTokens += estimateTokens(queryResult);

    const queries = queryResult
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 3 && q.length < 200)
      .slice(0, 5);

    if (queries.length === 0) {
      return { success: false, output: 'Failed to generate search queries.', model, duration: Date.now() - start };
    }

    // Step 2: Run all queries in parallel via Wayfarer
    const allTexts: string[] = [];
    const allSources: string[] = [];

    const searchPromises = queries.map(async (query) => {
      onProgress?.(`Searching: ${query}`);
      try {
        const result = await wayfayerService.research(query, 8, signal);
        if (result.text) allTexts.push(result.text.slice(0, 4000));
        result.sources?.forEach(s => {
          if (!allSources.includes(s.url)) allSources.push(s.url);
        });
      } catch {
        // Individual query failure is non-fatal
      }
    });
    await Promise.all(searchPromises);

    if (allTexts.length === 0) {
      return { success: false, output: 'All searches returned empty results. Is Wayfarer running?', model, duration: Date.now() - start };
    }

    // Step 3: Compress and synthesize
    onProgress?.('Compressing results...');
    const combined = allTexts.join('\n---\n').slice(0, 12000);
    const synthesisPrompt = `Synthesize the following web research into a clear, structured summary that addresses: "${params.instruction}"\n\n${combined}`;
    const synthesis = await ollamaService.generateStream(synthesisPrompt, 'You synthesize web research into concise, actionable findings. Use bullet points and sections.', {
      model,
      temperature: 0.4,
      num_predict: 800,
      signal,
    });
    totalTokens += estimateTokens(synthesis);

    const sourcesBlock = allSources.length > 0
      ? `\n\nSources (${allSources.length}):\n${allSources.map(u => `  ${u}`).join('\n')}`
      : '';

    return {
      success: true,
      output: synthesis + sourcesBlock,
      tokensUsed: totalTokens,
      model,
      duration: Date.now() - start,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Tool: web-deep-dive
// ─────────────────────────────────────────────────────────────

const webDeepDiveTool: AgentTool = {
  id: 'web-deep-dive',
  name: 'Web Deep Dive',
  description: 'Deep website analysis — fetches full page content via Wayfarer and analyzes with the chat model',
  icon: '🌐',
  async execute(params, signal, onProgress) {
    const start = Date.now();
    const model = chatModel();
    let totalTokens = 0;

    const urls = params.urls ?? [];
    if (urls.length === 0) {
      // Try to extract URLs from the instruction
      const urlMatch = params.instruction.match(/https?:\/\/[^\s,]+/g);
      if (urlMatch) urls.push(...urlMatch);
    }

    if (urls.length === 0) {
      return { success: false, output: 'No URLs provided for deep dive.', model, duration: Date.now() - start };
    }

    const pageContents: string[] = [];

    // Fetch pages via batch crawl
    onProgress?.(`Fetching ${urls.length} page(s)...`);
    try {
      const crawlResult = await wayfayerService.batchCrawl(urls, 5, signal);
      for (const page of crawlResult.results) {
        onProgress?.(`Fetched: ${page.url}`);
        if (page.content && !page.error) {
          pageContents.push(`--- ${page.url} ---\n${page.content.slice(0, 6000)}`);
        }
      }
    } catch (err) {
      // Fallback: try individual research calls
      for (const url of urls) {
        onProgress?.(`Fetching ${url}...`);
        try {
          const result = await wayfayerService.research(url, 1, signal);
          if (result.text) pageContents.push(`--- ${url} ---\n${result.text.slice(0, 6000)}`);
        } catch {
          pageContents.push(`--- ${url} ---\nFailed to fetch.`);
        }
      }
    }

    if (pageContents.length === 0) {
      return { success: false, output: 'Could not fetch any page content.', model, duration: Date.now() - start };
    }

    // Analyze
    onProgress?.('Analyzing content...');
    const combined = pageContents.join('\n\n').slice(0, 16000);
    const analysisPrompt = `Analyze the following web page content. Instruction: "${params.instruction}"${params.context ? `\nContext: ${params.context}` : ''}\n\nPage Content:\n${combined}`;
    const analysis = await ollamaService.generateStream(analysisPrompt, 'You analyze web page content in detail. Extract key information, patterns, and insights.', {
      model,
      temperature: 0.5,
      num_predict: 1500,
      signal,
    });
    totalTokens += estimateTokens(analysis);

    return {
      success: true,
      output: analysis,
      tokensUsed: totalTokens,
      model,
      duration: Date.now() - start,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Tool: document-write
// ─────────────────────────────────────────────────────────────

const documentWriteTool: AgentTool = {
  id: 'document-write',
  name: 'Write Document',
  description: 'Generate a document with the chat model and save to document store + filesystem',
  icon: '📝',
  async execute(params, signal, onProgress) {
    const start = Date.now();
    const model = chatModel();

    onProgress?.('Writing document...');
    const writePrompt = `${params.instruction}${params.context ? `\n\nContext/background:\n${params.context}` : ''}`;
    const content = await ollamaService.generateStream(writePrompt, 'You write clear, well-structured documents. Use markdown formatting with headings, bullets, and sections.', {
      model,
      temperature: 0.7,
      num_predict: 2000,
      signal,
      onChunk: (chunk) => onProgress?.(chunk),
    });

    // Generate a title
    const titleResult = await ollamaService.generateStream(
      `Generate a short title (3-6 words) for this document:\n${content.slice(0, 500)}`,
      'Output only the title, nothing else.',
      { model: compressionModel(), temperature: 0.2, num_predict: 20, signal },
    );
    const title = titleResult.trim().replace(/^["']|["']$/g, '') || 'Untitled Document';

    // Save to documentStore
    const doc = addDocument({ title, content, type: 'doc' });
    onProgress?.(`Saved: ${title}`);

    // Save to fsStore under /session/documents/
    const fsNode: FSNode = {
      id: makeId(),
      name: `${title.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40)}.md`,
      type: 'file',
      extension: 'md',
      size: `${Math.ceil(content.length / 1024)} KB`,
      modified: 'just now',
      tag: 'session',
    };
    addItem(['session'], fsNode);

    return {
      success: true,
      output: content,
      artifacts: [{ type: 'document', name: title, content }],
      tokensUsed: estimateTokens(content) + estimateTokens(titleResult),
      model,
      duration: Date.now() - start,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Tool: file-analyze
// ─────────────────────────────────────────────────────────────

const fileAnalyzeTool: AgentTool = {
  id: 'file-analyze',
  name: 'Analyze Files',
  description: 'Analyze text file contents — compresses large files first, then analyzes with the chat model',
  icon: '📊',
  async execute(params, signal, onProgress) {
    const start = Date.now();
    const model = chatModel();
    const compModel = compressionModel();
    let totalTokens = 0;

    const fileContents = params.files ?? [];
    if (fileContents.length === 0 && !params.context) {
      return { success: false, output: 'No file content provided for analysis.', model, duration: Date.now() - start };
    }

    // Compress large files
    const processedContents: string[] = [];
    for (let i = 0; i < fileContents.length; i++) {
      const content = fileContents[i];
      onProgress?.(`Processing file ${i + 1}/${fileContents.length}...`);

      if (content.length > 4000) {
        onProgress?.(`Compressing file ${i + 1} (${Math.ceil(content.length / 1024)} KB)...`);
        const compressed = await ollamaService.generateStream(
          `Compress the following text to key points, preserving all important data, facts, and structure:\n\n${content.slice(0, 10000)}`,
          'Extract and compress key information. Preserve facts, numbers, and structure. Be concise.',
          { model: compModel, temperature: 0.2, num_predict: 600, signal },
        );
        totalTokens += estimateTokens(compressed);
        processedContents.push(`[File ${i + 1} — compressed from ${content.length} chars]\n${compressed}`);
      } else {
        processedContents.push(`[File ${i + 1}]\n${content}`);
      }
    }

    // Include context if provided
    if (params.context) {
      processedContents.push(`[Additional context]\n${params.context}`);
    }

    // Analyze
    onProgress?.('Analyzing...');
    const combined = processedContents.join('\n\n---\n\n').slice(0, 12000);
    const analysisPrompt = `${params.instruction}\n\nContent to analyze:\n${combined}`;
    const analysis = await ollamaService.generateStream(analysisPrompt, 'You analyze documents and data carefully. Provide structured findings with evidence from the content.', {
      model,
      temperature: 0.5,
      num_predict: 1500,
      signal,
    });
    totalTokens += estimateTokens(analysis);

    return {
      success: true,
      output: analysis,
      tokensUsed: totalTokens,
      model,
      duration: Date.now() - start,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Tool: compress
// ─────────────────────────────────────────────────────────────

const compressTool: AgentTool = {
  id: 'compress',
  name: 'Compress',
  description: 'Compress long text to key points using the compression model',
  icon: '🗜️',
  async execute(params, signal, onProgress) {
    const start = Date.now();
    const model = compressionModel();

    const text = params.context || params.instruction;
    const inputChars = text.length;
    const inputTokensEst = estimateTokens(text);

    onProgress?.(`Compressing ${Math.ceil(inputChars / 1024)} KB of text...`);
    const compressed = await ollamaService.generateStream(
      `Compress the following text to its key points. Preserve all important facts, numbers, names, and conclusions. Remove filler and redundancy.\n\n${text.slice(0, 16000)}`,
      'You compress text to essential points. Be concise but preserve all critical information.',
      { model, temperature: 0.2, num_predict: 800, signal },
    );

    const outputTokensEst = estimateTokens(compressed);
    const reduction = inputTokensEst > 0 ? Math.round((1 - outputTokensEst / inputTokensEst) * 100) : 0;

    return {
      success: true,
      output: `${compressed}\n\n--- Compression stats ---\nInput: ~${inputTokensEst} tokens (${inputChars} chars)\nOutput: ~${outputTokensEst} tokens (${compressed.length} chars)\nReduction: ${reduction}%`,
      tokensUsed: outputTokensEst,
      model,
      duration: Date.now() - start,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Tool: memory-search
// ─────────────────────────────────────────────────────────────

const memorySearchTool: AgentTool = {
  id: 'memory-search',
  name: 'Search Memory',
  description: 'Search agent memories by keyword',
  icon: '🧠',
  async execute(params, _signal, onProgress) {
    const start = Date.now();

    onProgress?.('Searching memories...');
    const query = params.instruction;

    // Try substring search first
    let results = searchMemories(query);

    // If no results, try individual words
    if (results.length === 0) {
      const words = query.split(/\s+/).filter(w => w.length > 3);
      for (const word of words) {
        const wordResults = searchMemories(word);
        for (const r of wordResults) {
          if (!results.find(m => m.id === r.id)) results.push(r);
        }
      }
    }

    // If still nothing, return all memories
    if (results.length === 0) {
      results = getMemories();
    }

    const formatted = results.slice(0, 10).map(m =>
      `[${m.type}] ${m.content}\n  tags: ${m.tags.join(', ') || 'none'} | created: ${m.createdAt.slice(0, 10)}`
    ).join('\n\n');

    return {
      success: results.length > 0,
      output: results.length > 0
        ? `Found ${results.length} matching memories:\n\n${formatted}`
        : 'No memories found.',
      duration: Date.now() - start,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Tool: think
// ─────────────────────────────────────────────────────────────

const thinkTool: AgentTool = {
  id: 'think',
  name: 'Think',
  description: 'Internal reasoning — streams thinking tokens in real-time',
  icon: '💭',
  async execute(params, signal, onProgress) {
    const start = Date.now();
    const model = getThinkingModel();

    onProgress?.('Thinking...\n');
    const thinkPrompt = `${params.instruction}${params.context ? `\n\nContext:\n${params.context}` : ''}`;
    const reasoning = await ollamaService.generateStream(thinkPrompt, 'Think step by step. Break down the problem, consider multiple angles, and reason through to a clear conclusion. Show your reasoning process.', {
      model,
      temperature: 0.6,
      num_predict: 1500,
      signal,
      onChunk: (chunk) => onProgress?.(chunk),
    });

    return {
      success: true,
      output: reasoning,
      tokensUsed: estimateTokens(reasoning),
      model,
      duration: Date.now() - start,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Tool: computer-task
// ─────────────────────────────────────────────────────────────

const computerTaskTool: AgentTool = {
  id: 'computer-task',
  name: 'Computer Task',
  description: 'Delegate a task to the computer agent (VNC) — prepares but does not execute',
  icon: '🖥️',
  async execute(params, _signal, onProgress) {
    const start = Date.now();

    onProgress?.('Preparing computer task...');
    const task = {
      instruction: params.instruction,
      context: params.context,
      urls: params.urls,
    };

    return {
      success: true,
      output: `__COMPUTER_TASK__${JSON.stringify(task)}`,
      artifacts: [{ type: 'computer-task', name: 'task', content: JSON.stringify(task, null, 2) }],
      duration: Date.now() - start,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Tool Registry
// ─────────────────────────────────────────────────────────────

const ALL_TOOLS: AgentTool[] = [
  webSearchTool,
  webDeepDiveTool,
  documentWriteTool,
  fileAnalyzeTool,
  compressTool,
  memorySearchTool,
  thinkTool,
  computerTaskTool,
];

const TOOL_MAP = new Map<string, AgentTool>(ALL_TOOLS.map(t => [t.id, t]));

/** Get a tool by ID */
export function getTool(id: string): AgentTool | undefined {
  return TOOL_MAP.get(id);
}

/** Get all registered tools */
export function getAllTools(): AgentTool[] {
  return [...ALL_TOOLS];
}

// ─────────────────────────────────────────────────────────────
// Tool selection: getToolsForInstruction
// ─────────────────────────────────────────────────────────────

/** Keyword patterns for fast tool matching */
const TOOL_KEYWORDS: Array<{ pattern: RegExp; toolId: string }> = [
  // web-search
  { pattern: /\b(search|look\s*up|find\s+info|research|google)\b/i, toolId: 'web-search' },
  // web-deep-dive
  { pattern: /\b(analyze\s+(this\s+)?(url|page|site|website)|deep\s*dive|scrape)\b/i, toolId: 'web-deep-dive' },
  { pattern: /https?:\/\/[^\s]+/i, toolId: 'web-deep-dive' },
  // document-write
  { pattern: /\b(write|draft|compose|create\s+(a\s+)?(doc|document|report|brief|email|copy))\b/i, toolId: 'document-write' },
  // file-analyze
  { pattern: /\b(analyze|examine|review|inspect)\s+(this\s+)?(file|data|content|code|text)\b/i, toolId: 'file-analyze' },
  // compress
  { pattern: /\b(compress|summarize|condense|shorten|tldr|tl;dr)\b/i, toolId: 'compress' },
  // memory-search
  { pattern: /\b(remember|recall|memory|what\s+did\s+(we|i|you)|what\s+do\s+(we|i|you)\s+know)\b/i, toolId: 'memory-search' },
  // think
  { pattern: /\b(think|reason|figure\s+out|break\s*down|analyze\s+this|consider|evaluate|why)\b/i, toolId: 'think' },
  // computer-task
  { pattern: /\b(computer|vnc|screen|click|type|browse\s+to|open\s+(app|browser)|navigate)\b/i, toolId: 'computer-task' },
];

/**
 * Determine which tools are needed for an instruction.
 * Uses keyword matching first; falls back to LLM classification for ambiguous inputs.
 */
export async function getToolsForInstruction(instruction: string, signal?: AbortSignal): Promise<AgentTool[]> {
  const text = instruction.trim().toLowerCase();
  if (!text) return [];

  // Step 1: keyword match — collect all matching tool IDs
  const matchedIds = new Set<string>();
  for (const rule of TOOL_KEYWORDS) {
    if (rule.pattern.test(text)) {
      matchedIds.add(rule.toolId);
    }
  }

  if (matchedIds.size > 0) {
    return [...matchedIds].map(id => TOOL_MAP.get(id)!).filter(Boolean);
  }

  // Step 2: LLM classification fallback
  try {
    const model = compressionModel();
    const classifyPrompt = `Classify this instruction into one or more tool categories. Output ONLY the category IDs separated by commas.

Categories:
- web-search: searching the web for information
- web-deep-dive: analyzing specific URLs or websites
- document-write: writing or drafting text/documents
- file-analyze: analyzing file contents or data
- compress: compressing or summarizing text
- memory-search: recalling past information
- think: reasoning or problem-solving
- computer-task: interacting with the computer (clicking, typing, navigating)

Instruction: "${instruction}"

Categories:`;

    const result = await ollamaService.generateStream(classifyPrompt, 'Output only category IDs separated by commas. Nothing else.', {
      model,
      temperature: 0.0,
      num_predict: 30,
      signal: signal ?? AbortSignal.timeout(10000),
    });

    const ids = result.trim().split(/[,\s]+/).map(s => s.trim().toLowerCase());
    const tools = ids.map(id => TOOL_MAP.get(id)).filter((t): t is AgentTool => t !== undefined);
    if (tools.length > 0) return tools;
  } catch {
    // Classification failed — fall through to default
  }

  // Default: think tool for unclassified instructions
  return [thinkTool];
}

// ─────────────────────────────────────────────────────────────
// Tool chain execution: runToolChain
// ─────────────────────────────────────────────────────────────

/**
 * Run multiple tools in sequence, feeding each tool's output as context to the next.
 * Reports progress per-tool via onStep callback.
 * Tracks total tokens and duration across the chain.
 */
export async function runToolChain(
  tools: AgentTool[],
  params: ToolParams,
  signal?: AbortSignal,
  onStep?: (toolId: string, progress: string) => void,
): Promise<ToolResult> {
  const chainStart = Date.now();
  let totalTokens = 0;
  let lastOutput = '';
  const allArtifacts: { type: string; name: string; content: string }[] = [];
  const modelsUsed: string[] = [];

  let currentParams = { ...params };

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];

    // Check abort
    if (signal?.aborted) {
      return {
        success: false,
        output: `Chain aborted at step ${i + 1}/${tools.length} (${tool.name}).`,
        artifacts: allArtifacts,
        tokensUsed: totalTokens,
        model: modelsUsed.join(' -> '),
        duration: Date.now() - chainStart,
      };
    }

    onStep?.(tool.id, `Step ${i + 1}/${tools.length}: ${tool.name}`);

    // Feed previous output as context
    if (lastOutput && i > 0) {
      currentParams = {
        ...currentParams,
        context: (currentParams.context ? currentParams.context + '\n\n' : '') +
          `Previous step output:\n${lastOutput.slice(0, 6000)}`,
      };
    }

    try {
      const result = await tool.execute(
        currentParams,
        signal,
        (msg) => onStep?.(tool.id, msg),
      );

      lastOutput = result.output;
      if (result.tokensUsed) totalTokens += result.tokensUsed;
      if (result.model && !modelsUsed.includes(result.model)) modelsUsed.push(result.model);
      if (result.artifacts) allArtifacts.push(...result.artifacts);

      if (!result.success) {
        return {
          success: false,
          output: `Chain failed at step ${i + 1}/${tools.length} (${tool.name}): ${result.output}`,
          artifacts: allArtifacts,
          tokensUsed: totalTokens,
          model: modelsUsed.join(' -> '),
          duration: Date.now() - chainStart,
        };
      }
    } catch (err) {
      return {
        success: false,
        output: `Chain error at step ${i + 1}/${tools.length} (${tool.name}): ${err instanceof Error ? err.message : String(err)}`,
        artifacts: allArtifacts,
        tokensUsed: totalTokens,
        model: modelsUsed.join(' -> '),
        duration: Date.now() - chainStart,
      };
    }
  }

  return {
    success: true,
    output: lastOutput,
    artifacts: allArtifacts,
    tokensUsed: totalTokens,
    model: modelsUsed.join(' -> '),
    duration: Date.now() - chainStart,
  };
}
