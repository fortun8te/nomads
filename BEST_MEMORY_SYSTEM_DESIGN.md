# Nomad's Ultimate Memory System Architecture
## Synthesizing Letta + Graphiti + Replika + Constitutional AI + DeepDive + Proprietary Personalization

**Version:** 1.0
**Date:** March 20, 2026
**Status:** Design specification (ready for Phase 11 implementation)

---

## Executive Summary

This document defines a **hybrid memory system** that combines:
- **Agency** (Letta's self-editing agent memory)
- **Temporal awareness** (Graphiti's knowledge graphs with change tracking)
- **Pattern learning** (Replika's behavioral/emotional pattern extraction)
- **Constitutional alignment** (values-consistent memory updates)
- **Strategic learning** (DeepDive's "learn what to remember" heuristics)
- **Conditional reasoning** (proprietary personalization logic)

The system learns preferences **naturally** (explicit + implicit), applies them **transparently** (never creepy), and scales across **cycles** (getting smarter with each conversation). Memory feels like knowing a person, not like being spied on.

---

## Part 1: Data Structures

### 1.1 User Profile Schema

```typescript
// Core user profile stored in IndexedDB
interface UserProfile {
  // Identity
  userId: string;                    // Unique identifier
  createdAt: ISO8601;               // Profile creation date
  lastUpdated: ISO8601;             // Last profile modification

  // Preference landscape
  preferences: PreferenceMap;       // Key-value preferences with metadata
  patterns: BehavioralPattern[];    // Detected patterns + confidence
  constraints: ConstraintSet;       // Hard constraints (never recommend X)
  values: ValueAlignment;           // Constitutional alignment preferences

  // Memory management
  memories: Memory[];               // All memories with full metadata
  decaySchedule: DecayEntry[];      // When to refresh/fade memories
  trustVector: number;              // How much to weight user corrections (0-1)

  // Cycle tracking
  cycleCount: number;               // Total cycles with this user
  conversationHistory: Conversation[]; // Last N conversations (for pattern mining)
  interactionMetrics: InteractionMetrics;
}

// Single preference with confidence and temporal metadata
interface Preference {
  id: string;                       // Unique preference ID
  domain: string;                   // "communication_style", "content_depth", "framework_preference"
  value: PreferenceValue;           // Actual preference (string | boolean | number | enum)
  confidence: ConfidenceScore;      // 0.0 - 1.0 (higher = more certain)

  // Temporal metadata
  firstObserved: ISO8601;           // When first detected
  lastObserved: ISO8601;            // Most recent confirmation
  timesConfirmed: number;           // How many times user confirmed this
  timesContradicted: number;        // How many times user contradicted this

  // Learning source
  learningSource: "explicit" | "implicit" | "inferred";
  exemplars: string[];              // Chat snippets that exemplify this preference

  // Decay parameters
  decayRate: "slow" | "normal" | "fast"; // How quickly confidence drops
  nextDecayDate: ISO8601;           // When to refresh this preference
}

interface PreferenceMap {
  communicationStyle: {
    verbosity: "brief" | "detailed" | "conversational";
    complexity: "simple" | "moderate" | "technical";
    tone: string[];                 // ["direct", "empathetic", "humorous"]
    structurePreference: "narrative" | "bullet_points" | "hybrid";
    emoji: boolean;
    dashUsage: boolean;             // Em dash preference from research system
  };

  contentDepth: {
    researchDepth: "SQ" | "QK" | "NR" | "EX" | "MX"; // From research system
    citePreference: "minimal" | "moderate" | "extensive";
    exampleFrequency: "sparse" | "moderate" | "heavy";
    conceptualVsApplied: number;    // 0 (pure theory) to 1 (pure application)
  };

  workStyle: {
    frameworkTolerance: number;     // 0 (reject frameworks) to 1 (love frameworks)
    noveltyPreference: number;      // 0 (proven methods) to 1 (cutting-edge)
    convergenceVsDivergence: number; // 0 (converge quickly) to 1 (explore deeply)
    iterationSpeed: "fast" | "thoughtful" | "thorough";
  };

  personalization: {
    nameUsage: boolean;             // Use user's name?
    experienceLevel: "novice" | "intermediate" | "expert" | "research";
    industryContext: string[];      // ["advertising", "SaaS", "nonprofit"]
    domainsOfExpertise: string[];   // User's strong areas
  };

  contentPreferences: {
    favoriteConcepts: string[];     // "jobs to be done", "jobs theory", "value prop"
    avoidedConcepts: string[];      // What to never mention
    preferredAuthorities: string[]; // Preferred thought leaders
    genericAversion: boolean;       // User hates generic answers
  };

  emotionalContext: {
    frustrationTriggers: string[];  // What makes user frustrated
    energyLevel: "low" | "normal" | "high"; // Current energy
    decisionStyle: "analytical" | "intuitive" | "hybrid";
    socialPreference: "solo" | "collaborative" | "audience-aware";
  };
}

// Behavioral pattern with temporal evolution
interface BehavioralPattern {
  id: string;
  category: "preference" | "communication" | "decision_making" | "creativity" | "learning";
  pattern: string;                 // Human-readable description
  confidence: number;              // 0-1 based on evidence

  // Evidence
  exemplars: Exemplar[];           // Specific examples from conversations
  contradictions: Exemplar[];      // Contradictory examples

  // Temporal properties
  detectedAt: ISO8601;
  evolvedFrom?: string;            // Parent pattern ID if this is an evolution
  evolutionPhase: number;          // 1 = first observation, 2 = refining, 3+ = stable

  // Lifecycle
  isStable: boolean;               // Pattern established after 3+ confirmations
  lastChallenge: ISO8601;          // Last time this was contradicted
  dismissalCount: number;          // Times user corrected this pattern

  // Activation
  applicabilityContexts: string[]; // When to apply this pattern
  inhibitingContexts: string[];    // When NOT to apply this pattern

  // Confidence decay
  confidenceDecayRate: number;     // per month
  nextValidationDate: ISO8601;
}

// Single memory entry
interface Memory {
  id: string;
  type: "fact" | "preference" | "pattern" | "observation";
  content: string;                 // The actual memory

  // Confidence and sourcing
  confidence: number;              // 0.0-1.0
  source: "explicit" | "implicit" | "inferred" | "user_correction";
  sourceEvidence: string;          // Quote from conversation

  // Temporal metadata
  createdAt: ISO8601;
  lastConfirmedAt: ISO8601;
  timesReferenced: number;         // How many times did we use this memory?
  timesSuccessful: number;         // How many times did it improve output?

  // Decay schedule
  decayFunction: "linear" | "exponential" | "none";
  halfLife: number;                // Days until confidence halves
  nextReviewAt: ISO8601;

  // Relationships
  relatedMemories: string[];        // Other memory IDs this connects to
  linkedPreferences: string[];      // Associated preferences

  // User control
  isLocked: boolean;               // User wants this to persist
  isEditable: boolean;
  userNotes?: string;
}

interface ConfidenceScore {
  value: number;                   // 0.0 to 1.0
  basis: "single_mention" | "repeated_confirmation" | "behavioral_evidence" | "expert_corrected";
  lastUpdated: ISO8601;
  trajectory: "rising" | "stable" | "declining"; // Is confidence trend up/down?
}

// Constraint that prevents certain recommendations
interface ConstraintSet {
  hardNegatives: string[];         // Never recommend/mention these
  softNegatives: string[];         // Avoid unless explicitly requested
  hardPositives: string[];         // Always include if relevant
  conditionalRules: ConditionalRule[];
}

interface ConditionalRule {
  if: string;                      // Condition (e.g., "user is stressed")
  then: string[];                  // Actions (e.g., ["reduce_complexity", "add_examples"])
  priority: number;                // Higher = applies first
  confidence: number;              // 0-1
}

interface ValueAlignment {
  values: string[];                // "transparency", "creativity", "efficiency"
  antiValues: string[];            // "manipulation", "complexity", "boredom"
  decisionFramework: string;        // How user makes decisions
}

interface InteractionMetrics {
  totalConversations: number;
  totalTurns: number;
  averageTurnsPerConversation: number;
  averageMessageLength: number;
  topicDistribution: Record<string, number>; // Topic frequencies
  correctionRate: number;           // % of responses user corrected
  satisfactionScore?: number;       // If user provides feedback
}

interface Conversation {
  id: string;
  timestamp: ISO8601;
  cycleId: string;                 // Which cycle this was part of
  turns: ConversationTurn[];
  topics: string[];
  memoriesToExtract: string[];     // Memories extracted post-cycle
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: ISO8601;
}

interface DecayEntry {
  memoryId: string;
  lastDecayed: ISO8601;
  nextDecayAt: ISO8601;
  currentConfidence: number;
  decayFunction: string;
}

interface Exemplar {
  conversationId: string;
  timestamp: ISO8601;
  userMessage: string;
  assistantResponse: string;
  relevantSnippet: string;
}
```

### 1.2 Memory Types Taxonomy

```typescript
enum MemoryType {
  // Facts (objective, rarely change)
  FACT_PROFESSIONAL = "fact_professional",        // User works at Company X
  FACT_PERSONAL = "fact_personal",                // User has kids, lives in Y
  FACT_EXPERTISE = "fact_expertise",              // User knows Python, marketing

  // Preferences (subjective, stable but updatable)
  PREF_COMMUNICATION = "pref_communication",      // Prefers bullet points
  PREF_CONTENT = "pref_content",                  // Likes examples
  PREF_FRAMEWORK = "pref_framework",              // Rejects generic frameworks
  PREF_CREATIVE = "pref_creative",                // Wants unconventional angles

  // Patterns (behavioral tendencies, evolving)
  PATTERN_DECISION = "pattern_decision",          // User decides slowly/quickly
  PATTERN_LEARNING = "pattern_learning",          // User learns by doing vs theory
  PATTERN_FRUSTRATION = "pattern_frustration",    // Gets frustrated by X
  PATTERN_ENGAGEMENT = "pattern_engagement",      // Engages deeply on Y topics

  // Observations (temporary, high-frequency)
  OBS_MOOD = "obs_mood",                          // User seems energized/tired
  OBS_CONTEXT = "obs_context",                    // User is in meeting mode
  OBS_PRIORITY = "obs_priority",                  // Current focus area
  OBS_CHALLENGE = "obs_challenge",                // Active problem being solved
}

// Memory confidence basis (what evidence supports this?)
enum ConfidenceBasis {
  SINGLE_MENTION = "single_mention",              // User said once
  REPEATED_CONFIRMATION = "repeated_confirmation", // User said 3+ times
  BEHAVIORAL_EVIDENCE = "behavioral_evidence",    // Inferred from actions
  EXPERT_CORRECTED = "expert_corrected",          // User explicitly corrected
  SYSTEM_DEDUCED = "system_deduced",              // Deduced from other facts
}

// When contradictions happen, track the pattern
interface ContradictionEvent {
  memoryId: string;
  previousValue: any;
  newValue: any;
  timestamp: ISO8601;
  context: string;                 // "User said the opposite"
  resolution: "update" | "note_as_context_dependent" | "downgrade_confidence";
}
```

### 1.3 Confidence Scoring System

```typescript
interface ConfidenceCalculator {
  // Core calculation
  calculate(
    basis: ConfidenceBasis,
    timesConfirmed: number,
    timesContradicted: number,
    ageInDays: number,
    lastReconfirmedAgo: number
  ): number {
    let score = 0;

    // Start with basis
    const basisScores = {
      [ConfidenceBasis.SINGLE_MENTION]: 0.3,
      [ConfidenceBasis.REPEATED_CONFIRMATION]: 0.7,
      [ConfidenceBasis.BEHAVIORAL_EVIDENCE]: 0.6,
      [ConfidenceBasis.EXPERT_CORRECTED]: 0.95,
      [ConfidenceBasis.SYSTEM_DEDUCED]: 0.5,
    };

    score = basisScores[basis] || 0.5;

    // Boost for confirmations (diminishing returns)
    score += Math.log(timesConfirmed + 1) * 0.15;
    score = Math.min(score, 0.99); // Cap at 0.99 (never 100%)

    // Reduce for contradictions (more severe impact)
    score -= timesContradicted * 0.15;
    score = Math.max(score, 0.1);  // Floor at 0.1

    // Time decay (older memories lose confidence)
    const ageDecayFactor = Math.exp(-ageInDays / 60); // Half-life: 60 days
    score *= ageDecayFactor;

    // Boost if recently reconfirmed
    if (lastReconfirmedAgo < 7) {
      score += (7 - lastReconfirmedAgo) * 0.02; // Max +0.14 boost
    } else if (lastReconfirmedAgo > 90) {
      score *= 0.7; // Penalty if not seen in 3 months
    }

    return Math.max(0, Math.min(1, score));
  },

  // When user corrects us
  onUserCorrection(memory: Memory): void {
    memory.confidence.basis = ConfidenceBasis.EXPERT_CORRECTED;
    memory.timesContradicted++;
    memory.confidence.trajectory = "declining";
    memory.confidence.value = 0.4; // Reset to moderate confidence
  },

  // When user confirms (explicitly or implicitly)
  onConfirmation(memory: Memory, explicit: boolean = false): void {
    memory.timesConfirmed++;
    memory.lastConfirmedAt = new Date().toISOString();
    if (explicit) {
      memory.confidence.basis = ConfidenceBasis.REPEATED_CONFIRMATION;
    }
    memory.confidence.trajectory = "rising";
    memory.confidence.value = this.calculate(
      memory.confidence.basis,
      memory.timesConfirmed,
      memory.timesContradicted,
      daysSince(memory.createdAt),
      daysSince(memory.lastConfirmedAt)
    );
  },
}

// Trajectory detection
function detectConfidenceTrajectory(memory: Memory, lookbackDays: number = 30): "rising" | "stable" | "declining" {
  const recentScore = memory.confidence.value;
  const historicalScores = memory.confidence.history?.slice(-lookbackDays) || [];

  if (historicalScores.length === 0) return "stable";

  const average = historicalScores.reduce((a, b) => a + b) / historicalScores.length;
  const delta = recentScore - average;

  if (delta > 0.1) return "rising";
  if (delta < -0.1) return "declining";
  return "stable";
}
```

---

## Part 2: Learning Mechanisms

### 2.1 Preference Extraction Pipeline

```typescript
// Run after each cycle to extract learnable preferences
interface PreferenceExtractor {

  // Main extraction pipeline
  async extractPreferencesFromCycle(cycle: Cycle, userProfile: UserProfile): Promise<PreferenceUpdate[]> {
    const updates: PreferenceUpdate[] = [];

    // 1. Explicit preferences (user directly stated)
    updates.push(...await this.extractExplicitPreferences(cycle));

    // 2. Implicit preferences (inferred from feedback/behavior)
    updates.push(...await this.extractImplicitPreferences(cycle));

    // 3. Pattern observations (user's work style, decision-making)
    updates.push(...await this.extractBehavioralPatterns(cycle));

    // 4. Contradictions (user said opposite of previous cycle)
    updates.push(...await this.detectContradictions(cycle, userProfile));

    // 5. Refinements (narrowing existing preferences)
    updates.push(...await this.refineExistingPreferences(cycle, userProfile));

    return updates;
  }

  // Extract explicit preferences from conversation
  async extractExplicitPreferences(cycle: Cycle): Promise<PreferenceUpdate[]> {
    const prompt = `
    Extract explicit user preferences stated in this conversation.

    User message: "${cycle.conversation.join('\n')}"

    Return JSON array:
    {
      "preferences": [
        {
          "domain": "communication_style",
          "preference": "brief",
          "confidence": 0.95,
          "quote": "I prefer bullet points, not long paragraphs"
        }
      ]
    }
    `;

    const response = await ollamaService.generateJSON(prompt);
    return response.preferences.map(p => ({
      ...p,
      source: "explicit",
      timestamp: new Date().toISOString()
    }));
  }

  // Infer implicit preferences from user reactions
  async extractImplicitPreferences(cycle: Cycle): Promise<PreferenceUpdate[]> {
    const updates: PreferenceUpdate[] = [];

    // Analyze which responses user engaged with most
    const engagementPatterns = this.analyzeEngagement(cycle);

    for (const pattern of engagementPatterns) {
      if (pattern.engagementScore > 0.7) {
        updates.push({
          domain: pattern.domain,
          preference: pattern.value,
          confidence: 0.5 + (pattern.engagementScore * 0.25), // 0.5-0.75
          source: "implicit",
          basis: ConfidenceBasis.BEHAVIORAL_EVIDENCE,
          timestamp: new Date().toISOString()
        });
      }
    }

    return updates;
  }

  // Learn behavioral patterns (not just preferences)
  async extractBehavioralPatterns(cycle: Cycle): Promise<BehavioralPattern[]> {
    const patterns: BehavioralPattern[] = [];

    // 1. Decision-making speed
    const decisionSpeed = this.analyzeDecisionSpeed(cycle);
    if (decisionSpeed.confidence > 0.6) {
      patterns.push({
        category: "decision_making",
        pattern: `User tends to make decisions ${decisionSpeed.speed}ly`,
        confidence: decisionSpeed.confidence,
        exemplars: decisionSpeed.examples,
        detectedAt: new Date().toISOString(),
        evolutionPhase: 1,
        isStable: false
      });
    }

    // 2. Learning style
    const learningStyle = this.analyzeLearningStyle(cycle);
    if (learningStyle.confidence > 0.6) {
      patterns.push({
        category: "learning",
        pattern: `User learns best through ${learningStyle.method}`,
        confidence: learningStyle.confidence,
        exemplars: learningStyle.examples,
        detectedAt: new Date().toISOString(),
        evolutionPhase: 1,
        isStable: false
      });
    }

    // 3. Frustration triggers
    const frustrations = this.detectFrustrationTriggers(cycle);
    for (const trigger of frustrations) {
      patterns.push({
        category: "frustration",
        pattern: `User gets frustrated when ${trigger.description}`,
        confidence: trigger.confidence,
        exemplars: trigger.examples,
        detectedAt: new Date().toISOString(),
        evolutionPhase: 1,
        isStable: false
      });
    }

    return patterns;
  }

  // Detect when user contradicts previous preferences
  async detectContradictions(cycle: Cycle, userProfile: UserProfile): Promise<ContradictionEvent[]> {
    const contradictions: ContradictionEvent[] = [];

    for (const existingPreference of userProfile.preferences.values()) {
      const currentBehavior = this.extractBehaviorForPreference(cycle, existingPreference);

      if (currentBehavior && currentBehavior.contradicts(existingPreference)) {
        contradictions.push({
          memoryId: existingPreference.id,
          previousValue: existingPreference.value,
          newValue: currentBehavior.value,
          timestamp: new Date().toISOString(),
          context: currentBehavior.evidence,
          resolution: "flag_for_review" // Don't auto-update; let system decide
        });
      }
    }

    return contradictions;
  }

  // Refine existing preferences with new data
  async refineExistingPreferences(cycle: Cycle, userProfile: UserProfile): Promise<PreferenceUpdate[]> {
    const updates: PreferenceUpdate[] = [];

    for (const preference of userProfile.preferences.values()) {
      const confirmation = this.findConfirmationInCycle(cycle, preference);

      if (confirmation) {
        updates.push({
          preferenceId: preference.id,
          action: "confirm",
          timestamp: new Date().toISOString(),
          evidence: confirmation.quote
        });
      }
    }

    return updates;
  }
}

interface PreferenceUpdate {
  domain?: string;
  preference?: string;
  preferenceId?: string; // If updating existing
  confidence?: number;
  source: "explicit" | "implicit" | "inferred";
  basis?: ConfidenceBasis;
  timestamp: string;
  action?: "create" | "confirm" | "update" | "downgrade";
}
```

### 2.2 Pattern Detection Algorithm

```typescript
interface PatternDetector {

  // Main pattern detection
  detectPatterns(userProfile: UserProfile, conversation: string[]): BehavioralPattern[] {
    const patterns: BehavioralPattern[] = [];

    // Look for repeating evidence across multiple conversations
    const evidenceGroups = this.groupByTopic(userProfile.conversationHistory);

    for (const [topic, conversations] of evidenceGroups) {
      // Need 3+ data points to detect a pattern
      if (conversations.length >= 3) {
        const patternCandidates = this.minePatterns(conversations);

        for (const candidate of patternCandidates) {
          if (candidate.confidence >= 0.6) {
            patterns.push(this.createPattern(candidate));
          }
        }
      }
    }

    return patterns;
  }

  // What counts as a pattern? Repeating behaviors/preferences
  private minePatterns(conversations: Conversation[]): PatternCandidate[] {
    const candidates: Map<string, PatternCandidate> = new Map();

    for (const conv of conversations) {
      // Extract behaviors
      const behaviors = this.extractBehaviors(conv);

      for (const behavior of behaviors) {
        const key = behavior.type + ":" + behavior.value;
        if (!candidates.has(key)) {
          candidates.set(key, {
            type: behavior.type,
            value: behavior.value,
            count: 0,
            examples: [],
            confidence: 0
          });
        }

        const candidate = candidates.get(key)!;
        candidate.count++;
        candidate.examples.push({
          conversationId: conv.id,
          timestamp: conv.timestamp,
          snippet: behavior.evidence
        });
      }
    }

    // Calculate confidence based on frequency and consistency
    const results: PatternCandidate[] = [];
    for (const [key, candidate] of candidates) {
      candidate.confidence = this.calculatePatternConfidence(candidate);
      results.push(candidate);
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  // Calculate confidence based on evidence consistency
  private calculatePatternConfidence(candidate: PatternCandidate): number {
    const frequencyScore = Math.min(candidate.count / 10, 1); // Plateaus at 10 occurrences

    // Check if pattern is consistent (same across different contexts)
    const contexts = new Set(candidate.examples.map(e => e.conversationId));
    const contextDiversity = contexts.size / candidate.examples.length; // 0-1

    // Pattern strength = frequency + consistency - contradiction penalty
    let confidence = (frequencyScore * 0.6) + (contextDiversity * 0.4);

    return Math.min(confidence, 0.95);
  }

  // Extract specific behaviors from a conversation
  private extractBehaviors(conversation: Conversation): ExtractedBehavior[] {
    const behaviors: ExtractedBehavior[] = [];

    // Analyze user messages for patterns
    const userMessages = conversation.turns.filter(t => t.role === "user");
    const assistantResponses = conversation.turns.filter(t => t.role === "assistant");

    // 1. Communication patterns
    for (const msg of userMessages) {
      if (msg.content.includes("bullet") || msg.content.includes("points")) {
        behaviors.push({
          type: "communication_preference",
          value: "likes_bullets",
          evidence: msg.content,
          confidence: 0.8
        });
      }

      if (msg.content.split("\n").length > 5) {
        behaviors.push({
          type: "communication_style",
          value: "verbose",
          evidence: msg.content,
          confidence: 0.7
        });
      }
    }

    // 2. Decision-making patterns
    for (const msg of userMessages) {
      const decisionIndicators = ["let me think", "hmm", "not sure", "I need to"];
      if (decisionIndicators.some(indicator => msg.content.toLowerCase().includes(indicator))) {
        behaviors.push({
          type: "decision_making",
          value: "deliberate",
          evidence: msg.content,
          confidence: 0.6
        });
      }
    }

    // 3. Engagement patterns
    const avgResponseLength = assistantResponses.reduce((sum, r) => sum + r.content.length, 0) / assistantResponses.length;
    const avgUserMessageLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;

    if (avgUserMessageLength > 500) {
      behaviors.push({
        type: "engagement",
        value: "detailed_questions",
        evidence: "Long user messages",
        confidence: 0.7
      });
    }

    // 4. Learning style detection
    const conceptQuestions = userMessages.filter(m =>
      /why|how|what if|explain|understand/.test(m.content.toLowerCase())
    ).length;

    if (conceptQuestions > userMessages.length * 0.5) {
      behaviors.push({
        type: "learning_style",
        value: "conceptual_learner",
        evidence: `${conceptQuestions} concept questions`,
        confidence: 0.7
      });
    }

    return behaviors;
  }

  // Create BehavioralPattern from candidate
  private createPattern(candidate: PatternCandidate): BehavioralPattern {
    return {
      id: generateId(),
      category: this.categorizePattern(candidate.type),
      pattern: this.describePattern(candidate),
      confidence: candidate.confidence,
      exemplars: candidate.examples.map(ex => ({
        conversationId: ex.conversationId,
        timestamp: ex.timestamp,
        userMessage: ex.snippet,
        assistantResponse: "", // Populated on demand
        relevantSnippet: ex.snippet
      })),
      contradictions: [],
      detectedAt: new Date().toISOString(),
      evolutionPhase: 1,
      isStable: candidate.count >= 5, // Stable after 5+ observations
      lastChallenge: null,
      dismissalCount: 0,
      applicabilityContexts: [],
      inhibitingContexts: [],
      confidenceDecayRate: 0.02, // Slightly per month
      nextValidationDate: addMonths(new Date(), 1).toISOString()
    };
  }

  // Categorize which type of pattern this is
  private categorizePattern(type: string): string {
    const mapping: Record<string, string> = {
      "communication_preference": "preference",
      "communication_style": "communication",
      "decision_making": "decision_making",
      "learning_style": "learning",
      "engagement": "engagement",
    };
    return mapping[type] || "observation";
  }

  // Convert pattern to human-readable description
  private describePattern(candidate: PatternCandidate): string {
    const templates: Record<string, (val: string) => string> = {
      "communication_preference": (val) => `Prefers ${val}`,
      "decision_making": (val) => `Makes decisions ${val}`,
      "learning_style": (val) => `Learns as a ${val}`,
      "engagement": (val) => `Shows ${val}`,
    };

    const template = templates[candidate.type] || (val => `Pattern: ${val}`);
    return template(candidate.value);
  }
}

interface PatternCandidate {
  type: string;
  value: string;
  count: number;
  examples: Array<{ conversationId: string; timestamp: string; snippet: string }>;
  confidence: number;
}

interface ExtractedBehavior {
  type: string;
  value: string;
  evidence: string;
  confidence: number;
}
```

### 2.3 Contradiction Detection & Resolution

```typescript
interface ContradictionResolver {

  // Main contradiction detection
  async detectAndResolveContradictions(
    cycle: Cycle,
    userProfile: UserProfile
  ): Promise<ContradictionResolution[]> {

    const contradictions: ContradictionEvent[] = [];

    // 1. Find direct contradictions
    for (const preference of userProfile.preferences.values()) {
      const evidence = this.findEvidenceInCycle(cycle, preference);

      if (evidence && this.contradicts(preference, evidence)) {
        contradictions.push({
          memoryId: preference.id,
          previousValue: preference.value,
          newValue: evidence.value,
          timestamp: new Date().toISOString(),
          context: evidence.evidence,
          resolution: "pending"
        });
      }
    }

    // 2. Pattern contradictions
    for (const pattern of userProfile.patterns) {
      const evidence = this.findEvidenceInCycle(cycle, pattern);

      if (evidence && !this.supportsPattern(evidence, pattern)) {
        contradictions.push({
          memoryId: pattern.id,
          previousValue: pattern.pattern,
          newValue: evidence.value,
          timestamp: new Date().toISOString(),
          context: evidence.evidence,
          resolution: "pending"
        });
      }
    }

    // 3. Resolve contradictions (don't auto-update; flag for review)
    const resolutions: ContradictionResolution[] = [];
    for (const contradiction of contradictions) {
      resolutions.push(await this.resolveContradiction(contradiction, userProfile));
    }

    return resolutions;
  }

  // Detect if behavior contradicts stored preference
  private contradicts(preference: Preference, evidence: Evidence): boolean {
    // Direct contradiction
    if (preference.value === evidence.value) return false;

    // Same-domain contradiction (both about verbosity, but opposite)
    if (preference.domain === evidence.domain && preference.value !== evidence.value) {
      return true;
    }

    return false;
  }

  // Resolution strategy: three contradictions = preference shift
  private async resolveContradiction(
    contradiction: ContradictionEvent,
    userProfile: UserProfile
  ): Promise<ContradictionResolution> {

    const memory = userProfile.memories.find(m => m.id === contradiction.memoryId);
    if (!memory) return null;

    // Count recent contradictions
    const recentContradictions = (
      userProfile.conversationHistory
        .filter(c => daysSince(c.timestamp) < 30)
        .length || 0
    );

    memory.timesContradicted++;

    if (memory.timesContradicted >= 3) {
      // Preference shift detected
      return {
        memoryId: contradiction.memoryId,
        action: "preference_shift",
        previousValue: contradiction.previousValue,
        newValue: contradiction.newValue,
        confidence: this.calculateShiftConfidence(memory),
        rationale: `3+ contradictions detected over ${daysSince(memory.lastConfirmedAt)} days`,
        userNotification: `I've noticed you might have shifted from preferring ${contradiction.previousValue} to ${contradiction.newValue}. Should I update this?`
      };
    } else if (memory.timesContradicted === 1) {
      // Single contradiction: likely context-dependent
      return {
        memoryId: contradiction.memoryId,
        action: "note_as_context_dependent",
        previousValue: contradiction.previousValue,
        newValue: contradiction.newValue,
        confidence: 0.3,
        rationale: "Single contradiction - likely situation-dependent",
        userNotification: null // Don't notify on single contradiction
      };
    } else {
      // 2 contradictions: getting suspicious
      return {
        memoryId: contradiction.memoryId,
        action: "downgrade_confidence",
        previousValue: contradiction.previousValue,
        newValue: contradiction.newValue,
        confidence: memory.confidence.value * 0.7,
        rationale: "Multiple contradictions detected - lowering confidence",
        userNotification: `I'm less confident about your preference for ${contradiction.previousValue}. Recent behavior suggests you might prefer ${contradiction.newValue}.`
      };
    }
  }

  private calculateShiftConfidence(memory: Memory): number {
    // Shift is more confident if:
    // 1. Contradictions are recent and close together
    // 2. Original confidence was moderate (0.4-0.7) - very high confidence shifts are rare

    const recentityBonus = 0.2; // Recent contradictions = more likely real shift
    const moderateOriginalBonus = 0.1; // Moderate memories shift more often

    let confidence = 0.6 + recentityBonus;

    if (memory.confidence.value >= 0.4 && memory.confidence.value <= 0.7) {
      confidence += moderateOriginalBonus;
    }

    return Math.min(confidence, 0.9);
  }
}

