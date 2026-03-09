/**
 * Knowledge System for NOMAD Make Studio
 *
 * Single editable knowledge blob that feeds directly into the LLM system prompt.
 * No compression, no tabs — just one text field the user can edit in the UI.
 * Seeded with Desire Engine principles + ad creative playbook.
 */

import { get, set } from 'idb-keyval';

const KNOWLEDGE_KEY = 'nomad_knowledge';

export interface KnowledgeStore {
  content: string;
  lastUpdated: number;
}

// ── Default Knowledge ──
// Already a dense TL;DR — no further compression needed
const DEFAULT_CONTENT = `DESIRE ENGINE — Core Principles:
- Products are vehicles, not destinations. Sell the transformation, not the thing.
- Desire is discovered, not created. Find people who are already thirsty.
- The Turning Point: When cost of inaction becomes unbearable — that's when people buy. Target people at this moment.
- Buried desires > surface complaints. "I want to feel like myself again" beats "I want clear skin."
- Desire hierarchy: Loved Ones > Identity/Status > Survival/Health. Know where your product lives.
- Builder mindset > Gambler mindset. Understand WHY ads work, don't just copy what works.

FIVE STAGES OF KNOWING (determines how you speak to them):
1. Unaware — don't know they have a problem. Hard to sell to.
2. Problem-aware — know something's wrong, researching the problem. Requires education.
3. Solution-aware — know solutions exist, comparing approaches. Show why YOUR method works.
4. Product-aware — know your product, comparing to competitors. Need proof yours is superior.
5. Most aware — trust you, waiting for the right offer or moment.
Target stages 3-4 first. These people are already in motion.

MARKET SATURATION:
- Low saturation → any reasonable claim works.
- High saturation → claims are worthless. Only proof and new angles work.
- Two paths through saturation: (1) Undeniable proof (real people, real results, real timelines), (2) A genuinely new angle (new mechanism, new sub-audience, new positioning).

THE SUB-AVATAR:
- Don't target "everyone with the problem." Target a specific person experiencing it in a specific way.
- When you speak to one person deeply, millions who share that experience feel seen.
- The brand that understands one customer deeply beats the brand that understands everyone loosely.

RESEARCH IS MARKETING:
- Reddit = emotional raw material (pain, hope, confusion, turning points).
- Amazon reviews = decision-making process (why they chose, what worried them, what surprised them).
- YouTube comments = real language, real objections, real desires.
- The customer's own words are the best copy. You're returning their language to them.
- Ask: Who specifically is this person? What's their deepest desire beneath the surface complaint? What do they believe? What has failed them before?

WHY OTHER SOLUTIONS FAILED:
- Explain the root cause mechanism using simple analogy (Garden Analogy principle).
- Don't attack competitors — give the customer a real reason previous attempts didn't work.
- This makes them feel vindicated, not foolish. That emotional shift opens everything.

PROOF > CLAIMS:
- Words are nearly worthless now. Everyone makes claims.
- Good testimonials are stories with specificity — the exact moment, the particular detail, the life outcome.
- Build your proof before you build your argument.

THE HOOK:
- Not a headline — an interruption. You have 2 seconds.
- Two things stop a scroll: Recognition ("that's my exact experience") and Surprise ("I didn't know that").
- The hook doesn't sell. It only earns the next 3 seconds.

THE SCRIPT (Video/Ad Structure):
- Hook → Acknowledgment (show you understand their world) → Agitation (go deeper into the pain, honestly) → Education (root cause, explained simply with analogy) → Product (now it's an answer, not an interruption).
- Everything before the product introduction earns the product introduction.

EMOTIONAL PEAK STATE:
- Before someone buys, they have to FEEL the outcome, not just understand it.
- Paint a detailed, specific, emotionally resonant portrait of their life after the problem is gone.
- This triggers dopamine — the same mechanism as anticipating a meal or trip.

AD CREATIVE STRATEGY — The Playbook:
5 ANGLE TYPES (rotate through these):
1. Desire angle — paint the dream outcome vividly
2. Pain angle — name the specific daily frustration
3. Fear angle — what happens if they do nothing
4. Logic angle — mechanism, ingredients, data, "here's why this works"
5. Social proof angle — real results from real people

THE HOLY 5 (Static Ad System):
1. Desire ad — aspirational, shows the "after" life
2. Objection-handling ad — directly addresses #1 purchase hesitation
3. Social proof ad — real testimonial with specific details
4. UGC-style ad — looks organic, not produced. Authentic texture.
5. Mechanism ad — explains WHY it works differently

SCALING SYSTEM:
- Launch 5 different creatives (one per angle)
- Find the 1 winner (best CTR/ROAS)
- Make 5 variations of that winner (different hooks, visuals, copy tweaks)
- Kill underperformers, scale winners
- Repeat with new angles every 2-3 weeks

HOOKS THAT WORK:
- "I was skeptical until..." (bridges doubt to belief)
- "Nobody told me..." (information gap)
- "Stop doing X if you want Y" (pattern interrupt)
- "The reason X doesn't work is..." (mechanism revelation)
- Direct address to sub-avatar: "If you're a [specific person] who [specific situation]..."

VISUAL PRINCIPLES:
- First 0.5s is pure visual hook — color contrast, unexpected composition, human eye contact
- Product should be clear but not the hero of every ad (sometimes the OUTCOME is the hero)
- Text overlay: 5-7 words max for headlines, readable at phone distance
- Color psychology: warm = comfort/desire, cool = trust/logic, high contrast = urgency
- Authentic > polished. UGC-texture beats studio-perfection in most categories.`;

// ── Knowledge Storage API ──

export const knowledge = {
  /** Get knowledge (creates default if empty, migrates old data shapes) */
  async get(): Promise<KnowledgeStore> {
    const stored = await get(KNOWLEDGE_KEY);
    if (stored && typeof (stored as KnowledgeStore).content === 'string') {
      return stored as KnowledgeStore;
    }

    // Old data shape or missing — reset to defaults
    const defaults: KnowledgeStore = {
      content: DEFAULT_CONTENT,
      lastUpdated: Date.now(),
    };
    await set(KNOWLEDGE_KEY, defaults);
    return defaults;
  },

  /** Save knowledge */
  async save(content: string): Promise<void> {
    const store: KnowledgeStore = { content, lastUpdated: Date.now() };
    await set(KNOWLEDGE_KEY, store);
  },

  /** Reset to defaults */
  async reset(): Promise<void> {
    await set(KNOWLEDGE_KEY, null);
  },
};
