# Research → Taste → Make Flow

## Overview
This demonstrates how campaign data flows through the autonomous ad creative system, from comprehensive brand brief to actual creative direction.

---

## 📊 STAGE 1: RESEARCH

### Input
**Campaign Brief** (from CampaignSelector form - 43 comprehensive sections):
- Brand: Upfront (clean skincare, transparent ingredients)
- Persona: Emma, The Conscious Skeptic (32-38, skeptical buyer, values transparency)
- Product: Vitamin C Brightening Serum (€65, hyperpigmentation solution)
- Goal: Drive trial conversions among skeptical clean beauty seekers

### Processing
```
Campaign Brief
    ↓
[useOllama hook + useCycleLoop]
    ↓
System Prompt (Expert Marketing Researcher)
    ↓
Research Prompt: "Brand: Upfront... Target Audience: Emma... Goal: Drive trial conversions..."
    ↓
Remote Ollama (qwen3:8b) @ https://regulatory-really-victorian-clips.trycloudflare.com
    ↓
Streaming Response (1,178 tokens)
```

### Output (Research Stage)

```
1. TARGET AUDIENCE PROFILE & PSYCHOGRAPHICS
   - Demographics: 32-38, urban professionals, €50k-200k income
   - Psychographics: Research-driven, values transparency & efficacy
   - Pain Points: Confusing ingredients, wasted money, skin sensitivity

2. MARKET TRENDS
   - Demand for transparency (anti-greenwashing)
   - Scientific backing required (clinical studies)
   - Sustainability focus
   - Education-first approach wins

3. COMPETITOR ANALYSIS
   - The Ordinary: Transparent but no sustainability
   - Herbivore: Eco-friendly but efficacy questioned
   - Biossance: Sustainability-focused, premium price
   - Upfront's advantage: Founder story + clinical proof + value pricing

4. EFFECTIVE MESSAGING ANGLES
   - "No hidden chemicals—just science-backed ingredients you can pronounce"
   - "Clinical studies show 40% brown spot reduction in 8 weeks"
   - "My skin reacted to 'natural' products—now I'm sharing what works"
   - "Clean beauty that's good for your skin AND the planet"
   - "Third-party tested, cruelty-free, fragrance-free"

5. KEY PAIN POINTS
   - Confusing ingredient lists
   - Wasted spending on ineffective products
   - Distrust in marketing ("natural" claims without proof)
   - Skin reactions from products marketed as "safe"

6. RECOMMENDED CHANNELS & FORMATS
   - Instagram/Facebook: Carousel ads with ingredient breakdowns
   - YouTube: Short-form tutorials on hyperpigmentation
   - Email: Educational guides ("How to Read Ingredient Labels")
   - Search: Target "clean vitamin C serum", "hyperpigmentation treatment"

7. OBJECTIONS TO ADDRESS
   - "Is it effective without expensive ingredients?" → Show clinical data
   - "How can I trust the brand?" → Certifications + founder story
   - "Worth the price?" → Cost-per-use math (€0.65 per application)
   - "Will it work for sensitive skin?" → Fragrance-free, hypoallergenic testing
```

**Duration:** ~30 seconds (streaming)
**Token Usage:** 1,178 tokens (≈1,500 words)

---

## 🎨 STAGE 2: TASTE (Creative Direction)

### Input
**Research Output** → Feeds into Taste stage

### Processing
```
Research Output
    ↓
"Based on this research: [1,178 tokens of research]... Define the creative direction"
    ↓
System Prompt (Creative Director specializing in visual/tonal brand identity)
    ↓
Remote Ollama (qwen3:8b)
    ↓
Streaming Response (Creative Direction)
```

### Expected Output (Taste Stage)

The AI will generate:

