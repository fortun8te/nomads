/**
 * Make Stage: Generate CUSTOM Ad Concepts
 *
 * Qwen generates fully bespoke HTML ad layouts (no template constraints):
 * - Different hook angles (from unused competitive angles)
 * - Different emotional drivers + conversion psychology
 * - Smart color/font selection from competitor analysis
 * - Conversion-optimized elements (urgency, social proof, CTAs)
 * - Responsive, full-screen capable HTML
 * - 3 completely different formats (not variations on same template)
 */

import type {
  Campaign,
  TasteFindings,
  CompetitorAdIntelligence,
  AdConcept,
  MakeOutput,
} from '../types';
import { ollamaService } from './ollama';

// ───────────────────────────────────────────────────────────────────
// Constants: Ad aspect ratios for responsive layouts (for future use)
// ───────────────────────────────────────────────────────────────────
// TODO: Use for responsive MJML generation per dimension
// const ASPECT_RATIOS = {
//   square: { ratio: '1:1', width: 1080, height: 1080, name: 'Square (1:1)' },
//   vertical: { ratio: '9:16', width: 1080, height: 1920, name: 'Vertical (9:16)' },
//   landscape: { ratio: '16:9', width: 1920, height: 1080, name: 'Landscape (16:9)' },
//   pinterest: { ratio: '4:5', width: 1000, height: 1250, name: 'Pin-style (4:5)' },
// };

// ───────────────────────────────────────────────────────────────────
// Helper: Extract styling from competitor ads
// ───────────────────────────────────────────────────────────────────

interface ExtractedStyling {
  dominantColors: string[];
  fontPreferences: string[];
  colorPalettes: Array<{ primary: string; secondary: string }>;
}