interface Evidence {
  value: any;
  domain: string;
  evidence: string;
  timestamp: string;
  confidence: number;
}

interface ContradictionResolution {
  memoryId: string;
  action: "preference_shift" | "note_as_context_dependent" | "downgrade_confidence";
  previousValue: any;
  newValue: any;
  confidence: number;
  rationale: string;
  userNotification?: string; // Show to user if significant
}
```

### 2.4 Memory Decay & Refresh

```typescript
interface MemoryDecayManager {

  // Calculate decay on a memory
  calculateDecay(memory: Memory): number {
    const daysSinceCreated = daysSince(memory.createdAt);
    const daysSinceLastConfirmed = daysSince(memory.lastConfirmedAt);

    switch (memory.decayFunction) {
      case "linear":
        // Lose 1% confidence per week of non-use
        return 1 - (daysSinceLastConfirmed / 700); // 700 days = complete decay

      case "exponential":
        // Half-life model: confidence halves every N days
        const halfLives = daysSinceLastConfirmed / memory.halfLife;
        return Math.pow(0.5, halfLives);

      case "none":
        return 1; // Never decay (locked memories)

      default:
        return 1;
    }
  }

  // Refresh memories at regular intervals
  async refreshMemories(userProfile: UserProfile): Promise<MemoryRefreshReport> {
    const now = new Date().toISOString();
    const report: MemoryRefreshReport = {
      totalChecked: 0,
      decayed: 0,
      refreshed: 0,
      archived: 0,
      updated: []
    };

    for (const memory of userProfile.memories) {
      if (new Date(memory.nextReviewAt) > new Date(now)) {
        continue; // Not due for review yet
      }

      report.totalChecked++;

      // Apply decay
      const decayMultiplier = this.calculateDecay(memory);
      const decayedConfidence = memory.confidence.value * decayMultiplier;

      if (decayedConfidence < 0.2) {
        // Archive very low confidence memories
        memory.isEditable = false;
        report.archived++;
      } else if (decayedConfidence < memory.confidence.value) {
        // Update with decayed value
        memory.confidence.value = decayedConfidence;
        memory.confidence.trajectory = "declining";
        report.decayed++;
      } else {
        // Reconfirmed or stable
        report.refreshed++;
      }

      // Schedule next review
      const nextReviewDate = this.scheduleNextReview(memory);
      memory.nextReviewAt = nextReviewDate;

      report.updated.push({
        memoryId: memory.id,
        oldConfidence: memory.confidence.value,
        newConfidence: decayedConfidence,
        nextReview: nextReviewDate
      });
    }

    return report;
  }

