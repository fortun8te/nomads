import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { QuickChatBuilder } from './QuickChatBuilder';
import { SIMPLETICS_PRESET } from '../utils/presetCampaigns';
import { storage } from '../utils/storage';

type Tab = 'preset' | 'detailed' | 'chat';

interface ImageMetadata {
  uid: string;
  name: string;
  dataUrl: string;
  imageType?: string;
  description?: string;
  designNotes?: string;
}

const FORM_SECTIONS = [
  {
    key: 'brand-dna',
    label: 'Brand DNA',
    fields: [
      { name: 'brandName', label: 'Brand Name', placeholder: 'e.g., Upfront.' },
      { name: 'website', label: 'Website', placeholder: 'e.g., www.upfront.nl' },
      { name: 'socials', label: 'Main Social Channels (With Handles)', placeholder: 'e.g., @brand_name on Instagram, @brand on TikTok, YouTube channel link' },
      { name: 'industry', label: 'Industry / Category', placeholder: 'e.g., Beauty / Skincare / Supplement / SaaS / Apparel' },
      { name: 'positioning', label: 'Brand Positioning (In One Sentence)', placeholder: 'e.g., "The clean skincare brand for skeptical millennials"' },
      { name: 'tone', label: 'Tone of Voice (With Examples)', placeholder: 'e.g., "Honest & educational but never patronizing"' },
      { name: 'brandColors', label: 'Brand Colors (+ Psychology)', placeholder: 'e.g., Sage green (trust/growth), cream (approachable), charcoal (authority)' },
      { name: 'brandFonts', label: 'Brand Fonts (+ Usage)', placeholder: 'e.g., Inter for body (modern/clean), Courier for technical specs' },
      { name: 'brandNickname', label: 'What Would Customers Call This Brand If It Were A Person?', placeholder: 'e.g., "The Scientist Friend", "The Tough Coach"' },
      { name: 'bigEnemy', label: "Your Brand's Big Enemy / Villain", placeholder: 'Who/what are you fighting against? Be specific.' },
      { name: 'categoryBeliefs', label: 'Category Beliefs To Break', placeholder: 'List exact myths you\'re dispelling' },
      { name: 'brandWhy', label: 'Why Does This Brand Exist?', placeholder: 'What problem in the world are you solving beyond profit?' },
    ],
  },
  {
    key: 'persona',
    label: 'Primary Customer Persona',
    fields: [
      { name: 'personaName', label: 'Persona Name & Archetype', placeholder: 'e.g., "Emma, The Conscious Skeptic"' },
      { name: 'age', label: 'Age Range', placeholder: '32-38' },
      { name: 'gender', label: 'Gender / Gender Identity', placeholder: 'Female / Male / Non-binary / Other' },
      { name: 'job', label: 'Job Title (+ Industry)', placeholder: 'e.g., Senior Product Manager at a tech company' },
      { name: 'location', label: 'Geographic Location & Climate', placeholder: 'Europe: Netherlands, Belgium, Germany' },
      { name: 'income', label: 'Household Income Range', placeholder: '$50k-200k' },
      { name: 'maritalStatus', label: 'Marital / Family Status', placeholder: 'e.g., Married, 1-2 kids' },
      { name: 'painPoints', label: 'Top 3 Pain Points (Ranked By Severity)', placeholder: '1) [Biggest pain] 2) [Secondary pain] 3) [Tertiary pain]', type: 'textarea' },
      { name: 'dayInLife', label: "What's A Typical Day Like?", placeholder: 'Wake at 6am, workout, work 8-6, dinner at 7pm...' },
      { name: 'values', label: 'Core Values (Top 3 Only)', placeholder: 'Transparency, Sustainability, Efficacy', type: 'textarea' },
      { name: 'trustFactors', label: 'EXACT Ways This Persona Decides To Trust A Brand', placeholder: 'Ranked: 1) Third-party certifications 2) Long-term research 3) Customer testimonials' },
      { name: 'mustBelieve', label: 'What MUST This Customer Believe For Your Product To Work?', placeholder: 'What conviction is non-negotiable?' },
      { name: 'identityShift', label: 'What Identity Shift Do They Make After Buying?', placeholder: 'They go from: "..." → "..."' },
      { name: 'onlineHabits', label: 'Where Do They Spend Online Time?', placeholder: '3 hours/day on Instagram, 1 hour on Reddit...' },
      { name: 'purchaseHistory', label: 'What Similar Products Have They Bought Before?', placeholder: 'e.g., "Tried CeraVe (too basic), tried Korean brands (too expensive)"' },
    ],
  },
  {
    key: 'products',
    label: 'Product Definition',
    fields: [
      { name: 'productName', label: 'Product Name (Full & Short)', placeholder: 'Full: "Vitamin C Brightening Serum 30ml" | Short: "The Glow Serum"' },
      { name: 'productCategory', label: 'Category & Subcategory', placeholder: 'e.g., Skincare → Serums → Brightening' },
      { name: 'productDescription', label: 'Product Description', placeholder: 'What is it in customer language?' },
      { name: 'problemSolved', label: 'Primary Problem It Solves', placeholder: 'Be ultra-specific' },
      { name: 'secondaryProblems', label: 'Secondary Problems', placeholder: 'List the 2-3 additional benefits' },
      { name: 'keyFeatures', label: 'Key Features', placeholder: 'Focus on the ingredients/features that matter' },
      { name: 'functionalBenefits', label: 'Functional Benefits', placeholder: 'Be MEASURABLE with results' },
      { name: 'emotionalBenefits', label: 'Emotional Benefits', placeholder: 'How does it make them FEEL?' },
      { name: 'resultTimeline', label: 'Results Timeline', placeholder: 'Week 1: ... | Week 2: ... | Week 4: ... | Week 8: ...' },
      { name: 'bestFor', label: 'Best For', placeholder: 'What skin types? What age? What concerns?' },
      { name: 'notFor', label: 'NOT For', placeholder: 'Contraindications and warnings' },
      { name: 'uniqueUsp', label: 'Unique Selling Proposition', placeholder: 'What makes THIS different? Be specific.' },
      { name: 'provenResults', label: 'Proven Results (Studies / Data)', placeholder: 'Clinical data, study results, percentages' },
      { name: 'pricing', label: 'Price Point (+ Justification)', placeholder: 'Price: €65 | Justification: €0.65 per use' },
      { name: 'guarantee', label: 'Guarantee / Risk Reversal', placeholder: 'e.g., 60-day money-back guarantee' },
      { name: 'scarcity', label: 'Any Scarcity or Limited Availability?', placeholder: 'e.g., Made in small batches' },
    ],
  },
  {
    key: 'product-details',
    label: 'Product Details & Specifications',
    fields: [
      { name: 'productFormat', label: 'How It Comes / Format', placeholder: 'e.g., 30ml glass bottle with dropper' },
      { name: 'packaging', label: 'Packaging Details', placeholder: 'e.g., Recyclable glass, cardboard box' },
      { name: 'productSize', label: 'Size / Quantity', placeholder: 'e.g., 30ml (lasts ~3-4 months)' },
      { name: 'shelfLife', label: 'Shelf Life / Expiry', placeholder: 'e.g., 2 years unopened' },
      { name: 'usageInstructions', label: 'How To Use', placeholder: 'e.g., Apply 2-3 drops morning and night', type: 'textarea' },
      { name: 'usageFrequency', label: 'Recommended Usage Frequency', placeholder: 'e.g., Daily, twice daily' },
      { name: 'usageDuration', label: 'How Long To See Results', placeholder: 'e.g., 2-4 weeks for visible changes' },
      { name: 'targetUsers', label: 'Who Is It For (Detailed)', placeholder: 'Detailed user description', type: 'textarea' },
      { name: 'userProfiles', label: 'Typical User Profiles', placeholder: 'e.g., Busy professionals, fitness enthusiasts', type: 'textarea' },
      { name: 'storage', label: 'Storage Requirements', placeholder: 'e.g., Room temperature away from sunlight' },
      { name: 'compatibility', label: 'Works With / Compatibility', placeholder: 'Product compatibility info', type: 'textarea' },
      { name: 'contraindications', label: 'Who Should NOT Use / Warnings', placeholder: 'Warnings and contraindications', type: 'textarea' },
      { name: 'certifications', label: 'Certifications / Standards', placeholder: 'e.g., Cruelty-free, vegan, dermatologist tested' },
      { name: 'costPerUse', label: 'Cost Per Use / Price Point', placeholder: 'e.g., $0.50 per application' },
      { name: 'comparison', label: 'How It Compares To Competitor Products', placeholder: 'Comparative analysis', type: 'textarea' },
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
      { name: 'mainCompetitors', label: 'Top 3-5 Direct Competitors', placeholder: 'Rank by threat level' },
      { name: 'indirectCompetitors', label: 'Indirect Competitors', placeholder: 'Alternative solutions to the same problem' },
      { name: 'competitorStrengths', label: 'Competitor Strengths', placeholder: 'Be honest about what they do well' },
      { name: 'competitorWeaknesses', label: 'Competitor Weaknesses', placeholder: 'Your opportunity' },
      { name: 'competitiveAdvantage', label: 'Your Competitive Advantages (Ranked)', placeholder: 'Be specific and defensible' },
      { name: 'priceVsCompetitors', label: 'Price Positioning vs Competitors', placeholder: 'Your price vs competitor prices' },
      { name: 'marketShare', label: 'Estimated Market Share', placeholder: 'Market share distribution' },
      { name: 'copyCatRisk', label: 'Copycat/Substitution Risk', placeholder: 'How easy is it to copy your product?' },
    ],
  },
  {
    key: 'messaging',
    label: 'Copy & Messaging Library',
    fields: [
      { name: 'mainMessage', label: 'Core Benefit Statement', placeholder: 'One sentence that captures your core promise' },
      { name: 'subclaims', label: 'Top 3 Subclaims', placeholder: 'Supporting claims for your main message', type: 'textarea' },
      { name: 'callToAction', label: 'Call To Action', placeholder: 'e.g., "Get yours now" + urgency/incentive' },
      { name: 'callToActionVariants', label: 'CTA Variants', placeholder: 'Different CTA options to test', type: 'textarea' },
      { name: 'testimonials', label: 'Top 3 Testimonials', placeholder: 'Real customer quotes', type: 'textarea' },
      { name: 'linguisticPatterns', label: 'Customer Language Patterns', placeholder: 'Exact words/phrases customers use', type: 'textarea' },
      { name: 'avoidLanguage', label: 'Language To AVOID', placeholder: 'Words and messaging that fall flat' },
      { name: 'objectionHandling', label: 'Objection Handling', placeholder: 'Top 5 objections + answers', type: 'textarea' },
      { name: 'seasonalHooks', label: 'Seasonal Messaging Hooks', placeholder: 'Seasonal/cultural angles', type: 'textarea' },
      { name: 'valuePropositions', label: 'Multiple Value Propositions', placeholder: 'Different angles for different contexts' },
    ],
  },
  {
    key: 'platforms',
    label: 'Platform Strategy',
    fields: [
      { name: 'primaryPlatforms', label: 'Primary Platforms (Ranked)', placeholder: 'Where your audience spends time' },
      { name: 'platformCPA', label: 'CPA By Platform', placeholder: 'Cost per acquisition data' },
      { name: 'contentTypes', label: 'Best Content Types Per Platform', placeholder: 'What format works where' },
      { name: 'hookTiming', label: 'Hook Timing By Platform', placeholder: 'How fast you need to hook attention' },
      { name: 'videoSpecs', label: 'Video Specs By Platform', placeholder: 'Aspect ratios and format requirements' },
      { name: 'postingStrategy', label: 'Organic vs Paid Split', placeholder: 'Budget allocation strategy' },
    ],
  },
  {
    key: 'emotional-landscape',
    label: "Customer's Emotional Landscape",
    fields: [
      { name: 'deepestFears', label: 'Deepest Fears', placeholder: 'What keeps them up at night?', type: 'textarea' },
      { name: 'emotionalWins', label: 'Core Emotional Desires', placeholder: 'What emotional state are they seeking?', type: 'textarea' },
      { name: 'dailyPainAgitators', label: 'Daily Life Triggers', placeholder: 'What moments make the problem worse?', type: 'textarea' },
      { name: 'qualityOfLifeImpact', label: 'Quality of Life Impact', placeholder: 'How has this problem stolen their life?', type: 'textarea' },
      { name: 'emotionalState', label: 'Current Emotional State', placeholder: 'Desperate? Hopeless? Frustrated? Angry?', type: 'textarea' },
    ],
  },
  {
    key: 'buying-psychology',
    label: 'Buying Psychology',
    fields: [
      { name: 'trustFactorsEmotional', label: 'Trust Factors (Ranked)', placeholder: 'What ONE thing would make them trust you most?', type: 'textarea' },
      { name: 'emotionalMotivators', label: 'Emotional Motivators (Ranked)', placeholder: 'Hope, FOMO, aspiration, relief, belonging?', type: 'textarea' },
      { name: 'buyingTriggers', label: 'Buying Triggers', placeholder: 'What specific moment triggers a purchase?' },
      { name: 'buyingJourney', label: 'Buying Journey Timeline', placeholder: 'Steps from first seeing ad to purchase' },
      { name: 'riskTolerance', label: 'Risk Tolerance', placeholder: 'Do they need a guarantee to buy?' },
      { name: 'proofRequired', label: 'Proof Requirements', placeholder: 'What proof matters most?', type: 'textarea' },
      { name: 'dealBreakers', label: 'Deal Breakers', placeholder: 'Instant NO vs instant YES triggers' },
    ],
  },
  {
    key: 'kpis',
    label: 'KPIs & Success Metrics',
    fields: [
      { name: 'conversionRate', label: 'Target Conversion Rate', placeholder: 'e.g., 3%+ (industry benchmark)' },
      { name: 'cac', label: 'Target CAC', placeholder: 'e.g., €30-35' },
      { name: 'roas', label: 'Target ROAS', placeholder: 'e.g., 3:1' },
      { name: 'repeatPurchase', label: 'Target Repeat Purchase Rate', placeholder: 'e.g., 40%+ within 90 days' },
      { name: 'aov', label: 'Target AOV', placeholder: 'e.g., €85 (current) vs €120 (target)' },
      { name: 'marketingBudget', label: 'Total Marketing Budget', placeholder: 'e.g., €5,000/month' },
      { name: 'successDefinition', label: 'What Does Success Look Like In 90 Days?', placeholder: 'Be specific about what success means' },
    ],
  },
  {
    key: 'creative-angles',
    label: 'Creative Angles & Hooks',
    fields: [
      { name: 'topPerformingAngles', label: 'Top Performing Angles', placeholder: 'What angles have worked?', type: 'textarea' },
      { name: 'untestedAngles', label: 'Untested Angles To Explore', placeholder: "What angles haven't you tried?", type: 'textarea' },
      { name: 'hookBank', label: 'Hook Bank (First 3 Seconds)', placeholder: 'What hooks stop the scroll?', type: 'textarea' },
      { name: 'legalClaimsGuidance', label: 'Claims You CAN vs CANNOT Say', placeholder: 'Legal compliance guidance', type: 'textarea' },
    ],
  },
  {
    key: 'offer-structure',
    label: 'Offer Structure',
    fields: [
      { name: 'bundleOptions', label: 'Bundle Options', placeholder: 'What bundles work?', type: 'textarea' },
      { name: 'discountPromos', label: 'Discount Strategy', placeholder: 'What discounts move inventory?', type: 'textarea' },
      { name: 'subscriptionModel', label: 'Subscription Model', placeholder: 'Monthly, auto-replenish?', type: 'textarea' },
      { name: 'guaranteeTerms', label: 'Guarantee Terms', placeholder: 'What removes the risk?', type: 'textarea' },
      { name: 'ltvStrategy', label: 'Lifetime Value Strategy', placeholder: 'How do you maximize LTV?', type: 'textarea' },
    ],
  },
  {
    key: 'additional-notes',
    label: 'Additional Notes',
    fields: [
      { name: 'additionalNotes', label: 'Anything Else?', placeholder: 'Additional context, constraints, or notes', type: 'textarea' },
    ],
  },
];

