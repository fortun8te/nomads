// MEGA COMPREHENSIVE PRESET — Literally EVERY questionnaire field filled in
// This is the gold standard example showing what maximum brief looks like
// 200+ fields covering brand, audience, product, competitive, messaging, platforms, strategy

export const DEFAULT_PRESET = {
  id: 'clean-skincare',
  label: 'Natural Skincare Brand',
  brand: {
    name: 'Upfront.',
    website: 'www.upfront.nl',
    socials: 'instagram.com/upfront.skincare | tiktok.com/@upfrontskincare | YouTube: Upfront Science',
    description: 'Clean, transparent skincare brand combining Dutch herbal traditions with modern science. Every ingredient is traceable, every claim is backed by data. Founded 2019 by Dr. Marit van den Berg (former dermatologist)',
    industry: 'Beauty / Clean Beauty / Skincare',
    positioning: 'The transparent skincare brand that puts ingredient integrity first — for people tired of being lied to by the beauty industry',
    tone: 'Honest, educational, friendly but never patronizing, data-backed. Always explain the WHY. Never use buzzwords without backing.',
    colors: 'Sage green (trust/growth) + cream (approachability) + charcoal (authority)',
    fonts: 'Inter for body (modern, clean), Courier for technical specs (credibility)',
    personality: 'The Scientist Friend — approachable, nerdy about ingredients, always explains WHY, never talks down to you',
    bigEnemy: 'Greenwashing brands that hide toxic ingredients behind buzzwords. Also: beauty industry gatekeeping (hiding formulas, confusing INCI names)',
    brandWhy: 'Dr. Marit saw patients destroyed by "clean" products that weren\'t. She got tired of lying and built the antidote: radical transparency.',
    categoryBeliefs: [
      '"Natural = ineffective" — Myth. We prove plant compounds outperform synthetics in clinical trials',
      '"Premium = unaffordable" — Myth. €0.65/use is cheaper than coffee',
      '"Skincare needs 10 steps" — Myth. Minimal routines work better',
      '"Transparency is expensive" — Myth. We publish supply chain at same price as competitors',
    ],
    missionStatement: 'Disrupt beauty industry gatekeeping by proving transparent + sustainable + effective is profitable',
    visionStatement: '100 million people who know exactly what\'s in their products. Beauty without BS.',
    coreValues: 'Radical transparency, scientific integrity, customer obsession, environmental responsibility',
    brandPromise: 'We tell you the truth. Always. Our claims are backed by data, not marketing.',
    internalCulture: 'Hire scientists/skeptics not marketers. Celebrate saying "this won\'t work for X" over overpromising.',
    founderPersona: 'Dr. Marit van den Berg: 45, dermatologist 15 yrs, left corporate pharma to build honest brand, visible in all marketing/testimonials, author of ingredient guides',
    designAssets: 'Minimalist aesthetic (sage + cream), typography-first design, data visualization of ingredient breakdowns, before/afters with measurement calipers',

    // Brand story & heritage
    foundingStory: 'Started when Dr. Marit treated patients who were harmed by products marketed as "clean" but contained irritants. Quit pharma in 2019 to build alternative.',
    firstProduct: 'Vitamin C serum. Tested 50 formulations over 2 years. Chose 15% concentration because it\'s research-proven, not marketing-optimal.',
    pivotalMilestones: 'Year 1: 500 customers, 70% repeat. Year 2: Featured in Dermatology journal. Year 3: €2M revenue, expanded to 8 SKUs. Year 4: Opened Amsterdam lab (transparent to customers).',
    keyPeople: 'Dr. Marit (founder, still formulates), Dr. Hans (chief scientist, published 12 papers on skincare), Eva (VP marketing, ex-dermatology educator)',
    narrativeArcs: 'Hero\'s journey: "broken by greenwashing" → "scientist rebuilds trust" → "proves transparency is profitable"',

    // Visual & sensory
    logoStyle: 'Minimalist sans-serif (Inter), single color (sage green), geometric mark inspired by molecular structure',
    imageStyle: 'Real skin (no retouching), natural lighting, measurement tools visible, before/afters with 8-week spans',
    packagingDesign: 'Airless glass bottles (no oxidation), minimalist labels (full ingredient list), recyclable cardboard',
    visualIdentity: 'Clean lines, data-first (graphs > gradients), monospace for ingredient specs, human faces in testimonials (not models)',
    sensoryBrand: 'Lightweight absorbs in 60s, slight citrus scent (from vitamin C, not synthetic fragrance), satisfying glass bottle feel',

    // Strategy & positioning
    marketPosition: 'Premium-positioned (€65) but justified by science + transparency (not hype)',
    nicheDefinition: 'Skeptical beauty professionals (analysts, scientists, healthcare workers) who trust data over marketing',
    targetNeedsUnmet: 'No brand combines radical transparency + founder clinical credibility + published data + affordable premium',
    emotionalDifferentiation: 'Makes customers feel SMART (not duped) and IN CONTROL (not manipulated by marketing)',
    buyingExperience: '1-click website (no friction) | Ingredient decoder tool | Free dermatologist Q&A | 60-day guarantee (removes risk)',
  },

  audience: {
    name: 'Emma, The Conscious Skeptic',
    ageRange: '32-38 (peak earning, buying power)',
    location: 'Europe: Netherlands, Belgium, Germany, UK (cold climate = barrier damage)',
    income: '€50k-200k household',
    job: 'Senior product manager at tech company (analytical, research-driven)',
    education: 'University educated, likely STEM background',
    maritalStatus: 'Married, 1 kid, dual income household',

    currentSituation: 'Buys skincare but feels anxious about choices. Reads 10+ reviews before buying. Has been burned by greenwashing multiple times. Frustrated by misleading ingredient lists.',
    desiredSituation: 'Wants to find ONE brand that doesn\'t lie, actually works, and aligns with values. Wants confidence that skin investment was smart.',

    painPoints: {
      primary: 'Confusing ingredient lists and fear of being duped (daily frustration when shopping)',
      secondary: 'Wasted money on ineffective products (€200+/year lost to experimental purchases)',
      tertiary: 'Sensitive skin reactions from harsh chemicals (had flare-ups after product switches)',
      quaternary: 'Greenwashing guilt — bought "clean" products that weren\'t, felt foolish on Reddit',
      deepestPain: 'Fear of looking older before her time (sun damage anxiety). Wants to age gracefully, not "fight aging".',
    },

    values: {
      transparency: 'Reads every label, cross-references on CosDNA, wants to understand WHY each ingredient',
      efficacy: 'Needs clinical data, not influencer hype. Will pay premium for proof.',
      sustainability: 'Checks sourcing, cares about packaging waste, buys recyclable when possible',
      evidenceBased: 'Trusts science > marketing. Would rather hear dermatologists than influencers',
      timeSaving: 'Won\'t do 10-step routines. Needs minimal, effective routine (2-3 products max)',
    },

    platforms: {
      instagram: '3 hrs/day — follows dermatologists, skincare educators, brand accounts',
      tiktok: '1 hr/day — discovers trends, skeptical of viral solutions',
      reddit: '30 min/day on r/SkincareAddiction, r/30PlusSkinCare — reads detailed user experiences',
      youtube: '2x/week for product reviews and dermatologist content',
      pinterest: 'Weekly for mood boards and skincare routines',
      blogs: 'Lab Muffin Beauty Science, Kindred Bylaws for deep dives',
    },

    dayInLife: 'Wake 6:30am → workout → work 8-6 → dinner 7pm → skincare 9:30pm (sacred me time) → reads reviews → sleep 11pm',
    exerciseHabits: '4x/week gym + 1x yoga (fitness = health investment)',
    hobbies: 'Reading (science books, nutrition), hiking, cooking from scratch, skincare experimentation',
    entertainment: 'Podcasts (NPR, science), YouTube (educational), Netflix (documentaries), rarely watches TV',
    socialLife: 'Close friends (quality over quantity), monthly coffee chats, mostly couple activities with husband',
    diningHabits: 'Meal preps Sundays, organic vegetables priority, €150-200/month food budget',
    vacationStyle: 'Beach vacations 1x/year (Europe), active hiking trips, stays in eco-lodges',
    fashionStyle: 'Minimalist wardrobe (basics + one investment piece/season), quality over trend-chasing',
    techAdoption: 'iPhone user, buys latest every 3 years, early adopter for health/science apps',
    newsConsumption: '1x daily, sources: NPR + The Guardian + podcasts, skips celebrity gossip entirely',

    purchaseHistory: 'CeraVe (too basic) | Korean brands (too complex, 10 steps) | The Ordinary (cheap, inconsistent) | Drunk Elephant (overpriced hype) | Paula\'s Choice (sterile, expensive)',
    formerBrandsFailed: 'Olay (too generic), Estée Lauder (felt corporate), Glossier (too millennial marketing)',

    failedSolutions: 'Prescription retinoids (irritating), spa facials (temporary), dietary changes alone (sun damage irreversible)',
    moneyWasted: '€400+/year on skincare, most ineffective',
    trustDamage: 'Betrayed by indie "natural" brands, skeptical of clinical claims now',

    psychographicTriggers: {
      respondTo: 'Data/proof | Before-afters with methodology | Ingredient breakdowns | "No BS" messaging | Price transparency | Supply chain stories | Founder credibility',
      turnOff: 'Influencer shills | Vague claims | Pink tax | "Miracle" language | Buzzwords | Overpackaging | Overly feminine aesthetic | Greenwashing language',
      anxieties: 'Wasting money | Being lied to | Wrong choice | Ineffective product | Environmental guilt | Looking foolish | Aging badly',
      aspirations: 'Healthy radiant skin | In control of choices | Looking naturally good | Aging gracefully | Being smart about purchases',
    },

    buyingTriggers: 'Bad skin day + reads favorable Reddit testimonials + remembers brand = impulse buy',
    buyingJourney: 'Day 0: Sees before/after on Instagram | Day 1: Checks website for data | Day 2-3: Reads Reddit r/SkincareAddiction | Day 4-5: Asks dermatologist friend | Day 7: Buys during retargeting ad',
    pricePerception: '€65 = "€0.65/use feels smart" vs "competitor at €80 feels overpriced"',

    dealBreakers: 'If tested on animals: instant NO | If uses silicones/parabens: instant NO | No money-back: instant NO',
    trustFactors: 'Third-party lab testing | Specific dermatologist endorsements | Long-term customer testimonials with photos | Supply chain documentation | Honest about limitations',

    identityShift: 'From "skeptic burned by marketing lies" → "someone who found a brand worthy of trust with skin AND wallet"',
    mustBelieve: 'Natural ingredients CAN be as effective as synthetic ones. This is non-negotiable.',
    deepDesire: 'Being in control of her beauty choices. Confidence that she made the smart choice. Aging gracefully without vanity.',

    // Complete lifestyle profile
    completeLifeStage: 'Career peak (senior IC at tech), established marriage (5 yrs), 1 child (8 yrs), mortgage, dual income, childcare stable',
    relocationHistory: 'Grew up Netherlands, studied Germany, now UK (follows partner\'s career)',
    familyDynamics: 'Supportive partner (also in tech), mother (nurse, health-conscious), no siblings, close to parents',
    childcare: 'Full-time school + aftercare, 1 nanny 2x/week for date nights, prefers not to outsource skincare prep time',
    workStress: 'High — quarterly launches, on-call for incidents, pressure to mentor (only senior woman on team)',
    wealthStatus: 'Stable, dual income €120k combined, saving €1200/month, one car, renting (prefers flexibility)',

    // Detailed psychological profile
    introvertExtrovert: 'Ambivert — comfortable in meetings but drains energy, prefers 1:1s, recharges with solo activities',
    decisionMakingStyle: 'Data-first, requires 3+ data points before decision, trusts published research over testimonials (though testimonials help)',
    conflictStyle: 'Direct but polite, documents everything, uncomfortable with ambiguity',
    learningStyle: 'Visual + reading (infographics), needs written explanations, watches tutorial videos',
    riskTolerance: 'Low for health/skincare (requires guarantees), medium for tech (early adopter but tests first)',
    loyaltyTriggers: 'Consistency (same product formulation), transparency (honest about limitations), founder presence (appreciates visible scientist)',

    // Deep emotional landscape
    deepestFears: 'Premature aging (sun damage anxiety from past mistakes), wasting money on ineffective products, being fooled by marketing',
    anxietyTriggers: 'Conflicting skincare advice on internet, influencer claims without data, discovering product side effects after purchase',
    trustDamageHistory: 'Drunk Elephant ad claimed "clinical proof" (marketing BS), spent €150 on Korean routine (too complex, gave up)',
    currentEmotionalState: 'Cautiously optimistic about skincare (found Paula\'s Choice worked, seeks data-backed alternatives)',
    desperationLevel: 'Moderate — has found some solutions (sunscreen, retinol) but frustrated by lack of transparency in category',

    // Cognitive patterns
    thinkingPatterns: 'Overthinks purchase decisions, cross-references 3+ sources, reads competitor reviews, checks Reddit for real experiences',
    informationGathering: 'Deep dives (not skimming), saves articles, takes notes, bookmarks dermatologist blogs',
    confirmationBias: 'Seeks data supporting "transparency matters" belief, skeptical of greenwashing claims',
    comparisonBehavior: 'Compares to dermatologist-grade (Paula\'s Choice), clean beauty competitors (Beautycounter), price-per-use',

    // Values system
    coreBeliefs: [
      'Science beats marketing always',
      'Transparency = trustworthy',
      'Premium justified by data, not packaging',
      'Sustainability matters (buys organic groceries)',
      'Female-led companies preferred (not required)',
    ],
    dealBreakerBeliefs: [
      'Will NOT buy if animal tested',
      'Will NOT buy if parabens (even if safe, perception matters)',
      'Will NOT trust vague "natural" claims',
      'Will NOT support companies hiding supply chain',
    ],

    // Financial behavior
    spendingPhilosophy: 'Pays premium for quality but demands ROI (cost-per-use calculation)',
    beautyBudget: '€150-200/month on skincare (includes sunscreen, retinol, serum, moisturizer)',
    skincareBudgetAllocation: '40% face serums | 30% sunscreen | 20% moisturizer | 10% treatments',
    pricePointAcceptance: '€65 serum = yes (€0.65/use), €80 serum = hesitation, €100+ = hell no (diminishing returns)',
    moneyAttitude: 'Saver mindset (tracks spending), budgets but not restrictive, splurges on health/tech',
    debtLevel: 'Mortgage only (no credit cards)',

    // Aspirational identity
    whoTheyWantToBe: 'Confident professional woman who ages gracefully, makes smart choices, doesn\'t fall for BS',
    successMetric: 'Glowing skin, clear mind (not anxious about choices), time saved (not 10-step routines)',
    roleModel: 'Dr. Marit van den Berg (founder), female dermatologists (authority + caring), female tech leaders (capability)',
    aspirationalLifestyle: 'Work-life balance (leaves at 6pm for family), active weekends (hiking), travels with purpose (visits labs/spas)',
    imposterSyndrome: 'Mild — second-guesses skincare choices despite product success, worries she\'ll age badly anyway',

    // Social media & influence
    contentConsumption: 'Instagram: skincare educators + research accounts (no influencers with >100k) | Reddit: specific problem-solving | YouTube: dermatologist explainers | Podcasts: science/business | Zero TikTok (too frivolous)',
    influencerImmunity: 'High — scrolls past sponsored content, distrusts affiliate links, fact-checks influencer claims',
    shoppingTriggers: 'Reddit recommendation + dermatologist mention + visible research = buy | Influencer post alone = ignore | Algorithmic ad = doom scroll past',
    reviewBehavior: 'Writes detailed reviews if product works, leaves negative if disappointed (feels obligated to warn others)',
    communityParticipation: 'Active Reddit commenter (r/SkincareAddiction, r/30PlusSkinCare), helps answer questions, shares research links',

    // Unmet needs & gaps
    frustrations: [
      'No brand explains WHY ingredients in simple terms',
      'All comparisons are against the worst competitors (not peers)',
      'Dermatologists won\'t recommend brands (ethical conflict of interest)',
      'Sustainability claims without actual certification',
      'Minimal routines aren\'t actually "minimal" (still 3-4 steps)',
    ],
    dreams: 'Find ONE skincare brand that doesn\'t require skepticism. Confidently recommend to friends without caveats.',

    // Seasonal & contextual behavior
    seasonalNeeds: 'Winter: barrier repair (cold + heating) | Summer: sun damage prevention (more time outdoors) | Year-round: consistency',
    lifeStageTriggers: 'Entered 30s, started noticing sun damage, wants to "fix" before too late',
    environmentalTriggers: 'Moving to UK (different water, weather) made skin reactive, triggered skincare overhaul',
  },

  product: {
    name: 'Vitamin C Brightening Serum 30ml (aka "The Glow Serum")',
    category: 'Skincare → Serums → Brightening',
    description: 'Stabilized L-ascorbic acid 15% with hyaluronic acid + ferulic acid complex. Lightweight, fast-absorbing. Pure science, no filler.',
    format: '30ml airless glass bottle with dropper (lasts 100 days)',
    packaging: '100% recyclable glass + cardboard, no plastic wrapper',
    shelfLife: '2 years unopened, 6 months after opening (keep in cool place)',

    problemSolved: 'Hyperpigmentation from sun damage and post-acne marks (measurable discoloration, not just dullness)',
    secondaryProblems: 'Fine lines, loss of radiance, tired-looking skin',

    features: {
      active: 'L-ascorbic acid 15% (2x higher than most competitors)',
      supporting: 'Hyaluronic acid 2%, Ferulic acid complex, Vitamin E 1%',
      format: 'Fast-absorbing (60 sec), pH 3.5 (optimal), airless glass bottle',
      stability: 'Published oxidation data: <1% degradation per month',
      noNos: 'No fragrance, parabens, sulfates, silicones, dyes. Vegan, cruelty-free.',
    },

    functionalBenefits: {
      day3: 'Hydration boost visible, skin feels plumped',
      week1: 'Glow appears, texture improved, fine lines softer',
      week2: 'Confident without makeup, fine lines noticeably softer',
      week4: 'Brown spots lighter (15% reduction), skin tone more even',
      week8: 'Significant improvement (40% spot reduction), consistent glow',
    },

    emotionalBenefits: [
      'Confidence without makeup (spots don\'t need coverage)',
      'Not hiding spots in photos anymore',
      'Feeling like you\'re "glowing" naturally',
      'Reclaiming your skin identity',
      'Peace of mind (know exactly what\'s in product)',
      'Feeling smart (science-backed vs trends)',
      'Not being fooled anymore',
    ],

    usp: 'ONLY product with: 15% L-ascorbic acid (competitors use 10%) + ferulic stabilizer + published clinical data + full supply chain transparency + €0.65 per use cost.',
    provenResults: '8-week clinical study (n=50, peer-reviewed): 92% saw visible brightness improvement, 40% brown spot reduction. Published data on site with methodology.',

    resultTimeline: 'Week 1: glow | Week 2: fine lines soften | Week 4: 15% spot reduction | Week 8: 40% reduction + even tone',
    guaranteeIfFails: 'Money-back guarantee if no visible improvement by week 2',

    bestFor: 'Sun damage, post-acne pigmentation, dull/tired skin, 30+, all skin types except reactive-sensitive',
    notFor: 'Very sensitive skin (patch test), active acne (use after healing), pregnant women (consult doctor), on Accutane',

    pricing: '€65/bottle | €0.65 per use (100 uses) | Cheaper per result than competitors (The Ordinary at €5.90 but unstable, DE at €80 with marketing premium)',
    guarantee: '60-day money-back guarantee, no questions asked, returns free',
    bundleOptions: 'Single (€65) | 3-pack (€180, 8% save) | 6-pack (€330, 15% save)',

    usageFrequency: 'Apply 2-3 drops daily (AM or AM+PM for faster results)',
    usageDuration: 'Results visible in 2-4 weeks, significant in 8 weeks',
    usageInstructions: '1) Cleanse | 2) Toner (if using) | 3) Apply 2-3 drops Vitamin C | 4) Wait 60 sec | 5) Moisturize + sunscreen (AM)',
    compatibility: 'Works with: moisturizer, sunscreen (essential). Avoid: vitamin E, retinol (irritating together), acids in same routine',
    storage: 'Room temperature, away from direct sunlight. Refrigerate after opening for extended stability.',

    certifications: 'Dermatologist tested, hypoallergenic, vegan, cruelty-free (Leaping Bunny)',
    costPerUse: '€0.65 per application (cheaper than daily coffee)',
    comparison: '2x more concentrated than The Ordinary (€5.90) | 25% cheaper than Drunk Elephant (€80) | More stable than both',

    // Offer structure & bundling
    bundleStrategies: [
      'Starter: Serum + Moisturizer (€110, save €20)',
      'Loyalty: 6-pack serum (€330, save €60 + free shipping)',
      'Couples: 2x serum (€120, perfect for gifting)',
    ],
    discountTriggers: 'Loyalty program: 10% after 3 purchases | Birthday: €10 off | Referral: both get €15',
    freeSamples: '2ml sample with every order (try serum before committing to full size)',

    // Positioning & messaging
    positioningStatement: 'For skeptical 30+ beauty professionals who want results without BS. Upfront is the only brand that publishes clinical data + supply chain + founder credentials. Unlike greenwashing competitors, we admit limitations.',

    // Clinical & technical specs
    formulationJourney: 'Tested 50 formulations over 24 months. Rejected 45 for: instability, irritation, redundant ingredients, overcomplication.',
    researchBacking: '8-week clinical study (n=50, dermatologist-supervised) + ongoing stability data + peer-review process',
    manufacturingLocation: 'Small-batch produced in Amsterdam facility (temperature-controlled, open to customer tours)',
    qualityControl: 'Third-party tested for: purity, oxidation, microbial, ingredient verification. Results published monthly.',
    safetyProfile: 'Tested on all skin types (including sensitive). Side effects: 2% reported mild irritation (resolved with patch test).',

    // Product philosophy
    whatWeWontDo: [
      'Won\'t use synthetic fragrances (natural citrus only)',
      'Won\'t promise "anti-aging" (we say "age gracefully")',
      'Won\'t hide supply chain',
      'Won\'t overpromise results (we admit limitations)',
      'Won\'t use filler ingredients',
    ],
    whatWeCommitTo: [
      'Publish all ingredient sources',
      'Monthly transparency reports',
      'Honest about effectiveness windows',
      'Admit when competitors are better at something',
      'Founder visible in marketing (not just logo)',
    ],

    // Customer support & experience
    supportChannels: 'Email (2-hr response) | WhatsApp (for EU customers) | Monthly Q&A with Dr. Marit (live Zoom)',
    returnPolicy: '60-day no-questions guarantee. Full refund + prepaid return label. Keep the empty bottle (feedback)',
    communityBuilding: 'Private Slack group (500+ members, research discussions), monthly Zoom for repeat customers',
    feedbackLoop: 'Send detailed surveys after purchase, implement feedback in product iterations, credit customers in release notes',
  },

  competitive: {
    mainCompetitors: [
      'The Ordinary (€5.90) — Threat: price, accessibility | Weakness: unstable formula, 0% stability data, no dermatologist backing',
      'Drunk Elephant (€80) — Threat: hype, influencer marketing | Weakness: overpriced (€0.80/use), no published clinical data, founder-driven marketing',
      'Paula\'s Choice (€50-60) — Threat: science messaging (Real Scientists™) | Weakness: sterile brand, complex 5-step routine, impersonal',
    ],
    yourAdvantage: [
      'Only transparent supply chain documentation (not just claims)',
      'Higher concentration (15%) at lower cost (€0.65/use)',
      'Published clinical data + oxidation stability rates (competitors hide this)',
      'Founder is practicing dermatologist, not ex-beauty influencer',
      'Customer testimonial authenticity (1:1 interviews, full photos)',
      'Honest about limitations (won\'t work for active acne, very sensitive)',
      'No greenwashing (admits synthetic = naturals for some benefits)',
    ],
    marketGap: 'No brand owns "radically transparent + scientifically proven + affordable premium + founder credibility + clean without greenwashing"',
    timelineToDecision: 'Emma researches 2-3 weeks before buying; testimonials + dermatologist mention + money-back guarantee = conversion',
  },

  creative: {
    topPerformingAngles: [
      '"Myth debunking" — Natural ≠ effective (audience: skeptics)',
      '"Cost per use" — €0.65 vs €1.50 competitors (audience: rational buyers)',
      'Before/afters with methodology — Visible calipers, consistent lighting (audience: data-driven)',
      '"Ingredient decoder" — Explains every component in simple terms (audience: anxious/confused)',
    ],
    untestedAngles: [
      'Emotional storytelling (our audience distrusts emotion-driven marketing)',
      'Celebrity endorsements (contradicts our anti-hype positioning)',
      'Minimalist aesthetic without data (need to support beauty with science)',
    ],
    contrarian: 'Most brands hide supply chain. We publish it. Most claim "natural" is better. We admit synthetics work sometimes. This honesty = differentiation.',
    hookBank: [
      '"I tested 50 formulations so you don\'t have to"',
      '"This is what greenwashing looks like (and we\'re not it)"',
      '"Your dermatologist won\'t recommend us (for good reason)"',
      '"The ingredient your skin actually needs (not the trendy one)"',
    ],
    scrollStoppingVisuals: 'Before/afters with calipers | Data graphs with real numbers | Split-screen competitor comparison | Ingredient breakdown infographics | Behind-the-scenes lab footage',
    legalClaims: 'Can claim: "Clinically proven 40% improvement" | Cannot claim: "Anti-aging" or "Cure" | Must always add: "Individual results vary"',
  },

  messaging: {
    coreMessage: 'Get visible results in 2 weeks with ingredients you can trace back to their source. No BS, just science.',
    subclaims: [
      'Clinically proven efficacy (92% improvement in peer-reviewed study)',
      'Transparent ingredients (full supply chain published on website)',
      'Results or money back (60-day no-questions guarantee)',
      'Founder is practicing dermatologist with 15 years clinical experience',
    ],
    mainObjections: {
      doubt1: '"Will it work for me?" → 92% improvement in 8-week study. Money-back guarantee if not.',
      doubt2: '"Too expensive?" → €0.65/use, cheaper than coffee. Competitor X at €80 works worse + costs more.',
      doubt3: '"Is it natural?" → 60% natural, 40% synthesized. We\'re honest, not greenwashing buzzwords.',
      doubt4: '"How long until results?" → Glow in 7 days, spots fade in 4 weeks, significant in 8 weeks.',
      doubt5: '"Will it irritate my skin?" → Tested on dermatologists, hypoallergenic. Patch test for very sensitive.',
      doubt6: '"Why trust you over dermats?" → We don\'t replace doctors, we complement. Derms won\'t recommend (conflict of interest), but they approve the science.',
      doubt7: '"Is this greenwashing?" → We admit we use synthetics when they work better. We don\'t call ourselves "clean" (loaded term).',
    },
    linguisticPatterns: [
      '"Finally works"',
      '"No more hiding spots"',
      '"Glow is real"',
      '"I understand what\'s in it"',
      '"Worth every penny"',
      '"Not fooled anymore"',
      '"Actually works like they said"',
      '"No buyer\'s remorse"',
    ],
    avoidLanguage: [
      '"Miracle", "Anti-aging", "Chemical-free", "All-natural", "Girl boss", "Self-care fantasy", "Disrupt"',
      '"Clinically proven" (too vague — always specify study size + duration)',
      '"100% natural" (we don\'t claim this)',
      '"Best-selling" (not true yet)',
      '"Dermatologist recommended" (they won\'t due to ethics)',
    ],
    contentFormats: [
      'Before/afters with measurement calipers + photography date (proves consistency)',
      'Ingredient breakdowns explaining WHY each component (not "clean" marketing)',
      'Lab behind-the-scenes (stability testing, formulation, safety)',
      'Q&A with Dr. Marit (dermatologist series, filmed, candid)',
      'Reddit screenshot testimonials (Reddit threads about product, unfiltered)',
      'Supply chain documentary (where each ingredient comes from, farmer interviews)',
      'Myth-busting (natural vs synthetic performance, backed by studies)',
      'Competitor analysis (honest comparison, where others win)',
      'Customer stories (deep dives, not influencer testimonials)',
      'Dermatology education (how skin barrier works, why ingredient X matters)',
    ],
  },

  platforms: {
    primary: [
      'Instagram (40% budget): Reels with before/afters | carousel posts about ingredients | Dr. Marit Q&A | Behind-the-scenes lab | Myth-busting series',
      'TikTok (35% budget): Native short videos debunking skincare myths | 60-second ingredient explainers | User testimonials (unscripted) | Supply chain snippets | Dermatology education',
      'YouTube (25% budget): Long-form lab tours (10+ min) | Dermatologist interviews (30+ min) | Product methodology deep-dives | Competitor analysis | Customer story series',
    ],
    secondary: [
      'Reddit (organic community): r/SkincareAddiction (answer questions, link to posts), r/30PlusSkinCare (share research), r/BeautyRehab (anti-hype positioning)',
      'Pinterest (skincare boards): Before/afters, skincare routines, ingredient guides (drives traffic)',
      'Email (weekly): Research roundup, ingredient deep-dive, customer spotlight, Dr. Marit column',
      'Blog (2x/month): Long-form ingredient science, clinical study breakdowns, competitor reviews',
      'Podcast sponsorships (3-4/month): Science-focused shows (not lifestyle), 6-min sponsor segments',
    ],
    contentStyle: 'Minimalist, data-first, no filters, educational tone, dermatologist-credible, anti-hype, honest about limitations',
    contentTone: 'Friendly but direct, never patronizing, assumes audience is smart, explains WHY (not what)',
    postingCadence: [
      'Instagram: 4x/week (Reels 2x, carousel 1x, Stories 3x)',
      'TikTok: daily (5-7 videos queued)',
      'YouTube: 2x/month (1 long-form, 1 educational)',
      'Email: weekly (Tuesday 9am CET)',
      'Blog: 2x/month (tie to trending topics)',
    ],
    seasonalStrategy: [
      'Jan-Feb (New Year): "Research-backed resolutions" (vs vague goals)',
      'Mar-May (Spring): "Repair winter barrier damage"',
      'Jun-Aug (Summer): "Sun damage prevention + recovery"',
      'Sep-Oct (Fall): "Transition routines (seasonally adjust)"',
      'Nov-Dec (Holidays): "Gift guides with data" + founder interview specials',
    ],
    communityEngagement: 'Reply to all comments within 2 hours (build relationship) | Feature user content (testimonials, research shares) | Host monthly Reddit AMAs | Respond to skeptics with data (don\'t argue)',
  },

  growth: {
    goal: 'Drive trial conversions among skeptical clean beauty seekers (€50k+ income, analytical types, Reddit users). Establish "transparent brand" authority in EU market. Build 40%+ repeat loyalty within 6 months. Achieve €100k MRR by month 12.',
    budget: '€15k/month — 40% Instagram, 35% TikTok, 25% YouTube | Paid: €10k | Organic: €5k (content production)',
    timeline: [
      'Q1: Awareness + education (dermatologist credibility building, before/after content, ingredient guides)',
      'Q2: Trial + conversions (money-back guarantee highlights, testimonials, competitor comparisons)',
      'Q3: Retention + referral (loyalty program launch, email campaigns, community events)',
      'Q4: Brand authority (year-end retrospective data, founder podcast tour, academic partnerships)',
    ],

    // Detailed KPIs
    conversionKpis: {
      target: '3%+ conversion rate (industry benchmark 1-2%)',
      baseline: '1.5% (current)',
      roadmap: 'Q1: 1.8% | Q2: 2.3% | Q3: 2.8% | Q4: 3.2%+',
    },
    adSpend: {
      cac: '€25-35 per customer (max allowable: €32.50 given €65 price + 40% repeat)',
      roi: '4:1 ROAS minimum (€1 spent → €4 revenue)',
      blendedCpa: 'Instagram: €28 | TikTok: €22 | YouTube: €38 | Email: €0 (owned channel)',
    },
    retentionKpis: {
      repeatRate: '40%+ buy second product within 90 days (target: by month 6)',
      churn: '<15% monthly (customers who don\'t replenish)',
      ltv: '€130-150 per customer (2.6-3.2x CAC)',
    },
    revenueKpis: {
      aov: '€65-75 (serum €65 + add-on €10)',
      monthlyRun: '€100k MRR by month 12 (1,500+ monthly customers)',
      yearlyTarget: '€1M ARR',
    },
    communityKpis: {
      redditOrganic: '20%+ of traffic from Reddit (unpaid)',
      nps: '70+ (detractors = competitors, passives = satisfied, promoters = advocates)',
      emailEngagement: '35%+ open rate (industry avg 20%)',
      socialFollows: '50k Instagram | 30k TikTok | 5k YouTube (by month 12)',
    },
    dataQualityKpis: {
      testimonialVolume: '100+ written reviews | 20+ video testimonials | 500+ social mentions/month',
      contentOutput: '40 Instagram posts/month | 30 TikToks/month | 2 YouTube videos/month | 2 blog posts/month',
      researchPublications: '1+ academic publication | 3+ industry partnerships | 5+ podcast features',
    },
  },

  successMetrics: {
    month1: 'Reach 5k email subscribers | 10k Instagram followers | First 50 customers',
    month3: 'Repeat rate 30% | NPS 65+ | 300 total customers | €10k MRR',
    month6: 'Repeat rate 40% | NPS 70+ | 1,000 total customers | €50k MRR | €25-30 CAC achieved',
    month12: 'Repeat rate 45% | NPS 75+ | 1,500+ monthly customers | €100k MRR | Reddit drives 20% organic traffic | 50k Instagram followers',
  },

  competitiveLandscape: {
    directCompetitors: {
      theOrdinary: { position: 'Budget leader', threat: 'Price', weakness: 'No stability data, unstable formula, founder absent' },
      drunkelephant: { position: 'Hype leader', threat: 'Marketing budget', weakness: 'Overpriced, no data, influencer-driven', ourAdvantage: '€15 cheaper, actual science' },
      paulasChoice: { position: 'Science leader', threat: 'Established brand', weakness: 'Sterile, complex 5-step routine, founder invisible', ourAdvantage: 'Simpler, founder visible, supply chain transparent' },
    },
    indirectCompetitors: {
      dermatologists: { position: 'Authority', threat: 'Professional credibility', weakness: 'Expensive (€200/consult), limited time', ourAdvantage: 'Affordable, accessible, Dr. Marit adds credibility' },
      diySolutions: { position: 'Cheapest', threat: 'Price', weakness: 'Inconsistent results, safety risk', ourAdvantage: 'Guaranteed results, professional formulation' },
    },
    ourUniqueFit: 'Only brand that combines: transparent + data-driven + founder credible + affordable premium + honest about limitations',
  },

  marketContext: {
    marketSize: 'EU beauty market €60B, skincare subset €15B, premium skincare €3B',
    growthRate: '8-10% annually',
    buyerDemographics: '70% female, 60% ages 25-45, 55% €50k+ income, 45% college educated+',
    trendDirection: 'Toward transparency, away from greenwashing, toward science-backed claims, toward founder visibility',
  },

  riskMitigation: {
    risks: [
      'Formula instability (cost to replace batches) → monthly stability testing, published data',
      'Customer satisfaction if results don\'t match claims → rigorous before/after, patch testing, guarantees',
      'Competitor copies transparency strategy → first-mover authority, continuous innovation',
      'Supply chain disruption → dual-source ingredients, 6-month buffer stock',
      'Regulatory (claims, ingredient bans) → regular legal review, conservative claims',
    ],
    contingencies: [
      'If repeat rate drops below 30% → free consultations, improved packaging, testimonial surge',
      'If CAC exceeds €40 → pivot to Reddit organic, increase email nurturing, reduce paid spend',
      'If conversion stalls at 2% → A/B test messaging (cost/benefit focus), add more testimonials',
    ],
  },
};

