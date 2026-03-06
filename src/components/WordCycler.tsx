/**
 * WordCycler — Animated word-cycling loader.
 * Inspired by uiverse.io/kennyotsu/fresh-lizard-20
 *
 * Shows a static prefix ("loading") with a cycling colored word
 * (e.g. "GPT-OSS 20B" → "GLM 4.7" → "Nano Banana 2").
 *
 * Use for model loading states, stage transitions, etc.
 */

import { type CSSProperties } from 'react';

interface WordCyclerProps {
  /** Static prefix text (e.g. "loading") */
  prefix: string;
  /** Array of words to cycle through. Last word should match first for seamless loop. */
  words: string[];
  /** Accent color for the cycling word (default: #956afa / purple) */
  color?: string;
  /** Total cycle duration in seconds (default: 4) */
  speed?: number;
  /** Font size class (default: text-sm) */
  className?: string;
}

// Inject keyframes per word count
function injectKeyframes(wordCount: number) {
  if (typeof document === 'undefined') return;

  const id = `nomad-wordcycle-${wordCount}`;
  if (document.getElementById(id)) return;

  // Build keyframes for N words (including repeated first word at end)
  // Each word gets: overshoot → settle → pause → next
  const steps: string[] = [];
  const totalWords = wordCount; // includes the repeated word at end
  const pausePerWord = 100 / (totalWords - 1);

  for (let i = 0; i < totalWords - 1; i++) {
    const overshootPct = (i * pausePerWord + pausePerWord * 0.4).toFixed(1);
    const settlePct = (i * pausePerWord + pausePerWord * 0.6).toFixed(1);
    const y = (i + 1) * 100;

    steps.push(`${overshootPct}% { transform: translateY(-${y + 2}%); }`);
    steps.push(`${settlePct}% { transform: translateY(-${y}%); }`);
  }

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    @keyframes nomad-wordspin-${wordCount} {
      0% { transform: translateY(0); }
      ${steps.join('\n      ')}
      100% { transform: translateY(-${(totalWords - 1) * 100}%); }
    }
  `;
  document.head.appendChild(style);
}

export function WordCycler({
  prefix,
  words,
  color = '#956afa',
  speed = 4,
  className = 'text-sm',
}: WordCyclerProps) {
  injectKeyframes(words.length);

  const containerStyle: CSSProperties = {
    overflow: 'hidden',
    position: 'relative',
    display: 'inline-block',
    height: '1.4em',
    verticalAlign: 'bottom',
  };

  const maskStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(var(--wordcycler-bg, rgba(247,247,248,1)) 5%, transparent 25%, transparent 75%, var(--wordcycler-bg, rgba(247,247,248,1)) 95%)',
    zIndex: 20,
    pointerEvents: 'none',
  };

  const wordStyle: CSSProperties = {
    display: 'block',
    height: '1.4em',
    lineHeight: '1.4em',
    color,
    fontWeight: 600,
    animation: `nomad-wordspin-${words.length} ${speed}s infinite`,
  };

  return (
    <span className={`inline-flex items-baseline gap-1.5 font-medium ${className}`}>
      <span className="text-zinc-500">{prefix}</span>
      <span style={containerStyle}>
        <span style={maskStyle} />
        {words.map((word, i) => (
          <span key={`${word}-${i}`} style={wordStyle}>
            {word}
          </span>
        ))}
      </span>
    </span>
  );
}
