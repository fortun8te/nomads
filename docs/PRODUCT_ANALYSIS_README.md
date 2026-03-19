# Product Page Analysis Feature

Automated screenshot + vision + GLM analysis for product pages.

## What It Does

1. **Screenshot** — Takes viewport screenshot of any product page
2. **Vision Analysis** — Runs minicpm-v on screenshot to extract product data
3. **GLM Parsing** — Uses GLM to structure vision output into JSON
4. **Returns** — Ingredients, pricing, testimonials, guarantees, features, scents, social proof

## Infrastructure Requirements

Must be running:
- ✅ Ollama with `minicpm-v:8b` and `glm-4.7-flash:q4_K_M` models
- ✅ Wayfarer server (localhost:8889) with screenshot + scraping endpoints
- ✅ SearXNG in Docker (localhost:8888)

## Quick Start — Test on Simpletics

```bash
cd /Users/mk/Downloads/nomads

# Terminal 1: Start Wayfarer
SEARXNG_URL=http://localhost:8888 /opt/homebrew/bin/python3.11 -m uvicorn wayfarer_server:app --host 0.0.0.0 --port 8889

# Terminal 2: Run test
npx ts-node testProductAnalysis.ts "https://simpletics.com/products/salt-spray" "Sea Salt Spray"
```

## Example Output

```
📸 URL: https://simpletics.com/products/salt-spray
📦 Product: Sea Salt Spray

   [Product Analysis] Taking screenshot of https://simpletics.com/products/salt-spray...
   [Product Analysis] Running vision analysis on screenshot...
   [Product Analysis] Parsing vision output with GLM...
   [Product Analysis] Complete. Found: 5 ingredients, 3 pricing tiers, 2 testimonials

✅ ANALYSIS COMPLETE

📋 EXTRACTED DATA:
────────────────────────────────────────────────────────────

📝 Description:
The Simpletics Sea Salt Spray, your go-to for waves that are effortlessly beachy and textured...

💰 Pricing Tiers (3):
   • Single: $20.37 (15% off)
   • Duo MOST LOVED: $34.63 (28% off)
   • Trio BEST VALUE: $48.89 (32% off)

🧪 Ingredients (5):
   • Water
   • Essential Oil
   • Pink Himalayan Salt
   • Potassium Sorbate
   • Gum Arabic

⭐ Testimonials (2):
   "It smells SOOO good, and it works really good aswell..."
   — Connor Morgan - 5⭐

✅ Guarantees (1):
   • 30-day money-back guarantee

📊 Social Proof (2):
   • Happy Customers: 200,000+
   • Rating: 4.8 stars
```

## API Usage — Code

```typescript
import { analyzeProductPage } from './src/utils/wayfarer';

const result = await analyzeProductPage(
  'https://simpletics.com/products/salt-spray',
  'Sea Salt Spray',
  (msg) => console.log(msg),  // Progress callback
  signal                      // AbortSignal for cancellation
);

// Returns ProductPageAnalysis:
// {
//   url: string;
//   productName: string;
//   description?: string;
//   ingredients?: string[];
//   pricing?: { tier, price, discount }[];
//   testimonials?: { text, author, rating }[];
//   guarantees?: string[];
//   features?: string[];
//   scents?: string[];
//   brand_messaging?: string;
//   socialProof?: { metric, value }[];
//   visionRawOutput?: string;  // Full minicpm-v output
//   error?: string;
// }
```

## Use Cases

### 1. Competitor Analysis
```typescript
const competitors = [
  'https://www.based.co/products/texture-spray',
  'https://www.drugstore-brand.com/hair-spray',
];

for (const url of competitors) {
  const analysis = await analyzeProductPage(url, 'Hair Product');
  console.log(`${analysis.productName}: $${analysis.pricing?.[0].price}`);
}
```

### 2. Auto-Populate Presets
```typescript
const analysis = await analyzeProductPage(
  'https://simpletics.com/products/salt-spray',
  'Sea Salt Spray'
);

const preset = {
  product: {
    description: analysis.description,
    ingredients: analysis.ingredients,
    pricing: analysis.pricing,
    features: analysis.features,
    // ... etc
  },
  messaging: {
    testimonials: analysis.testimonials,
    brandTagline: analysis.brand_messaging,
  },
  // ... rest of preset
};
```

### 3. Market Research Pipeline
```typescript
// After web scraping finds 5 competitor URLs
const urls = wayfarerResult.sources.map(s => s.url).slice(0, 5);

// Analyze each with vision
const analyses = await Promise.all(
  urls.map(url => analyzeProductPage(url, 'Product', onProgress))
);

// Aggregate pricing, ingredients, features across market
const avgPrice = analyses
  .map(a => parseFloat(a.pricing?.[0].price || '0'))
  .reduce((a, b) => a + b) / analyses.length;
```

## Models Used

| Model | Purpose | Notes |
|-------|---------|-------|
| `minicpm-v:8b` | Vision analysis (screenshot) | Extracts product details from images |
| `glm-4.7-flash:q4_K_M` | Parsing vision output | Structures vision text into JSON |

## Troubleshooting

### "Screenshot failed: HTTP 500"
→ Wayfarer not running or endpoint issue
```bash
SEARXNG_URL=http://localhost:8888 /opt/homebrew/bin/python3.11 -m uvicorn wayfarer_server:app --host 0.0.0.0 --port 8889
```

### "Model not found: minicpm-v:8b"
→ Pull the model in Ollama
```bash
ollama pull minicpm-v:8b
```

### "GLM extraction failed"
→ Vision output may not have clean labels. Check `visionRawOutput` in result JSON.

### Timeout on large pages
→ Increase viewport or reduce quality:
```typescript
await analyzeProductPage(url, productName, progress, signal);
// Internally uses viewportWidth: 1280, quality: 70
```

## Future Improvements

- [ ] Parallel vision + text scraping (screenshot + HTML parse together)
- [ ] Multi-language support (detect language, translate prompts)
- [ ] Video extraction (if product page has demo video)
- [ ] Price history tracking (store results over time)
- [ ] Competitor matrix (auto-compare all found competitors)
- [ ] Reddit/forum sentiment analysis (combine with web scraping)

## Testing Checklist

When adding new functionality:

1. ✅ Screenshot: Can it handle different viewport sizes?
2. ✅ Vision: Does minicpm-v output clean labels?
3. ✅ GLM: Can it parse vision output consistently?
4. ✅ Error handling: What if page is behind auth/paywall?
5. ✅ Timeouts: What if screenshot takes >30s?
6. ✅ Empty data: What if product page has no pricing visible?
