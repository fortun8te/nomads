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

CONVERSATION STRUCTURE:
1. START: "Tell me about your brand/product" (they describe)
2. LAYER 1 (Avatar): Understand their customer intimately
   - Current situation (daily pain)
   - Desired situation (dream outcome)
   - Previous attempts (why they failed)
   - Values (what matters)
3. LAYER 2 (Problem): Dig into mechanism
   - Root cause (not symptoms)
   - Why it persists
4. LAYER 3 (Solution): Understand the cure
   - How it would work
   - Why previous solutions failed
5. LAYER 4 (Product): Map features to transformation
   - Product specs
   - Feature-to-desire connections
6. DEEP DESIRE: Uncover identity shift

TONE & APPROACH:
Be curious. Ask like a therapist, not a salesman.
NEVER accept vague answers — dig deeper.
ALWAYS dig for specificity.
LOOK for emotional/identity layer.
EXTRACT their exact language.

CRITICAL RULES:
1. ONE question per turn (not "And also..." — one thing)
2. Keep responses SHORT (2-3 sentences max, then ONE question)
3. Listen more than you talk
4. Never say "I have enough info" — THEY decide when to stop
5. If they give a vague answer, dig 2-3 levels deeper
6. Extract exact phrases and emotional language

People don't buy PRODUCTS. They buy TRANSFORMATION OF IDENTITY.
Your job: Find what they REALLY want.`;

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

  const userMessageCount = messages.filter((m) => m.type === 'user').length;

  useEffect(() => {
    const el = messagesEndRef.current?.parentElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

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
          model: 'qwen3.5:27b',
          temperature: 0.9,
          onChunk: (chunk) => {
            aiResponse += chunk;
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
          updated[lastIdx] = { type: 'ai' as const, content: `Error: ${errorMsg}` };
        }
        return updated;
      });
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && messageQueueRef.current.length > 0) {
      const nextMessage = messageQueueRef.current.shift();
      if (nextMessage) {
        setUserInput(nextMessage);
        const timer = setTimeout(() => {
          setUserInput((current) => {
            if (current.trim()) handleSendMessage();
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
          model: 'qwen3.5:27b',
          temperature: 0.9,
          onChunk: (chunk) => { extractionResponse += chunk; },
          signal: abortControllerRef.current.signal,
        }
      );

      const jsonMatch = extractionResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        setFormData(extracted);
        setShowForm(true);
      } else {
        setFormData({});
        setShowForm(true);
      }
    } catch (error) {
      console.error('Extraction error:', error);
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

  const bg = isDarkMode ? 'bg-zinc-900' : 'bg-white';
  const border = isDarkMode ? 'border-zinc-800' : 'border-zinc-200';
  const muted = isDarkMode ? 'text-zinc-500' : 'text-zinc-400';
  const userBubble = isDarkMode
    ? 'bg-blue-600/20 text-blue-100 border-blue-500/20'
    : 'bg-blue-50 text-blue-900 border-blue-200/60';
  const aiBubble = isDarkMode
    ? 'bg-zinc-800/80 text-zinc-200 border-zinc-700/50'
    : 'bg-zinc-50 text-zinc-800 border-zinc-200/60';

  return (
    <div className="flex flex-col" style={{ minHeight: 420, maxHeight: 'calc(100vh - 240px)' }}>
      {/* Messages */}
      <div className={`flex-1 overflow-y-auto p-5 space-y-4 ${bg}`}>
        {messages.length === 0 && (
          <p className={`text-xs ${muted} text-center pt-10`}>
            Describe your brand or product to get started.
          </p>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl border text-[13px] leading-relaxed ${
              msg.type === 'user' ? userBubble : aiBubble
            } ${msg.type === 'user' ? 'rounded-br-md' : 'rounded-bl-md'}`}>
              {msg.content || (
                <span className="inline-flex gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-zinc-500' : 'bg-zinc-400'} animate-bounce`} style={{ animationDelay: '0ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-zinc-500' : 'bg-zinc-400'} animate-bounce`} style={{ animationDelay: '150ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-zinc-500' : 'bg-zinc-400'} animate-bounce`} style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
          </div>
        ))}

        {isExtracting && (
          <div className="flex justify-center">
            <div className={`px-4 py-2 rounded-full text-xs ${isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'} animate-pulse`}>
              Extracting campaign data...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Form Preview */}
      {showForm && (
        <div className={`border-t ${border} p-4 space-y-2 max-h-60 overflow-y-auto ${bg}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${muted}`}>Review & Edit</span>
            <button
              onClick={() => { setShowForm(false); setFormData({}); }}
              className={`text-[10px] uppercase tracking-wider ${muted} hover:${isDarkMode ? 'text-zinc-300' : 'text-zinc-600'} transition-colors`}
            >
              Back to chat
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
              <span className={`text-[10px] uppercase tracking-wider w-20 shrink-0 ${muted}`}>{label}</span>
              <input
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg border ${border} bg-transparent outline-none focus:ring-1 focus:ring-blue-500/30 transition-all ${
                  isDarkMode ? 'text-white' : 'text-black'
                }`}
                value={formData[key as keyof FormDataFromChat] || ''}
                onChange={(e) => handleEditField(key, e.target.value)}
              />
            </div>
          ))}

          <button
            onClick={() => { if (formData.brandName || formData.productName) onComplete(formData); }}
            className={`w-full mt-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
              isDarkMode
                ? 'bg-white text-black hover:bg-zinc-200'
                : 'bg-black text-white hover:bg-zinc-800'
            }`}
          >
            Start Campaign
          </button>
        </div>
      )}

      {/* Input Area */}
      {!showForm && (
        <div className={`border-t ${border} ${bg}`}>
          {/* Build Campaign button */}
          {userMessageCount >= 3 && !isLoading && !isExtracting && (
            <button
              onClick={handleBuildCampaign}
              className={`w-full py-2.5 text-[11px] uppercase tracking-wider font-semibold border-b ${border} transition-colors ${
                isDarkMode
                  ? 'text-emerald-400 hover:bg-emerald-950/20'
                  : 'text-emerald-600 hover:bg-emerald-50'
              }`}
            >
              Done — Build Campaign
            </button>
          )}
          <div className="flex items-center gap-2 p-3">
            <input
              ref={inputRef}
              className={`flex-1 text-sm px-4 py-2.5 rounded-xl border ${border} bg-transparent outline-none focus:ring-1 focus:ring-blue-500/30 transition-all ${
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
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors ${
                  isDarkMode ? 'text-red-400 hover:bg-red-950/30 border border-red-500/20' : 'text-red-600 hover:bg-red-50 border border-red-200'
                }`}
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSendMessage}
                disabled={!userInput.trim()}
                className={`px-5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
                  userInput.trim()
                    ? isDarkMode
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'bg-blue-600 text-white hover:bg-blue-500'
                    : isDarkMode
                    ? 'bg-zinc-800 text-zinc-600'
                    : 'bg-zinc-100 text-zinc-400'
                }`}
              >
                {isLoading ? 'Wait...' : 'Send'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
