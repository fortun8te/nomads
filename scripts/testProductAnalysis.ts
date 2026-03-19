#!/usr/bin/env node

/**
 * Test harness for product analysis + competitor intelligence
 *
 * Usage:
 *   npx tsx testProductAnalysis.ts analyze <URL> <product-name>      # Single product
 *   npx tsx testProductAnalysis.ts crawl <domain>                    # Discover products
 *   npx tsx testProductAnalysis.ts competitor <brand-name>           # Full autonomous analysis
 *
 * Examples:
 *   npx tsx testProductAnalysis.ts analyze "https://basedbodyworks.com/products/sea-salt-spray" "Sea Salt Spray"
 *   npx tsx testProductAnalysis.ts crawl "basedbodyworks.com"
 *   npx tsx testProductAnalysis.ts competitor "Based Bodyworks"
 *   npx tsx testProductAnalysis.ts competitor "Simpletics"
 */

import {
  analyzeProductPage,
  siteCrawler,
  batchAnalyzeProducts,
  analyzeCompetitor,
} from './src/utils/wayfarer';
import type { ProductPageAnalysis } from './src/types';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const command = args[0];

if (!command || !['analyze', 'crawl', 'competitor'].includes(command)) {
  console.error('Usage:');
  console.error('  npx tsx testProductAnalysis.ts analyze <URL> <product-name>');
  console.error('  npx tsx testProductAnalysis.ts crawl <domain>');
  console.error('  npx tsx testProductAnalysis.ts competitor <brand-name>');
  console.error('\nExamples:');
  console.error('  npx tsx testProductAnalysis.ts analyze "https://basedbodyworks.com/products/sea-salt-spray" "Sea Salt Spray"');
  console.error('  npx tsx testProductAnalysis.ts crawl "basedbodyworks.com"');
  console.error('  npx tsx testProductAnalysis.ts competitor "Based Bodyworks"');
  process.exit(1);
}

function printProduct(result: ProductPageAnalysis) {
  if (result.error) {
    console.error(`   ❌ Error: ${result.error}`);
    return;
  }

  console.log('   📋 EXTRACTED DATA:');
  console.log('   ' + '─'.repeat(60));

  if (result.description) console.log(`\n   📝 Description:\n   ${result.description}`);
  if (result.brand_messaging) console.log(`\n   🎯 Brand Messaging:\n   ${result.brand_messaging}`);

  if (result.ingredients?.length) {
    console.log(`\n   🧪 Ingredients (${result.ingredients.length}):`);
    result.ingredients.forEach((ing) => console.log(`      • ${ing}`));
  }

  if (result.features?.length) {
    console.log(`\n   ⭐ Features (${result.features.length}):`);
    result.features.forEach((feat) => console.log(`      • ${feat}`));
  }

  if (result.scents?.length) {
    console.log(`\n   🌸 Scents (${result.scents.length}):`);
    result.scents.forEach((scent) => console.log(`      • ${scent}`));
  }

  if (result.pricing?.length) {
    console.log(`\n   💰 Pricing (${result.pricing.length}):`);
    result.pricing.forEach((tier) => {
      const discount = tier.discount ? ` (${tier.discount} off)` : '';
      console.log(`      • ${tier.tier}: ${tier.price}${discount}`);
    });
  }

  if (result.testimonials?.length) {
    console.log(`\n   💬 Testimonials (${result.testimonials.length}):`);
    result.testimonials.forEach((t) => {
      const rating = t.rating ? ` - ${t.rating}⭐` : '';
      console.log(`      "${t.text}"\n      — ${t.author}${rating}`);
    });
  }

  if (result.guarantees?.length) {
    console.log(`\n   ✅ Guarantees (${result.guarantees.length}):`);
    result.guarantees.forEach((g) => console.log(`      • ${g}`));
  }

  if (result.socialProof?.length) {
    console.log(`\n   📊 Social Proof (${result.socialProof.length}):`);
    result.socialProof.forEach((s) => console.log(`      • ${s.metric}: ${s.value}`));
  }
}

