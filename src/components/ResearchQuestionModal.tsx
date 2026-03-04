import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { ResearchPauseEvent } from '../utils/researchAgents';

interface ResearchQuestionModalProps {
  isOpen: boolean;
  question: ResearchPauseEvent | null;
  onAnswer: (answer: string) => void;
  isLoading?: boolean;
}

export function ResearchQuestionModal({
  isOpen,
  question,
  onAnswer,
  isLoading = false,
}: ResearchQuestionModalProps) {
  const { isDarkMode } = useTheme();
  const [answer, setAnswer] = useState('');

  if (!isOpen || !question) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim()) {
      onAnswer(answer.trim());
      setAnswer('');
    }
  };

  const bgClass = isDarkMode ? 'bg-[#0d0d0d] border-zinc-800' : 'bg-white border-zinc-200';
  const textClass = isDarkMode ? 'text-white' : 'text-black';
  const inputBgClass = isDarkMode ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-zinc-200 text-black';
  const labelClass = isDarkMode ? 'text-zinc-400' : 'text-zinc-600';
  const buttonClass = isDarkMode
    ? 'bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500'
    : 'bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-lg ${bgClass} border rounded-lg shadow-2xl`}
        >
          {/* Header */}
          <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <h2 className={`font-mono text-sm font-bold uppercase tracking-widest ${textClass}`}>
              Research Agent Question
            </h2>
            <p className={`text-xs ${labelClass} mt-2`}>{question.context}</p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            <div className={`p-3 rounded ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
              <p className={`font-mono text-sm ${textClass} leading-relaxed`}>"{question.question}"</p>
            </div>

            {/* Suggested Answers */}
            {question.suggestedAnswers && question.suggestedAnswers.length > 0 && (
              <div className="space-y-2">
                <label className={`text-xs uppercase tracking-widest ${labelClass} block`}>
                  Suggested from your product:
                </label>
                <div className="flex flex-wrap gap-2">
                  {question.suggestedAnswers.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => setAnswer(suggestion)}
                      className={`px-2 py-1 text-xs rounded font-mono border transition-colors ${
                        answer === suggestion
                          ? isDarkMode
                            ? 'bg-white text-black border-white'
                            : 'bg-black text-white border-black'
                          : isDarkMode
                            ? 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                            : 'border-zinc-300 text-zinc-700 hover:border-zinc-500'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer here..."
                className={`w-full px-3 py-2 rounded font-mono text-xs border ${inputBgClass} focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-none`}
                rows={3}
                disabled={isLoading}
              />

              <div className="flex gap-2 justify-end">
                <button
                  type="submit"
                  disabled={!answer.trim() || isLoading}
                  className={`px-4 py-2 rounded font-mono text-xs uppercase tracking-widest transition-colors ${buttonClass}`}
                >
                  {isLoading ? 'Submitting...' : 'Submit Answer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
