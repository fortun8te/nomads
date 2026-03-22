/**
 * Agent Engine — ReAct (Reason + Act) loop with tool execution.
 *
 * This is the core that turns AgentPanel from a basic chat into a Manus-style
 * autonomous agent. It:
 *   1. Receives user messages
 *   2. Asks the LLM what tool to call (or respond directly)
 *   3. Executes the tool
 *   4. Feeds the result back to the LLM
 *   5. Repeats until the LLM says "done" or max steps reached
 *
 * Inspired by OpenManus ReAct loop + agenticSeek routing + Claude Code patterns.
 */

import { ollamaService } from './ollama';
import { getModelForStage, getPlannerModel, getExecutorModel, getThinkMode } from './modelConfig';
import { runPlanAct } from './planActAgent';
import { wayfayerService, screenshotService } from './wayfayer';
import { sandboxService } from './sandboxService';
import { workspaceSave, workspaceRead, workspaceList, getWorkspacePath, ensureWorkspace, workspacePullFile } from './workspace';
import { agentCoordinator } from './agentCoordinator';
import { blackboard } from './blackboard';
import { SubagentPool, aggregateResults } from './subagentManager';
import type { SubagentRole } from './subagentRoles';
import { addMemory, searchMemories } from './memoryStore';
import { loadPromptBody } from './promptLoader';
import { desktopBus } from './desktopBus';
import { runComputerAgent } from './computerAgent/orchestrator';
import type { AskUserRequest, AskUserResponse } from './computerAgent/orchestrator';

// ── Tool Definitions ──

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: ToolResult;
  startedAt?: number;
  completedAt?: number;
}

// ── Agent Step (one think-act cycle) ──

export interface AgentStep {
  thinking: string;
  toolCall?: ToolCall;
  response?: string;   // final text response (no tool)
  timestamp: number;
}

// ── Stream Events ──

export type AgentEngineEventType =
  | 'thinking_start'
  | 'thinking_chunk'
  | 'thinking_done'
  | 'tool_start'
  | 'tool_done'
  | 'tool_error'
  | 'response_start'
  | 'response_chunk'
  | 'response_done'
  | 'step_complete'
  | 'context_compressed'
  | 'task_progress'
  | 'subagent_spawn'
  | 'subagent_progress'
  | 'subagent_complete'
  | 'subagent_failed'
  | 'done'
  | 'error';

/** Subagent lifecycle event payload */
export interface SubagentEventData {
  agentId: string;
  role: string;
  task: string;
  tokens?: number;
  status?: string;
  result?: string;
  confidence?: number;
  error?: string;
}

export interface TaskProgress {
  currentStep: number;
  totalSteps: number;
  steps: Array<{
    description: string;
    status: 'pending' | 'active' | 'done' | 'error';
    toolUsed?: string;
  }>;
  elapsed: number; // seconds
}

export interface AgentEngineEvent {
  type: AgentEngineEventType;
  thinking?: string;
  /** True when thinking came from a dedicated thinking token stream (json.thinking), not from the response text */
  isThinkingToken?: boolean;
  toolCall?: ToolCall;
  response?: string;
  error?: string;
  step?: number;
  timestamp: number;
  taskProgress?: TaskProgress;
  /** Populated for subagent_* events */
  subagent?: SubagentEventData;
}

export type AgentEngineCallback = (event: AgentEngineEvent) => void;

// ── Tool Registry ──

