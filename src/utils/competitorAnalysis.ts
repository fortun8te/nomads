import { ollamaService } from './ollama';

export interface CompetitorCreativeAnalysis {
  competitorName: string;
  colorPalette: string;
  visualStyle: string;
  pacing: string;
  messaging: string;
  hooks: string;
  differentiators: string;
}

/**
 * Analyze competitor creatives using local vision model
 * Extracts patterns from images/videos
 */
export const competitorAnalyzer = {
  /**
   * Analyze a single competitor's creative style
   * Uses local vision model to extract visual patterns
   */
  async analyzeCreative(
    competitorName: string,
    creativeImageUrl: string
  ): Promise<CompetitorCreativeAnalysis> {
    const visionPrompt = `You are a creative analyst. Analyze this ad creative and extract these specific patterns:

ANALYZE:
1. Color palette (what colors dominate? psychology?)
2. Visual style (minimalist, bold, cinematic, flat, etc.)
3. Pacing/editing (fast cuts, slow transitions, dynamic, static?)
4. Messaging approach (testimonial, educational, entertaining, problem-agitate, etc.)
5. Main hook/hook type (question, stat, story, surprise, etc.)
6. What makes it effective (what's working?)

RESPOND WITH:
- Color palette: [specific colors and psychology]
- Visual style: [one sentence description]
- Pacing: [fast/medium/slow with examples]
- Messaging: [main approach and why]
- Hook: [specific hook type and execution]
- Why it works: [1-2 sentences on effectiveness]

Be specific and direct. No fluff.`;

    try {
      // For now, return a template since we need vision model setup
      // In next step, will connect to local vision model (llava/multimodal)
      const analysisText = await ollamaService.generate(
        `Competitor: ${competitorName}\nURL/image: ${creativeImageUrl}\n\n${visionPrompt}`,
        'You are a creative analyst specializing in competitor analysis.'
      );

      return parseCreativeAnalysis(competitorName, analysisText);
    } catch (error) {
      console.error(`Failed to analyze ${competitorName} creative:`, error);
      return createEmptyAnalysis(competitorName);
    }
  },

  /**
   * Analyze multiple competitors and synthesize patterns
   */
  async analyzeCompetitors(
    competitors: Array<{ name: string; creativeUrl: string }>
  ): Promise<{
    analyses: CompetitorCreativeAnalysis[];
    patterns: {
      dominantColors: string;
      commonStyle: string;
      commonPacing: string;
      commonMessaging: string;
      marketGaps: string;
    };
  }> {
    const analyses = await Promise.all(
      competitors.map((c) => this.analyzeCreative(c.name, c.creativeUrl))
    );

    const patterns = synthesizePatterns(analyses);

    return { analyses, patterns };
  },
};

function parseCreativeAnalysis(
  competitorName: string,
  analysisText: string
): CompetitorCreativeAnalysis {
  // Parse the vision model response into structured data
  const extract = (pattern: string): string => {
    const regex = new RegExp(`${pattern}:\\s*(.+?)(?=\\n|$)`, 'i');
    const match = analysisText.match(regex);
    return match ? match[1].trim() : '';
  };

  return {
    competitorName,
    colorPalette: extract('Color palette'),
    visualStyle: extract('Visual style'),
    pacing: extract('Pacing'),
    messaging: extract('Messaging'),
    hooks: extract('Hook'),
    differentiators: extract('Why it works'),
  };
}

function createEmptyAnalysis(competitorName: string): CompetitorCreativeAnalysis {
  return {
    competitorName,
    colorPalette: 'Unable to analyze',
    visualStyle: 'Unable to analyze',
    pacing: 'Unable to analyze',
    messaging: 'Unable to analyze',
    hooks: 'Unable to analyze',
    differentiators: 'Unable to analyze',
  };
}

function synthesizePatterns(
  analyses: CompetitorCreativeAnalysis[]
): {
  dominantColors: string;
  commonStyle: string;
  commonPacing: string;
  commonMessaging: string;
  marketGaps: string;
} {
  // Synthesize patterns from multiple competitor analyses
  const colorMentions = analyses.map((a) => a.colorPalette).join(' | ');
  const styleMentions = analyses.map((a) => a.visualStyle).join(' | ');
  const pacingMentions = analyses.map((a) => a.pacing).join(' | ');
  const messagingMentions = analyses.map((a) => a.messaging).join(' | ');

  return {
    dominantColors: colorMentions,
    commonStyle: styleMentions,
    commonPacing: pacingMentions,
    commonMessaging: messagingMentions,
    marketGaps: 'Analyze what competitors are NOT doing well',
  };
}

/**
 * Extract competitor names from research output
 * Looks for competitor mentions in the research findings
 */
export function extractCompetitorNames(researchOutput: string): string[] {
  // Simple extraction - looks for "Competitor X:" patterns
  const matches = researchOutput.match(/(?:competitor|brand|company|player)[:\s]+([\w\s&-]+)/gi);
  return matches ? matches.map((m) => m.replace(/(?:competitor|brand|company|player)[:\s]+/i, '').trim()) : [];
}
