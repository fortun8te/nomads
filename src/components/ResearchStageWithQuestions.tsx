import { useState, useCallback } from 'react';
import { StagePanel } from './StagePanel';
import { ResearchQuestionModal } from './ResearchQuestionModal';
import type { Cycle, StageName } from '../types';
import type { ResearchPauseEvent } from '../utils/researchAgents';

interface ResearchStageWithQuestionsProps {
  cycle: Cycle | null;
  isDarkMode: boolean;
  onUpdateOutput?: (stageName: StageName, output: string) => void;
}

export function ResearchStageWithQuestions({
  cycle,
  isDarkMode,
  onUpdateOutput,
}: ResearchStageWithQuestionsProps) {
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<ResearchPauseEvent | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [questionHistory, setQuestionHistory] = useState<Array<{ q: string; a: string }>>([]);

  const handlePauseForInput = useCallback(
    async (event: ResearchPauseEvent): Promise<string> => {
      return new Promise((resolve) => {
        setCurrentQuestion(event);
        setShowQuestionModal(true);

        // Create a resolver that will be called when user submits
        (window as any)._researchQuestionResolver = (answer: string) => {
          setQuestionHistory((prev) => [...prev, { q: event.question, a: answer }]);
          setShowQuestionModal(false);
          setCurrentQuestion(null);
          resolve(answer);
        };
      });
    },
    []
  );

  const handleAnswer = (answer: string) => {
    setIsAnswering(true);
    // Call the resolver
    const resolver = (window as any)._researchQuestionResolver;
    if (resolver) {
      resolver(answer);
      setTimeout(() => setIsAnswering(false), 500);
    }
  };

  return (
    <>
      <StagePanel
        cycle={cycle}
        isDarkMode={isDarkMode}
        onUpdateOutput={onUpdateOutput}
        onPauseForInput={handlePauseForInput}
      />

      <ResearchQuestionModal
        isOpen={showQuestionModal}
        question={currentQuestion}
        onAnswer={handleAnswer}
        isLoading={isAnswering}
      />

      {/* Show question history if any questions were asked */}
      {questionHistory.length > 0 && (
        <div className={`mt-4 p-3 rounded text-xs space-y-2 ${isDarkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-zinc-50 border border-zinc-200'}`}>
          <p className={`font-mono font-bold uppercase tracking-widest ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
            Research Clarifications
          </p>
          {questionHistory.map((item, idx) => (
            <div key={idx} className={`space-y-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <p className="font-mono">Q: {item.q}</p>
              <p className={`font-mono pl-4 ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>A: {item.a}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
