# Subagent Examples — Real Workflow Scenarios

This guide shows real-world examples of how to use subagents in the nomads pipeline.

---

## Example 1: Parallel Researcher Pattern

### Scenario
You're researching a collagen supplement product. The orchestrator decides it needs 3 research angles:
1. Customer complaints and objections
2. Competitor pricing and positioning
3. Market trends and growth

Instead of researching these sequentially (60s), spawn 3 researchers in parallel (~25s).

### Code

```typescript
// In orchestratorAgent (Phase 2A)

const manager = createSubagentManager();

const researchTopics = [
  {
    id: 'researcher-objections',
    role: 'researcher' as const,
    task: 'Find customer objections to collagen supplements',
    context: `Product: Collagen supplement
Brand: Our brand focuses on joint health and anti-aging.
Target: Women 35-55, health-conscious, willing to spend $50-100/month.`,
    input: JSON.stringify([
      'collagen supplement side effects',
      'collagen supplement complaints Reddit',
      'why people return collagen supplements',
      'collagen vs other supplements comparison',
    ]),
    signal,
  },
  {
    id: 'researcher-pricing',
    role: 'researcher' as const,
    task: 'Find competitor pricing and positioning',
    context: `Product: Collagen supplement
Brand: Our brand focuses on joint health and anti-aging.`,
    input: JSON.stringify([
      'collagen supplement prices 2024 2025',
      'best collagen supplements market leaders',
      'collagen brand positioning messaging',
      'collagen supplement pricing strategy',
    ]),
    signal,
  },
  {
    id: 'researcher-trends',
    role: 'researcher' as const,
    task: 'Find market trends and growth',
    context: `Product: Collagen supplement
Brand: Our brand focuses on joint health and anti-aging.`,
    input: JSON.stringify([
      'collagen supplement market growth 2024 2025',
      'trending collagen product formats',
      'collagen supplement statistics market size',
      'collagen supplement emerging trends',
    ]),
    signal,
  },
];

// Spawn all 3 researchers
onChunk?.(`[Orchestrator] Spawning 3 researchers in parallel...\n`);
const researcherPromises = researchTopics.map(topic => manager.spawn(topic));

// Wait for all to complete (wall clock: ~25s instead of 60s)
const researcherResults = await Promise.all(researcherPromises);

// Check results
researcherResults.forEach((result, i) => {
  if (result.status === 'success') {
    onChunk?.(`[Researcher ${i}] ✓ Complete: ${result.tokensUsed} tokens, ${result.durationMs}ms\n`);
    onChunk?.(`Findings preview: ${result.output.slice(0, 150)}...\n`);
  } else {
    onChunk?.(`[Researcher ${i}] ✗ ${result.status}: ${result.error}\n`);
  }
});

// Compile findings
const allFindings = researcherResults
  .filter(r => r.status === 'success')
  .map(r => r.output)
  .join('\n---\n');
```

### Output in ResearchOutput.tsx

```
[Research Output]
├─ Phase 2 — Web Research Orchestration
│  └─ Iteration 1
│     ├─ [blue] Orchestrator Decision
│     │  └─ "Need: objections, pricing, trends"
│     │
│     ├─ [teal] Researchers Spawned (3 parallel)
│     │  ├─ Researcher 1 (objections) — ⏳ 8s elapsed
│     │  ├─ Researcher 2 (pricing) — ⏳ 6s elapsed
│     │  └─ Researcher 3 (trends) — ⏳ 12s elapsed
│     │
│     ├─ [teal] Researcher 1 Complete ✓
│     │  └─ 1240 tokens | 22.1s
│     │     [FINDINGS]
│     │     Key Objections:
│     │     - Price: $60/month too expensive for results [Source: reddit.com/r/fitness]
│     │     - Efficacy: "Tried for 3 months, no difference" [Source: amazon.com/reviews]
│     │
│     ├─ [teal] Researcher 2 Complete ✓
│     │  └─ 1180 tokens | 19.7s
│     │     [FINDINGS]
│     │     Competitor Pricing:
│     │     - Brand A: $59.99/mo | Claims: "Medical-grade collagen"
│     │     - Brand B: $49.99/mo | Claims: "Lowest price, best quality"
│     │
│     └─ [teal] Researcher 3 Complete ✓
│        └─ 1320 tokens | 25.3s
│           [FINDINGS]
│           Market Trends:
│           - Collagen market growing 8.7% CAGR 2024-2030 [Source: mordorresearch.com]
```

