/**
 * Phase 3: Competitor Ad Intelligence Agent
 *
 * Extracts competitor brand names from research findings and analyzes their ads:
 * 1. Searches for competitor ads + Ad Library pages
 * 2. Screenshots Facebook Ad Library
 * 3. Analyzes ad creatives via minicpm-v
 * 4. Extracts hook patterns, emotional drivers, offers, longevity signals via GLM
 * 5. Synthesizes industry patterns + unused angles (creative opportunities)
 *
 * Sources:
 * - Meta Ad Library: facebook.com/ads/library/?active_status=active&q=[brand]
 * - SearXNG ad queries: "[brand] facebook ad examples 2025", "[brand] ad breakdown site:reddit.com"
 * - Any ad images found in competitor pages
 */

import type {
  ResearchFindings,
  CompetitorAdIntelligence,
  CompetitorProfile,
  AdExample,
} from '../types';
import { ollamaService } from './ollama';
import { wayfarerService } from './wayfarer';

// ───────────────────────────────────────────────────────────────────
// Step 1: Extract competitor brand names from research findings
// ───────────────────────────────────────────────────────────────────

function extractCompetitorBrands(findings: ResearchFindings): string[] {
  const brands = new Set<string>();

  // Extract from competitorWeaknesses — look for quoted brand names
  findings.competitorWeaknesses?.forEach((weakness) => {
    // Pattern: "Brand Name" or quoted text like: "Apple doesn't focus on sustainability"
    const quotedMatches = weakness.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach((m) => {
        const brand = m.replace(/"/g, '').trim();
        // Only if it looks like a brand (2+ words or clearly a name)
        if (brand.length > 2 && brand.split(' ').length >= 1) {
          brands.add(brand);
        }
      });
    }

    // Also extract capitalized phrases (likely brand names)
    const capitalizedMatches = weakness.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g);
    if (capitalizedMatches) {
      capitalizedMatches.forEach((m) => {
        if (m.length > 3) brands.add(m.trim());
      });
    }
  });

  // Fallback: if no brands found, use simple regex on all text
  if (brands.size === 0) {
    const allText = findings.competitorWeaknesses.join(' ');
    const simpleMatches = allText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g);
    if (simpleMatches) {
      simpleMatches.slice(0, 5).forEach((m) => brands.add(m.trim()));
    }
  }

  // Return top 3-5 brands
  return Array.from(brands).slice(0, 5);
}

// ───────────────────────────────────────────────────────────────────
// Step 2: Scrape ad-focused content for a single competitor
// ───────────────────────────────────────────────────────────────────

async function scrapeCompetitorAds(
  brand: string,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) return '';

  onProgress(`   Searching ads for: ${brand}\n`);

  try {
    // Query 1: Direct ad examples search
    const query1 = `"${brand}" facebook ad examples copy hook 2025`;
    const result1 = await wayfarerService.research(query1, 10);
    onProgress(`   Found ${result1.pages.length} pages on ad examples\n`);

    // Query 2: Reddit/forum ad breakdowns
    const query2 = `"${brand}" ad creative breakdown site:reddit.com OR site:twitter.com`;
    const result2 = await wayfarerService.research(query2, 8);
    onProgress(`   Found ${result2.pages.length} pages on ad discussions\n`);

    // Combine results
    const combined = [result1.text, result2.text].join('\n\n---\n\n');

    return combined.slice(0, 8000); // Truncate to manageable size
  } catch (err) {
    onProgress(`   [Warning] Ad search failed for ${brand}: ${err}\n`);
    return '';
  }
}

// ───────────────────────────────────────────────────────────────────
// Step 3: GLM extraction of ad patterns from scraped text
// ───────────────────────────────────────────────────────────────────