export const ALTERNATIVE_PRESET_SAAS = {
  id: 'deep-work-saas',
  label: 'Deep Work Productivity SaaS',

  brand: {
    name: 'FocusOS',
    website: 'www.focusOS.io',
    positioning: 'The operating system for deep work — for knowledge workers tired of context-switching and Slack interruptions',
    tone: 'Direct, no-nonsense, technical but accessible, anti-hype',
    personality: 'The Blunt Mentor — tells you hard truths, doesn\'t sugarcoat, respects your time',
    bigEnemy: 'Productivity theater tools (Asana, Notion, Monday) that create MORE meetings, not fewer',
    brandWhy: 'Founder lost 5 years to context-switching between 8 tools. Built one integrated system or suffered forever.',
  },

  audience: {
    name: 'Marcus, The Overthinking Founder',
    ageRange: '32-48',
    job: 'Founder / CTO / Principal Engineer (STEM background, perfectionist)',
    income: '€100k-300k+',
    location: 'US/EU tech hubs (SF, NYC, Berlin, Amsterdam)',

    currentSituation: 'Runs task manager + note tool + time tracker + calendar + Slack = 8 context switches/hour. Says yes to meetings, kills deep work.',
    desiredSituation: 'Complete focused 4-hour work blocks without guilt. Ship projects without constant interruptions. Feel like a capable builder, not a meeting manager.',

    painPoints: {
      primary: 'Context-switching kills productivity (every Slack ping loses 23 min focus)',
      secondary: 'No way to batch work time vs collaboration time intelligently',
      tertiary: 'Switching between Slack/Calendar/Notion/Asana wastes 3+ hrs/week',
      deepest: 'Feeling like you\'re managing instead of building. Loss of identity as maker.',
    },

    values: {
      efficiency: 'Wants tools that respect his time, not exploit it',
      autonomy: 'Wants to control his attention, not be controlled by notifications',
      clarity: 'Needs one source of truth, not scattered data',
      focus: 'Non-negotiable: 4-hour uninterrupted blocks daily',
    },

    platforms: {
      twitter: '2 hrs/day (reads tech takes)',
      hn: '30 min/day (HackerNews)',
      reddit: 'r/startups, r/programming occasionally',
      podcasts: '5 hrs/week (tech industry, founder stories)',
    },

    dayInLife: 'Wake 6am → gym 1hr → 2 deep work blocks (9-1, 2-6) → meetings (batch 1-2pm) → email (end of day) → sleep 10:30pm',
    exerciseHabits: 'Daily 1hr runs or gym (mental clarity priority)',
    hobbies: 'Building side projects, open source contributions, reading architecture blogs',
    entertainment: 'Tech podcasts, HN, Twitter, zero TV or games',

    failedSolutions: 'Asana/Notion/Monday (too heavy, create more meetings) | Pomodoro apps (too prescriptive) | Toggl (time tracking guilt) | Slack do-not-disturb (ignored)',
    moneyWasted: '€2k+/year on failed productivity tools',

    buyingTriggers: 'Reads blog post showing "5 hrs/week lost to tool switching" → feels personally attacked → tries demo → buys if integrated',
    trustFactors: 'Founder technical credibility | No marketing BS | Single payment (no SaaS trap) | API-first (not walled garden)',
    riskTolerance: 'Will pay premium for integrated solution that truly reduces context-switching. Won\'t pay for "features".',

    mustBelieve: 'It\'s possible to be collaborative AND productive (not either/or). Tools should fight distractions, not create them.',
    deepDesire: 'Feeling like a capable, focused builder again (not a meeting-attending chaos manager). Shipping > talking about shipping.',
  },

  product: {
    name: 'FocusOS Core (€99/month or €990/year)',
    description: 'Single integrated workspace: task management + note-taking + calendar + time-blocking + Slack integration (batched). No distractions.',
    format: 'Web app + desktop (Electron) + CLI + API',

    problemSolved: 'Context-switching between 8 tools wastes 3+ hrs/week and kills deep work blocks',
    secondaryProblems: 'Scattered information (tasks in Asana, notes in Notion, meetings in Google Calendar)',

    features: [
      'Time-blocking calendar (batches meetings into 2 hrs, protects deep work)',
      'Integrated task manager + notes (everything in one place)',
      'Slack integration that bundles messages into 2x daily digests (not real-time)',
      'Pomodoro + focus mode (actually enforceable, browser blockers)',
      'API for custom integrations (doesn\'t lock you in)',
    ],

    functionalBenefits: {
      week1: '2 additional focus hours/week (fewer context switches)',
      month1: '8+ additional focus hours/week, projects shipping faster',
      month3: 'Shipped 3-4x more features, meetings feel optional not mandatory',
    },

    emotionalBenefits: [
      'Feeling like a builder again (not a manager)',
      'Confidence that deep work is protected',
      'Peace of mind (nothing gets lost between tools)',
      'Reclaiming identity as someone who ships',
    ],

    usp: 'ONLY tool that integrates task + notes + calendar + focus + Slack batching WITHOUT creating more meetings or notifications.',
    provenResults: '78% of early users report 8+ additional focus hours/week. Avg project shipping speed +40%.',

    pricing: '€99/month (€1,188/yr) or €990/year (2-month discount)',
    guarantee: '30-day money-back guarantee if can\'t reduce focus interruptions',

    usageFrequency: 'Daily (full-time replacement for Asana/Notion/Slack)',
    compatibility: 'Integrates with: Slack, Google Calendar, GitHub (PRs in task manager), Stripe (usage signals)',
  },

  competitive: {
    mainCompetitors: [
      'Asana (€120+ user/mo) — Threat: brand recognition | Weakness: creates more meetings, bloated feature set',
      'Notion (€120+ user/mo) — Threat: flexibility | Weakness: slow, scattered (tasks ≠ calendar), no real focus mode',
      'Monday.com (€250+ team/mo) — Threat: no-code templates | Weakness: most admin time of all, designed for teams not individuals',
    ],
    yourAdvantage: [
      'Single tool (not tool-switching tax)',
      'Integrated calendar blocking (only focus product with this)',
      'API-first (won\'t lock you in)',
      'Built by engineers for engineers (not marketing teams)',
      'Founder still codes + uses daily (eats own dogfood)',
    ],
  },

  messaging: {
    coreMessage: 'Stop switching between 8 tools. One workspace for deep work + collaboration. Shipping > talking.',
    mainObjections: {
      doubt1: '"But I already use Asana" → You spend 3 hrs/week context-switching. Switch costs 4 hrs, saves 12+ hrs/month.',
      doubt2: '"It won\'t work for my team" → Try solo first. Use API to connect teams if needed.',
      doubt3: '"Is it stable?" → Founder uses daily on production work (eats own dogfood). Open uptime dashboard.',
    },
    linguisticPatterns: '"Actually shipping", "Focus time protected", "Finally calm", "Slack doesn\'t own me", "One source of truth"',
    avoidLanguage: '"Disrupt", "Empower", "Productivity hack", "Life-changing", "Crypto", "AI-powered"',
  },

  platforms: {
    primary: [
      'Twitter (40%): Founder thread about context-switching costs | HN-style deep dives',
      'HackerNews (30%): Product launches, technical deep dives, ask HN posts',
      'Reddit (20%): r/startups, r/programming threads (organic, not ads)',
      'YouTube (10%): Demo videos + founder interviews (low volume, high intent)',
    ],
    secondary: 'Email newsletter (1x/week about focus culture) | Podcasts (sponsorships on indie-hacker type shows)',
  },
};

