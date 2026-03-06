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
  // Placeholder div with Nomad icon + label
  return `<div class="${cssClass}" style="width:100%;height:${height}px;background:linear-gradient(135deg,${accentColor}18,${accentColor}08);border:2px dashed ${accentColor}40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">
      <svg width="24" height="27" viewBox="0 0 167 189" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M82.32 1.52C85.27 1.69 87.94 2.13 90.36 3.24C92.65 4.3 94.62 5.93 96.36 8.35L96.71 8.84C98.5 11.49 99.44 14.62 99.41 17.82C99.4 23.41 97.07 26.78 94.03 29.49C92.57 30.8 90.9 31.99 89.33 33.17C87.73 34.37 86.17 35.6 84.76 37.08C81.49 40.51 79.05 44.86 78.16 49.45L78.07 49.89C76.64 58.18 77.6 65.01 82.25 71.87L82.57 72.33C89.36 81.79 101.33 86.06 112.6 83L112.61 83C113.92 82.65 115.19 82.12 116.53 81.51C117.83 80.92 119.25 80.22 120.68 79.65C123.6 78.47 126.88 77.65 130.82 78.65C134.06 79.46 136.48 80.77 138.29 82.48C140.09 84.18 141.19 86.2 141.91 88.32C142.63 90.43 142.99 92.66 143.28 94.81C143.58 96.99 143.81 99.05 144.25 101.01C145 104.26 146.33 107.34 148.18 110.11L148.42 110.46C149.66 112.18 151.33 113.74 153.22 115.32C155.17 116.96 157.45 118.69 159.4 120.49C161.38 122.32 163.2 124.38 164.33 126.88C165.47 129.41 165.87 132.3 165.12 135.7C164.21 139.89 161.46 143.65 157.91 146.06C154.35 148.47 149.85 149.62 145.41 148.36C142.31 147.48 139.98 146.24 138.23 144.66C136.46 143.07 135.36 141.2 134.61 139.18C133.88 137.19 133.49 135.04 133.16 132.88C132.83 130.67 132.58 128.48 132.11 126.21C131.49 123.25 130.38 120.41 128.82 117.82C125.02 111.61 118.93 107.15 111.87 105.38C104.61 103.62 96.96 104.85 90.62 108.78C84.31 112.71 79.86 119.01 78.25 126.26C75.93 136.33 78.8 147.04 86.81 153.47C87.67 154.16 88.53 154.82 89.39 155.48C90.24 156.14 91.09 156.79 91.91 157.46C93.53 158.78 95.08 160.18 96.33 161.78C98.92 165.09 100.16 169.11 98.89 174.83C97.8 179.7 94.3 183.11 90.36 185.47L90.27 185.52L90.17 185.56C89.13 186 88.06 186.36 86.96 186.64C80.95 188.22 75.08 186.33 71.24 181.47C68.87 178.48 67.96 175.3 67.42 172.19C67.15 170.66 66.97 169.07 66.76 167.58C66.54 166.05 66.3 164.57 65.91 163.1C61.85 147.83 45.54 139.25 30.61 144.29C29.13 144.79 27.72 145.45 26.2 146.14C24.71 146.81 23.12 147.52 21.43 148.01C13.1 150.55 4.49 145.57 2.14 137.33L2.03 136.94C-1.09 124.79 9.94 113.15 22.35 117.25C24.16 117.8 25.95 118.71 27.59 119.52C29.29 120.35 30.84 121.08 32.35 121.44C53.21 126.47 71.49 108.14 66.16 87.23C64.27 79.92 59.55 73.66 53.04 69.83C46.5 66.05 37.67 65.14 30.54 67.69C29.12 68.19 27.61 68.93 25.96 69.69C24.36 70.44 22.64 71.2 20.95 71.65C16.93 72.67 12.68 72.03 9.15 69.88C2.66 65.93 0.6 58.55 2.01 52.21C3.42 45.85 8.4 40.24 16.22 40.02L16.87 40.01C20.08 40.01 22.91 40.96 25.53 42.02C28.41 43.17 30.94 44.4 33.82 45.04L33.84 45.04L33.86 45.05C40.55 46.72 47.95 45.14 54.06 41.34C60.18 37.54 64.84 31.62 66.19 24.85L66.4 23.77C66.85 21.3 67.11 19.06 67.42 16.94C67.77 14.57 68.18 12.32 69.03 10.31C69.9 8.26 71.22 6.48 73.32 5C75.4 3.55 78.17 2.43 81.89 1.56L82.1 1.51L82.32 1.52Z" fill="${accentColor}" stroke="${accentColor}" stroke-width="3"/>
        <path d="M146.23 40.12C154.99 38.47 163.42 44.23 165.09 52.98C166.75 61.74 161.02 70.19 152.27 71.87C143.49 73.56 135.01 67.8 133.34 59.02C131.67 50.24 137.45 41.77 146.23 40.12Z" fill="${accentColor}" stroke="${accentColor}" stroke-width="3"/>
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
