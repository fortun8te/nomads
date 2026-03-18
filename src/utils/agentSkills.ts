/**
 * Agent Skill System — Manus-style capability routing + model profiles.
 *
 * Each skill wraps an existing NOMAD capability (research, browser, vision, etc.)
 * The router uses the LLM to pick the right skill for a given user message,
 * then executes it with the appropriate service.
 *
 * Model Profiles: Each skill (and each call within a skill) has tuned settings —
 * model, temperature, num_predict, resolution, prompt strategy — so every LLM
 * call is optimized for its specific job instead of using generic defaults.
 */

import { ollamaService } from './ollama';
import { getThinkingModel, getVisionModel, getModelForStage, getPlannerModel, getExecutorModel } from './modelConfig';

// ── Model Profile — per-call tuned settings ──

export interface ModelProfile {
  model: string;                  // ollama model name
  temperature: number;            // 0-2
  top_p: number;                  // nucleus sampling
  num_predict: number;            // max output tokens
  keep_alive?: string;            // e.g. "30m" — VRAM retention
}

/** Per-skill image/vision settings */
export interface VisionProfile {
  maxWidth: number;               // downscale screenshot to this width
  maxHeight: number;              // downscale screenshot to this height
  quality: number;                // JPEG quality 1-100
  separateTextGrab: boolean;      // also do a text extraction pass (more accurate)
}

/** Complete profile for a skill — all call types tuned */
export interface SkillProfile {
  /** Primary reasoning/generation call */
  primary: ModelProfile;
  /** Vision call (screenshot analysis) — only for skills that use vision */
  vision?: ModelProfile & { imageSettings: VisionProfile };
  /** Synthesis/summary call — when compressing results */
  synthesis?: ModelProfile;
  /** Fast action call — for executor-style single actions */
  action?: ModelProfile;
}

// ── Skill Definition ──

export interface SkillDef {
  id: string;
  name: string;
  description: string;            // shown to routing LLM
  when: string;                   // when to use (for LLM context)
  requiredServices: string[];     // 'sandbox' | 'wayfayer' | 'ollama'
  inputSchema: 'goal' | 'url' | 'url+goal' | 'query' | 'brand';
  profile: SkillProfile;          // tuned model settings for this skill
}

export interface SkillRouteResult {
  skillId: string;
  confidence: number;             // 0-1
  params: Record<string, string>; // extracted params (url, query, brand, etc.)
  reasoning: string;
}

// ── Default Profiles (resolved at runtime so localStorage overrides work) ──

function defaultProfiles(): Record<string, SkillProfile> {
  return {
    browse: {
      primary: { model: getPlannerModel(), temperature: 0.3, top_p: 0.9, num_predict: 300, keep_alive: '30m' },
      action:  { model: getExecutorModel(), temperature: 0.1, top_p: 0.8, num_predict: 100, keep_alive: '30m' },
      vision: {
        model: getVisionModel(), temperature: 0.15, top_p: 0.8, num_predict: 120, keep_alive: '30m',
        imageSettings: { maxWidth: 640, maxHeight: 450, quality: 50, separateTextGrab: false },
      },
    },
    web_research: {
      primary:   { model: getModelForStage('research'), temperature: 0.7, top_p: 0.9, num_predict: 500 },
      synthesis: { model: getThinkingModel(), temperature: 0.3, top_p: 0.9, num_predict: 300 },
    },
    visual_scout: {
      primary: { model: getThinkingModel(), temperature: 0.4, top_p: 0.9, num_predict: 400 },
      vision: {
        model: getVisionModel(), temperature: 0.3, top_p: 0.85, num_predict: 300,
        imageSettings: { maxWidth: 1280, maxHeight: 900, quality: 60, separateTextGrab: true },
      },
      synthesis: { model: getModelForStage('research'), temperature: 0.5, top_p: 0.9, num_predict: 400 },
    },
    analyze_product: {
      primary: { model: getModelForStage('research'), temperature: 0.3, top_p: 0.9, num_predict: 500 },
      vision: {
        model: getVisionModel(), temperature: 0.2, top_p: 0.85, num_predict: 400,
        // Lower res for speed — text grab compensates for lost detail
        imageSettings: { maxWidth: 800, maxHeight: 600, quality: 55, separateTextGrab: true },
      },
      synthesis: { model: getModelForStage('research'), temperature: 0.2, top_p: 0.9, num_predict: 400 },
    },
    analyze_competitor: {
      primary:   { model: getModelForStage('research'), temperature: 0.4, top_p: 0.9, num_predict: 600 },
      vision: {
        model: getVisionModel(), temperature: 0.2, top_p: 0.85, num_predict: 300,
        imageSettings: { maxWidth: 800, maxHeight: 600, quality: 50, separateTextGrab: true },
      },
      synthesis: { model: getModelForStage('research'), temperature: 0.3, top_p: 0.9, num_predict: 500 },
    },
    crawl_site: {
      primary: { model: getThinkingModel(), temperature: 0.2, top_p: 0.9, num_predict: 200 },
    },
    extract_data: {
      primary:   { model: getThinkingModel(), temperature: 0.2, top_p: 0.85, num_predict: 500 },
      synthesis: { model: getThinkingModel(), temperature: 0.1, top_p: 0.9, num_predict: 600 },
    },
    answer_page: {
      primary: { model: getThinkingModel(), temperature: 0.3, top_p: 0.9, num_predict: 200 },
      vision: {
        model: getVisionModel(), temperature: 0.3, top_p: 0.85, num_predict: 200,
        imageSettings: { maxWidth: 640, maxHeight: 450, quality: 50, separateTextGrab: true },
      },
    },
  };
}

