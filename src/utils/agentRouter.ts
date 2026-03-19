/**
 * agentRouter — Smart instruction router for the ActionSidebar agent
 *
 * Classifies incoming instructions and routes to the correct handler.
 * Uses keyword matching first; falls back to a fast LFM-2.5 classification call
 * for ambiguous inputs.
 *
 * NOTE: lfm-2.5 is NOT for conversation — classification and compression only.
 */

import { ollamaService } from './ollama';
import { getOllamaEndpoint } from './modelConfig';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AgentRouteType = 'search' | 'write' | 'browse' | 'memory' | 'plan' | 'chat';

export interface AgentRoute {
  type: AgentRouteType;
  payload: string;
}

// ─────────────────────────────────────────────────────────────
// Keyword patterns — checked before LLM classification
// ─────────────────────────────────────────────────────────────

const KEYWORD_RULES: Array<{ pattern: RegExp; type: AgentRouteType }> = [
  // Search
  { pattern: /^search[:\s]/i,                                     type: 'search' },
  { pattern: /^find[:\s].*(reviews?|sites?|articles?|data)/i,     type: 'search' },
  { pattern: /^look\s+up[:\s]/i,                                  type: 'search' },
  { pattern: /^research[:\s]/i,                                   type: 'search' },
  // Write / draft
  { pattern: /^(write|draft|create\s+doc|compose)[:\s]/i,         type: 'write' },
  { pattern: /^(write|draft)\s/i,                                 type: 'write' },
  // Browse / navigate
  { pattern: /^(browse|open|navigate|go\s+to)[:\s]/i,             type: 'browse' },
  { pattern: /^(open|visit)\s+https?:\/\//i,                      type: 'browse' },
  { pattern: /https?:\/\/\S+/,                                    type: 'browse' },
  // Memory
  { pattern: /^remember[:\s]/i,                                   type: 'memory' },
  { pattern: /^save\s+(this|to\s+memory)[:\s]?/i,                 type: 'memory' },
  { pattern: /^note[:\s]/i,                                       type: 'memory' },
  // Plan
  { pattern: /^plan[:\s]/i,                                       type: 'plan' },
  { pattern: /^(make|create|build)\s+a\s+plan/i,                  type: 'plan' },
  { pattern: /^outline[:\s]/i,                                    type: 'plan' },
];

// ─────────────────────────────────────────────────────────────
// Keyword classifier
// ─────────────────────────────────────────────────────────────

function classifyByKeyword(instruction: string): AgentRouteType | null {
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(instruction.trim())) return rule.type;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// LLM classifier (lfm-2.5 — fast, classification only)
// ─────────────────────────────────────────────────────────────

/**
 * Fast LFM-2.5 call to classify ambiguous instructions.
 * Returns one of the 6 route types. Falls back to 'chat' on any error.
 *
 * lfm-2.5 is NOT for conversation — classification and compression only.
 */
async function classifyByLLM(instruction: string): Promise<AgentRouteType> {
  const CLASSIFICATION_MODEL = 'lfm-2.5:q4_K_M';
  const endpoint = getOllamaEndpoint();

  const systemPrompt = `You are a router. Classify the user's instruction into EXACTLY one of these categories:
- search: web search or research queries
- write: drafting text, documents, emails, or copy
- browse: navigating a URL or opening a website
- memory: saving information for later recall
- plan: creating structured plans, outlines, or step lists
- chat: general conversation, questions, or anything else

Respond with only the category name, nothing else.`;

  try {
    const result = await ollamaService.generateStream(instruction, systemPrompt, {
      model: CLASSIFICATION_MODEL,
      temperature: 0.0,
      num_predict: 8,
      signal: AbortSignal.timeout(10000),
    });

    const cleaned = result.trim().toLowerCase();
    const valid: AgentRouteType[] = ['search', 'write', 'browse', 'memory', 'plan', 'chat'];
    if (valid.includes(cleaned as AgentRouteType)) {
      return cleaned as AgentRouteType;
    }
    return 'chat';
  } catch (err) {
    console.warn('[agentRouter] LLM classification failed, defaulting to chat:', err);
    return 'chat';
  }

  // Suppress unused import warning — endpoint used for reference
  void endpoint;
}

// ─────────────────────────────────────────────────────────────
// Main router
// ─────────────────────────────────────────────────────────────

/**
 * Route an instruction to the appropriate handler type.
 *
 * 1. Try keyword matching (instant, no LLM call)
 * 2. If ambiguous, fall back to fast LFM-2.5 classification
 *
 * @param instruction - Raw text from the user
 * @param conversationHistory - Recent messages for context (improves routing accuracy)
 * @returns AgentRoute with type and cleaned payload
 */
export async function routeInstruction(
  instruction: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<AgentRoute> {
  const text = instruction.trim();
  if (!text) return { type: 'chat', payload: '' };

  // Step 1: keyword match
  const keywordType = classifyByKeyword(text);
  if (keywordType !== null) {
    return { type: keywordType, payload: text };
  }

  // Step 2: LLM classification for ambiguous inputs (with conversation context if available)
  const contextText = conversationHistory && conversationHistory.length > 0
    ? `\nRecent context:\n${conversationHistory.slice(-3).map(m => `${m.role}: ${m.content.slice(0, 100)}`).join('\n')}`
    : '';

  const instructionWithContext = contextText ? `${instruction}${contextText}` : instruction;
  const llmType = await classifyByLLM(instructionWithContext);
  return { type: llmType, payload: text };
}
