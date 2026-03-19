import { useEffect, useRef, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { tokenTracker } from '../utils/tokenStats';
import { useTheme } from '../context/ThemeContext';
import { ResponseStream } from './ResponseStream';

interface ThinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ThinkingModal — Full-screen drawer showing Qwen 3.5 thinking tokens
 * Displays accumulated thinking text in monospace, gray on dark background
 * Auto-scrolls to bottom as thinking arrives
 */
export function ThinkingModal({ isOpen, onClose }: ThinkingModalProps) {
  const { isDarkMode } = useTheme();
  const contentRef = useRef<HTMLDivElement>(null);
  const tokenInfo = useSyncExternalStore(tokenTracker.subscribe, tokenTracker.getSnapshot);

  // Auto-scroll to bottom when thinking arrives
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [tokenInfo.fullThinkingText, isOpen]);

  const thinkingText = tokenInfo.fullThinkingText || '';
  const thinkingCount = tokenInfo.thinkingTokenCount || 0;
  const isActive = tokenInfo.isThinking || tokenInfo.isGenerating;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[999]"
          />

          {/* Modal */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed bottom-0 left-0 right-0 max-h-[85vh] z-[1000] rounded-t-2xl shadow-2xl ${
              isDarkMode ? 'bg-zinc-900 border-t border-zinc-800' : 'bg-white border-t border-zinc-200'
            }`}
          >
            {/* Header */}
            <div className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-b ${
              isDarkMode ? 'border-zinc-800/60' : 'border-zinc-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {/* Pulsing thinking indicator */}
                  {isActive && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-blue-500"
                    />
                  )}
                  <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
                    Model Thinking
                  </h2>
                </div>
                {thinkingCount > 0 && (
                  <span className={`text-sm px-2 py-1 rounded-full ${
                    isDarkMode
                      ? 'bg-blue-500/10 text-blue-300'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {thinkingCount} token{thinkingCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
                    : 'hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900'
                }`}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div
              ref={contentRef}
              className={`flex-1 overflow-y-auto p-6 min-h-[200px] max-h-[calc(85vh-80px)] ${
                isDarkMode ? 'bg-zinc-950' : 'bg-zinc-50'
              }`}
            >
              {thinkingText ? (
                isActive ? (
                  <ResponseStream
                    textStream={thinkingText}
                    mode="fade"
                    speed={60}
                    as="pre"
                    className={`text-sm font-mono whitespace-pre-wrap break-words leading-relaxed ${
                      isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  />
                ) : (
                  <pre
                    className={`text-sm font-mono whitespace-pre-wrap break-words leading-relaxed ${
                      isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  >
                    {thinkingText}
                  </pre>
                )
              ) : (
                <div className={`text-sm ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  {isActive ? 'Waiting for thinking tokens...' : 'No thinking tokens captured yet'}
                </div>
              )}
            </div>

            {/* Footer — Stats */}
            {thinkingText && (
              <div className={`flex-shrink-0 px-6 py-3 border-t ${
                isDarkMode ? 'border-zinc-800/60 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
              }`}>
                <div className={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  {thinkingText.length.toLocaleString()} characters · {thinkingCount} thinking token{thinkingCount !== 1 ? 's' : ''}
                  {isActive && ' · Active'}
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
