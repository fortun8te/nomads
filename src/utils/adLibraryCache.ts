/**
 * Ad Library Cache — Pre-analyzes all ad library images with minicpm-v
 * and caches descriptions for instant retrieval during HTML generation.
 *
 * Flow:
 *   1. "Pre-analyze" button triggers analyzeAll()
 *   2. Each image → minicpm-v → 2-sentence description
 *   3. Results cached in IndexedDB under 'ad-library-cache' key
 *   4. At generation time, getRelevantReferences() picks 8-10 from cache
 *      filtered by category relevance to the brand/product
 */

import { get, set } from 'idb-keyval';
import { loadAdLibraryManifest, loadAdImageBase64 } from './adLibraryLoader';
import { ollamaService } from './ollama';

const CACHE_KEY = 'ad-library-cache';
const VISION_MODEL = 'minicpm-v:8b';

export interface AdDescription {
  filename: string;
  category: string;
  path: string;
  description: string;
  analyzedAt: number;
}

export interface AdLibraryCache {
  descriptions: AdDescription[];
  totalAnalyzed: number;
  totalFailed: number;
  lastUpdated: number;
}

// ── Read cache from IndexedDB, or load from pre-analyzed descriptions.json ──
export async function getCache(): Promise<AdLibraryCache | null> {
  try {
    // First check IndexedDB
    const cached = await get(CACHE_KEY);
    if (cached) return cached;

    // If not in IndexedDB, try loading from pre-analyzed descriptions.json
    try {
      const response = await fetch('/ad-library/descriptions.json');
      if (response.ok) {
        const data = (await response.json()) as AdLibraryCache;
        // Cache it in IndexedDB for next time
        await saveCache(data);
        return data;
      }
    } catch (err) {
      console.warn('Could not load descriptions.json:', err);
    }

    return null;
  } catch {
    return null;
  }
}

// ── Save cache to IndexedDB ──
async function saveCache(cache: AdLibraryCache): Promise<void> {
  await set(CACHE_KEY, cache);
}

// ── Batch analyze all ad library images ──
export async function analyzeAll(
  onProgress?: (done: number, total: number, current: string) => void,
  signal?: AbortSignal
): Promise<AdLibraryCache> {
  const manifest = await loadAdLibraryManifest();
  const existing = await getCache();

  // Build a set of already-analyzed filenames to skip
  const alreadyDone = new Set(
    (existing?.descriptions || []).map(d => d.filename)
  );

  const toAnalyze = manifest.images.filter(img => !alreadyDone.has(img.filename));
  const descriptions: AdDescription[] = [...(existing?.descriptions || [])];
  let failed = existing?.totalFailed || 0;

  onProgress?.(descriptions.length, manifest.images.length, 'Starting...');

  // Process in batches of 2 (concurrent) to balance speed vs VRAM
  for (let i = 0; i < toAnalyze.length; i += 2) {
    if (signal?.aborted) break;

    const batch = toAnalyze.slice(i, i + 2);
    const results = await Promise.all(
      batch.map(async (img) => {
        if (signal?.aborted) return null;

        try {
          const base64 = await loadAdImageBase64(img.path);
          if (!base64) { failed++; return null; }

          const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

          const desc = await ollamaService.generateStream(
            `Describe this ad's design in detail so someone could recreate it in HTML/CSS. Include ALL of these:

LAYOUT: Exact structure (e.g. "full-bleed dark background, product centered in top 60%, text block bottom 40%")
PRODUCT: Size relative to ad (e.g. "product takes up ~50% of height, centered horizontally"), styling (shadow, angle, background behind it)
HEADLINE: Exact text if readable, font style (bold/light/serif/sans), approximate size relative to ad width, color, position
SUBTEXT: Any supporting text, size relative to headline, color
CTA: Button or text, color, shape, position, text content if readable
COLORS: List exact colors you see (e.g. "background: deep navy #1a1a3e, headline: white, accent: coral/orange")
SPACING: How much whitespace/breathing room, padding from edges
MOOD: Premium/playful/clinical/bold/minimal/energetic

Be specific enough that this description alone could be used as a prompt to generate an identical ad layout.`,
            'Describe this ad design in reproducible detail for HTML/CSS recreation.',
            { model: VISION_MODEL, images: [rawBase64], signal }
          );

          return {
            filename: img.filename,
            category: img.category,
            path: img.path,
            description: desc.trim(),
            analyzedAt: Date.now(),
          } as AdDescription;
        } catch {
          failed++;
          return null;
        }
      })
    );

    for (const r of results) {
      if (r) descriptions.push(r);
    }

    // Save progress incrementally (every 10 images)
    if (i % 10 === 0 || i + 2 >= toAnalyze.length) {
      const cache: AdLibraryCache = {
        descriptions,
        totalAnalyzed: descriptions.length,
        totalFailed: failed,
        lastUpdated: Date.now(),
      };
      await saveCache(cache);
    }

    onProgress?.(descriptions.length, manifest.images.length, batch[0]?.category || '');
  }

  const finalCache: AdLibraryCache = {
    descriptions,
    totalAnalyzed: descriptions.length,
    totalFailed: failed,
    lastUpdated: Date.now(),
  };
  await saveCache(finalCache);
  return finalCache;
}

