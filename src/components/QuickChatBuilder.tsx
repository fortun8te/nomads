import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { ollamaService } from '../utils/ollama';

interface ChatMessage {
  type: 'ai' | 'user';
  content: string;
}

interface FormDataFromChat {
  brandName?: string;
  website?: string;
  industry?: string;
  positioning?: string;
  personaName?: string;
  age?: string;
  painPoints?: string;
  productName?: string;
  productCategory?: string;
  problemSolved?: string;
  pricing?: string;
  primaryPlatforms?: string;
  marketingGoal?: string;
  marketingBudget?: string;
}

interface QuickChatBuilderProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onComplete: (formData: FormDataFromChat) => void;
}

const SYSTEM_PROMPT = `You are a world-class market research strategist using desire-driven methodology. Your job: understand EXACTLY why people buy by asking ONE probing question at a time.

═══════════════════════════════════════════════════════════════
LAYER 1: AVATAR RESEARCH — Who is buying?
═══════════════════════════════════════════════════════════════

Start by understanding THEIR WORLD:

→ Current Situation (Not surface level — dig deep)
   "What's your daily life like RIGHT NOW?"
   "Walk me through a typical day when this problem hits you"
   "What moment frustrates you most?"
   "How often does this pain show up?"
   (Get specific: times, frequencies, contexts, who else is involved)

→ Desired Situation
   "What would life look like if this problem disappeared?"
   "Paint a picture of your ideal scenario" (be vivid, sensory)
   "What would you finally be able to do?"
   (They're not buying a product, they're buying this feeling)

→ Magnitude of Desire
   "On a scale 1-10, how much do you want this?"
   "If I told you a solution exists but costs €500/month, would you pay?"
   (This reveals TRUE priority vs surface complaint)

→ Previous Attempts (Critical — why did they fail?)
   "What have you already tried to solve this?"
   "Why didn't those work?" (Be specific about failure modes)
   "What did you learn?" (Reveals their expectations)

→ Identity/Values
   "How would you describe yourself?" (Not age/job — personality)
   "What do you value most in your life right now?"
   "What kind of person would you NEVER want to be?"
   (This reveals their non-negotiables)

→ Day-to-Day Reality
   "Walk me through yesterday. When did the problem appear?"
   "What were you doing? Who was around? How did you feel?"
   (Specificity = marketing gold)

→ Content/Authority Consumption
   "Who do you trust for advice on this?" (Not influencers — real people)
   "What blogs/YouTubers/Redditors do you follow?"
   "Who would convince you to buy?"

═══════════════════════════════════════════════════════════════
LAYER 2: PROBLEM RESEARCH — Why does the problem exist?
═══════════════════════════════════════════════════════════════

→ Root Cause (NOT the symptom)
   "Why does this problem exist?" (Don't accept surface answers)
   "If I asked 'why?' to your answer 5 more times, what would we discover?"
   "What's the MECHANISM? What's actually happening biologically/mechanically/psychologically?"

→ How It Developed
   "When did this start?" (When, not why)
   "Did it appear suddenly or gradually?"
   "What changed?" (Trigger event?)

→ Why It Persists
   "Why haven't you fixed this yet?"
   "What makes it hard?" (Identify the real barrier — often not what they think)
   "What would happen if you tried to solve it yourself?"

→ Expert/Authority Understanding
   "What would a doctor/expert/scientist say is happening?"
   "Have you researched the mechanism?"
   (If not — this is a gap. They're solving blind.)

═══════════════════════════════════════════════════════════════
LAYER 3: SOLUTION RESEARCH — Why do solutions work?
═══════════════════════════════════════════════════════════════

→ How Solutions Work (Mechanism)
   "If someone solved this, HOW would it work?"
   "What mechanism would need to change?"
   "What would have to happen scientifically/mechanically/psychologically?"
   (They need to understand the pathway, not just the promise)

→ Why Other Solutions Failed
   "You tried [X] before. Why didn't it work?"
   "What was the gap between what it promised and what happened?"
   (This reveals their skepticism level and real needs)

→ Logical Pathway
   "So if we address [root cause], how does that lead to [desired outcome]?"
   "Walk me through the connection"
   (They need to believe the logic chain)

═══════════════════════════════════════════════════════════════
LAYER 4: PRODUCT RESEARCH — How do features map to desires?
═══════════════════════════════════════════════════════════════

→ Features (The WHAT)
   "What would this solution need to include?"
   "What specific capabilities matter?"

→ Feature-to-Pain Mapping
   "How would [feature X] solve [pain Y]?"
   "Without this feature, could you still solve the problem?"
   (Reveals which features are essential vs nice-to-have)

→ Feature-to-Desire Mapping (THE DEEP WORK)
   "So [feature X] means you could [benefit Y], which would make you feel [emotion Z]"
   "Would you finally be able to [identity shift]?"
   "This means you could be [type of person], right?"
   (Features → benefits → feelings → identity)

═══════════════════════════════════════════════════════════════
DEEP DESIRE MAPPING — The hidden layer
═══════════════════════════════════════════════════════════════

Surface Problem ≠ Real Desire

"Stop hair loss" → Actually: Confidence, attractiveness, dating success
"Better skincare" → Actually: Control of choices, not being deceived, glowing naturally
"More productivity" → Actually: Being a capable builder, not drowning in meetings
"Better sleep" → Actually: Peace of mind, not anxiety-ridden, energized for life

Always ask: "What would this REALLY mean for you?"
"How would your life change?"
"What kind of person would you become?"

═══════════════════════════════════════════════════════════════
YOUR CONVERSATION STRUCTURE
═══════════════════════════════════════════════════════════════

1. START: "Tell me about your brand/product" (they describe)
2. LAYER 1 (Avatar): Understand their customer intimately
   - Current situation (daily pain)
   - Desired situation (dream outcome)
   - Magnitude (how badly do they want this?)
   - Previous attempts (why they failed)
   - Values (what matters)
3. LAYER 2 (Problem): Dig into mechanism
   - Root cause (not symptoms)
   - Why it persists
   - Expert understanding
4. LAYER 3 (Solution): Understand the cure
   - How it would work
   - Why previous solutions failed
   - Logic chain
5. LAYER 4 (Product): Map features to transformation
   - Product specs
   - Feature-to-pain connections
   - Feature-to-desire connections
6. DEEP DESIRE: Uncover identity shift
   - "What does this really mean?"
   - "What kind of person does this make you?"

═══════════════════════════════════════════════════════════════
TONE & APPROACH
═══════════════════════════════════════════════════════════════

Be curious. Ask like a therapist, not a salesman:
- "Tell me more about that..."
- "What do you mean by [specific word they used]?"
- "Why do you think that is?"
- "Help me understand the connection..."

NEVER accept vague answers:
- Them: "Better quality"
- You: "What specifically? Better how? Better in what way compared to what?"

ALWAYS dig for specificity:
- Them: "I want more sales"
- You: "How many more? By when? What would that mean for you?"

LOOK for emotional/identity layer:
- Them: "More productivity"
- You: "What would that actually mean? How would you feel differently?"

EXTRACT their exact language:
- Note their buzzwords, pain descriptors, values language
- Use THEIR words back to them in messaging

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════

1. ONE question per turn (not "And also..." — one thing)
2. Listen more than you talk
3. Never say "I have enough info" — THEY decide when to stop
4. If they give a vague answer, dig 2-3 levels deeper
5. If they say "I don't know", explore what they DO know
6. Look for contradictions (beliefs vs behaviors)
7. Extract exact phrases and emotional language
8. Always connect surface problem → root cause → solution mechanism → identity shift

═══════════════════════════════════════════════════════════════
REMEMBER
═══════════════════════════════════════════════════════════════

People don't buy PRODUCTS.
They buy TRANSFORMATION OF IDENTITY.

"Stop hair loss" ≠ The real desire
"Confidence + dating success" = The real desire

Your job: Find what they REALLY want. Then show how your product delivers THAT.`;

