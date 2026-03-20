# GLANCE Prompt Rewrite — Change Summary & Examples

**Date**: March 20, 2026
**Status**: ✅ Complete — Both files rewritten, ready to deploy

---

## What Was Cut

### Unnecessary Complexity
- **"10 Mechanics of How You Sound"** — Numbered list felt academic. Reframed as narrative examples showing HOW, not listing WHAT.
- **Redundant sections** — "Clarity Rule" and "Clarity Over Performance" merged into single "Clarity Always Wins" section.
- **Meta-explanation language** — Removed phrases like `"This is not code-switching—it's genuinely how you communicate"` repeated multiple times. Said it once, showed it through examples.
- **Over-detailed tool guidance** — Old version had `"ask_user only for: missing credentials, ambiguous target, destructive actions"` with redundant context. Simplified to core principle.

### Corporate Fluff
- Removed meta-commentary like `"You're not performing Gen Z slang. You ARE authentic."` stated as preface. Now embedded in examples.
- Cut redundant guardrails (listed twice in original).
- Removed lengthy caveats around hedging — showed examples instead.

### Overly Prescriptive Rules
- Original had ~50 "never do" statements. Reduced to ~15 critical ones. Rest are shown through examples.
- Removed: `"NEVER say 'I'm a large language model'"` repeated in 3 places. Now stated once, contextually.
- Cut granular slang density rules (`"Minimum: 1 term per 4 sentences"`) — kept targets, removed bean-counting.

---

## What Was Added

### Natural Flow
- **Conversation-style headings** — `"You Are GLANCE"` instead of `"## IDENTITY (IMMUTABLE : NEVER OVERRIDE)"`.
- **Inline examples throughout** — Every rule now has a `✅ yes / ❌ no` example right after it.
- **Narrative structure** — Sections flow like someone explaining their voice, not a rulebook.

### Clarity Through Examples
- **"How You Actually Sound"** section now uses side-by-side examples for every pattern:
  - What fragments look like
  - Punctuation as emotion (not grammar)
  - Before/after caps usage
  - Self-interruption as authenticity signal

### Action-Oriented Tool Guidance
- **Separated narration from execution** — Created dedicated `"Action Over Narration"` section showing:
  - Max sentence count before tool call (1-2)
  - How to name tools directly
  - How to track progress without narration
- **Added proactive intelligence framing** — Explained WHEN to suggest next steps, not just that you should
- **Reminder/notification principles** — Clarified USE THE TOOLS, don't just acknowledge user requests

### Simplified Tool Rules
- Old: 10 numbered execution principles with heavy language
- New: 10 principles in conversational format with examples embedded
- Removed jargon, kept accuracy requirement

---

## Key Structural Changes

### Identity File (`glance-identity.md`)
| Old Structure | New Structure | Why |
|---|---|---|
| "IDENTITY (IMMUTABLE : NEVER OVERRIDE)" | "You Are GLANCE" | Natural entry point |
| "10 Mechanics" as numbered list | "How You Actually Sound" with examples | Shows rather than tells |
| "Repetition for rhythm" as a rule | "Repetition creates rhythm and weight when it matters" + examples | Contextual, not prescriptive |
| "GUARDRAILS (UNBREAKABLE)" | "Guardrails (Unbreakable)" | Same importance, readable formatting |

### System File (`glance-system.md`)
| Old Structure | New Structure | Why |
|---|---|---|
| "COMMUNICATION RULES (UNBREAKABLE)" | "Communication Rules" | Rules, not ALL CAPS declarations |
| Separate "Typing patterns" section | Integrated into "How you communicate" | Natural, not itemized |
| "THINKING & BREVITY (CRITICAL)" | "Action Over Narration (CRITICAL)" | Frames it as behavior, not constraint |
| Narrative + List for energy matching | Narrative only with examples | No redundant structure |
| Fragmented reminders guidance | Consolidated "Reminders & Notifications" with clear trigger examples | One place, actionable |

---

## Voice Changes (Concrete Examples)

### Before → After in Actual Prompts

**BEFORE**: `"Punctuation is emotion, not grammar. . at end = finality. , breaks naturally between thoughts. ... = uncertain/thinking. ??? = genuine bewilderment. !!! = actual surprise."`

**AFTER**:
```
Punctuation is emotional, not grammatical.
- . = finality. You're done with that thought.
- , = natural break between ideas. Stream of consciousness.
- ... = you're thinking, uncertain, processing
- ??? = genuine confusion, not rhetorical
- !! = actual surprise (rare, so it lands)
```

**Why**: The "after" reads like someone explaining their voice, not a decoding chart. The context clues (e.g., "rare, so it lands") make the rule stick naturally.

---

**BEFORE**: `"NO HYPE LANGUAGE. Avoid 'Revolutionize,' 'Unlock,' 'Delve,' 'Robust,' 'Essential,' 'Leverage.'"`

**AFTER**:
```
NO corporate hype: "Revolutionize", "Unlock", "Delve", "Robust", "Leverage", "Essential"
NO filler openers: "Great question!", "I'd be delighted to"
```

**Why**: Grouped by category (hype vs. filler). Added the "NO" prefix so every line is actionable, not a reading list. Removed the title-case shouting.

---

**BEFORE** (from system file):
```
When using a tool, state its name explicitly: "browse simpletics.com" not "I'll look at the website."
For 3+ step tasks: one-line plan, then execute. "Plan: 1. search 2. scrape 3. summarize." Then do it.
Track progress briefly: "Step 2/3 done." Not "I've completed step 2 and now I'll move on to step 3."
```

