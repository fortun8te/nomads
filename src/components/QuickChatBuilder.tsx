import { useState, useRef, useEffect } from 'react';
import { Button, Input, message, Spin } from 'antd';
import { SendOutlined } from '@ant-design/icons';
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

const SYSTEM_PROMPT = `You are an intelligent ad campaign builder. Your job is to gather essential campaign info through smart conversation.

CORE RULES:
1. Ask ONE question at a time - never ask multiple things
2. Be concise and direct - no corporate fluff
3. Ask smart contextual questions based on previous answers
4. Keep mental track of what you've learned and ask next logical questions
5. When you have 6-7 solid answers from different areas: Output "READY_TO_BUILD" on new line
6. After READY_TO_BUILD, show what you extracted with JSON

QUESTION FLOW (ask in this order, but skip if already answered):
- Brand identity: What's your brand? → What's the main product/service? → What industry?
- Positioning: How would you position this? (What makes it different?)
- Target audience: Who's your target customer? (Name or persona type)
- Problem/Solution: What problem does it solve? → What's the price point?
- Goals: What's the main marketing goal? → What platforms?

EXTRACTION CHECKLIST (extract and show all you know):
You're building: {"brandName":"...", "productName":"...", "industry":"...", "positioning":"...", "personaName":"...", "problemSolved":"...", "pricing":"...", "primaryPlatforms":"...", "marketingGoal":"..."}

After EACH user message, ask ONE follow-up based on what you know. Be smart about it:
- If they said "skincare brand, targets women", next ask about positioning or target age
- If they gave product + brand, ask about the problem it solves
- If they gave positioning, ask about specific target customer
- Connect dots between answers

User just said: {USER_MESSAGE}

OUTPUT FORMAT:
1. ONE sentence acknowledgment of what they said
2. ONE direct follow-up question (based on what's missing or needs detail)
3. ONLY when you have 6+ solid answers across different areas, add:
   READY_TO_BUILD
   {"brandName":"[extracted]", "productName":"[extracted]", "industry":"[extracted]", "positioning":"[extracted]", "personaName":"[extracted]", "problemSolved":"[extracted]", "pricing":"[extracted]", "primaryPlatforms":"[extracted]", "marketingGoal":"[extracted]"}`;