```
1. VISUAL STYLE
   - Minimalist (clean, not cluttered)
   - Modern (contemporary, not dated)
   - Scientific (lab aesthetics, ingredient clarity)
   - Warm (approachable, human, not sterile)

2. COLOR PALETTE
   - Sage green (primary): Conveys trust, growth, natural science
   - Cream (secondary): Approachable, soft, luxury-accessible
   - Charcoal (accent): Authority, sophistication, contrast
   - Why: Differentiates from pink/rose competitors

3. TONE OF VOICE
   - Honest (no marketing fluff)
   - Educational (explains, doesn't just sells)
   - Confident (science-backed)
   - Friendly (peer, not expert talking down)

4. TYPOGRAPHY
   - Primary: Clean sans-serif (Inter-style) = modern, approachable
   - Secondary: Courier or mono = scientific credibility, ingredient lists
   - Hierarchy: Large headings for key claims, smaller for ingredient detail

5. VISUAL METAPHORS & THEMES
   - Transparency theme: Glass bottles, ingredient clarity, scientific diagrams
   - Before/after: Real customer skin transformations (not airbrushed)
   - Ingredient focus: Close-ups of ingredients, molecular structures, sourcing stories
   - Founder visibility: Authentic founder in some content (builds trust)

6. AESTHETIC & VIBE
   - Scientific but not clinical
   - Luxury but accessible
   - Modern but timeless
   - Authoritative but warm

7. PLATFORM-SPECIFIC RECOMMENDATIONS
   - Instagram/Reels: Ingredient breakdowns, before/after, founder education
   - YouTube: Long-form educational (8-10 min), clinical study explanations
   - TikTok: Quick facts, debunking myths, trending sounds (but on-brand)
   - Pinterest: Ingredient guides, skincare routines, infographics
```

---

## ✨ STAGE 3: MAKE (Ad Concepts)

### Input
**Research Output** + **Taste Output** → Feeds into Make stage

### Processing
```
Research (market insights, angles, objections)
    +
Taste (visual direction, tone, aesthetic)
    ↓
"Based on creative direction: [taste output]... Describe 3 ad concepts"
    ↓
System Prompt (Creative Asset Generator)
    ↓
Remote Ollama (qwen3:8b)
    ↓
Streaming Response (Ad Concepts)
```

### Expected Output (Make Stage)

The AI will generate **3-5 ad concepts**:

```
AD CONCEPT 1: "The Transparency Angle"
Type: Instagram Carousel (5 slides)
Hook: "Every ingredient in this serum, explained" (text overlay on ingredient photo)
Slide 1: Ingredient photo with hook
Slide 2: "Why L-ascorbic acid 15%? [explanation + competitors at 10%]"
Slide 3: "Why ferulic acid? [stabilizer, synergy explanation]"
Slide 4: Before/after hyperpigmentation (real customer)
Slide 5: CTA "Learn more + get 60-day guarantee"
Copy Tone: Educational, confident, specific
Target Audience: Emma (research-driven, wants to understand)
Why It Works: Answers her core question: "Will this actually work?"

---

AD CONCEPT 2: "The Founder Story Angle"
Type: YouTube Short (15-30 sec) or TikTok
Hook: "I reacted to every 'natural' skincare product. Here's what I finally figured out."
Visual: Founder talking directly to camera (authenticity)
B-roll: Ingredient lab footage, serum being made
Message: "Found the formula that worked for MY sensitive skin. Here it is."
CTA: "Click to see the results our customers get"
Copy Tone: Vulnerable, honest, relatable
Target Audience: Emma (values founder story, skeptical of hype)
Why It Works: Builds trust through authenticity and empathy

---

AD CONCEPT 3: "The Clinical Data Angle"
Type: YouTube Pre-roll (6-15 sec) or Long-form (2 min)
Hook: "92% of users saw visible results in 30 days. Here's the data."
Visual: Animated charts, before/after photos, clinical study graphics
Message: "This isn't marketing. This is science."
Key Stat: "40% brown spot reduction in 8 weeks"
CTA: "Get the same results. Risk-free. 60-day money back."
Copy Tone: Authoritative, data-focused, confident
Target Audience: Emma (wants proof, skeptical of claims)
Why It Works: Appeals to her need for scientific validation

---

AD CONCEPT 4: "The Cost-Per-Use Angle"
Type: Instagram Feed / Reels
Hook: "You'll spend more on ONE dermatologist visit"
Visual: Simple math graphic
Message: "€65 = 100 applications = €0.65 per use
         Dermatologist = €200+ for one visit
         Choose wisely."
CTA: "See how quickly you'll see results"
Copy Tone: Practical, smart, value-focused
Target Audience: Emma (financially smart, sees ROI)
Why It Works: Removes the price objection through framing

---

AD CONCEPT 5: "The Objection-Handler Angle"
Type: FAQ/Educational Content
Questions It Answers:
- "Will it work for sensitive skin?" → Answer with ingredients + testing
- "How long until results?" → Week-by-week timeline
- "Is it greenwashing?" → Certifications + third-party testing
- "Why should I believe this?" → Founder story + clinical data
Copy Tone: Direct, honest, anticipating skepticism
Target Audience: Emma (objection-heavy, needs reassurance)
Why It Works: Removes all remaining barriers to purchase
```

---

## 🔄 Full Cycle Visualization

