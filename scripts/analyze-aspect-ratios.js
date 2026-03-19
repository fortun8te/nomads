#!/usr/bin/env node

import { readFileSync, writeFileSync, openSync, readSync, closeSync } from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// PNG header parsing for dimensions
function getPNGDimensions(filePath) {
  const buffer = Buffer.alloc(24);
  const fd = openSync(filePath, 'r');
  readSync(fd, buffer, 0, 24, 0);
  closeSync(fd);

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function getAspectRatio(width, height) {
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;

  // Round to nearest common aspect ratio
  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 9/16) < 0.05) return '9:16';
  if (Math.abs(ratio - 16/9) < 0.05) return '16:9';
  if (Math.abs(ratio - 4/3) < 0.05) return '4:3';
  if (Math.abs(ratio - 3/4) < 0.05) return '3:4';
  return `${w}:${h}`;
}

// Read current manifest
const manifestPath = path.join(__dirname, 'public', 'ad-library', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Add aspect ratio to each image
const baseDir = path.join(__dirname, 'public', 'ad-library');

manifest.images = manifest.images.map(img => {
  const fullPath = path.join(baseDir, img.path);
  try {
    const dims = getPNGDimensions(fullPath);
    const aspectRatio = getAspectRatio(dims.width, dims.height);
    return { ...img, aspectRatio };
  } catch (e) {
    console.warn(`Could not read dimensions for ${img.path}: ${e.message}`);
    return { ...img, aspectRatio: '1:1' }; // Default to 1:1
  }
});

// Save updated manifest
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ Updated manifest with aspect ratios for ${manifest.images.length} images`);

// Print summary
const ratioCount = {};
manifest.images.forEach(img => {
  ratioCount[img.aspectRatio] = (ratioCount[img.aspectRatio] || 0) + 1;
});

console.log('Aspect ratio distribution:');
Object.entries(ratioCount).forEach(([ratio, count]) => {
  console.log(`  ${ratio}: ${count} images`);
});