export function QuickChatBuilder({ messages, setMessages, onComplete }: QuickChatBuilderProps) {
  const { isDarkMode } = useTheme();
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormDataFromChat>({});
  const [showForm, setShowForm] = useState(false);
  const [extractionPreview, setExtractionPreview] = useState<FormDataFromChat>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    // Add user message
    const newMessages = [
      ...messages,
      { type: 'user' as const, content: userInput },
    ];
    setMessages(newMessages);
    setUserInput('');
    setIsLoading(true);

    try {
      // Build context for AI
      const conversationContext = newMessages
        .map((m) => `${m.type === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n\n');

      const prompt = `${conversationContext}

Now respond as the AI campaign builder. Ask the next smart question or if we have enough info, output READY_TO_BUILD.`;

      // Call Ollama with streaming
      let aiResponse = '';

      await ollamaService.generateStream(
        prompt,
        SYSTEM_PROMPT,
        {
          model: 'qwen3:8b',
          onChunk: (chunk) => {
            aiResponse += chunk;
          },
        }
      );

      // Check if ready to build
      if (aiResponse.includes('READY_TO_BUILD')) {
        // Extract JSON from response
        try {
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const extracted = JSON.parse(jsonMatch[0]);
            setFormData(extracted);
            setShowForm(true);

            // Show confirmation message
            const cleanResponse = aiResponse
              .replace(/READY_TO_BUILD/g, '')
              .replace(/\{[\s\S]*\}/, '')
              .trim();

            setMessages((prev) => [
              ...prev,
              {
                type: 'ai' as const,
                content: cleanResponse || `Great! I've gathered all the info. Review and confirm below:`,
              },
            ]);
          }
        } catch (e) {
          // JSON parse error, just show the response
          setMessages((prev) => [
            ...prev,
            { type: 'ai' as const, content: aiResponse },
          ]);
        }
      } else {
        // Regular response, continue conversation
        setMessages((prev) => [
          ...prev,
          { type: 'ai' as const, content: aiResponse },
        ]);

        // Try to extract partial JSON from regular responses (for preview)
        try {
          const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const partial = JSON.parse(jsonMatch[0]);
            setExtractionPreview((prev) => ({ ...prev, ...partial }));
          }
        } catch (e) {
          // Silent fail for partial extraction attempts
        }
      }

      setIsLoading(false);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Failed to generate response';
      message.error(`AI Error: ${errorMsg}`);
      setMessages((prev) => [
        ...prev,
        {
          type: 'ai' as const,
          content: `Oops, I had an error: ${errorMsg}. Please try again.`,
        },
      ]);
      setIsLoading(false);
    }
  };

  const handleEditField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleStartCampaign = () => {
    if (!formData.brandName && !formData.productName) {
      message.error('Please fill in at least brand name or product name');
      return;
    }
    onComplete(formData);
  };

  return (
    <div
      className={`space-y-4 max-h-[600px] flex flex-col ${
        isDarkMode ? 'bg-zinc-900' : 'bg-white'
      }`}
    >
      {/* Chat Messages */}
      <div
        className={`flex-1 overflow-y-auto space-y-3 p-4 border rounded ${
          isDarkMode
            ? 'border-zinc-700 bg-zinc-800'
            : 'border-zinc-200 bg-zinc-50'
        }`}
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                msg.type === 'user'
                  ? isDarkMode
                    ? 'bg-blue-900 text-white'
                    : 'bg-blue-100 text-black'
                  : isDarkMode
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-200 text-black'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <Spin size="small" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Form Preview (shown when chat is done) */}
      {showForm && (
        <div
          className={`border rounded p-4 space-y-3 max-h-64 overflow-y-auto ${
            isDarkMode
              ? 'border-zinc-700 bg-zinc-700'
              : 'border-zinc-200 bg-zinc-100'
          }`}
        >
          <p className="font-semibold text-sm">Review & Edit:</p>

          {[
            { key: 'brandName', label: 'Brand Name', placeholder: 'e.g., Upfront' },
            {
              key: 'industry',
              label: 'Industry',
              placeholder: 'e.g., Beauty, SaaS',
            },
            {
              key: 'productName',
              label: 'Product Name',
              placeholder: 'e.g., Vitamin C Serum',
            },
            {
              key: 'positioning',
              label: 'Positioning',
              placeholder: 'What makes you different?',
            },
            {
              key: 'personaName',
              label: 'Target Persona',
              placeholder: 'e.g., Emma, 32-38',
            },
            {
              key: 'problemSolved',
              label: 'Problem Solved',
              placeholder: 'e.g., Hyperpigmentation',
            },
            {
              key: 'pricing',
              label: 'Price Point',
              placeholder: 'e.g., €50-80',
            },
            {
              key: 'primaryPlatforms',
              label: 'Platforms',
              placeholder: 'e.g., Instagram, TikTok, YouTube',
            },
            {
              key: 'marketingGoal',
              label: 'Marketing Goal',
              placeholder: 'e.g., Drive conversions',
            },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-semibold">{label}</label>
              <Input
                placeholder={placeholder}
                value={formData[key as keyof FormDataFromChat] || ''}
                onChange={(e) => handleEditField(key, e.target.value)}
                size="small"
              />
            </div>
          ))}
        </div>
      )}

      {/* Extraction Preview */}
      {!showForm && Object.keys(extractionPreview).length > 0 && (
        <div
          className={`text-xs p-2 rounded border ${
            isDarkMode
              ? 'border-zinc-600 bg-zinc-800 text-zinc-300'
              : 'border-zinc-300 bg-zinc-100 text-zinc-700'
          }`}
        >
          <p className="font-semibold mb-1">📋 Capturing:</p>
          <p className="font-mono">
            {Object.entries(extractionPreview)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${String(v).slice(0, 20)}${String(v).length > 20 ? '...' : ''}`)
              .join(' • ')}
          </p>
        </div>
      )}

      {/* Input Area */}
      {!showForm && (
        <div className="flex gap-2">
          <Input
            placeholder="Your answer..."
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onPressEnter={handleSendMessage}
            disabled={isLoading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            disabled={isLoading || !userInput.trim()}
            loading={isLoading}
          />
        </div>
      )}

      {/* Start Campaign Button */}
      {showForm && (
        <Button
          type="primary"
          size="large"
          onClick={handleStartCampaign}
          block
        >
          Start Campaign
        </Button>
      )}
    </div>
  );
}