/** Get the resolved profile for a skill (checks localStorage overrides) */
export function getSkillProfile(skillId: string): SkillProfile {
  const profiles = defaultProfiles();
  const base = profiles[skillId] || profiles.browse;

  // Allow per-skill localStorage overrides: skill_browse_primary_temperature, etc.
  if (typeof window !== 'undefined') {
    const override = (callType: keyof SkillProfile, field: keyof ModelProfile) => {
      const key = `skill_${skillId}_${callType}_${field}`;
      const val = localStorage.getItem(key);
      if (val === null) return undefined;
      if (field === 'model' || field === 'keep_alive') return val;
      const num = parseFloat(val);
      return isNaN(num) ? undefined : num;
    };

    // Apply overrides to each call type
    for (const callType of ['primary', 'vision', 'synthesis', 'action'] as const) {
      const prof = base[callType];
      if (!prof) continue;
      for (const field of ['model', 'temperature', 'top_p', 'num_predict'] as const) {
        const val = override(callType, field);
        if (val !== undefined) (prof as any)[field] = val;
      }
    }
  }

  return base;
}

// ── Skill Registry ──

export const SKILLS: SkillDef[] = [
  {
    id: 'browse',
    name: 'Browse & Interact',
    description: 'Navigate to a URL and interact with the page (click, scroll, type, fill forms). General-purpose browser automation.',
    when: 'User wants to go to a website, interact with a page, fill out a form, click buttons, sign up for something, or perform multi-step browser tasks.',
    requiredServices: ['sandbox'],
    inputSchema: 'goal',
    get profile() { return getSkillProfile('browse'); },
  },
  {
    id: 'web_research',
    name: 'Web Research',
    description: 'Search the web for information on a topic. Uses SearXNG search + page scraping to gather comprehensive data from multiple sources.',
    when: 'User asks to research a topic, find information, look up market data, trends, reviews, or any knowledge-gathering task that needs web search.',
    requiredServices: ['wayfayer'],
    inputSchema: 'query',
    get profile() { return getSkillProfile('web_research'); },
  },
  {
    id: 'visual_scout',
    name: 'Visual Competitor Scout',
    description: 'Screenshot competitor websites and analyze their visual design — colors, layout, typography, CTAs, brand positioning.',
    when: 'User wants to analyze how competitor websites look, compare visual designs, understand competitor branding/UX, or gather visual intelligence.',
    requiredServices: ['wayfayer', 'ollama'],
    inputSchema: 'url+goal',
    get profile() { return getSkillProfile('visual_scout'); },
  },
  {
    id: 'analyze_product',
    name: 'Product Page Analysis',
    description: 'Deep analysis of a single product page — extracts pricing, ingredients, features, testimonials, guarantees, social proof via screenshot + vision + text scraping.',
    when: 'User wants to analyze a specific product page, extract product details, understand pricing/features, or get structured data from a product URL.',
    requiredServices: ['wayfayer', 'ollama'],
    inputSchema: 'url',
    get profile() { return getSkillProfile('analyze_product'); },
  },
  {
    id: 'analyze_competitor',
    name: 'Full Competitor Intelligence',
    description: 'Autonomous competitor analysis — finds brand website, crawls all product pages, batch-analyzes with vision, synthesizes competitive intelligence.',
    when: 'User wants a complete analysis of a competitor brand — their products, pricing strategy, ingredient patterns, market positioning. Takes a brand name, not a URL.',
    requiredServices: ['wayfayer', 'ollama'],
    inputSchema: 'brand',
    get profile() { return getSkillProfile('analyze_competitor'); },
  },
  {
    id: 'crawl_site',
    name: 'Site Crawler',
    description: 'Discover all product pages on an e-commerce site. Crawls collections, homepages, and search results to find product URLs.',
    when: 'User wants to discover what products a website sells, map out a site\'s product catalog, or get a list of all product URLs on a domain.',
    requiredServices: ['wayfayer'],
    inputSchema: 'url',
    get profile() { return getSkillProfile('crawl_site'); },
  },
  {
    id: 'extract_data',
    name: 'Data Extraction',
    description: 'Extract specific structured data from a web page — tables, lists, prices, contacts, or any targeted information.',
    when: 'User wants to pull specific data from a page: a price list, a table of specs, contact info, ingredient lists, or any structured content.',
    requiredServices: ['sandbox'],
    inputSchema: 'url+goal',
    get profile() { return getSkillProfile('extract_data'); },
  },
  {
    id: 'answer_page',
    name: 'Answer from Page',
    description: 'Answer a question about the currently loaded page using its visible content and elements. No navigation needed.',
    when: 'User asks a question about what\'s on the current page — what they see, what a button does, what text says, etc. Page is already loaded.',
    requiredServices: ['sandbox'],
    inputSchema: 'goal',
    get profile() { return getSkillProfile('answer_page'); },
  },
];

