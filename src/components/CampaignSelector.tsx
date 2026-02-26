import { useState } from 'react';
import { Collapse, Form, Input, Select, Button, Upload, Card, message, ConfigProvider } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { QuickChatBuilder } from './QuickChatBuilder';

type Tab = 'preset' | 'detailed' | 'chat';

interface ImageMetadata {
  uid: string;
  name: string;
  dataUrl: string;
  imageType?: string;
  description?: string;
  designNotes?: string;
}

// Preset campaign template
const DEFAULT_PRESET = {
  id: 'clean-skincare',
  label: 'Natural Skincare Brand',
  brand: {
    name: 'Upfront.',
    website: 'www.upfront.nl',
    socials: 'instagram.com/upfront.skincare | tiktok.com/@upfrontskincare',
    description: 'Clean, transparent skincare brand combining Dutch herbal traditions with modern science',
    industry: 'Beauty / Clean Beauty / Skincare',
    positioning: 'The transparent skincare brand that puts ingredient integrity first',
    tone: 'Honest, educational, friendly but not patronizing, data-backed',
    colors: 'Sage green + cream + charcoal',
    fonts: 'Inter (modern, clean), Courier for technical',
  },
  audience: {
    name: 'Emma, The Conscious Skeptic',
    ageRange: '32-38',
    location: 'Europe (Netherlands, Belgium, Germany, UK)',
    income: '$50k-200k household',
    job: 'Senior product manager',
    painPoints: 'Confusing ingredients, greenwashing, wasted money, sensitive reactions',
    values: 'Transparency, efficacy, sustainability, self-care, evidence-based',
    platforms: 'Instagram, TikTok, Pinterest, YouTube, Reddit',
    buyingBehavior: 'Heavy research, reads reviews carefully, checks ingredients, impulse buys rarely',
    trustFactors: 'Third-party sourcing, dermatologist recommendations, customer testimonials, published data',
  },
  goal: 'Drive trial conversions among skeptical clean beauty seekers, establish category authority, build loyalty',
  budget: '$15k/month',
  timeline: 'Q1: awareness | Q2: trial | Q3-Q4: retention',
  kpis: 'Conversion rate 3%+ | CAC $25-35 | Repeat purchase 40%+ | AOV $65+',
};