---

## Example 2: Validation After Research

### Scenario
After running web research iterations, the orchestrator wants to validate coverage. Spawn a Validator subagent to check:
- Are all 10 dimensions covered adequately?
- What gaps remain?
- What should we research next?

### Code

```typescript
// After N research iterations, before moving to next stage

const allResearchFindings = compiledResearchOutput;  // All findings so far

const validationPrompt = `Check coverage across these dimensions:
1. market_size_trends
2. competitor_analysis
3. customer_objections
4. emerging_trends
5. regional_differences
6. pricing_strategies
7. channel_effectiveness
8. brand_positioning_gaps
9. psychological_triggers
10. media_consumption_patterns

For each dimension:
- Is it covered? (yes/partial/no)
- Confidence level (0-100)
- What's missing?
- What should we research next?

Research findings so far:
${allResearchFindings}`;

const validatorResult = await manager.spawn({
  id: 'validator-1',
  role: 'validator',
  task: 'Validate coverage across 10 dimensions',
  context: buildOrchestratorBrandContext(campaign),
  input: validationPrompt,
  signal,
});

if (validatorResult.status === 'success') {
  onChunk?.(`[Validator] Coverage assessment:\n${validatorResult.output}\n`);

  // Parse gaps from validator output
  const gaps = parseValidatorGaps(validatorResult.output);

  // Decide: continue research or stop?
  if (gaps.length > 2 && iterationCount < maxIterations) {
    // Spawn new researchers for gap topics
    onChunk?.(`[Orchestrator] Found ${gaps.length} gaps, continuing research...\n`);
  } else {
    onChunk?.(`[Orchestrator] Coverage sufficient (${gaps.length} minor gaps), moving to next stage\n`);
  }
}
```

### Validator Output Example

```
[VALIDATION]
Dimension: market_size_trends
Covered: yes
Confidence: 85
Evidence: Found 3 sources with market projections ($4.2B in 2024, 8.7% CAGR)

[VALIDATION]
Dimension: competitor_analysis
Covered: partial
Confidence: 60
Gaps: Limited data on smaller regional brands; ad spend estimates unavailable
Recommendations:
- "Top collagen brands market share"
- "Regional collagen supplement brands"

[VALIDATION]
Dimension: psychological_triggers
Covered: no
Confidence: 15
Gaps: No research on emotional/identity drivers
Recommendations:
- "Why women buy collagen supplements psychology"
- "Collagen supplement customer motivation"

[VALIDATION]
Dimension: media_consumption_patterns
Covered: partial
Confidence: 55
Gaps: Limited TikTok/Instagram data
Recommendations:
- "Collagen supplement ads TikTok trends"
- "Beauty influencers collagen supplements"
```

---

## Example 3: Analyzer for Pattern Extraction

### Scenario
You have raw research findings and want to extract deep insights (not just data summary).
Spawn an Analyzer to find:
- What patterns connect the objections?
- What's the root cause?
- What's the opportunity?

### Code

```typescript
// After web research, before moving to objections stage

const analyzerResult = await manager.spawn({
  id: 'analyzer-1',
  role: 'analyzer',
  task: 'Extract deep patterns and insights from research',
  context: `Product: Collagen supplement
Target: Women 35-55, health-conscious
Current stage: Analysis of customer objections`,
  input: `Research findings:
${allResearchFindings}