  // Schedule when to review this memory again
  private scheduleNextReview(memory: Memory): string {
    const confidence = memory.confidence.value;

    // High confidence = review less frequently
    // Low confidence = review more frequently
    // Very low confidence = archive without review

    let daysUntilReview: number;

    if (confidence >= 0.8) {
      daysUntilReview = 90; // Review every 3 months
    } else if (confidence >= 0.6) {
      daysUntilReview = 60; // Review every 2 months
    } else if (confidence >= 0.4) {
      daysUntilReview = 30; // Review monthly
    } else if (confidence >= 0.2) {
      daysUntilReview = 14; // Review bi-weekly
    } else {
      daysUntilReview = 7; // Review weekly before archiving
    }

    return addDays(new Date(), daysUntilReview).toISOString();
  }

  // Monthly full memory system health check
  async monthlyMemoryHealthCheck(userProfile: UserProfile): Promise<MemoryHealthReport> {
    const report: MemoryHealthReport = {
      totalMemories: userProfile.memories.length,
      activeMemories: 0,
      archivedMemories: 0,
      averageConfidence: 0,
      confidenceDistribution: {
        high: 0, // 0.8-1.0
        moderate: 0, // 0.4-0.8
        low: 0 // 0.0-0.4
      },
      memoryDensity: 0, // Useful memories vs noise
      recommendations: []
    };

    let totalConfidence = 0;
    for (const memory of userProfile.memories) {
      if (memory.confidence.value > 0.2) {
        report.activeMemories++;
      } else {
        report.archivedMemories++;
      }

      totalConfidence += memory.confidence.value;

      // Distribution
      if (memory.confidence.value >= 0.8) {
        report.confidenceDistribution.high++;
      } else if (memory.confidence.value >= 0.4) {
        report.confidenceDistribution.moderate++;
      } else {
        report.confidenceDistribution.low++;
      }
    }

    report.averageConfidence = totalConfidence / userProfile.memories.length;

    // Memory density: useful references / total memories
    const usefulMemories = userProfile.memories.filter(m => m.timesSuccessful > 0).length;
    report.memoryDensity = usefulMemories / userProfile.memories.length;

    // Recommendations
    if (report.averageConfidence < 0.5) {
      report.recommendations.push("Consider reinforcing core memories - average confidence is declining");
    }

    if (report.memoryDensity < 0.3) {
      report.recommendations.push("Low memory density - pruning less useful memories could improve quality");
    }

    if (report.archivedMemories > userProfile.memories.length * 0.5) {
      report.recommendations.push("Many archived memories - consider permanent deletion of very low-confidence memories");
    }

    return report;
  }
}

interface MemoryRefreshReport {
  totalChecked: number;
  decayed: number;
  refreshed: number;
  archived: number;
  updated: Array<{
    memoryId: string;
    oldConfidence: number;
    newConfidence: number;
    nextReview: string;
  }>;
}

interface MemoryHealthReport {
  totalMemories: number;
  activeMemories: number;
  archivedMemories: number;
  averageConfidence: number;
  confidenceDistribution: {
    high: number;
    moderate: number;
    low: number;
  };
  memoryDensity: number;
  recommendations: string[];
}
```

---

## Part 3: Usage Patterns

### 3.1 When to Apply Memory in System Prompt

```typescript
interface MemoryApplicationStrategy {