const IMAGE_TYPE_OPTIONS = [
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
  const context = useCampaign();
  const { createCampaign, campaign, clearCampaign, resetResearch, loadCampaignById } = context;
  useTheme(); // keep reactive
  const [activeTab, setActiveTab] = useState<Tab>('preset');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [imageFiles, setImageFiles] = useState<ImageMetadata[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<Array<{ type: 'user' | 'ai'; content: string }>>([
    {
      type: 'ai',
      content: `Let's build your campaign by understanding your customers DEEPLY.\n\nI'll ask progressively deeper questions to uncover the real reasons people buy.\n\nReady? Tell me about your brand or product: What do you sell, and who are you trying to reach?`,
    },
  ]);

  const setFormValue = (name: string, value: string) => {
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handlePresetSelect = async (preset: typeof SIMPLETICS_PRESET) => {
    try {
      const allCampaigns = await storage.getAllCampaigns();
      const existing = allCampaigns.find(
        (c: any) => c.presetData?.id === preset.id
      );
      if (existing) {
        await loadCampaignById(existing.id);
        return;
      }
    } catch (err) {
      console.error('Failed to check existing campaigns:', err);
    }

    const growth = (preset as any).growth || { goal: '', budget: '', timeline: [], kpis: {} };
    const goalStr = `${growth.goal} | Budget: ${growth.budget} | Timeline: ${Array.isArray(growth.timeline) ? growth.timeline[0] : ''}`;

    const pipelineMode = localStorage.getItem('pipeline_mode');
    const researchMode = pipelineMode === 'interactive' ? 'interactive' as const : 'autonomous' as const;

    const productFeaturesArray = preset.product.features
      ? Object.entries(preset.product.features).map(([key, value]) => `${key}: ${value}`)
      : [];

    createCampaign(
      preset.brand.name,
      preset.audience.name,
      goalStr,
      preset.product.description,
      productFeaturesArray,
      preset.product.pricing,
      researchMode,
      undefined,
      undefined,
      preset.brand.colors,
      preset.brand.fonts,
      undefined,
      preset as unknown as Record<string, any>
    );
  };

  const handleDetailedSubmit = async () => {
    const values = formValues;
    const productFeatures = values.keyFeatures
      ? values.keyFeatures.split('\n').filter((f: string) => f.trim())
      : [];

    const pipelineMode = localStorage.getItem('pipeline_mode');
    const researchMode = pipelineMode === 'interactive' ? 'interactive' as const : 'autonomous' as const;

    const excludeKeys = ['brandName', 'personaName', 'marketingGoal', 'productName', 'productCategory', 'primaryPlatforms', 'productDescription', 'keyFeatures', 'pricing'];
    const brandDNA: Record<string, string> = {};
    for (const [key, val] of Object.entries(values)) {
      if (!excludeKeys.includes(key) && val && typeof val === 'string' && val.trim()) {
        brandDNA[key] = val;
      }
    }

    createCampaign(
      values.brandName,
      values.personaName,
      `${values.marketingGoal || values.productName} | Category: ${values.productCategory} | Platforms: ${values.primaryPlatforms}`,
      values.productDescription,
      productFeatures,
      values.pricing,
      researchMode,
      undefined,
      undefined,
      values.brandColors || undefined,
      values.typography || undefined,
      Object.keys(brandDNA).length > 0 ? brandDNA : undefined
    );
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setImageFiles(prev => [
          ...prev,
          {
            uid: Date.now().toString() + Math.random().toString(36).slice(2),
            name: file.name,
            dataUrl: reader.result as string,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleImageDelete = (uid: string) => {
    setImageFiles(imageFiles.filter((img) => img.uid !== uid));
  };

  const handleImageMetadataChange = (uid: string, field: string, value: string) => {
    setImageFiles(
      imageFiles.map((img) => (img.uid === uid ? { ...img, [field]: value } : img))
    );
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'preset', label: 'Preset' },
    { key: 'detailed', label: 'Detailed' },
    { key: 'chat', label: 'Chat' },
  ];

  return (
    <div className="rounded-xl overflow-hidden bg-[#141416] border border-white/[0.06]">
      {/* Tab Navigation */}
      <div className="flex items-center border-b border-white/[0.06] px-1 bg-white/[0.02]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex-1 px-3 py-2.5 text-[11px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-white/[0.85]'
                : 'text-white/[0.25] hover:text-white/[0.45]'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <motion.div
                layoutId="campaign-tab-underline"
                className="absolute bottom-0 left-2 right-2 h-[1.5px] bg-white/[0.55] rounded-full"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        ))}
        {campaign && (
          <button
            onClick={() => clearCampaign()}
            className="px-3 py-2.5 text-[10px] font-medium text-white/[0.15] hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'preset' && (
          <PresetTab
            preset={SIMPLETICS_PRESET}
            campaign={campaign}
            onSelect={handlePresetSelect}
            onResetResearch={resetResearch}
          />
        )}

        {activeTab === 'detailed' && (
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            {/* Image Upload */}
            <div className="p-4 border-b border-white/[0.04]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-medium text-white/[0.25] tracking-wider uppercase">Product Images</span>
                <label className="text-[11px] font-medium text-white/[0.35] hover:text-white/[0.55] cursor-pointer transition-colors px-2.5 py-1 rounded-lg hover:bg-white/[0.04]">
                  + Add Image
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {imageFiles.length > 0 && (
                <div className="space-y-3">
                  {imageFiles.map((img) => (
                    <div key={img.uid} className="rounded-lg border border-white/[0.06] p-3 bg-white/[0.02]">
                      <div className="flex items-start gap-3">
                        {img.dataUrl && (
                          <img
                            src={img.dataUrl}
                            alt={img.name}
                            className="w-16 h-16 object-cover rounded-lg shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] font-medium text-white/[0.70] truncate">{img.name}</p>
                            <button
                              onClick={() => handleImageDelete(img.uid)}
                              className="text-[10px] text-white/[0.15] hover:text-red-400 transition-colors shrink-0 ml-2"
                            >
                              Remove
                            </button>
                          </div>
                          <select
                            value={img.imageType || ''}
                            onChange={(e) => handleImageMetadataChange(img.uid, 'imageType', e.target.value)}
                            className="w-full text-[12px] px-2.5 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.04] text-white/[0.55] outline-none focus:border-white/[0.12] transition-colors"
                          >
                            <option value="">Select type...</option>
                            {IMAGE_TYPE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <textarea
                            placeholder="Description..."
                            value={img.description || ''}
                            onChange={(e) => handleImageMetadataChange(img.uid, 'description', e.target.value)}
                            rows={2}
                            className="w-full text-[12px] px-2.5 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.04] text-white/[0.55] outline-none focus:border-white/[0.12] transition-colors resize-none placeholder:text-white/[0.15]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form Sections — Accordion */}
            <div className="divide-y divide-white/[0.04]">
              {FORM_SECTIONS.map((section) => {
                const isOpen = expandedSections.has(section.key);
                return (
                  <div key={section.key}>
                    <button
                      onClick={() => toggleSection(section.key)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="text-[12px] font-medium text-white/[0.55]">{section.label}</span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className={`text-white/[0.15] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        transition={{ duration: 0.15 }}
                        className="px-4 pb-4 space-y-3"
                      >
                        {section.fields.map((field) => (
                          <div key={field.name}>
                            <label className="block text-[11px] font-medium text-white/[0.25] mb-1.5">{field.label}</label>
                            {field.type === 'textarea' ? (
                              <textarea
                                placeholder={field.placeholder}
                                value={formValues[field.name] || ''}
                                onChange={(e) => setFormValue(field.name, e.target.value)}
                                rows={3}
                                className="w-full text-[12px] font-medium px-3 py-2 rounded-md border border-white/[0.06] bg-white/[0.04] text-white/[0.70] outline-none focus:border-white/[0.12] transition-colors resize-none placeholder:text-white/[0.12] leading-5"
                              />
                            ) : (
                              <input
                                type="text"
                                placeholder={field.placeholder}
                                value={formValues[field.name] || ''}
                                onChange={(e) => setFormValue(field.name, e.target.value)}
                                className="w-full text-[12px] font-medium px-3 py-2 rounded-md border border-white/[0.06] bg-white/[0.04] text-white/[0.70] outline-none focus:border-white/[0.12] transition-colors placeholder:text-white/[0.12] leading-5"
                              />
                            )}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Submit Button */}
            <div className="p-4 border-t border-white/[0.04]">
              <button
                onClick={handleDetailedSubmit}
                className="w-full py-2.5 rounded-lg bg-white/[0.08] text-white/[0.70] text-[12px] font-medium hover:bg-white/[0.12] transition-colors border border-white/[0.06]"
              >
                Create Campaign
              </button>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <QuickChatBuilder
            messages={chatMessages}
            setMessages={setChatMessages}
            onComplete={(chatData: any) => {
              const productFeatures = (chatData.keyFeatures as string | undefined)
                ? (chatData.keyFeatures as string).split('\n').filter((f: string) => f.trim())
                : [(chatData.problemSolved as string | undefined) || 'Unknown feature'];

              const chatPipelineMode = localStorage.getItem('pipeline_mode');
              const chatResearchMode = chatPipelineMode === 'interactive' ? 'interactive' as const : 'autonomous' as const;
              createCampaign(
                (chatData.brandName as string | undefined) || 'Unknown Brand',
                (chatData.personaName as string | undefined) || 'Unknown Persona',
                `Product: ${(chatData.productName as string | undefined) || 'Unknown'} | Problem: ${(chatData.problemSolved as string | undefined) || 'Unknown'} | Platforms: ${(chatData.primaryPlatforms as string | undefined) || 'TBD'}`,
                (chatData.productDescription as string | undefined) || (chatData.productName as string | undefined) || 'Unknown product',
                productFeatures,
                (chatData.pricing as string | undefined) || 'TBD',
                chatResearchMode
              );
            }}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// Preset Tab
// ══════════════════════════════════════════════════════

function PresetTab({
  preset,
  campaign,
  onSelect,
  onResetResearch,
}: {
  preset: typeof SIMPLETICS_PRESET;
  campaign: any;
  onSelect: (p: typeof SIMPLETICS_PRESET) => void;
  onResetResearch: () => Promise<void>;
}) {
  const [cycleCount, setCycleCount] = useState(0);
  const isLoaded = campaign?.presetData?.id === preset.id;

  useEffect(() => {
    if (!isLoaded || !campaign?.id) { setCycleCount(0); return; }
    storage.getCyclesByCampaign(campaign.id).then(c => setCycleCount(c.length)).catch(() => setCycleCount(0));
  }, [isLoaded, campaign?.id]);

  return (
    <div className="p-3">
      <div
        className={`rounded-lg p-3.5 cursor-pointer transition-all duration-150 ${
          isLoaded
            ? 'bg-emerald-950/20 border border-emerald-800/30'
            : 'hover:bg-white/[0.03] border border-white/[0.04]'
        }`}
        onClick={() => onSelect(preset)}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-white/[0.85]">{preset.label}</h3>
          {isLoaded && (
            <span className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400/80">
              Active{cycleCount > 0 ? ` · ${cycleCount} cycle${cycleCount > 1 ? 's' : ''}` : ''}
            </span>
          )}
        </div>
        <p className="text-[11px] mt-1.5 leading-relaxed text-white/[0.30]">
          {preset.brand.description}
        </p>
        <div className="pt-3 flex items-center gap-2">
          <button className={`px-4 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
            isLoaded
              ? 'bg-emerald-900/30 text-emerald-400/70 border border-emerald-800/30'
              : 'bg-white/[0.08] text-white/[0.70] hover:bg-white/[0.12] border border-white/[0.06]'
          }`}>
            {isLoaded ? 'Loaded' : 'Use This Preset'}
          </button>

          {isLoaded && cycleCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Reset all research for this preset? This cannot be undone.')) {
                  onResetResearch();
                  setCycleCount(0);
                }
              }}
              className="px-3 py-1.5 rounded-md text-[10px] font-medium text-red-400/70 hover:bg-red-950/30 transition-colors border border-red-900/30"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