export const SIMPLETICS_PRESET = {
  id: 'simpletics-seasalt',
  label: 'Simpletics Sea Salt Spray',

  brand: {
    name: 'Simpletics',
    website: 'simpletics.com',
    socials: '@simpletics TikTok | @simpletics Instagram | YouTube: Simpletics',
    description: 'Natural men\'s haircare. Sea Salt Spray, Hair Clay, Texture Powder. Real texture, no BS ingredients.',
    industry: 'Beauty / Men\'s Haircare / Styling',
    positioning: 'Premium texture for Gen Z guys who want natural ingredients at a price that doesn\'t suck',
    tone: 'Casual, authentic, friend vibes. Real, relatable, funny. No corporate speak.',
    colors: 'White (clean), black (edge), natural tan/sand (the spray)',
    fonts: 'Clean sans-serif, minimal',
    personality: 'The Real Friend — knows hair, genuine, keeps it simple',
    bigEnemy: 'Based.co charging $50+ for same stuff. Also cheap brands that feel fake or don\'t work.',
    brandWhy: 'Got tired of guys paying premium for basic ingredients. Quality at normal prices.',

    categoryBeliefs: [
      '"Good haircare = expensive" — Nope. We prove it doesn\'t cost $50.',
      '"Texture looks fake" — Nope. Right spray looks effortless.',
      '"Takes forever to use" — Nope. Spray + go. Done.',
      '"Natural doesn\'t work" — Nope. Our formula holds 8+ hours.',
    ],

    founderPersona: 'Dillon Latham (founder) — 23, TikTok creator, tired of $50 products, tested on 500+ guys',
    foundingStory: 'Dillon realized cool hair products were either $50+ (Based) or felt gross (drugstore). Tested formulas with friends, found the sweet spot.',
    firstProduct: 'Sea Salt Spray. 6 months testing ratios with friends. Final: sea salt + coconut oil + light hold.',
    pivotalMilestones: 'Year 1: TikTok with micro-creators, 100k followers. Year 2: $10k/month revenue, added clay + powder.',

    keyPeople: 'Dillon Latham (founder, visible in all content)',
    narrativeArcs: 'Real journey: "Spent $50 on Based, it sucked" → "Made my own formula" → "Thousands use it now"',

    marketPosition: 'Sweet spot: $20 (vs Based $50+, vs drugstore $5 that sucks)',
    nicheDefinition: 'Gen Z guys (16-25) who care about looking good, trust creators, want authenticity',
    targetNeedsUnmet: 'Nobody combines authentic founder + natural ingredients + fair pricing',
    emotionalDifferentiation: 'Customers feel smart (not overcharged), authentic (brand is real), confident (works)',
  },

  audience: {
    name: 'Jake, The Textured Guy',
    ageRange: '16-25 (Gen Z, peak TikTok)',
    location: 'USA, Canada',
    income: '$0-40k (students, entry-level)',
    job: 'High school / college / first job',
    education: 'HS / College',
    maritalStatus: 'Single',

    currentSituation: 'Sees textured hair on TikTok creators, wants that look. Doesn\'t want to look basic or try-hard. Influenced by friends/creators.',
    desiredSituation: 'Product that gives texture in 2 mins, actually works, affordable, natural',

    painPoints: {
      primary: 'Insecurity about hair. Doesn\'t know which product. Scared to waste money on BS.',
      secondary: 'Tried cheap products, didn\'t work, feels stupid',
      tertiary: 'Can\'t spend $50. No time for complicated routines.',
      deepestPain: 'Fear of looking like he doesn\'t care (boring) OR trying too hard (fake). Wants natural confidence.',
    },

    values: {
      authenticity: 'Hates corporate fake. Trusts real people over brands.',
      ease: 'Won\'t do 5-step routines. Spray, go. Done.',
      affordability: 'Part-time job budget. Can\'t spend $30+ on one product.',
      efficacy: 'Has to actually work or he tells everyone it\'s trash.',
      natural: 'Cares about ingredients. No silicones.',
    },

    platforms: {
      tiktok: '3-4 hrs/day — hair tutorials, trends, creators',
      instagram: '2 hrs/day — hair creators, lifestyle',
      youtube: '1+ hrs/day — long-form hair content',
      amazon: 'Buys if price is right',
    },

    dayInLife: 'Wake 7am → shower + hair 5 mins → school/work 8-5 → gym 5:30-6:30 → dinner → TikTok/YouTube 7-11pm → sleep midnight',
    exerciseHabits: '3-4x/week gym (wants to look good)',
    hobbies: 'TikTok, gaming, skateboarding, friends, trying new looks',
    entertainment: 'TikTok (60%), YouTube (20%), Twitch (10%), Reddit (10%)',
    socialLife: 'Close friends, shows them new products, cares what they think',
    purchaseHistory: 'Tried Based (too expensive), drugstore (felt weird), clay (worked but $30)',

    trustFactors: [
      'Creator uses it (like Dillon)',
      'Friends recommend',
      'Affordable (proves it\'s not just hype)',
      'Reviews from guys his age',
      'Natural ingredients',
    ],
  },

  product: {
    name: 'Sea Salt Spray',
    category: 'Men\'s Haircare → Styling Sprays',
    description: 'Sea salt spray that gives natural texture, light hold, washes out with water. No silicones, no synthetic fragrance. 100ml.',
    format: '100ml spray bottle (aluminum + glass)',
    packaging: 'Minimalist white label, recyclable',
    shelfLife: '2 years unopened, 6 months after opening',

    problemSolved: 'Guys want textured, effortless hair but products are expensive, feel fake, or don\'t work',
    secondaryProblems: 'Doesn\'t want complicated routine, wants to wash out easy, wants natural',

    features: {
      active: 'Real sea salt crystals (gives texture)',
      supporting: 'Coconut oil (conditioning), light resin (8-hour hold, no crunch)',
      format: 'Spray bottle, 100ml, light mist',
      noNos: 'Zero silicones, zero synthetic fragrance, zero harsh chemicals, vegan, cruelty-free',
    },

    functionalBenefits: {
      immediate: 'Spray on damp/dry hair, texture in 1-2 mins',
      allday: 'Holds 8+ hours, no crunch or wet look',
      washout: 'Washes out with water (no residue)',
      versatile: 'Works on all hair types',
    },

    emotionalBenefits: [
      'Looks naturally textured (effortless vibe)',
      'Confidence (school, work, dates)',
      'Looks like TikTok aesthetic',
      'Affordable (no guilt)',
      'Natural ingredients (feels good)',
      'Easy (2-minute routine)',
    ],

    usp: 'Natural sea salt spray at $20.37 (vs Based $50+ or drugstore $5 trash). Only spray designed for Gen Z texture.',
    provenResults: 'Tested on 500+ guys age 16-25, all hair types. 95% say "actually works". Used by Dillon Latham (100k+ followers).',

    resultTimeline: 'First spray: texture visible | Daily: hair adapts | Week 2: optimal',
    guaranteeIfFails: '30-day money back if no texture',

    bestFor: 'Guys 16-25, all hair types, want textured look, value natural + affordable',
    notFor: 'Very curly hair (different routine), guys who like slicked-back, sensitive scalp (patch test)',

    pricing: 'Single: $20.37 | Duo (save 15%): $34.63 | Trio (save 20%): $48.89',
    guarantee: '30-day return, no questions',

    usageFrequency: 'Daily',
    usageDuration: 'Immediate, best after 2-3 days',
    usageInstructions: '1) Spray on damp/dry hair (3-4 spritzes) 2) Work with fingers 3) Dry naturally or blow dry 4) Done',
    compatibility: 'Works alone or with clay. Safe with all styling tools.',
    storage: 'Room temp, shake before use',

    certifications: 'Vegan, cruelty-free, natural, dermatologist-friendly',
    costPerUse: '$0.25 per use',
    comparison: '4x cheaper than Based per oz | Works better than drugstore | Same as salon brands at 1/3 price',

    bundleOptions: [
      'Single ($20.37)',
      'Duo (2x spray, save 15%, $34.63)',
      'Trio (2x spray + clay, save 20%, $48.89)',
    ],
  },

  competitive: {
    mainCompetitors: [
      'Based.co — Threat: brand + ads | Weakness: $50 price, corporate, no founder vibe',
      'Drugstore brands — Threat: $5, everywhere | Weakness: silicone-heavy, fake, doesn\'t work',
      'Premium indie brands — Threat: clean aesthetic | Weakness: $30+, no TikTok, small audience',
    ],

    competitorStrengths: [
      'Based: Big budget, lots of marketing',
      'Drugstore: Everywhere (Walmart, CVS)',
      'Premium: Clean aesthetic, loyal community',
    ],

    competitorWeaknesses: [
      'Based: Too expensive, feels corporate, Dillon way more relatable',
      'Drugstore: Doesn\'t work (Reddit complaints), feels cheap, silicone residue',
      'Premium: No TikTok, can\'t reach Gen Z at scale',
    ],

    yourAdvantage: [
      'Real founder (Dillon) vs faceless corporation',
      'Natural ingredients vs silicone',
      'Fair price ($20) vs Based ($50) or drugstore ($5 that sucks)',
      'TikTok native (where Gen Z finds things)',
      'Creator partnerships (micro-influencers trust)',
      'Authenticity (tested by guys, for guys)',
      'Better formula than drugstore',
    ],

    marketGap: 'Gen Z wants: real founder + natural + TikTok vibe + fair price. Nobody has all four.',
    timelineToDecision: 'Jake sees on TikTok (creator or friend) → clicks → buys in 2 mins (impulse)',
  },

  creative: {
    topPerformingAngles: [
      '\"Get the textured look\" — Transformation, 1-2-3 steps',
      '\"$20 vs $50\" — Price comparison, same results',
      '\"Dillon tested it\" — Creator authenticity',
      '\"Real sea salt\" — Ingredient transparency (vs silicone)',
      '\"Works on all hair\" — Inclusivity (fine to thick)',
      '\"Wash out easy\" — No buildup (vs heavy)',
    ],

    copyDirectives: [
      'Gen Z language (casual, funny, real)',
      'Before/afters with real guys (not models)',
      'Emphasize: natural, affordable, easy, works',
      'Avoid: corporate tone, fake testimonials, overpromising',
      'Lead with Dillon',
    ],

    contentIdeas: [
      'TikTok: 15-30s transformations (spray → texture)',
      'TikTok: Dillon routine with friends',
      'TikTok: \"Testing vs Based.co\" (price compare)',
      'Instagram: Lifestyle (before gym, night out)',
      'YouTube: \"How to get textured hair\" (long-form)',
      'YouTube Shorts: Quick hacks (emergency texture)',
      'Amazon: Use reviews/Q&A to drive conversions',
    ],

    influencerStrategy: 'Micro-creators (50k-500k) like Dillon. Focus: authenticity over reach. Free product + commission.',
  },

  messaging: {
    mainMessage: 'Textured hair that doesn\'t cost $50. Natural ingredients, actually works, 2-minute routine.',
    subclaims: [
      'Real sea salt (not silicone fake)',
      'Holds 8+ hours, no crunch',
      '$20 (4x cheaper than Based)',
      'Washes out easy (no buildup)',
    ],

    callToAction: 'Get your spray now (free shipping on 2+)',
    callToActionVariants: [
      'Variant A: \"Get texture now\" (direct)',
      'Variant B: \"Save 15% on duo\" (incentive)',
      'Variant C: \"Get it before it sells out\" (scarcity)',
      'Variant D: \"Join 10k+ guys using it\" (social proof)',
    ],

    testimonials: [
      '\"Finally looks natural. Not crunchy.\" — Jake, 19',
      '\"Cheaper than everything, actually works.\" — Marcus, 22',
      '\"Friends asked what I used.\" — Devon, 18',
    ],

    linguisticPatterns: [
      'Use \"texture\" not \"hold\"',
      'Use \"natural\" not \"organic\"',
      'Use \"easy\" not \"simple\"',
      'Use \"works\" not \"performs\"',
      'Use \"vibe\" not \"aesthetic\"',
    ],

    objectionHandling: [
      'Q: \"Does it work?\" → A: \"500+ guys tested. Check reviews.\"',
      'Q: \"Is $20 worth it?\" → A: \"Based costs $50, drugstore sucks. Sweet spot.\"',
      'Q: \"Will it wash out?\" → A: \"Water + light shampoo. No residue.\"',
      'Q: \"What does it smell like?\" → A: \"Light coconut. Not perfumy.\"',
      'Q: \"What hair types?\" → A: \"All. Fine to thick.\"',
    ],

    seasonalHooks: [
      'Summer: \"Date szn hair that doesn\'t cost $50\"',
      'School: \"Game day texture\"',
      'Winter: \"Snow day look\"',
      'All year: \"New year new hair\"',
    ],

    valuePropositions: [
      'Price: \"4x cheaper than Based, actually works\"',
      'Quality: \"Natural sea salt (vs silicone)\"',
      'Ease: \"2-minute routine\"',
      'Trust: \"Tested by Dillon + thousands\"',
      'Lifestyle: \"Looks like TikTok\"',
    ],
  },

  platforms: {
    primary: [
      'TikTok (40%) — Where Gen Z discovers, impulse-buys',
      'Instagram (35%) — Lifestyle, micro-creator features',
      'Amazon (25%) — Conversion, reviews drive sales',
    ],

    tiktok: 'Quick transforms, Dillon demos, friend testimonials, price comparisons, hauls',
    instagram: 'Lifestyle pics, creator features, product shots, testimonials, before/afters',
    amazon: 'Drive clicks from TikTok/Insta → Amazon. Optimize listing, incentivize reviews.',
    website: 'simpletics.com (trust, email list, brand story)',

    budget: 'TikTok ads (30%), influencer seeding (40%), Amazon search (20%), organic (10%)',
  },

  researchFocus: [
    'Gen Z male consumer behavior (hair, style, purchasing)',
    'TikTok algorithm wins for men\'s products',
    'Natural haircare market gaps',
    'Based.co positioning weaknesses',
    'Micro-influencer economics',
    'Amazon product discoverability (keywords, reviews)',
  ],
};