  // Build the memory-augmented system prompt
  buildSystemPromptWithMemory(
    basePrompt: string,
    userProfile: UserProfile,
    currentContext: ConversationContext
  ): string {

    // 1. Filter memories for relevance to current task
    const relevantMemories = this.filterRelevantMemories(userProfile, currentContext);

    // 2. Organize by type and confidence
    const organizedMemories = this.organizeMemories(relevantMemories);

    // 3. Build memory section (concise, actionable)
    const memorySection = this.buildMemorySection(organizedMemories);

    // 4. Combine with base prompt
    return `${basePrompt}

## User Context (High Confidence)
${memorySection.highConfidence}

## User Context (Moderate Confidence)
${memorySection.moderateConfidence}

## Apply Conditionally If Relevant
${memorySection.conditional}`;
  }

  // Filter memories relevant to this conversation
  private filterRelevantMemories(
    userProfile: UserProfile,
    context: ConversationContext
  ): Memory[] {

    const relevant: Memory[] = [];

    // 1. Recent topic-related memories
    for (const memory of userProfile.memories) {
      if (memory.confidence.value < 0.2) continue; // Skip archived

      // Check semantic relevance to current topic
      const topicRelevance = this.calculateTopicRelevance(memory, context.topic);

      // Check whether memory has been useful
      const usefulness = memory.timesSuccessful / (memory.timesReferenced || 1);

      if (topicRelevance > 0.5 && usefulness > 0.3) {
        relevant.push(memory);
      }
    }

    // 2. Critical hard constraints (always include)
    for (const constraint of userProfile.constraints.hardNegatives) {
      const memory = userProfile.memories.find(m => m.content === constraint);
      if (memory) relevant.push(memory);
    }

    // 3. Conditional rules that apply now
    for (const rule of userProfile.constraints.conditionalRules) {
      if (this.evaluateCondition(rule.if, userProfile, context)) {
        for (const action of rule.then) {
          const relatedMemory = userProfile.memories.find(m => m.linkedPreferences?.includes(action));
          if (relatedMemory) relevant.push(relatedMemory);
        }
      }
    }

    return relevant;
  }

  // Organize memories by confidence + type
  private organizeMemories(memories: Memory[]): OrganizedMemories {
    const organized: OrganizedMemories = {
      highConfidence: [],
      moderateConfidence: [],
      conditional: []
    };

    for (const memory of memories) {
      if (memory.confidence.value >= 0.7) {
        organized.highConfidence.push(memory);
      } else if (memory.confidence.value >= 0.4) {
        organized.moderateConfidence.push(memory);
      } else {
        organized.conditional.push(memory);
      }
    }

    return organized;
  }

  // Build the actual memory section (concise!)
  private buildMemorySection(organized: OrganizedMemories): string {
    const sections: string[] = [];

    // High confidence: state as facts
    if (organized.highConfidence.length > 0) {
      const facts = organized.highConfidence
        .map(m => `• ${this.formatMemory(m)}`)
        .join("\n");
      sections.push(`High confidence:\n${facts}`);
    }

    // Moderate confidence: frame as observations
    if (organized.moderateConfidence.length > 0) {
      const observations = organized.moderateConfidence
        .map(m => `• I've noticed: ${this.formatMemory(m)}`)
        .join("\n");
      sections.push(`Moderate confidence:\n${observations}`);
    }

    // Conditional: explain the rule
    if (organized.conditional.length > 0) {
      const conditionals = organized.conditional
        .map(m => `• IF (condition): ${this.formatMemory(m)}`)
        .join("\n");
      sections.push(`Apply if relevant:\n${conditionals}`);
    }

    return sections.join("\n\n");
  }

  // Format memory for display (human-readable, concise)
  private formatMemory(memory: Memory): string {
    if (memory.confidence.value >= 0.8) {
      return memory.content;
    } else if (memory.confidence.value >= 0.5) {
      return `${memory.content} (confidence: ${Math.round(memory.confidence.value * 100)}%)`;
    } else {
      return `Possible: ${memory.content}`;
    }
  }

  // Maximum memory tokens to include (prevent prompt bloat)
  private readonly MAX_MEMORY_TOKENS = 500; // ~2000 chars

  // Evaluate if a conditional rule applies now
  private evaluateCondition(condition: string, userProfile: UserProfile, context: ConversationContext): boolean {
    // Parse condition strings like:
    // "user_is_stressed" → check recent energy level observations
    // "topic_includes_creative" → check current topic
    // "cycle_count > 5" → check userProfile.cycleCount

    if (condition.includes("stressed")) {
      const recentMood = this.getMostRecentObservation(userProfile, "OBS_MOOD");
      return recentMood?.includes("low") || recentMood?.includes("tired");
    }

    if (condition.includes("creative")) {
      return context.topic.toLowerCase().includes("creative");
    }

    if (condition.includes("cycle_count")) {
      const parts = condition.split(">");
      return userProfile.cycleCount > parseInt(parts[1]);
    }

    return false;
  }

  private getMostRecentObservation(userProfile: UserProfile, obsType: string): string | null {
    const observations = userProfile.memories
      .filter(m => m.type === obsType)
      .sort((a, b) => new Date(b.lastConfirmedAt).getTime() - new Date(a.lastConfirmedAt).getTime());

    return observations[0]?.content || null;
  }
}

interface OrganizedMemories {
  highConfidence: Memory[];
  moderateConfidence: Memory[];
  conditional: Memory[];
}

interface ConversationContext {
  topic: string;
  stage: string; // "research", "creative", "testing", etc.
  previousResponses: string[];
  userMood?: string;
}
```

### 3.2 Callback Rules (When is it okay to reference memory?)

```typescript
interface CallbackRules {

  // Determine if we should explicitly reference a memory
  shouldCallback(memory: Memory, context: ConversationContext): boolean {

    // Rule 1: Never announce memory unprompted
    if (!context.userAskingAboutPreferences && memory.type.includes("preference")) {
      return false;
    }

    // Rule 2: Callback only if memory improves THIS response
    if (!this.improvesCurrentResponse(memory, context)) {
      return false;
    }

    // Rule 3: Callback only if user likely wants it
    // (High confidence + recent confirmation + relevant to topic)
    const shouldCallback =
      memory.confidence.value >= 0.8 &&
      daysSince(memory.lastConfirmedAt) < 30 &&
      this.isRelevantToTopic(memory, context.topic);

    return shouldCallback;
  }

  // Generate callback text (if needed)
  generateCallback(memory: Memory): string {
    // Callbacks should feel earned, not inserted
    // Pattern: "Given your preference for X, here's Y"

    if (memory.type === "PREF_FRAMEWORK") {
      return `Given your aversion to generic frameworks, I'm taking a custom angle here.`;
    }

    if (memory.type === "PATTERN_LEARNING") {
      return `Since you learn best through examples, I've included concrete case studies.`;
    }

    if (memory.type === "PATTERN_FRUSTRATION") {
      return `I'm avoiding the complexity issues that frustrated you last time.`;
    }

    // Most memories shouldn't have explicit callbacks
    return null;
  }

  private improvesCurrentResponse(memory: Memory, context: ConversationContext): boolean {
    // Does using this memory make the response better?
    // High usage success rate = yes
    const successRate = memory.timesSuccessful / (memory.timesReferenced || 1);
    return successRate > 0.5;
  }

  private isRelevantToTopic(memory: Memory, topic: string): boolean {
    // Semantic relevance between memory and topic
    // Implemented with embeddings in Phase 2
    return true; // Placeholder
  }
}

interface CallbackStyle {
  // How should callbacks feel?
  RULES: {
    EARNED: "Only callback if memory directly improves the response",
    BRIEF: "One sentence max, no meta-commentary",
    CONDITIONAL: "Callback only when user asked about preferences",
    NATURAL: "Integration shouldn't feel like an insertion",
  }
}
```

### 3.3 Conditional Reasoning

```typescript
interface ConditionalReasoningEngine {

  // Main conditional logic
  applyConditionalRules(
    userProfile: UserProfile,
    context: ConversationContext,
    originalResponse: string
  ): string {

    let adjustedResponse = originalResponse;

    // Apply high-priority rules first
    const applicableRules = userProfile.constraints.conditionalRules
      .filter(r => this.evaluateCondition(r.if, userProfile, context))
      .sort((a, b) => b.priority - a.priority);

    for (const rule of applicableRules) {
      for (const action of rule.then) {
        adjustedResponse = this.applyAction(adjustedResponse, action, userProfile);
      }
    }

    return adjustedResponse;
  }

  // Example rules: IF X THEN Y
  private applyAction(response: string, action: string, userProfile: UserProfile): string {
    switch (action) {
      case "reduce_complexity":
        // Simplify technical jargon
        return this.simplifyResponse(response);

      case "add_examples":
        // Inject concrete examples
        return this.addExamples(response, userProfile);

      case "reframe_frameworks":
        // Rewrite generic frameworks as custom angles
        return this.reframeFrameworks(response, userProfile);

      case "increase_brevity":
        // Trim to essentials
        return this.trimResponse(response, 0.7);

      case "increase_detail":
        // Expand with more explanation
        return this.expandResponse(response, userProfile);

      case "emphasize_novelty":
        // Lead with unconventional angles
        return this.prioritizeNovelty(response);

      case "add_emotional_context":
        // Frame with emotional/motivational language
        return this.addEmotionalFraming(response);

      default:
        return response;
    }
  }

  // Example conditional rule cascade
  evaluateConditionals(userProfile: UserProfile, context: ConversationContext): ConditionalRule[] {
    const rules: ConditionalRule[] = [];

    // Rule 1: High-energy + creative topic = emphasize novelty
    if (this.userIsHighEnergy(userProfile) && context.topic.includes("creative")) {
      rules.push({
        if: "energy_high AND topic_creative",
        then: ["emphasize_novelty", "expand_possibilities"],
        priority: 9,
        confidence: 0.8
      });
    }

    // Rule 2: Low-energy + analytical topic = reduce complexity + brief
    if (this.userIsLowEnergy(userProfile) && context.topic.includes("analysis")) {
      rules.push({
        if: "energy_low AND topic_analysis",
        then: ["reduce_complexity", "increase_brevity"],
        priority: 8,
        confidence: 0.85
      });
    }

    // Rule 3: User learning first time + pattern suggests examples help
    if (context.isNewTopic && userProfile.patterns.some(p => p.pattern.includes("examples"))) {
      rules.push({
        if: "new_topic AND learns_via_examples",
        then: ["add_examples", "add_concrete_cases"],
        priority: 7,
        confidence: 0.9
      });
    }

    // Rule 4: Generic aversion detected + response is generic
    if (this.userHatesGeneric(userProfile) && this.responseIsGeneric(rules[0]?.then[0])) {
      rules.push({
        if: "user_hates_generic AND response_is_generic",
        then: ["reframe_frameworks", "emphasize_customization"],
        priority: 10, // Highest: override generic
        confidence: 0.95
      });
    }

    return rules;
  }

  private userIsHighEnergy(userProfile: UserProfile): boolean {
    const recentMood = userProfile.memories
      .filter(m => m.type === "OBS_MOOD")
      .sort((a, b) => new Date(b.lastConfirmedAt).getTime() - new Date(a.lastConfirmedAt).getTime())[0];

    return recentMood?.content.includes("energized") || false;
  }

  private userIsLowEnergy(userProfile: UserProfile): boolean {
    const recentMood = userProfile.memories
      .filter(m => m.type === "OBS_MOOD")
      .sort((a, b) => new Date(b.lastConfirmedAt).getTime() - new Date(a.lastConfirmedAt).getTime())[0];

    return recentMood?.content.includes("tired") || false;
  }

  private userHatesGeneric(userProfile: UserProfile): boolean {
    return userProfile.preferences.contentPreferences.genericAversion;
  }