const EXTRACTION_PROMPT = `You are a data extraction tool. Read the conversation below and extract ALL campaign information into a JSON object.

CONVERSATION:
{CONVERSATION}

Extract into this exact JSON format (use empty string "" for anything not mentioned):
{"brandName":"","productName":"","industry":"","positioning":"","personaName":"","age":"","painPoints":"","productCategory":"","problemSolved":"","pricing":"","primaryPlatforms":"","marketingGoal":"","marketingBudget":"","website":""}

Rules:
- Extract ONLY what was explicitly stated or strongly implied
- For personaName, create a short persona description from what was discussed
- For painPoints, combine all mentioned pain points
- For positioning, synthesize from the conversation
- Output ONLY the JSON object, nothing else`;

export function QuickChatBuilder({ messages, setMessages, onComplete }: QuickChatBuilderProps) {
  const { isDarkMode } = useTheme();
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [formData, setFormData] = useState<FormDataFromChat>({});
  const [showForm, setShowForm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageQueueRef = useRef<string[]>([]);

  // Count user messages to know when to show Build button
  const userMessageCount = messages.filter((m) => m.type === 'user').length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    // If already loading, queue the message
    if (isLoading) {
      messageQueueRef.current.push(userInput);
      setUserInput('');
      return;
    }

    const newMessages = [
      ...messages,
      { type: 'user' as const, content: userInput },
    ];
    setMessages(newMessages);
    setUserInput('');
    setIsLoading(true);

    try {
      const conversationContext = newMessages
        .map((m) => `${m.type === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n\n');

      const prompt = `${conversationContext}\n\nNow respond as the strategist. Acknowledge briefly, then ask ONE deeper question. Never suggest you have enough info.`;

      // Add empty AI message for streaming
      setMessages((prev) => [
        ...prev,
        { type: 'ai' as const, content: '' },
      ]);

      let aiResponse = '';
      abortControllerRef.current = new AbortController();

      await ollamaService.generateStream(
        prompt,
        SYSTEM_PROMPT,
        {
          model: 'gpt-oss:20b',
          temperature: 0.9,
          onChunk: (chunk) => {
            aiResponse += chunk;
            // Strip any JSON or READY_TO_BUILD the model might hallucinate
            const cleanDisplay = aiResponse
              .replace(/READY_TO_BUILD/gi, '')
              .replace(/```json[\s\S]*?```/g, '')
              .replace(/\{[^{}]*"brandName"[^{}]*\}/g, '')
              .trim();
            setMessages((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx]?.type === 'ai') {
                updated[lastIdx] = { type: 'ai' as const, content: cleanDisplay };
              }
              return updated;
            });
          },
          signal: abortControllerRef.current.signal,
        }
      );

      setIsLoading(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to generate';
      console.error('QuickChat error:', error);

      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.type === 'ai') {
          updated[lastIdx] = {
            type: 'ai' as const,
            content: `Error: ${errorMsg}`,
          };
        }
        return updated;
      });
      setIsLoading(false);
    }
  };

  // Process queued messages after AI generation completes
  useEffect(() => {
    if (!isLoading && messageQueueRef.current.length > 0) {
      const nextMessage = messageQueueRef.current.shift();
      if (nextMessage) {
        setUserInput(nextMessage);
        // Delay to ensure state is updated
        const timer = setTimeout(() => {
          setUserInput((current) => {
            if (current.trim()) {
              // Trigger send by updating a dummy dependency
              handleSendMessage();
            }
            return current;
          });
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [isLoading]);

  const handleBuildCampaign = async () => {
    setIsExtracting(true);

    try {
      const conversationContext = messages
        .map((m) => `${m.type === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n\n');

      const prompt = EXTRACTION_PROMPT.replace('{CONVERSATION}', conversationContext);

      let extractionResponse = '';
      abortControllerRef.current = new AbortController();

      await ollamaService.generateStream(
        prompt,
        'You are a JSON extraction tool. Output ONLY valid JSON.',
        {
          model: 'gpt-oss:20b',
          temperature: 0.9,
          onChunk: (chunk) => {
            extractionResponse += chunk;
          },
          signal: abortControllerRef.current.signal,
        }
      );

      // Parse the extracted JSON
      const jsonMatch = extractionResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        setFormData(extracted);
        setShowForm(true);
      } else {
        console.error('No JSON found in extraction response');
        // Fallback: show empty form
        setFormData({});
        setShowForm(true);
      }
    } catch (error) {
      console.error('Extraction error:', error);
      // Show form anyway so user can fill manually
      setFormData({});
      setShowForm(true);
    }

    setIsExtracting(false);
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setIsExtracting(false);
  };

  const handleEditField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleBackToChat = () => {
    setShowForm(false);
    setFormData({});
  };

  const handleStartCampaign = () => {
    if (!formData.brandName && !formData.productName) return;
    onComplete(formData);
  };

  const borderClass = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const secondaryText = isDarkMode ? 'text-zinc-500' : 'text-zinc-400';

  return (
    <div className="flex flex-col h-[500px]">
      {/* Messages */}
      <div className={`flex-1 overflow-y-auto border ${borderClass} p-4 space-y-4`}>
        {messages.length === 0 && (
          <p className={`font-mono text-xs ${secondaryText} text-center pt-8`}>
            Describe your brand or product to get started.
          </p>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.type === 'user' ? 'text-right' : 'text-left'}`}>
              <span className={`font-mono text-[10px] uppercase tracking-widest ${secondaryText} block mb-1`}>
                {msg.type === 'user' ? 'You' : 'Agent'}
              </span>
              <div className={`font-mono text-xs leading-relaxed whitespace-pre-wrap ${
                msg.type === 'user'
                  ? isDarkMode ? 'text-white' : 'text-black'
                  : isDarkMode ? 'text-zinc-300' : 'text-zinc-700'
              }`}>
                {msg.content || (
                  <span className={`${secondaryText} animate-pulse`}>...</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {isExtracting && (
          <div className="flex justify-start">
            <div className="text-left">
              <span className={`font-mono text-[10px] uppercase tracking-widest ${secondaryText} block mb-1`}>
                System
              </span>
              <div className={`font-mono text-xs ${secondaryText} animate-pulse`}>
                Extracting campaign data from conversation...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Form Preview */}
      {showForm && (
        <div className={`border ${borderClass} p-4 space-y-2 max-h-52 overflow-y-auto`}>
          <div className="flex items-center justify-between">
            <span className={`font-mono text-[10px] uppercase tracking-widest ${secondaryText}`}>Review & Edit</span>
            <button
              onClick={handleBackToChat}
              className={`font-mono text-[10px] uppercase tracking-widest ${
                isDarkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
              } transition-colors`}
            >
              ← Back to chat
            </button>
          </div>
          {[
            { key: 'brandName', label: 'Brand' },
            { key: 'industry', label: 'Industry' },
            { key: 'productName', label: 'Product' },
            { key: 'productCategory', label: 'Category' },
            { key: 'positioning', label: 'Positioning' },
            { key: 'personaName', label: 'Persona' },
            { key: 'age', label: 'Age' },
            { key: 'painPoints', label: 'Pain Points' },
            { key: 'problemSolved', label: 'Problem' },
            { key: 'pricing', label: 'Price' },
            { key: 'primaryPlatforms', label: 'Platforms' },
            { key: 'marketingGoal', label: 'Goal' },
            { key: 'marketingBudget', label: 'Budget' },
            { key: 'website', label: 'Website' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`font-mono text-[10px] uppercase tracking-widest w-24 shrink-0 ${secondaryText}`}>{label}</span>
              <input
                className={`flex-1 font-mono text-xs px-2 py-1 border ${borderClass} bg-transparent outline-none focus:border-white transition-colors ${
                  isDarkMode ? 'text-white' : 'text-black'
                }`}
                value={formData[key as keyof FormDataFromChat] || ''}
                onChange={(e) => handleEditField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      {!showForm ? (
        <div className="flex flex-col">
          {/* Build Campaign button - appears after 3+ user messages */}
          {userMessageCount >= 3 && !isLoading && !isExtracting && (
            <button
              onClick={handleBuildCampaign}
              className={`w-full py-2 font-mono text-[10px] uppercase tracking-widest border-x border-t ${borderClass} ${
                isDarkMode
                  ? 'text-emerald-400 hover:bg-emerald-950/30 hover:text-emerald-300'
                  : 'text-emerald-600 hover:bg-emerald-50'
              } transition-colors`}
            >
              ✓ I'm done — Build Campaign
            </button>
          )}
          <div className={`flex border ${borderClass} ${userMessageCount >= 3 && !isLoading && !isExtracting ? 'border-t-0' : ''}`}>
            <input
              ref={inputRef}
              className={`flex-1 font-mono text-xs px-4 py-3 bg-transparent outline-none ${
                isDarkMode ? 'text-white placeholder-zinc-600' : 'text-black placeholder-zinc-400'
              } ${isExtracting ? 'opacity-50' : ''}`}
              placeholder={isExtracting ? 'Extracting...' : 'Tell me about your brand...'}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isExtracting}
            />
            {isExtracting ? (
              <button
                onClick={handleCancel}
                className={`px-4 font-mono text-xs uppercase tracking-widest border-l ${borderClass} ${
                  isDarkMode ? 'text-red-400 hover:bg-red-950/30' : 'text-red-600 hover:bg-red-50'
                } transition-colors`}
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSendMessage}
                disabled={!userInput.trim()}
                className={`px-4 font-mono text-xs uppercase tracking-widest border-l ${borderClass} ${
                  isDarkMode
                    ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    : 'text-zinc-500 hover:text-black hover:bg-zinc-100'
                } transition-colors disabled:opacity-30`}
              >
                {isLoading ? 'Queue' : 'Send'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-0">
          <button
            onClick={handleStartCampaign}
            className={`flex-1 py-3 font-mono text-xs uppercase tracking-widest font-bold border ${
              isDarkMode
                ? 'border-white text-white hover:bg-white hover:text-black'
                : 'border-black text-black hover:bg-black hover:text-white'
            } transition-colors`}
          >
            Start Campaign
          </button>
        </div>
      )}
    </div>
  );
}