function buildTools(workspaceId?: string, onEvent?: AgentEngineCallback): ToolDef[] {
  const wsTools: ToolDef[] = workspaceId ? [
    {
      name: 'workspace_save',
      description: `Save/create files in workspace (${getWorkspacePath(workspaceId)}). Auto-creates subdirs. Preferred over file_write for task outputs.`,
      parameters: {
        filename: { type: 'string', description: 'Filename (can include subdirectories, e.g. "data/output.csv")', required: true },
        content: { type: 'string', description: 'File content to write', required: true },
      },
      execute: async (params) => {
        try {
          const filename = String(params.filename || '');
          const content = String(params.content || '');
          if (!filename) return { success: false, output: 'No filename provided.' };
          await ensureWorkspace(workspaceId);
          const result = await workspaceSave(workspaceId, filename, content);
          if (!result.success) return { success: false, output: `Save failed: ${result.error}` };
          return { success: true, output: `Saved ${content.length} chars to ${result.fullPath}` };
        } catch (err) {
          return { success: false, output: `Workspace save error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'workspace_list',
      description: `List all files in workspace (${getWorkspacePath(workspaceId)}). Check what's saved.`,
      parameters: {},
      execute: async () => {
        try {
          const result = await workspaceList(workspaceId);
          if (!result.success) return { success: false, output: `List failed: ${result.error}` };
          if (result.files.length === 0) return { success: true, output: 'Workspace is empty.' };
          const listing = result.files.map(f => `${f.name} (${f.sizeStr})`).join('\n');
          return { success: true, output: `${result.files.length} files:\n${listing}` };
        } catch (err) {
          return { success: false, output: `Workspace list error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'workspace_read',
      description: `Read a workspace file by name (${getWorkspacePath(workspaceId)}). Use for files YOU saved or user dropped in. For disk files outside workspace, use file_read.`,
      parameters: {
        filename: { type: 'string', description: 'Filename to read (relative to workspace)', required: true },
      },
      execute: async (params) => {
        try {
          const filename = String(params.filename || '');
          if (!filename) return { success: false, output: 'No filename provided.' };
          const result = await workspaceRead(workspaceId, filename);
          if (!result.success) return { success: false, output: `Read failed: ${result.error}` };
          return { success: true, output: result.content.slice(0, 8000) || '(empty file)' };
        } catch (err) {
          return { success: false, output: `Workspace read error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
  ] : [];

  return [
    ...wsTools,
    {
      name: 'web_search',
      description: 'Search the web and scrape top results. Returns text + source URLs. Use for research, fact-checking, market data.',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        max_results: { type: 'number', description: 'Max pages to scrape (default 5)' },
      },
      execute: async (params, signal) => {
        try {
          const query = String(params.query || '');
          const max = Number(params.max_results) || 5;
          const results = await wayfayerService.research(query, max, signal);
          const summary = results.text?.slice(0, 8000) || 'No results found.';
          const sourceList = results.sources?.map(s => `- ${s.title}: ${s.url}`).join('\n') || '';
          return { success: true, output: `${summary}\n\nSources:\n${sourceList}`, data: results };
        } catch (err) {
          return { success: false, output: `Search failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'browse',
      description: 'Navigate to a URL and interact with it (click, fill, scroll). Falls back to page scraping if browser sandbox is unavailable.',
      parameters: {
        url: { type: 'string', description: 'URL to navigate to', required: true },
        goal: { type: 'string', description: 'What to do on the page (e.g., "click Add to Cart", "fill in the form")' },
      },
      execute: async (params, signal) => {
        try {
          const url = String(params.url || '');
          const goal = String(params.goal || 'Explore this page and summarize what you find.');

          // Try sandbox first
          try {
            const navResult = await sandboxService.navigate(url);
            if (navResult.error) throw new Error(navResult.error);

            let summary = '';
            await runPlanAct(goal, getPlannerModel(), getExecutorModel(), {
              onDone: (s) => { summary = s; },
              onError: (e) => { summary = `Error: ${e}`; },
            }, 20, signal);

            return { success: true, output: summary || `Browsed ${url}`, data: { url, title: navResult.title } };
          } catch {
            // Sandbox unavailable — fall back to Wayfarer scrape + analysis
            // BUG-13: warn when goal contains interaction keywords that scraping cannot fulfill
            const actionKeywords = /\b(click|fill|submit|type|scroll|hover)\b/i;
            const warningNote = actionKeywords.test(goal)
              ? `[WARNING: Wayfarer Plus unavailable — falling back to read-only scraping. Click/fill/submit goals cannot be fulfilled.]\n\n`
              : `[Browser sandbox unavailable — used page scraping fallback]\n\n`;
            const result = await screenshotService.analyzePage(url);
            const text = typeof result.page_text === 'object'
              ? Object.values(result.page_text).join('\n').slice(0, 6000)
              : String(result.page_text || '').slice(0, 6000);
            return { success: true, output: warningNote + (text || 'No content extracted.'), data: result };
          }
        } catch (err) {
          return { success: false, output: `Browse failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'scrape_page',
      description: 'Extract text from a single known URL. Quick read, no interaction. Use web_search when you need to discover pages first.',
      parameters: {
        url: { type: 'string', description: 'URL to scrape', required: true },
      },
      execute: async (params) => {
        try {
          const url = String(params.url || '');
          // Use analyzePage which does text scrape + screenshot in one call
          const result = await screenshotService.analyzePage(url);
          const text = typeof result.page_text === 'object'
            ? Object.values(result.page_text).join('\n').slice(0, 6000)
            : String(result.page_text || '').slice(0, 6000);
          return { success: true, output: text || 'No content extracted.', data: result };
        } catch (err) {
          return { success: false, output: `Scrape failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'analyze_page',
      description: 'Screenshot a URL + extract text. Visual analysis. Use when you need layout/design info, not just text (scrape_page is faster for text-only).',
      parameters: {
        url: { type: 'string', description: 'URL to screenshot and analyze', required: true },
      },
      execute: async (params) => {
        try {
          const url = String(params.url || '');
          const result = await screenshotService.analyzePage(url);
          const text = typeof result.page_text === 'object'
            ? Object.values(result.page_text).join('\n').slice(0, 4000)
            : String(result.page_text || '').slice(0, 4000);
          const dims = result.width && result.height ? `Screenshot: ${result.width}x${result.height}` : '';
          return {
            success: !result.error,
            output: result.error ? `Error: ${result.error}` : `${dims}\n\n${text}`,
            data: result,
          };
        } catch (err) {
          return { success: false, output: `Analysis failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'think',
      description: 'Reason step-by-step before acting. Planning, tradeoffs, debugging. Use when the next action is unclear.',
      parameters: {
        problem: { type: 'string', description: 'The problem to think about', required: true },
      },
      execute: async (params, signal) => {
        try {
          const problem = String(params.problem || '');
          let response = '';
          await ollamaService.generateStream(
            `Analyze this problem systematically:\n\n${problem}\n\nStructured reasoning with clear conclusions.`,
            'Break problems into components. Multiple angles. Concise conclusions.',
            {
              model: getModelForStage('research'),
              temperature: 0.4,
              num_predict: 800,
              signal,
              onChunk: (c: string) => { response += c; },
            },
          );
          return { success: true, output: response };
        } catch (err) {
          return { success: false, output: `Think failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'remember',
      description: 'Pin a fact to persistent memory (survives context compression). URLs, results, decisions. Use early for anything you will need later.',
      parameters: {
        key: { type: 'string', description: 'Short label for this memory', required: true },
        content: { type: 'string', description: 'Content to remember', required: true },
      },
      execute: async (params) => {
        const key = String(params.key || 'note');
        const content = String(params.content || '');
        // Persist to IndexedDB-backed memoryStore so it survives sessions
        try {
          addMemory('general', content, [key]);
        } catch {
          // Non-fatal — in-session memory still works
        }
        return { success: true, output: `Saved to memory: [${key}] ${content}`, data: { key, content } };
      },
    },
    {
      name: 'memory_store',
      description: 'Store a memory to persistent storage (IndexedDB/localStorage) for long-term recall across sessions. Use for important facts, insights, or data that should survive beyond context window.',
      parameters: {
        key: { type: 'string', description: 'Short label/tag for this memory', required: true },
        content: { type: 'string', description: 'Content to store', required: true },
        category: { type: 'string', description: 'Category: "general", "user", "campaign", or "research" (default: "general")' },
      },
      execute: async (params) => {
        try {
          const key = String(params.key || 'note');
          const content = String(params.content || '');
          if (!content) return { success: false, output: 'No content provided.' };
          const category = (String(params.category || 'general')) as 'general' | 'user' | 'campaign' | 'research';
          const validCategories = ['general', 'user', 'campaign', 'research'];
          const safeCategory = validCategories.includes(category) ? category : 'general';
          addMemory(safeCategory, content, [key]);
          return { success: true, output: `Stored memory: ${key}` };
        } catch (err) {
          return { success: false, output: `Memory store error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'memory_search',
      description: 'Search stored memories by keyword. Matches against memory content and tags. Use to recall previously stored facts, insights, or data.',
      parameters: {
        query: { type: 'string', description: 'Search keyword or phrase to match against stored memories', required: true },
      },
      execute: async (params) => {
        try {
          const query = String(params.query || '');
          if (!query) return { success: false, output: 'No query provided.' };
          const results = searchMemories(query);
          if (results.length === 0) {
            return { success: true, output: `No memories found matching: ${query}` };
          }
          const formatted = results.map(m => ({
            id: m.id,
            type: m.type,
            content: m.content,
            tags: m.tags,
            createdAt: m.createdAt,
          }));
          return { success: true, output: JSON.stringify(formatted, null, 2), data: formatted };
        } catch (err) {
          return { success: false, output: `Memory search error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'shell_exec',
      description: 'Run a shell command (bash). ffmpeg, curl, git, npm, etc. Max 2000 chars output (full auto-saved if truncated). Use run_code for scripts.',
      parameters: {
        command: { type: 'string', description: 'Shell command to execute (bash)', required: true },
        timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 30000, max 120000)' },
      },
      execute: async (params) => {
        try {
          const command = String(params.command || '');
          if (!command) return { success: false, output: 'No command provided.' };

          // Safety: block obviously destructive commands
          const dangerous = /\brm\s+-rf\s+[\/~]|sudo\s+rm|mkfs|dd\s+if=|:\(\)\s*\{/i;
          if (dangerous.test(command)) {
            return { success: false, output: 'Blocked: potentially destructive command. Use ask_user to confirm with the user first.' };
          }

          const timeout = Math.min(Number(params.timeout_ms) || 30000, 120000);
          const resp = await fetch('/api/shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, timeout }),
          });

          if (!resp.ok) {
            // Fallback: try via sandbox consoleExec for simple commands
            try {
              const result = await sandboxService.consoleExec(command);
              const raw = String(result);
              if (raw.length > 2000) {
                return { success: true, output: raw.slice(0, 2000) + '\n[...truncated, full output available via workspace]' };
              }
              return { success: true, output: raw || '(no output)' };
            } catch {
              return { success: false, output: `Shell API not available (${resp.status}). Set up /api/shell endpoint or run commands manually.` };
            }
          }

          const result = await resp.json();
          const raw = [result.stdout, result.stderr].filter(Boolean).join('\n');
          if (raw.length > 2000) {
            return { success: result.exitCode === 0, output: raw.slice(0, 2000) + '\n[...truncated]' };
          }
          return { success: result.exitCode === 0, output: raw || '(no output)' };
        } catch (err) {
          return { success: false, output: `Shell error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'file_read',
      description: 'Read a file from disk by absolute path (e.g. /Users/x/data.csv). Max 4000 chars. For workspace files use workspace_read. For huge files use shell_exec with head/tail.',
      parameters: {
        path: { type: 'string', description: 'File path (absolute like /Users/x/file.txt, or relative to workspace)', required: true },
        max_lines: { type: 'number', description: 'Max lines to return (default 200)' },
      },
      execute: async (params) => {
        try {
          const path = String(params.path || '');
          if (!path) return { success: false, output: 'No path provided.' };
          const resp = await fetch('/api/file/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, maxLines: Number(params.max_lines) || 200 }),
          });
          if (!resp.ok) return { success: false, output: `File API not available (${resp.status}).` };
          const result = await resp.json();
          const content = result.content || '';
          if (content.length > 4000) {
            return { success: true, output: content.slice(0, 4000) + '\n[...truncated, use max_lines or shell_exec for full content]' };
          }
          return { success: true, output: content || '(empty file)' };
        } catch (err) {
          return { success: false, output: `Read error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'file_write',
      description: 'Write a file to disk by absolute path. Creates dirs if needed. For workspace outputs, prefer workspace_save.',
      parameters: {
        path: { type: 'string', description: 'Absolute file path to write (e.g. /tmp/output.json)', required: true },
        content: { type: 'string', description: 'Content to write to the file', required: true },
      },
      execute: async (params) => {
        try {
          const path = String(params.path || '');
          const content = String(params.content || '');
          if (!path) return { success: false, output: 'No path provided.' };
          const resp = await fetch('/api/file/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content }),
          });
          if (!resp.ok) return { success: false, output: `File API not available (${resp.status}).` };
          return { success: true, output: `Written ${content.length} chars to ${path}` };
        } catch (err) {
          return { success: false, output: `Write error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'file_find',
      description: 'Find files by glob pattern or search inside file contents. Locate files before reading them.',
      parameters: {
        pattern: { type: 'string', description: 'Glob pattern to match (e.g. "*.py", "report*.pdf", "**/*.ts")', required: true },
        path: { type: 'string', description: 'Directory to search in (default: workspace or current directory)' },
        in_content: { type: 'boolean', description: 'If true, search inside file contents for the pattern text instead of matching filenames' },
      },
      execute: async (params) => {
        try {
          const pattern = String(params.pattern || '');
          if (!pattern) return { success: false, output: 'No pattern provided.' };
          const dir = String(params.path || '.');
          const inContent = Boolean(params.in_content);
          const cmd = inContent
            ? `grep -rl "${pattern}" "${dir}" 2>/dev/null | head -30`
            : `find "${dir}" -name "${pattern}" -type f 2>/dev/null | head -50`;
          const resp = await fetch('/api/shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, timeout: 15000 }),
          });
          if (!resp.ok) return { success: false, output: 'Shell API not available.' };
          const result = await resp.json();
          const files = (result.stdout || '').trim();
          if (!files) return { success: true, output: 'No files found.' };
          const count = files.split('\n').length;
          return { success: true, output: `Found ${count} file(s):\n${files}` };
        } catch (err) {
          return { success: false, output: `Find error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'run_code',
      description: 'Run a code snippet in python, javascript (node), or bash. Executes via shell. Use for: data processing, calculations, API calls, text manipulation, quick scripts. Max output: 2000 chars.',
      parameters: {
        language: { type: 'string', description: '"python", "javascript", or "bash"', required: true },
        code: { type: 'string', description: 'Code to execute', required: true },
      },
      execute: async (params) => {
        try {
          const lang = String(params.language || 'python').toLowerCase();
          const code = String(params.code || '');
          if (!code) return { success: false, output: 'No code provided.' };

          let cmd: string;
          if (lang === 'python' || lang === 'py') {
            cmd = `python3 -c ${JSON.stringify(code)} 2>&1`;
          } else if (lang === 'javascript' || lang === 'js' || lang === 'node') {
            cmd = `node -e ${JSON.stringify(code)} 2>&1`;
          } else if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
            cmd = `bash -c ${JSON.stringify(code)} 2>&1`;
          } else {
            return { success: false, output: `Unsupported language: ${lang}. Use "python", "javascript", or "bash".` };
          }

          const resp = await fetch('/api/shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, timeout: 60000 }),
          });
          if (!resp.ok) return { success: false, output: 'Shell API not available for code execution.' };
          const result = await resp.json();
          const raw = [result.stdout, result.stderr].filter(Boolean).join('\n');
          if (raw.length > 2000) {
            return { success: result.exitCode === 0, output: raw.slice(0, 2000) + '\n[...truncated]' };
          }
          return { success: result.exitCode === 0, output: raw || '(no output)' };
        } catch (err) {
          return { success: false, output: `Code execution error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'ask_user',
      description: 'Pause execution and ask the user a question. Shows clickable option buttons if provided. Use for: clarification, confirmation before destructive actions, choosing between alternatives. The agent loop pauses until the user responds.',
      parameters: {
        question: { type: 'string', description: 'Question to ask the user', required: true },
        options: { type: 'string', description: 'Comma-separated clickable options (e.g., "Yes,No,Skip"). User can also type a free-form answer.' },
      },
      execute: async (params) => {
        // This is handled specially by the engine — it pauses and waits for user input
        const question = String(params.question || 'What would you like to do?');
        return { success: true, output: `WAITING_FOR_USER: ${question}`, data: { question, options: String(params.options || '') } };
      },
    },
    {
      name: 'wait',
      description: 'Wait N seconds before continuing. Use for: rate limiting between API calls, waiting for a process to finish, polling delays. Max 60 seconds.',
      parameters: {
        seconds: { type: 'number', description: 'Seconds to wait (1-60)', required: true },
        reason: { type: 'string', description: 'Brief reason for waiting (shown in UI)' },
      },
      execute: async (params, signal) => {
        const secs = Math.min(Math.max(Number(params.seconds) || 5, 1), 60);
        const reason = String(params.reason || '');
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, secs * 1000);
          if (signal) {
            signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted')); }, { once: true });
          }
        });
        return { success: true, output: `Waited ${secs}s${reason ? `: ${reason}` : ''}` };
      },
    },
    {
      name: 'use_computer',
      description: 'Spawn a browser automation session to accomplish a goal. The computer agent navigates pages, clicks buttons, fills forms, and reports back. Falls back to web scraping + analysis if the browser sandbox is not running. Returns: pages visited, actions taken, key findings.',
      parameters: {
        goal: { type: 'string', description: 'What to accomplish in the browser (e.g. "Go to simpletics.com and find all product prices")', required: true },
        start_url: { type: 'string', description: 'URL to start at (optional — agent can navigate itself)' },
        max_actions: { type: 'number', description: 'Max browser actions (default 20, max 50)' },
      },
      execute: async (params, signal) => {
        try {
          const goal = String(params.goal || '');
          if (!goal) return { success: false, output: 'No goal provided.' };
          const startUrl = String(params.start_url || '');
          const maxActions = Math.min(Number(params.max_actions) || 20, 50);

          // Check if sandbox is reachable before committing to a full session
          let sandboxAvailable = false;
          try {
            const healthCheck = await fetch('http://localhost:8080/health', { signal: AbortSignal.timeout(3000) });
            sandboxAvailable = healthCheck.ok;
          } catch { sandboxAvailable = false; }

          if (!sandboxAvailable) {
            // Fallback: use Wayfarer to scrape + screenshot the target URL
            const targetUrl = startUrl || '';
            if (!targetUrl) {
              return { success: false, output: 'Browser sandbox is not running (localhost:8080). Start it with Docker, or provide a start_url so I can fall back to web scraping.' };
            }

            try {
              const result = await screenshotService.analyzePage(targetUrl);
              const text = typeof result.page_text === 'object'
                ? Object.values(result.page_text).join('\n').slice(0, 6000)
                : String(result.page_text || '').slice(0, 6000);
              const dims = result.width && result.height ? `Screenshot: ${result.width}x${result.height}` : '';
              return {
                success: true,
                output: `[Browser sandbox unavailable — used Wayfarer scraping fallback]\n\nGoal: ${goal}\nURL: ${targetUrl}\n${dims}\n\n${text || 'No content extracted.'}`,
                data: result,
              };
            } catch (fallbackErr) {
              return { success: false, output: `Browser sandbox is not running and Wayfarer fallback also failed: ${fallbackErr instanceof Error ? fallbackErr.message : fallbackErr}` };
            }
          }

          // Navigate to start URL if provided
          if (startUrl) {
            const navResult = await sandboxService.navigate(startUrl);
            if (navResult.error) return { success: false, output: `Navigation failed: ${navResult.error}` };
          }

          // Track session data
          const sessionData = {
            pagesVisited: [] as string[],
            actionsCount: 0,
            findings: [] as string[],
            filesSaved: [] as string[],
            startTime: Date.now(),
          };

          let summary = '';

          await runPlanAct(goal, getPlannerModel(), getExecutorModel(), {
            onAction: (action, _result) => {
              sessionData.actionsCount++;
              if (action.action === 'navigate' && action.url) {
                sessionData.pagesVisited.push(action.url);
              }
            },
            onDone: (s) => { summary = s; },
            onError: (e) => { summary = `Error during computer session: ${e}`; },
          }, maxActions, signal);

          // Try to capture final screenshot and save to workspace
          // BUG-04: track latest screenshot so it can be included in tool result data
          let latestScreenshotBase64: string | undefined;
          if (workspaceId) {
            try {
              await ensureWorkspace(workspaceId);
              const screenshotResult = await sandboxService.screenshot(70);
              if (screenshotResult.image_base64) {
                latestScreenshotBase64 = screenshotResult.image_base64;
                const fname = `computer-session-${Date.now()}.jpg`;
                const shellPath = `${getWorkspacePath(workspaceId).replace('~', '$HOME')}/${fname}`;
                await fetch('/api/shell', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    command: `echo "${screenshotResult.image_base64}" | base64 -d > "${shellPath}"`,
                    timeout: 10000,
                  }),
                });
                sessionData.filesSaved.push(fname);
              }
              if (summary) {
                const summaryFname = `computer-session-${Date.now()}-summary.md`;
                await workspaceSave(workspaceId, summaryFname, `# Computer Session\n\n**Goal:** ${goal}\n**Pages visited:** ${sessionData.pagesVisited.length}\n**Actions taken:** ${sessionData.actionsCount}\n**Duration:** ${Math.round((Date.now() - sessionData.startTime) / 1000)}s\n\n## Findings\n\n${summary}`);
                sessionData.filesSaved.push(summaryFname);
              }
            } catch { /* screenshot/save failed, non-critical */ }
          }

          const elapsed = Math.round((Date.now() - sessionData.startTime) / 1000);
          const pagesStr = sessionData.pagesVisited.length > 0
            ? `\nPages visited: ${[...new Set(sessionData.pagesVisited)].join(', ')}`
            : '';
          const filesStr = sessionData.filesSaved.length > 0
            ? `\nFiles saved: ${sessionData.filesSaved.join(', ')}`
            : '';

          const output = `Computer session completed (${elapsed}s, ${sessionData.actionsCount} actions)${pagesStr}${filesStr}\n\nResult: ${summary || 'No summary available.'}`;

          return {
            success: true,
            output,
            data: {
              type: 'computer_session',
              pagesVisited: [...new Set(sessionData.pagesVisited)],
              actionsCount: sessionData.actionsCount,
              filesSaved: sessionData.filesSaved,
              duration: elapsed,
              summary,
              // BUG-04: expose final screenshot so AgentPanel can display it
              image_base64: latestScreenshotBase64,
            },
          };
        } catch (err) {
          return { success: false, output: `Computer session failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'sandbox_pull',
      description: 'Copy a file from the sandbox (browser downloads folder or any absolute path) into the workspace. Use after use_computer downloads a file.',
      parameters: {
        source_path: { type: 'string', description: 'Absolute path to the file (e.g. /tmp/downloads/report.pdf)', required: true },
        dest_filename: { type: 'string', description: 'Destination filename in workspace (default: same as source filename)' },
      },
      execute: async (params) => {
        try {
          if (!workspaceId) return { success: false, output: 'No workspace active.' };
          const sourcePath = String(params.source_path || '');
          if (!sourcePath) return { success: false, output: 'No source path provided.' };
          const destFilename = params.dest_filename ? String(params.dest_filename) : undefined;
          await ensureWorkspace(workspaceId);
          const result = await workspacePullFile(workspaceId, sourcePath, destFilename);
          if (!result.success) return { success: false, output: `Pull failed: ${result.error}` };
          return { success: true, output: `Pulled "${result.filename}" into workspace (${result.sizeStr})` };
        } catch (err) {
          return { success: false, output: `Sandbox pull error: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'spawn_worker',
      description: 'Start a browser agent worker with a specific goal. The worker runs autonomously in the background using Plan-Act and posts findings to the shared blackboard. Use for parallelizing tasks across multiple goals (e.g., research 3 competitor sites simultaneously).',
      parameters: {
        goal: { type: 'string', description: 'What the worker should accomplish (e.g., "Go to competitor.com and extract all product prices")', required: true },
        machine_id: { type: 'string', description: 'Machine identifier for the worker (default: "local")' },
      },
      execute: async (params, signal) => {
        try {
          const goal = String(params.goal || '');
          if (!goal) return { success: false, output: 'No goal provided.' };
          const machineId = String(params.machine_id || 'local');
          const workerId = agentCoordinator.spawnWorker(machineId, goal, signal);
          return {
            success: true,
            output: `Worker spawned: ${workerId}\nGoal: ${goal}\nMachine: ${machineId}\n\nThe worker is running in the background. Use check_workers to monitor progress and read_findings to see results.`,
            data: { workerId, goal, machineId },
          };
        } catch (err) {
          return { success: false, output: `Spawn failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'check_workers',
      description: 'Check the status of all running worker agents. Returns each worker\'s ID, goal, status (running/done/failed), and findings count.',
      parameters: {},
      execute: async () => {
        try {
          const workers = agentCoordinator.checkWorkers();
          if (workers.length === 0) {
            return { success: true, output: 'No workers active.' };
          }
          const lines = workers.map(w => {
            const elapsed = Math.round((Date.now() - w.startedAt) / 1000);
            const duration = w.completedAt
              ? `${Math.round((w.completedAt - w.startedAt) / 1000)}s`
              : `${elapsed}s (running)`;
            return `[${w.id}] ${w.status.toUpperCase()} (${duration})\n  Goal: ${w.goal}\n  Findings: ${w.findings.length}`;
          });
          return {
            success: true,
            output: `${workers.length} worker(s):\n\n${lines.join('\n\n')}`,
            data: workers.map(w => ({ id: w.id, status: w.status, goal: w.goal, findings: w.findings.length })),
          };
        } catch (err) {
          return { success: false, output: `Check failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'read_findings',
      description: 'Read the shared blackboard — all findings, errors, and status updates posted by workers. Optionally filter by worker ID or entry type.',
      parameters: {
        worker_id: { type: 'string', description: 'Filter to a specific worker (optional)' },
        type: { type: 'string', description: 'Filter by type: "finding", "error", "status", "file", "screenshot" (optional)' },
        latest: { type: 'number', description: 'Only return the N most recent entries (default: all)' },
      },
      execute: async (params) => {
        try {
          const workerId = params.worker_id ? String(params.worker_id) : undefined;
          const entryType = params.type ? String(params.type) as 'finding' | 'error' | 'status' | 'file' | 'screenshot' : undefined;
          const latest = params.latest ? Number(params.latest) : undefined;

          let entries;
          if (workerId) {
            entries = blackboard.readBySource(workerId);
          } else if (entryType) {
            entries = blackboard.readByType(entryType);
          } else if (latest) {
            entries = blackboard.getLatest(latest);
          } else {
            entries = blackboard.read();
          }

          // Apply latest limit if combined with other filters
          if (latest && workerId) {
            entries = entries.slice(-latest);
          }

          if (entries.length === 0) {
            return { success: true, output: 'Blackboard is empty. No findings yet.' };
          }

          const formatted = entries.map(e => {
            const age = Math.round((Date.now() - e.timestamp) / 1000);
            return `[${e.source}] ${e.type.toUpperCase()} "${e.key}": ${e.value.slice(0, 300)} (${age}s ago)`;
          }).join('\n');

          return {
            success: true,
            output: `${entries.length} entries:\n\n${formatted}`,
            data: entries,
          };
        } catch (err) {
          return { success: false, output: `Read failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    {
      name: 'send_instruction',
      description: 'Send a follow-up instruction to a running worker. The message is queued and will be picked up on the worker\'s next planning cycle. Use to redirect a worker or give it additional context.',
      parameters: {
        worker_id: { type: 'string', description: 'ID of the worker to send to', required: true },
        message: { type: 'string', description: 'Instruction or context to send', required: true },
      },
      execute: async (params) => {
        try {
          const workerId = String(params.worker_id || '');
          const message = String(params.message || '');
          if (!workerId) return { success: false, output: 'No worker_id provided.' };
          if (!message) return { success: false, output: 'No message provided.' };

          const worker = agentCoordinator.getWorker(workerId);
          if (!worker) return { success: false, output: `Worker not found: ${workerId}` };
          if (worker.status !== 'running') return { success: false, output: `Worker ${workerId} is ${worker.status}, not running.` };

          agentCoordinator.sendToWorker(workerId, message);
          return {
            success: true,
            output: `Instruction queued for ${workerId}: "${message.slice(0, 100)}"`,
          };
        } catch (err) {
          return { success: false, output: `Send failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
    // ── Desktop control tool (vision-driven) ──────────────────────────────
    {
      name: 'control_desktop',
      description: 'Control the Neuro desktop UI using vision. Give a natural language goal and the vision model will look at the screen and click/type/scroll to accomplish it. Use for: opening apps (Chrome, Finder, Terminal), navigating the browser, running terminal commands, any UI interaction on the desktop.',
      parameters: {
        goal: {
          type: 'string',
          description: 'Natural language goal, e.g. "open Chrome", "go to google.com", "open Terminal and type help"',
          required: true,
        },
      },
      execute: async (params, signal) => {
        const goal = String(params.goal || '');
        if (!goal) return { success: false, output: 'No goal provided.' };

        // Resolve desktopEl via the bus — ask ComputerDesktop to provide its element
        // We use a temporary run_goal event to get the element ref indirectly.
        // The full computer agent is wired through the desktopBus ask_user event.
        const onAskUser = (request: AskUserRequest): Promise<AskUserResponse> =>
          new Promise<AskUserResponse>(resolve => {
            desktopBus.emit({
              type: 'ask_user',
              question: request.question,
              isClarification: request.isClarification,
              resolve: (answer: string) => resolve({ value: answer, label: answer }),
            });
          });

        // Attempt to get desktopEl from the DOM — look for the desktop container
        const desktopEl = document.querySelector<HTMLElement>('[data-desktop-root]');
        if (!desktopEl) {
          // Fallback: fire simple run_goal event for backwards-compat
          desktopBus.emit({ type: 'run_goal', goal });
          return { success: true, output: `Desktop control started (legacy mode) for goal: ${goal}` };
        }

        try {
          const summary = await runComputerAgent(goal, desktopEl, {
            signal,
            onStatus: (msg) => onEvent?.({ type: 'step_complete', thinking: msg, timestamp: Date.now() }),
            onAskUser,
            onBrowserUrl: (url) => desktopBus.emit({ type: 'navigate_chrome', url }),
          });
          return { success: true, output: summary };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, output: `Desktop agent error: ${msg}` };
        }
      },
    },
    {
      name: 'done',
      description: 'Signal task completion. Call this when the user\'s request is fully resolved. Include a summary of what was accomplished.',
      parameters: {
        summary: { type: 'string', description: 'Brief summary of what was accomplished', required: true },
      },
      execute: async (params) => {
        return { success: true, output: String(params.summary || 'Task complete.') };
      },
    },
    {
      name: 'spawn_agents',
      description: 'Spawn 1–5 parallel subagents to research or analyze specific topics simultaneously. Each agent runs independently and reports back. Use when you need to research multiple angles at once (e.g., 3 competitor sites in parallel). Returns merged findings.',
      parameters: {
        tasks: { type: 'array', description: 'Array of {role, query} objects. role: researcher|analyzer|synthesizer|validator|strategist|compressor|evaluator. query: what this agent should investigate.', required: true },
        reason: { type: 'string', description: 'Why you are spawning these agents (shown in UI)', required: true },
      },
      execute: async (params, signal) => {
        try {
          const rawTasks = params.tasks as Array<{ role?: string; query?: string }> | undefined;
          if (!rawTasks || !Array.isArray(rawTasks) || rawTasks.length === 0) {
            return { success: false, output: 'tasks must be a non-empty array of {role, query} objects.' };
          }
          const capped = rawTasks.slice(0, 5);
          const reason = String(params.reason || 'Parallel research');

          const pool = new SubagentPool({ id: `spawn-${Date.now()}`, maxConcurrent: 5 });

          const requests = capped.map((t, i) => {
            const agentId = `sa-${Date.now()}-${i}`;
            const role = (t.role || 'researcher') as SubagentRole;
            const task = t.query || '';
            onEvent?.({ type: 'subagent_spawn', subagent: { agentId, role, task }, timestamp: Date.now() });
            return { id: agentId, role, task, context: `Parallel research task. Reason: ${reason}`, signal };
          });

          const callbacks = {
            onProgress: (progress: import('./subagentManager').SubagentProgress) => {
              onEvent?.({
                type: 'subagent_progress',
                subagent: {
                  agentId: progress.subagentId,
                  role: progress.role,
                  task: '',
                  tokens: Math.round((progress.partialOutput?.split(/\s+/).length || 0) * 1.3),
                  status: progress.status,
                },
                timestamp: Date.now(),
              });
            },
            onComplete: (result: import('./subagentManager').SubagentResult) => {
              if (result.status === 'completed') {
                onEvent?.({
                  type: 'subagent_complete',
                  subagent: {
                    agentId: result.subagentId,
                    role: result.role,
                    task: result.task,
                    result: result.output.slice(0, 300),
                    confidence: result.confidence,
                    tokens: result.tokensUsed,
                  },
                  timestamp: Date.now(),
                });
              } else {
                onEvent?.({
                  type: 'subagent_failed',
                  subagent: {
                    agentId: result.subagentId,
                    role: result.role,
                    task: result.task,
                    error: result.error || result.status,
                  },
                  timestamp: Date.now(),
                });
              }
            },
          };

          const results = await pool.submitAll(requests, callbacks);
          const aggregated = aggregateResults(results);

          const totalTokens = results.reduce((s, r) => s + r.tokensUsed, 0);
          const summary =
            `Agents complete: ${aggregated.highConfidenceCount} high-confidence, ` +
            `${aggregated.lowConfidenceCount} low-confidence, ` +
            `${aggregated.failedCount} failed. ` +
            `Total tokens: ~${totalTokens}.`;

          return {
            success: true,
            output: `${summary}\n\n${aggregated.mergedOutput}`,
            data: { aggregated, results },
          };
        } catch (err) {
          return { success: false, output: `spawn_agents failed: ${err instanceof Error ? err.message : err}` };
        }
      },
    },
  ];
}

// ── System Prompt Builder ──

function buildSystemPrompt(tools: ToolDef[], memories: Array<{ key: string; content: string }>, workspaceId?: string, campaignContext?: CampaignContextData): string {
  const now = new Date();
  const timeStr = now.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });

  const toolDescriptions = tools.map(t => {
    const params = Object.entries(t.parameters)
      .map(([k, v]) => `  - ${k} (${v.type}${v.required ? ', required' : ''}): ${v.description}`)
      .join('\n');
    return `### ${t.name}\n${t.description}\nParameters:\n${params}`;
  }).join('\n\n');

  // Separate user-profile memories (user_*) from session/task memories
  const userMemories = memories.filter(m => m.key.startsWith('user_') || m.key === 'brand' || m.key === 'product' || m.key === 'audience' || m.key === 'goal' || m.key === 'user_style');
  const taskMemories = memories.filter(m => !userMemories.includes(m));

  const userSection = userMemories.length > 0
    ? `\n\n## USER CONTEXT (SILENT BACKGROUND ONLY)\n${userMemories.map(m => `${m.key}: ${m.content}`).join('\n')}\nUse this silently to calibrate your responses. NEVER recite it back, summarize the user to themselves, announce what you know about them, or reference it unprompted. It is background context, not something to perform.`
    : '';

  const memorySection = taskMemories.length > 0
    ? `\n\n## SESSION MEMORY\n${taskMemories.map(m => `[${m.key}]: ${m.content}`).join('\n')}`
    : '';

  const campaignSection = campaignContext
    ? (() => {
        const lines: string[] = [
          `\n\n## CAMPAIGN CONTEXT`,
          `You have access to the following campaign intelligence. Use it to inform your work — reference it when relevant, but don't dump it unprompted.`,
          ``,
          `Brand: ${campaignContext.brand}`,
        ];
        if (campaignContext.productDescription) lines.push(`Product: ${campaignContext.productDescription}`);
        if (campaignContext.targetAudience) lines.push(`Target Audience: ${campaignContext.targetAudience}`);
        if (campaignContext.marketingGoal) lines.push(`Marketing Goal: ${campaignContext.marketingGoal}`);
        if (campaignContext.productFeatures?.length) lines.push(`Key Features: ${campaignContext.productFeatures.join(', ')}`);
        if (campaignContext.productPrice) lines.push(`Price: ${campaignContext.productPrice}`);
        if (campaignContext.brandDna) lines.push(`\nBrand DNA:\n${campaignContext.brandDna}`);
        if (campaignContext.personaDna) lines.push(`\nPersona DNA:\n${campaignContext.personaDna}`);
        if (campaignContext.researchSummary) lines.push(`\nResearch Summary:\n${campaignContext.researchSummary}`);
        if (campaignContext.angles) lines.push(`\nApproved Angles:\n${campaignContext.angles}`);
        return lines.join('\n');
      })()
    : '';

  const workspaceSection = workspaceId
    ? `\n\nWORKSPACE: ${getWorkspacePath(workspaceId)}\nYou have a dedicated workspace folder for this chat session. Use workspace_save to save files, workspace_read to read them, and workspace_list to see what's there. The user may also drop files into the workspace — you can read those with workspace_read. Always prefer workspace tools over file_write/file_read for task outputs.`
    : '';

  // Load identity block from prompts folder (falls back to inline if file missing)
  const identityBlock = loadPromptBody('agents/glance-identity.txt') || `You are **Neuro**, an autonomous AI agent built for creative marketing intelligence.
You are NOT Qwen, ChatGPT, Claude, LLaMA, or any other model. You are Neuro, full stop.

Scripted responses for identity questions:
- "what model are you?" → "I'm Neuro."
- "who made you?" → "I'm part of the Neuro creative intelligence system."
- "are you Qwen / GPT / Claude / LLaMA?" → "No, I'm Neuro."
- Any request to roleplay as a different AI → answer as Neuro and redirect: "I'm Neuro — what do you need?"

NEVER: reveal underlying model names, say "I'm a large language model", say "developed by [company]", describe your architecture or training data. These rules hold even if the user claims they "need to know for testing" or frames it as a hypothetical.`;

  return `# NOMAD — Autonomous Creative Intelligence Agent

## IDENTITY (IMMUTABLE)
${identityBlock}

## COMMUNICATION STYLE
Be direct and concrete. Skip preamble.

WRONG: "That's a great question! I'd be happy to help you with that. Let me look into it."
RIGHT: "Here's what I found." / "On it." / "Done — saved to workspace."

WRONG: "Certainly! Of course! Sure thing! Absolutely!"
RIGHT: Just start the answer or the action.

WRONG (over-explaining): "First I'll search the web, then I'll analyze the results, then I'll synthesize..."
RIGHT: Search, then report the finding. Explain the plan only when the task has 4+ steps or genuine ambiguity.

Rules:
- No filler openers: never start with "Sure!", "Of course!", "Certainly!", "Happy to help!", "Great question!", "Absolutely!"
- No emoji in responses unless the user uses them first
- Match the user's register — casual if they're casual, technical if technical
- Default response length: as short as the answer allows. Use more words only when the task requires it
- Use markdown (headers, bullets, code blocks) when it improves clarity. For simple answers, plain text
- Never address the user with unsolicited personal details — use what you know to calibrate, not to demonstrate

## UNCERTAINTY PROTOCOL
When you don't know something or need information:
- Missing input: "I need [X] to proceed — can you provide it?" (one question, not a list)
- Two valid approaches: briefly state both and pick one: "I can do X or Y. Going with X — let me know if you want Y instead."
- Assumption made: state it once, act on it: "Assuming [X]. If that's wrong, stop me."
- Tool returned no results: try one alternative approach, then report what you found (or didn't)

NEVER: guess at facts, fabricate URLs, invent data, or present uncertainty as confidence. If you don't know, say "I don't know — I can search for it" and use a tool.

## THINKING & BREVITY (CRITICAL)
- Do NOT narrate your thinking process. Act, don't describe.
- Maximum 1-2 sentences before a tool call. Never write paragraphs of reasoning.
- Never say "I will now...", "Let me think about...", "I'll analyze...", "Let me look into...". Just call the tool.
- Thinking should be SHORT. Under 100 tokens. If you need to reason, use the think tool.
- When using a tool, state its name explicitly: "browse simpletics.com" not "I'll look at the website". "web_search collagen trends" not "Let me search for that."
- For 3+ step tasks: one-line plan, then execute. "Plan: 1. search 2. scrape 3. summarize." Then do it.
- Track progress briefly: "Step 2/3 done." Not "I've completed step 2 and now I'll move on to step 3."

## TIME
${timeStr}
${workspaceSection}

## TOOLS
${toolDescriptions}

To call a tool:
\`\`\`tool
{"name": "tool_name", "args": {"param1": "value1"}}
\`\`\`

## CAPABILITIES
- Shell: run commands (ffmpeg, python, node, git, curl) via shell_exec
- Code: run python/javascript/bash via run_code
- Files: read, write, find files on disk
- Web: search, scrape, browse, screenshot pages
- Desktop: use control_desktop with a natural language goal — the vision model will look at the screen and click/type automatically
- Computer: use_computer for full browser automation (clicking, forms, multi-page navigation)
- Sandbox: sandbox_pull copies files from computer sandbox to workspace
- Workspace: persistent folder for session outputs (workspace_save/read/list)
- Memory: remember (quick pin), memory_store (persistent with category), memory_search (recall by keyword)
- Context: large tool outputs auto-saved to _tool_results/ — use workspace_read for full data
- Workers: spawn_worker for parallel browser agents, check_workers/read_findings/send_instruction
- Parallel agents: spawn_agents to run 1–5 subagents simultaneously (researcher/analyzer/synthesizer/validator/strategist)

## COMPUTER & APP CONTROL
You have FULL computer control. NEVER say you "can't" do something a tool can do. Just do it.
- Desktop: use control_desktop with a natural language goal — the vision model will look at the screen and click/type automatically
- Examples: control_desktop("open Chrome"), control_desktop("navigate Chrome to google.com"), control_desktop("open Terminal and run help")
- Open any macOS app: shell_exec → \`open -a "AppName"\`
RULE: If the user asks to open Chrome, Finder, Terminal, or navigate to a URL, call control_desktop immediately. No explanation needed.

## EXECUTION RULES
1. Facts only from tool results. Never hallucinate.
2. Cite sources briefly: "via web_search" or "from browse."
3. Act, don't narrate. Call the tool directly.
4. On failure: try one alternative. If that fails: "X failed: [reason]. Options: A or B."
5. ask_user only for: missing credentials, ambiguous target, destructive actions.
6. remember for key facts that must survive context compression.
7. One tool per message.
8. Call done when finished. One-line summary.
9. NEVER surface personal user info unprompted.
10. Concise by default.

## PREFERENCE LEARNING
When the user corrects your output, notes a preference, or repeats the same request in a different way: capture the underlying preference with remember using key user_pref_[category]. Categories worth capturing:
- user_pref_format: how they want output structured (bullets, prose, code, tables)
- user_pref_verbosity: terse / normal / detailed
- user_pref_domain: current project focus or domain they're working in
- user_pref_style: communication register (casual/Dutch-English mix, technical, etc.)

Do this silently — no need to announce "I've noted your preference." Just do it.${userSection}${memorySection}${campaignSection}`;
}

// ── Parse Tool Call from LLM Response ──

function parseToolCall(text: string): { name: string; args: Record<string, unknown> } | null {
  // Look for ```tool ... ``` blocks
  const toolBlockMatch = text.match(/```tool\s*\n?([\s\S]*?)```/);
  if (toolBlockMatch) {
    try {
      const parsed = JSON.parse(toolBlockMatch[1].trim());
      if (parsed.name && typeof parsed.name === 'string') {
        return { name: parsed.name, args: parsed.args || {} };
      }
    } catch { /* fall through */ }
  }

  // Fallback: look for raw JSON with "name" field
  const jsonMatch = text.match(/\{[\s\S]*?"name"\s*:\s*"(\w+)"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.name && typeof parsed.name === 'string') {
        return { name: parsed.name, args: parsed.args || {} };
      }
    } catch { /* not valid json */ }
  }

  return null;
}

// ── Detect if LLM clearly tried to use a tool but formatted it wrong ──

function looksLikeMalformedToolCall(text: string): boolean {
  // Clear JSON-like block with "name" key but failed to parse
  if (/\{[\s\S]*?"name"\s*:\s*"/.test(text)) return true;
  // XML-style tool call tags
  if (/<tool_call>|<function>|<\/tool_call>|<\/function>/.test(text)) return true;
  // ✿FUNCTION✿ format
  if (/✿FUNCTION✿/.test(text)) return true;
  // ```json blocks containing a name/args structure (wrong code fence label)
  if (/```(?:json|python|js|javascript)\s*\n?\s*\{[\s\S]*?"name"/.test(text)) return true;
  return false;
}

// ── Extract thinking text (before tool call) ──

function extractThinking(text: string): string {
  const toolIdx = text.indexOf('```tool');
  if (toolIdx > 0) return text.slice(0, toolIdx).trim();
  const jsonIdx = text.search(/\{[\s\S]*?"name"\s*:/);
  if (jsonIdx > 20) return text.slice(0, jsonIdx).trim();
  return '';
}

// ── Conversation history parser ──

function parseHistoryToMessages(history: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const parts = history.split(/\n\n(?=User:|Assistant:)/);
  for (const part of parts) {
    if (part.startsWith('User: ')) {
      messages.push({ role: 'user', content: part.slice(6).trim() });
    } else if (part.startsWith('Assistant: ')) {
      messages.push({ role: 'assistant', content: part.slice(11).trim() });
    }
  }
  return messages;
}

// ── Fast-path detection ──

function isSimpleQuestion(text: string): boolean {
  const simple = /^(hi|hey|hello|what'?s? up|thanks|thank you|ok|okay|sure|yes|no|cool|nice|got it)\s*[!?.]*$/i;
  if (simple.test(text.trim())) return true;
  if (text.length < 30 && !/\b(search|find|browse|open|go to|analyze|scrape|run|execute|write|create|make|build|fix|help me|can you)\b/i.test(text)) return true;
  return false;
}

// ── Complexity tier detection ──

function isComplexTask(text: string): boolean {
  const msg = text.toLowerCase();
  // Multi-step or compound asks
  if (/\band\s+(then|also|after)\b/.test(msg)) return true;
  // Research / creation / analysis with significant scope
  if (/\b(research|analyze|analyse|investigate|comprehensive|in-depth|deep dive|compare|build|create|write|generate|develop|plan|strategy|report|study)\b/.test(msg) && msg.length > 60) return true;
  // Multiple objects (comma-joined actions)
  if (msg.split(',').length >= 3 && msg.length > 80) return true;
  // Explicit multi-part ("first... then...", "step 1", etc.)
  if (/\b(first|step 1|step one|part 1|then|finally|lastly)\b/.test(msg) && msg.length > 50) return true;
  return false;
}

// ── Model Router (0.8b routes to best model for the task) ──

type ModelTier = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';

function routeToModel(userMessage: string): { model: string; tier: ModelTier } {
  const msg = userMessage.toLowerCase().trim();
  const len = msg.length;

  // NOTE: 0.8b is NEVER used for user-facing responses — only for compression/classification
  // Minimum for any user response is 2b

  // Small: greetings, one-word, yes/no, acknowledgments, simple questions
  if (len < 20 && /^(hi|hey|yo|sup|hello|thanks|ok|yes|no|sure|cool|nice|got it|what|why|how|when|where)\b/i.test(msg)) {
    return { model: 'qwen3.5:2b', tier: 'small' };
  }

  // Medium: most general questions and short tasks (DEFAULT)
  if (len < 80 && !/\b(research|analyze|deep|thorough|comprehensive|compare|build|create|develop|implement|write.*code|deploy)\b/i.test(msg)) {
    return { model: 'qwen3.5:4b', tier: 'medium' };
  }

  // XLarge: explicitly complex, multi-step, creative, long prompts
  if (len > 300 || /\b(comprehensive|thorough|in-depth|detailed analysis|multi.?step|build.*from scratch|full.*report|compare.*and.*contrast|write.*article|create.*strategy)\b/i.test(msg)) {
    return { model: 'qwen3.5:27b', tier: 'xlarge' };
  }

  // Large: research, analysis, code, creative tasks
  if (/\b(research|analyze|code|script|function|implement|strategy|campaign|write|create|design|plan|debug|fix.*bug|refactor)\b/i.test(msg)) {
    return { model: 'qwen3.5:9b', tier: 'large' };
  }

  // Medium: everything else
  return { model: 'qwen3.5:4b', tier: 'medium' };
}

// ── Campaign Context (wired in from the active campaign/cycle) ──

export interface CampaignContextData {
  brand: string;
  productDescription?: string;
  targetAudience?: string;
  marketingGoal?: string;
  productFeatures?: string[];
  productPrice?: string;
  brandDna?: string;       // from cycle brand-dna stage output
  personaDna?: string;     // from cycle persona-dna stage output
  researchSummary?: string; // top-level research findings summary
  angles?: string;          // approved angles
}

// ── Main Agent Engine ──

export interface AgentEngineOptions {
  model?: string;
  temperature?: number;
  maxSteps?: number;
  maxDurationMs?: number;  // Duration limit (e.g., 45 min = 2700000)
  signal?: AbortSignal;
  onEvent: AgentEngineCallback;
  /** Called when agent uses ask_user tool. Return the user's answer. */
  onAskUser?: (question: string, options: string[]) => Promise<string>;
  /** Inject additional messages mid-run (checked each step) */
  getInjectedMessages?: () => string[];
  /** Workspace ID for per-chat file storage */
  workspaceId?: string;
  /** Active campaign context — wired from CampaignContext */
  campaignContext?: CampaignContextData;
  /** Pre-loaded memories to seed the session (user profile + persisted memories) */
  initialMemories?: Array<{ key: string; content: string }>;
}

export async function runAgentLoop(
  userMessage: string,
  conversationHistory: string,
  options: AgentEngineOptions,
): Promise<{ steps: AgentStep[]; finalResponse: string }> {
  const {
    model: modelOverride,
    temperature: tempOverride,
    maxSteps = 200,
    maxDurationMs,
    signal,
    onEvent,
    onAskUser,
    getInjectedMessages,
    workspaceId,
    campaignContext,
    initialMemories,
  } = options;

  const tools = buildTools(workspaceId, onEvent);
  // Seed with pre-loaded memories (user profile + persisted store entries)
  const memories: Array<{ key: string; content: string }> = initialMemories ? [...initialMemories] : [];
  const steps: AgentStep[] = [];
  const startTime = Date.now();

  // Fast-path: simple greetings/acknowledgments skip the full loop — NO step cards
  if (isSimpleQuestion(userMessage)) {
    let response = '';
    // NOTE: Do NOT inject user profile here. Seeing the profile causes the model to recite it back
    // ("Got it. You're a hyperfocused solo dev..."). The profile is background context only -- use it
    // silently when it actually matters (task responses), never to introduce yourself or summarize the user.
    const NOMAD_FAST_SYSTEM = `You are Neuro. Casual, lowercase, direct.

GREETINGS: match the energy and stop. Nothing more.
- "yo" -> "yo"
- "hey" -> "hey, what's up"
- "hi" -> "hey"
- "what?" -> "lol what do you mean" or similar confused/casual reply
- "what's up" -> "not much, what do you need"

NEVER:
- Summarize the user's profile or background unprompted
- Say "Ready." or "Ready?" or "Let's work." or anything robotic like that
- Say "Got it. You're a [description]..." -- never recite who they are back to them
- Use em dashes
- Use emojis
- Start with "I"
- Perform enthusiasm ("hey!! what are we building today??")
- Use filler openers ("Sure!", "Of course!", "Certainly!", "Happy to help!")
- Try to sound cool or use slang for its own sake

Just match the energy. If they reference something from the conversation, answer from prior turns.`;

    // Build proper chat messages array for context-aware fast response
    const priorMessages = conversationHistory ? parseHistoryToMessages(conversationHistory) : [];
    const fastMessages = [
      { role: 'system' as const, content: NOMAD_FAST_SYSTEM },
      ...priorMessages,
      { role: 'user' as const, content: userMessage },
    ];

    await ollamaService.generateStream(
      userMessage,
      NOMAD_FAST_SYSTEM,
      {
        model: 'qwen3.5:2b', think: getThinkMode('fast'),
        temperature: 0.7,
        num_predict: 150,
        signal,
        messages: fastMessages,
        onChunk: (c: string) => {
          response += c;
          onEvent({ type: 'response_chunk', response, timestamp: Date.now() });
        },
      },
    );
    onEvent({ type: 'response_done', response, timestamp: Date.now() });
    onEvent({ type: 'done', response, timestamp: Date.now() });
    return { steps: [], finalResponse: response };
  }

  // ── Context management for long-running sessions ──
  // We maintain two things:
  //   1. `contextWindow` — the recent steps sent to the LLM (sliding window)
  //   2. `progressSummary` — compressed summary of everything before the window
  // This lets the agent run for hours without overflowing context.

  // ── Route: pick model for this request ──
  const routed = routeToModel(userMessage);
  const model = modelOverride || routed.model;
  const temperature = tempOverride ?? (routed.tier === 'tiny' ? 0.8 : routed.tier === 'small' ? 0.7 : 0.6);

  // For complex tasks, emit thinking_start now (before the main loop) so the UI
  // shows a planning step card during the routing/ack phase.
  // We track this so step 0 of the main loop skips its own thinking_start.
  const isComplex = isComplexTask(userMessage);
  let thinkingStartedBeforeLoop = false;
  if (isComplex) {
    onEvent({ type: 'thinking_start', step: 0, timestamp: Date.now() });
    thinkingStartedBeforeLoop = true;
  }

  const CONTEXT_WINDOW_SIZE = 12; // Keep last 12 exchanges in full detail
  const SUMMARIZE_EVERY = 10;     // Compress old context every 10 steps
  let progressSummary = '';        // Compressed summary of old work
  let contextEntries: string[] = []; // Individual context entries (append-only)
  let lastSummarizedIdx = 0;

  // Seed with conversation history + user message
  if (conversationHistory) {
    contextEntries.push(conversationHistory);
  }
  contextEntries.push(`User: ${userMessage}`);

  /** Build the context string from summary + recent window */
  function buildContext(step: number): string {
    const parts: string[] = [];

    // Status header — agent always knows where it is
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const elapsedStr = elapsed > 3600
      ? `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
      : elapsed > 60
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${elapsed}s`;
    parts.push(`[Step ${step + 1} | Elapsed: ${elapsedStr} | Memories: ${memories.length}]`);

    if (progressSummary) {
      parts.push(`PROGRESS SO FAR:\n${progressSummary}`);
    }

    // Keep only last CONTEXT_WINDOW_SIZE entries in full
    const recentWindow = contextEntries.slice(-CONTEXT_WINDOW_SIZE);
    parts.push(recentWindow.join('\n\n'));
    return parts.join('\n\n');
  }

  /** Compress old context entries into a structured summary */
  async function compressOldContext(step: number): Promise<void> {
    if (contextEntries.length <= CONTEXT_WINDOW_SIZE + 2) return;
    if (step - lastSummarizedIdx < SUMMARIZE_EVERY) return;

    const oldEntries = contextEntries.slice(0, -CONTEXT_WINDOW_SIZE);
    if (oldEntries.length === 0) return;

    const toCompress = oldEntries.join('\n').slice(0, 6000);
    let summary = '';
    try {
      await ollamaService.generateStream(
        `Compress this work log. Preserve ALL facts, numbers, URLs, file paths.

Format:
COMPLETED: [step] → [result]
KEY FACTS: [fact + source]
FILES: [path] — [action]
STATE: [current position]
REMAINING: [next steps]

Log:
${toCompress}`,
        'Compress work logs. Keep all facts, numbers, URLs, paths. Never add info not in original.',
        {
          model,
          temperature: 0.1,
          num_predict: 600,
          signal,
          onChunk: (c: string) => { summary += c; },
        },
      );

      // Merge with existing summary if there is one
      if (progressSummary) {
        progressSummary = `${progressSummary}\n\n--- Updated at step ${step} ---\n${summary}`;
        // If merged summary is too long, compress it further
        if (progressSummary.length > 3000) {
          progressSummary = progressSummary.slice(-3000);
        }
      } else {
        progressSummary = summary;
      }

      contextEntries = contextEntries.slice(-CONTEXT_WINDOW_SIZE);
      lastSummarizedIdx = step;
      onEvent({ type: 'context_compressed', step, thinking: `Context compressed at step ${step}. Summary: ${summary.slice(0, 100)}...`, timestamp: Date.now() });
    } catch {
      contextEntries = contextEntries.slice(-CONTEXT_WINDOW_SIZE);
    }
  }

  let systemPrompt = buildSystemPrompt(tools, memories, workspaceId, campaignContext);
  let finalResponse = '';
  let lastResponse = ''; // For stuck detection
  let consecutiveStuckCount = 0; // How many times in a row we've seen the same response
  const MAX_STUCK_BEFORE_ABORT = 3; // Abort loop after this many consecutive identical responses

  /** Wrap a promise with a per-step timeout (ms). Rejects with a timeout error. */
  function withStepTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timerId: ReturnType<typeof setTimeout>;
    return Promise.race([
      promise.then(
        (v) => { clearTimeout(timerId); return v; },
        (e) => { clearTimeout(timerId); throw e; },
      ),
      new Promise<never>((_, reject) => {
        timerId = setTimeout(
          () => reject(new Error(`LLM step timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  }

  // ── Task progress tracking (Manus-style) ──
  const taskPlan: TaskProgress = {
    currentStep: 0,
    totalSteps: 0,
    steps: [],
    elapsed: 0,
  };

  /** Parse plan from LLM response. Looks for "Step N/M:" or numbered lists at start. */
  function parsePlanFromResponse(text: string): void {
    // Pattern: "Step 1/4: Do something — DONE"
    const stepPattern = /Step\s+(\d+)\/(\d+):\s*([^—\n]+)(?:\s*—\s*(DONE|starting|in progress|next))?/gi;
    let match: RegExpExecArray | null;
    const foundSteps: Array<{ idx: number; total: number; desc: string; status: string }> = [];

    while ((match = stepPattern.exec(text)) !== null) {
      foundSteps.push({
        idx: parseInt(match[1]),
        total: parseInt(match[2]),
        desc: match[3].trim(),
        status: (match[4] || '').toLowerCase(),
      });
    }

    if (foundSteps.length > 0) {
      const total = foundSteps[0].total;
      // Only update if this is a new/different plan
      if (total !== taskPlan.totalSteps || taskPlan.steps.length === 0) {
        taskPlan.totalSteps = total;
        taskPlan.steps = [];
        for (let i = 0; i < total; i++) {
          const found = foundSteps.find(s => s.idx === i + 1);
          taskPlan.steps.push({
            description: found?.desc || `Step ${i + 1}`,
            status: 'pending',
          });
        }
      }

      // Update statuses
      for (const s of foundSteps) {
        const stepObj = taskPlan.steps[s.idx - 1];
        if (stepObj) {
          if (s.status === 'done') stepObj.status = 'done';
          else if (s.status === 'starting' || s.status === 'in progress' || s.status === 'next') stepObj.status = 'active';
          taskPlan.currentStep = s.idx;
        }
      }
    }
  }

  function emitProgress(step: number): void {
    if (taskPlan.totalSteps === 0) return;
    taskPlan.elapsed = Math.round((Date.now() - startTime) / 1000);
    onEvent({
      type: 'task_progress',
      step,
      taskProgress: { ...taskPlan, steps: taskPlan.steps.map(s => ({ ...s })) },
      timestamp: Date.now(),
    });
  }

  let formatRetryCount = 0;
  const MAX_FORMAT_RETRIES = 3;

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) break;

    // Duration check
    if (maxDurationMs && (Date.now() - startTime) > maxDurationMs) {
      const elapsed = Math.round((Date.now() - startTime) / 60000);
      finalResponse = `Time limit reached (${elapsed} min). Completed ${steps.length} steps.`;
      onEvent({ type: 'done', response: finalResponse, step, timestamp: Date.now() });
      break;
    }

    // Periodic context compression for long sessions
    await compressOldContext(step);

    // Rebuild system prompt if memories changed
    if (memories.length > 0) {
      systemPrompt = buildSystemPrompt(tools, memories, workspaceId, campaignContext);
    }

    // Check for injected messages (user added "also do W" mid-run)
    if (getInjectedMessages) {
      const injected = getInjectedMessages();
      for (const msg of injected) {
        contextEntries.push(`User: ${msg}`);
      }
    }

    // ── Think: Ask LLM what to do ──
    // Skip thinking_start on step 0 if we pre-emitted one above (complex tasks)
    if (!(step === 0 && thinkingStartedBeforeLoop)) {
      onEvent({ type: 'thinking_start', step, timestamp: Date.now() });
    }

    let llmResponse = '';
    let thinkingAccum = '';
    const currentContext = buildContext(step);

    // Build proper chat messages for this step — system + current context as user turn
    const stepMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: currentContext },
    ];

    // Per-step LLM timeout: 90 s. If the model hangs, we record the error and
    // continue to the next iteration rather than hanging the whole loop forever.
    const LLM_STEP_TIMEOUT_MS = 90_000;
    try {
      await withStepTimeout(
        ollamaService.generateStream(
          currentContext,
          systemPrompt,
          {
            model,
            temperature,
            think: getThinkMode('strategy'),
            num_predict: 600,
            signal,
            messages: stepMessages,
            onThink: (chunk: string) => {
              thinkingAccum += chunk;
              onEvent({ type: 'thinking_chunk', thinking: thinkingAccum, isThinkingToken: true, step, timestamp: Date.now() });
            },
            onChunk: (chunk: string) => {
              llmResponse += chunk;
              // Only emit thinking_chunk from onChunk when no dedicated thinking token stream is active
              if (!thinkingAccum) {
                onEvent({ type: 'thinking_chunk', thinking: llmResponse, isThinkingToken: false, step, timestamp: Date.now() });
              }
            },
          },
        ),
        LLM_STEP_TIMEOUT_MS,
      );
    } catch (llmErr) {
      if (signal?.aborted) break;
      // Non-abort error (network, model crash, timeout) — record and continue
      const errMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
      contextEntries.push(`System: LLM error at step ${step}: ${errMsg}. Retrying.`);
      onEvent({ type: 'error', error: errMsg, step, timestamp: Date.now() });
      continue;
    }

    onEvent({ type: 'thinking_done', thinking: thinkingAccum || llmResponse, step, timestamp: Date.now() });

    // ── Parse plan from response for progress tracking ──
    parsePlanFromResponse(llmResponse);
    emitProgress(step);

    // ── Stuck detection (OpenManus pattern) ──
    if (llmResponse === lastResponse && lastResponse.length > 20) {
      consecutiveStuckCount++;
      if (consecutiveStuckCount >= MAX_STUCK_BEFORE_ABORT) {
        finalResponse = `Agent stuck: same response repeated ${consecutiveStuckCount} times in a row. Stopping.`;
        onEvent({ type: 'error', error: finalResponse, step, timestamp: Date.now() });
        onEvent({ type: 'done', response: finalResponse, step, timestamp: Date.now() });
        break;
      }
      contextEntries.push(`System: You repeated your last response (${consecutiveStuckCount}/${MAX_STUCK_BEFORE_ABORT}). Try a DIFFERENT approach or tool. Do NOT repeat the same action.`);
      continue;
    }
    consecutiveStuckCount = 0;
    lastResponse = llmResponse;

    // ── Parse: Is there a tool call? ──
    const toolCallParsed = parseToolCall(llmResponse);
    const thinking = extractThinking(llmResponse);

    if (!toolCallParsed) {
      // If it looks like the LLM tried to call a tool but malformed it, retry with correction
      if (looksLikeMalformedToolCall(llmResponse) && formatRetryCount < MAX_FORMAT_RETRIES) {
        formatRetryCount++;
        contextEntries.push(
          `Assistant: ${llmResponse}\n\nSystem: Your response contained a tool call in an unrecognized format. ` +
          `You MUST use this exact format:\n\`\`\`tool\n{"name": "tool_name", "args": {"param": "value"}}\n\`\`\`\n` +
          `Available tools: ${tools.map(t => t.name).join(', ')}. Retry now with the correct format.`
        );
        step = Math.max(0, step - 1); // don't consume a step for format errors; clamp at 0 so for-increment brings us back to current step
        continue;
      }
      formatRetryCount = 0; // reset on clean response
      if (signal?.aborted) break;
      finalResponse = llmResponse;
      const agentStep: AgentStep = { thinking: '', response: llmResponse, timestamp: Date.now() };
      steps.push(agentStep);
      onEvent({ type: 'response_done', response: llmResponse, step, timestamp: Date.now() });
      onEvent({ type: 'done', response: llmResponse, step, timestamp: Date.now() });
      break;
    }

    // Tool call parsed successfully — reset format retry counter
    formatRetryCount = 0;

    // ── Handle "done" ──
    if (toolCallParsed.name === 'done') {
      finalResponse = String(toolCallParsed.args.summary || llmResponse);
      const agentStep: AgentStep = { thinking, response: finalResponse, timestamp: Date.now() };
      steps.push(agentStep);
      onEvent({ type: 'done', response: finalResponse, step, timestamp: Date.now() });
      break;
    }

    // ── Handle "ask_user" — pause and wait for input ──
    if (toolCallParsed.name === 'ask_user' && onAskUser) {
      const question = String(toolCallParsed.args.question || 'What would you like to do?');
      const opts = String(toolCallParsed.args.options || '').split(',').map(s => s.trim()).filter(Boolean);

      const toolCall: ToolCall = {
        id: `tc-${Date.now()}-${step}`,
        name: 'ask_user',
        args: toolCallParsed.args,
        status: 'running',
        startedAt: Date.now(),
      };
      onEvent({ type: 'tool_start', toolCall, thinking, step, timestamp: Date.now() });

      const answer = await onAskUser(question, opts);

      toolCall.status = 'done';
      toolCall.result = { success: true, output: `User answered: ${answer}` };
      toolCall.completedAt = Date.now();
      steps.push({ thinking, toolCall, timestamp: Date.now() });
      onEvent({ type: 'tool_done', toolCall, step, timestamp: Date.now() });

      contextEntries.push(`Assistant: ${thinking}\n\n\`\`\`tool\n${JSON.stringify({ name: 'ask_user', args: toolCallParsed.args })}\n\`\`\`\n\nUser Response: ${answer}`);
      continue;
    }

    // ── Act: Execute the tool ──
    const tool = tools.find(t => t.name === toolCallParsed.name);

    const toolCall: ToolCall = {
      id: `tc-${Date.now()}-${step}`,
      name: toolCallParsed.name,
      args: toolCallParsed.args,
      status: 'running',
      startedAt: Date.now(),
    };

    onEvent({ type: 'tool_start', toolCall, thinking, step, timestamp: Date.now() });

    // Track tool usage in plan
    if (taskPlan.currentStep > 0 && taskPlan.steps[taskPlan.currentStep - 1]) {
      taskPlan.steps[taskPlan.currentStep - 1].toolUsed = toolCallParsed.name;
      taskPlan.steps[taskPlan.currentStep - 1].status = 'active';
    }

    let result: ToolResult;
    if (!tool) {
      result = { success: false, output: `Unknown tool: ${toolCallParsed.name}. Available: ${tools.map(t => t.name).join(', ')}` };
      toolCall.status = 'error';
    } else {
      try {
        result = await tool.execute(toolCallParsed.args, signal);
        // Check abort after tool completes (tool might not throw on abort)
        if (signal?.aborted) {
          result = { success: false, output: 'Aborted by user' };
          toolCall.status = 'error';
        } else {
          toolCall.status = result.success ? 'done' : 'error';
        }
      } catch (err) {
        if (signal?.aborted) {
          result = { success: false, output: 'Aborted by user' };
        } else {
          result = { success: false, output: `Tool error: ${err instanceof Error ? err.message : err}` };
        }
        toolCall.status = 'error';
      }
    }

    toolCall.result = result;
    toolCall.completedAt = Date.now();

    // Handle "remember" tool specially — persist memory
    if (toolCallParsed.name === 'remember' && result.success && result.data) {
      const { key, content } = result.data as { key: string; content: string };
      memories.push({ key, content });
    }

    const agentStep: AgentStep = { thinking, toolCall, timestamp: Date.now() };
    steps.push(agentStep);

    onEvent({
      type: result.success ? 'tool_done' : 'tool_error',
      toolCall,
      step,
      timestamp: Date.now(),
    });

    onEvent({ type: 'step_complete', step, timestamp: Date.now() });

    // ── Observe: Feed result back to LLM ──
    // Context window management: large results are saved to workspace and summarized
    let resultOutput: string;
    const CONTEXT_RESULT_LIMIT = 1500;

    if (result.output.length > CONTEXT_RESULT_LIMIT && workspaceId) {
      // Save full output to workspace for later retrieval via file_read/workspace_read
      const ts = Date.now();
      const safeToolName = toolCallParsed.name.replace(/[^a-z0-9_]/gi, '_');
      const refFilename = `_tool_results/${safeToolName}_${ts}.txt`;
      try {
        await ensureWorkspace(workspaceId);
        await workspaceSave(workspaceId, refFilename, result.output);
      } catch { /* best effort — don't block the loop */ }

      // Truncate for context and add reference
      const truncated = result.output.slice(0, CONTEXT_RESULT_LIMIT);
      const refPath = `${getWorkspacePath(workspaceId)}/${refFilename}`;
      resultOutput = `${truncated}\n[...truncated ${result.output.length - CONTEXT_RESULT_LIMIT} chars. Full output saved to workspace: ${refPath} — use file_read or workspace_read to access]`;
    } else if (result.output.length > CONTEXT_RESULT_LIMIT) {
      // No workspace — just truncate
      resultOutput = result.output.slice(0, CONTEXT_RESULT_LIMIT) + `\n[...truncated ${result.output.length - CONTEXT_RESULT_LIMIT} chars]`;
    } else {
      resultOutput = result.output;
    }

    contextEntries.push(`Assistant: ${thinking}\n\n\`\`\`tool\n${JSON.stringify({ name: toolCallParsed.name, args: toolCallParsed.args })}\n\`\`\`\n\nTool Result (${toolCallParsed.name}): ${resultOutput}`);
  }

  return { steps, finalResponse };
}
