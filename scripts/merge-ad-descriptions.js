#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CATEGORIES = [
  'template',
  'before-after',
  'comparison',
  'deals-offers',
  'social-proof',
  'problem-solution',
  'testimonial',
  'lifestyle',
  'features-benefits',
  'product-hero',
];

const descriptions = [];
let totalAnalyzed = 0;
let totalFailed = 0;

for (const category of CATEGORIES) {
  const tmpFile = join(__dirname, `tmp-${category}.json`);

  if (!existsSync(tmpFile)) {
    console.log(`⏳ Skipping ${category} (not yet completed)`);
    continue;
  }

  try {
    const content = readFileSync(tmpFile, 'utf-8');
    const data = JSON.parse(content);

    // Handle both formats: direct array or { descriptions: [...] }
    const items = Array.isArray(data) ? data : (data.descriptions || []);

    if (items.length > 0) {
      descriptions.push(...items);
      totalAnalyzed += items.length;
      console.log(`✅ ${category}: ${items.length} images`);
    }
  } catch (err) {
    console.error(`❌ Error reading ${tmpFile}:`, err.message);
  }
}

// Write merged file
const outputDir = join(__dirname, 'public', 'ad-library');
const outputFile = join(outputDir, 'descriptions.json');
const output = {
  descriptions,
  totalAnalyzed,
  totalFailed,
  lastUpdated: Date.now(),
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, JSON.stringify(output, null, 2));

console.log(`\n📦 Merged ${descriptions.length}/${totalAnalyzed} descriptions into descriptions.json`);
console.log(`📍 Output: ${outputFile}`);

if (descriptions.length === 248) {
  console.log(`✨ All 248 images analyzed and ready!`);
} else {
  console.log(`⏳ ${248 - descriptions.length} images still pending...`);
}