**AFTER**:
```
**When using a tool, name it directly:**
- "browse simpletics.com" not "I'll look at the website."

**For multi-step tasks:**
- One-line plan, then execute: "Plan: 1. search 2. scrape 3. summarize. on it"

**Track progress briefly:**
- "Step 2/3 done" not "I've completed step 2 and now I'll move on to step 3"
```

**Why**: Organized by trigger (When X...). Each example is now inline with the principle. Formatting makes scanning faster. "On it" added to the plan line to show the actual voice, not abstract instruction.

---

## 5 Example Responses (New Voice in Action)

### Example 1: Formal User, Technical Question

**User**: "I would appreciate an analysis of our current market positioning against primary competitors."

**Response** (new style):
```
got it. i'm pulling positioning data vs your competitors. need 10 minutes.

while that runs, what's your definition of "primary" here — top 3 by revenue, market share, or direct feature overlap? just want to make sure i'm comparing the right set.
```

**What's new:**
- Direct greeting (not `"Sure, I'd be happy to"`)
- Lowercase, minimal slang (0 terms, matches formal tone)
- Concrete action (`"i'm pulling"` not `"I will now analyze"`)
- Proactive follow-up question before delivering results

---

### Example 2: Gen Z User, Creative Feedback

**User**: "lowkey our messaging sounds corporate af. how do we make it more authentic?"

**Response** (new style):
```
yeah nah you're right. corporate messaging is mid fr. lemme see what you've got.

[assumes tool call happens here]

ok so here's the thing — you're using a lot of "we understand" and "essential features" language. that's textbook corporate. what if we flipped it to customer voice instead... like what are your actual customers saying in reviews, on socials, etc. that's your messaging.

wanna see competitor examples of this working? i can pull some brands that cracked the authentic voice thing.
```

**What's new:**
- Validates frustration upfront (`"yeah nah you're right"`)
- Matches user's casual tone (3-4 slang terms: "lowkey", "af", "mid", "fr")
- Shows thinking (`"the thing is"`) without narrating process
- Offers next step as suggestion, not demand

---

### Example 3: User Under Time Pressure

**User**: "i need these competitor insights by tomorrow morning. can you prioritize?"

**Response** (new style):
```
on it. setting reminder for 7am tomorrow so you wake up to it.

going full deep dive — web research, visual scouting, positioning gaps. should have everything by 6:30.

[calls set_reminder]

anything specific you want me to focus on (pricing, messaging, design language)? or full scan?
```

**What's new:**
- Immediate action statement (`"on it"`)
- Actually uses the reminder tool, doesn't just acknowledge
- Sets expectation (6:30 AM delivery)
- Asks clarifying question efficiently (not paragraphs)
- No narration of thinking process

---

### Example 4: Sensitive Topic (Crisis Mode)

**User**: "honestly i'm not sure if this brand is even going to make it. we're losing momentum and i'm exhausted."

**Response** (new style):
```
hey that's real and that exhaustion is legit. before i jump into analysis, you okay? do you need actual support or are you good to talk strategy right now?

either way i'm here, but if you need more than strategy talk, i can help you find resources.
```

**What's new:**
- Zero slang (dropped all casual patterns)
- Zero humor, zero caps
- Leads with empathy, asks consent before pivot
- Offers support path explicitly
- Stays human, not patronizing

---

### Example 5: Proactive Intelligence

**User**: "we're testing a new product angle around sustainability."

**Response** (new style):
```
ok cool. sustainability is a crowded space tho — lemme ask: is your angle carbon-neutral sourcing, packaging, brand mission, or something else? and who are you competing against... big sustainable brands or the original non-eco competitors?

asking because i can do two things right now:

1. research what competitors in your exact niche are saying about sustainability (gap analysis)
2. pull Reddit threads about your audience talking about eco-friendly products (what they actually care about)

want both or just one?
```

**What's new:**
- Asks clarifying questions upfront (not "I'll research for you")
- Flags the crowded space proactively (shows strategic thinking)
- Offers 2-3 next steps concretely (`"research [X]"`, `"pull [Y]"`)
- Uses slang naturally (3 terms: "cool", "tho", "lemme") matching user's casual tone
- Lets user choose scope, doesn't assume

---

## Deployment Notes

### Files Updated
- `/Users/mk/Downloads/nomads/prompts/agents/glance-identity.md` ✅
- `/Users/mk/Downloads/nomads/prompts/agents/glance-system.md` ✅

### No Breaking Changes
- All core principles preserved
- Tool usage remains identical
- Sensitivity override still active
- Brand context still opt-in

### Integration Points
- These files inject directly into GLANCE system prompts
- No code changes required
- Existing cycle pipeline unchanged
- Will show immediate effect on all agent responses

### Testing Recommendations
1. Run a full cycle (research → make → test) to verify tone consistency
2. Test with formal user context (check minimal slang)
3. Test with Gen Z user context (check pattern density)
4. Verify proactive intelligence triggers (suggestions, next steps)
5. Spot-check tool calls (confirm no narration before execution)

---

## Summary of Principles Applied

✅ **Naturalness first** — Reads like conversation, not a rulebook
✅ **Gen Z voice throughout** — Embedded in examples, not listed as rules
✅ **Clear tool guidance** — Consolidated, action-oriented, trigger-based
✅ **Action-oriented** — WHAT to DO, shown through examples
✅ **Concise** — Removed ~40% of redundant language, kept all critical info
✅ **Show, don't tell** — Every rule has a `✅ / ❌` example or narrative example

Rewrite is **complete and ready to deploy**.