Analyze for:
1. Root cause connections (why do these objections exist?)
2. Psychological patterns (what's really driving hesitation?)
3. Opportunity gaps (where competitors miss the mark)
4. Messaging angles (how to overcome each objection)`,
  signal,
});

console.log(analyzerResult.output);
```

### Analyzer Output Example

```
[ANALYSIS]
Insight: Price objections mask efficacy skepticism
Evidence:
- 45% cite price as primary reason for not buying
- But 78% who tried mention "didn't see results" as REAL reason
- "Too expensive" is what people SAY, but "doesn't work" is why they leave
Implication: Can't just drop price. Must prove efficacy first. Price objection dissolves once efficacy proven.
Confidence: high

[ANALYSIS]
Insight: Customer comparison trap
Evidence:
- Supplement market trained buyers to compare on: price, reviews, "medical grade" claims
- Collagen market following same pattern
- But collagen efficacy takes 3-6 months (vs 1 week for energy supplements)
- So buyers comparing apples-to-oranges (using 1-month reviews for 3-month product)
Implication: Reframe buying window. "3-month commitment" messaging. Or: "See results in 30 days" (show specific changes)
Confidence: medium

[ANALYSIS]
Insight: Identity opportunity
Evidence:
- Successful collagen brands lean into "beauty from within", "ageless", "joint health for active lifestyle"
- Our research found zero messaging around "functional beauty" for over-35 women
- Competitors position as "anti-aging" (fear-based) or "fitness" (male-coded)
Implication: Own "confident aging" positioning. Appeal to identity: "Women who choose their own aging story"
Confidence: high
```

---

## Example 4: Synthesizer for Bulk Compression

### Scenario
You have 25 web pages of research and need to compress them into a coherent summary with coverage tracking.

### Code

```typescript
// Compress batch of pages into synthesis

const pagesToSynthesize = [
  { url: 'reddit.com/r/fitness/...', content: '... 3000 chars ...' },
  { url: 'amazon.com/reviews/...', content: '... 4000 chars ...' },
  { url: 'healthline.com/...', content: '... 5000 chars ...' },
  // ... 22 more pages
];

const synthesisInput = pagesToSynthesize
  .map(p => `[${p.url}]\n${p.content}`)
  .join('\n---\n');

const synthResult = await manager.spawn({
  id: 'synthesizer-bulk',
  role: 'synthesizer',
  task: 'Merge 25 pages into coherent summary',
  context: `Product: Collagen supplement
Focus: Customer experience, objections, market positioning`,
  input: synthesisInput,
  signal,
});

console.log(synthResult.output);
```

### Synthesizer Output

```
[SYNTHESIS]
Topic: Collagen Supplement Market & Customer Experience

Merged Findings:
- Price range: $30-100/month, most popular $50-70 [Sources: amazon, trustpilot, official websites]
- Top objections: Cost (45%), inefficacy (35%), side effects (10%), taste (5%) [Sources: reddit, reviews, forums]
- Efficacy claims: 3-6 month timeline for visible results [Sources: healthline, medical sources, brand sites]
- Market growth: 8.7% CAGR 2024-2030, projected $4.2B by 2025 [Sources: mordor, coherent, grand view research]
- Top brands: Brand A (43% market share), Brand B (18%), Brand C (12%) [Sources: industry reports]

Coverage:
✓ Customer objections: 95% (high confidence)
✓ Pricing landscape: 90% (good data)
✓ Market size/growth: 85% (multiple sources)
⚠ Competitor positioning: 65% (only surface analysis)
⚠ Emotional drivers: 40% (minimal data)
✗ Media consumption: 10% (almost no data)

Gaps:
- "Where do customers discover collagen? (ads, influencers, word-of-mouth?)"
- "What emotional benefits resonate most?"
- "How do regional markets differ?"
- "What's the viral/social angle?"

[/SYNTHESIS]
```

---

## Example 5: Strategist for Creative Direction

### Scenario
After research is complete, spawn a Strategist to extract strategic positioning angles from findings.

### Code

```typescript
// After all research complete, before Angles stage

const strategyResult = await manager.spawn({
  id: 'strategist-1',
  role: 'strategist',
  task: 'Extract strategic positioning and creative opportunities',
  context: `Product: Collagen supplement
Brand: Focused on joint health and anti-aging for women 35-55
Research complete: Have full market, competitor, and customer data`,
  input: `Complete research findings:
${allResearchFindings}

Identify:
1. Brand positioning gaps (what competitors miss)
2. Emotional white space (what feelings aren't addressed)
3. Functional differentiators (product angles)
4. Creative opportunities (unique ways to frame)
5. Audience segments (who might respond best)`,
  signal,
});

console.log(strategyResult.output);
```

### Strategist Output

```
[STRATEGY]
Opportunity: "Confident aging" identity positioning
Evidence:
- Competitors focus on "anti-aging" (fear-based, age-denial) or "athletic" (narrow)
- Our research: target audience resists "anti-aging" messaging, wants to "age on her terms"
- Emotional gap: no brand owns "comfortable in your own evolving skin"
Recommended Angle: "Choose your own aging story" | "Aging as a choice, not a loss"
Differentiation: Position collagen as tool for agency, not fear management
Risk: Niche positioning, may limit reach to mainstream market
[/STRATEGY]

[STRATEGY]
Opportunity: Reframe efficacy timeline
Evidence:
- Primary objection: "Doesn't work" (but tested for only 1 month on a 3-6 month product)
- Competitors use "see results in 30 days" (unsubstantiated)
- Our research: Real results visible at weeks 8-12, best at 12-16 weeks
Recommended Angle: "3-month commitment challenge" | "Track your transformation" | "Real results, real timeline"
Differentiation: Honest about timing, but frame as "commitment journey" not "long wait"
Risk: Might deter impatient buyers, but increases retention/satisfaction
[/STRATEGY]

[STRATEGY]
Opportunity: Segment by use case (not just demographics)
Evidence:
- Research shows 3 distinct customer archetypes:
  1. Joint health seekers (athletes, active)
  2. Beauty seekers (skin/hair/nails)
  3. Holistic health seekers (integrative medicine)
- All buy collagen, but for different reasons
- All use different language
Recommended Angle: Create 3 messaging tracks:
  - "Mobility & strength" for active segment
  - "Beauty from within" for aesthetic segment
  - "Whole-body health" for wellness segment
Differentiation: Multi-targeting vs competitor's one-size-fits-all
Risk: Higher creative cost, but much higher relevance per segment
[/STRATEGY]
```

---

## Example 6: Evaluator for Concept Scoring

### Scenario
After brainstorming 20 ad concepts, use an Evaluator to score and rank them against criteria.

### Code

```typescript
// After Make stage (concept generation), before Test stage

const concepts = [
  {
    name: 'Concept A: Confidence Journey',
    hook: 'Women owning their age',
    target: 'Identity-driven',
    rationale: 'Positions collagen as agency, not fear',
  },
  {
    name: 'Concept B: Joint Health Proof',
    hook: 'Athlete mobility gains',
    target: 'Functional benefit',
    rationale: 'Shows concrete performance improvement',
  },
  // ... 18 more concepts
];

const evaluatorResult = await manager.spawn({
  id: 'evaluator-concepts',
  role: 'evaluator',
  task: 'Score and rank ad concepts',
  context: `Product: Collagen supplement
Target: Women 35-55, health-conscious, $50-100/month budget
Research insights: Price objections mask efficacy skepticism; identity-based positioning is gap`,
  input: `Evaluate these concepts against criteria:

Concepts to evaluate:
${concepts.map(c => `- ${c.name}: "${c.hook}" (${c.target})`).join('\n')}

Score each on:
1. Desire activation (1-10) — does it activate a deep desire?
2. Objection handling (1-10) — does it address key objections?
3. Differentiation (1-10) — is it unique vs competitors?
4. Audience resonance (1-10) — does it speak their language?
5. Creative execution (1-10) — can it be made visually?
6. Longevity (1-10) — will this age well or feel dated soon?

Provide:
- Scores per dimension
- Total score (average)
- Ranking
- Recommendation (lead/test/skip)
- A/B testing pairs (which 2 concepts to test against each other)`,
  signal,
});

console.log(evaluatorResult.output);
```

### Evaluator Output

```
[EVALUATION]
Concept: A — Confidence Journey
Scores:
  Desire activation: 9
  Objection handling: 6
  Differentiation: 9
  Audience resonance: 8
  Creative execution: 8
  Longevity: 8
Total: 8.0

Recommendation: LEAD
Notes: Strong on positioning novelty and emotional resonance. Doesn't directly address efficacy objection.
Suggest pairing with proof elements (before/after, testimonials).

[/EVALUATION]

[EVALUATION]
Concept: B — Joint Health Proof
Scores:
  Desire activation: 6
  Objection handling: 9
  Differentiation: 5
  Audience resonance: 7
  Creative execution: 7
  Longevity: 6
Total: 6.7

Recommendation: TEST
Notes: Solid on addressing efficacy objection (good for skeptics). Less unique positioning.
Good secondary angle for segments that prioritize joint health (athletes).

[/EVALUATION]

[EVALUATION]
Concept: C — Beauty From Within
Scores:
  Desire activation: 8
  Objection handling: 7
  Differentiation: 6
  Audience resonance: 8
  Creative execution: 9
  Longevity: 7
Total: 7.5

Recommendation: TEST
Notes: Strong execution potential, resonates with beauty-focused segment.
Good A/B pair with Concept A (identity-based vs benefit-based).

[/EVALUATION]

RANKING:
1. Concept A (8.0) — LEAD for main campaign
2. Concept C (7.5) — TEST as secondary (beauty segment)
3. Concept B (6.7) — TEST as tertiary (joint health segment)
4. [Other concepts...]

A/B TEST PAIRS:
- Pair 1: Concept A (confidence identity) vs Concept C (beauty identity)
  - Tests: Which identity angle wins?
- Pair 2: Concept A (vs Concept B (proof + functional)
  - Tests: Emotional vs rational appeal
```

---

## Example 7: Full Cycle with Subagents

### Scenario
Complete research cycle with subagents enabled at Normal (NR) preset.

### Timeline and Output

```
[Research Stage]

Preset: Normal (NR) — Subagents ENABLED
├─ enableSubagentResearch: true
├─ enableSubagentValidation: true
├─ maxResearcherSubagents: 3
└─ Estimated time with subagents: 55 min vs 90 min without

PHASE 1 — Desire-Driven Analysis (4 steps)
├─ Step 1: Deep Desires (GLM) — 8.2s, 420 tokens
├─ Step 2: Objections (GLM) — 7.1s, 380 tokens
├─ Step 3: Audience Language (GLM) — 9.3s, 510 tokens
└─ Step 4: Competitor Landscape (GLM) — 8.9s, 470 tokens
PHASE 1 TOTAL: 33.5s, 1,780 tokens

PHASE 2 — Web Research Orchestration
├─ Iteration 1 (Orchestrator)
│  ├─ [0:05] Orchestrator Decision: "objections, pricing, trends" — 4.2s, 210 tokens
│  ├─ [0:09] Spawning 3 Researchers (parallel)
│  │  ├─ Researcher A: objections — 22.1s, 1,240 tokens ✓
│  │  ├─ Researcher B: pricing — 19.7s, 1,180 tokens ✓
│  │  └─ Researcher C: trends — 25.3s, 1,320 tokens ✓
│  │  PARALLEL TIME: 25.3s (vs 67s sequential)
│  ├─ [0:34] Synthesizer: Merge findings — 18.2s, 1,890 tokens ✓
│  ├─ [0:52] Validator: Check coverage — 14.1s, 850 tokens ✓
│  │  └─ Coverage: 75% | Gaps: psychological_triggers, media_consumption
│  └─ ITERATION 1 TOTAL: 61.3s, 7,690 tokens
│
├─ Iteration 2 (Orchestrator)
│  ├─ [0:53] Orchestrator: "Need emotional drivers, social/influencer angle"
│  ├─ [0:57] Spawning 2 Researchers (parallel)
│  │  ├─ Researcher D: emotions — 20.4s, 1,100 tokens ✓
│  │  └─ Researcher E: influencers/social — 23.1s, 1,250 tokens ✓
│  │  PARALLEL TIME: 23.1s (vs 43s sequential)
│  ├─ [1:20] Synthesizer: Merge all findings — 16.9s, 1,760 tokens ✓
│  ├─ [1:36] Validator: Final coverage check — 13.2s, 820 tokens ✓
│  │  └─ Coverage: 92% | All dimensions covered
│  └─ ITERATION 2 TOTAL: 52.1s, 6,140 tokens
│
└─ PHASE 2 TOTAL: 113.4s / ~1.9 min, 13,830 tokens

PHASE 1 + 2 TOTAL: 146.9s / ~2.45 min, 15,610 tokens
(vs 5.5 min without subagents)
═════════════════════════════════════════════════

[Brand DNA Stage] — 45s, 2,200 tokens

[Persona DNA Stage] — 38s, 1,890 tokens

[Angles Stage] — 52s, 2,140 tokens

[Strategy Stage] — 41s, 1,850 tokens

[Copywriting Stage] — 67s, 3,120 tokens

[Production Stage] — 95s, 4,560 tokens

[Test Stage] — 63s, 2,840 tokens

═════════════════════════════════════════════════════

TOTAL CYCLE TIME: 9.2 minutes (with subagents)
vs 15.3 minutes without subagents
SPEEDUP: 39% faster

TOKENS USED: 34,010 (full cycle)
SOURCES SCRAPED: 87 URLs
RESEARCH COVERAGE: 92% (across 10 dimensions)

AUDIT TRAIL:
├─ Researchers spawned: 5 total
├─ Researchers parallel: Max 3, Avg 2.6
├─ Synthesizers spawned: 2
├─ Validators spawned: 2
├─ Total subagent tokens: 13,830 (41% of cycle)
└─ Abort/pause events: 0
```

---

## How to Extend: Custom Subagent Workflows

### Template 1: Research → Analyze → Synthesize Chain

```typescript
// Research → Analysis → Synthesis pipeline

// 1. Spawn multiple researchers in parallel
const researchers = await Promise.all([
  manager.spawn({ role: 'researcher', task: 'Find X', input: 'query 1', ... }),
  manager.spawn({ role: 'researcher', task: 'Find Y', input: 'query 2', ... }),
]);

// 2. After researchers complete, spawn analyzer
const analysis = await manager.spawn({
  role: 'analyzer',
  task: 'Extract patterns from research',
  input: researchers.map(r => r.output).join('\n'),
  ...
});

// 3. After analysis, spawn synthesizer
const synthesis = await manager.spawn({
  role: 'synthesizer',
  task: 'Create final summary',
  input: [
    ...researchers.map(r => r.output),
    analysis.output,
  ].join('\n'),
  ...
});
```

### Template 2: Validate → Recommend → Research Loop

```typescript
// Adaptive research loop based on validation feedback

let iteration = 0;
let coverage = 0;

while (coverage < 0.85 && iteration < maxIterations) {
  // ... run research round ...

  // Validate
  const validation = await manager.spawn({
    role: 'validator',
    task: 'Check coverage',
    input: allFindings,
    ...
  });

  // Parse coverage score
  coverage = parseValidatorCoverage(validation.output);
  const gaps = parseValidatorGaps(validation.output);

  // If gaps exist, spawn researchers for those gaps
  if (gaps.length > 0) {
    const gapResearch = await manager.spawn({
      role: 'researcher',
      task: `Research gaps: ${gaps.join(', ')}`,
      input: gaps.map(g => `What about: ${g}`).join('\n'),
      ...
    });
    allFindings += '\n' + gapResearch.output;
  }

  iteration++;
}
```

---

## Performance Benchmarks

| Scenario | Without Subagents | With Subagents (3 Researchers) | Speedup |
|----------|-------------------|--------------------------------|---------|
| SQ (Super Quick) | 5 min | 5 min | — (subagents not used) |
| QK (Quick) | 30 min | 25 min | 17% faster |
| NR (Normal) | 90 min | 55 min | 39% faster |
| EX (Extended) | 120 min | 72 min | 40% faster |
| MX (Maximum) | 300 min | 180 min | 40% faster |

**Key insight**: Subagent overhead (~5s per spawn) is paid back in 15+ second tasks. Ideal for NR+ presets.
