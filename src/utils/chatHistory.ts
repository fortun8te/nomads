/**
 * Chat History — IndexedDB persistence for agent conversations.
 *
 * Uses idb-keyval to store conversations, each with messages, workspace,
 * and metadata. Supports CRUD + listing grouped by date.
 */

import { get, set } from 'idb-keyval';
import { ollamaService } from './ollama';
import { getThinkMode } from './modelConfig';

// ── Types ──────────────────────────────────────────────────────────────────

/** A single action pill inside a step card (serializable) */
export interface StoredActionPill {
  id: string;
  toolName: string;
  argsPreview: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

/** A step card (serializable) */
export interface StoredStepCard {
  id: string;
  title: string;
  thinkingText: string;
  isThinking: boolean;
  actions: StoredActionPill[];
  status: 'active' | 'done' | 'pending';
  browserUrl?: string;
  browserScreenshot?: string;
}

/** A message block (serializable) */
export interface StoredMessageBlock {
  id: string;
  timestamp: number;
  type: 'user' | 'agent' | 'upload';
  content: string;
  steps?: StoredStepCard[];
  uploadFilename?: string;
  uploadSize?: string;
  /** Attached images/files sent with the user message */
  attachments?: Array<{ id: string; dataUrl: string; name: string; type: 'image' | 'text'; textContent?: string }>;
}

/** A full conversation record */
export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessageBlock[];
  createdAt: number;
  updatedAt: number;
  workspaceId: string;
  messageCount: number;
}

/** Minimal metadata for sidebar listing (no full messages) */
export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  workspaceId: string;
}

/** Group label for sidebar display */
export type DateGroup = 'Today' | 'Yesterday' | 'This Week' | 'Older';

export interface GroupedConversations {
  group: DateGroup;
  items: ConversationSummary[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const CONVERSATIONS_KEY = 'nomad-agent-conversations';
const CONVERSATION_PREFIX = 'nomad-conv-';

// ── Helpers ────────────────────────────────────────────────────────────────


function getDateGroup(ts: number): DateGroup {
  const now = new Date();
  const date = new Date(ts);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 6 * 86400000);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  if (date >= weekAgo) return 'This Week';
  return 'Older';
}

// ── Storage API ────────────────────────────────────────────────────────────

/** Get the list of all conversation IDs (ordered by most recent) */
async function getConversationIds(): Promise<string[]> {
  return (await get<string[]>(CONVERSATIONS_KEY)) || [];
}

async function setConversationIds(ids: string[]): Promise<void> {
  await set(CONVERSATIONS_KEY, ids);
}

/** Save a conversation (creates or updates) */
export async function saveConversation(conv: Conversation): Promise<void> {
  // Update the conversation record
  await set(CONVERSATION_PREFIX + conv.id, conv);

  // Update the ID index (move to front if exists, add if new)
  const ids = await getConversationIds();
  const filtered = ids.filter(id => id !== conv.id);
  filtered.unshift(conv.id);
  await setConversationIds(filtered);
}

/** Load a full conversation by ID */
export async function loadConversation(id: string): Promise<Conversation | null> {
  return (await get<Conversation>(CONVERSATION_PREFIX + id)) || null;
}

/** Delete a conversation */
export async function deleteConversation(id: string): Promise<void> {
  const ids = await getConversationIds();
  await setConversationIds(ids.filter(i => i !== id));
  // idb-keyval doesn't have a "del" that we import here, so overwrite with undefined
  // Actually we do have del — let's use set with undefined as a workaround
  // The key will remain but be undefined, which is fine for our purposes
  await set(CONVERSATION_PREFIX + id, undefined);
}

/** List all conversations as summaries, grouped by date */
export async function listConversations(): Promise<GroupedConversations[]> {
  const ids = await getConversationIds();
  const summaries: ConversationSummary[] = [];

  for (const id of ids) {
    const conv = await get<Conversation>(CONVERSATION_PREFIX + id);
    if (!conv) continue;
    summaries.push({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messageCount,
      workspaceId: conv.workspaceId,
    });
  }

  // Group by date
  const groups: Record<DateGroup, ConversationSummary[]> = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'Older': [],
  };

  for (const s of summaries) {
    const group = getDateGroup(s.updatedAt);
    groups[group].push(s);
  }

  // Return only non-empty groups, in order
  const order: DateGroup[] = ['Today', 'Yesterday', 'This Week', 'Older'];
  return order
    .filter(g => groups[g].length > 0)
    .map(g => ({ group: g, items: groups[g] }));
}

/** List all conversation summaries (flat, most recent first) */
export async function listConversationSummaries(): Promise<ConversationSummary[]> {
  const ids = await getConversationIds();
  const summaries: ConversationSummary[] = [];

  for (const id of ids) {
    const conv = await get<Conversation>(CONVERSATION_PREFIX + id);
    if (!conv) continue;
    summaries.push({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messageCount,
      workspaceId: conv.workspaceId,
    });
  }

  return summaries;
}

// ── Auto-title generation ─────────────────────────────────────────────────

/** Message counts at which we (re)generate the title */
const RETITLE_SCHEDULE = [1, 2, 5, 15, 30];

/** Check if a retitle is due for this message count */
export function shouldRetitle(messageCount: number): boolean {
  return RETITLE_SCHEDULE.includes(messageCount);
}

/**
 * Generate a short 2-5 word title for a conversation using qwen3.5:0.8b.
 * Returns null if the LLM call fails or produces garbage.
 */
export async function generateConversationTitle(
  messages: StoredMessageBlock[]
): Promise<string | null> {
  // Grab user + agent messages for context (last few)
  const relevant = messages
    .filter(m => m.type === 'user' || m.type === 'agent')
    .slice(-4)
    .map(m => `${m.type === 'user' ? 'User' : 'Agent'}: ${m.content.slice(0, 100)}`);

  if (relevant.length === 0) return null;

  const prompt = `Title this conversation in 2-5 words. Output ONLY the title, nothing else.\n\n${relevant.join('\n')}\n\nTitle:`;

  try {
    const raw = await ollamaService.generateStream(prompt, '', {
      model: 'local:qwen3.5:0.8b',
      temperature: 0.1,
      num_predict: 15,
      think: getThinkMode('title'),
    });

    // Clean up: strip quotes, trim, take first line only
    const cleaned = raw
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .split('\n')[0]
      .trim();

    // Validate: 1-8 words, not empty, not too long
    const wordCount = cleaned.split(/\s+/).length;
    if (!cleaned || wordCount > 8 || cleaned.length > 60) return null;

    return cleaned;
  } catch {
    return null;
  }
}
