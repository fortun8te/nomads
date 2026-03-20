# Memory and Learning in AI Systems: Research & Patterns

**Research Date:** March 2026
**Purpose:** Understanding how sophisticated AI systems build persistent user models naturally, what technical patterns enable this, and how to implement for Nomad (Ad Agent)

---

## Executive Summary

The most natural-feeling memory systems follow three principles:
1. **Observe, don't interrogate** — Extract patterns from behavior, not from explicit "remember this" prompts
2. **Integrate implicitly** — Reference learned knowledge as background context, not as "I remember you said..."
3. **Update continuously** — Treat memory as a probabilistic model that drifts, not a static fact database

Best-in-class systems use **tiered memory architecture** (fast working memory + slow semantic storage), **vector embeddings for retrieval**, and **automatic compression** to prevent token bloat. They also implement **memory decay** and **contradiction detection** to handle preference changes.

---

## 1. Products & Projects Doing Memory Well

### 1.1 MemGPT (Now Letta) — Operating System for Memories
**GitHub:** [letta-ai/letta](https://github.com/letta-ai/letta)
**Philosophy:** Virtual context management — inspired by how OS hierarchical memory manages RAM vs disk.

**How it works:**
- **Two-tier architecture:**
  - **Core Memory (in-context)**: Structured editable blocks (user preferences, project status) always in the context window, formatted as XML-like sections
  - **Archival Storage (out-of-context)**: Vector-indexed semantic passages in external DB, retrieved only when needed
- **Self-managing agent**: The agent actively edits its own memory via function calls, deciding what to compress, summarize, or archive
- **Memory pressure**: When token usage hits threshold (e.g., 70% capacity), system inserts internal alert → agent reviews working memory → summarizes low-criticality items → writes to archive
- **Natural integration**: Knowledge appears in the system prompt as context, not as retrieved facts

**Why it feels natural:**
The memory is already *in context* for in-context knowledge, so no awkward "let me check my notes" moment. It's just part of the background.

---

### 1.2 Mem0 — Universal Memory Layer for AI Agents
**GitHub:** [mem0ai/mem0](https://github.com/mem0ai/mem0)
**Philosophy:** Compress conversation history into optimized memory representations; prevent token bloat while preserving context.

**How it works:**
- **Compression engine**: Reduces chat history to highly optimized memory representations
- **Multi-platform support**: Works with OpenAI, LangGraph, CrewAI, etc. via standardized API
- **Browser extension**: Stores memories across ChatGPT, Perplexity, Claude — creates cross-platform user model
- **Smart retrieval**: Uses embeddings for semantic recall, prioritizes relevant context
- **Integration agnostic**: Sits between LLM and application, learns incrementally

**Key insight:**
Memory is stored *outside* the LLM, reducing token overhead by 40% while enabling long-term learning. Updates happen async; retrieval is semantic (find similar topics, not exact matches).

---

### 1.3 Character.AI — Remembering "What Matters Most"
**Blog:** ["Helping Characters Remember What Matters Most"](https://blog.character.ai/helping-characters-remember-what-matters-most/)

**Memory types:**
- **Chat memories**: Short user-provided notes ("I like detailed worldbuilding", "I'm working on a novel")
- **Pinned memories**: User-highlighted critical facts
- **Auto-memories** (C.AI+ only): System learns and stores key user preferences automatically

**What Character.AI learned:**
- **Be specific**: Generic memories ("user is creative") are useless. Specific beats abstract ("user prefers 20-minute character arcs over 5-minute twists")
- **Compartmentalization**: Tie memories to unique speaker profiles to keep interactions private
- **Keep it short**: Long memories get ignored; one-liners with context work best
- **User preference patterns matter**: Communication style, topic interests, goals are more predictive than isolated facts

**Why it works:**
Users explicitly write memories (intentional), but the system also learns implicitly from what they ask about repeatedly. Dual approach.

---

### 1.4 Replika — Learning Tone and Personality Over Time
**Research:** GitHub [lukalabs/replika-research](https://github.com/lukalabs/replika-research)

**Learning approach:**
- Builds memory over long conversations, not one-shot interactions
- Learns **tone preferences** (user's communication style) not just facts
- Learns **emotional patterns** (what makes user happy, frustrated, engaged)
- Learns **interaction preferences** (how much detail, when to ask questions vs inform)

**Key limitation acknowledged:**
Replika users note the system sometimes forgets established preferences ("memory problems"). This suggests:
- Not all memories are equally stable
- Some preferences are temporary/contextual
- Need for **memory validation** and **forgetting policy**

**Insight for Nomad:**
Even sophisticated systems struggle with:
- Detecting when a memory is stale (user changed preferences)
- Distinguishing signal from noise (was that one request a preference shift or an exception?)
- Avoiding repetition without being creepy ("you always prefer X" said every conversation)

---

### 1.5 PersonaMem-v2 — Benchmarking Implicit Personalization
**GitHub:** [bowen-upenn/PersonaMem-v2](https://github.com/bowen-upenn/PersonaMem-v2)
**Paper:** "Towards Personalized Intelligence via Learning Implicit User Personas"

**What makes this relevant:**
This is the state-of-the-art benchmark for *implicit* personalization (learning from behavior, not explicit statements). Dataset covers:
- 1,000 comprehensive user personas
- 20,000+ preferences
- 300+ conversation scenarios
- Long-context interactions (not single-turn)

**Key findings:**
- **Frontier LLMs struggle**: GPT-5, Claude 3.5 achieve only 37–48% accuracy on implicit personalization
- **The bottleneck is reasoning**: Long context windows help, but inferring unstated preferences requires deep reasoning
- **Agentic memory wins**: Specialized memory frameworks + reinforcement fine-tuning achieve 55% accuracy while using **16x fewer tokens**

**What this means:**
- General LLMs can't do natural personalization; you need a specialized memory system
- The system must *infer* preferences from patterns, not wait for explicit statements
- Trade-off: more inference (more compute) vs more tokens in context (simpler but expensive)

---

### 1.6 Memoria — Scalable Agentic Memory Framework
**Paper:** [arxiv.org/abs/2512.12686](https://arxiv.org/abs/2512.12686)

**Architecture:**
- **Dynamic session-level summarization**: Real-time compression of current conversation into key facts
- **Weighted knowledge graph**: User model stored as nodes (traits/preferences) and edges (relationships/patterns)
- **Incremental updates**: Continuously refine the graph as new evidence arrives

**Philosophy:**
Memory should be *structured*, not just a list of facts. Relationships matter ("user prefers X when Y is true" not just "user prefers X").

**Why it's sophisticated:**
- Captures **contextual variance** (preferences that depend on context)
- Detects **stability vs drift** (which preferences are reliable vs changing)
- Stores **conditional preferences** (if-then rules learned from behavior)

---

### 1.7 LangChain Memory & LangMem SDK
**Docs:** [docs.langchain.com/oss/python/langchain/long-term-memory](https://docs.langchain.com/oss/python/langchain/long-term-memory)
**New SDK:** [langchain blog — LangMem SDK launch](https://blog.langchain.com/langmem-sdk-launch/)

**Memory types in LangChain:**
- **Short-term**: Current conversation context (volatile, full fidelity)
- **Long-term**: Semantic passages stored in vector DB (persistent, indexed, retrievable)
- **Summary memory**: Compressed facts extracted from conversations

**LangMem SDK (latest):**
- Automatically extracts facts, preferences, and behavioral patterns from conversations
- Optimizes agent behavior through memory-informed prompt updates
- Enables agents to learn and improve over time through trial-and-error feedback loops

**Storage backends:**
- PostgreSQL for structured ACID compliance
- Redis for low-latency caching
- Vector DBs (FAISS, Pinecone, etc.) for semantic search
- InMemory for dev/testing

**Key insight:**
LangChain treats memory as a *retrieval problem*: given current context, what past experiences are most relevant? This is fundamentally different from "storing everything."

---

## 2. Philosophy: What Makes Memory Feel Natural vs Creepy

### The Creepy Factor
Memory feels **invasive** when:
- System repeatedly calls attention to what it knows ("I remember you told me...")
- Memories feel random or disconnected ("why does this bot suddenly know I like vanilla coffee?")
- Preferences conflict without explanation ("last week you said X, now I'm treating you as Y-preferer")
- User has no control or visibility into what's remembered
- System treats all memories equally (never forgets anything)

### The Natural Factor
Memory feels **organic** when:
- It's **background context**: Pre-loaded into the system prompt, not retrieved on-the-fly
- It **informs without announcing**: Preferred style is used naturally, not commented on
- It **updates gracefully**: Preference changes are detected and integrated without fanfare
- It **respects boundaries**: Only remembers what's relevant to the relationship
- It **forgets selectively**: Knows when information is stale

### Design Principle: The "Grandpa Heuristic"
A good conversational memory system works like a grandpa who:
- **Listens carefully** but doesn't take notes
- **Remembers patterns**: "You always order your coffee a certain way" not "You said X in conversation 47"
- **Brings it up naturally**: Uses the knowledge to make better guesses, not to prove he remembers
- **Gets it wrong sometimes**: "Do you still hate cilantro?" (he doesn't check his notes, he guesses)
- **Updates when corrected**: "Oh, you like it now? Good to know!"
- **Forgets small stuff**: Doesn't remember every single thing said, just the important patterns

---

## 3. Technical Patterns: How to Build Memory Systems

### 3.1 Architecture: Two-Tier Memory
(Inspired by MemGPT and Letta)

```
┌─────────────────────────────────────┐
│  WORKING MEMORY (In-Context)        │
│  • Structured blocks (XML-like)      │
│  • User preferences this session     │
│  • Current task/goal                 │
│  • Recent conversation history       │
│  • Always visible, no retrieval cost │
└─────────────────────────────────────┘
            ↓
   [Memory Pressure Check]
   [At 70% capacity, summarize & archive]
            ↓
┌─────────────────────────────────────┐
│  ARCHIVAL MEMORY (Vector Store)     │
│  • Compressed facts (embeddings)    │
│  • Historical preferences           │
│  • Semantic passages                │
│  • Retrieved only when needed       │
│  • Enables long-term learning      │
└─────────────────────────────────────┘
```

**Implementation:**
- In-context blocks: simple string replacement (prepend to system prompt)
- Archival: embeddings + vector DB (Pinecone, FAISS, Weaviate, etc.)
- Migration: when token count hits threshold, LLM summarizes → stores as vector passage → removes from context

### 3.2 What to Remember: Preference Extraction

From PersonaMem-v2 and Memoria research, prioritize:

| Category | Example | How to Extract | Update Frequency |
|----------|---------|----------------|------------------|
| **Communication Style** | Prefers bullet points over prose | Count format preference across conversations | Per-session |
| **Value Signals** | Cares about cost-effectiveness | Extract from repeated concerns | Weekly |
| **Interaction Preference** | Wants reasoning before recommendations | Track what prompts best engagement | Per-session |
| **Domain Knowledge** | Familiar with marketing, not design | Infer from terminology/questions | Monthly |
| **Emotional Triggers** | Gets frustrated by generic answers | Track reaction patterns | Per-session |
| **Conditional Preferences** | Likes visual brainstorm, but text summaries | Store as "if X then prefer Y" | As discovered |
| **Meta-preferences** | Wants to learn vs get answers | Observable from question types | Monthly |

**Don't remember:**
- One-off statements ("I had pizza for lunch yesterday")
- Contextual exceptions ("I'm tired today, make it short")
- Contradictory data without investigation

### 3.3 Extraction & Update Logic

**When to update memory:**
1. **After each session**: Mine conversation for preference signals
2. **Weekly**: Aggregate patterns, detect drift
3. **On contradiction**: If new behavior conflicts with stored preference, flag for human validation (or increase uncertainty)

**Extraction method (LLM-based):**
```
For each conversation:
  1. Run summary: "Extract 5 key learnings about this user"
  2. Run classification: "Does this reinforce or contradict existing memory?"
  3. Run reconciliation: "If contradiction, why? Preference change or noise?"
  4. Store: embedding + metadata (confidence, date, source)
```

**Retrieval method (vector search):**
```
Given current context:
  1. Embed user's current request
  2. Semantic search archival memory (top 5 relevant passages)
  3. Merge with working memory blocks
  4. Inject into system prompt as context
```

### 3.4 Memory Decay & Forgetting

**The problem:** Infinite memory = outdated preferences dominate

**Solution:** Weighted recency + confidence decay
```
memory_relevance = recency_weight * confidence_decay * semantic_similarity

recency_weight = 2^(-(days_old / half_life))
  where half_life = 30 days (tune per use case)

confidence_decay = confidence_score * (1 - decay_per_month)
  where decay_per_month = 0.05 (5% confidence loss per month)
```

**When to delete:**
- Confidence score falls below 0.1 (very uncertain)
- Explicitly contradicted 3+ times by recent behavior
- Older than 1 year AND not reinforced in last 6 months

### 3.5 Contradiction Detection

**When new evidence conflicts with stored memory:**

```
if semantic_similarity(new_signal, stored_memory) > 0.7
   and contradicts(new_signal, stored_memory):

     # Option A: Increase uncertainty
     confidence *= 0.5

     # Option B: Create conditional variant
     add_variant("prefers X when Y=true", confidence=0.3)

     # Option C: Flag for review (human-in-the-loop)
     log("User changed preference", priority="medium")
```

**Example:**
- Session 1: User asks for detailed explanations → store "prefers depth"
- Session 2: User asks "keep it brief" → contradiction
- Response: Reduce confidence of "prefers depth", store "conditional preference" (depth depends on time/task), OR flag as preference drift

---

## 4. Frequency & Timing: When to Surface Memory

### Avoid Over-Referencing
**Bad:**
```
User: "Can you help me brainstorm?"
Bot: "I remember you prefer visual brainstorms, so I'll create a mood board..."
```
(Too explicit, breaks immersion)

**Good:**
```
User: "Can you help me brainstorm?"
Bot: [System prompt includes: "User prefers visual ideation"]
[Bot naturally outputs sketches + descriptive text without mentioning memory]
```

### When to Explicitly Reference Memory
Only when:
1. **Clarifying a contradiction**: "Last time you preferred X, but now you're asking for Y — did that change?"
2. **Asking permission to use knowledge**: "Based on past projects, I'm thinking of [approach] — does that fit?"
3. **Updating memory**: "Should I remember you prefer [X] going forward?"

### Frequency Rule
- **First 3 sessions**: Build memory, don't reference it (user is being observed)
- **Sessions 4+**: Use memory implicitly (no mention)
- **Reference explicitly**: Only 1-2 times per session max (less is more)

---

## 5. Detecting Preference Changes

### Signals to Watch
| Signal | Confidence | Action |
|--------|-----------|--------|
| Single contradiction | Low (0.2) | Log, but don't change memory |
| 3+ contradictions in 1 month | Medium (0.5) | Flag for review, reduce old memory confidence |
| User explicitly says "I changed my mind" | High (0.9) | Update immediately, reset confidence |
| Temporal shift (e.g., always prefers X in morning, Y at night) | Medium (0.6) | Store as conditional preference |
| Gradual drift (old preference slowly loses votes) | Medium (0.5) | Decay old memory, boost new variant |

### Implementation
```
for each_session:
  extract_preferences()

  for each_preference:
    if contradicts(preference, stored_memory):
      contradiction_count += 1
      last_contradiction = today
    else:
      contradiction_count = max(0, contradiction_count - 1)

  if contradiction_count >= 3:
    flag_for_review()
    stored_memory.confidence *= 0.8

  if days_since_last_contradiction > 60:
    # Preference change is stable, adopt it
    stored_memory = new_preference
```

---

## 6. The "Non-Creepy" Constraint

### Technical Rules
1. **Never surprise the user**: Memory should feel like a natural extension of conversation, not surveillance
2. **Always have an off switch**: Users should be able to disable memory or request deletion
3. **Make it visible**: Let users see what's stored (audit trail + transparency)
4. **Bound the memory**: Don't remember everything (selective memory is more human-like)
5. **Don't use memory to manipulate**: Remember preferences to serve better, not to exploit

### Transparency Features
- Show what's being remembered: "I'll remember: you prefer bullet points"
- Show when memory is used: "Based on your past preferences, I'm using X approach"
- Let users correct: "Did I get that right? Should I update my memory?"
- Allow export/deletion: "Here's everything I remember about you. Delete anything you want."

---

## 7. Recommended Approach for Nomad (Ad Agent)

### Phase 1: Working Memory (Immediate)
Store in-session preferences as **structured blocks** in system prompt:

```json
{
  "user_profile": {
    "brand_voice": "conversational, not corporate",
    "audience_depth_preference": "detailed with personas",
    "visual_preference": "mood boards over wireframes",
    "output_format": "markdown with sections",
    "communication_style": "direct, minimal fluff"
  },
  "session_context": {
    "current_brand": "Nomad project",
    "research_depth": "Extended (90 min)",
    "previous_cycles": 2,
    "known_objections": ["price sensitivity", "sustainability"]
  }
}
```

**Update timing:** Per session (clear at end, reinitialize from archival memory)

### Phase 2: Archival Memory (Learning)
After each cycle, extract key learnings into **vector-indexed passages**:

```
Passages (stored as embeddings):
1. "User prefers persona-based audience research over demographic segmentation"
   - Confidence: 0.8
   - Last reinforced: 3/15/2026
   - Source: Cycles 1-3 (all requested personas)

2. "User values competitive differentiation over feature lists"
   - Confidence: 0.7
   - Last reinforced: 3/20/2026
   - Source: Taste stage (always picked "unique angle" variant)

3. "User gets frustrated with generic market positioning"
   - Confidence: 0.6
   - Last updated: 3/20/2026
   - Signal: Rejected 2 concepts as "too safe"
```

**Extraction:** Post-cycle LLM analysis ("What did we learn about this advertiser?")
**Retrieval:** At cycle start, embed research brief → search for relevant past learnings → prepend to system prompt

### Phase 3: Memory UI (For User Control)
Add a **Memory Panel** to Dashboard:

```
📚 What I Know About You
━━━━━━━━━━━━━━━━━━━━━
✓ Preferences (7 stored)
  • Persona-based research
  • Competitive differentiation
  • Minimalist copy

⚠️ Uncertain (2 stored)
  • Visual preference (need more data)

🔄 Recent changes (0)
  • Last updated: 3/20/2026

[Edit] [Clear All] [Export]
```

**Features:**
- View, edit, delete individual memories
- See confidence scores ("Very confident" / "Learning")
- Audit trail (when, why each memory was added)
- Manual override (user can tell system to remember X)

### Phase 4: Update Logic (Continuous Learning)
**Per-cycle learning:**

```
Post-cycle pipeline:
  1. Extract 5-10 key learnings from cycle (what worked, what user responded to)
  2. Classify each learning (preference / objection / audience signal / creative direction)
  3. Search archival memory (does this reinforce or contradict stored memory?)
  4. Update memory:
     - Reinforce: increase confidence, update recency
     - Contradict: reduce old confidence, add conditional variant
     - New: add with confidence 0.5
  5. Decay old memories (monthly review of confidence scores)
```

### Phase 5: Avoid Over-Reference (Copy)
**Good system prompt injection:**

```
Based on past cycles, this user:
- Prefers audience insights over competitor analysis (confidence: 0.9)
- Responds best to persona-specific messaging (confidence: 0.8)
- Gets frustrated with generic market positioning (confidence: 0.6)

Use these patterns implicitly in:
- Research prioritization (focus on audience over competitors)
- Taste recommendations (persona-first creative direction)
- Objection handling (specific customer concerns, not market truisms)

Never say "I remember..." or "Based on your memory..." — just incorporate naturally.
```

**Bad approach:**
```
Bot: "I remember you prefer personas, so I researched personas this time."
(Too meta, breaks flow)
```

**Good approach:**
```
Bot: "I found 5 distinct audience segments with these motivations: [rich persona data]"
(Implicitly using what was learned)
```

### Memory Decay Schedule for Nomad
- **Stable preferences** (voice, format, research depth): 6-month decay
- **Tactical preferences** (current brand positioning): 3-month decay (brand context changes)
- **Uncertain signals** (hypotheses about audience): 1-month decay (needs reinforcement)
- **Contradictions**: Decay old memory 50% on first conflict, delete after 3 conflicts in 2 weeks

---

## 8. Known Challenges & How to Handle Them

### Challenge 1: Preference Drift vs Noise
**Problem:** Did user change mind, or was that one request an exception?

**Solution:**
- Require 3 contradictions before updating (noise filtering)
- Track contradiction dates (clustering suggests drift vs random)
- Store conditional variants ("prefers X when Y") until pattern stabilizes
- After 1 month of consistent new behavior, flip preference

### Challenge 2: Memory Bloat
**Problem:** Storing everything grows the archival DB forever.

**Solution:**
- Monthly cleanup (delete low-confidence old memories)
- Compression (merge similar memories: "prefers X" + "dislikes Y" → "values simplicity")
- Summarization (extract "user is brand-conscious" from 10 specific preferences)
- Limit working memory to top 10 preferences per session

### Challenge 3: Cross-Cycle Continuity
**Problem:** Memory learned in Cycle 1 isn't available in Cycle 2.

**Solution:**
- Embed research brief at cycle start
- Retrieve top 5 relevant memories from archive
- Inject into system prompt as part of initial context
- Log which memories were used (audit trail)

### Challenge 4: User Privacy & Control
**Problem:** Users feel surveilled ("How does it know that about me?")

**Solution:**
- Full transparency (show what's remembered)
- User override (ability to edit/delete)
- Clear opt-in (ask permission: "Should I remember this?")
- Data export (users can download all memories)
- Deletion on request (GDPR-style right to be forgotten)

---

## 9. Sources & Further Reading

### Key Papers & Docs
- **MemGPT (Letta)**: [MemGPT: Towards LLMs as Operating Systems](https://research.memgpt.ai/)
- **LangMem SDK**: [Launching Long-Term Memory Support in LangGraph](https://blog.langchain.com/launching-long-term-memory-support-in-langgraph/)
- **PersonaMem-v2**: [Towards Personalized Intelligence via Learning Implicit User Personas](https://arxiv.org/abs/2512.06688)
- **Memoria**: [Memoria: A Scalable Agentic Memory Framework for Personalized Conversational AI](https://arxiv.org/abs/2512.12686)
- **Design Patterns**: [Design Patterns for Long-Term Memory in LLM-Powered Architectures](https://serokell.io/blog/design-patterns-for-long-term-memory-in-llm-powered-architectures)

### Open-Source Tools
- **Letta (MemGPT)**: [letta-ai/letta](https://github.com/letta-ai/letta)
- **Mem0**: [mem0ai/mem0](https://github.com/mem0ai/mem0)
- **PersonaMem-v2**: [bowen-upenn/PersonaMem-v2](https://github.com/bowen-upenn/PersonaMem-v2)
- **LangChain Memory**: [LangChain Docs](https://docs.langchain.com/oss/python/langchain/long-term-memory)

### Relevant Benchmarks
- **PersonaMem** benchmark: 20,000+ preference variations, tests implicit personalization accuracy
- **Memoria evaluation**: Shows 16x token savings with agentic memory vs naive history retention

---

## 10. Next Steps for Nomad Implementation

### Short-term (Phase 11)
1. Add **working memory blocks** to system prompt (user profile JSON)
2. Implement post-cycle **extraction pipeline** (LLM analyzes what was learned)
3. Add **Memory Panel** to Dashboard UI (view/edit stored memories)

### Medium-term (Phase 12)
1. Integrate **vector DB** for archival memory (Pinecone, FAISS, or SQLite + embeddings)
2. Implement **memory retrieval** at cycle start (embed brief → search → inject context)
3. Add **contradiction detection** and **memory decay** logic
4. Build **audit trail** (when/why each memory was added)

### Long-term (Phase 13+)
1. **Cross-project memory**: One user model across multiple brands/campaigns
2. **Team memory**: Share learnings across team members (with privacy controls)
3. **Memory export**: Users can download insights about their preferences
4. **A/B testing memory**: Test whether memory improves cycle quality (metric: user satisfaction)

---

## Appendix: Quick Reference Table

| Aspect | Best Practice | For Nomad |
|--------|---------------|----------|
| **Architecture** | Two-tier (working + archival) | Phase 1: working only; Phase 2: add archival vector DB |
| **What to store** | Communication style, values, interaction prefs | User research depth pref, creative direction, audience focus |
| **Update frequency** | Per session + weekly aggregation | Per cycle (6 cycles = 1 week) |
| **Retrieval** | Semantic search + relevance ranking | Embed research brief at cycle start, retrieve top 5 |
| **Memory decay** | 6-month half-life for stable prefs | Tune per preference type (see table in section 7) |
| **Reference limit** | 1-2 explicit mentions per session | Never explicit; only implicit in system prompt |
| **Contradiction handling** | Require 3 conflicts before updating | Flag after 1st, update confidence on 2nd, replace on 3rd |
| **User control** | Full transparency + edit/delete access | Memory Panel in Dashboard (view/edit/clear) |

---

**Final thought:** The best memory system is one the user forgets exists. It just feels like having a smarter partner who gets better at working with you over time.