const FORM_SECTIONS = [
  {
    key: 'brand-dna',
    label: 'Brand DNA',
    fields: [
      { name: 'brandName', label: 'Brand Name', placeholder: 'e.g., Upfront.' },
      { name: 'website', label: 'Website', placeholder: 'e.g., www.upfront.nl' },
      { name: 'socials', label: 'Main Social Channels (With Handles)', placeholder: 'e.g., @brand_name on Instagram, @brand on TikTok, YouTube channel link' },
      { name: 'industry', label: 'Industry / Category', placeholder: 'e.g., Beauty / Skincare / Supplement / SaaS / Apparel' },
      { name: 'positioning', label: 'Brand Positioning (In One Sentence)', placeholder: 'e.g., "The clean skincare brand for skeptical millennials" OR "Premium productivity software for founders"' },
      { name: 'tone', label: 'Tone of Voice (With Examples)', placeholder: 'e.g., "Honest & educational but never patronizing" with example: "We tested 50 formulas before settling on this one" instead of vague marketing speak' },
      { name: 'brandColors', label: 'Brand Colors (+ Psychology)', placeholder: 'e.g., Sage green (trust/growth), cream (approachable), charcoal (authority). What does each color communicate?' },
      { name: 'brandFonts', label: 'Brand Fonts (+ Usage)', placeholder: 'e.g., Inter for body (modern/clean), Courier for technical specs (credibility), never Comic Sans. Why these choices?' },
      { name: 'brandNickname', label: 'What Would Customers Call This Brand If It Were A Person?', placeholder: 'One specific personality archetype (e.g., "The Scientist Friend", "The Tough Coach", "The Caring Aunt")' },
      { name: 'bigEnemy', label: 'Your Brand\'s Big Enemy / Villain', placeholder: 'Who/what are you fighting against? Make it specific: not just "greenwashing" but "companies that hide toxic ingredients behind buzzwords". This is your #1 messaging differentiator.' },
      { name: 'categoryBeliefs', label: 'Category Beliefs To Break (Specific Examples)', placeholder: 'List exact myths you\'re dispelling: 1) "Natural = ineffective" (Myth, we prove it\'s efficacious) 2) "Premium = out of reach" (Myth, you get cost-per-use benefit) 3) "Skincare takes 10 steps" (Myth, minimal routine works)' },
      { name: 'brandWhy', label: 'Why Does This Brand Exist? (The WHY Beyond Profit)', placeholder: 'What problem in the world are you solving? NOT "to make money" but "because customers were being lied to about ingredients and we wanted radical transparency"' },
    ],
  },
  {
    key: 'persona',
    label: 'Primary Customer Persona',
    fields: [
      { name: 'personaName', label: 'Persona Name & Archetype', placeholder: 'e.g., "Emma, The Conscious Skeptic" (give them a name you\'ll use in all your creative briefs)' },
      { name: 'age', label: 'Age Range (Be Specific)', placeholder: '32-38 (not just "30s" — specific range matters for messaging)' },
      { name: 'gender', label: 'Gender / Gender Identity', placeholder: 'Female / Male / Non-binary / Other' },
      { name: 'job', label: 'Job Title (+ Industry)', placeholder: 'Senior Product Manager at a tech company (not just "product manager")' },
      { name: 'location', label: 'Geographic Location & Climate', placeholder: 'Europe: Netherlands, Belgium, Germany. Why this matters: cold climate = different skincare needs' },
      { name: 'income', label: 'Household Income Range', placeholder: '$50k-200k (be specific about disposable income available for your product category)' },
      { name: 'maritalStatus', label: 'Marital / Family Status', placeholder: 'e.g., Married, 1-2 kids, or Single, no dependents (affects decision speed & budget availability)' },
      { name: 'painPoints', label: 'Top 3 Pain Points (Ranked By Severity)', placeholder: '1) [Biggest pain] — how often does this hurt? 2) [Secondary pain] 3) [Tertiary pain]. Examples: "Confusing ingredients", "Wasted money on ineffective products", "Skin sensitivity issues"', type: 'textarea' },
      { name: 'dayInLife', label: 'What\'s A Typical Day Like?', placeholder: 'Wake at 6am, workout, work 8-6, dinner at 7pm, skincare routine at night, bed by 11pm. Show us the CONTEXT where your product fits.' },
      { name: 'values', label: 'Core Values (Top 3 Only)', placeholder: 'Transparency, Sustainability, Efficacy. For each, give ONE concrete example: e.g., "Transparency: I read ingredient labels" NOT just "they value honesty"', type: 'textarea' },
      { name: 'trustFactors', label: 'EXACT Ways This Persona Decides To Trust A Brand', placeholder: 'Ranked: 1) Third-party certifications (e.g., dermatologist tested) 2) Long-term research (e.g., "5+ year study") 3) Customer testimonials (e.g., "real people, visible results"). What will make THEM trust YOU?' },
      { name: 'mustBelieve', label: 'What MUST This Customer Believe For Your Product To Work?', placeholder: 'What conviction is non-negotiable? (e.g., "Natural ingredients CAN be efficacious" OR "I am capable of changing my skin" OR "Investment in my health is worth it"). This is your advertising premise.' },
      { name: 'identityShift', label: 'What Identity Shift Do They Make After Buying?', placeholder: 'They go from: "I\'m a skeptic who\'s been burned before" → "I\'m someone who found a brand I actually trust with my skin". Specific identity transformation.' },
      { name: 'onlineHabits', label: 'Where Do They Spend Online Time?', placeholder: 'Spend 3 hours/day on Instagram (research), 1 hour on Reddit (r/skincare), 30 min YouTube (product reviews). This shapes WHERE your ads appear.' },
      { name: 'purchaseHistory', label: 'What Similar Products Have They Bought Before?', placeholder: 'e.g., "Tried CeraVe (too basic), tried Korean brands (too expensive), bought TheOrdinary (cheap but inconsistent)" — shows current solutions\' weaknesses' },
    ],
  },
  {
    key: 'products',
    label: 'Product Definition',
    fields: [
      { name: 'productName', label: 'Product Name (Full & Short)', placeholder: 'Full: "Vitamin C Brightening Serum 30ml" | Short nickname: "The Glow Serum"' },
      { name: 'productCategory', label: 'Category & Subcategory', placeholder: 'e.g., Skincare → Serums → Brightening OR Supplement → Sleep Support → Melatonin Alternative' },
      { name: 'productDescription', label: 'Product Description (For Customer)', placeholder: 'What is it? e.g., "A stabilized L-ascorbic acid serum with hyaluronic acid in a lightweight formula that absorbs in 60 seconds"' },
      { name: 'problemSolved', label: 'Primary Problem It Solves', placeholder: 'Be ultra-specific: NOT "dull skin" but "hyperpigmentation from sun damage and post-acne marks"' },
      { name: 'secondaryProblems', label: 'Secondary Problems (Bonus Solves)', placeholder: 'e.g., Also reduces fine lines, improves texture, gives glow. List the 2-3 additional benefits.' },
      { name: 'keyFeatures', label: 'Key Features (The "What")', placeholder: 'FEATURES: Stabilized L-ascorbic acid (15%), Hyaluronic acid (2%), Ferulic acid complex. Focus on the INGREDIENTS that matter.' },
      { name: 'functionalBenefits', label: 'Functional Benefits (The "What It Does")', placeholder: 'FUNCTIONAL: Brightens skin noticeably in 2 weeks, reduces brown spots 40% in 8 weeks, improves texture, boosts collagen production. Be MEASURABLE.' },
      { name: 'emotionalBenefits', label: 'Emotional Benefits (The "How It Makes You Feel")', placeholder: 'EMOTIONAL: Confidence in photos, not hiding spots anymore, feeling like you\'re "glowing" naturally, reclaiming your skin back. This is the REAL benefit.' },
      { name: 'resultTimeline', label: 'Results Timeline (Week By Week)', placeholder: 'Week 1: Hydration boost, glow (visible) | Week 2: Fine lines soften | Week 4: Brightness improves noticeably | Week 8: Significant spot reduction (40%). Be SPECIFIC with timing.' },
      { name: 'bestFor', label: 'Best For (Customer Type)', placeholder: 'e.g., Anyone with sun damage, post-acne hyperpigmentation, dull/tired skin, 30+. What skin types? What age? What concerns?' },
      { name: 'notFor', label: 'NOT For (Contraindications)', placeholder: 'e.g., Very sensitive skin (test first), pregnant women (discuss with doctor), on Accutane, active acne (use after healing)' },
      { name: 'uniqueUsp', label: 'What Makes This Different? (Unique Selling Proposition)', placeholder: 'NOT just "high-quality vitamin C" — be specific: "Only product that combines L-ascorbic acid with ferulic acid at research-proven ratios, 15% concentration (most competitors are 10% or less)"' },
      { name: 'provenResults', label: 'Proven Results (Studies / Data)', placeholder: 'Do you have clinical data? e.g., "In a 8-week study of 50 users, 92% saw visible brightness improvement"? What can you claim?' },
      { name: 'pricing', label: 'Price Point (+ Justification)', placeholder: 'Price: €65 | Justification: €0.65 per use × 100 uses per bottle | Comparison: competitor X costs €80 for weaker formula' },
      { name: 'guarantee', label: 'Guarantee / Risk Reversal', placeholder: 'e.g., "60-day money-back guarantee, no questions asked" OR "90-day satisfaction guarantee or full refund". What removes the risk?' },
      { name: 'scarcity', label: 'Any Scarcity or Limited Availability?', placeholder: 'e.g., "Made in small batches of 500 units" (if true) OR "Currently sold out, waitlist available" (if applicable)' },
    ],
  },
  {
    key: 'product-details',
    label: 'Product Details & Specifications',
    fields: [
      { name: 'productFormat', label: 'How It Comes / Format', placeholder: 'e.g., 30ml glass bottle with dropper, powder in sachet, tablet, liquid suspension...' },
      { name: 'packaging', label: 'Packaging Details', placeholder: 'e.g., Recyclable glass, cardboard box, refillable container, comes with applicator...' },
      { name: 'productSize', label: 'Size / Quantity', placeholder: 'e.g., 30ml (lasts ~3-4 months), 60 capsules, 100g jar...' },
      { name: 'shelfLife', label: 'Shelf Life / Expiry', placeholder: 'e.g., 2 years unopened, 6 months after opening, no expiry if stored properly...' },
      { name: 'usageInstructions', label: 'How To Use (Brief)', placeholder: 'e.g., Apply 2-3 drops morning and night, take 1 capsule daily with food, mix 1 tsp with water...', type: 'textarea' },
      { name: 'usageFrequency', label: 'Recommended Usage Frequency', placeholder: 'e.g., Daily, twice daily, 3-4 times per week, as needed...' },
      { name: 'usageDuration', label: 'How Long To See Results', placeholder: 'e.g., 2-4 weeks for visible changes, results build over 8-12 weeks, immediate effect...' },
      { name: 'targetUsers', label: 'Who Is It For (Detailed)', placeholder: 'e.g., People with sensitive skin, workout enthusiasts, women 30+, all skin types, pregnant women (safe), vegan/vegetarian...', type: 'textarea' },
      { name: 'userProfiles', label: 'Typical User Profiles', placeholder: 'e.g., Busy professionals, fitness enthusiasts, eco-conscious consumers, sensitive skin sufferers...', type: 'textarea' },
      { name: 'storage', label: 'Storage Requirements', placeholder: 'e.g., Room temperature away from sunlight, refrigerate after opening, keep in cool dry place...' },
      { name: 'compatibility', label: 'Works With / Compatibility', placeholder: 'e.g., Can be combined with other serums, incompatible with vitamin C, safe with all skincare routines...', type: 'textarea' },
      { name: 'contraindications', label: 'Who Should NOT Use / Warnings', placeholder: 'e.g., Not for pregnant women, avoid if allergic to X, not suitable for very sensitive skin, do patch test first...', type: 'textarea' },
      { name: 'certifications', label: 'Certifications / Standards', placeholder: 'e.g., Cruelty-free, vegan, organic certified, dermatologist tested, clinically proven...' },
      { name: 'costPerUse', label: 'Cost Per Use / Price Point', placeholder: 'e.g., $0.50 per application, costs €60 for 3 months of daily use, premium positioning...' },
      { name: 'comparison', label: 'How It Compares To Competitor Products', placeholder: 'e.g., 2x stronger than Brand X, half the price of Brand Y, only one with X ingredient, gentler formula...', type: 'textarea' },
    ],
  },
  {
    key: 'branding',
    label: 'Brand Assets & Design',
    fields: [
      { name: 'logoStyle', label: 'Logo Style', placeholder: 'Minimalist, bold, serif, sans-serif...' },
      { name: 'imageStyle', label: 'Image Style', placeholder: 'Real skin, lifestyle, flat lay, before/after...' },
      { name: 'packagingDesign', label: 'Packaging Design', placeholder: 'Minimalist, luxury, eco-friendly...' },
      { name: 'designValues', label: 'Design Values', placeholder: 'Sustainability, luxury, approachability...' },
    ],
  },
  {
    key: 'competitive',
    label: 'Competitive Intelligence',
    fields: [
      { name: 'mainCompetitors', label: 'Top 3-5 Direct Competitors', placeholder: 'Rank by threat level:\n1) [Competitor name] — Why they\'re the biggest threat\n2) [Competitor name]\n3) [Competitor name]\nBe specific about who you\'re actually losing sales to.' },
      { name: 'indirectCompetitors', label: 'Indirect Competitors (Alternative Solutions)', placeholder: 'e.g., Dermatologist visits ($200) compete with skincare ($65) for solving the same problem. What else solves the same need?' },
      { name: 'competitorStrengths', label: 'Competitor Strengths (Be Honest)', placeholder: 'Competitor A: Large marketing budget, famous influencer partnership | Competitor B: Lower price point, faster shipping | Competitor C: Strong brand heritage' },
      { name: 'competitorWeaknesses', label: 'Competitor Weaknesses (Your Opportunity)', placeholder: 'Competitor A: Poor customer service (you offer 24/7 support) | Competitor B: Side effects complaints (your formula is gentler) | Competitor C: Outdated branding' },
      { name: 'competitiveAdvantage', label: 'Your Competitive Advantages (Ranked)', placeholder: '1) [Biggest advantage vs all competitors] e.g., "Only formula with this ingredient combination"\n2) [Secondary advantage]\n3) [Tertiary advantage]\nBe specific and defensible.' },
      { name: 'priceVsCompetitors', label: 'Price Positioning vs Competitors', placeholder: 'Your: €65 | Competitor A: €80 (premium) | Competitor B: €35 (budget) | Competitor C: €95 (luxury). Where do you fit?' },
      { name: 'marketShare', label: 'Estimated Market Share Distribution', placeholder: 'Competitor A: 35% market share | Competitor B: 25% | Competitor C: 20% | Others: 15% | YOU: 5% (growing). Be realistic.' },
      { name: 'copyCatRisk', label: 'Copycat/Substitution Risk', placeholder: 'How easy is it to copy your product? High risk: simple ingredient formula vs Low risk: proprietary process + patent. Where are you?' },
    ],
  },
  {
    key: 'messaging',
    label: 'Copy & Messaging Library',
    fields: [
      { name: 'mainMessage', label: 'Core Benefit Statement (One Sentence)', placeholder: 'e.g., "Get visible results in 2 weeks without side effects" OR "The skincare brand that actually tells you what\'s in your products"' },
      { name: 'subclaims', label: 'Top 3 Subclaims That Support Main Message', placeholder: '1) Clinically proven efficacy (we have data)\n2) Natural & safe ingredients (no harsh chemicals)\n3) Results or money back (zero risk)', type: 'textarea' },
      { name: 'callToAction', label: 'Call To Action (+ Urgency/Incentive)', placeholder: 'e.g., "Get yours now" + "Free shipping on orders over €50" OR "Shop today" + "Limited stock, only 47 left"' },
      { name: 'callToActionVariants', label: 'CTA Variants (For Testing)', placeholder: 'Variant A: "Shop now" (direct)\nVariant B: "Get free shipping" (incentive)\nVariant C: "See results in 2 weeks" (benefit-driven)\nVariant D: "Join 50k+ customers" (social proof)', type: 'textarea' },
      { name: 'testimonials', label: 'Top 3 Sample Testimonials (Real Quotes)', placeholder: '1) [Exact customer quote about result] — [Customer name, age]\n2) [Another quote] — [Customer name]\n3) [Third quote]', type: 'textarea' },
      { name: 'testimonialsTypes', label: 'Types of Testimonials Available', placeholder: 'e.g., "Before/after with photos: 12 available", "Video testimonials: 5 available", "Written reviews: 100+ available"' },
      { name: 'linguisticPatterns', label: 'Exact Linguistic Patterns Customers Use', placeholder: 'From reviews/Reddit, what EXACT words does your target use? (e.g., "finally something that works", "no more burning", "my skin feels alive again"). Copy these phrases into ads.', type: 'textarea' },
      { name: 'avoidLanguage', label: 'Language/Words To AVOID', placeholder: 'e.g., "Chemical" (bad for skincare brand), "Luxury" (doesn\'t resonate with audience), "Girl power" (wrong demographic). What messaging falls flat?' },
      { name: 'objectionHandling', label: 'Objection Handling (Top 5 Objections + Answers)', placeholder: '1) "Will it work for me?" → "Yes + here\'s why: [specific reason] + here\'s proof: [testimonial/data]"\n2) "Too expensive?" → "Cost-per-use is €0.65, cheaper than [comparison]"\n3) "Will it cause side effects?" → "Safe for [skin type] + tested on [group]"\n4) "How long until results?" → "Noticeable in 2 weeks, significant in 8"\n5) "Why you over competitors?" → "[Specific differentiator]"', type: 'textarea' },
      { name: 'seasonalHooks', label: 'Seasonal / Cultural Messaging Hooks', placeholder: 'New Year: "New decade, glowing skin" (resolution angle)\nSummer: "Feel confident without makeup" (freedom angle)\nWinter: "Combat winter dryness" (seasonal problem)\nBack to school: "Feel confident during transitions" (confidence angle)\nBlack Friday: "Better products, better prices" (value)', type: 'textarea' },
      { name: 'valuePropositions', label: 'Multiple Value Propositions (For Different Angles)', placeholder: 'Angle 1 (Cost): "Pay 50% less than dermatologist" | Angle 2 (Speed): "Results in 2 weeks, not 2 months" | Angle 3 (Safety): "Natural ingredients, no side effects" | Angle 4 (Trust): "Transparent ingredients, 3rd party tested"' },
    ],
  },
  {
    key: 'platforms',
    label: 'Platform Strategy',
    fields: [
      { name: 'primaryPlatforms', label: 'Primary Platforms (Ranked By Importance)', placeholder: '1) Instagram (Reels) — 40% budget, high engagement with 25-35 demographic\n2) TikTok — 35% budget, viral potential, younger skew\n3) YouTube (pre-roll) — 25% budget, authority building\nWhere does YOUR audience spend time?' },
      { name: 'platformCPA', label: 'CPA By Platform (If You Have Data)', placeholder: 'e.g., Instagram: €28 CPA | TikTok: €22 CPA | YouTube: €35 CPA. Which platform is most efficient for you NOW?' },
      { name: 'contentTypes', label: 'Best Performing Content Types Per Platform', placeholder: 'Instagram: Carousel ads (3-5 image slides) — 2.1% CTR | TikTok: Native short videos (8-15s) — 3.2% CTR | YouTube: Long-form educational (2+ min) — 1.1% CTR' },
      { name: 'hookTiming', label: 'Hook Timing By Platform', placeholder: 'TikTok: Hook in first 0-1 second (infinite scroll) | Instagram: 2-3 seconds (slight pause) | YouTube: 5 seconds (skippable ad threshold) | Pinterest: 2-3 seconds (slow infinite scroll)' },
      { name: 'videoSpecs', label: 'Video Specs By Platform', placeholder: 'TikTok: 9:16 vertical, native sounds preferred | Instagram Reels: 9:16, music library essential | YouTube: 16:9 widescreen or 9:16 mobile | Meta Feed: 4:5 or 1:1' },
      { name: 'postingStrategy', label: 'Organic vs Paid Split', placeholder: 'e.g., 70% paid ads (for sales), 20% organic content (community building), 10% influencer partnerships. What\'s YOUR mix?' },
      { name: 'platformNuances', label: 'Platform-Specific Nuances (Detailed)', placeholder: 'TikTok: Algorithm favors watch time + comments, use trending sounds, native feel beats polished. Meta: Better for targeting specificity, carousel ads outperform singles. YouTube: Educational content performs, audience is older, CPA is higher but LTV is better.' },
      { name: 'seasonalPlatforms', label: 'Seasonal Platform Shifts', placeholder: 'e.g., Q4: Shift 60% to TikTok (gift-giving, holiday viral potential) | Q1: 40% to YouTube (New Year resolutions). When does WHAT perform?' },
      { name: 'competitorPlatforms', label: 'Where Are Top Competitors Advertising?', placeholder: 'Competitor A: Heavy on TikTok (10+ active ads) | Competitor B: Instagram carousel focus | Competitor C: YouTube pre-roll dominance. Follow the smart money.' },
      { name: 'audienceDevicePreference', label: 'What Device Does Your Audience Use?', placeholder: 'e.g., 78% mobile-first (optimize for vertical), 15% desktop, 7% tablet. This shapes your creative orientation.' },
    ],
  },
  {
    key: 'mission-vision',
    label: 'Mission, Vision & Values',
    fields: [
      { name: 'missionStatement', label: 'Brand Mission / Purpose', placeholder: 'What problem does your brand aim to solve? What core promise do you deliver?', type: 'textarea' },
      { name: 'visionStatement', label: 'Brand Vision / Future State', placeholder: 'What future state does your brand envision? What legacy will you leave?', type: 'textarea' },
      { name: 'coreValues', label: 'Core Values (Top 5)', placeholder: 'e.g., Transparency, Innovation, Sustainability, Authenticity, Customer-centricity', type: 'textarea' },
      { name: 'brandPromise', label: 'Brand Promise / Guarantee', placeholder: 'What do you unconditionally guarantee to customers? What commitment do you make?', type: 'textarea' },
      { name: 'guidingPrinciples', label: 'Guiding Principles / Ethos', placeholder: 'What principles guide your strategic decisions? What ethical standards do you uphold?', type: 'textarea' },
      { name: 'industryChange', label: 'How Will You Change Your Industry?', placeholder: 'What impact do you want to make? How will you disrupt the status quo?', type: 'textarea' },
      { name: 'sustainabilityCommitment', label: 'Sustainability & Social Responsibility Pledges', placeholder: 'Environmental commitments, labor practices, community initiatives, inclusivity efforts...', type: 'textarea' },
      { name: 'internalCulture', label: 'How Values Inspire Employee Culture', placeholder: 'How do your values shape team behavior, hiring, and internal practices?', type: 'textarea' },
    ],
  },
  {
    key: 'brand-personality',
    label: 'Brand Personality & Visual Identity',
    fields: [
      { name: 'brandPersonality', label: 'Brand Personality (Adjectives)', placeholder: 'e.g., Bold, Approachable, Innovative, Trustworthy, Playful, Sophisticated...' },
      { name: 'ifBrandWerePerson', label: 'If Your Brand Were a Person...', placeholder: 'What hobbies, interests, lifestyle? What age? What social circles? What values?', type: 'textarea' },
      { name: 'emotionalEvocation', label: 'What Should Your Brand Evoke Emotionally?', placeholder: 'Joy, confidence, trust, inspiration, empowerment, nostalgia, belonging...?', type: 'textarea' },
      { name: 'brandColors', label: 'Brand Color Palette & Psychology', placeholder: 'e.g., Sage green (trust/growth), cream (approachability), charcoal (sophistication). What does each color communicate?', type: 'textarea' },
      { name: 'typography', label: 'Typography & Typeface Strategy', placeholder: 'Primary font, secondary font. What do they communicate? Modern vs classic? Technical vs friendly?', type: 'textarea' },
      { name: 'visualStyle', label: 'Visual Style & Aesthetic', placeholder: 'Minimalist, maximalist, playful, serious? Clean lines or organic? Photography style? Illustration vs photography?', type: 'textarea' },
      { name: 'graphicElements', label: 'Signature Graphic Elements', placeholder: 'What unique visual elements differentiate you? Icons, patterns, illustrations, photography style?', type: 'textarea' },
      { name: 'designBalance', label: 'Modern vs Classic Balance', placeholder: 'How do you balance contemporary trends with timeless design? What stays constant?', type: 'textarea' },
      { name: 'sensoryLayer', label: 'Sensory Brand Layer', placeholder: 'How does your product feel beyond visuals? (e.g., packaging smell, texture, sound of opening, unboxing experience, tactile quality)', type: 'textarea' },
    ],
  },
  {
    key: 'brand-story',
    label: 'Brand Story & Heritage',
    fields: [
      { name: 'foundingStory', label: 'Founding Story / Origin', placeholder: 'What inspired the founding? Who were the founders? What problem sparked the idea?', type: 'textarea' },
      { name: 'firstProduct', label: 'How Did Your First Product Come to Life?', placeholder: 'What was the creation process? What challenges did you overcome? Key moments?', type: 'textarea' },
      { name: 'pivotalMilestones', label: 'Pivotal Milestones & Turning Points', placeholder: 'Major achievements, pivots, growth moments that transformed the company trajectory', type: 'textarea' },
      { name: 'keyPeople', label: 'Key People in Your Journey', placeholder: 'Founders, mentors, partners who shaped the brand. What did they contribute?', type: 'textarea' },
      { name: 'missionEvolution', label: 'How Has Your Mission Evolved?', placeholder: 'How have your values/mission changed? What stayed constant? Why did you evolve?', type: 'textarea' },
      { name: 'customerStories', label: 'Most Loved Story Moments', placeholder: 'Which customer stories resonate most? What narrative moments define your brand in peoples minds?', type: 'textarea' },
      { name: 'narrativeArcs', label: 'Key Narrative Arcs for Marketing', placeholder: 'What story patterns do you repeat? Hero\'s journey, underdog, transformation, legacy?', type: 'textarea' },
      { name: 'historyInMessaging', label: 'How to Weave Heritage into Current Messaging', placeholder: 'How do you honor your past while moving forward? What legacy do you emphasize?', type: 'textarea' },
      { name: 'founderPersona', label: 'Founder Persona (For Founder-Led Brands)', placeholder: 'Who is the founder? (e.g., name, background, authority, credibility story, face of brand?, visible in marketing?, personal story value)', type: 'textarea' },
    ],
  },
  {
    key: 'persona-deep-dive',
    label: 'Core Persona Deep Dive',
    fields: [
      { name: 'primaryVsSecondaryBuyer', label: 'Primary vs Secondary Buyer', placeholder: 'Is it the direct user or someone buying for them? (e.g., adult daughter buying for mom, caregiver buying for patient, parent buying for teen)', type: 'textarea' },
      { name: 'personaDemographics', label: 'Detailed Demographics', placeholder: 'Age range, gender, location, income, education, job title, marital/family status, household size', type: 'textarea' },
      { name: 'personaArchetype', label: 'Persona Archetype / Character', placeholder: 'e.g., "Active Grandpa who values hobbies", "Desperate Parent", "Self-Reliant Professional", "Wellness Seeker"', type: 'textarea' },
      { name: 'lifeStageContext', label: 'Life Stage & Context', placeholder: 'Specific life circumstances that make them vulnerable to this problem (e.g., new parent exhaustion, post-surgery recovery, career peak stress, retirement transition)', type: 'textarea' },
      { name: 'psychographicProfile', label: 'Psychographic Profile', placeholder: 'Values, beliefs, lifestyle, hobbies, how they spend time/money. What defines how they see themselves?', type: 'textarea' },
      { name: 'healthStatusContext', label: 'Health/Life Status Context (If Applicable)', placeholder: 'Any pre-existing conditions, co-morbidities, or life circumstances that amplify the problem? (e.g., diabetes, obesity, military service, chronic illness)', type: 'textarea' },
      { name: 'incomeAttitude', label: 'Income Attitude & Spending Priorities', placeholder: 'High-income risk-taker vs fixed-income conservative? What do they prioritize spending on? What sacrifices would they make for this solution?', type: 'textarea' },
      { name: 'decisionMaker', label: 'Who Makes the Decision?', placeholder: 'Is it individual choice, spousal/family consensus, doctor recommendation, influenced by peer group?', type: 'textarea' },
    ],
  },
  {
    key: 'emotional-landscape',
    label: 'Customer\'s Emotional Landscape',
    fields: [
      { name: 'deepestFears', label: 'Deepest Fears & Dark Side', placeholder: 'What keeps them up at night? Permanent damage? Losing independence? Becoming a burden? Fear of wasting more money? Death/amputation? Institutionalization?', type: 'textarea' },
      { name: 'fearOfWorse', label: 'Fear of Permanence & Worsening', placeholder: 'Do they fear this problem is permanent and will only get worse? What\'s the worst-case scenario they imagine?', type: 'textarea' },
      { name: 'fearOfLostIdentity', label: 'Fear of Lost Identity / Independence', placeholder: 'Are they terrified of becoming "the fragile one"? Needing mobility aids? Not being able to do what defines them?', type: 'textarea' },
      { name: 'fearOfSideEffects', label: 'Fear of Medications / Side Effects', placeholder: 'Do they fear becoming "a zombie" from drugs? Liver damage from supplements? Dependency? "Brain fog"?', type: 'textarea' },
      { name: 'fearOfScams', label: 'Fear of Wasted Money / Scams', placeholder: 'Have they been burned before? Do they fear this is another "miracle cure" that won\'t work? Trust issues?', type: 'textarea' },
      { name: 'emotionalWins', label: 'Core Emotional Desires (Not Functional)', placeholder: 'What would make them feel hope? Peace of mind? Freedom? Confidence? The "old me" back? Family connection? What emotional state are they actually seeking?', type: 'textarea' },
      { name: 'dailyPainAgitators', label: 'Daily Life Agitators / Triggers', placeholder: 'What moments make the problem WORSE? (e.g., 3 AM wakeups, family gatherings, standing at work, doctor dismissal, seeing others enjoy activities)', type: 'textarea' },
      { name: 'qualityOfLifeImpact', label: 'Quality of Life Impact', placeholder: 'How has this problem stolen their life? What can\'t they do anymore? What relationships are strained? What joy has been lost?', type: 'textarea' },
      { name: 'emotionalState', label: 'Current Emotional State', placeholder: 'Are they desperate? Hopeless? Frustrated? Angry? Resigned? Hypervigilant? What\'s their mood when considering solutions?', type: 'textarea' },
      { name: 'desperationLevel', label: 'Desperation Level', placeholder: 'On a scale: "I\'ve tried everything and nothing works" to "I\'m willing to do almost anything" - where are they?', type: 'textarea' },
    ],
  },
  {
    key: 'failed-solutions',
    label: 'Journey of Failed Solutions & Skepticism',
    fields: [
      { name: 'solutionsTried', label: 'What Solutions Have They Already Tried?', placeholder: 'Medications, supplements, creams, therapies, lifestyle changes, professional help? What\'s their history of attempted solutions?', type: 'textarea' },
      { name: 'whyFailed', label: 'Why Did Previous Solutions Fail?', placeholder: 'Didn\'t work? Caused side effects? Too expensive? Took too long? Didn\'t address root cause? Felt like scams?', type: 'textarea' },
      { name: 'moneyWasted', label: 'Money Wasted / Sunk Cost', placeholder: 'How much have they spent on failed solutions? Does this make them more risk-averse or more willing to spend on proven solutions?', type: 'textarea' },
      { name: 'damageToTrust', label: 'Damage to Trust / Provider Relationships', placeholder: 'Have doctors dismissed them? Has healthcare failed them? Are they distrustful of medical/corporate solutions? Are they seeking "natural" alternatives?', type: 'textarea' },
      { name: 'mainObjections', label: 'Main Objections / Skepticism', placeholder: 'What do they say to themselves before buying? "It won\'t work", "It\'s a scam", "Too expensive", "I\'ve tried similar", "I don\'t have time"?', type: 'textarea' },
      { name: 'boughtIntoLies', label: 'False Promises They\'ve Believed', placeholder: 'What marketing narratives have disappointed them? ("miracle cure", "overnight fix", "no side effects")', type: 'textarea' },
      { name: 'genericAdviceTired', label: 'Tired of Generic / Dismissive Advice', placeholder: 'What do they hate hearing? ("Just exercise", "Lose weight", "It\'s all in your head", "Nothing can be done")', type: 'textarea' },
      { name: 'whyTheyStillSeek', label: 'Why Do They Still Keep Searching?', placeholder: 'Despite failures, what keeps them looking? Hope? Desperation? New information? Peer pressure? Seeing others succeed?', type: 'textarea' },
    ],
  },
  {
    key: 'buying-psychology',
    label: 'Buying Psychology & Emotional Triggers',
    fields: [
      { name: 'trustFactorsEmotional', label: 'Trust Factors (Ranked By Importance)', placeholder: 'Rank these for YOUR customer:\n1) [Most important] Peer testimonials (e.g., "50k+ reviews")\n2) Doctor endorsement (e.g., dermatologist recommendation)\n3) Founder story (e.g., founder credibility)\n4) Transparency (ingredient sourcing)\n5) Long history (brand longevity)\nWhat ONE thing would make them trust you most?', type: 'textarea' },
      { name: 'emotionalState', label: 'What\'s Their Emotional State When Considering Your Solution?', placeholder: 'Desperate ("I\'ll try anything")? Hopeful? Skeptical ("This won\'t work")? Frustrated? Resigned? Hypervigilant? This determines your messaging tone.' },
      { name: 'emotionalMotivators', label: 'Emotional Motivators (Ranked)', placeholder: '1) HOPE: "Other people got results, maybe I can too"\n2) FOMO: "Everyone\'s talking about this, am I missing out?"\n3) ASPIRATION: "I want to feel/look like this"\n4) RELIEF: "Finally someone understands my problem"\n5) BELONGING: "I\'m part of a community that gets it"\nWhich is strongest for your customer?', type: 'textarea' },
      { name: 'buyingTriggers', label: 'Buying Triggers (Specific Moments)', placeholder: 'What specific moment/event triggers a purchase? e.g., Bad skin day when going out + saw testimonial online = purchase. OR New Year resolution + remembering this product they saw. What\'s the SEQUENCE?' },
      { name: 'buyingJourney', label: 'Typical Buying Journey Timeline', placeholder: 'Sees ad (Day 0) → Visits site (Day 1) → Reads reviews (Day 2) → Asks friend (Day 3) → Buys during retargeting (Day 7). How long is YOUR customer journey?' },
      { name: 'riskTolerance', label: 'Risk Tolerance & Guarantee Needs', placeholder: 'On a scale: Do they NEED a money-back guarantee to buy? "Highly risk-averse: won\'t buy without 60-day guarantee" OR "Risk-neutral: sees it as an investment to try". Where are they?' },
      { name: 'pricePerception', label: 'Price Perception (Context Matters)', placeholder: 'Your price: €65. Context: "€65/month feels expensive" vs "€65 is cheaper than 1 salon visit" vs "€0.65 per use is a steal". How do THEY see the price?' },
      { name: 'priceComparison', label: 'Price Anchoring (What They Compare To)', placeholder: 'Your price: €65. They compare it to: "Competitor X at €80" OR "Dermatologist at €200 for consultation" OR "Their failed product at €40 that didn\'t work". Frame against the right comparison.' },
      { name: 'proofRequired', label: 'Proof Requirements (What Moves The Needle?)', placeholder: 'Ranked importance: 1) Testimonials (50% persuasion power) 2) Before/after photos (30%) 3) Money-back guarantee (15%) 4) Celebrity endorsement (5%). What proof matters MOST?' },
      { name: 'communicationTone', label: 'Communication Tone (Empathy vs Authority)', placeholder: 'Spectrum: Highly empathetic ("I understand your struggle") ←→ Pure authority ("Trust the science")? For your persona, where on the spectrum?' },
      { name: 'storyVsFacts', label: 'Story-Driven vs Facts-Driven?', placeholder: 'This persona prefers: Storytelling (emotional journey of transformation) vs Facts/Data (clinical proof, percentages)? Or 70% story / 30% facts?' },
      { name: 'brandRelationship', label: 'What Brand Relationship Do They Want?', placeholder: 'e.g., "Friend who gets it" (peer, vulnerable) OR "Trusted expert" (authority, credible) OR "Coach" (supportive, guiding) OR "Mentor" (experienced, protective)' },
      { name: 'dealBreakers', label: 'Instant "NO" Deal Breakers', placeholder: '1) [What would make them say NO immediately?] e.g., "If it\'s tested on animals"\n2) [What would make them say YES immediately?] e.g., "If I see a 60-day money-back guarantee"' },
    ],
  },
  {
    key: 'customer-psychographics',
    label: 'Complete Lifestyle & Behavioral Profile',
    fields: [
      { name: 'dayInLife', label: 'Complete "Day in the Life" (Hour by Hour)', placeholder: '6am: Wake, workout (30 min) | 7am: Shower + skincare | 8-9am: Commute (scrolls Instagram) | 9-5pm: Work (desk job) | 5-6pm: Gym or yoga | 6-8pm: Dinner/partner time | 8-10pm: Netflix + skincare routine | 10:30pm: Bed. Where does your product fit?', type: 'textarea' },
      { name: 'exerciseHabits', label: 'Exercise & Health Habits (Specific)', placeholder: 'e.g., 4x/week gym + 1x yoga | Runs 10k every Sunday | Peloton enthusiast | Crossfit competitor | No exercise (sedentary). How fit are they? How much do they prioritize health?' },
      { name: 'hobbyInterests', label: 'Hobbies & Personal Interests', placeholder: 'Ranked by time spent: 1) [Hobby] — 10 hours/week | 2) [Hobby] — 5 hours/week | 3) [Hobby] — 2 hours/week. Examples: photography, cooking, gaming, reading, DIY projects, travel planning' },
      { name: 'entertainmentChoices', label: 'Entertainment & Media Consumption', placeholder: 'TV shows watched: [Show] (Netflix subscriber) | Podcasts: [Name] (true crime / productivity) | Music: [Genre] (upbeat pop / lo-fi) | Books: [Genre] (self-help / fiction). What do they consume DAILY?' },
      { name: 'socialLife', label: 'Social Life & Relationship Status', placeholder: 'Married with 2 kids (social = family focused) OR Single and dates (social = dating app heavy) OR Long-term partner (couple activities) OR Isolated (works from home). How social are they?' },
      { name: 'friendGroup', label: 'Friend Group & Social Circle Type', placeholder: 'Close-knit group of 3-5 best friends (loyalty-focused) OR Large network of 50+ acquaintances (trend-follower) OR Work colleagues (professional network) OR Online community (Discord/Reddit). How do they socialize?' },
      { name: 'diningHabits', label: 'Food & Dining Preferences', placeholder: 'Meal prep on Sundays (organized) OR Eats out 5x/week (convenience-focused) OR Vegetarian/vegan (values-driven) OR Loves trying new restaurants (adventurous). Spend €400/month or €1000+/month on food?' },
      { name: 'vacationTravel', label: 'Vacation & Travel Patterns', placeholder: 'International: 2x/year (e.g., beach + city break) OR Domestic: 1x/year road trip OR Staycation only OR Adventure travel (hiking, diving). Where do they go? How often? Budget class: Budget/Comfort/Luxury?' },
      { name: 'vacationStyle', label: 'Vacation Style (Beach/City/Adventure/Culture)', placeholder: 'Beach resort vacation: "I want to relax and disconnect" | City break: "I want to explore and eat well" | Adventure trip: "I want hiking/activities" | Cultural immersion: "I want to learn and experience". Which speaks to them?' },
      { name: 'fashionStyle', label: 'Fashion & Style Choices', placeholder: 'e.g., "Minimalist wardrobe, mostly neutrals, quality over quantity" OR "Fashion-forward, follows trends, buys new seasonal pieces" OR "Comfort-first, athleisure, fast fashion". Do they care about appearance?' },
      { name: 'technologyAdoption', label: 'Tech Adoption & Device Usage', placeholder: 'iPhone 15 Pro (latest, bought immediately) OR iPhone 12 (waits 2-3 years) OR Android (contrarian/cost-conscious) | Uses: Apple Watch, AirPods, smart home? | Early adopter vs late adopter?' },
      { name: 'newsConsumption', label: 'News Consumption & Media Diet', placeholder: 'How often: Multiple times/day OR 1x/day OR 1x/week? Sources: NYT + BBC + NPR (traditional) OR Twitter/TikTok (internet native) OR Podcasts (audio-focused) OR Doesn\'t follow news (apolitical). What political leaning?' },
      { name: 'newsTopics', label: 'What News Topics Do They Follow?', placeholder: 'Politics, science, climate change, business/startup news, health news, entertainment/celebrity gossip, sports? What ACTUALLY engages them?' },
      { name: 'unrelatedProblems', label: 'Other Life Problems (Unrelated To Your Product)', placeholder: 'e.g., "Anxiety about job security" | "Struggling with weight" | "Sleep issues" | "Financial stress" | "Relationship concerns" | "Parenting stress" | "Imposter syndrome". What else keeps them stressed?' },
      { name: 'importantValues', label: 'What\'s Important To Them? (Ranked)', placeholder: '1) Family/relationships (would cancel plans for family) | 2) Health & wellness (exercises regularly, prioritizes sleep) | 3) Career/success (ambitious, works overtime) | 4) Financial security (saves aggressively) | 5) Experiences (travels, tries new things). What REALLY matters?' },
      { name: 'moneyAttitude', label: 'Money Mindset & Spending Patterns', placeholder: 'Spender ("Life is short, treat yourself") vs Saver ("Always plan ahead") vs Balanced? Splurges on: experiences/travel, gadgets, luxury brands, skincare/wellness? Saves on: cheap groceries, hand-me-downs? Debt: none/credit cards/student loans?' },
      { name: 'aspirations', label: 'Life Aspirations & Dreams', placeholder: 'e.g., "Start own business" | "Move to Bali" | "Get promoted to director" | "Have kids" | "Buy a house" | "Write a book" | "Stay fit forever". What do they want their life to LOOK LIKE?' },
      { name: 'insecurities', label: 'Insecurities & Comparison Triggers', placeholder: 'e.g., "Compares appearance to Instagram influencers" | "Feels behind peers in career" | "Envies friend\'s travel photos" | "Worried about aging" | "Stressed about body image". What makes them feel LESS THAN?' },
      { name: 'dealBreakerValues', label: 'Non-Negotiable Values (Deal Breakers)', placeholder: 'e.g., "Must be cruelty-free or I can\'t buy" | "Must be made in my country or no" | "Must not support controversial people" | "Must have minimum wage workers". What WOULD they refuse to buy from?' },
    ],
  },
  {
    key: 'positioning',
    label: 'Positioning & Competitive Differentiation',
    fields: [
      { name: 'marketPosition', label: 'Where Do You Sit vs Competitors?', placeholder: 'Premium/budget? Leader/challenger? Innovator/follower? Niche specialist/mass market?', type: 'textarea' },
      { name: 'nicheDefinition', label: 'What Niche Do You Fill Uniquely?', placeholder: 'Specific audience, use case, benefit, or market gap that competitors don\'t address?', type: 'textarea' },
      { name: 'pricePositioning', label: 'Price vs Value Positioning', placeholder: 'Are you premium-priced? Competitive? Budget? Why? What justifies your price point?', type: 'textarea' },
      { name: 'targetNeedsUnmet', label: 'What Customer Needs Are Unmet?', placeholder: 'What pain points do competitors ignore? What desires are underserved in the market?', type: 'textarea' },
      { name: 'qualityDifferentiation', label: 'Differentiate via Quality or Features?', placeholder: 'Superior materials, craftsmanship, performance, features, customization, reliability?', type: 'textarea' },
      { name: 'positioningStatement', label: 'Positioning Statement (Elevator Pitch)', placeholder: 'For [target customer] who [need], [brand] is [category] that [unique benefit]. Unlike [competitor], we [differentiation].', type: 'textarea' },
      { name: 'marketGaps', label: 'Which Market Gaps Do You Solve?', placeholder: 'Price gaps, quality gaps, service gaps, experience gaps, accessibility gaps?', type: 'textarea' },
      { name: 'uniqueFeatures', label: 'What Unique Feature Sets You Apart?', placeholder: 'Proprietary technology, exclusive ingredients, unique design, one-of-a-kind service?', type: 'textarea' },
      { name: 'designAdvantage', label: 'How Does Your Design Outshine Rivals?', placeholder: 'Aesthetics, usability, sustainability, innovation, customization, attention to detail?', type: 'textarea' },
      { name: 'proprietaryTech', label: 'What Proprietary Technology Gives Advantage?', placeholder: 'Patents, algorithms, processes, formulations that competitors can\'t replicate?', type: 'textarea' },
      { name: 'emotionalDifferentiation', label: 'Emotional Differentiation vs Competitors', placeholder: 'How do you make customers FEEL differently? Trust, joy, belonging, empowerment?', type: 'textarea' },
      { name: 'packagingDifferentiation', label: 'How Does Packaging Set You Apart Visually?', placeholder: 'Unboxing experience, sustainability, luxury feel, brand story on packaging?', type: 'textarea' },
      { name: 'serviceAdvantage', label: 'Which Services Do Competitors Lack?', placeholder: 'Customer support quality, customization, education, community, lifetime value services?', type: 'textarea' },
      { name: 'buyingExperience', label: 'Differentiated Buying Experience', placeholder: 'How is shopping with you different? Checkout process, personalization, surprise & delight moments?', type: 'textarea' },
      { name: 'mainBenefit', label: 'Main Benefit to Customer (Quantified)', placeholder: 'What is the #1 benefit? Time saved? Money saved? Performance gain? Peace of mind?', type: 'textarea' },
      { name: 'valuePitch', label: 'How Quantify Value / ROI to Customers?', placeholder: 'Show savings, performance improvements, time investment vs return, cost-per-use comparison', type: 'textarea' },
    ],
  },
  {
    key: 'kpis',
    label: 'KPIs & Success Metrics',
    fields: [
      { name: 'conversionRate', label: 'Target Conversion Rate (With Benchmark)', placeholder: 'e.g., 3%+ (industry benchmark for skincare is 1-2%, so 3%+ is above average). What are YOU aiming for?' },
      { name: 'cac', label: 'Target CAC (Customer Acquisition Cost)', placeholder: 'e.g., €30-35. What\'s your max allowable CAC based on LTV?' },
      { name: 'breakEvenCac', label: 'Break-Even CAC (Important!)', placeholder: 'If your product price is €65 and margin is 50%, break-even CAC is ~€30. Don\'t lose money acquiring customers.' },
      { name: 'roas', label: 'Target ROAS (Return On Ad Spend)', placeholder: 'e.g., 3:1 ROAS (for every €1 spent, €3 back) = profitable. 2:1 = break-even area. What\'s your target?' },
      { name: 'repeatPurchase', label: 'Target Repeat Purchase Rate', placeholder: 'e.g., 40%+ within 90 days (important for LTV). What % buy again?' },
      { name: 'ltv30', label: 'Target LTV (Lifetime Value) In 30 Days', placeholder: 'e.g., €120. If CAC is €30, you have 4:1 LTV:CAC ratio (healthy).' },
      { name: 'aov', label: 'Target AOV (Average Order Value)', placeholder: 'e.g., €85 (current) vs €120 (target). How do you increase it? Upsells? Bundling?' },
      { name: 'marketingBudget', label: 'Total Marketing Budget (Monthly)', placeholder: 'e.g., €5,000/month. This determines how many ads you can test and scale.' },
      { name: 'otherMetrics', label: 'Other Critical Metrics To Track', placeholder: 'CTR (click-through rate target: 1%+), Cost-per-click target (€0.50 max), engagement rate, review generation rate, email list growth', type: 'textarea' },
      { name: 'successDefinition', label: 'What Does "Success" Look Like In 90 Days?', placeholder: 'e.g., "€5k MRR, 100k email subscribers, 3+ creatives with 2.5:1+ ROAS, 35% repeat purchase rate". Be specific about WHAT SUCCESS IS.' },
    ],
  },
  {
    key: 'creative-angles',
    label: 'Creative Angles & Hook Strategy',
    fields: [
      { name: 'topPerformingAngles', label: 'Top Performing Angles So Far', placeholder: 'What angles have worked? (e.g., authority, UGC, problem-agitate-solve, transformation, before/after, founder story, social proof)', type: 'textarea' },
      { name: 'untestedAngles', label: 'Untested Angles To Explore', placeholder: 'What angles haven\'t you tried? (e.g., contrarian, emotional storytelling, niche pain point, identity shift)', type: 'textarea' },
      { name: 'contrarian Angles', label: 'Taboo / Contrarian Angles', placeholder: 'What controversial or counter-intuitive angles resonate? What "forbidden" messages work? (e.g., "This is too expensive to ignore" vs "Most affordable option")', type: 'textarea' },
      { name: 'emotionalVsRational', label: 'Emotional vs Rational Angles Split', placeholder: 'What % emotional vs rational? (e.g., 70% emotional hope, 30% rational proof OR 40/60)', type: 'textarea' },
      { name: 'awarenessSplit', label: 'Problem-Aware vs Solution-Aware vs Product-Aware Messaging', placeholder: 'Breakdown of messaging: X% problem-agitate, Y% solution education, Z% product features (e.g., 40% problem, 40% solution, 20% product)', type: 'textarea' },
      { name: 'hookBank', label: 'Hook Bank (First 3 Seconds)', placeholder: 'What hooks stop the scroll? (e.g., "Don\'t make this mistake", "This changed my life", "We\'ve all been lied to", "You\'ve been doing this wrong")', type: 'textarea' },
      { name: 'scrollStoppingVisuals', label: 'Scroll-Stopping Visuals That Work', placeholder: 'What visual elements stop people? (e.g., before/after, facial expressions, fast cuts, bright colors, text overlays, movement)', type: 'textarea' },
      { name: 'legalClaimsGuidance', label: 'Claims You CAN Say vs CANNOT Say', placeholder: 'Legal compliance: What claims are safe? What must be avoided? Any disclaimers needed?', type: 'textarea' },
    ],
  },
  {
    key: 'offer-structure',
    label: 'Offer Structure',
    fields: [
      { name: 'bundleOptions', label: 'Bundle Options', placeholder: 'What bundles work? (e.g., 1-pack, 3-pack, 6-pack, starter set, deluxe bundle)', type: 'textarea' },
      { name: 'discountPromos', label: 'Discount / Promotional Strategy', placeholder: 'What discounts move inventory? (e.g., 10% first-time buyer, 20% 3-pack, seasonal sales, loyalty discounts)', type: 'textarea' },
      { name: 'subscriptionModel', label: 'Subscription Model (If Applicable)', placeholder: 'Do you offer subscriptions? (e.g., monthly subscription, auto-replenish, subscription discount %)', type: 'textarea' },
      { name: 'freeShippingThreshold', label: 'Free Shipping Thresholds', placeholder: 'At what order value do you offer free shipping? (e.g., Free shipping on $50+, $75+, all orders)', type: 'textarea' },
      { name: 'bonusesAndGifts', label: 'Bonuses / Gifts Offered', placeholder: 'What bonuses increase AOV? (e.g., free guide with purchase, free sample, free consultation, bonus product)', type: 'textarea' },
      { name: 'guaranteeTerms', label: 'Guarantee / Risk Reversal Terms', placeholder: 'What guarantee? (e.g., 30-day money back, 60-day satisfaction guarantee, lifetime guarantee, no questions asked)', type: 'textarea' },
      { name: 'paymentPlans', label: 'Payment Plans (Klarna, Afterpay, etc.)', placeholder: 'Do you offer installments? (e.g., "Pay in 4 with Klarna", Afterpay, Affirm, 3-month payment plan)', type: 'textarea' },
      { name: 'ltvStrategy', label: 'Lifetime Value Strategy', placeholder: 'How do you maximize LTV? (e.g., upsells, cross-sells, retention emails, VIP program, referral rewards)', type: 'textarea' },
    ],
  },
  {
    key: 'funnel-structure',
    label: 'Funnel Structure',
    fields: [
      { name: 'lpType', label: 'Landing Page Type', placeholder: 'What LP format? (e.g., long-form sales page, advertorial, product page, quiz funnel, video sales letter)', type: 'textarea' },
      { name: 'lpSections', label: 'Key Sections On Landing Page', placeholder: 'What sections must be included? (e.g., hero, problem, agitation, solution, social proof, objection handling, FAQ, guarantee, CTA)', type: 'textarea' },
      { name: 'coreHeadline', label: 'Core Headline On LP', placeholder: 'What\'s the main headline that converts? (e.g., "Finally, [solution] that actually works for [audience]")', type: 'textarea' },
      { name: 'offerFraming', label: 'Offer Framing On LP', placeholder: 'How is the offer presented? (e.g., scarcity, limited time, exclusive access, payment plan emphasis, guarantee prominence)', type: 'textarea' },
      { name: 'socialProofStrategy', label: 'Social Proof On LP', placeholder: 'What proof is most prominent? (e.g., testimonial count, video testimonials, star rating, press logos, influencer endorsements)', type: 'textarea' },
      { name: 'pageSpeed', label: 'Page Load Speed / Mobile Optimization', placeholder: 'What\'s your target load time? Mobile-first? (e.g., <2 seconds desktop, <3 seconds mobile, mobile-optimized design)', type: 'textarea' },
      { name: 'checkoutFriction', label: 'Checkout Friction Points', placeholder: 'What friction exists? How to reduce it? (e.g., guest checkout, autofill, trust badges, payment options, exit-intent offers)', type: 'textarea' },
    ],
  },
  {
    key: 'proof-assets',
    label: 'Proof Assets Library',
    fields: [
      { name: 'beforeAfterImages', label: 'Before/After Images', placeholder: 'How many? Quality? Customer vs professional? (e.g., 50+ authentic customer BA photos, studio quality)', type: 'textarea' },
      { name: 'clinicalStudies', label: 'Clinical Studies / Research', placeholder: 'What studies support your claims? (e.g., 3rd-party study showing X efficacy, published research link, data citations)', type: 'textarea' },
      { name: 'dataPoints', label: 'Data Points / Statistics', placeholder: 'What data strengthens credibility? (e.g., "92% of users saw results in 30 days", "Trusted by 100k+ customers")', type: 'textarea' },
      { name: 'ugcLibrary', label: 'User Generated Content Library', placeholder: 'How much UGC do you have? (e.g., 200+ customer photos, 50+ customer videos, hashtag campaign volume)', type: 'textarea' },
      { name: 'influencerContent', label: 'Influencer / Creator Content', placeholder: 'What influencers have featured you? (e.g., 5 micro-influencers, 2 macro-influencers, total reach, authentic partnerships)', type: 'textarea' },
      { name: 'pressMentions', label: 'Press Mentions / Publications', placeholder: 'Where have you been featured? (e.g., Forbes, TechCrunch, Women\'s Health, 15+ publications)', type: 'textarea' },
      { name: 'awardsRecognitions', label: 'Awards / Industry Recognition', placeholder: 'What awards? (e.g., "Best Skincare Product 2024", Industry Leadership Award, Customer Choice Award)', type: 'textarea' },
      { name: 'caseStudies', label: 'Case Studies', placeholder: 'Detailed transformation stories? (e.g., 3 detailed case studies, specific metrics, timeline)', type: 'textarea' },
      { name: 'reviewsRatings', label: 'Reviews Count + Average Rating', placeholder: 'Review volume & score? (e.g., 4.8/5 stars from 2,000+ reviews, 95% positive feedback)', type: 'textarea' },
      { name: 'videoTestimonials', label: 'Video Testimonials', placeholder: 'How many? Quality? (e.g., 20+ authentic customer video testimonials, 2-3 min each)', type: 'textarea' },
    ],
  },
  {
    key: 'creative-production',
    label: 'Creative Production Guidelines',
    fields: [
      { name: 'brandGuidelines', label: 'Brand Do\'s and Don\'ts', placeholder: 'What\'s on-brand vs off-brand? (e.g., "Always show real people", "Never use stock imagery", "Always include value messaging")', type: 'textarea' },
      { name: 'platformSafeZones', label: 'Platform-Specific Safe Zones', placeholder: 'What areas must be clear of text? (e.g., Instagram: top & bottom 20%, TikTok: corners, Facebook: no text in top 20%)', type: 'textarea' },
      { name: 'textOnScreenRules', label: 'Text On Screen Rules', placeholder: 'Text guidelines? (e.g., max 20% of video, white sans-serif only, captions required, text hierarchy rules)', type: 'textarea' },
      { name: 'allowedClaims', label: 'Allowed Claims / Legal Compliance', placeholder: 'What claims are allowed by law? (e.g., can\'t claim to cure, must include "not evaluated by FDA", include disclaimers)', type: 'textarea' },
      { name: 'visualConsistency', label: 'Visual Consistency Rules', placeholder: 'Style consistency? (e.g., specific color palette, font families, filter style, aesthetic uniformity)', type: 'textarea' },
      { name: 'logoUsageRules', label: 'Logo Usage Rules', placeholder: 'How/when to show logo? (e.g., must appear in end card, 3 second minimum visibility, specific placement)', type: 'textarea' },
      { name: 'musicSoundStyle', label: 'Music / Sound Style', placeholder: 'What audio works? (e.g., trending sounds, upbeat music, voiceover style, no background music required)', type: 'textarea' },
      { name: 'editingPacingStyle', label: 'Editing Pacing Style', placeholder: 'Pacing preferences? (e.g., fast cuts for TikTok, slower pacing for YouTube, 3-second scene changes max)', type: 'textarea' },
      { name: 'ugcVsPolishedSplit', label: 'UGC vs Polished Split', placeholder: 'What ratio? (e.g., 60% authentic UGC, 40% polished brand content OR 30/70)', type: 'textarea' },
    ],
  },
  {
    key: 'content-inputs',
    label: 'Content Inputs Available',
    fields: [
      { name: 'existingPhotos', label: 'Existing Photos Available', placeholder: 'What photos do you have? (e.g., 100+ product shots, 50+ lifestyle photos, high-res files, organized asset library)', type: 'textarea' },
      { name: 'existingVideos', label: 'Existing Videos Available', placeholder: 'What videos? (e.g., 10 product demo videos, 5 testimonial videos, stock footage license)', type: 'textarea' },
      { name: 'founderFootage', label: 'Founder Footage Available', placeholder: 'Can founder be featured? (e.g., 5 hours of founder interview footage, authorization for use)', type: 'textarea' },
      { name: 'customerFootage', label: 'Customer Footage / Testimonials', placeholder: 'Customer video content? (e.g., 20 customer testimonial videos, usage videos, permission to use)', type: 'textarea' },
      { name: 'productRenders', label: 'Product 3D Renders / Models', placeholder: 'Do you have 3D assets? (e.g., fully rigged 3D model, multiple angles, animation-ready)', type: 'textarea' },
      { name: 'lifestyleFootage', label: 'Lifestyle / Contextual Footage', placeholder: 'Lifestyle content? (e.g., 30 lifestyle videos, product-in-use footage, day-in-life content)', type: 'textarea' },
      { name: 'voiceoverAssets', label: 'Voiceover Assets', placeholder: 'VO available? (e.g., professional VO recorded, multiple takes, scripts ready)', type: 'textarea' },
      { name: 'brollLibrary', label: 'B-Roll / Stock Footage Library', placeholder: 'B-roll available? (e.g., licensed stock footage, nature shots, transitions, slow-mo footage)', type: 'textarea' },
    ],
  },
  {
    key: 'audience-stages',
    label: 'Audience Stages & Messaging',
    fields: [
      { name: 'coldAudience', label: 'Cold Audience Messaging', placeholder: 'First-time visitors: What hooks them? (e.g., "Here\'s the problem you didn\'t know you had", pain-based messaging, curiosity hooks)', type: 'textarea' },
      { name: 'warmAudience', label: 'Warm Audience (Site Visitors)', placeholder: 'People who visited your site: What next? (e.g., retargeting with social proof, limited-time offer, testimonials)', type: 'textarea' },
      { name: 'hotAudience', label: 'Hot Audience (Cart Abandoners)', placeholder: 'About to leave: What saves the sale? (e.g., discount urgency, guarantee emphasis, objection handling, payment options)', type: 'textarea' },
      { name: 'existingCustomers', label: 'Existing Customers Messaging', placeholder: 'Current buyers: What\'s next? (e.g., upsells, referral rewards, loyalty program, exclusive access)', type: 'textarea' },
      { name: 'lapsedCustomers', label: 'Lapsed Customers Messaging', placeholder: 'People who bought but haven\'t returned: How to re-engage? (e.g., "We\'ve improved", loyalty bonus, VIP offer)', type: 'textarea' },
    ],
  },
  {
    key: 'awareness-mapping',
    label: 'Market Awareness Level Mapping',
    fields: [
      { name: 'unawareMessaging', label: 'Unaware Audience (Don\'t Know They Have The Problem)', placeholder: 'Who doesn\'t know they need this? What messaging works? (e.g., symptom-focused, problem revelation, education)', type: 'textarea' },
      { name: 'problemAwareMessaging', label: 'Problem-Aware (Know The Problem But Not Solutions)', placeholder: 'Who feels the pain but doesn\'t know solutions? (e.g., "Here\'s why you\'ve been struggling", solution education)', type: 'textarea' },
      { name: 'solutionAwareMessaging', label: 'Solution-Aware (Know Solutions Exist But Not You)', placeholder: 'Who knows solutions exist but not your brand? (e.g., "Why Brand X is missing this key thing", comparative messaging)', type: 'textarea' },
      { name: 'productAwareMessaging', label: 'Product-Aware (Know You Exist But Not Convinced)', placeholder: 'Who\'s seen you but not bought? (e.g., deep social proof, guarantee emphasis, FAQ/objection answers)', type: 'textarea' },
      { name: 'mostAwareMessaging', label: 'Most Aware (Ready To Buy, Just Need Final Push)', placeholder: 'Who\'s basically sold? (e.g., "Start your transformation today", limited slots messaging, payment options)', type: 'textarea' },
      { name: 'awarenessPercentages', label: 'Market Breakdown By Awareness Level', placeholder: 'What % of your market is in each stage? (e.g., 50% unaware, 20% problem-aware, 15% solution-aware, 10% product-aware, 5% most-aware)', type: 'textarea' },
    ],
  },
  {
    key: 'economics-unit-math',
    label: 'Economics & Unit Math',
    fields: [
      { name: 'grossMarginPercent', label: 'Gross Margin %', placeholder: 'e.g., 70% (revenue - COGS / revenue)' },
      { name: 'netMarginPercent', label: 'Net Margin % (After COGS, Shipping, Fees)', placeholder: 'e.g., 35% after all costs' },
      { name: 'breakEvenCpa', label: 'Break-Even CPA', placeholder: 'e.g., $45 (the CPA where you lose money)' },
      { name: 'targetCpa', label: 'Target CPA', placeholder: 'e.g., $30 (profitable target)' },
      { name: 'maxAllowableCac', label: 'Max Allowable CAC By SKU', placeholder: 'e.g., Product A: $40 | Product B: $55 | Bundle: $80' },
      { name: 'ltv30', label: 'Average LTV (30 / 60 / 90 days)', placeholder: 'e.g., 30d: $120 | 60d: $180 | 90d: $220' },
      { name: 'repeatPurchaseRates', label: 'Repeat Purchase Rates (% buying again)', placeholder: 'e.g., 30d: 15% | 60d: 25% | 90d: 35%' },
      { name: 'refundChargebackRate', label: 'Refund / Chargeback %', placeholder: 'e.g., 3.2% refund rate, 0.5% chargebacks' },
      { name: 'upsellTakeRate', label: 'Average Upsell Take Rate %', placeholder: 'e.g., 12% of customers add a upsell at checkout' },
      { name: 'returningCustomerRevenue', label: '% Revenue From Returning Customers', placeholder: 'e.g., 40% of monthly revenue comes from repeat purchases' },
    ],
  },
  {
    key: 'performance-data-past-ads',
    label: 'Performance Data (Past Ads)',
    fields: [
      { name: 'top10AdsRevenue', label: 'Top 10 Ads By Revenue (With Links/Screenshots)', placeholder: 'List with approximate revenue each generated and why you think they won', type: 'textarea' },
      { name: 'winningHooks', label: 'The Hook (First 3 Seconds) Of Each Winning Ad', placeholder: 'e.g., Ad #1: "Stop wasting money on..." | Ad #2: "What if I told you..." | Ad #3: Direct testimonial with pain point', type: 'textarea' },
      { name: 'platformMetrics', label: 'Average CTR, CPC, CPA Per Platform', placeholder: 'Meta: 1.2% CTR, $0.45 CPC, $28 CPA | TikTok: 2.1% CTR, $0.32 CPC, $22 CPA | YouTube: 0.8% CTR, $0.62 CPC, $35 CPA', type: 'textarea' },
      { name: 'viewCompletionRates', label: '% Viewers Watch Past 3s / 25% / 50% / 100%', placeholder: 'e.g., 45% past 3s | 28% past 25% | 18% past 50% | 8% complete watch' },
      { name: 'winningAngles', label: 'Which Angles Generated Most Purchases?', placeholder: 'e.g., Testimonial angle: 32% of sales | Problem-Agitate angle: 28% | Before/After: 22% | Authority: 18%', type: 'textarea' },
      { name: 'fatigueSpeed', label: 'Which Ads Fatigued Fastest?', placeholder: 'e.g., Celebrity endorsement died after 5 days | Shock value hook lasted 12 days | Testimonial had 30+ day lifespan', type: 'textarea' },
      { name: 'ctrVsConversion', label: 'High CTR But Low Conversion (Gap Ads)', placeholder: 'e.g., "Free trial" hook got 3% CTR but 0.8% conversion — LP mismatch?', type: 'textarea' },
      { name: 'lowCtrHighConversion', label: 'Low CTR But High Conversion (Quality Ads)', placeholder: 'e.g., Detailed testimonial got 0.6% CTR but 2.1% conversion — targeting right people', type: 'textarea' },
    ],
  },
  {
    key: 'channel-performance',
    label: 'Channel Performance',
    fields: [
      { name: 'lowestCpaChannel', label: 'Which Platform Currently Has Lowest CPA?', placeholder: 'e.g., TikTok: $22 CPA | Meta: $28 CPA | YouTube: $35 CPA — [Platform] is winning' },
      { name: 'highestLtvChannel', label: 'Which Platform Gives Highest LTV Customers?', placeholder: 'e.g., YouTube customers have $180 LTV vs Meta $140 vs TikTok $120 — quality matters more than volume' },
      { name: 'platformCreativeMatch', label: 'Which Creatives Work Best On Meta vs TikTok vs YouTube?', placeholder: 'Meta: Testimonials + carousel | TikTok: Trending sounds + quick cuts | YouTube: Long-form education + authority', type: 'textarea' },
      { name: 'spendAllocation', label: '% of Spend Per Platform (Current)', placeholder: 'e.g., Meta: 50% | TikTok: 30% | YouTube: 15% | Pinterest: 5%' },
      { name: 'platformTrend', label: 'Which Platform Is Saturated / Declining?', placeholder: 'e.g., Meta CPAs rising 15%/month → pivot to TikTok & Google; YouTube still growing', type: 'textarea' },
    ],
  },
  {
    key: 'objection-prioritization',
    label: 'Objection Prioritization',
    fields: [
      { name: 'top5Objections', label: 'Top 5 Objections By Frequency (%)', placeholder: 'e.g., 1. "Will it work for me?" (42%) | 2. "Too expensive" (28%) | 3. "Side effects concern" (18%) | 4. "Takes too long" (8%) | 5. "Don\'t trust the company" (4%)', type: 'textarea' },
      { name: 'checkoutDropObjection', label: 'Which Objection Causes Checkout Drop-Off?', placeholder: 'e.g., Price objection hits at payment page (8% drop) vs side effects (hits earlier in LP)', type: 'textarea' },
      { name: 'commentObjection', label: 'Which Objection Appears In Comments Most?', placeholder: 'e.g., YouTube comments: "Is this FDA approved?" (recurring) vs Meta: "How long does shipping take?"', type: 'textarea' },
      { name: 'hardestObjection', label: 'Which Objection Is Hardest To Overcome?', placeholder: 'e.g., Trust issue (hard — requires social proof + founder story) vs price (easy — payment plan solves it)', type: 'textarea' },
      { name: 'objectionStage', label: 'At What Stage Does Each Objection Appear?', placeholder: 'Price: Ad headline | Efficacy: LP midpoint | Side effects: Checkout page | Shipping: Post-purchase email', type: 'textarea' },
    ],
  },
  {
    key: 'angle-audience-mapping',
    label: 'Angle → Audience Mapping',
    fields: [
      { name: 'anglePersonaMap', label: 'For Each Angle: Which Persona Is This For?', placeholder: 'Testimonial angle → Emma (Conscious Skeptic) | Authority angle → John (Needs Expert Validation) | Price angle → Budget-Conscious Segment', type: 'textarea' },
      { name: 'angleAwarenessMap', label: 'For Each Angle: Which Awareness Level?', placeholder: 'Problem-Agitate → Unaware | Solution Education → Problem-Aware | Comparison → Solution-Aware | Social Proof → Product-Aware | Urgency → Most-Aware', type: 'textarea' },
      { name: 'anglePlatformMap', label: 'For Each Angle: Which Platform Does It Belong On?', placeholder: 'Testimonial → YouTube (trust) | Trending sound → TikTok | Educational → Pinterest | Emotional story → Facebook', type: 'textarea' },
      { name: 'angleFunnelMap', label: 'For Each Angle: Which Funnel Stage?', placeholder: 'Cold traffic: Education angle | Warm traffic: Social proof angle | Hot traffic: Urgency angle | Retargeting: Objection handling angle', type: 'textarea' },
      { name: 'angleEmotionMap', label: 'For Each Angle: What Emotion Does It Trigger?', placeholder: 'Authority angle → Confidence | Testimonial → Hope | Scarcity → FOMO | Risk-reversal → Relief | Before/After → Aspiration', type: 'textarea' },
      { name: 'angleBelief', label: 'For Each Angle: What Belief Must Change?', placeholder: 'Angle 1: "This won\'t work for me" → "Real people just like me got results" | Angle 2: "I can\'t afford it" → "It\'s cheaper than my current solution"', type: 'textarea' },
    ],
  },
  {
    key: 'creative-testing-system',
    label: 'Creative Testing System',
    fields: [
      { name: 'creativesPerWeek', label: 'How Many New Creatives Per Week Will You Test?', placeholder: 'e.g., 5–7 new creatives/week for learning phase, 2–3/week for steady state' },
      { name: 'testingBudget', label: 'What Is Your Testing Budget Per Week?', placeholder: 'e.g., €500/week for testing, €2000/week for scaling (80/20 split)' },
      { name: 'killThreshold', label: 'After How Much Spend Do You Kill An Ad?', placeholder: 'e.g., €200 spend with >€35 CPA kill it | OR 7 days with no improvement | OR 3x ROAS threshold not hit' },
      { name: 'scalingQualification', label: 'What Metrics Qualify An Ad For Scaling?', placeholder: 'e.g., <€25 CPA AND 2:1 ROAS after €150 spend AND no signs of fatigue' },
      { name: 'winnerIteration', label: 'How Do You Iterate Winners? (Hook / Body / CTA / Visual)', placeholder: 'e.g., Take winning hook + test 3 new body copies | Keep body + test 2 new CTAs | Keep everything + test 3 new visuals', type: 'textarea' },
      { name: 'variationsPerConcept', label: 'How Many Variations Per Concept Do You Produce?', placeholder: 'e.g., 1 core concept = 4 visual variations × 3 hook variations = 12 test ads' },
    ],
  },
  {
    key: 'hook-system',
    label: 'Hook System',
    fields: [
      { name: 'bestHookFormats', label: 'Which Hook Formats Have Worked Best?', placeholder: 'Question hook: 28% CTR | Stat/shock hook: 35% CTR | Story hook: 22% CTR | Demo hook: 18% CTR | Problem-agitate: 32% CTR', type: 'textarea' },
      { name: 'top20Hooks', label: 'Top 20 Proven Hooks (Copy Them Exactly)', placeholder: '1. "Stop wasting money on..." | 2. "What if I told you..." | 3. "This is why you failed..." | 4. "Most people don\'t know..." etc.', type: 'textarea' },
      { name: 'hookVisualPairs', label: 'What Scroll-Stopping Visuals Pair With Each Hook?', placeholder: 'Question hook + close-up face reaction | Stat hook + bold text overlay | Story hook + cinematic B-roll | Demo hook + product in action', type: 'textarea' },
      { name: 'coldTrafficHooks', label: 'Which Hooks Work Best For Cold Traffic?', placeholder: 'e.g., Curiosity hooks, bold claims, problem revelation — avoid brand-specific messages' },
      { name: 'retargetingHooks', label: 'Which Hooks Work Best For Retargeting?', placeholder: 'e.g., "Remember when you saw..." | Testimonial from similar person | Risk-reversal ("You have 60 days...")' },
    ],
  },
  {
    key: 'retention-backend',
    label: 'Retention & Backend Strategy',
    fields: [
      { name: 'emailFlowStructure', label: 'Email Flow Structure Post-Purchase', placeholder: 'Day 0: Confirmation | Day 1: Thank you + onboarding | Day 3: How to use guide | Day 7: First results? | Day 14: Upsell | Day 30: Reorder reminder', type: 'textarea' },
      { name: 'smsFlowStructure', label: 'SMS Flow Structure', placeholder: 'Day 1: Order confirmation | Day 3: Shipping update | Day 7: "How\'s it going?" check-in | Day 14: Testimonial request | Day 30: Reorder trigger', type: 'textarea' },
      { name: 'repeatTrigger', label: 'What Triggers A Repeat Purchase?', placeholder: 'e.g., Email on day 30 ("Time to reorder") | SMS on 45-day mark | Subscription auto-replenish | Loyalty points redemption', type: 'textarea' },
      { name: 'topUpsellsCrossSells', label: 'Top 3 Upsells / Cross-Sells', placeholder: '1. Bundled upgrade (e.g., 3-pack instead of 1) | 2. Complementary product (e.g., serum + moisturizer) | 3. VIP membership or subscription', type: 'textarea' },
      { name: 'churnReasons', label: 'Why Do Customers Churn / Stop Buying?', placeholder: 'e.g., 35% found cheaper alternative | 25% didn\'t see results | 20% logistical (forgot to reorder) | 15% side effects | 5% satisfied (permanent solution)', type: 'textarea' },
      { name: 'subscriptionRetention', label: 'Subscription Retention Rate %', placeholder: 'e.g., 68% month 1→2 retention, 45% month 3, 30% month 6' },
    ],
  },
  {
    key: 'creative-fatigue-system',
    label: 'Creative Fatigue System',
    fields: [
      { name: 'fatigueTimeline', label: 'After How Many Days Do Ads Typically Fatigue?', placeholder: 'e.g., Shock hooks: 5–7 days | Testimonials: 14–21 days | Educational: 25+ days | Brand-safe: 30+ days' },
      { name: 'fatigueMetric', label: 'What Metric Drops First? (CTR / CPA / Frequency)', placeholder: 'e.g., CTR drops first (shows fatigue) | Then CPA rises | Then ROAS tanks — kill before all three decline' },
      { name: 'newCreativeFrequency', label: 'How Often Do You Launch New Creatives?', placeholder: 'e.g., Weekly for scaling campaigns, Every 3 days during holidays, Every 5 days for mature campaigns' },
      { name: 'backupCreatives', label: 'How Many Backup Creatives Are Ready At Any Time?', placeholder: 'e.g., 10 tested creatives in reserve so when an ad fatigues (30 min turnaround) you have a replacement queued' },
    ],
  },
  {
    key: 'compliance-ad-account-risk',
    label: 'Compliance & Ad Account Risk',
    fields: [
      { name: 'disapprovedClaims', label: 'What Claims Have Been Disapproved Before?', placeholder: 'e.g., "Cures neuropathy" — disapproved | "FDA-cleared" — requires substantiation | "Clinically proven" — must link study', type: 'textarea' },
      { name: 'restrictedWords', label: 'What Words Are Restricted In Your Niche?', placeholder: 'Health: avoid "cure", "prevent", "treat" | Supplement: need disclaimer for health claims | Skincare: can\'t claim structural skin repair', type: 'textarea' },
      { name: 'riskTolerance', label: 'What Is Your Risk Tolerance? (Safe vs Aggressive)', placeholder: 'e.g., Safe: Only FDA-backed claims | Moderate: Some aspirational language | Aggressive: Push boundaries (but risk account ban)' },
      { name: 'backupAccounts', label: 'Do You Have Backup Ad Accounts / BMs?', placeholder: 'e.g., Primary: Account A (for testing) | Secondary: Account B (for scaling) | Tertiary: Account C (as backup if banned)' },
    ],
  },
  {
    key: 'competitor-deep-dive',
    label: 'Competitor Deep Dive',
    fields: [
      { name: 'competitorMainHook', label: 'For Each Competitor: Main Hook', placeholder: 'Competitor A: "Natural formula" | Competitor B: "Doctor-recommended" | Competitor C: "Fastest relief"', type: 'textarea' },
      { name: 'competitorOfferStructure', label: 'For Each Competitor: Offer Structure', placeholder: 'Competitor A: Single price $49 | Competitor B: 3-pack $99 (save $48) | Competitor C: Subscription $39/mo', type: 'textarea' },
      { name: 'competitorPriceAnchoring', label: 'For Each Competitor: Price Anchoring', placeholder: 'Competitor A: "Was $79, now $49" | Competitor B: Compare to $100+ competitor | Competitor C: Cost per use ($0.50/day)', type: 'textarea' },
      { name: 'competitorCreativeStyle', label: 'For Each Competitor: Creative Style', placeholder: 'Competitor A: Celebrity endorsement + cinematic | Competitor B: Real customer testimonials + slow pacing | Competitor C: Fast-cut educational', type: 'textarea' },
      { name: 'competitorComplaints', label: 'What Do Customers Complain About In Reviews?', placeholder: 'e.g., Competitor A: "Didn\'t work" | Competitor B: "Too greasy" | Competitor C: "Side effects"', type: 'textarea' },
      { name: 'competitorLove', label: 'What Do Customers Love Most?', placeholder: 'e.g., Competitor A: Fast shipping | Competitor B: Customer support | Competitor C: Visible results in 7 days', type: 'textarea' },
    ],
  },
  {
    key: 'real-customer-language',
    label: 'Real Customer Language',
    fields: [
      { name: 'customerReviews', label: 'Paste 10 Real Customer Reviews (Exact Copy)', placeholder: 'Copy-paste 10 of your best/most honest reviews. This becomes your copywriting gold mine.', type: 'textarea' },
      { name: 'redditForumQuotes', label: 'Paste 10 Reddit/Forum Quotes (Customer Pain Language)', placeholder: 'Find relevant subreddits/forums and paste exact language customers use. This is pure copywriting fuel.', type: 'textarea' },
      { name: 'problemLanguage', label: 'Exact Phrases Customers Use For The Problem', placeholder: 'e.g., "Burning sensation", "Electric shock", "Can\'t sleep", "Lost my independence" — copy these exactly into ads', type: 'textarea' },
      { name: 'solutionLanguage', label: 'Exact Phrases Customers Use For Desired Outcome', placeholder: 'e.g., "Feel normal again", "Get my life back", "Walk without pain", "Sleep through the night" — use these as CTAs', type: 'textarea' },
    ],
  },
  {
    key: 'funnel-variants',
    label: 'Funnel Variants & Testing',
    fields: [
      { name: 'advertorialFunnel', label: 'Do You Use Advertorials? (If Yes, Convert Rate)', placeholder: 'e.g., Yes, advertorial on TikTok converts at 4.2% vs product page 1.8%' },
      { name: 'quizFunnel', label: 'Do You Use Quiz Funnels? (If Yes, Convert Rate)', placeholder: 'e.g., Yes, 3-question quiz "What\'s your pain level?" converts 6.1%' },
      { name: 'vslFunnel', label: 'Do You Use VSL (Video Sales Letter) Funnels? (If Yes, Convert Rate)', placeholder: 'e.g., Yes, 8-min VSL converts 5.8% (higher AOV but longer sales cycle)' },
      { name: 'bestFunnelType', label: 'What Funnel Type Has Highest Conversion Rate?', placeholder: 'e.g., Landing page funnel: 3.2% | Advertorial: 4.1% | Quiz funnel: 3.8% | VSL: 5.2% — VSL wins but needs higher traffic' },
    ],
  },
  {
    key: 'offer-mechanics',
    label: 'Offer Mechanics',
    fields: [
      { name: 'realUrgency', label: 'What Urgency Is Real vs Artificial?', placeholder: 'Real: Actual stock limited to 500 units | Artificial: "Only 3 left!" (refreshes daily) | Real: Sale ends 11:59 PM ET (specific cutoff)', type: 'textarea' },
      { name: 'scarcityDriver', label: 'What Is Your Scarcity Driver? (Stock / Time / Bonus)', placeholder: 'e.g., Stock scarcity: "Only 47 left in stock" (real inventory) | Time: "48-hour flash sale" | Bonus: "Free gift with first 100 orders"', type: 'textarea' },
      { name: 'bestBundle', label: 'What Is Your Best Converting Bundle?', placeholder: 'e.g., 1-pack: 28% of sales | 3-pack: 54% of sales (best) | 6-pack: 18% of sales — focus ads on 3-pack' },
      { name: 'bestPricePoint', label: 'What Price Point Converts Best?', placeholder: 'e.g., $49: 1.8% conversion | $79: 2.2% conversion | $99: 2.1% conversion — test $99 vs payment plan' },
    ],
  },
  {
    key: 'media-buying-structure',
    label: 'Media Buying Structure',
    fields: [
      { name: 'campaignStructure', label: 'Campaign Structure (CBO / ABO / ASC / etc.)', placeholder: 'e.g., Campaign Budget Optimization (CBO) on Meta, Google Performance Max on YouTube, Automatic targeting on TikTok' },
      { name: 'budgetSplitTesting', label: 'Budget Split: Testing vs Scaling', placeholder: 'e.g., 20% budget on new creative tests, 80% on proven winners | OR 30/70 during scaling phase' },
      { name: 'audienceStructure', label: 'Audience Structure (Broad vs LAL vs Interest)', placeholder: 'e.g., Broad targeting: 15% of budget | Lookalike (1% best customers): 50% | Interest-based: 35%' },
      { name: 'retargetingWindows', label: 'Retargeting Window Sizes (1d / 3d / 7d / 30d)', placeholder: 'e.g., Abandon cart (1d): € spend | Page visitors (7d): € spend | Email list (30d): € spend | Website visitors (3d): € spend' },
    ],
  },
  {
    key: 'creative-ops-system',
    label: 'Creative Ops System',
    fields: [
      { name: 'creativeNaming', label: 'How Are Creatives Named / Tracked?', placeholder: 'e.g., Format: [PLATFORM]_[HOOK]_[ANGLE]_[PERSONA]_[DATE] → META_QUESTION_TESTIMONIAL_EMMA_20250215' },
      { name: 'versionTracking', label: 'How Do You Track Versions / Iterations?', placeholder: 'e.g., v1_original | v2_hook_change | v3_body_rewrite | v4_visual_swap — test each against original' },
      { name: 'creativeTagging', label: 'How Do You Tag Creatives By Angle / Hook / Persona?', placeholder: 'e.g., Tag: [authority], [testimonial], [problem-agitate] | Persona: [emma], [john], [budget-conscious] | Hook: [question], [stat], [story]' },
    ],
  },
  {
    key: 'decision-output',
    label: 'Decision Output (AD PRODUCTION ROADMAP)',
    fields: [
      { name: 'top5AnglesTest', label: 'TOP 5 ANGLES TO TEST FIRST', placeholder: '1. [Angle name & why]\n2. [Angle name & why]\n3. [Angle name & why]\n4. [Angle name & why]\n5. [Angle name & why]', type: 'textarea' },
      { name: 'top5HooksTest', label: 'TOP 5 HOOKS TO TEST FIRST', placeholder: '1. [Exact hook copy]\n2. [Exact hook copy]\n3. [Exact hook copy]\n4. [Exact hook copy]\n5. [Exact hook copy]', type: 'textarea' },
      { name: 'first10Ads', label: 'FIRST 10 ADS TO PRODUCE (Exact Concepts)', placeholder: 'Ad 1: [Platform] + [Hook] + [Angle] + [Persona] + [FunnelStage]\nAd 2: ...\nAd 3: ...\n(Example: TikTok + "What if I told you" + Testimonial + Emma + Cold)\nAd 4: ...\nAd 5: ...', type: 'textarea' },
      { name: 'budgetAllocationPlan', label: 'BUDGET ALLOCATION PLAN (Next 30 Days)', placeholder: 'Testing budget: €[X] (new creatives, validation)\nScaling budget: €[X] (proven winners)\nRetargeting budget: €[X]\nTotal: €[X]\n\nBy platform:\nMeta: €[X] ([%])\nTikTok: €[X] ([%])\nYouTube: €[X] ([%])', type: 'textarea' },
    ],
  },
  {
    key: 'additional-notes',
    label: 'Additional Notes & Context',
    fields: [
      { name: 'additionalNotes', label: 'Anything Else You Want To Share?', placeholder: 'Any additional context, constraints, opportunities, or notes that don\'t fit in the above sections. What else should we know about your brand, market, or campaign goals?', type: 'textarea' },
    ],
  },
];