```
SAMPLE DATA (Campaign Brief)
    ↓
RESEARCH STAGE (30 sec, 1,178 tokens)
├─ Market insights ✓
├─ Audience analysis ✓
├─ Messaging angles ✓
├─ Competitor analysis ✓
└─ Objection handling ✓
    ↓
TASTE STAGE (20-30 sec, ~800 tokens)
├─ Visual direction ✓
├─ Color psychology ✓
├─ Tone of voice ✓
├─ Platform strategy ✓
└─ Creative metaphors ✓
    ↓
MAKE STAGE (30-40 sec, ~1,500+ tokens)
├─ Concept 1: Transparency ✓
├─ Concept 2: Founder Story ✓
├─ Concept 3: Clinical Data ✓
├─ Concept 4: Cost-Per-Use ✓
└─ Concept 5: Objection Handler ✓
    ↓
TEST STAGE (20 sec, ~400 tokens)
├─ Align with research? ✓
├─ Visual clarity? ✓
├─ Message resonance? ✓
├─ Platform fit? ✓
└─ Score each concept (1-10) ✓
    ↓
MEMORIES STAGE (20 sec, ~300 tokens)
├─ Key learnings ✓
├─ What worked ✓
├─ What to improve ✓
└─ Archive for next cycle ✓
    ↓
[Cycle complete, auto-loop to Cycle 2]
```

**Total Cycle Time:** ~2-3 minutes
**Total Tokens:** ~4,500 tokens (≈6,000 words of analysis + creative)

---

## 🚀 Integration Status

### ✅ Completed
- [x] Remote Ollama tunnel configured (Cloudflare)
- [x] Research stage tested & working
- [x] Model switched to qwen3:8b (available on your PC)
- [x] Sample campaign data created (Upfront skincare)
- [x] Build verified (no errors)
- [x] CampaignSelector form enhanced (43 sections)

### 🔄 Next Steps
1. **Run the full cycle** in the browser: Visit http://localhost:5173
2. **Create campaign** with sample data
3. **Click Start** to watch Research → Taste → Make execute
4. **See streaming output** in real-time
5. **Let it loop** continuously (or pause/resume)

---

## 📁 Files Created/Updated

```
✅ sample-campaign-data.json        → Real campaign brief for Upfront skincare
✅ test-research-stage.ts            → Standalone test script
✅ research-output.txt               → Output from Research stage
✅ research-output.json              → JSON version for pipeline
✅ src/utils/ollama.ts               → Updated to use qwen3:8b, remote URL
✅ src/hooks/useOllama.ts            → Updated error messaging
✅ src/components/CampaignSelector.tsx → 43 sections with detailed questions
✅ RESEARCH-TO-TASTE-FLOW.md          → This document
```

---

## 🎯 Key Insights

1. **Comprehensive Input = Better Output**
   - The 43-section form captures all variables the AI needs
   - No detail is wasted (vacations, hobby hobbies, spending patterns all matter)

2. **Each Stage Builds on Previous**
   - Research discovers what works
   - Taste defines HOW it looks/feels
   - Make generates WHAT to build
   - Test evaluates SHOULD WE build it
   - Memories archives learnings for continuous improvement

3. **Remote Ollama Works Great**
   - Your PC's Ollama accessible via Cloudflare tunnel
   - Streaming works seamlessly
   - qwen3:8b provides quality output for marketing research

4. **Autonomous Loop = Continuous Iteration**
   - After Memories, automatically starts Cycle 2
   - Can run 24/7 generating fresh creative ideas
   - Each cycle learns from previous (if Memories implemented)

---

## 💡 What's Actually Happening

When you click **Start** in the dashboard:

1. Campaign data goes into **useCycleLoop hook**
2. For each stage, it builds a prompt combining:
   - System prompt (expert marketing researcher/creative director/etc)
   - Campaign data (brand, audience, product, goal)
   - Previous stage outputs (e.g., Research output → fed to Taste)
3. Sends to remote Ollama via HTTPS
4. Receives streaming response
5. Displays in **StagePanel** component in real-time
6. Saves to IndexedDB (persists across reloads)
7. Auto-advances to next stage
8. Loops forever until manually paused

**No magic. Just smart prompt engineering + streaming AI.**

---

## ✨ Future Enhancements

1. **Memories stage implementation** → Learn from past cycles
2. **Make stage MCP integration** → Actually generate images (Figma/Midjourney)
3. **Test stage Vision LLM** → Evaluate generated creatives
4. **A/B testing orchestration** → Test concepts, keep winners
5. **Performance feedback loop** → Tie actual ad performance back to system