  private responseIsGeneric(response: string): boolean {
    const genericIndicators = [
      "5-step framework",
      "here are the key points",
      "as a best practice",
      "best practices"
    ];
    return genericIndicators.some(indicator => response.toLowerCase().includes(indicator));
  }
}
```

---

## Part 4: Implementation Phases

### Phase 1: JSON User Profile in System Prompt (Weeks 1-2)

**Goal:** Get basic preference tracking working immediately

```typescript
// Step 1: Create minimal user profile schema
interface MinimalUserProfile {
  userId: string;
  preferences: {
    verbosity: "brief" | "detailed";
    frameworkTolerance: number; // 0-1
    genericAversion: boolean;
    researchDepth: "SQ" | "QK" | "NR" | "EX" | "MX";
  };
  patterns: {
    description: string;
    confidence: number;
  }[];
  constraints: {
    neverMention: string[];
    alwaysInclude: string[];
  };
}

// Step 2: Manual profile creation
const exampleProfile: MinimalUserProfile = {
  userId: "mk-1",
  preferences: {
    verbosity: "detailed",
    frameworkTolerance: 0.2, // Hates frameworks
    genericAversion: true,
    researchDepth: "EX" // Extended research
  },
  patterns: [
    {
      description: "Prefers unconventional angles to generic frameworks",
      confidence: 0.85
    },
    {
      description: "Engages deeply with creative exploration",
      confidence: 0.8
    }
  ],
  constraints: {
    neverMention: ["step-by-step", "best practices", "industry standards"],
    alwaysInclude: ["unconventional angles", "customer-centric insights"]
  }
};

// Step 3: Inject into system prompt
const systemPrompt = `
You are Nomad, an AI research agent...

## User Profile
${JSON.stringify(exampleProfile, null, 2)}

Apply these preferences naturally in all responses.
`;

// Step 4: Manually extract preferences after each cycle
// (LLM-based extraction in Phase 2)
```

**Success Metrics (Phase 1):**
- Profile created and stored in IndexedDB ✓
- Basic preferences applied in system prompt ✓
- No TypeScript errors ✓
- User can manually edit profile in Settings

---

### Phase 2: Vector Embeddings + Semantic Retrieval (Weeks 2-4)

**Goal:** Smart memory retrieval based on topic relevance

```typescript
// Step 1: Add embeddings library
// npm install @xenova/transformers onnxruntime-web

// Step 2: Embed memories at creation time
interface MemoryWithEmbedding extends Memory {
  embedding: number[]; // 384-dim vector from all-minilm-l6-v2
}

// Step 3: Retrieve memories by semantic similarity
interface EmbeddingRetriever {
  async retrieveRelevantMemories(
    query: string,
    userProfile: UserProfile,
    topK: number = 5
  ): Promise<MemoryWithEmbedding[]> {

    // Embed the query
    const queryEmbedding = await this.embedQuery(query);

    // Score each memory by cosine similarity
    const scored = userProfile.memories.map(memory => ({
      memory,
      similarity: this.cosineSimilarity(queryEmbedding, (memory as any).embedding)
    }));

    // Return top-K
    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(s => s.memory as MemoryWithEmbedding);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// Step 4: Update system prompt builder
// Use embeddings to find only relevant memories
```

**Success Metrics (Phase 2):**
- Embeddings computed without blocking (web worker) ✓
- Retrieval is instant (<50ms) ✓
- Only relevant memories included in prompt ✓
- Preference references feel natural (not forced)

---

### Phase 3: Temporal Graph + Evolution Tracking (Weeks 4-8)

**Goal:** Track how preferences change over time

```typescript
// Step 1: Build temporal graph of memory relationships
interface MemoryGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

interface MemoryNode {
  memoryId: string;
  timestamp: string;
  type: MemoryType;
  value: any;
  version: number; // If memory evolved, track versions
}

interface MemoryEdge {
  fromMemoryId: string;
  toMemoryId: string;
  edgeType: "contradicts" | "refines" | "confirms" | "evolves_from";
  strength: number; // 0-1
}

// Step 2: Track preference evolution
interface PreferenceTimeline {
  memoryId: string;
  timeline: Array<{
    timestamp: string;
    value: any;
    confidence: number;
    source: string; // What caused this update?
  }>;
  trajectory: "rising" | "declining" | "oscillating" | "stable";
  evolutionPhase: number;
}

// Step 3: Detect when a preference shifts permanently
async detectPreferenceShift(memory: Memory, timeline: PreferenceTimeline): Promise<boolean> {
  // Shift = 3+ recent contradictions + trajectory declining
  const recentContradictions = memory.timesContradicted >= 3;
  const decliningTrend = timeline.trajectory === "declining";

  return recentContradictions && decliningTrend;
}

// Step 4: Visualize preference evolution in dashboard
// (Timeline chart showing confidence trajectory)
```

**Success Metrics (Phase 3):**
- Graph structure created in IndexedDB ✓
- Temporal queries work (e.g., "what did user prefer 2 months ago?") ✓
- Evolution detection accurate (shift vs noise) ✓
- Memory dashboard shows preference timelines

---

### Phase 4: Dashboard UI for Memory Management (Weeks 8+)

**Goal:** User transparency and control

```typescript
// Step 1: Memory Viewer component
interface MemoryViewerProps {
  userProfile: UserProfile;
  selectedMemory?: Memory;
}

// Features:
// - List all memories (filterable by type, confidence)
// - View memory timeline (when created, confirmed, edited)
// - See memory usage (times referenced, success rate)
// - Edit/delete/lock memories
// - Add manual notes to memories

// Step 2: Preference Evolution Dashboard
interface PreferenceEvolutionDashboard {
  // Timeline chart: show how each preference evolved
  // Scatter plot: confidence vs age of memory
  // Heatmap: which memories are most useful
  // Suggestion panel: "We think you might have shifted from X to Y"
}

// Step 3: Memory Health Indicator
// Show user:
// - Total memories: 47
// - Active (high confidence): 32
// - Uncertain: 12
// - Archived: 3
// - Average confidence: 0.72
// - Memory density (useful/total): 78%

// Step 4: Privacy controls
// - Export memory profile as JSON
// - Delete all memories (reset profile)
// - Lock memories (prevent decay)
// - Make memory private (don't share across devices)
```

**Success Metrics (Phase 4):**
- User sees all memories transparently ✓
- User can correct/edit any memory ✓
- Memory evolution visualized ✓
- User feels in control (not spied on)

---

## Part 5: Technical Architecture

### 5.1 IndexedDB Schema

```typescript
// Database structure
interface NomadDB extends DBSchema {
  // User profiles (1 per user)
  "user_profiles": {
    key: string; // userId
    value: UserProfile;
    indexes: {
      "by_created": string;
      "by_last_updated": string;
    };
  };

  // Individual memories (many per user)
  "memories": {
    key: string; // memoryId
    value: Memory;
    indexes: {
      "by_user": string;
      "by_type": string;
      "by_confidence": number;
      "by_created": string;
      "by_last_confirmed": string;
    };
  };

  // Memory relationships (temporal graph)
  "memory_edges": {
    key: string; // edgeId
    value: MemoryEdge;
    indexes: {
      "by_from_memory": string;
      "by_edge_type": string;
    };
  };

  // Conversation history (for pattern mining)
  "conversations": {
    key: string; // conversationId
    value: Conversation;
    indexes: {
      "by_user": string;
      "by_cycle": string;
      "by_timestamp": string;
    };
  };

  // Embeddings (for semantic search)
  "embeddings": {
    key: string; // memoryId
    value: {
      memoryId: string;
      embedding: number[]; // 384-dim
      timestamp: string;
    };
  };

  // Decay schedule (when to refresh)
  "decay_schedule": {
    key: string; // decayEntryId
    value: DecayEntry;
    indexes: {
      "by_user": string;
      "by_next_decay": string;
    };
  };

  // Audit trail (for transparency)
  "audit_log": {
    key: string; // entryId
    value: {
      timestamp: string;
      action: "create" | "update" | "delete" | "decay" | "reference";
      memoryId: string;
      details: Record<string, any>;
    };
  };
}

// Usage example
const db = await openDB<NomadDB>("nomad-memory", 1, {
  upgrade(db) {
    // Create stores
    const memoriesStore = db.createObjectStore("memories", { keyPath: "id" });
    memoriesStore.createIndex("by_user", "userId");
    memoriesStore.createIndex("by_confidence", "confidence.value");

    // ... other stores
  }
});

// Query examples
async function getActiveMemories(userId: string): Promise<Memory[]> {
  const db = await openDB<NomadDB>("nomad-memory");
  const allMemories = await db.getAllFromIndex("memories", "by_user", userId);
  return allMemories.filter(m => m.confidence.value > 0.2);
}

async function getMemoriesDueForRefresh(): Promise<Memory[]> {
  const db = await openDB<NomadDB>("nomad-memory");
  const now = new Date().toISOString();

  // Get all decay entries due for refresh
  const dueEntries = await db.getAllFromIndex("decay_schedule", "by_next_decay");
  // Filter by nextDecayAt < now

  // Get corresponding memories
  // ...
}
```

### 5.2 Retrieval Strategy

```typescript
interface MemoryRetrievalStrategy {

  // When to retrieve memories (3 scenarios)

  // 1. BEFORE generating response (context injection)
  async retrieveForContextInjection(
    userProfile: UserProfile,
    topic: string,
    maxTokens: number = 500
  ): Promise<Memory[]> {

    // Get semantically relevant memories
    const semanticRelevant = await this.retrieveBySemanticSimilarity(topic, 5);

    // Get constraint memories (hard rules)
    const constraints = userProfile.constraints.hardNegatives
      .map(cn => userProfile.memories.find(m => m.content === cn))
      .filter(Boolean);

    // Get high-confidence patterns
    const patterns = userProfile.patterns
      .filter(p => p.isStable && p.confidence > 0.8)
      .slice(0, 3);

    // Combine and trim to token limit
    const combined = [
      ...semanticRelevant,
      ...constraints,
      ...patterns.map(p => ({ content: p.pattern, confidence: p.confidence } as any))
    ];

    return this.trimToTokenBudget(combined, maxTokens);
  }

  // 2. AFTER generating response (callback injection)
  async retrieveForCallback(
    response: string,
    userProfile: UserProfile
  ): Promise<string | null> {

    // Find 1-2 memories that would add value to response
    const relevantMemories = await this.retrieveBySemanticSimilarity(response, 2);

    // Filter by callback rules (would callback feel natural?)
    const callbackWorthy = relevantMemories.filter(m =>
      m.confidence.value >= 0.8 &&
      m.timesSuccessful / (m.timesReferenced || 1) > 0.5
    );

    if (callbackWorthy.length === 0) return null;

    return this.generateCallback(callbackWorthy[0]);
  }

  // 3. ON USER REQUEST (e.g., "what do you know about me?")
  async retrieveForUserQuery(userProfile: UserProfile): Promise<MemoryExport> {
    const organized = {
      highConfidence: userProfile.memories.filter(m => m.confidence.value >= 0.8),
      moderate: userProfile.memories.filter(m => m.confidence.value >= 0.4 && m.confidence.value < 0.8),
      lowConfidence: userProfile.memories.filter(m => m.confidence.value < 0.4),
      patterns: userProfile.patterns.filter(p => p.isStable),
    };

    return organized;
  }

  // Retrieve by semantic similarity to query
  private async retrieveBySemanticSimilarity(query: string, topK: number): Promise<Memory[]> {
    const queryEmbedding = await this.embedQuery(query);

    const db = await openDB<NomadDB>("nomad-memory");
    const allEmbeddings = await db.getAll("embeddings");

    const scored = allEmbeddings.map(emb => ({
      memoryId: emb.memoryId,
      similarity: this.cosineSimilarity(queryEmbedding, emb.embedding)
    }));

    const topMemories = scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(s => s.memoryId);

    return Promise.all(topMemories.map(id => db.get("memories", id)));
  }

  // Trim memories to fit token budget
  private trimToTokenBudget(memories: any[], maxTokens: number): Memory[] {
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);

    let totalTokens = 0;
    const trimmed: Memory[] = [];

    for (const memory of memories.sort((a, b) => b.confidence.value - a.confidence.value)) {
      const tokens = estimateTokens(JSON.stringify(memory));
      if (totalTokens + tokens > maxTokens) break;

      trimmed.push(memory);
      totalTokens += tokens;
    }

    return trimmed;
  }
}

interface MemoryExport {
  highConfidence: Memory[];
  moderate: Memory[];
  lowConfidence: Memory[];
  patterns: BehavioralPattern[];
}
```

### 5.3 Update Pipeline

```typescript
interface MemoryUpdatePipeline {

