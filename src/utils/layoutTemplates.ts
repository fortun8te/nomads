/**
 * HTML Layout Templates for Ad Concepts
 *
 * Direct HTML generation (no MJML compilation needed).
 * GLM selects and customizes these based on ad format + hook angle + aspect ratio.
 *
 * Aspect Ratios:
 * - "1:1" = 400x400px (square, social media feed)
 * - "4:5" = 400x500px (tall, Instagram/TikTok native)
 * - "9:16" = 360x640px (vertical, mobile)
 * - "16:9" = 640x360px (landscape, YouTube/web)
 */

type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

function getAspectRatioDimensions(aspect: AspectRatio): { width: number; height: number } {
  const dims: Record<AspectRatio, { width: number; height: number }> = {
    '1:1': { width: 400, height: 400 },
    '4:5': { width: 400, height: 500 },
    '9:16': { width: 360, height: 640 },
    '16:9': { width: 640, height: 360 }
  };
  return dims[aspect];
}

/**
 * Smart image rendering: if URL is a real URL (http/data:), render <img>.
 * Otherwise render a styled placeholder div that clearly shows where the image goes.
 */
function imageHtml(url: string, label: string, height: number, accentColor: string, cssClass: string): string {
  const isRealUrl = /^(https?:\/\/|data:)/.test(url);
  if (isRealUrl) {
    return `<img src="${url}" alt="${label}" class="${cssClass}" style="width:100%;height:${height}px;object-fit:cover;display:block;">`;
  }
  // Placeholder div with icon + label
  return `<div class="${cssClass}" style="width:100%;height:${height}px;background:linear-gradient(135deg,${accentColor}18,${accentColor}08);border:2px dashed ${accentColor}40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span style="font-size:10px;font-weight:600;color:${accentColor};text-transform:uppercase;letter-spacing:0.1em;opacity:0.8;">${label}</span>
    </div>`;
}