// ── Get relevant references for HTML generation ──
// Picks 8-10 descriptions aligned to the product/brand context
export async function getRelevantReferences(
  productType?: string,
  brandVibe?: string,
  count: number = 8
): Promise<string> {
  const cache = await getCache();
  if (!cache || cache.descriptions.length === 0) return '';

  const descs = cache.descriptions;

  // Score each description by relevance
  const keywords = [
    ...(productType || '').toLowerCase().split(/\s+/),
    ...(brandVibe || '').toLowerCase().split(/\s+/),
  ].filter(w => w.length > 2);

  const scored = descs.map(d => {
    let score = 0;
    const text = `${d.category} ${d.description}`.toLowerCase();

    // Category match bonuses
    if (productType) {
      const pt = productType.toLowerCase();
      if (pt.includes('skincare') || pt.includes('beauty') || pt.includes('serum') || pt.includes('spray')) {
        if (['product-hero', 'features-benefits', 'social-proof'].includes(d.category)) score += 3;
      }
      if (pt.includes('supplement') || pt.includes('health') || pt.includes('vitamin')) {
        if (['social-proof', 'testimonial', 'features-benefits'].includes(d.category)) score += 3;
      }
      if (pt.includes('food') || pt.includes('drink') || pt.includes('snack')) {
        if (['product-hero', 'lifestyle', 'deals-offers'].includes(d.category)) score += 3;
      }
    }

    // Keyword relevance
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }

    // Prefer product-hero and features-benefits (most useful for HTML ads)
    if (d.category === 'product-hero') score += 2;
    if (d.category === 'features-benefits') score += 1;

    // Small random jitter for variety
    score += Math.random() * 1.5;

    return { ...d, score };
  });

  // Sort by score, take top N, ensure category diversity
  scored.sort((a, b) => b.score - a.score);

  const picked: typeof scored = [];
  const catCounts: Record<string, number> = {};

  for (const item of scored) {
    if (picked.length >= count) break;
    // Max 3 from same category
    const cc = catCounts[item.category] || 0;
    if (cc >= 3) continue;
    picked.push(item);
    catCounts[item.category] = cc + 1;
  }

  if (picked.length === 0) return '';

  const lines = picked.map((d, i) =>
    `Reference #${i + 1}. [${d.category}] ${d.description}`
  ).join('\n');

  return `\n--- REFERENCE ADS (${picked.length} top-performing ad designs from competitors) ---
${lines}

REPRODUCE these reference layouts as closely as possible:
- COPY the exact LAYOUT structure — same zones, same proportions, same spatial arrangement
- COPY the visual HIERARCHY — headline size, product placement, CTA position, spacing ratios
- COPY the COPY FRAMEWORK — same type of headline (benefit, question, statistic), same CTA style, same info density
- MATCH their polish level — gradients, shadows, rounded corners, badge styles
- ONLY change: brand name, product images, specific copy text, and brand colors
Think of it as a TEMPLATE you're filling in with different brand content — same skeleton, different skin.
In your HTML output, include <!-- Inspired by: Reference #N --> to note which reference you reproduced.\n`;
}

// ── Clear cache ──
export async function clearCache(): Promise<void> {
  await set(CACHE_KEY, null);
}