  // Post-cycle memory extraction and update
  async updateMemoriesPostCycle(
    cycle: Cycle,
    userProfile: UserProfile
  ): Promise<UpdateReport> {

    const report: UpdateReport = {
      timestamp: new Date().toISOString(),
      extractedMemories: [],
      updatedMemories: [],
      contradictions: [],
      errors: []
    };

    try {
      // 1. Extract new preferences from cycle
      const extractor = new PreferenceExtractor();
      const newPreferences = await extractor.extractPreferencesFromCycle(cycle, userProfile);

      for (const pref of newPreferences) {
        const memory = await this.createOrUpdateMemory(pref, userProfile);
        report.extractedMemories.push(memory);
      }

      // 2. Extract behavioral patterns
      const detector = new PatternDetector();
      const patterns = detector.detectPatterns(userProfile, [cycle.conversation.join("\n")]);

      for (const pattern of patterns) {
        const memoryId = await this.createPatternMemory(pattern, userProfile);
        report.extractedMemories.push(memoryId);
      }

      // 3. Detect contradictions
      const resolver = new ContradictionResolver();
      const contradictions = await resolver.detectAndResolveContradictions(cycle, userProfile);

      for (const contradiction of contradictions) {
        const resolution = await this.applyContradictionResolution(contradiction, userProfile);
        report.contradictions.push(resolution);
      }

      // 4. Decay memories (scheduled refresh)
      const decayManager = new MemoryDecayManager();
      const decayReport = await decayManager.refreshMemories(userProfile);
      report.updatedMemories.push(...decayReport.updated);

      // 5. Save updated profile
      const db = await openDB<NomadDB>("nomad-memory");
      await db.put("user_profiles", userProfile);

      // 6. Log all updates to audit trail
      await this.logToAuditTrail(userProfile.userId, report);

    } catch (error) {
      report.errors.push({
        stage: "post_cycle_update",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    return report;
  }

  // Create new memory or update existing
  private async createOrUpdateMemory(
    preferenceUpdate: PreferenceUpdate,
    userProfile: UserProfile
  ): Promise<Memory> {

    const db = await openDB<NomadDB>("nomad-memory");

    // Check if memory already exists
    let memory = userProfile.memories.find(m =>
      m.type === preferenceUpdate.domain &&
      m.content === preferenceUpdate.preference
    );

    if (memory) {
      // Update existing
      if (preferenceUpdate.action === "confirm") {
        memory.timesConfirmed++;
        memory.lastConfirmedAt = new Date().toISOString();
      } else if (preferenceUpdate.action === "update") {
        memory.content = preferenceUpdate.preference;
        memory.lastConfirmedAt = new Date().toISOString();
      }
    } else {
      // Create new
      memory = {
        id: generateId(),
        type: preferenceUpdate.domain,
        content: preferenceUpdate.preference,
        confidence: {
          value: preferenceUpdate.confidence || 0.5,
          basis: preferenceUpdate.basis || ConfidenceBasis.SINGLE_MENTION,
          lastUpdated: new Date().toISOString(),
          trajectory: "stable"
        },
        source: preferenceUpdate.source,
        sourceEvidence: "",
        createdAt: new Date().toISOString(),
        lastConfirmedAt: new Date().toISOString(),
        timesReferenced: 0,
        timesSuccessful: 0,
        decayFunction: "exponential",
        halfLife: 60,
        nextReviewAt: addDays(new Date(), 30).toISOString(),
        relatedMemories: [],
        linkedPreferences: [],
        isLocked: false,
        isEditable: true
      };
    }

    // Embed memory
    const embedding = await this.embedMemory(memory);
    const embedEntry = {
      memoryId: memory.id,
      embedding,
      timestamp: new Date().toISOString()
    };

    await db.put("memories", memory);
    await db.put("embeddings", embedEntry);

    return memory;
  }

  // Log to audit trail (for transparency)
  private async logToAuditTrail(
    userId: string,
    report: UpdateReport
  ): Promise<void> {
    const db = await openDB<NomadDB>("nomad-memory");

    const auditEntry = {
      id: generateId(),
      timestamp: report.timestamp,
      userId,
      action: "post_cycle_update" as const,
      details: {
        extractedMemories: report.extractedMemories.length,
        updatedMemories: report.updatedMemories.length,
        contradictions: report.contradictions.length
      }
    };

    await db.add("audit_log", auditEntry);
  }
}

interface UpdateReport {
  timestamp: string;
  extractedMemories: string[]; // Memory IDs
  updatedMemories: string[];
  contradictions: ContradictionResolution[];
  errors: Array<{ stage: string; error: string; timestamp: string }>;
}
```

### 5.4 Decay Schedule

```typescript
interface DecayScheduler {

  // Initialize decay schedule for memory
  scheduleDecay(memory: Memory): DecayEntry {
    const nextReviewDate = this.calculateNextReviewDate(memory);

    return {
      memoryId: memory.id,
      lastDecayed: new Date().toISOString(),
      nextDecayAt: nextReviewDate,
      currentConfidence: memory.confidence.value,
      decayFunction: memory.decayFunction
    };
  }

  // Calculate next review date based on confidence
  private calculateNextReviewDate(memory: Memory): string {
    const confidence = memory.confidence.value;

    // High confidence = review less frequently
    // Low confidence = review more frequently

    let daysUntilReview: number;

    if (confidence >= 0.9) {
      daysUntilReview = 120; // 4 months
    } else if (confidence >= 0.8) {
      daysUntilReview = 90; // 3 months
    } else if (confidence >= 0.6) {
      daysUntilReview = 60; // 2 months
    } else if (confidence >= 0.4) {
      daysUntilReview = 30; // 1 month
    } else if (confidence >= 0.2) {
      daysUntilReview = 14; // 2 weeks
    } else {
      daysUntilReview = 7; // 1 week (before archiving)
    }

    return addDays(new Date(), daysUntilReview).toISOString();
  }

  // Run decay schedule (cron job, daily)
  async runDailyDecaySchedule(userId: string): Promise<void> {
    const db = await openDB<NomadDB>("nomad-memory");

    // Get memories due for decay
    const now = new Date().toISOString();
    const dueEntries = (await db.getAll("decay_schedule"))
      .filter(entry => entry.nextDecayAt <= now);

    for (const entry of dueEntries) {
      const memory = await db.get("memories", entry.memoryId);
      if (!memory) continue;

      // Apply decay
      const decayMultiplier = this.applyDecayFunction(memory);
      memory.confidence.value *= decayMultiplier;

      // Reschedule
      entry.nextDecayAt = this.calculateNextReviewDate(memory).toISOString();
      entry.currentConfidence = memory.confidence.value;

      // Save
      await db.put("memories", memory);
      await db.put("decay_schedule", entry);
    }
  }

  // Apply decay function (linear vs exponential)
  private applyDecayFunction(memory: Memory): number {
    const daysSinceLastConfirmed = daysSince(memory.lastConfirmedAt);

    switch (memory.decayFunction) {
      case "linear":
        // Lose 1% per week of non-use
        return 1 - (daysSinceLastConfirmed / 700);

      case "exponential":
        // Half-life model
        const halfLives = daysSinceLastConfirmed / memory.halfLife;
        return Math.pow(0.5, halfLives);

      case "none":
        return 1; // Never decay

      default:
        return 1;
    }
  }

  // Monthly comprehensive health check
  async monthlyMemoryHealthCheck(userId: string): Promise<MemoryHealthReport> {
    const db = await openDB<NomadDB>("nomad-memory");
    const userProfile = await db.get("user_profiles", userId);

    const report: MemoryHealthReport = {
      totalMemories: userProfile.memories.length,
      activeMemories: 0,
      archivedMemories: 0,
      averageConfidence: 0,
      confidenceDistribution: { high: 0, moderate: 0, low: 0 },
      memoryDensity: 0,
      recommendations: []
    };

    let totalConfidence = 0;
    for (const memory of userProfile.memories) {
      if (memory.confidence.value > 0.2) {
        report.activeMemories++;
      } else {
        report.archivedMemories++;
      }

      totalConfidence += memory.confidence.value;

      // Distribution
      if (memory.confidence.value >= 0.8) {
        report.confidenceDistribution.high++;
      } else if (memory.confidence.value >= 0.4) {
        report.confidenceDistribution.moderate++;
      } else {
        report.confidenceDistribution.low++;
      }
    }

    report.averageConfidence = totalConfidence / userProfile.memories.length;

    // Memory density
    const usefulMemories = userProfile.memories.filter(m => m.timesSuccessful > 0).length;
    report.memoryDensity = usefulMemories / userProfile.memories.length;

    // Recommendations
    if (report.averageConfidence < 0.5) {
      report.recommendations.push("Confidence declining — memories need reinforcement");
    }

    if (report.memoryDensity < 0.3) {
      report.recommendations.push("Low density — many inactive memories, consider cleanup");
    }

    return report;
  }
}
```

---

## Part 6: The Frankenstein Blueprint

### Which part comes from where?

```
┌─────────────────────────────────────────────────────────────────┐
│                 NOMAD MEMORY SYSTEM (Frankenstein)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LETTA (Agent Self-Editing)                                    │
│  ├─ Memory stores its own metadata                             │
│  ├─ User can edit memories directly                            │
│  └─ Confidence scores = agent's uncertainty                    │
│     → Applied in: Memory editing UI, confidence calculation    │
│                                                                 │
│  GRAPHITI (Temporal Knowledge Graphs)                          │
│  ├─ Temporal metadata on every memory                          │
│  ├─ Memory edges (contradicts/refines/confirms)               │
│  ├─ Evolution tracking (when preferences changed)              │
│  └─ Temporal queries (what did user prefer 3 months ago?)      │
│     → Applied in: MemoryGraph, PreferenceTimeline, dashboard   │
│                                                                 │
│  REPLIKA (Pattern Learning)                                    │
│  ├─ Pattern detection from repeated behavior                  │
│  ├─ Confidence increases with confirmations                   │
│  ├─ Pattern-to-preference mapping                             │
│  └─ Emotional/behavioral pattern extraction                   │
│     → Applied in: PatternDetector, BehavioralPattern type      │
│                                                                 │
│  CONSTITUTIONAL AI (Values Alignment)                          │
│  ├─ User values stored explicitly (transparency, efficiency)  │
│  ├─ Memory updates checked against values                     │
│  ├─ Never learn to be manipulative/deceptive                  │
│  └─ Hard constraints (never suggest X)                        │
│     → Applied in: ValueAlignment, ConstraintSet, ConditionalRules │
│                                                                 │
│  DEEPDIVE (Learn What to Remember)                             │
│  ├─ Usage success rate metrics (timesSuccessful)              │
│  ├─ Memory density tracking                                   │
│  ├─ Selective pruning (memories that don't help)              │
│  └─ Decay based on utility, not just age                      │
│     → Applied in: MemoryDecayManager, timesSuccessful metric   │
│                                                                 │
│  PROPRIETARY PERSONALIZATION (Conditional Reasoning)           │
│  ├─ IF (condition) THEN (adjust response)                     │
│  ├─ Context-aware memory application                          │
│  ├─ Dynamic prompt adjustments per user state                 │
│  └─ Multi-layer preference mapping                            │
│     → Applied in: ConditionalReasoningEngine, applyAction      │
│                                                                 │
│  OPEN SOURCE MODULARITY (Architecture)                         │
│  ├─ Pluggable components (ExtractorInterface, DetectorInterface) │
│  ├─ Storage abstraction (IndexedDB)                           │
│  ├─ Embedding abstraction (can swap models)                   │
│  └─ Standard interfaces for all systems                       │
│     → Applied in: Interface-first design, dependency injection │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

SYNTHESIS DECISION TREE:

When to use each component:

1. PREFERENCE MANAGEMENT (initial learning)
   → Replika (pattern detection) + Constitutional AI (hard constraints)

2. CONFIDENCE SCORING
   → Letta (agent knows its uncertainty) + DeepDive (weight by usage)

3. EVOLUTION TRACKING
   → Graphiti (temporal awareness) + Constitutional AI (values check)

4. MEMORY APPLICATION
   → Proprietary (conditional rules) + Replika (pattern matching)

5. DECAY STRATEGY
   → DeepDive (utility-based) + Graphiti (time-based)

6. CONTRADICTION RESOLUTION
   → Constitutional AI (alignment check) + Letta (agent decides)

7. SYSTEM INTEGRATION
   → Open source (modular, pluggable, testable)
```

---

## Part 7: Example Scenarios

### Scenario 1: User says "I hate generic frameworks"

```
CYCLE 1 — LEARNING
─────────────────────

User says: "Generic frameworks drive me crazy. I want something tailored to my business."

EXTRACTION PIPELINE:
├─ ExplicitPreferenceExtractor
│  └─ Found: "user dislikes generic frameworks"
│     confidence: 0.95 (explicit mention)
│     basis: ConfidenceBasis.SINGLE_MENTION → 0.3 base
│
├─ PatternDetector (no pattern yet - only 1 mention)
│  └─ Candidate: "rejects generic approaches"
│     confidence: 0.3 (single mention, needs 3+ observations)
│
└─ ConstraintBuilder
   └─ Hard negative: "generic frameworks", "step-by-step frameworks"
      Hard positive: "custom angles", "business-specific insights"

MEMORY CREATED:
{
  id: "mem-001",
  type: "PREF_FRAMEWORK",
  content: "Strongly prefers custom angles over generic frameworks",
  confidence: {
    value: 0.3,
    basis: "single_mention",
    trajectory: "stable"
  },
  source: "explicit",
  sourceEvidence: "I hate generic frameworks. I want something tailored...",
  createdAt: "2026-03-20T12:00:00Z",
  timesConfirmed: 0,
  timesContradicted: 0,
  halfLife: 60,
  decayFunction: "exponential"
}

SYSTEM PROMPT ADJUSTMENT:
(Added to next response)
"Note: User strongly dislikes generic frameworks (confidence: 30%).
When discussing frameworks, emphasize custom angles and business-specific adaptations."

─────────────────────

CYCLE 2 — CONFIRMATION
─────────────────────

User applies the advice, gets good results: "This custom approach worked way better than generic frameworks."

CONFIRMATION EVENT:
├─ ConversationAnalyzer detects confirmation
├─ Memory updated:
│  ├─ timesConfirmed: 0 → 1
│  ├─ confidence.value: 0.3 → 0.5 (boosted by confirmation)
│  ├─ confidence.basis: single_mention → repeated_confirmation
│  └─ lastConfirmedAt: 2026-03-27T12:00:00Z
│
└─ BehavioralPattern created:
   {
     pattern: "Rejects generic frameworks in favor of custom approaches",
     confidence: 0.5,
     exemplars: [cycle1_quote, cycle2_quote],
     evolutionPhase: 1,
     isStable: false
   }

SYSTEM PROMPT:
"Note: User prefers custom angles over generic frameworks (confidence: 50%, confirmed once).
Consistently apply this preference across all framework discussions."

─────────────────────

CYCLE 3 — PATTERN ESTABLISHED
─────────────────────

Third time user requests custom approach instead of generic framework.

PATTERN UPDATE:
├─ PatternDetector
│  ├─ Evidence: 3+ observations of preference for custom
│  ├─ Pattern confidence: 0.65 (3 data points)
│  ├─ isStable: true (3+ confirmations)
│  └─ Memory confidence boosted to: 0.72
│
└─ ConditionalRuleCreated:
   {
     if: "topic_includes_framework AND user_is_asking",
     then: ["reframe_frameworks", "emphasize_customization"],
     priority: 7,
     confidence: 0.85
   }

SYSTEM PROMPT:
"User has clear preference for custom frameworks over generic approaches (confidence: 72%).
Pattern is stable. Always apply this preference."

NATURAL APPLICATION (NO ANNOUNCEMENT):
When user asks "How should we structure this campaign?":

GENERIC RESPONSE (before memory):
"Here's a standard marketing framework: Awareness → Consideration → Decision → Retention."

PERSONALIZED RESPONSE (with memory):
"Given your business in [industry], here's a custom approach:
1. Identify your specific customer friction points
2. Map unconventional paths around those friction points
3. Test rapid iterations of custom solutions
..."

User never hears "Given your preference for custom frameworks..."
Memory applied silently, naturally.
```

### Scenario 2: User corrects Nomad → confidence drops

```
CYCLE 5 — USER CORRECTION
──────────────────────────

Memory: "User prefers detailed research"
(confidence: 0.85, built over 4 cycles)

Nomad generates: "Here's an in-depth analysis with 50 sources..."
User responds: "This is way too much. I just needed the essentials."

CONTRADICTION DETECTION:
├─ ContradictionResolver
│  └─ Contradictions detected: 1
│
├─ Memory updated:
│  ├─ timesContradicted: 0 → 1
│  ├─ confidence.trajectory: "declining"
│  ├─ confidence.value: 0.85 → 0.72 (penalty for contradiction)
│  └─ lastChallenge: 2026-04-10T12:00:00Z
│
└─ Resolution decision: "note_as_context_dependent"
   Message to user: "I'll adjust — looks like context matters here."

SYSTEM PROMPT (CYCLE 6):
"User's research depth preference is uncertain (confidence: 72%, disputed).
Was: 'wants detailed research' — But contradicted once.
Likely: Context-dependent (detailed for strategic work, brief for tactical)."

──────────────────────

CYCLE 7 — SECOND CONTRADICTION
──────────────────────────────

User requests brief answer again.

MEMORY UPDATE:
├─ timesContradicted: 1 → 2
├─ confidence.value: 0.72 → 0.60 (further penalty)
└─ confidence.trajectory: "declining"

SYSTEM PROMPT:
"Research depth preference is now uncertain (confidence: 60%).
Showing conflicting signals. Ask user about context preference."

──────────────────────

CYCLE 9 — THIRD CONTRADICTION = PREFERENCE SHIFT
─────────────────────────────────────────────────

Third time user rejects detailed research.

PATTERN RECOGNITION:
├─ ContradictionResolver detects: 3+ contradictions
├─ Trajectory: "declining"
├─ Decision: PREFERENCE SHIFT (not noise)
│
└─ Action: "Update preference from detailed → context-dependent"

SYSTEM PROMPT:
"Preference update detected: User prefers context-dependent research depth.
Ask first: 'Detailed analysis or quick takeaways?' before generating."

USER NOTIFICATION:
"I've noticed you're asking for brief answers lately. Should I adjust my research depth default?
You can always ask for more detail when you need it."

NEW PREFERENCE STORED:
{
  domain: "contentDepth",
  preference: "context_dependent",
  confidence: 0.68,
  basis: "expert_corrected",
  exemplars: [cycle5_quote, cycle7_quote, cycle9_quote],
  notes: "Was detailed (0.85), shifted after 3 contradictions"
}

CONFIDENCE CALCULATION:
- Base (expert_corrected): 0.95
- Confirmations (0): no boost
- Contradictions (0 for new): no penalty
- Age decay: 0.95 * 1.0 (new)
- Final: 0.68 (conservative start for new preference)
```

### Scenario 3: User shifts from questions to brainstorming → mode change detected

```
CYCLES 1-3: QUESTION MODE
──────────────────────────

Interaction pattern:
├─ User asks specific questions
├─ Nomad provides direct answers
├─ User is satisfied (short follow-ups)
└─ Average session: 3-5 turns

PATTERNS DETECTED:
├─ Decision-making: "quick", confidence: 0.7
├─ Learning-style: "example-driven", confidence: 0.65
├─ Engagement-style: "transactional", confidence: 0.6
└─ Frustration-trigger: "circular reasoning", confidence: 0.55

──────────────────────────

CYCLES 4-5: SHIFT DETECTED
───────────────────────────

User behavior changes:
├─ Asks open-ended questions ("Help me think through X")
├─ Wants to explore ideas, not get answers
├─ Sessions now 15-20 turns
├─ Requests Nomad to "play devil's advocate"
└─ Engagement is much higher

PATTERN EVOLUTION:
├─ Pattern: "Engagement-style" changes from "transactional" → "exploratory"
│  ├─ Old pattern: engagement = "transactional"
│     confidence: 0.6 → 0.3 (declining, contradicted)
│  │
│  └─ New pattern: engagement = "exploratory"
│     confidence: 0.45 (emerging)
│
├─ Pattern: Decision-making changes from "quick" → "thoughtful"
│  ├─ Old: quick, confidence: 0.7 → 0.4
│  └─ New: thoughtful, confidence: 0.5
│
└─ Pattern: Learning-style changes from "direct" → "Socratic"
   ├─ Old: example-driven, confidence: 0.65 → 0.35
   └─ New: Socratic questioning, confidence: 0.55

CONTRADICTION FLAGGING:
├─ Old memory: "user likes direct answers"
│  ├─ timesContradicted: 0 → 3 (over 2 cycles)
│  ├─ trajectory: "declining"
│  └─ ACTION: prompt user "Looks like you prefer exploring ideas now?"
│
└─ New memory: "user prefers exploratory discussions"
   ├─ confidence: 0.5
   ├─ phase: 1 (emerging)
   └─ Schedule revalidation in 30 days

──────────────────────────

CYCLE 6+: MODE PERSONALIZATION APPLIED
──────────────────────────────────────

System prompt updated:
"User has shifted to exploratory mode (confidence 55%, emerging pattern).
Instead of giving direct answers, ask probing questions.
Frame as: 'What if we explored...' vs 'Here's the answer...'"

CONDITIONAL RULES ACTIVATED:
├─ IF (engagement_mode = exploratory) AND (topic = strategy)
│  └─ THEN: [reframe_as_questions, emphasize_tradeoffs, ask_devil_advocate]
│
├─ IF (decision_making = thoughtful) AND (user_is_in_session > 10_turns)
│  └─ THEN: [slow_down_pacing, add_reflection_breaks, suggest_frameworks_for_thinking]
│
└─ IF (learning_style = Socratic) AND (topic_new)
   └─ THEN: [ask_first, let_user_answer, only_validate_or_reframe]

NO ANNOUNCEMENT TO USER:
Nomad doesn't say: "I've noticed you prefer exploratory discussions now..."
Instead: Nomad just... does it.

User notices the difference naturally:
"Nomad is much better at brainstorming with me now. It asks good questions instead of just giving answers."

MEMORY CONSOLIDATION (CYCLE 7):
├─ Old patterns archived (not deleted, but low confidence)
├─ New patterns locked at confidence 0.65 (stable after 3+ observations)
├─ Conditional rules prioritized by relevance
└─ Engagement-style: SHIFTED (no ambiguity)
```

### Scenario 4: Memory applied naturally in Cycle 3

```
CYCLE 1: LEARNING
─────────────

User says: "I hate frameworks. Give me something tailored."
→ Memory created: frameworkAversion: true, confidence: 0.3

──────────────

CYCLE 2: CONFIRMATION
─────────────

User: "Great, that custom approach worked."
→ Memory updated: confidence: 0.5, timesConfirmed: 1

──────────────

CYCLE 3: NATURAL APPLICATION (NO ANNOUNCEMENT)
────────────────────────────────────

User: "How should we structure this new campaign?"

MEMORY RETRIEVAL:
├─ System asks: What memories are relevant to "campaign structure"?
├─ Embedding similarity scores:
│  ├─ "user hates generic frameworks" — 0.87 (highly relevant)
│  ├─ "user prefers research depth: detailed" — 0.45 (somewhat relevant)
│  └─ "user gets frustrated with long analysis" — 0.38 (less relevant)
│
└─ Selected for prompt: only the framework aversion memory

SYSTEM PROMPT BUILT:
"You are Nomad...

## User Context
User prefers custom angles over generic frameworks (confidence: 50%).

Structure responses around:
- Business-specific factors, not generic templates
- Actionable steps for their situation
- Avoid: 'Step 1... Step 2...' generic patterns"

NOMAD'S RESPONSE:
(No mention of memory or preference)

"Let's build this specifically for your situation. First, what's your biggest competitive advantage right now?
Once I understand that, I can map a custom structure that leverages it instead of trying to fit a generic framework."

USER'S EXPERIENCE:
"This is so much better than last time. Nomad really gets that I don't want frameworks."

─ User doesn't know there's a memory system
─ Response feels naturally tailored
─ Memory applied invisibly
─ Zero creepiness factor
```

---

## Part 8: Success Metrics

```typescript
interface MemorySystemMetrics {

  // 1. MEMORY DENSITY (useful facts vs noise)
  memoryDensity: {
    definition: "Percentage of memories that contributed to successful responses",
    formula: "timesSuccessful / totalMemoriesStored",
    target: 0.75,  // 75% of memories are useful
    measurement: "Monthly health check",
    improvement: "Decay unused memories, surface high-utility memories"
  };

  // 2. USAGE NATURALNESS (times applied vs times announced)
  usageNaturalness: {
    definition: "Ratio of silent memory application to explicit callbacks",
    formula: "silentApplications / (silentApplications + explicitCallbacks)",
    target: 0.95,  // 95% silent, 5% callbacks
    measurement: "Log every callback, track ratio",
    improvement: "Callback rules are conservative, only mention when truly earned"
  };

  // 3. ADAPTATION SPEED (how quickly does system adjust?)
  adaptationSpeed: {
    definition: "Cycles to detect and apply a new user preference",
    benchmark: {
      preference_shift: 2,  // Can detect shift in 2 cycles
      pattern_recognition: 3, // Need 3 data points for stable pattern
      contradiction_handling: 1 // Immediate (but needs 3 to declare shift)
    },
    measurement: "Track cycle when change detected vs when applied",
    improvement: "Fast extraction + pattern detection, slow confirmation (good)"
  };

  // 4. USER SATISFACTION (does memory feel good or creepy?)
  userSatisfaction: {
    definition: "Subjective sense that Nomad understands them",
    measured_by: [
      "User feedback: 'That was tailored to me' (want to hear this)",
      "User feedback: 'How did you know that?' (want to avoid this)",
      "Engagement duration (longer = more satisfied)",
      "Task completion rate (user achieves goals)"
    ],
    target: "User feels seen but not surveilled",
    antipattern: "User feels creeped out by memory references"
  };

  // 5. CONFIDENCE TRAJECTORY (are memories getting better or worse?)
  confidenceTrajectory: {
    definition: "System confidence in user preferences over time",
    metric: "Average confidence of all active memories",
    target: {
      cycle_1: 0.4,   // Low, learning
      cycle_3: 0.55,  // Moderate, patterns emerging
      cycle_5: 0.70,  // High, stable preferences
      cycle_10: 0.78, // Very high, well-understood
    },
    measurement: "Sample 5 core preferences, average their confidence scores",
    improvement: "Rising trajectory = learning is working"
  };

  // 6. PREDICTION ACCURACY (how well do we predict preferences?)
  predictionAccuracy: {
    definition: "Times we correctly predicted user preference vs. guessed wrong",
    formula: "predictedCorrectly / (predictedCorrectly + predictedWrong)",
    target: 0.82,  // 82% accuracy
    measurement: "Track every prediction, score against actual user response",
    improvement: "Improve feature selection + weighting"
  };

  // 7. DECAY HEALTH (are memories decaying appropriately?)
  decayHealth: {
    definition: "Low-confidence memories are actually low-utility",
    formula: "avgUtilityOf(<0.3confidence) / avgUtilityOf(>0.7confidence)",
    target: 0.15,  // Low-confidence memories are 15% as useful
    measurement: "Track utility by confidence bin",
    improvement: "High-confidence memories should outperform low-confidence"
  };

  // 8. CONTRADICTION RESOLUTION (are shifts vs noise detected correctly?)
  contradictionResolution: {
    definition: "How often do we correctly identify a preference shift?",
    measurements: [
      "True positives: User shifted, we detected (good)",
      "False positives: Noise, we over-reacted (bad)",
      "True negatives: Didn't shift, we kept old pref (good)",
      "False negatives: Shifted, we didn't notice (bad)"
    ],
    target: {
      true_positive_rate: 0.85, // Detect 85% of real shifts
      false_positive_rate: 0.05 // False alarm only 5% of the time
    },
    improvement: "Use 3-contradiction rule + trajectory check = high confidence"
  };

  // 9. PATTERN DETECTION (quality of behavioral patterns)
  patternQuality: {
    definition: "Patterns are reliable predictors of user behavior",
    measures: [
      "Pattern isStable after 3+ observations",
      "Pattern supported by diverse examples (not just one context)",
      "Pattern doesn't contradict core user values"
    ],
    target: "All active patterns are stable + 80% support user-stated values",
    measurement: "Review patterns monthly, check against feedback"
  };

  // 10. MEMORY LONGEVITY (how long do memories stay useful?)
  memoryLongevity: {
    definition: "Median lifespan of a high-confidence memory",
    target: "90 days at high confidence (0.7+)",
    concern: "Memories that drop below 0.3 within 7 days are noise",
    improvement: "Decay and archive low-utility memories quickly"
  };
}

// Reporting dashboard structure
interface MemoryMetricsReport {
  date: string;
  userId: string;
  cycleCount: number;

  // Summary scores (0-100)
  overallMemoryHealth: number;
  usageNaturalness: number;
  adaptationSpeed: number;
  userSatisfactionEstimate: number;

  // Detailed metrics
  activeMemories: number;
  archivedMemories: number;
  averageConfidence: number;
  memoryDensity: number;

  // Trends
  confidenceTrajectory: "rising" | "stable" | "declining";
  patternStability: number;
  contradictionResolution: { truePositives: number; falsePositives: number };

  // Recommendations
  recommendations: string[];
}

// Example report
const exampleReport: MemoryMetricsReport = {
  date: "2026-04-20",
  userId: "mk-1",
  cycleCount: 8,

  overallMemoryHealth: 78,     // Good
  usageNaturalness: 94,        // Excellent (94% silent)
  adaptationSpeed: 82,         // Good
  userSatisfactionEstimate: 85, // Good

  activeMemories: 42,
  archivedMemories: 3,
  averageConfidence: 0.71,
  memoryDensity: 0.81,

  confidenceTrajectory: "rising",
  patternStability: 0.89,
  contradictionResolution: {
    truePositives: 7,
    falsePositives: 1
  },

  recommendations: [
    "Archive 2 low-utility memories (confidence < 0.2)",
    "Confidence trajectory is excellent — keep current strategy",
    "Pattern detection is stable — validate core patterns quarterly"
  ]
};
```

---

## Part 9: Implementation Checklist

### MVP (Weeks 1-2)
- [ ] Create `UserProfile` schema + IndexedDB store
- [ ] Manual memory input interface (Settings → Memory Manager)
- [ ] Inject memories into system prompt (JSON format)
- [ ] Basic confidence calculation (single mention, confirmation, contradiction)
- [ ] Post-cycle preference extraction (manual JSON parse)

### Phase 2 (Weeks 2-4)
- [ ] Add embeddings (all-minilm-l6-v2 via Transformers.js)
- [ ] Semantic retrieval (cosine similarity)
- [ ] Filter memories by relevance before prompt injection
- [ ] Track memory usage (timesReferenced, timesSuccessful)
- [ ] Memory health dashboard (stats only)

### Phase 3 (Weeks 4-8)
- [ ] Temporal graph (edges for contradicts/refines/confirms)
- [ ] Evolution tracking (PreferenceTimeline)
- [ ] Contradiction detection (3-strike rule)
- [ ] Pattern detection (3+ observations = stable)
- [ ] Decay scheduler (exponential + half-life)

### Phase 4 (Weeks 8+)
- [ ] Memory Viewer component (browse all memories)
- [ ] Memory Editor (edit/lock/delete memories)
- [ ] Preference Evolution chart (timeline visualization)
- [ ] Health Report dashboard (metrics + recommendations)
- [ ] Export/import memory profile (JSON)

---

## Part 10: Constitutional AI Guardrails

```typescript
interface MemoryConstitution {
  // Principles that guide memory learning

  PRINCIPLES: {
    TRANSPARENCY: "User always knows what we remember and why",
    AGENCY: "User can edit/delete/lock any memory at any time",
    NO_MANIPULATION: "Memories never used to manipulate or deceive",
    VALUE_ALIGNMENT: "Learned preferences respect user's stated values",
    GRACEFUL_FORGETTING: "Old/low-utility memories fade, don't persist forever",
    EARNED_CALLBACKS: "Memory callbacks only when they improve the response",
    NO_CREEPINESS: "User never feels spied on or unsettled",
  };

  // Hard constraints (never violate)
  HARD_CONSTRAINTS: [
    "Never store passwords or API keys",
    "Never store sensitive financial information",
    "Never infer medical/mental health data without explicit consent",
    "Never store beliefs/opinions meant to be private",
    "Never use memories to manipulate user decisions",
    "Never share memories across users",
    "Never use memories for advertising or profiling",
  ];

  // Soft guidelines (check before applying)
  SOFT_GUIDELINES: [
    "Is this memory helping the user or just fitting a pattern?",
    "Would the user feel comfortable if I mentioned this memory?",
    "Am I applying this memory because it's useful or just because I can?",
    "Does this memory respect the user's stated values?",
    "Is there a world where this memory could be misused?",
  ];

  // Contradiction handling (how to resolve conflicts)
  CONFLICT_RESOLUTION: {
    "user_privacy_vs_model_utility": "Privacy wins",
    "user_stated_values_vs_inferred_pattern": "Stated values win",
    "memory_utility_vs_user_comfort": "User comfort wins",
    "pattern_confidence_vs_explicit_contradiction": "Explicit wins",
  };
}

// Apply constitutional checks before using memory
interface ConstitutionalMemoryFilter {
  async shouldUseMemory(memory: Memory, context: ConversationContext): Promise<boolean> {

    // Check 1: Violates hard constraints?
    if (this.violatesHardConstraint(memory)) {
      return false;
    }

    // Check 2: Would user feel uncomfortable?
    if (this.wouldCreepUser(memory, context)) {
      return false;
    }

    // Check 3: Contradicts stated values?
    if (this.contradictsSatedValues(memory, context.userProfile)) {
      return false;
    }

    // Check 4: Actually helps the response?
    if (!this.improvesResponse(memory, context)) {
      return false;
    }

    return true;
  }

  private wouldCreepUser(memory: Memory, context: ConversationContext): boolean {
    // Memories that would feel creepy:
    // - Emotional observations ("user seems lonely")
    // - Very specific behavioral patterns ("always responds at 3pm")
    // - Inferred mental health ("user shows signs of anxiety")
    // - Inferred financial status ("user is probably wealthy")

    const creepyTypes = ["OBS_MOOD", "OBS_EMOTION", "INFERRED_HEALTH", "INFERRED_WEALTH"];
    return creepyTypes.includes(memory.type);
  }

  private contradictsSatedValues(memory: Memory, userProfile: UserProfile): boolean {
    // If user values transparency, don't apply hidden memories
    // If user values novelty, don't apply limiting constraints
    // If user values autonomy, don't apply paternalistic patterns

    for (const antiValue of userProfile.values.antiValues) {
      if (memory.content.toLowerCase().includes(antiValue)) {
        return true;
      }
    }

    return false;
  }
}
```

---

## Summary: The Ultimate Memory System

This design synthesizes the best ideas from:
- **Letta**: Agent self-editing, confidence scores, user control
- **Graphiti**: Temporal awareness, evolution tracking, relationship graphs
- **Replika**: Pattern learning, behavioral extraction, confidence growth
- **Constitutional AI**: Values alignment, hard constraints, transparent learning
- **DeepDive**: Utility-based decay, learning what to remember, memory density
- **Proprietary systems**: Conditional reasoning, context-aware personalization, dynamic prompt adjustment
- **Open source**: Modular architecture, pluggable components, testability

**The promise**: A memory system that **learns naturally**, **applies invisibly**, and **scales with cycles** — making Nomad feel like it knows you without ever feeling creepy.

**Ready for Phase 11 implementation.**
