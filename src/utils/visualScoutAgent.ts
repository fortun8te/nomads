// Visual Scout Agent — screenshots competitor URLs + analyzes with vision model
// Returns structured VisualFindings for downstream pipeline stages

import { ollamaService } from './ollama';
import { screenshotService, type ScreenshotResult } from './wayfayer';
import { recordResearchSource } from './researchAudit';
import { getVisionModel } from './modelConfig';
import type { Campaign, VisualAnalysis, VisualFindings } from '../types';

const VISION_MODEL = getVisionModel();

// ─────────────────────────────────────────────────────────────
// Progress event types for live UI visibility
// ─────────────────────────────────────────────────────────────

export type VisualProgressEvent =
  | { type: 'screenshot_batch_start'; urls: string[] }
  | { type: 'screenshot_start'; url: string; index: number; total: number }
  | { type: 'screenshot_done'; url: string; index: number; total: number; thumbnail?: string; error?: string }
  | { type: 'analysis_start'; url: string; index: number; total: number }
  | { type: 'analysis_done'; url: string; index: number; total: number; findings: { tone?: string; colors?: string[]; layout?: string; insight?: string } }
  | { type: 'synthesis_start'; count: number }
  | { type: 'synthesis_done'; patterns: string[]; gaps: string[] }
  | { type: 'complete'; totalScreenshots: number; totalAnalyzed: number };

// ─────────────────────────────────────────────────────────────
// Single screenshot analysis
// ─────────────────────────────────────────────────────────────