export const layoutTemplates = {
  // Template 1: Hero + CTA (best for: static image ads, attention-grabbing)
  heroCTA: (data: {
    heroImageUrl: string;
    headline: string;
    bodyText: string;
    ctaText: string;
    backgroundColor: string;
    accentColor: string;
    textColor?: string;
    fontFamily?: string;
    aspectRatio?: AspectRatio;
  }) => {
    const dims = getAspectRatioDimensions(data.aspectRatio || '1:1');
    const heroHeight = dims.height * 0.5;
    const font = data.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const textColor = data.textColor || '#1a1a1a';

    const heroImg = imageHtml(data.heroImageUrl, 'Hero Image', heroHeight, data.accentColor, 'hero');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${font}; background: ${data.backgroundColor}; }
    .container { width: ${dims.width}px; height: ${dims.height}px; margin: 0 auto; background: white; display: flex; flex-direction: column; overflow: hidden; }
    .content { flex: 1; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; }
    h1 { font-size: 18px; font-weight: 700; color: ${textColor}; margin-bottom: 8px; line-height: 1.2; }
    p { font-size: 13px; color: #666; line-height: 1.4; margin-bottom: 12px; flex: 1; }
    .cta { background: ${data.accentColor}; color: white; padding: 10px 16px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    ${heroImg}
    <div class="content">
      <div>
        <h1>${data.headline}</h1>
        <p>${data.bodyText}</p>
      </div>
      <button class="cta">${data.ctaText}</button>
    </div>
  </div>
</body>
</html>`;
  },

  // Template 2: Feature Highlights (best for: multi-benefit products, feature-focused)
  features3Column: (data: {
    headline: string;
    feature1: string;
    feature2: string;
    feature3: string;
    ctaText: string;
    accentColor: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    aspectRatio?: AspectRatio;
  }) => {
    const dims = getAspectRatioDimensions(data.aspectRatio || '1:1');
    const font = data.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const textColor = data.textColor || '#1a1a1a';
    const bgColor = data.backgroundColor || '#f9f9f9';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${font}; background: ${bgColor}; }
    .container { width: ${dims.width}px; height: ${dims.height}px; margin: 0 auto; background: white; display: flex; flex-direction: column; overflow: hidden; }
    .header { padding: 16px 12px; text-align: center; }
    h1 { font-size: 16px; font-weight: 700; color: ${textColor}; }
    .features { flex: 1; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 0 12px 12px 12px; }
    .feature { text-align: center; padding: 8px 4px; border: 1px dashed ${data.accentColor}30; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
    .icon { width: 32px; height: 32px; background: ${data.accentColor}15; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .icon svg { width: 16px; height: 16px; }
    .feature-text { font-size: 10px; color: #666; line-height: 1.3; }
    .cta-section { padding: 12px; }
    .cta { background: ${data.accentColor}; color: white; padding: 8px 16px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 11px; width: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.headline}</h1>
    </div>
    <div class="features">
      <div class="feature">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="${data.accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="feature-text">${data.feature1}</div>
      </div>
      <div class="feature">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="${data.accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="feature-text">${data.feature2}</div>
      </div>
      <div class="feature">
        <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="${data.accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="feature-text">${data.feature3}</div>
      </div>
    </div>
    <div class="cta-section">
      <button class="cta">${data.ctaText}</button>
    </div>
  </div>
</body>
</html>`;
  },

  // Template 3: Before-After (best for: transformation, social proof, results-driven)
  beforeAfter: (data: {
    headline: string;
    beforeImageUrl: string;
    afterImageUrl: string;
    beforeLabel: string;
    afterLabel: string;
    ctaText: string;
    accentColor: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    aspectRatio?: AspectRatio;
  }) => {
    const dims = getAspectRatioDimensions(data.aspectRatio || '1:1');
    const font = data.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const textColor = data.textColor || '#1a1a1a';
    const bgColor = data.backgroundColor || '#f9f9f9';
    const imgHeight = Math.max(100, dims.height * 0.35);

    const beforeImg = imageHtml(data.beforeImageUrl, 'Before', imgHeight, '#ef4444', 'image');
    const afterImg = imageHtml(data.afterImageUrl, 'After', imgHeight, '#22c55e', 'image');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${font}; background: ${bgColor}; }
    .container { width: ${dims.width}px; height: ${dims.height}px; margin: 0 auto; background: white; display: flex; flex-direction: column; overflow: hidden; }
    .header { padding: 12px 10px; text-align: center; }
    h1 { font-size: 14px; font-weight: 700; color: ${textColor}; }
    .comparison { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 10px; align-items: center; }
    .col { text-align: center; }
    .label { font-weight: 600; color: #666; font-size: 10px; margin-bottom: 4px; }
    .cta-section { padding: 10px; }
    .cta { background: ${data.accentColor}; color: white; padding: 8px 16px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 11px; width: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.headline}</h1>
    </div>
    <div class="comparison">
      <div class="col">
        <div class="label">${data.beforeLabel}</div>
        ${beforeImg}
      </div>
      <div class="col">
        <div class="label">${data.afterLabel}</div>
        ${afterImg}
      </div>
    </div>
    <div class="cta-section">
      <button class="cta">${data.ctaText}</button>
    </div>
  </div>
</body>
</html>`;
  },

  // Template 4: Testimonial + Social Proof (best for: trust-building, high market sophistication)
  testimonial: (data: {
    quote: string;
    authorName: string;
    authorRole: string;
    result: string;
    ctaText: string;
    accentColor: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    aspectRatio?: AspectRatio;
  }) => {
    const dims = getAspectRatioDimensions(data.aspectRatio || '1:1');
    const font = data.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const textColor = data.textColor || '#1a1a1a';
    const bgColor = data.backgroundColor || '#f5f5f5';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${font}; background: ${bgColor}; }
    .container { width: ${dims.width}px; height: ${dims.height}px; margin: 0 auto; background: white; display: flex; flex-direction: column; overflow: hidden; }
    .content { flex: 1; padding: 16px 12px; display: flex; flex-direction: column; justify-content: space-between; }
    .quote { font-size: 12px; font-style: italic; color: ${textColor}; line-height: 1.4; margin-bottom: 8px; flex: 1; }
    .author { font-weight: 600; color: ${textColor}; font-size: 11px; margin-bottom: 2px; }
    .role { font-size: 10px; color: #999; margin-bottom: 8px; }
    .divider { border-top: 1px solid #eee; margin-bottom: 8px; }
    .result { font-size: 10px; font-weight: 600; color: ${data.accentColor}; margin-bottom: 8px; }
    .cta { background: ${data.accentColor}; color: white; padding: 8px 16px; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 11px; width: 100%; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <div>
        <p class="quote">"${data.quote}"</p>
        <p class="author">${data.authorName}</p>
        <p class="role">${data.authorRole}</p>
        <div class="divider"></div>
        <p class="result">⭐⭐⭐⭐⭐ ${data.result}</p>
      </div>
      <button class="cta">${data.ctaText}</button>
    </div>
  </div>
</body>
</html>`;
  },
};

/**
 * Template Selection Logic
 *
 * Maps hook angles + formats to best-fit templates
 */
export function selectTemplate(hookAngle: string, adFormat: string): keyof typeof layoutTemplates {
  const mapping: Record<string, Record<string, keyof typeof layoutTemplates>> = {
    'before-after': { 'static image': 'beforeAfter', 'carousel': 'beforeAfter', 'video testimonial': 'beforeAfter' },
    'social-proof': { 'static image': 'testimonial', 'carousel': 'features3Column', 'video testimonial': 'testimonial' },
    'authority': { 'static image': 'testimonial', 'carousel': 'features3Column', 'video testimonial': 'testimonial' },
    'pain-agitate-solution': { 'static image': 'heroCTA', 'carousel': 'beforeAfter', 'video testimonial': 'heroCTA' },
    'curiosity': { 'static image': 'heroCTA', 'carousel': 'features3Column', 'video testimonial': 'heroCTA' },
    'urgency': { 'static image': 'heroCTA', 'carousel': 'features3Column', 'video testimonial': 'heroCTA' },
    'lifestyle': { 'static image': 'heroCTA', 'carousel': 'features3Column', 'video testimonial': 'heroCTA' },
    'scarcity': { 'static image': 'heroCTA', 'carousel': 'features3Column', 'video testimonial': 'heroCTA' },
    'exclusivity': { 'static image': 'heroCTA', 'carousel': 'features3Column', 'video testimonial': 'heroCTA' },
  };

  return mapping[hookAngle]?.[adFormat] || 'heroCTA';
}

export type LayoutTemplate = keyof typeof layoutTemplates;
export type AspectRatioType = '1:1' | '4:5' | '9:16' | '16:9';