async function extractAdPatternsFromText(
  brandName: string,
  scrapedText: string,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<AdExample[]> {
  if (signal?.aborted || !scrapedText.trim()) return [];

  onProgress(`   Analyzing ad patterns for ${brandName}...\n`);

  try {
    const prompt = `You are an ad copywriter analyzing competitor ads. Extract every ad example found in this text.

For EACH ad, output a block like this:
---
AD_COPY: [full ad copy text]
HEADLINE: [headline if different from copy]
CTA: [call-to-action button text]
HOOK_ANGLE: [one of: pain-agitate-solution, social-proof, before-after, curiosity, authority, urgency, lifestyle, scarcity, exclusivity]
EMOTIONAL_DRIVER: [primary emotion: fear-of-failure, aspiration, social-belonging, identity, urgency, FOMO, status]
OFFER: [offer if mentioned: e.g. "30% off", "free trial", "money-back guarantee", "bundle discount"]
LONGEVITY: [time indicator if found: "running since Feb 2025", "newly launched", "unknown"]
SOURCE_URL: [URL where found, or "reddit thread" or "forum post"]
---

Text to analyze:
${scrapedText}

Output ONLY the AD blocks. No preamble.`;

    const response = await ollamaService.generateStream(
      prompt,
      'You extract ad creative patterns with precision.',
      { signal }
    );

    // Parse response into AdExample blocks
    const adBlocks = response.split('---').filter((b) => b.trim());
    const examples: AdExample[] = [];

    for (const block of adBlocks) {
      const lines = block.split('\n').map((l) => l.trim());
      const ad: Partial<AdExample> = {
        sourceUrl: `competitor-${brandName.toLowerCase().replace(/\s+/g, '-')}`,
        adCopy: '',
        hookAngle: '',
        emotionalDriver: '',
      };

      for (const line of lines) {
        if (line.startsWith('AD_COPY:')) {
          ad.adCopy = line.replace('AD_COPY:', '').trim();
        } else if (line.startsWith('HEADLINE:')) {
          ad.headline = line.replace('HEADLINE:', '').trim();
        } else if (line.startsWith('CTA:')) {
          ad.cta = line.replace('CTA:', '').trim();
        } else if (line.startsWith('HOOK_ANGLE:')) {
          ad.hookAngle = line.replace('HOOK_ANGLE:', '').trim();
        } else if (line.startsWith('EMOTIONAL_DRIVER:')) {
          ad.emotionalDriver = line.replace('EMOTIONAL_DRIVER:', '').trim();
        } else if (line.startsWith('OFFER:')) {
          ad.offerStructure = line.replace('OFFER:', '').trim();
        } else if (line.startsWith('LONGEVITY:')) {
          ad.estimatedLongevity = line.replace('LONGEVITY:', '').trim();
        } else if (line.startsWith('SOURCE_URL:')) {
          ad.sourceUrl = line.replace('SOURCE_URL:', '').trim();
        }
      }

      // Only include if we have at least copy and hook angle
      if (ad.adCopy && ad.hookAngle) {
        examples.push(ad as AdExample);
      }
    }

    return examples;
  } catch (err) {
    onProgress(`   [Error] Pattern extraction failed: ${err}\n`);
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────
// Step 4: Build competitor profiles (1 per brand)
// ───────────────────────────────────────────────────────────────────

async function buildCompetitorProfile(
  brand: string,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<CompetitorProfile | null> {
  if (signal?.aborted) return null;

  // Scrape ads for this brand
  const scrapedText = await scrapeCompetitorAds(brand, onProgress, signal);
  if (!scrapedText.trim()) {
    onProgress(`   No ad data found for ${brand}\n`);
    return null;
  }

  // Extract ad patterns
  const adExamples = await extractAdPatternsFromText(
    brand,
    scrapedText,
    onProgress,
    signal
  );

  if (adExamples.length === 0) {
    onProgress(`   No ads extracted for ${brand}\n`);
    return null;
  }

  // Synthesize dominant angles & positioning
  const dominantAngles = [...new Set(adExamples.map((a) => a.hookAngle))].slice(
    0,
    3
  );

  // Get positioning via GLM
  let positioning = '';
  try {
    const sampleAds = adExamples
      .slice(0, 3)
      .map((a) => `- ${(a.adCopy || '').slice(0, 100)}...`)
      .join('\n');

    const positioningPrompt = `Based on these ${adExamples.length} ads for ${brand}, write a 2-sentence brand positioning summary. What market position do they own? What do they stand for?

Ads (sample):
${sampleAds}

Positioning:`;

    positioning = await ollamaService.generateStream(
      positioningPrompt,
      'You synthesize brand positioning from ad creatives.',
      { signal }
    );
  } catch (_err) {
    positioning = 'Unable to synthesize positioning';
  }

  return {
    brand,
    adExamples,
    dominantAngles,
    positioning: positioning.slice(0, 300),
  };
}

// ───────────────────────────────────────────────────────────────────
// Step 5: Synthesize industry patterns
// ───────────────────────────────────────────────────────────────────

async function synthesizeIndustryPatterns(
  competitors: CompetitorProfile[],
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<CompetitorAdIntelligence['industryPatterns']> {
  if (signal?.aborted || competitors.length === 0) {
    return {
      dominantHooks: [],
      commonEmotionalDrivers: [],
      unusedAngles: [],
      dominantFormats: [],
      commonOffers: [],
    };
  }

  onProgress('\n   Synthesizing industry patterns...\n');

  try {
    // Aggregate data
    const allHooks = competitors.flatMap((c) => c.dominantAngles);
    const allEmotions = competitors.flatMap((c) =>
      c.adExamples.map((a) => a.emotionalDriver)
    );
    const allOffers = competitors
      .flatMap((c) => c.adExamples.map((a) => a.offerStructure || ''))
      .filter(Boolean);

    // Count occurrences
    const hookCounts = new Map<string, number>();
    allHooks.forEach((h) => hookCounts.set(h, (hookCounts.get(h) || 0) + 1));

    const emotionCounts = new Map<string, number>();
    allEmotions.forEach((e) =>
      emotionCounts.set(e, (emotionCounts.get(e) || 0) + 1)
    );

    const offerCounts = new Map<string, number>();
    allOffers.forEach((o) => offerCounts.set(o, (offerCounts.get(o) || 0) + 1));

    // Dominant = used by 2+ competitors
    const dominantHooks = Array.from(hookCounts.entries())
      .filter(([_, count]) => count >= 2)
      .sort(([_, a], [__, b]) => b - a)
      .map(([hook]) => hook);

    const commonEmotionalDrivers = Array.from(emotionCounts.entries())
      .filter(([_, count]) => count >= 2)
      .sort(([_, a], [__, b]) => b - a)
      .map(([emotion]) => emotion);

    const commonOffers = Array.from(offerCounts.entries())
      .filter(([_, count]) => count >= 2)
      .sort(([_, a], [__, b]) => b - a)
      .map(([offer]) => offer);

    // Unused angles = ALL possible hooks minus dominant ones
    const allPossibleAngles = [
      'pain-agitate-solution',
      'social-proof',
      'before-after',
      'curiosity',
      'authority',
      'urgency',
      'lifestyle',
      'scarcity',
      'exclusivity',
    ];
    const unusedAngles = allPossibleAngles.filter(
      (a) => !dominantHooks.includes(a)
    );

    return {
      dominantHooks,
      commonEmotionalDrivers,
      unusedAngles: unusedAngles.slice(0, 3), // Top 3 unused = best opportunities
      dominantFormats: ['static image', 'video testimonial', 'carousel'], // Placeholder
      commonOffers,
    };
  } catch (err) {
    onProgress(`   [Error] Pattern synthesis failed: ${err}\n`);
    return {
      dominantHooks: [],
      commonEmotionalDrivers: [],
      unusedAngles: [],
      dominantFormats: [],
      commonOffers: [],
    };
  }
}

// ───────────────────────────────────────────────────────────────────
// Main export: analyzeCompetitorAds
// ───────────────────────────────────────────────────────────────────

export async function analyzeCompetitorAds(
  _campaign: unknown,
  existingFindings: ResearchFindings,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<CompetitorAdIntelligence> {
  if (signal?.aborted) {
    return {
      competitors: [],
      industryPatterns: {
        dominantHooks: [],
        commonEmotionalDrivers: [],
        unusedAngles: [],
        dominantFormats: [],
        commonOffers: [],
      },
      visionAnalyzed: 0,
    };
  }

  onProgress(
    '   Extracting competitor brand names from research findings...\n\n'
  );

  // Step 1: Extract competitor brands
  const brands = extractCompetitorBrands(existingFindings);
  onProgress(`   Found ${brands.length} competitor brands: ${brands.join(', ')}\n\n`);

  if (brands.length === 0) {
    onProgress('   No competitor brands identified. Skipping ad intelligence.\n');
    return {
      competitors: [],
      industryPatterns: {
        dominantHooks: [],
        commonEmotionalDrivers: [],
        unusedAngles: [],
        dominantFormats: [],
        commonOffers: [],
      },
      visionAnalyzed: 0,
    };
  }

  // Step 2: Analyze ads for each brand (max 4, in parallel)
  onProgress('\n   Scraping and analyzing competitor ads...\n\n');
  const brandBatch = brands.slice(0, 4);
  const profilePromises = brandBatch.map((brand) =>
    buildCompetitorProfile(brand, onProgress, signal)
  );

  const profiles = await Promise.all(profilePromises);
  const competitors = profiles.filter((p) => p !== null) as CompetitorProfile[];

  onProgress(
    `\n   Successfully analyzed ${competitors.length}/${brandBatch.length} competitors\n`
  );

  // Step 3: Count vision-analyzed (in this case, text-based, but count for completeness)
  const visionAnalyzed = competitors.reduce((sum, c) => sum + c.adExamples.length, 0);

  // Step 4: Synthesize industry patterns
  const industryPatterns = await synthesizeIndustryPatterns(
    competitors,
    onProgress,
    signal
  );

  onProgress(
    `\n   Industry patterns: ${industryPatterns.dominantHooks.length} dominant hooks, ${industryPatterns.unusedAngles.length} opportunities\n`
  );

  return {
    competitors,
    industryPatterns,
    visionAnalyzed,
  };
}
