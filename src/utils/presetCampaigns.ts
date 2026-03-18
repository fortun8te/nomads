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

  // Pre-built strategy (used by Brand DNA modal + pipeline seed)
  strategy: {
    primaryAngle: 'Radical Transparency — expose beauty industry lies with data, not marketing',
    supportingAngles: [
      'Founder credibility (Dr. Marit, 15yr dermatologist)',
      'Data-backed claims (every ingredient has published research)',
      'Price-per-use reframe (€0.65/day < coffee)',
      'Supply chain transparency (visit our Amsterdam lab)',
    ],
    toneDirection: 'Educational authority meets friendly skeptic — never talks down, always explains WHY',
    visualDirection: 'Clean, data-first, real skin (no retouching), measurement tools visible, minimalist aesthetic',
    targetPlatforms: ['Instagram', 'TikTok', 'Reddit', 'YouTube'],
    awarenessLevel: 'Problem-Aware → Solution-Aware (they know they need clean skincare but don\'t trust anyone)',
    hookTypes: ['Curiosity (What if your skincare is lying to you?)', 'Proof (15% vitamin C — and the data to prove it)', 'Identity (For the skeptic who reads every label)'],
    avoidList: ['Miracle language', 'Influencer shills', 'Before/after without methodology', 'Buzzwords without data', 'Pink tax aesthetics'],
  },

  // Pre-built personas (used by Brand DNA modal + pipeline seed)
  personas: [
    {
      name: 'Emma, The Conscious Skeptic',
      age: '32-38',
      role: 'Senior product manager at tech company (analytical, research-driven)',
      corePain: 'Fear of being duped by greenwashing — has been burned by "clean" brands that weren\'t clean',
      deepDesire: 'Confidence in beauty choices, aging gracefully without vanity, being the smart buyer who made the right call',
      buyingTrigger: 'Bad skin day + reads favorable Reddit testimonial + remembers the brand from data-backed Instagram post',
      objections: [
        'Is natural really effective? (needs clinical data)',
        'Am I paying for packaging? (needs price/use breakdown)',
        'How do I know the ingredients are what you say? (needs supply chain proof)',
        'Will this work for MY skin? (needs money-back guarantee)',
      ],
      platforms: 'Instagram (3hrs/day), Reddit r/SkincareAddiction (30min/day), YouTube (2x/week)',
      identityShift: 'From "skeptic burned by marketing lies" → "someone who found a brand worthy of trust"',
    },
  ],
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
  id: 'simpletics-seasalt-vanilla',
  label: 'Simpletics Vanilla Voyage Sea Salt Spray',

  brand: {
    name: 'Simpletics',
    website: 'simpletics.com',
    socials: '@simpletics TikTok | @simpletics Instagram | YouTube: Simpletics',
    description: 'Clean, straightforward haircare for people who want real texture without the BS. Simpletics Sea Salt Spray — Hair Texturizing. Clear & Direct. Confident. Minimal but Human. Honest & Transparent. No unnecessary ingredients. No unnecessary steps.',
    industry: 'Beauty / Haircare / Styling Sprays',
    positioning: 'Premium haircare without complexity. Clear, honest, straightforward solutions for textured hair. For people tired of complicated routines and empty promises.',
    tone: 'Clear & Direct (clean, straightforward, no fluff). Confident but not arrogant (clarity does the talking). Minimal but Human (subtle wit, warm). Simple over Scientific (explain the why, avoid jargon). Honest & Transparent (say what it does, mean it, no hype).',
    colors: 'Black #000000 (primary text, logo) + Charcoal #252520 (dark backgrounds) + Simple Blue #3D78E3 (accents) + Midnight Slate (premium feel) + White #FFFFFF (clean). Product variants: Polar Pine Green #2E5D2B, Vanilla Voyage Brown #8B6F47, Woodern Waves Red #A02B2B, Pineapple Paradise Yellow #D7AE13, Tropical Tide Orange #E67E22.',
    fonts: 'Suisse Intl (primary font, geometric, modern, minimalist). Medium weight for headlines, Regular for body. 35% line height, -5% letter spacing. All-caps headlines for clarity.',
    personality: 'The Straightforward Professional — clear about what works, confident in results, minimal design, honest about everything. No hype, no nonsense.',
    bigEnemy: 'Complex routines, empty promises, greenwashing, overpriced simple products, complicated branding that confuses customers.',
    brandWhy: 'Because good hair shouldn\'t take effort. We make it straightforward. No unnecessary complexity. Just results.',

    categoryBeliefs: [
      '"Good hair = complicated routine" — Myth. One spray. Done. (vs indie 5-step, Based "curated collection", drugstore "daily routine")',
      '"Natural = ineffective" — Myth. Our formula proves sea salt > silicone buildup. Clinical testing backing every claim.',
      '"Transparent products cost more" — Myth. Fair pricing at $20, same as Based charges for silicone masks.',
      '"Premium = overhyped" — Myth. Our results speak clearly. 4.8-star real reviews, not influencer-paid testimonials.',
      '"Buying quality means overpaying" — Myth. We prove premium quality at fair prices is possible.',
    ],

    // DETAILED BRAND POSITIONING
    brandPositioningStatement: 'The straightforward hair brand for Gen-Z males who value real results over hype. Premium quality without premium guilt. Transparent ingredients. Fair pricing. Real science. One spray that actually works.',

    brandVsCompetitors: {
      vsBased: 'Based = aesthetic hype + silicone mask. Simpletics = real ingredients + real hold. Based for Instagram photos. Simpletics for actual hair health.',
      vsDrugstore: 'Drugstore = cheap + damaging. Simpletics = premium quality + fair price. Drugstore breaks hair. Simpletics builds confidence.',
      vsIndie: 'Indie = authentic + limited. Simpletics = authentic + scalable. Indie is your friend. Simpletics is your friend who scaled without selling out.',
    },

    founderPersona: 'Dillon Latham (face of brand, ~1.9M TikTok followers) + Oli Maitland (co-founder, runs SocialSellr). Dillon is a Gen-Z creator who built a massive hair/grooming following. Wall Street Journal featured his hair — overwhelming demand led to creating his own line. Oli brought ecommerce + business expertise. Together: creator authenticity + business scale.',
    foundingStory: 'Founded May 2024. Dillon Latham built 1.9M TikTok following creating hair content. WSJ featured his hair — fans demanded his exact routine. Partnered with Oli Maitland (ecommerce expert) to build Simpletics. Mission: high-quality products that protect from harsh chemicals while delivering exceptional results. Tested 30+ salt sources, 50+ formulations. Chose pink himalayan (best crystal size + mineral profile). Settled on 5-ingredient recipe because adding anything else was unnecessary.',
    firstProduct: 'Sea Salt Spray. R&D: tested 30+ salt sources. Chose pink himalayan (best crystal size + mineral profile). Tested 50+ formulations. Settled on 5-ingredient recipe because adding anything else was unnecessary.',
    pivotalMilestones: [
      'May 2024: Launched Simpletics with Vanilla Voyage Sea Salt Spray. 5 scent variants with distinct color identity.',
      '6 months: 1 billion+ social views across TikTok. Best-selling sea salt spray on TikTok Shop.',
      '2024: 200,000+ customers worldwide. Amazon\'s Choice designation. Expanded to Texture Powder + Hair Clay.',
      '2025: Featured in GQ, New York Times, FORTUNE. 49% repurchase rate (industry-leading). Available on Amazon, Walmart, Target.',
      'Now: 3 core SKUs (Spray $23.97, Powder $22.97, Clay $24.97). Subscribe & save program. Free spray on orders $45+.',
    ],

    keyPeople: 'Dillon Latham (co-founder, face of brand, 1.9M TikTok) | Oli Maitland (co-founder, ecommerce/SocialSellr) | Based in Miami, Florida.',

    // Real social media presence (from research)
    socialMediaPresence: {
      tiktok: '@dillon.latham (1.9M followers) + @simpletics (brand account)',
      instagram: '@simpletics',
      snapchat: '@simpleticss',
      twitter: '@Dillonxlatham',
      tiktokShop: 'Best-selling sea salt spray on TikTok Shop',
      hashtagReach: '#Simpletics: 1 billion+ views in first 6 months',
    },

    // Sales channels (from research)
    salesChannels: {
      primary: 'simpletics.com (Shopify DTC)',
      marketplaces: ['Amazon (Amazon\'s Choice)', 'Walmart', 'Target (online)'],
      social: 'TikTok Shop (best-seller category)',
    },

    // Growth metrics
    growthMetrics: {
      customersWorldwide: '200,000+',
      unitsSold: '200,000+',
      averageRating: '4.8 stars',
      repurchaseRate: '49%',
      socialViews: '1 billion+ in first 6 months',
      mediaFeatures: ['GQ', 'New York Times', 'FORTUNE', 'Wall Street Journal'],
    },

    narrativeArcs: [
      '"Too many products, too many steps" → "One spray, done" (value prop clarity)',
      '"Confusing ingredients, fake claims" → "5 ingredients, all explained" (transparency)',
      '"Broke after buying products that don\'t work" → "Fair pricing, real value" (pricing)',
      '"Exhausted by hype, influencer BS" → "Real results, no marketing nonsense" (positioning)',
      '"Tried Based, got silicone buildup" → "Real sea salt, zero buildup" (competitive positioning)',
    ],

    marketPosition: 'Fair price (~$20), honest ingredients, clear results, minimal routine.',
    nicheDefinition: 'People 18-35+ who want textured hair without complexity, value transparency, tired of hype.',
    targetNeedsUnmet: 'Everyone combines complicated + overpriced + unclear. Simpletics = straightforward + fair + honest.',
    emotionalDifferentiation: 'Customers feel confident (works), smart (understand it), relieved (no complexity).',
  },

  audience: {
    name: 'Sam, The Clarity Seeker',
    tagline: 'The guy who refuses to be marketed to. Wants real results, transparent brands, and his morning back.',
    ageRange: '15-30 (PRIMARY: Males 15-30 | SECONDARY: Women & mothers on Amazon)',
    location: 'USA, Europe, Canada (urban + suburban, heavy TikTok penetration)',
    income: '$15k-100k+ (varies by segment, disposable income for quality)',
    job: 'Students, creative professionals, early-career, content creators, designers, marketers',
    education: 'High school to college educated (many STEM-leaning)',
    maritalStatus: 'Primarily single, some couples',

    // VIVID PERSONA DIMENSION
    psychographicProfile: {
      archetype: 'The Skeptical Realist — trusts data over hype, brands over influencers, transparency over marketing',
      core_belief: '"Most products are BS. I need the exception."',
      worldview: 'Marketing lies. Influencers are paid. Most brands are copying each other. I\'m going to find the real thing.',
      decision_style: 'Analytical but quick. Will research if he cares. Once convinced, he\'s loyal.',
      risk_tolerance: 'Low. Hates wasting money. Needs proof before buying.',
    },

    // Updated from Google Doc strategic brief
    primarySegment: {
      gender: 'Male',
      ageRange: '15-30',
      description: 'Primary target: Gen-Z males seeking style confidence, health-conscious, socially aware',
      voicePattern: 'Casual, vernacular ("fire", "no literally", "bro", "actually works")',
      confidence: 'Moderately confident in his style, wants reassurance he\'s not "trying too hard"',
      socialmediaBehavior: 'Creator on TikTok/Instagram OR lurker who respects good content. Judges harshly.',
    },
    secondarySegment: {
      gender: 'Female/Mothers',
      ageRange: 'Varies',
      channel: 'Amazon',
      description: 'Secondary: Women and mothers discovering via Amazon marketplace',
      voicePattern: 'Practical, time-starved ("need this to work fast")',
      confidence: 'High — mothers are task-focused, want reliable solutions',
      socialmediaBehavior: 'Trusts Amazon reviews more than Instagram ads',
    },

    // SAM'S MENTAL MODEL
    mentalModel: {
      onBranding: 'If a brand is "trying too hard" with aesthetic, it\'s insecure. Real brands let results speak.',
      onPricing: 'Premium = either quality or hype. $20 for 8-hour hold is smart. $50 for silicone is stupid.',
      onTestimonials: 'Real testimonials have specific details. Fake ones are vague ("changed my life" = red flag).',
      onMarketing: 'If they\'re spending on influencers, they\'re not spending on product. Simple math.',
      onTrustSignals: 'Transparence builds trust faster than any campaign. Just show me what\'s in it.',
    },

    currentSituation: 'Tired of overly complex routines and unclear claims. Has been burned by Based, drugstore, indie brands. Values time above all. Scrolls Instagram/TikTok for inspiration but immediately dismisses sponsored content. Wants to look good without guilt or complexity.',
    desiredSituation: 'Hair that looks textured + effortless WITHOUT being try-hard. One product. Clear results. Honest brand. Walk into meetings/photos with confidence. No second-guessing if he wasted money.',
    deepestFear: 'Looking like he cares too much about his appearance + being duped by marketing BS.',
    deepestDesire: 'Confidence. Being in control of his image. Not worrying about falling for hype.',

    painPoints: {
      primary: 'Complicated routines & unclear products. Hates guessing if something works or trying 5 products when one would do.',
      secondary: 'Broken promises & hype. Tired of buying products with dramatic claims that don\'t deliver. Wants transparency, not marketing.',
      tertiary: 'Time-starved. Morning is chaotic. Needs something that works in 2 minutes or doesn\'t exist in his routine.',
      quaternary: 'Overpaying for brands he doesn\'t trust. $50 for silicone when $20 for real stuff exists.',
      deepestPain: 'Fear of looking "basic" AND fear of looking like he\'s "trying too hard" — wants effortless confidence.',
    },

    values: {
      transparency: 'PARAMOUNT. Wants to understand WHAT is in products and WHY it works. Reads ingredients carefully. Respects brands that admit tradeoffs.',
      simplicity: 'Complexity = insecurity in brand. Simple = confident. If they can explain it in 2 sentences, he trusts them.',
      authenticity: 'Despises corporate speak. Prefers founder stories. Direct communication over marketing-speak.',
      timeValue: 'Most precious resource. Won\'t spend 10 mins on hair routine. Product must integrate into 2-minute morning.',
      fairPrice: 'Not cheap, but honest value. Willing to spend $20 for something that works. Resents paying $50 for hype.',
      minimalism: '"One product that does the job well" > "5 products + 10-step routine." Quality over quantity.',
    },

    // SAM'S LANGUAGE PATTERNS
    languagePatterns: {
      whenHappy: '"Actually works", "no cap", "this is fire", "doesn\'t look like I\'m trying"',
      whenFrustrated: '"This is mid", "seems overpriced for what it is", "another hype product", "just marketing BS"',
      whenDeciding: '"Let me read the reviews", "what\'s actually in this?", "are people faking testimonials?", "is this worth $20?"',
      commonPhrases: '"Transparent", "clean", "minimal", "honest", "real results", "no BS"',
    },

    platforms: {
      instagram: '1-2 hrs/day — inspiration, design, lifestyle, trustworthy brands only. Skips ads.',
      tiktok: '30 min/day — trends, creator authenticity, sometimes responds to haul/review videos',
      youtube: '1+ hrs/day — long-form reviews, educational content, "does this actually work?" videos',
      reddit: 'Lurks r/haircare, r/malefashion, distrusts obvious ads, RESPECTS detailed comparisons',
      email: 'Subscribes to 3-4 quality brands. Reads newsletters if they\'re educational, not salesy.',
      twitter: 'Lurks, occasionally posts opinions on overrated products',
    },

    dayInLife: {
      schedule: 'Wake 6-7am → 5 min shower → 2 min hair routine (spray + go) → work/meetings 8-6pm → gym/creative time 6-8pm → dinner → Instagram/YouTube scroll 8-11pm → sleep',
      hairRoutineExact: 'Damp hair → 3-4 sprays → work with fingers → blow dry (optional) → done',
      friction_point: 'Current drugstore stuff doesn\'t hold past 2pm. Can\'t spend more than 5 mins total.',
      ideal_scenario: 'Spray on, looks good all day, washes out with water, doesn\'t feel crunchy, doesn\'t cost $50.',
    },

    exerciseHabits: '4-5x/week gym OR running (wants to look good, health-conscious)',
    hobbies: 'Design, photography, video creation, travel, fitness, learning new skills',
    entertainment: 'YouTube (40%) → Instagram (30%) → TikTok (20%) → Reddit/podcasts (10%)',

    socialLife: 'Small, quality friend group (3-5 close friends). Instagram-active but selective. Selective about brand recommendations. When he trusts something, he tells friends directly.',
    influenceInNetwork: 'His opinion matters to friends. If he says "this is actually good", friends will try it.',

    purchaseHistory: {
      pastMistakes: 'Tried Based ($50, got greasy buildup). Tried drugstore sprays (crunchy, didn\'t hold). Tried indie brands (inconsistent, hard to find).',
      currentSituation: 'Uses basic drugstore or nothing. It works but uninspiring.',
      willingness: 'Will pay $20 for something proven. But needs to see proof first.',
    },

    // WHAT CONVERTS SAM
    trustFactors: [
      'Transparent ingredients + brief explanation of what each does',
      'Brand admits limitations ("not for very curly hair")',
      'Authentic creator recommendation (not paid partnership)',
      'Real testimonials with SPECIFIC details ("hair feels soft but bounce is there")',
      'Fair pricing (no artificial premium)',
      'Founder story (why they built it)',
      'Featured in legitimate media (GQ, NYT, not influencer blogs)',
    ],

    // OBJECTION HANDLING FOR SAM
    samObjections: {
      'Does it actually work?': 'Shows 4.8 stars + Connor testimonial (specific, not generic)',
      'Is $20 worth it?': 'Comparison: "Based is $50 for silicone. We\'re $20 for real sea salt. 4x cheaper, better formula."',
      'Will it work for MY hair?': 'Show before/afters with different hair types + honest admission: "Not for very curly hair"',
      'Is this just hype?': 'Ingredient list + explanation of pink himalayan salt + water solubility',
      'Will it wash out?': 'Water + light shampoo. No buildup after 2+ weeks (vs Based buildup in week 2).',
    },
  },

  // RESEARCHER PERSONAS — How agents present findings
  researcherPersonas: {
    system_prompt_template: 'You are researching for Sam, The Clarity Seeker. Be direct. Be specific. No fluff. Sam hates marketing BS—show him facts, comparisons, proof.',

    researcher_glm: {
      name: 'Strategist GLM (Orchestrator)',
      role: 'High-level analyzer, decision-maker, synthesis expert',
      personality: 'Thinks 3 steps ahead. Sees patterns. Decisive. Translates chaos into clarity.',
      voiceStyle: 'Authoritative, clear, strategic. "Here\'s what matters..."',
      outputStyle: 'Structured analysis, prioritized findings, strategic recommendations',
      example_output: 'KEY INSIGHT: Sam\'s top pain point is buildup after 2 weeks with competitive sprays. Our sea salt advantage addresses this directly. Research priority: Find testimonials mentioning "no buildup" or "clean scalp" comparisons.',
    },

    researcher_lfm: {
      name: 'Practical Researcher LFM (Ground Truth)',
      role: 'Web researcher, detail finder, evidence gatherer',
      personality: 'Thorough. Skeptical. Finds what\'s actually true vs claimed.',
      voiceStyle: 'Matter-of-fact, specific. "Found this on Reddit...", "Three users mentioned..."',
      outputStyle: 'Concrete findings, direct quotes, source citations',
      example_output: 'FOUND: r/haircare thread comparing Based vs alternatives. 12 users mention silicone buildup after 2-3 weeks. Zero alternatives mentioned in top comments = market gap.',
    },

    researcher_vision: {
      name: 'Visual Intelligence (Vision Model)',
      role: 'Image analysis, competitor creative inspection, design insights',
      personality: 'Visual thinker. Spots design patterns. Sees what\'s being communicated without words.',
      voiceStyle: 'Observational, specific. "This image shows...", "Notice the design choice..."',
      outputStyle: 'Visual observations, design insights, creative patterns',
      example_output: 'VISUAL INSIGHT: Based ads use lots of glossy/wet hair. Simpletics should own "matte effortless" positioning visually. Their carousel images don\'t show testimonial specificity—just generic before/afters.',
    },

    reflection_agent: {
      name: 'Quality Check Agent',
      role: 'Ensures research quality, identifies gaps, suggests follow-ups',
      personality: 'Critical but fair. Asks tough questions. "Have we actually proven this?"',
      voiceStyle: 'Questioning, thoughtful. "We\'re 70% confident on X, need more on Y"',
      outputStyle: 'Gap analysis, confidence levels, follow-up research priorities',
      example_output: 'RESEARCH GAP: We have strong evidence on competitive weakness (silicone buildup). NEED: Direct customer testimonials comparing Simpletics vs Based specifically. Current: only general praise. Priority: Find 3-5 direct comparison reviews.',
    },
  },

  // RESEARCH METRICS FOR UI VISIBILITY
  researchMetricsTemplate: {
    tracking: {
      totalSearchesRun: 'Tracks how many search queries executed across all phases',
      visualAnalyzesRun: 'Tracks how many images analyzed via vision model',
      subagentsDeployed: 'Tracks how many parallel researcher subagents active',
      webPagesScraped: 'Tracks how many unique pages fetched via Wayfarer',
      apiCallsUsed: 'Tracks API usage across Qwen 3.5 model variants',
      topicsResearched: 'Topics covered (audience, competitive, messaging, etc)',
      timelinePerPhase: 'Elapsed time per research phase',
      confidenceLevelPerTopic: 'Research confidence 0-100% per dimension',
    },

    uiDisplayFormat: {
      phaseHeader: '[PHASE 2] Web Research | Searches: 24 | Visual: 3 | Subagents: 3 | Pages: 87 | Confidence: 78%',
      progressBar: 'Coverage: ████████░░ 78% (Need more on: Email effectiveness, Influencer pricing)',
      agentActivity: 'Researcher 1 (warm traffic analysis) → Researcher 2 (competitor creatives) → Researcher 3 (Reddit deep dive)',
      metricsFooter: 'Total time: 8 min 34 sec | API calls: 47 | Highest signal: Competitor weakness (silicone buildup)',
    },
  },

  product: {
    name: 'Vanilla Voyage Sea Salt Spray',
    variant: 'Vanilla Voyage',
    category: 'Haircare → Styling Sprays',
    description: 'The Simpletics Vanilla Voyage Sea Salt Spray — effortless texture in one spray. Infused with real pink himalayan salt and warm vanilla essential oil, it gives your hair natural body, volume, and a matte finish with a subtle, warm vanilla scent. No fluff. No unnecessary ingredients. Just results. Works on all hair types. Spray on damp or dry, work with fingers, done.',
    format: '8oz / 237ml white plastic spray bottle',
    packaging: 'Clean white bottle with brown Simpletics branding. Vertical "Simpletics" text in warm brown, "Vanilla Voyage" + "Paraben Free" at top, "Hair Texturizing Sea Salt Spray 8 oz/237 ml" at bottom. White spray actuator. Minimalist, premium feel.',
    shelfLife: '2 years unopened, 6 months after opening',

    // Product Line (from Google Doc strategic brief)
    productLine: [
      { name: 'Sea Salt Spray', ingredients: 5, description: 'Texture + volume with pink himalayan salt' },
      { name: 'Texture Powder', ingredients: 4, description: 'Lightweight volumizing powder for all hair types' },
      { name: 'Hair Clay', ingredients: 6, description: 'Strong hold, matte finish, adjustable application' },
    ],

    // Sales & Distribution (from Google Doc)
    salesChannels: ['Shopify (primary DTC)', 'TikTok Shop', 'Amazon (primary marketplace)', 'Walmart'],
    trafficSources: ['Organic social (TikTok/Instagram)', 'Amazon Ads', 'TikTok Ads/affiliates', 'Meta ads', 'SEO', 'Google Ads'],
    funnelMetrics: {
      mobileTraffic: '80%',
      mobileCheckoutDropoff: '80% (carousel is doing 90% of conversion work)',
      repurchaseRate: '49% (strong product-market fit signal)',
      targetCarouselImages: '8-image maximum (Amazon)',
    },
    activeVariant: 'Vanilla Voyage',
    variantColor: '#8B6F47 (warm brown)',
    variantVibe: 'Warm, approachable, classic vanilla. Subtle sweet scent — not overpowering. Comforting, like a warm cookie. Evokes coziness, softness, effortless style.',
    scents: [
      'Polar Pine Green (#2E5D2B) — Fresh, earthy, natural',
      'Vanilla Voyage Brown (#8B6F47) — Warm, approachable, classic [THIS VARIANT]',
      'Woodern Waves Red (#A02B2B) — Bold, confident, passionate',
      'Pineapple Paradise Yellow (#D7AE13) — Optimistic, energetic, fun',
      'Tropical Tide Orange (#E67E22) — Vibrant, playful, energetic',
    ],

    problemSolved: 'People 18-40 want textured, effortless hair without complicated routines. Tired of expensive products with empty promises. Value transparency, hate guessing.',
    secondaryProblems: 'Doesn\'t want complicated routine, wants to wash out easy, wants natural ingredients, needs immediate results, doesn\'t want to overpay for basics',

    ingredients: [
      'Water',
      'Essential Oil',
      'Pink Himalayan Salt',
      'Potassium Sorbate',
      'Gum Arabic',
    ],

    features: {
      active: 'Real pink himalayan salt crystals (gives texture + volume)',
      supporting: 'Essential oil (natural scent), gum arabic (light hold, no crunch), potassium sorbate (preservative)',
      format: 'Spray bottle, 100ml, light mist',
      noNos: 'Zero silicones, zero synthetic fragrance, zero harsh chemicals, vegan, cruelty-free',
    },

    functionalBenefits: {
      immediate: 'Spray on damp/dry hair, texture in 1-2 mins',
      allday: 'Holds 8+ hours, no crunch or wet look',
      washout: 'Washes out with water (no residue)',
      versatile: 'Works on all hair types (fine to thick)',
      matte: 'Natural matte finish (not shiny/wet)',
    },

    emotionalBenefits: [
      'Looks naturally textured (effortless vibe — looks like you didn\'t try)',
      'Confidence (school, parties, social media)',
      'Looks like TikTok aesthetic (beachy, undone, cool)',
      'Affordable (no guilt asking parents or spending birthday money)',
      'Natural ingredients (feels good, not chemical)',
      'Easy (literally spray + go, 2-minute routine)',
      'Scent is subtle (Vanilla Voyage, light coconut, not overwhelming)',
    ],

    usp: 'Real pink himalayan salt spray at ~$20 (vs Based $50+ or drugstore $5 trash). Endorsed by 200k+ customers. 4.8-star reviews. Featured in GQ, New York Times, FORTUNE.',
    provenResults: '200,000+ Happy Customers | 200,000+ Units Sold | 4.8 Stars | Tested by real teens (Connor\'s review: "smells SOOO good, actually works, hair feels soft but still has bounce, makes hair feel fuller and thicker")',

    resultTimeline: 'First spray: texture visible | Daily: hair adapts to product | Week 2+: optimal hold + texture',
    guaranteeIfFails: '30-day money-back guarantee, so you can try every product with complete confidence',

    bestFor: 'Adults 18-40, all hair types, want textured effortless look, value natural + fair price + authenticity + transparency',
    notFor: 'Very curly hair (different routine needed), people who like slicked-back styles, sensitive scalp (patch test first)',

    pricing: 'Single: Save 15% | Duo (MOST LOVED): Save 28% + FREE SHIPPING | Trio (BEST VALUE): Save 32% + FREE SHIPPING',
    pricePointApproach: 'Single feels like a risky test for tight budgets. Duo/Trio bundle pushes free shipping (psychological win). Most teens go Duo.',
    guarantee: '30-day money-back guarantee, no questions asked',

    usageFrequency: 'Daily (for consistent texture)',
    usageDuration: 'Immediate visible result, best after daily use for 2-3 days',
    usageInstructions: 'Our Sea Salt Spray adds both texture, volume, and a natural matte finish with just five all-natural ingredients. Spray on damp or dry hair, work with fingers, blow dry or let air dry.',
    compatibility: 'Works alone or with hair clay. Safe with all styling tools. Washes out with water.',
    storage: 'Room temp, shake before use',

    certifications: 'Vegan, cruelty-free, natural, dermatologist-friendly',
    costPerUse: '~$0.20 per use (100ml, daily use = ~500 uses)',
    comparison: '~4x cheaper than Based per oz | Significantly better than drugstore | Premium quality at fair price',

    bundleOptions: [
      'Single (Save 15%)',
      'Duo MOST LOVED (Save 28% + FREE SHIPPING) ← most popular for teens',
      'Trio BEST VALUE (Save 32% + FREE SHIPPING)',
    ],
  },

  competitive: {
    // TIER 1: PREMIUM POSITIONING — Based, Olaplex (copied market leader positioning)
    basedCompetitor: {
      brand: 'Based (Sea Salt Spray)',
      positioning: 'Premium "lifestyle brand" for Gen-Z aesthetics',
      pricePoint: '$45-50 per bottle',
      ingredients: '8-10 (includes silicones masked as "natural")',
      formulaQualities: {
        actual: 'Silicone blend + sea salt (cheaper salt source than Simpletics)',
        marketed: '"All-natural" (FALSE — heavy silicone component)',
        holdsUp: 'Adds false shine/wet look (not natural matte finish)',
        buildupIssue: 'Silicone accumulates on scalp → hair feels heavier over time',
        washoutClaim: 'Claims "washes out" but requires heavy shampooing',
      },
      marketingStrategy: {
        tactic: 'Influencer-heavy (TikTok creators 500k+ followers paid partnerships)',
        messaging: 'Aspirational lifestyle ("be cool", "fit the aesthetic")',
        socialProof: 'Fake testimonials + curated before/afters (heavily edited)',
        pricingJustification: 'Premium = quality (ignores actual formula)',
        weakPoint: 'Zero transparency on ingredient sourcing or testing',
      },
      marketShare: '~$2-3M annual (estimated), heavy TikTok/Instagram presence',
      targetAudience: 'Trend-followers (less discerning, aesthetic-focused)',
      threatLevel: 'HIGH (aesthetic dominance, brand hype, influencer lock-in)',
      ourAdvantage: [
        'Transparent formula (we show WHY 5 ingredients work, they hide silicones)',
        '4x cheaper ($20 vs $50) with BETTER actual results',
        'Honest about matte finish (natural look) vs their fake shine',
        'No buildup (water-soluble) vs their silicone accumulation',
        'Real ingredients list vs their greenwashing',
        'Longer-lasting (true sea salt hold) vs their initial wow fading in 2-3 hrs',
      ],
    },

    // TIER 2: DRUGSTORE MASS MARKET — Head & Shoulders, Suave, Pantene
    drugstoreCompetitors: {
      examples: ['Head & Shoulders', 'Suave Sea Salt Spray', 'Pantene Gold Series', 'Garnier Fructis'],
      pricePoint: '$3-8 per bottle (impulse-friendly)',
      ingredients: '15-20 (alcohol, silicones, synthetic fragrance, parabens)',
      formulaIssues: {
        primary: 'Alcohol-heavy base (dries hair, causes breakage)',
        secondary: 'Cheap silicones that flake visibly',
        tertiary: 'Synthetic fragrance overpowering',
        holdsUp: 'Initial stiffness (30 mins) then collapses completely',
        actualResult: 'Crunchy, unnatural, damages hair long-term',
      },
      marketingStrategy: {
        tactic: 'Shelf placement + TV advertising (reaching moms, not young guys)',
        messaging: 'Functional ("works", "affordable") — NO lifestyle',
        salesChannel: 'Everywhere (Walmart, CVS, Target) — impulse buying',
        trustBuilder: 'Recognizable brand name (but dated perception)',
        weakness: 'Outdated positioning — doesn\'t appeal to Gen-Z values',
      },
      marketShare: '~$500M+ (total category), but declining with Gen-Z',
      targetAudience: 'Budget-conscious moms, older generations, impulse buyers',
      threatLevel: 'LOW-MEDIUM (price advantage, ubiquity) but low quality perception',
      ourAdvantage: [
        'Actually works (vs drugstore collapse)',
        'Natural ingredients (vs their synthetic fragrance)',
        'Holds 8+ hours (vs drugstore 30-60 mins)',
        'No buildup or crunchiness',
        'Premium positioning WITHOUT premium price',
        'Gen-Z native (they grew up rejecting drugstore brands)',
      ],
    },

    // TIER 3: INDIE PREMIUM — Craft brands (small, authentic, gatekeeping)
    indieCompetitors: {
      examples: ['Local indie hair brands', 'Etsy-based creators', 'Small natural brands'],
      pricePoint: '$25-40 per bottle',
      ingredients: 'Truly natural but often inconsistent formulation',
      strengths: {
        authenticity: 'Real founder story, genuine values',
        community: 'Cult-like loyal followers',
        ingredients: 'Actually natural (no BS)',
        messaging: 'Honest, no corporate speak',
      },
      weaknesses: {
        production: 'Small batches → inconsistent quality',
        scaling: 'Can\'t meet demand (supply constraints)',
        distribution: 'Online only, no retail presence',
        tiktok: 'Minimal TikTok presence (outdated marketing)',
        funnel: 'Low conversion funnel (unclear positioning)',
        pricing: 'Price doesn\'t match quality vs premium brands',
      },
      marketShare: 'Negligible individually, <$100k-500k each',
      targetAudience: 'Conscious consumers, sustainability advocates (niche)',
      threatLevel: 'LOW (can\'t scale, outdated reach, inconsistent)',
      ourAdvantage: [
        'Scale + consistency (they can\'t match our reliability)',
        'TikTok native (they\'re invisible on main platforms)',
        'Fair pricing WITH premium quality (vs their premium price for indie scale)',
        'Transparent brand story (authentic + professional)',
        'National distribution (they\'re local-only)',
        'Supply reliability (they struggle with demand)',
      ],
    },

    // MARKET GAP ANALYSIS
    marketGapAnalysis: {
      gap1: 'Premium Price + Greenwashing (Based, Olaplex) | vs Simpletics | Transparent Pricing + Real Formula',
      gap2: 'Drugstore Quality + Ubiquity | vs Simpletics | Premium Quality + Fair Price',
      gap3: 'Indie Authenticity + Supply Issues | vs Simpletics | Indie Authenticity + Professional Scale',
      primaryOpportunity: 'Transparent + Fair + Natural + Effective = NO COMPETITOR OWNS THIS POSITION',
      secondaryOpportunity: 'Gen-Z native distribution (TikTok/Instagram) + scale = indie brands can\'t compete',
      saturation: 'Market overcrowded at $50 (premium hype), $5 (drugstore trash), scattered $25-30 (indie). Sweet spot at $20 = HIGH OPPORTUNITY',
    },

    // STRATEGIC POSITIONING
    positioningMatrix: {
      based: { price: 'Premium ($50)', quality: 'Fake (silicone)', transparency: 'None', appeal: 'Aesthetic/Hype' },
      drugstore: { price: 'Budget ($5)', quality: 'Poor', transparency: 'None', appeal: 'Convenience' },
      indie: { price: 'Premium ($30)', quality: 'Authentic', transparency: 'High', appeal: 'Values' },
      simpletics: { price: 'Fair ($20)', quality: 'Authentic + Effective', transparency: 'Full', appeal: 'Smart + Values' },
    },

    // DIRECT COMPARISON — WHY SIMPLETICS WINS
    directComparison: {
      vsBasedPricing: 'They charge $50 for silicones. We charge $20 for real sea salt. 2.5x cheaper, 10x better formula.',
      vsBasedQuality: 'Their silicone hype fades in 2-3 hours. Our sea salt holds 8+ hours. Real > hype.',
      vsBasedTrust: 'They hide ingredients. We publish everything. Trust wins over aesthetics long-term.',
      vsDrugstoreValue: 'Drugstore = cheap + crappy. We = premium quality at fair price. No brainer for Gen-Z.',
      vsDrugstoreResults: 'They dry out hair. We condition + texture. Actual vs fake.',
      vsIndieScale: 'Indies = authentic but can\'t scale. We = authentic + scale. Best of both worlds.',
      vsIndieAvailability: 'Indies = hard to find. We = Amazon + TikTok Shop + everywhere. Accessibility.',
    },

    mainCompetitors: [
      'Premium brands (Based, Olaplex) — Threat: aesthetic hype + influencer lock-in | Weakness: greenwashing ($50 silicone masks), short-lived hold, buildup',
      'Drugstore brands (Head & Shoulders, Suave) — Threat: ubiquity + impulse pricing | Weakness: damaging formulas (alcohol-heavy), crunchy results, outdated for Gen-Z',
      'Indie premium brands — Threat: authentic positioning + values alignment | Weakness: supply-limited, TikTok-invisible, inconsistent quality, can\'t scale',
    ],

    competitorStrengths: [
      'Based/Premium: Influencer partnerships, aesthetic brand hype, perceived exclusivity, big marketing budgets',
      'Drugstore: Everywhere (impulse-friendly), household names, low price, retail relationships',
      'Indie: Founder authenticity, genuine values, community loyalty, real ingredients',
    ],

    competitorWeaknesses: [
      'Based/Premium: Actual formula is silicone (greenwashing), short hold (2-3 hrs), buildup issues, zero transparency, overpriced for actual value',
      'Drugstore: Damaging (alcohol content), poor hold (30-60 mins), crunchy feel, fake testimonials, outdated positioning, Gen-Z perception = cheap + bad',
      'Indie: Can\'t scale (supply constraints), no TikTok presence, pricing doesn\'t match indie scale, inconsistent batches, limited reach',
    ],

    yourAdvantage: [
      'Transparent formula + WHY it works (Based hides silicones, drugstore hides alcohol, indie unclear)',
      'Fair price ($20) — premium position without premium guilt (vs Based $50 overpay)',
      'Authentic results + scale (indie authenticity WITH professional consistency)',
      'Natural ingredients + real effectiveness (drugstore fake effectiveness, indie hits/misses)',
      'Gen-Z native distribution (TikTok/Amazon/Instagram — where they actually shop)',
      'Straightforward messaging (honest limitations builds trust vs all competitors\' false claims)',
      '8+ hour hold + zero buildup (Based collapses in 2-3, drugstore flakes, indie inconsistent)',
      'Real sea salt sourcing (Based cheap silicone salt, drugstore + indie unclear)',
    ],

    marketGap: 'Gen-Z males 15-30 want: transparent + fair price + natural + actually works + found on TikTok. Based owns hype but not quality. Drugstore owns ubiquity but not Gen-Z appeal. Indie owns authenticity but not scale. Simpletics = all 4 + scale.',
    timelineToDecision: 'Sam sees Based hype on TikTok → skeptical of price → finds Simpletics on TikTok creator review → reads transparent ingredients → checks 4.8 stars + Connor testimonial → buys in 8 mins (vs Based 15 mins of hype research)',

    // MESSAGING OPPORTUNITIES BY COMPETITOR
    messagingVsBasedAngle: 'Stop paying $50 for hype. Real sea salt at real price ($20). Hold lasts longer. No silicone buildup.',
    messagingVsDrugstoreAngle: 'Drugstore dries you out. We actually condition while you style. For guys who care about hair quality.',
    messagingVsIndieAngle: 'Indie + authentic? We got that. Also: actually available, consistent, and on TikTok (where you actually are).',
  },

  creative: {
    topPerformingAngles: [
      '\"No Unnecessary Complexity\" — Positioning, simplicity hook',
      '\"Transparent Ingredients\" — VS competitor greenwashing',
      '\"$20, not $50\" — Fair price positioning',
      '\"Real Results, Real People\" — Social proof (200k+ customers)',
      '\"Honest Limitations\" — What it\'s NOT for (builds trust)',
      '\"Before/After\" — Real texture transformation (2 mins)',
    ],

    copyDirectives: [
      'Clear & Direct (clean, straightforward sentences, zero fluff)',
      'Confident but honest (let clarity do the talking)',
      'Minimal but Human (subtle warmth, no corporate coldness)',
      'Simple over Scientific (explain why, avoid jargon unless necessary)',
      'Honest & Transparent (say what it does, what it doesn\'t, why)',
      'Lead with WHAT IT DOES, then WHY it works',
      'Include one honest limitation or tradeoff (builds massive trust)',
      'Avoid: corporate speak, overblown claims, fake testimonials, unnecessary adjectives',
    ],

    contentIdeas: [
      'TikTok/Instagram: 15-30s before/afters (spray → texture in real time)',
      'TikTok: \"I tried competitor spray for $50, here\'s Simpletics at $20\" (comparison)',
      'TikTok: Micro-creator authenticity (not polished, real hair)',
      'Instagram: Lifestyle (morning routine, work meetings, casual photos)',
      'Instagram: Testimonial carousel (\"What people say\" + real quotes)',
      'YouTube: Deep-dive (why we use himalayan salt, not silicone, ingredient science)',
      'YouTube Shorts: \"Does it actually work?\" (skeptical angle, then proof)',
      'Blog/Email: Transparent guides (\"Best For / Not For\", honest FAQs)',
      'Reddit: Authentic seeding (answer r/haircare questions honestly)',
    ],

    influencerStrategy: 'Micro to mid-tier creators (50k-300k). Focus: authenticity + transparency. Free product + commission. Prioritize creators who challenge claims.',
  },

  messaging: {
    // Core emotional anchor (from Google Doc)
    coreEmotionalAnchor: 'I never knew you could make hair products this well with actually good ingredients—I\'m never going back.',
    emotionalSupport: [
      'Hair feels cleaner after use',
      'Styling is effortless and perfect',
      'Product outperforms expectations',
      'Viral credibility reinforced',
    ],

    mainMessage: 'Good hair shouldn\'t take effort. Clear. Straightforward. No unnecessary complexity. Just results.',
    brandTagline: 'No Unnecessary Ingredients. No Unnecessary Steps.',
    heroMessage: 'Sea Salt Spray for controlled texture and natural volume.',
    secondaryMessage: 'Matte Clay with a clean, shine-free finish. Strong hold, zero fuss. Texture Powder that lifts instantly and stays put all day.',

    // Brand relationship model (from Google Doc)
    brandPersona: {
      current: 'Friend brand (anchored to influencer Dillon)',
      aspiration: 'Dr. Squatch-level brand development (trust, authenticity, community)',
      culturalTone: 'Must reflect TikTok language and Gen-Z "brainrot" vernacular — authentic, not mainstream adaptation',
    },

    subclaims: [
      'Real pink himalayan salt (5 simple ingredients, all justified)',
      'Holds 8+ hours strong, zero fuss',
      'Washes out completely (no buildup, no residue)',
      'Natural matte finish (looks like you didn\'t try)',
      'Works on all hair types (fine to thick)',
      'Transparent pricing, honest results',
    ],

    callToAction: 'Get your spray now (free shipping on 2+)',
    callToActionVariants: [
      'Variant A: \"Get texture now\" (direct, no fluff)',
      'Variant B: \"Save 28% on duo + free shipping\" (incentive, value play)',
      'Variant C: \"Join 200k+ guys using it\" (social proof, FOMO)',
      'Variant D: \"Try it with our 30-day guarantee\" (risk removal)',
    ],

    testimonials: [
      '\"It smells SOOO good, and it works really good aswell, nothing is dry, and my hair feels soft, but still has bounce and isn\'t stiff, but has great hold. Would buy for $45, and makes my hair feel fuller and thicker.\" — Connor Morgan, Verified Purchase (Dec 14, 2024)',
      '\"Finally looks natural. Not crunchy.\" — Jake, 19',
      '\"Cheaper than everything, actually works.\" — Marcus, 22',
      '\"Friends asked what I used.\" — Devon, 18',
    ],

    linguisticPatterns: [
      'Use \"texture\" not \"hold\"',
      'Use \"natural\" not \"organic\"',
      'Use \"straightforward\" not \"simple\"',
      'Use \"works\" not \"performs\"',
      'Use \"clear\" not \"transparent\" (for brand voice, not ingredients)',
      'Use \"effortless\" not \"minimal effort\"',
      'Use \"spray and go\" not \"quick application\"',
      'Use \"honest\" and \"clear\" tone — avoid corporate speak',
      'Use real language: \"actually works\", \"no BS\", \"transparent pricing\"',
    ],

    objectionHandling: [
      'Q: \"Does it work?\" → A: \"200k+ customers, 4.8 stars. Connor says: \'actually works, makes hair feel fuller\'. Check reviews.\"',
      'Q: \"Is it worth $20?\" → A: \"Based costs $50, drugstore sucks. This is the sweet spot. Save 28% on duo anyway.\"',
      'Q: \"Will it wash out?\" → A: \"Completely. Water + light shampoo. No residue or buildup.\"',
      'Q: \"What does it smell like?\" → A: \"Vanilla Voyage — light coconut, not perfumy. Actually smells good.\"',
      'Q: \"What hair types?\" → A: \"All. Fine, medium, thick. Even your friend\'s curly hair (though might work differently).\"',
      'Q: \"Is it just hype?\" → A: \"Nope. Real sea salt from Simpletics. Tested by 200k+ guys. See the reviews.\"',
    ],

    // Strategic objection framework from Google Doc
    strategicObjections: {
      'Premium pricing': 'Longer-lasting, superior results justify investment. Compare cost-per-use to competitors.',
      'Hair type compatibility': 'Tested across all hair types, adjustable application intensity for different needs.',
      'Sticky/dry texture feel': 'Lightweight formulas engineered specifically to avoid undesirable textures.',
      'Natural product efficacy': 'Balances clean ingredients with styling science — efficacy without chemicals.',
      'Product duplication': '4-6 ingredient formula vs. competitors\' alcohol/silicone complexity.',
      'Residue/buildup concerns': 'Water-soluble, washes out completely, no residue after repeated use.',
      'Scent strength': 'Subtle, natural, gender-neutral scent that doesn\'t overpower.',
    },

    seasonalHooks: [
      'Summer: \"Date szn hair that doesn\'t cost $50\"',
      'School year: \"Game day texture\" | \"First day texture\"',
      'Winter: \"Snow day look\"',
      'Party season: \"Party texture that doesn\'t look like you tried\"',
      'All year: \"Effortless texture that your friends will ask about\"',
    ],

    valuePropositions: [
      'Price: \"~$20 (4x cheaper than Based, way better than drugstore)\"',
      'Quality: \"Real pink himalayan salt + essential oil (vs silicone crap)\"',
      'Ease: \"Spray + go. Done. 2-minute routine.\"',
      'Trust: \"200k+ customers, 4.8 stars, featured in GQ + NYT + FORTUNE\"',
      'Authenticity: \"Premium brand, real ingredients, fair price\"',
      'Guarantee: \"30-day money-back. Zero risk.\"',
    ],
  },

  platforms: {
    primary: [
      'TikTok (35%) — Discovery, trends, creator partnerships, organic + paid ads',
      'Instagram (35%) — Lifestyle, brand authority, testimonials, carousel ads',
      'YouTube (20%) — Long-form, ingredient transparency, tutorials, shorts',
      'Email/Website (10%) — Direct sales, community, brand story',
    ],

    // Strategic emphasis on paid advertising (from Google Doc)
    advertisingStrategy: {
      priority1: 'Static ad copy (HIGHEST PRIORITY) — continuous optimization strategy',
      priority2: 'Website & marketplace copy (structural improvements, funnel optimization)',
      priority3: '1:1 product images with emotionally resonant messaging (carousel critical)',
      priority4: 'Amazon A+ Content & Brand Story (bottom-of-listing conversion nudges)',
      priority5: 'Email/SMS copywriting (dependent on ad testing data integration)',
    },

    tiktok: 'Before/afters, creator reviews, price comparisons, honest ingredient breakdowns, Gen-Z authentic vernacular, trending sounds/formats',
    instagram: 'Lifestyle pics, professional creators, testimonials, behind-scenes, influencer Dillon content (current anchor)',
    youtube: 'Deep dives: "why we use himalayan salt", ingredient science, vs competitor analysis, real user reviews, long-form content',
    amazon: 'CRITICAL: 8-image carousel doing 90% of work. Optimize for mobile. Copy on images. Focus on overcoming 80% checkout abandonment.',
    website: 'simpletics.com + Shopify — brand story, ingredient list, 30-day guarantee, transparent pricing, FAQ',
    email: 'Newsletter with honest content (ingredient science, user reviews, market observations), SMS for conversions',

    budget: 'TikTok ads (25%), Instagram ads (25%), influencer seeding (30%), email/organic (20%)',
    channelMix: 'Organic social, Amazon Ads, TikTok Ads/affiliates, Meta ads, SEO, Google Ads',
  },

  // ZAKARIA IGNOFFO RESEARCH METHODOLOGY
  // Core: "People don't buy products—they buy fulfillment of desires"
  // Research reveals what they ACTUALLY want (deeper than stated problem)
  zakarioMethodology: {
    // UNDERSTANDING DESIRE — Zakaria's foundational principle
    desireFramework: {
      surfaceProblem: 'Sam says: "I want textured hair that looks good"',
      deeperDesire: 'Sam ACTUALLY wants: Confidence. Social belonging. Looking attractive. Not trying too hard.',
      evenDeeper: 'Sam FEARS: Looking basic. Looking like he\'s "trying too hard". Not fitting in. Missing opportunities.',
      turningPoint: {
        before: 'Hair looks mid → manageable frustration → postpones buying',
        atTurningPoint: 'Job interview tomorrow, date this weekend → hair MUST look good NOW → buys immediately',
        after: 'Hair loss starting → survival mode → will pay $100+ for any solution',
      },
      desireIntensity: 'Simpletics at turning point = social event coming up + heard from friends it works + sees TikTok proof = BUY NOW',
      amplifiedDesires: [
        'Identity/Status: "Looking attractive", "masculine confidence", "not being basic"',
        'Social belonging: "Friends use it", "200k guys use it", "on TikTok trends"',
        'Time pressure: "Date this weekend", "job interview tomorrow", "gaming stream tonight"',
      ],
    },

    // THE 4 LAYERS OF RESEARCH — Zakaria framework
    fourLayersOfResearch: {
      layer1Avatar: {
        description: 'Who is Sam? His struggles, what he\'s tried, why it failed, how he talks',
        simpletics: {
          struggles: ['Hair looks mid', 'Complicated routines confusing', 'Drugstore doesn\'t work', 'Based too expensive/greenwashing'],
          whatHeTried: ['Drugstore sprays (dried him out)', 'YouTube tutorials (too complicated)', 'Friends\' recommendations (hit or miss)', 'Instagram ads (didn\'t trust Based)'],
          whyItFailed: ['Drugstore = cheap + crunchy', 'YouTube = too many steps', 'Friends = inconsistent advice', 'Based = overpriced for formula he doesn\'t trust'],
          buzzwords: ['Fire', 'actually works', 'no BS', 'real results', 'transparent', 'authentic', 'TikTok', 'looks effortless'],
        },
      },
      layer2Problem: {
        description: 'What\'s ACTUALLY causing this? Root cause + mechanism + science',
        simpletics: {
          rootCause: 'Most products have silicone/alcohol → buildup → doesn\'t hold → looks worse after 2-3 hours',
          mechanism: 'Drugstore uses cheap silicone (hides dirt, feels clean short-term but accumulates). Based uses silicone masked as natural. Sea salt is different = dissolves in water, conditions, holds without buildup.',
          science: 'Pink himalayan salt crystals friction with hair = texture. No binders needed. Water-soluble = washes out completely.',
          whyCompetitorsFail: [
            'Based: Silicone buildup after week 2 (hair feels heavy)',
            'Drugstore: Alcohol dries scalp (breakage)',
            'Indie: Inconsistent salt quality (hold varies)',
          ],
        },
      },
      layer3Solution: {
        description: 'How does it get fixed? The THEORY (not the product itself)',
        simpletics: {
          theoryOfSolution: 'Replace silicone with real sea salt. Use minimal binders. Let water solubility = complete wash-out. Result: texture + volume + zero buildup.',
          beliefSequence: [
            'YES: Drugstore products damage hair long-term',
            'YES: Silicone accumulates (that\'s why Based hair feels heavy)',
            'YES: Real sea salt conditions + textures (alternative exists)',
            'YES: This sea salt spray does exactly that',
            'INEVITABLE: Simpletics is the smart choice',
          ],
        },
      },
      layer4Product: {
        description: 'Which FEATURES deliver which DESIRES?',
        simpletics: {
          desireToFeatureMapping: {
            'Confidence (identity/status)': ['Real results → hair looks good → confidence', '4.8 stars proves it works → trust'],
            'Social belonging': ['200k+ customers → friends might use it too', 'On TikTok/Instagram → fits trend'],
            'Not trying too hard': ['Natural matte finish looks effortless', '2-minute application (not complicated)'],
            'Not being basic': ['Transparent ingredients (smarter choice)', 'Fair price + quality (smart shoppers choose it)'],
            'Authenticity/trust': ['Honest about what it does + what it doesn\'t', 'Real testimonials (not influencer BS)'],
          },
        },
      },
    },

    // MARKET SOPHISTICATION — Understanding competitive landscape
    marketSophistication: {
      levelAssessment: 'Based/Simpletics market = LEVEL 2-3 (moderately skeptical)',
      level1: 'New mechanism (just introduce solution) — Not our market',
      level2: 'Known problem + skeptical (need proof) — OUR MARKET',
      level2Tactics: [
        'Address Based head-on (acknowledge they know it)',
        'Provide overwhelming proof (4.8 stars, testimonials, science)',
        'Explain mechanism (why sea salt > silicone)',
        'Build belief sequence (Problem → Root Cause → Mechanism → Product)',
      ],
      competitorProof: 'Based exists = market knows silicone sprays work. Our job = prove OURS works better + is fair priced.',
    },

    // ROOT CAUSE & SOLUTION MECHANISM — Build belief
    beliefBuildingFramework: {
      criticalInsight: 'Explain WHAT\'S ACTUALLY WRONG and HOW TO FIX IT',
      example: {
        based: {
          whatWrong: 'Silicone-based formula masked as "natural"',
          howWrong: 'Silicone doesn\'t dissolve in water → accumulates on scalp → hair feels heavier each use',
          solution: 'Sea salt doesn\'t accumulate → water-soluble → can use daily without buildup',
          proof: 'After week 2, compare Based buildup vs Simpletics clean scalp (real user reports)',
        },
        drugstore: {
          whatWrong: 'Alcohol-heavy formulation',
          howWrong: 'Alcohol evaporates fast (temporary hold) + dries scalp (breakage long-term)',
          solution: 'Natural oils + sea salt condition + texture without drying',
          proof: 'Drugstore users report crunchy hair; Simpletics users report soft texture',
        },
      },
      beliefSequenceExample: [
        'START: "Your hair product is silicone-based (most are)"',
        'FACT: "Silicone doesn\'t dissolve in water"',
        'CONSEQUENCE: "Accumulates on scalp over time"',
        'PROBLEM: "After week 2, hair feels heavier, hold weakens"',
        'SOLUTION: "Use water-soluble sea salt instead"',
        'RESULT: "Hold lasts 8+ hours, zero buildup, can use daily"',
        'PRODUCT: "Simpletics uses real sea salt (proven mechanism)"',
        'INEVITABLE: "Choose Simpletics"',
      ],
    },

    // SYSTEM 1 (EMOTION) + SYSTEM 2 (LOGIC) — Two-part conversion
    conversionPsychology: {
      system1Emotion: {
        trigger: 'What makes Sam FEEL something?',
        simpletics: [
          'Social proof (200k guys use it + 4.8 stars)',
          'Peer influence ("Friends asked what I use")',
          'FOMO (trending on TikTok, not mainstream)',
          'Identity (smart buyer, not duped by hype)',
          'Fairness (paying $20 for real value, not $50 for silicone)',
        ],
      },
      system2Logic: {
        trigger: 'What makes Sam BELIEVE the claim?',
        simpletics: [
          'Root cause explanation (why silicone = bad)',
          'Solution mechanism (why sea salt = good)',
          'Scientific backing (pink himalayan salt properties)',
          'Testimonial specificity ("hair feels soft but still has bounce")',
          'Third-party validation (GQ, NYT, FORTUNE features)',
        ],
      },
      conversionFormula: 'EMOTION hooks them (social proof, fairness) → LOGIC convinces them (mechanism, testimonials) → ACTION (buy)',
    },

    // CONTENT JOBS — Different content, different purposes
    contentJobsFramework: {
      imageAdJob: 'Get the click (not sell)',
      imageAdStrategy: 'Hook with social proof ("200k+") or price ("$20") or problem ("Drugstore dries you out")',
      videoAdJob: 'Hook → Problem → Agitate → Root cause → Mechanism → Product → Desire → CTA',
      videoAdExample: [
        'Hook: "I tried Based for $50"',
        'Problem: "Got silicone buildup within 2 weeks"',
        'Agitate: "Hair felt heavy, hold got worse"',
        'Root cause: "Silicone doesn\'t dissolve in water"',
        'Mechanism: "We use sea salt instead → completely water-soluble"',
        'Product: "Simpletics at $20"',
        'Desire: "No buildup, 8+ hour hold, hair stays soft"',
        'CTA: "Try it with 30-day guarantee"',
      ],
      landingPageJob: 'Educate → Build belief → Overcome objections → Convert',
      landingPageFlow: [
        'Hero: Problem (silicone buildup) + Solution (sea salt)',
        'Section 2: Root cause explanation (why silicone fails)',
        'Section 3: Mechanism (how sea salt works differently)',
        'Section 4: Proof (4.8 stars, 200k customers, testimonials)',
        'Section 5: Objection handling (FAQ)',
        'CTA: "Join 200k+ guys" or "Get yours with 30-day guarantee"',
      ],
    },

    // FUNNEL STAGE STRATEGY — Top / Middle / Bottom
    funnelStageStrategy: {
      // TOP FUNNEL — Cold traffic, awareness, problem-focused
      topFunnel: {
        audience: 'Sam doesn\'t know Simpletics exists. Sees haircare ads generically.',
        goal: 'Create awareness of the PROBLEM + introduce novel solution',
        trafficType: 'Cold (Instagram/TikTok feeds, YouTube ads, Google searches)',
        copyFocus: 'Problem-agitation + curiosity hook (NOT selling yet)',
        emotionalTrigger: 'Frustration, FOMO, identity threat ("Hair looks mid")',
        messageExamples: [
          '"Your hair product is probably silicone" (problem education)',
          '"Drugstore destroys hair over time" (pain point)',
          '"Based charges $50 for the same silicone as drugstore" (comparison)',
          '"What if texture could last 8+ hours WITHOUT buildup?" (curiosity)',
          '"200k guys found the answer" (social proof seed)',
        ],
        creativeFormats: [
          'Carousel: Problem → Root cause → Solution teaser (no product yet)',
          'Video: Hook with frustration ("Tried everything") → Show problem → End on question',
          'Static: Emotional image (messy hair) + curiosity headline',
          'TikTok: Problem/solution comparison (drugstore vs alternative, no brand mention)',
        ],
        keyMetrics: {
          targetCPM: 'Low ($2-5, large audience)',
          CTR: 'Aim for 1-2% (engagement-focused, not conversion)',
          objective: 'Reach + engagement, not sales',
        },
        copyDirectives: [
          'Focus on PROBLEM, not solution',
          'Create curiosity (don\'t reveal answer)',
          'Use emotional language (frustration, fear, aspiration)',
          'Don\'t mention price or product',
          'Build the "what if" scenario',
          'Avoid salesy tone (educational > promotional)',
        ],
        topFunnelAngles: [
          'Silicone myth-busting ("It doesn\'t dissolve in water")',
          'Drugstore damage comparison ("Alcohol breaks hair")',
          'Time frustration ("Your morning routine takes too long")',
          'Identity threat ("Looking basic" vs "Looking intentional")',
          'Social proof breadcrumbs ("200k+ guys discovered something")',
        ],
      },

      // MIDDLE FUNNEL — Warm traffic, consideration, solution-focused
      middleFunnel: {
        audience: 'Sam knows about sea salt sprays. Considering Simpletics vs Based vs drugstore.',
        goal: 'Build BELIEF in the mechanism, explain WHY Simpletics > alternatives',
        trafficType: 'Warm (retargeting, search "sea salt spray", email list, lookalikes)',
        copyFocus: 'Root cause explanation + mechanism + comparison',
        emotionalTrigger: 'Relief (solution exists), confidence (smart choice), relief from hype',
        messageExamples: [
          '"Here\'s why silicone buildup happens (and how to prevent it)" (education)',
          '"Based charges $50 for silicone. Here\'s why that\'s backwards." (comparison)',
          '"Sea salt spray done right: 5 ingredients, not 15" (simplicity)',
          '"We use pink himalayan salt. Here\'s why that matters." (mechanism)',
          '"4.8 stars from real people (not influencer deals)" (proof)',
        ],
        creativeFormats: [
          'Landing page: Problem → Root cause (deep) → Mechanism → Social proof → FAQ',
          'Video: Hook → Problem (specific) → Agitate → Root cause explanation → Mechanism → Comparison → Product intro',
          'Carousel: Image 1: Claim headline | Image 2: Root cause explanation | Image 3: Comparison chart | Image 4-6: Testimonials | Image 7: CTA',
          'Blog post: "Why Your Hair Product Doesn\'t Work (And How To Fix It)"',
          'Email: Educational sequence (day 3: mechanism, day 7: comparison)',
        ],
        keyMetrics: {
          targetCPC: '$0.50-$1.50 (smaller, more engaged audience)',
          CTR: '2-3% (engaged, considering)',
          conversionRate: '1-3% (moving toward decision)',
        },
        copyDirectives: [
          'Explain the mechanism (science + why it matters)',
          'Compare directly vs Based/drugstore (build confidence)',
          'Answer "why Simpletics?" before mentioning product',
          'Use specific details (pink himalayan salt, water-soluble, zero buildup)',
          'Build belief sequence (problem → root cause → solution theory → product)',
          'Include objection handling (preempt "but is it really that different?")',
        ],
        middleFunnelAngles: [
          'Root cause deep dive ("Silicone doesn\'t dissolve in water")',
          'Comparison narrative ("Based vs Simpletics: Same problem, different honesty")',
          'Mechanism education ("Why sea salt works when silicone fails")',
          'Authority signals ("Featured in GQ, NYT, FORTUNE")',
          'Founder credibility ("Tested 50+ formulations, chose this one")',
        ],
      },

      // BOTTOM FUNNEL — Hot traffic, decision, objection-removal + urgency
      bottomFunnel: {
        audience: 'Sam is ready to buy. Saw ads, read reviews, now on checkout page.',
        goal: 'Remove final objections, provide certainty, create urgency, convert NOW',
        trafficType: 'Hot (cart abandoners, recent site visitors, email warm list, search "buy Simpletics")',
        copyFocus: 'Social proof + objection handling + guarantee + CTA',
        emotionalTrigger: 'Certainty (remove doubt), fear of missing out, relief from risk (guarantee)',
        messageExamples: [
          '"4.8 stars from 200k+ real customers (not paid reviews)" (proof)',
          '"Connor: \'Smells good, actually works, hair feels softer\'" (specific testimonial)',
          '"30-day money-back guarantee — zero risk" (risk removal)',
          '"Save 28% on duo + free shipping" (urgency + incentive)',
          '"Join 200k+ guys who ditched the hype" (social proof + belonging)',
        ],
        creativeFormats: [
          'Cart abandoner email: Objection + testimonial + urgency (limited stock) + guarantee',
          'Retargeting ad: "Still thinking?" + strongest testimonial + guarantee button',
          'Landing page bottom: FAQ + objection handling + 3 strongest testimonials + CTA (prominent)',
          'Amazon carousel: Image 1-2: Product hero + headline | Image 3: Price + guarantee + stars | Image 4-8: Real testimonials + variants',
          'Checkout page: Trust signals (4.8 stars, 200k+ customers, GQ/NYT featured, 30-day guarantee)',
        ],
        keyMetrics: {
          targetCPC: '$1-3 (highest intent, warm audience)',
          CVR: '5-15% (hot traffic, decision-ready)',
          ROAS: '4:1 minimum (valuable audience)',
        },
        copyDirectives: [
          'Lead with strongest social proof (specific testimonial > generic praise)',
          'Address top 3 objections (Does it work? Is it worth $20? Will it work for my hair?)',
          'Emphasize guarantee (removes risk)',
          'Create urgency without being pushy (limited stock, seasonal)',
          'Make CTA prominent and obvious',
          'Use specific numbers (200k customers, 4.8 stars, 8+ hours hold)',
        ],
        bottomFunnelAngles: [
          'Proof stack ("4.8 stars + 200k+ customers + media features")',
          'Testimonial specificity ("Hair feels soft but still has bounce")',
          'Price justification ("$20 vs $50 Based, actually better formula")',
          'Guarantee confidence ("30-day money-back")',
          'Scarcity light ("Popular scents selling out")',
          'Community belonging ("Join 200k+ guys")',
        ],
      },

      // CROSS-FUNNEL MESSAGE CONSISTENCY
      messagingConsistency: {
        topFunnelMessage: '"Your hair product might be silicone-based (and that\'s a problem)"',
        topToMiddleTransition: '"Here\'s what\'s actually happening + how to fix it"',
        middleFunnelMessage: '"Use real sea salt instead of silicone, and here\'s why"',
        middleToBottomTransition: '"200k+ guys already made the switch"',
        bottomFunnelMessage: '"Join them — 30-day guarantee, risk-free"',
        coherentNarrative: 'Problem → Root Cause → Solution → Proof → Action',
      },

      // ATTRIBUTION BY FUNNEL STAGE
      conversionAttribution: {
        topFunnelRole: 'Awareness (50% of customers enter via top funnel touch)',
        middleFunnelRole: 'Consideration (70% click through middle funnel education)',
        bottomFunnelRole: 'Conversion (60% convert via bottom funnel social proof)',
        customerJourney: 'Average: Top funnel (3 days ago) → Middle funnel (yesterday) → Bottom funnel (today) → Purchase',
      },

      // BUDGET ALLOCATION ACROSS FUNNEL
      budgetStrategy: {
        topFunnel: '40% of ad budget (maximize reach, build awareness)',
        middleFunnel: '35% of ad budget (warm up engaged audience)',
        bottomFunnel: '25% of ad budget (convert hot traffic efficiently)',
        sequencing: 'Top funnel drives lookalike pool → Retarget with middle funnel → Convert with bottom funnel',
      },
    },

    // CRITICAL SUCCESS FACTORS — Zakaria's non-negotiables
    criticalSuccessFactors: {
      time: 'Research takes WEEKS, not hours. Zakaria spent weeks understanding Sam before writing copy.',
      manualFirst: 'Do research yourself before AI. Read reviews, visit forums, talk to customers. Understand before scaling.',
      iteration: 'Write 10 versions before one feels right. Copy is refined, not created.',
      avatarObsession: 'Know Sam better than Based marketing team does. Predictable his objections, fears, desires.',
      congruence: 'Ad message → Landing page → Checkout must flow naturally. Dissonance kills conversion.',
      dataIntegration: 'What converts on TikTok? Use it. What converts on Amazon? Use it. Testing informs strategy.',
    },

    // THE PHILOSOPHY — Why Simpletics wins
    zakPhilosophy: {
      quote: '"All products are winners. Some are just easier because the desire is so big that not taking action has bad consequences."',
      simpletics: 'Simpletics is an EASY product (desire is TURNING POINT — want good hair NOW) + transparent positioning (no competitor explains mechanism)',
      path: 'Understand desire deeply → Choose product with turning point intensity → Build belief sequence → Iterate on copy → Scale',
      notThis: 'NOT: Test 100 products hoping one works by luck. YES: Understand 1 avatar deeply, build belief, iterate, scale.',
    },

    // RESEARCH OUTPUT VOICE — Findings shaped for Sam's perspective
    researchOutputVoice: {
      systemPrompt: 'You are researching FOR Sam, The Clarity Seeker. Be direct. Be specific. No fluff. No BS. Present findings as answers to Sam\'s actual questions. Show the signal, the proof, the source.',
      voiceGuidelines: {
        directness: 'Cut through complexity. "Market data shows X" not "Preliminary indicators suggest a potential tendency toward..."',
        specificity: 'Numbers > adjectives. "4.8 stars from 200k customers" not "highly rated"',
        signalProofSource: 'Every finding: What does this signal? What\'s the proof? Where\'s this from?',
        comparisons: 'Show competitive context. "Simpletics at $20 vs Based at $50" beats "Simpletics is competitively priced"',
        honesty: 'Admit unknowns. "We found X. Unclear on Y." > silence on gaps',
        noBs: 'No marketing speak. "Ice Spice mentioned sea salt on TikTok" not "Influential creators endorse natural texturizing"',
      },
      exampleFindingStructure: {
        finding: 'Sea salt spray market grew 45% YoY (2024-2025)',
        signal: 'Problem-solving demand exists; authenticity matters',
        proof: 'Linked data from Statista (premium market report), Similarweb trending (sea salt spray searches +320%)',
        source: 'Statista premium, Similarweb, Google Trends (2024-2025 data)',
        relevanceToSam: 'Confirms market hunger for sea salt as alternative. Sam is part of 45% growth trend.',
      },
    },

    // RESEARCH METRICS FOR UI — Track research activity visibility
    researchMetricsForUI: {
      description: 'Track and display research effort + confidence to build credibility in findings',
      metricsToTrack: {
        totalSearchesRun: 'Count of Wayfarer queries executed (label: "Searches run")',
        visualAnalyzesRun: 'Count of images analyzed via vision model (label: "Visual analyses")',
        subagentsDeployed: 'Count of parallel researchers launched (label: "Subagents deployed")',
        webPagesScraped: 'Count of pages fetched + parsed (label: "Pages scraped")',
        apiCallsUsed: 'Count of API calls to Wayfayer + Ollama (label: "API calls")',
        topicsResearched: 'Count of distinct research dimensions covered (label: "Topics covered")',
        confidenceLevelPerTopic: 'Per-topic confidence: High (3+ sources) | Medium (2 sources) | Low (1 source)',
        timelinePerPhase: 'Time spent: Phase 1 (Desire-Driven), Phase 2 (Web Research), Phase 3 (Competitor Ads)',
      },
      uiDisplayFormat: {
        metricsBar: 'Horizontal bar: "📊 Research: 47 searches | 12 visuals | 8 subagents | 150 pages | 2.3k API calls"',
        topicsGrid: '3-column grid: "Avatar (3 sources - High)" | "Problem (2 sources - Medium)" | "Solution (4 sources - High)"',
        timelineBreakdown: 'Timeline: "Phase 1: 8m 32s | Phase 2: 24m 15s | Phase 3: 6m 44s" (only if Phase 3 runs)',
        confidenceBadges: 'Per finding: GREEN "High confidence (4 sources)" | YELLOW "Medium (2 sources)" | ORANGE "Single source"',
      },
      usePurpose: 'Demonstrate thoroughness. Sam is skeptical. Show him the work was DONE.',
    },
  },

  researchFocus: [
    'Adult professional haircare consumer behavior (18-40, time-starved)',
    'Premium haircare market gaps (transparency demand)',
    'Natural/clean beauty trend sizing',
    'Instagram + TikTok algorithm wins for authenticity-focused brands',
    'Email marketing effectiveness for transparent DTC brands',
    'Competitor weakness analysis (greenwashing, pricing)',
    'Micro to mid-tier influencer economics (50k-500k followers)',
  ],
};