async function analyzeScreenshot(
  screenshot: ScreenshotResult,
  campaign: Campaign,
  signal?: AbortSignal
): Promise<VisualAnalysis | null> {
  if (!screenshot.image_base64 || screenshot.error) return null;

  const prompt = `Analyze this competitor website/ad screenshot. The brand we're competing against: ${campaign.brand} selling ${campaign.productDescription}.

Describe what you see:
1. DOMINANT_COLORS: List 3-4 main colors (be specific, e.g. "deep navy", "warm coral", "muted sage green")
2. LAYOUT_STYLE: How is the page laid out? (hero image, split screen, grid, scroll-heavy, minimal?)
3. VISUAL_TONE: What feeling does it convey? (premium, clinical, playful, warm, edgy, trustworthy?)
4. KEY_VISUAL_ELEMENTS: What stands out? (product photos, lifestyle images, before-afters, trust badges, testimonials, icons?)
5. TEXT_OVERLAY_STYLE: Typography approach? (bold headlines, elegant serif, overlaid on images, minimal text?)
6. CTA_STYLE: Call-to-action design? (button color, size, placement, urgency text?)
7. OVERALL_IMPRESSION: 2-3 sentences on what this visual strategy communicates
8. COMPETITIVE_INSIGHT: What does this reveal about their marketing strategy?

Use this exact format with labels:
DOMINANT_COLORS: ...
LAYOUT_STYLE: ...
VISUAL_TONE: ...
KEY_VISUAL_ELEMENTS: ...
TEXT_OVERLAY_STYLE: ...
CTA_STYLE: ...
OVERALL_IMPRESSION: ...
COMPETITIVE_INSIGHT: ...`;

  try {
    const result = await ollamaService.generateStream(
      prompt,
      'Analyze visual advertising and web design. Be specific about colors, layout, and design choices.',
      {
        model: VISION_MODEL,
        images: [screenshot.image_base64],
        signal,
      }
    );

    return parseVisualAnalysis(result, screenshot.url);
  } catch (error) {
    console.error(`Visual analysis failed for ${screenshot.url}:`, error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Parse vision model output into structured VisualAnalysis
// ─────────────────────────────────────────────────────────────

function parseVisualAnalysis(output: string, url: string): VisualAnalysis {
  const extract = (key: string): string => {
    const match = output.match(new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, 's'));
    return match?.[1]?.trim() || '';
  };

  const extractList = (key: string): string[] => {
    const value = extract(key);
    return value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  };

  return {
    url,
    analysisTimestamp: Date.now(),
    dominantColors: extractList('DOMINANT_COLORS'),
    layoutStyle: extract('LAYOUT_STYLE'),
    visualTone: extract('VISUAL_TONE'),
    keyVisualElements: extractList('KEY_VISUAL_ELEMENTS'),
    textOverlayStyle: extract('TEXT_OVERLAY_STYLE'),
    ctaStyle: extract('CTA_STYLE'),
    overallImpression: extract('OVERALL_IMPRESSION'),
    competitiveInsight: extract('COMPETITIVE_INSIGHT'),
  };
}

// ─────────────────────────────────────────────────────────────
// Synthesize across all visual analyses (uses Qwen 3.5 for strategy)
// ─────────────────────────────────────────────────────────────

async function synthesizeVisualFindings(
  analyses: VisualAnalysis[],
  campaign: Campaign,
  signal?: AbortSignal
): Promise<{
  commonPatterns: string[];
  visualGaps: string[];
  recommendedDifferentiation: string[];
}> {
  const analysisText = analyses.map((a, i) =>
    `Competitor ${i + 1} (${a.url}):
     Colors: ${a.dominantColors.join(', ')}
     Layout: ${a.layoutStyle}
     Tone: ${a.visualTone}
     Key Elements: ${a.keyVisualElements.join(', ')}
     CTA: ${a.ctaStyle}
     Strategy: ${a.competitiveInsight}`
  ).join('\n\n');

  const prompt = `You are a visual strategist analyzing competitor visual approaches for ${campaign.brand} (${campaign.productDescription}).

COMPETITOR VISUAL ANALYSES:
${analysisText}

Based on these visual analyses, identify:

COMMON_PATTERNS:
- [What visual approaches ALL or MOST competitors share]

VISUAL_GAPS:
- [What NONE of them do visually — unclaimed visual territory]

RECOMMENDED_DIFFERENTIATION:
- [How ${campaign.brand} should look DIFFERENT — specific actionable visual choices]

Be specific and actionable.`;

  try {
    const result = await ollamaService.generateStream(
      prompt,
      'Synthesize visual competitive intelligence into actionable creative direction.',
      { model: 'qwen3.5:9b', signal }
    );

    const extractSection = (key: string): string[] => {
      const match = result.match(new RegExp(`${key}:([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, 'i'));
      if (!match) return [];
      return match[1]
        .split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(l => l.length > 5);
    };

    return {
      commonPatterns: extractSection('COMMON_PATTERNS'),
      visualGaps: extractSection('VISUAL_GAPS'),
      recommendedDifferentiation: extractSection('RECOMMENDED_DIFFERENTIATION'),
    };
  } catch {
    return { commonPatterns: [], visualGaps: [], recommendedDifferentiation: [] };
  }
}

// ─────────────────────────────────────────────────────────────
// Analyze a single image with vision model (for reflector use)
// ─────────────────────────────────────────────────────────────

export async function analyzeImageWithVision(
  imageBase64: string,
  analysisPrompt: string,
  signal?: AbortSignal
): Promise<string> {
  try {
    return await ollamaService.generateStream(
      analysisPrompt,
      'Analyze this image in detail for marketing intelligence.',
      {
        model: VISION_MODEL,
        images: [imageBase64],
        signal,
      }
    );
  } catch (error) {
    console.error('Vision analysis failed:', error);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────
// Main Visual Scout Agent
// ─────────────────────────────────────────────────────────────

function emptyVisualFindings(): VisualFindings {
  return {
    competitorVisuals: [],
    commonPatterns: [],
    visualGaps: [],
    recommendedDifferentiation: [],
    analysisModel: VISION_MODEL,
    totalScreenshots: 0,
    totalAnalyzed: 0,
  };
}

export const visualScoutAgent = {
  /**
   * Screenshot competitor URLs and analyze with vision model:8b
   * Returns structured VisualFindings for downstream stages
   */
  async analyzeCompetitorVisuals(
    urls: string[],
    campaign: Campaign,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    onProgress?: (event: VisualProgressEvent) => void
  ): Promise<VisualFindings> {
    onChunk?.(`[Visual Scout] Screenshotting ${urls.length} competitor pages...\n`);
    onProgress?.({ type: 'screenshot_batch_start', urls });

    // Step 1: Take screenshots in batch — emit per-URL progress
    // We use individual screenshots to get per-URL events
    const screenshots: ScreenshotResult[] = [];
    for (let i = 0; i < urls.length; i++) {
      if (signal?.aborted) break;
      const url = urls[i];
      onProgress?.({ type: 'screenshot_start', url, index: i, total: urls.length });
      try {
        const result = await screenshotService.screenshot(url, { quality: 60 });
        screenshots.push(result);
        onProgress?.({
          type: 'screenshot_done',
          url,
          index: i,
          total: urls.length,
          thumbnail: result.image_base64 || undefined, // full base64 for live thumbnail display
          error: result.error ?? undefined,
        });
      } catch (err) {
        screenshots.push({ url, image_base64: '', error: String(err), width: 0, height: 0 });
        onProgress?.({
          type: 'screenshot_done',
          url,
          index: i,
          total: urls.length,
          error: String(err),
        });
      }
    }

    const validScreenshots = screenshots.filter(s => s.image_base64 && !s.error);
    onChunk?.(`[Visual Scout] Captured ${validScreenshots.length}/${urls.length} screenshots\n`);

    // Record visual sources in audit trail
    validScreenshots.forEach((ss) => {
      recordResearchSource({
        url: ss.url,
        query: 'Visual Scout — Competitor Analysis',
        source: 'visual',
      });
    });

    if (validScreenshots.length === 0) {
      onChunk?.(`[Visual Scout] No screenshots captured — skipping visual analysis\n`);
      onProgress?.({ type: 'complete', totalScreenshots: urls.length, totalAnalyzed: 0 });
      return emptyVisualFindings();
    }

    // Step 2: Analyze each screenshot sequentially with vision model
    const analyses: VisualAnalysis[] = [];
    for (let i = 0; i < validScreenshots.length; i++) {
      if (signal?.aborted) break;

      const ss = validScreenshots[i];
      onChunk?.(`[Visual Scout] Analyzing ${i + 1}/${validScreenshots.length}: ${ss.url.slice(0, 60)}...\n`);
      onProgress?.({ type: 'analysis_start', url: ss.url, index: i, total: validScreenshots.length });

      const analysis = await analyzeScreenshot(ss, campaign, signal);
      if (analysis) {
        analyses.push(analysis);
        onChunk?.(`[Visual Scout] → tone: ${analysis.visualTone}, colors: ${analysis.dominantColors.slice(0, 3).join(', ')}\n`);
        onProgress?.({
          type: 'analysis_done',
          url: ss.url,
          index: i,
          total: validScreenshots.length,
          findings: {
            tone: analysis.visualTone,
            colors: analysis.dominantColors,
            layout: analysis.layoutStyle,
            insight: analysis.competitiveInsight,
          },
        });
      }
    }

    onChunk?.(`[Visual Scout] Analyzed ${analyses.length} competitor visuals\n`);

    if (analyses.length === 0) {
      onProgress?.({ type: 'complete', totalScreenshots: urls.length, totalAnalyzed: 0 });
      return emptyVisualFindings();
    }

    // Step 3: Synthesize across all analyses
    onChunk?.(`[Visual Scout] Synthesizing visual competitive landscape...\n`);
    onProgress?.({ type: 'synthesis_start', count: analyses.length });
    const synthesis = await synthesizeVisualFindings(analyses, campaign, signal);

    if (synthesis.commonPatterns.length > 0) {
      onChunk?.(`[Visual Scout] Common patterns: ${synthesis.commonPatterns.slice(0, 2).join('; ')}\n`);
    }
    if (synthesis.visualGaps.length > 0) {
      onChunk?.(`[Visual Scout] Visual gaps found: ${synthesis.visualGaps.slice(0, 2).join('; ')}\n`);
    }

    onProgress?.({
      type: 'synthesis_done',
      patterns: synthesis.commonPatterns,
      gaps: synthesis.visualGaps,
    });
    onProgress?.({ type: 'complete', totalScreenshots: urls.length, totalAnalyzed: analyses.length });

    return {
      competitorVisuals: analyses,
      commonPatterns: synthesis.commonPatterns,
      visualGaps: synthesis.visualGaps,
      recommendedDifferentiation: synthesis.recommendedDifferentiation,
      analysisModel: VISION_MODEL,
      totalScreenshots: urls.length,
      totalAnalyzed: analyses.length,
    };
  },

  /**
   * Screenshot + analyze a single URL (for reflector ad-hoc use)
   */
  async analyzeSingleUrl(
    url: string,
    campaign: Campaign,
    signal?: AbortSignal
  ): Promise<VisualAnalysis | null> {
    const screenshot = await screenshotService.screenshot(url);
    if (!screenshot.image_base64 || screenshot.error) return null;
    return analyzeScreenshot(screenshot, campaign, signal);
  },
};