const imageTypeOptions = [
  { label: 'Ad Creative', value: 'ad-creative' },
  { label: 'Product Shot', value: 'product-shot' },
  { label: 'Lifestyle', value: 'lifestyle' },
  { label: 'Packaging', value: 'packaging' },
  { label: 'Ingredient', value: 'ingredient' },
  { label: 'Before/After', value: 'before-after' },
  { label: 'Flat Lay', value: 'flat-lay' },
  { label: 'Detail Shot', value: 'detail-shot' },
  { label: 'Other', value: 'other' },
];

export function CampaignSelector() {
  const { createCampaign } = useCampaign();
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('preset');
  const [form] = Form.useForm();
  const [imageFiles, setImageFiles] = useState<ImageMetadata[]>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ type: 'user' | 'ai'; content: string }>>([
    {
      type: 'ai',
      content: `What's your brand?`,
    },
  ]);

  const handlePresetSelect = (preset: typeof DEFAULT_PRESET) => {
    const brandStr = JSON.stringify(preset.brand);
    const audienceStr = JSON.stringify(preset.audience);
    const goalStr = `${preset.goal} | Budget: ${preset.budget} | Timeline: ${preset.timeline} | KPIs: ${preset.kpis}`;

    createCampaign(brandStr, audienceStr, goalStr);
    message.success('Preset campaign created!');
  };

  const handleDetailedSubmit = async (values: any) => {
    const brandData = {
      name: values.brandName,
      website: values.website,
      industry: values.industry,
      positioning: values.positioning,
      tone: values.tone,
      colors: values.brandColors,
      fonts: values.brandFonts,
    };

    const audienceData = {
      name: values.personaName,
      age: values.age,
      job: values.job,
      location: values.location,
      income: values.income,
      painPoints: values.painPoints,
      values: values.values,
      trustFactors: values.trustFactors,
    };

    const goalData = {
      product: values.productName,
      category: values.productCategory,
      problem: values.problemSolved,
      benefits: `Functional: ${values.functionalBenefits} | Emotional: ${values.emotionalBenefits}`,
      timeline: values.resultTimeline,
      usp: values.uniqueUsp,
      pricing: values.pricing,
      platforms: values.primaryPlatforms,
      budget: values.campaignBudget,
      kpis: values.conversionRate && values.cac ? `Conversion: ${values.conversionRate}, CAC: ${values.cac}` : 'Not specified',
    };

    createCampaign(
      JSON.stringify(brandData),
      JSON.stringify(audienceData),
      JSON.stringify(goalData)
    );
    message.success('Detailed campaign created!');
  };

  const handleImageUpload = (file: any) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImageFiles([
        ...imageFiles,
        {
          uid: Date.now().toString(),
          name: file.name,
          dataUrl: reader.result as string,
        },
      ]);
    };
    reader.readAsDataURL(file);
    return false;
  };

  const handleImageDelete = (uid: string) => {
    setImageFiles(imageFiles.filter((img) => img.uid !== uid));
  };

  const handleImageMetadataChange = (uid: string, field: string, value: string) => {
    setImageFiles(
      imageFiles.map((img) => (img.uid === uid ? { ...img, [field]: value } : img))
    );
  };

  const collapseItems = FORM_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    children: (
      <Form layout="vertical" className="space-y-4">
        {section.fields.map((field) => (
          <Form.Item key={field.name} label={field.label}>
            {field.type === 'textarea' ? (
              <Input.TextArea
                placeholder={field.placeholder}
                rows={3}
                onChange={(e) => form.setFieldValue(field.name, e.target.value)}
              />
            ) : (
              <Input
                placeholder={field.placeholder}
                onChange={(e) => form.setFieldValue(field.name, e.target.value)}
              />
            )}
          </Form.Item>
        ))}
      </Form>
    ),
  }));

  const themeConfig = {
    token: {
      colorPrimary: isDarkMode ? '#2563eb' : '#3b82f6',
      colorBgBase: isDarkMode ? '#1f2937' : '#ffffff',
      colorTextBase: isDarkMode ? '#f3f4f6' : '#111827',
      borderRadius: 8,
      colorBgContainer: isDarkMode ? '#1f2937' : '#ffffff',
      colorBgElevated: isDarkMode ? '#111827' : '#f9fafb',
      colorBgLayout: isDarkMode ? '#111827' : '#ffffff',
      colorBorder: isDarkMode ? '#3f3f46' : '#e5e7eb',
    },
    components: {
      Input: {
        controlBg: isDarkMode ? '#27272a' : '#f3f4f6',
        colorBorder: isDarkMode ? '#3f3f46' : '#d1d5db',
      },
      TextArea: {
        controlBg: isDarkMode ? '#27272a' : '#f3f4f6',
        colorBorder: isDarkMode ? '#3f3f46' : '#d1d5db',
      },
    },
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <div className={`p-6 rounded-lg border ${isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
        {/* Custom Tab Navigation */}
        <div className={`flex gap-6 mb-6 border-b ${isDarkMode ? 'border-zinc-700' : 'border-zinc-200'}`}>
          {(['preset', 'detailed', 'chat'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 font-medium text-sm uppercase tracking-wide transition-colors ${
                activeTab === tab
                  ? `text-blue-500 border-b-2 border-blue-500`
                  : isDarkMode
                  ? 'text-zinc-400 hover:text-zinc-300'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {tab === 'preset' && 'Preset'}
              {tab === 'detailed' && 'Detailed'}
              {tab === 'chat' && 'Quick Chat'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'preset' && (
            <div className="space-y-4">
              <Card
                hoverable
                className="cursor-pointer"
                onClick={() => handlePresetSelect(DEFAULT_PRESET)}
              >
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{DEFAULT_PRESET.label}</h3>
                  <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {DEFAULT_PRESET.brand.description}
                  </p>
                  <div className="pt-2">
                    <Button type="primary">Use This Preset</Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'detailed' && (
                <div className="space-y-6">
                  {/* Image Upload */}
                  <div>
                    <h3 className="font-semibold mb-4 text-base">Product Images (JPG/PNG, Max 5)</h3>
                    <Upload
                      beforeUpload={handleImageUpload}
                      maxCount={5}
                      accept=".jpg,.jpeg,.png"
                      listType="picture-card"
                      className="mb-4"
                    >
                      <div>
                        <PlusOutlined />
                        <div className="mt-2">Upload Image</div>
                      </div>
                    </Upload>

                    {imageFiles.length > 0 && (
                      <div className="space-y-4">
                        {imageFiles.map((img) => (
                          <Card key={img.uid} size="small">
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm font-medium mb-1">{img.name}</p>
                                {img.dataUrl && (
                                  <img
                                    src={img.dataUrl}
                                    alt={img.name}
                                    className="w-24 h-24 object-cover rounded"
                                  />
                                )}
                              </div>
                              <Form layout="vertical">
                                <Form.Item label="Image Type" className="mb-3">
                                  <Select
                                    placeholder="Select image type"
                                    options={imageTypeOptions}
                                    value={img.imageType}
                                    onChange={(value) =>
                                      handleImageMetadataChange(img.uid, 'imageType', value)
                                    }
                                  />
                                </Form.Item>
                                <Form.Item label="Description" className="mb-3">
                                  <Input.TextArea
                                    placeholder="e.g., Product in use, lifestyle context..."
                                    rows={2}
                                    value={img.description}
                                    onChange={(e) =>
                                      handleImageMetadataChange(img.uid, 'description', e.target.value)
                                    }
                                  />
                                </Form.Item>
                                <Form.Item label="Design Notes" className="mb-0">
                                  <Input.TextArea
                                    placeholder="What do you like about this? Why did you pick this image? (Lighting, colors, vibe, emotional impact...)"
                                    rows={2}
                                    value={img.designNotes}
                                    onChange={(e) =>
                                      handleImageMetadataChange(img.uid, 'designNotes', e.target.value)
                                    }
                                  />
                                </Form.Item>
                              </Form>
                              <Button
                                danger
                                size="small"
                                onClick={() => handleImageDelete(img.uid)}
                              >
                                Delete
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Form Sections */}
                  <Collapse items={collapseItems} />

                  {/* Submit Button */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="primary"
                      size="large"
                      onClick={() => handleDetailedSubmit(form.getFieldsValue())}
                    >
                      Create Campaign
                    </Button>
                  </div>
                </div>
          )}

          {activeTab === 'chat' && (
            <QuickChatBuilder
              messages={chatMessages}
              setMessages={setChatMessages}
              onComplete={(chatData) => {
                // Merge chat data with form defaults and create campaign
                const brandStr = JSON.stringify({
                  name: chatData.brandName || 'Unknown Brand',
                  industry: chatData.industry || '',
                  positioning: chatData.positioning || '',
                  website: chatData.website || '',
                });

                const audienceStr = JSON.stringify({
                  name: chatData.personaName || 'Unknown Persona',
                  age: chatData.age || '',
                  painPoints: chatData.painPoints || '',
                });

                const goalStr = `Product: ${chatData.productName || 'Unknown'} | Problem: ${chatData.problemSolved || 'Unknown'} | Price: ${chatData.pricing || 'TBD'} | Platforms: ${chatData.primaryPlatforms || 'TBD'}`;

                createCampaign(brandStr, audienceStr, goalStr);
                message.success('Campaign created from chat! Starting research...');
              }}
            />
          )}
        </div>
      </div>
    </ConfigProvider>
  );
}