// ── Skill Router ──

const ROUTER_SYSTEM = `You are a skill router for a browser automation agent. Given a user message and available skills, pick the BEST skill to handle the request.

Available skills:
${SKILLS.map(s => `- ${s.id}: ${s.description} USE WHEN: ${s.when}`).join('\n')}

OUTPUT FORMAT (JSON only, no markdown):
{"skill":"skill_id","confidence":0.9,"params":{"url":"...","query":"...","brand":"...","goal":"..."},"reasoning":"one line why"}

RULES:
- Pick exactly ONE skill
- Extract relevant params from the user message (url, query, brand name, goal description)
- If the message contains a URL, extract it into params.url
- If it's a search/research request, extract the topic into params.query
- If it mentions a brand name for competitor analysis, extract into params.brand
- Always include params.goal with the full user intent
- confidence: 0.9+ if clear match, 0.5-0.8 if ambiguous, <0.5 if no good match
- If nothing matches well, use "browse" as default with lower confidence`;

export async function routeToSkill(
  userMessage: string,
  context?: { currentUrl?: string; hasPage?: boolean; sandboxAvailable?: boolean; wayfayerAvailable?: boolean },
  signal?: AbortSignal,
): Promise<SkillRouteResult> {
  const contextHints: string[] = [];
  if (context?.currentUrl) contextHints.push(`Currently on: ${context.currentUrl}`);
  if (context?.hasPage) contextHints.push('A page is already loaded in the browser.');
  if (!context?.sandboxAvailable) contextHints.push('NOTE: Sandbox (browser automation) is NOT available — prefer skills that use wayfayer.');
  if (!context?.wayfayerAvailable) contextHints.push('NOTE: Wayfayer (web research) is NOT available — prefer browser-based skills.');

  const prompt = [
    `USER MESSAGE: "${userMessage}"`,
    contextHints.length ? `CONTEXT:\n${contextHints.join('\n')}` : '',
    'Pick the best skill.',
  ].filter(Boolean).join('\n\n');

  let raw = '';
  try {
    await ollamaService.generateStream(prompt, ROUTER_SYSTEM, {
      model: getThinkingModel(),
      temperature: 0.1,
      num_predict: 150,
      signal,
      onChunk: (c: string) => { raw += c; },
    });
  } catch {
    // Fallback: browse
    return { skillId: 'browse', confidence: 0.3, params: { goal: userMessage }, reasoning: 'router failed, defaulting to browse' };
  }

  // Parse JSON
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { skillId: 'browse', confidence: 0.3, params: { goal: userMessage }, reasoning: 'could not parse router output' };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      skillId: parsed.skill || 'browse',
      confidence: parsed.confidence || 0.5,
      params: { goal: userMessage, ...parsed.params },
      reasoning: parsed.reasoning || '',
    };
  } catch {
    return { skillId: 'browse', confidence: 0.3, params: { goal: userMessage }, reasoning: 'JSON parse error' };
  }
}