function extractCompetitorStyling(competitorAds: CompetitorAdIntelligence): ExtractedStyling {
  const colors = new Set<string>();
  const fonts = new Set<string>();

  // Extract colors from competitor ad metadata
  if (competitorAds.competitors && Array.isArray(competitorAds.competitors)) {
    for (const competitor of competitorAds.competitors) {
      if (competitor.adExamples && Array.isArray(competitor.adExamples)) {
        for (const example of competitor.adExamples) {
          if (example.visualAnalysis) {
            // Extract colors mentioned in visual analysis
            const colorMatches = example.visualAnalysis.match(/#[0-9A-Fa-f]{6}|rgb\([^)]+\)|\b(red|blue|green|orange|purple|pink|yellow|black|white|gray|brown)\b/gi);
            if (colorMatches) {
              colorMatches.forEach(c => colors.add(c));
            }
            // Extract fonts
            const fontMatches = example.visualAnalysis.match(/(serif|sans-serif|monospace|script|geometric|system|helvetica|georgia|arial|verdana)/gi);
            if (fontMatches) {
              fontMatches.forEach(f => fonts.add(f.toLowerCase()));
            }
          }
        }
      }
    }
  }

  return {
    dominantColors: Array.from(colors).slice(0, 5),
    fontPreferences: Array.from(fonts).slice(0, 3),
    colorPalettes: [
      { primary: '#ff6b35', secondary: '#f5f5f5' }, // Orange default
      { primary: '#2d7a3a', secondary: '#f0f5f1' }, // Green default
      { primary: '#1a5f7a', secondary: '#f0f7fa' }, // Blue default
    ]
  };
}

// ───────────────────────────────────────────────────────────────────
// Helper: Generate field suggestions based on template
// ───────────────────────────────────────────────────────────────────

interface FieldSuggestions {
  templateType: string;
  fields: Record<string, string>;
  colorScheme: { primary: string; secondary: string; text: string };
  fontFamily: string;
}

async function suggestTemplateFields(
  hookAngle: string,
  competitorAds: CompetitorAdIntelligence,
  tasteFindings: TasteFindings,
  campaign: Campaign,
  signal?: AbortSignal
): Promise<FieldSuggestions> {
  const styling = extractCompetitorStyling(competitorAds);

  // Parse brand colors from campaign (extract hex codes)
  const brandColorHexes: string[] = [];
  if (campaign.brandColors) {
    const hexMatches = campaign.brandColors.match(/#[0-9A-Fa-f]{6}/g);
    if (hexMatches) brandColorHexes.push(...hexMatches);
  }

  // Parse brand font preference from campaign
  let brandFont = 'system';
  if (campaign.brandFonts) {
    const fontStr = campaign.brandFonts.toLowerCase();
    if (fontStr.includes('playfair') || fontStr.includes('script') || fontStr.includes('luxury')) brandFont = 'script';
    else if (fontStr.includes('montserrat') || fontStr.includes('geometric') || fontStr.includes('bold')) brandFont = 'geometric';
    else if (fontStr.includes('georgia') || fontStr.includes('serif') || fontStr.includes('classic')) brandFont = 'serif';
    else if (fontStr.includes('mono') || fontStr.includes('courier') || fontStr.includes('technical')) brandFont = 'mono';
  }

  // Brand colors take priority over competitor colors and taste colors
  const primaryColor = brandColorHexes[0] || tasteFindings.recommendedColors[0] || styling.dominantColors[0] || '#ff6b35';
  const secondaryColor = brandColorHexes[1] || styling.colorPalettes[0]?.secondary || '#f5f5f5';
  const textColor = brandColorHexes[2] || tasteFindings.recommendedColors[1] || '#1a1a1a';
  const availableColors = brandColorHexes.length > 0 ? brandColorHexes.join(', ') : (styling.dominantColors.join(', ') || '#ff6b35');
  const availableFonts = brandFont !== 'system' ? brandFont : (styling.fontPreferences.length > 0 ? styling.fontPreferences.join(', ') : 'system, serif, geometric');

  // Design system values for custom HTML generation
  const fieldPrompt = `For hook angle "${hookAngle}" on ${campaign.brand}, suggest key design field values.

BRAND: ${campaign.brand}
PRODUCT: ${campaign.productDescription}
HOOK_ANGLE: ${hookAngle}

Return ONLY these fields (each on new line):
FEATURE_1: [key benefit 1]
FEATURE_2: [key benefit 2]
FEATURE_3: [key benefit 3]
URGENCY_MESSAGE: [optional scarcity/urgency signal]
SOCIAL_PROOF: [e.g. "200k+ customers" or "4.8★ rated"]
PRIMARY_COLOR: [hex color from: ${availableColors}]
FONT_STYLE: [from: ${availableFonts}]`;

  let suggestions = {
    beforeImageDesc: 'Before treatment',
    afterImageDesc: 'After results',
    feature1: tasteFindings.recommendedCopyAngles[0] || 'Quality ingredients',
    feature2: tasteFindings.recommendedCopyAngles[1] || 'Proven results',
    feature3: tasteFindings.recommendedCopyAngles[2] || 'Customer satisfaction',
    quote: 'This product changed my life!',
    author: 'Sarah M.',
    primaryColor,
    fontStyle: brandFont,
  };

  try {
    const response = await ollamaService.generateStream(
      fieldPrompt,
      'Suggest field values for ad template',
      { signal }
    );

    // Parse GLM response
    const lines = response.split('\n');
    for (const line of lines) {
      if (line.startsWith('BEFORE_IMAGE_DESC:')) {
        suggestions.beforeImageDesc = line.replace('BEFORE_IMAGE_DESC:', '').trim();
      } else if (line.startsWith('AFTER_IMAGE_DESC:')) {
        suggestions.afterImageDesc = line.replace('AFTER_IMAGE_DESC:', '').trim();
      } else if (line.startsWith('FEATURE_1:')) {
        suggestions.feature1 = line.replace('FEATURE_1:', '').trim();
      } else if (line.startsWith('FEATURE_2:')) {
        suggestions.feature2 = line.replace('FEATURE_2:', '').trim();
      } else if (line.startsWith('FEATURE_3:')) {
        suggestions.feature3 = line.replace('FEATURE_3:', '').trim();
      } else if (line.startsWith('QUOTE:')) {
        suggestions.quote = line.replace('QUOTE:', '').trim();
      } else if (line.startsWith('AUTHOR:')) {
        suggestions.author = line.replace('AUTHOR:', '').trim();
      } else if (line.startsWith('PRIMARY_COLOR:')) {
        const color = line.replace('PRIMARY_COLOR:', '').trim();
        if (color.match(/#[0-9A-Fa-f]{6}/)) {
          suggestions.primaryColor = color;
        }
      } else if (line.startsWith('FONT_STYLE:')) {
        suggestions.fontStyle = line.replace('FONT_STYLE:', '').trim();
      }
    }
  } catch (err) {
    // Use defaults if GLM fails
    console.warn('Field suggestion failed, using defaults:', err);
  }

  return {
    templateType: 'custom',
    fields: {
      beforeImageDesc: suggestions.beforeImageDesc,
      afterImageDesc: suggestions.afterImageDesc,
      feature1: suggestions.feature1,
      feature2: suggestions.feature2,
      feature3: suggestions.feature3,
      quote: suggestions.quote,
      author: suggestions.author,
    },
    colorScheme: {
      primary: suggestions.primaryColor,
      secondary: secondaryColor,
      text: textColor,
    },
    fontFamily: suggestions.fontStyle,
  };
}

// ───────────────────────────────────────────────────────────────────
// Step 1: Generate ad concept prompt for GLM
// ───────────────────────────────────────────────────────────────────

function buildMakePrompt(
  campaign: Campaign,
  tasteFindings: TasteFindings,
  competitorAds: CompetitorAdIntelligence,
  conceptNumber: 1 | 2 | 3
): string {
  const unusedAngles = competitorAds.industryPatterns.unusedAngles;
  const validEmotions = competitorAds.industryPatterns.commonEmotionalDrivers;
  const dominantHooks = competitorAds.industryPatterns.dominantHooks;

  // Pick the Nth unused angle (to ensure 3 different concepts)
  const selectedAngle = unusedAngles[conceptNumber - 1] || unusedAngles[0] || 'social-proof';
  const selectedEmotion = validEmotions[conceptNumber % validEmotions.length] || 'aspiration';

  return `You are a senior creative director designing an ad concept for:

BRAND: ${campaign.brand}
PRODUCT: ${campaign.productDescription}
TARGET AUDIENCE: ${campaign.targetAudience}
${campaign.brandColors ? `BRAND COLORS: ${campaign.brandColors}` : ''}
${campaign.brandFonts ? `BRAND FONTS: ${campaign.brandFonts}` : ''}

FROM TASTE STAGE (Creative Direction):
- Brand Voice: ${tasteFindings.brandVoice}
- Colors: ${tasteFindings.recommendedColors.join(', ')}
- Tone: ${tasteFindings.brandTone}
- Positioning: ${tasteFindings.positioning}
- Visual Style: ${tasteFindings.visualStyle}
- Copy Angles: ${tasteFindings.recommendedCopyAngles.join(', ')}

FROM COMPETITOR INTELLIGENCE (Phase 3):
- Unused Hook Angles (OPPORTUNITY): ${unusedAngles.join(', ')}
- Validated Emotional Drivers: ${validEmotions.join(', ')}
- Saturated Hooks (AVOID): ${dominantHooks.join(', ')}
- Ad Formats in Use: ${competitorAds.industryPatterns.dominantFormats.join(', ')}

CONCEPT #${conceptNumber} SPECIFICATIONS:
- Hook Angle: ${selectedAngle} (use this specifically)
- Emotional Driver: ${selectedEmotion} (target this feeling)
- Format: ${tasteFindings.adFormats[conceptNumber % tasteFindings.adFormats.length] || 'static image'}
- Brand Voice: ${tasteFindings.brandVoice}

TASK: Create a complete ad concept that:
1. Uses the SPECIFIC hook angle (${selectedAngle})
2. Targets the SPECIFIC emotional driver (${selectedEmotion})
3. Differentiates from saturated hooks (avoid: ${dominantHooks.join(', ')})
4. Matches the brand voice and visual style
5. Includes compelling copy that resonates with the target audience

Output format:
---CONCEPT #${conceptNumber}---
HOOK_ANGLE: ${selectedAngle}
EMOTIONAL_DRIVER: ${selectedEmotion}
HEADLINE: [One-line headline, attention-grabbing, 6-10 words max]
BODY: [2-3 sentences of ad copy, conversational, benefit-focused]
CTA: [Button text, 2-3 words, action-oriented]
OFFER: [If applicable, e.g. "30% off" or "Free shipping", else write "None"]
AD_FORMAT: ${tasteFindings.adFormats[conceptNumber % tasteFindings.adFormats.length] || 'static image'}
VISUAL_DIRECTION: [Specific visual composition, colors, mood, e.g. "Hero product + lifestyle background, bold typography overlay"]
RATIONALE: [2-3 sentences explaining why this hook + emotion + visual combo works]
MJML: [Valid MJML markup for the ad layout - see template below]

MJML TEMPLATE (customize colors, copy, images):
<mjml>
  <mj-body background-color="#f5f5f5">
    <mj-section background-color="#FFFFFF">
      <mj-column>
        <mj-image width="100%" height="400px" src="[INSERT_HERO_IMAGE_URL]" alt="${campaign.brand}" />
        <mj-text font-size="24px" font-weight="bold" color="#000">
          [INSERT_HEADLINE_HERE]
        </mj-text>
        <mj-text color="#333" font-size="14px" line-height="1.5">
          [INSERT_BODY_HERE]
        </mj-text>
        <mj-button background-color="${tasteFindings.recommendedColors[0] || '#FF6B35'}" href="[INSERT_LANDING_URL]">
          [INSERT_CTA_HERE]
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>

Remember: The MJML must be valid, compilable markup. Replace placeholders with actual content.`;
}

// ───────────────────────────────────────────────────────────────────
// Step 2: GLM generates 3 ad concepts
// ───────────────────────────────────────────────────────────────────

async function generateAdConcepts(
  campaign: Campaign,
  tasteFindings: TasteFindings,
  competitorAds: CompetitorAdIntelligence,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<AdConcept[]> {
  const concepts: AdConcept[] = [];

  onProgress('   Generating 3 ad concepts with smart field suggestions...\n\n');

  for (const conceptNum of [1, 2, 3] as const) {
    if (signal?.aborted) break;

    onProgress(`   Concept #${conceptNum}: `);

    try {
      const prompt = buildMakePrompt(campaign, tasteFindings, competitorAds, conceptNum);

      const response = await ollamaService.generateStream(
        prompt,
        'You are an expert ad creative director. Generate compelling, differentiated ad concepts.',
        { signal }
      );

      // Parse response
      const concept = parseAdConcept(response, conceptNum, tasteFindings);
      if (concept) {
        // Get smart field suggestions for this template (brand colors/fonts take priority)
        const fieldSuggestions = await suggestTemplateFields(
          concept.hookAngle,
          competitorAds,
          tasteFindings,
          campaign,
          signal
        );

        // Generate CUSTOM HTML with Qwen — bespoke, conversion-optimized
        const conceptNumber = concepts.length + 1;
        concept.html = await generateCustomAdHTML(
          concept,
          fieldSuggestions,
          campaign,
          competitorAds,
          conceptNumber,
          signal
        );

        concepts.push(concept);
        onProgress(`✓ ${concept.hookAngle} (${concept.emotionalDriver}) [${fieldSuggestions.fontFamily}]\n`);
      } else {
        onProgress(`✗ Failed to parse\n`);
      }
    } catch (err) {
      onProgress(`✗ Error: ${err}\n`);
    }
  }

  return concepts;
}

// ───────────────────────────────────────────────────────────────────
// Step 3: Parse GLM response into AdConcept
// ───────────────────────────────────────────────────────────────────

function parseAdConcept(
  response: string,
  conceptNum: 1 | 2 | 3,
  tasteFindings: TasteFindings
): AdConcept | null {
  const lines = response.split('\n').map((l) => l.trim());
  const concept: Partial<AdConcept> = {
    conceptNumber: conceptNum,
    colors: tasteFindings.recommendedColors,
  };

  for (const line of lines) {
    if (line.startsWith('HOOK_ANGLE:')) {
      concept.hookAngle = line.replace('HOOK_ANGLE:', '').trim();
    } else if (line.startsWith('EMOTIONAL_DRIVER:')) {
      concept.emotionalDriver = line.replace('EMOTIONAL_DRIVER:', '').trim();
    } else if (line.startsWith('HEADLINE:')) {
      concept.headline = line.replace('HEADLINE:', '').trim();
    } else if (line.startsWith('BODY:')) {
      concept.body = line.replace('BODY:', '').trim();
    } else if (line.startsWith('CTA:')) {
      concept.cta = line.replace('CTA:', '').trim();
    } else if (line.startsWith('OFFER:')) {
      const offer = line.replace('OFFER:', '').trim();
      if (offer.toLowerCase() !== 'none') {
        concept.offer = offer;
      }
    } else if (line.startsWith('AD_FORMAT:')) {
      concept.adFormat = line.replace('AD_FORMAT:', '').trim();
    } else if (line.startsWith('VISUAL_DIRECTION:')) {
      concept.visualDirection = line.replace('VISUAL_DIRECTION:', '').trim();
    } else if (line.startsWith('RATIONALE:')) {
      concept.rationale = line.replace('RATIONALE:', '').trim();
    } else if (line.startsWith('MJML:')) {
      // MJML is multiline, capture from here to end
      const mjmlIdx = response.indexOf('MJML:');
      if (mjmlIdx !== -1) {
        const mjmlContent = response.substring(mjmlIdx + 5).trim();
        // Extract MJML block (between <mjml> tags)
        const mjmlMatch = mjmlContent.match(/<mjml>[\s\S]*?<\/mjml>/);
        if (mjmlMatch) {
          concept.mjml = mjmlMatch[0];
        }
      }
    }
  }

  // Validate required fields
  if (
    !concept.hookAngle ||
    !concept.emotionalDriver ||
    !concept.headline ||
    !concept.body ||
    !concept.cta ||
    !concept.mjml
  ) {
    return null;
  }

  return concept as AdConcept;
}

// ───────────────────────────────────────────────────────────────────
// Step 4: Generate CUSTOM HTML (Qwen creates bespoke layouts)
// ───────────────────────────────────────────────────────────────────

async function generateCustomAdHTML(
  concept: AdConcept,
  fieldSuggestions: FieldSuggestions,
  campaign: Campaign,
  competitorIntel: CompetitorAdIntelligence,
  conceptNumber: number,
  signal?: AbortSignal
): Promise<string> {
  try {
    // Build context about what makes this ad unique
    const unusedAngles = competitorIntel.industryPatterns?.unusedAngles || [];
    const dominantEmotions = competitorIntel.industryPatterns?.commonEmotionalDrivers || [];

    const prompt = `You are a high-converting ad designer. Generate a FULLY CUSTOM HTML ad layout (no templates).

CAMPAIGN: ${campaign.brand} - ${campaign.productDescription}
HOOK ANGLE: "${concept.hookAngle}" (unused in industry — opportunity!)
EMOTIONAL DRIVER: "${concept.emotionalDriver}"
HEADLINE: "${concept.headline}"
BODY: "${concept.body}"
CTA: "${concept.cta}"

DESIGN SYSTEM:
- Primary Color: ${fieldSuggestions.colorScheme.primary}
- Secondary Color: ${fieldSuggestions.colorScheme.secondary}
- Text Color: ${fieldSuggestions.colorScheme.text}
- Font: ${fieldSuggestions.fontFamily}

COMPETITOR INTELLIGENCE:
- Unused angles (YOUR opportunity): ${unusedAngles.slice(0, 3).join(', ')}
- Common emotions competitors use: ${dominantEmotions.slice(0, 3).join(', ')}
- You should avoid their patterns — differentiate!

CONVERSION OPTIMIZATION RULES:
1. HOOK FIRST: Start with attention-grabbing element (contrast, movement, scarcity, curiosity)
2. CLARITY: Main message visible in first 0.5 seconds (headline + subheader max)
3. PROOF: Include at least one proof element (stats, testimonial badge, media features, social proof count)
4. URGENCY: Subtle scarcity signal if applicable ("Only X left", "Limited time", "Join YK")
5. CTA: Prominent, high-contrast button. Make it CLICKABLE (use <button> tag)
6. RESPONSIVE: Use max-width container (320px mobile to 1200px desktop)
7. NO PLACEHOLDER TEXT: Use real content from concept data

AD CONCEPT #${conceptNumber} — Format Variation:
${conceptNumber === 1 ? 'STATIC HERO: Big hero image with overlay text + CTA' : conceptNumber === 2 ? 'PROOF STACK: Testimonial + stats + features in vertical stack' : 'URGENCY CAROUSEL: Multi-step reveal (problem → solution → proof → action)'}

Generate ONLY the HTML/CSS, no explanation. Make it production-ready, modern, and high-converting.

<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    [YOUR CUSTOM CSS HERE — be creative, use modern design patterns]
  </style>
</head>
<body>
  [YOUR CUSTOM LAYOUT HERE]
</body>
</html>`;

    const html = await ollamaService.generateStream(
      prompt,
      'Generate custom HTML ad layouts. Be creative. Prioritize conversion.',
      { model: 'gpt-oss:20b', signal }
    );

    // Validate HTML looks reasonable
    if (html.includes('<html') && html.includes('</html>')) {
      return html;
    }

    // Fallback if generation failed
    return fallbackCustomHTML(concept, fieldSuggestions);
  } catch (err) {
    console.warn('Custom HTML generation failed:', err);
    return fallbackCustomHTML(concept, fieldSuggestions);
  }
}

// Fallback simple layout when custom generation fails
function fallbackCustomHTML(concept: AdConcept, fieldSuggestions: FieldSuggestions): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fieldSuggestions.fontFamily}; background: linear-gradient(135deg, ${fieldSuggestions.colorScheme.secondary}, ${fieldSuggestions.colorScheme.primary}20); min-height: 100vh; }
    .container { display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
    .ad { background: white; border-radius: 12px; padding: 40px; max-width: 500px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); text-align: center; }
    h1 { font-size: 32px; color: ${fieldSuggestions.colorScheme.primary}; margin-bottom: 16px; font-weight: 700; line-height: 1.2; }
    p { font-size: 16px; color: #666; margin-bottom: 24px; line-height: 1.6; }
    .cta { background: ${fieldSuggestions.colorScheme.primary}; color: white; border: none; padding: 14px 28px; font-size: 16px; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%; transition: opacity 0.2s; }
    .cta:hover { opacity: 0.9; transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class="container">
    <div class="ad">
      <h1>${concept.headline}</h1>
      <p>${concept.body}</p>
      <button class="cta">${concept.cta}</button>
    </div>
  </div>
</body>
</html>`;
}

// ───────────────────────────────────────────────────────────────────
// Main export: generateAdConcepts
// ───────────────────────────────────────────────────────────────────

export async function generateMakeConcepts(
  campaign: Campaign,
  tasteFindings: TasteFindings,
  competitorAds: CompetitorAdIntelligence,
  onProgress: (msg: string) => void,
  signal?: AbortSignal
): Promise<MakeOutput> {
  const startTime = Date.now();

  if (signal?.aborted) {
    return {
      concepts: [],
      adDimensions: campaign.adDimensions || ['1:1', '9:16'],
      processingTime: 0,
    };
  }

  onProgress(
    '════════════════════════════════════════════════════════════════════\n'
  );
  onProgress('[MAKE] Generating Ad Concepts\n');
  onProgress(
    '════════════════════════════════════════════════════════════════════\n\n'
  );

  // Default dimensions if not specified
  const dimensions = campaign.adDimensions || ['1:1', '9:16'];
  onProgress(`   Aspect ratios: ${dimensions.join(', ')}\n\n`);

  // Generate 3 concepts
  const concepts = await generateAdConcepts(
    campaign,
    tasteFindings,
    competitorAds,
    onProgress,
    signal
  );

  // For each concept, generate MJML variants for each dimension
  // Future: could generate responsive MJML for each dimension
  // for (const concept of concepts) { ... }

  onProgress(`\n   Generated ${concepts.length} ad concepts\n`);

  const processingTime = Date.now() - startTime;
  onProgress(`   Elapsed: ${Math.round(processingTime / 1000)}s\n`);

  return {
    concepts,
    adDimensions: dimensions,
    processingTime,
  };
}