(async () => {
  try {
    // ═══════════════════════════════════════════════════════
    // COMMAND: analyze — Single product page
    // ═══════════════════════════════════════════════════════
    if (command === 'analyze') {
      const [, url, productName] = args;
      if (!url || !productName) {
        console.error('Usage: npx tsx testProductAnalysis.ts analyze <URL> <product-name>');
        process.exit(1);
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║           SINGLE PRODUCT ANALYSIS                           ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
      console.log(`📸 URL: ${url}`);
      console.log(`📦 Product: ${productName}\n`);

      const result = await analyzeProductPage(
        url,
        productName,
        (msg) => console.log(`   ${msg}`),
        undefined
      );

      console.log('\n✅ ANALYSIS COMPLETE\n');
      printProduct(result);

      const outputFile = path.join(process.cwd(), `product-analysis-${Date.now()}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`\n   📄 JSON saved: ${outputFile}\n`);
    }

    // ═══════════════════════════════════════════════════════
    // COMMAND: crawl — Discover product pages on a domain
    // ═══════════════════════════════════════════════════════
    else if (command === 'crawl') {
      const domain = args[1];
      if (!domain) {
        console.error('Usage: npx tsx testProductAnalysis.ts crawl <domain>');
        process.exit(1);
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║           SITE CRAWLER — PRODUCT DISCOVERY                  ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
      console.log(`🌐 Domain: ${domain}\n`);

      const products = await siteCrawler(
        domain,
        (msg) => console.log(`   ${msg}`),
        undefined
      );

      console.log('\n✅ CRAWL COMPLETE\n');
      console.log(`📦 Products Found: ${products.length}\n`);

      for (const p of products) {
        console.log(`   • ${p.name}`);
        console.log(`     ${p.url}`);
      }

      const outputFile = path.join(process.cwd(), `crawl-${domain.replace(/\./g, '-')}-${Date.now()}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(products, null, 2));
      console.log(`\n📄 JSON saved: ${outputFile}\n`);
    }

    // ═══════════════════════════════════════════════════════
    // COMMAND: competitor — Full autonomous analysis
    // ═══════════════════════════════════════════════════════
    else if (command === 'competitor') {
      const brandName = args.slice(1).join(' ');
      if (!brandName) {
        console.error('Usage: npx tsx testProductAnalysis.ts competitor <brand-name>');
        process.exit(1);
      }

      console.log('\n╔══════════════════════════════════════════════════════════════╗');
      console.log('║           COMPETITOR PRODUCT INTELLIGENCE                   ║');
      console.log('╚══════════════════════════════════════════════════════════════╝\n');
      console.log(`🏢 Brand: ${brandName}\n`);

      const intel = await analyzeCompetitor(
        brandName,
        (msg) => console.log(`   ${msg}`),
        undefined
      );

      console.log('\n' + '═'.repeat(64));
      console.log('                   INTELLIGENCE REPORT');
      console.log('═'.repeat(64) + '\n');

      console.log(`🏢 Brand: ${intel.brand}`);
      console.log(`🌐 Domain: ${intel.domain}`);
      console.log(`📦 Products Found: ${intel.summary.totalProducts}`);
      console.log(`👁️  Vision Analyzed: ${intel.visionAnalyzed}`);
      console.log(`⏱️  Elapsed: ${(intel.elapsed / 1000).toFixed(1)}s`);

      if (intel.error) {
        console.error(`\n❌ Error: ${intel.error}`);
      }

      if (intel.summary.priceRange) console.log(`\n💰 Price Range: ${intel.summary.priceRange}`);
      if (intel.summary.avgPrice) console.log(`💰 Avg Price: ${intel.summary.avgPrice}`);

      if (intel.summary.commonFeatures?.length) {
        console.log(`\n⭐ Common Features:`);
        intel.summary.commonFeatures.forEach(f => console.log(`   • ${f}`));
      }

      if (intel.summary.commonIngredients?.length) {
        console.log(`\n🧪 Common Ingredients:`);
        intel.summary.commonIngredients.forEach(i => console.log(`   • ${i}`));
      }

      if (intel.summary.guarantees?.length) {
        console.log(`\n✅ Guarantees:`);
        intel.summary.guarantees.forEach(g => console.log(`   • ${g}`));
      }

      if (intel.summary.socialProofHighlights?.length) {
        console.log(`\n📊 Social Proof:`);
        intel.summary.socialProofHighlights.forEach(s => console.log(`   • ${s}`));
      }

      if (intel.summary.brandPositioning) {
        console.log(`\n🎯 Brand Positioning:\n   ${intel.summary.brandPositioning}`);
      }

      // Per-product details
      console.log('\n' + '─'.repeat(64));
      console.log('              INDIVIDUAL PRODUCT ANALYSES');
      console.log('─'.repeat(64));

      for (const product of intel.products) {
        console.log(`\n📦 ${product.productName}`);
        console.log(`   ${product.url}`);
        printProduct(product);
      }

      const outputFile = path.join(
        process.cwd(),
        `competitor-intel-${brandName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`
      );
      fs.writeFileSync(outputFile, JSON.stringify(intel, null, 2));
      console.log(`\n📄 Full intelligence saved: ${outputFile}\n`);
    }

    console.log('═'.repeat(64) + '\n');
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error}\n`);
    process.exit(1);
  }
})();