// ── Quick keyword-based pre-router (skips LLM for obvious cases) ──

export function quickRoute(message: string): SkillRouteResult | null {
  const lower = message.toLowerCase().trim();

  // Direct URL navigation
  if (/^(go to|navigate|open)\s+https?:\/\//i.test(message)) {
    const urlMatch = message.match(/https?:\/\/\S+/);
    return urlMatch ? {
      skillId: 'browse',
      confidence: 1.0,
      params: { goal: message, url: urlMatch[0] },
      reasoning: 'direct URL navigation',
    } : null;
  }

  // Research keywords
  if (/^(research|search for|look up|find info|what (?:is|are) the .* trends?|market (?:data|analysis|research))/i.test(lower)) {
    const query = message.replace(/^(research|search for|look up|find info on|find info about)\s*/i, '').trim();
    return {
      skillId: 'web_research',
      confidence: 0.95,
      params: { goal: message, query: query || message },
      reasoning: 'explicit research request',
    };
  }

  // Analyze competitor brand
  if (/^(analyze|study|investigate)\s+(competitor|brand|company)\s/i.test(lower) || /competitor\s+(analysis|intelligence|intel)/i.test(lower)) {
    const brandMatch = message.match(/(?:analyze|study|investigate)\s+(?:competitor|brand|company)\s+["\u201C]?([^"\u201D]+)["\u201D]?/i)
      || message.match(/(?:competitor|brand)\s+(?:analysis|intelligence|intel)\s+(?:for|on|of)\s+["\u201C]?([^"\u201D]+)["\u201D]?/i);
    return {
      skillId: 'analyze_competitor',
      confidence: 0.95,
      params: { goal: message, brand: brandMatch?.[1]?.trim() || '' },
      reasoning: 'explicit competitor analysis request',
    };
  }

  // Analyze product page
  if (/^analyze\s+(product|page)\s/i.test(lower) || /product\s+page\s+analysis/i.test(lower)) {
    const urlMatch = message.match(/https?:\/\/\S+/);
    return {
      skillId: 'analyze_product',
      confidence: 0.9,
      params: { goal: message, url: urlMatch?.[0] || '' },
      reasoning: 'explicit product analysis request',
    };
  }

  // Visual scout
  if (/visual\s+(scout|analysis|design|audit)/i.test(lower) || /screenshot.*compet/i.test(lower) || /compare.*design/i.test(lower)) {
    const urlMatch = message.match(/https?:\/\/\S+/);
    return {
      skillId: 'visual_scout',
      confidence: 0.9,
      params: { goal: message, url: urlMatch?.[0] || '' },
      reasoning: 'explicit visual analysis request',
    };
  }

  // Crawl site
  if (/^(crawl|discover|find all|list all)\s+(products|pages)/i.test(lower) || /product\s+(catalog|discovery|crawl)/i.test(lower)) {
    const urlMatch = message.match(/https?:\/\/\S+/) || message.match(/\b([a-z0-9-]+\.(?:com|co|io|shop|store|net))\b/i);
    return {
      skillId: 'crawl_site',
      confidence: 0.9,
      params: { goal: message, url: urlMatch?.[0] || '' },
      reasoning: 'explicit site crawl request',
    };
  }

  // Extract data
  if (/^extract\s/i.test(lower) || /^(get|pull|scrape)\s+(the\s+)?(data|prices?|table|list|info)/i.test(lower)) {
    const urlMatch = message.match(/https?:\/\/\S+/);
    return {
      skillId: 'extract_data',
      confidence: 0.85,
      params: { goal: message, url: urlMatch?.[0] || '' },
      reasoning: 'explicit data extraction request',
    };
  }

  return null; // no quick match — use LLM router
}

// ── Get skill definition by ID ──

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find(s => s.id === id);
}
