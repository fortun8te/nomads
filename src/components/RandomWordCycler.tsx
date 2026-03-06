/**
 * RandomWordCycler — Picks a random word every N seconds with a fade transition.
 *
 * Unlike WordCycler (sequential CSS animation), this uses JS intervals
 * for true random selection from a large word pool.
 *
 * Usage:
 *   <RandomWordCycler />                        — Default fun words, 3s interval
 *   <RandomWordCycler words={['a','b']} />      — Custom word list
 *   <RandomWordCycler interval={2000} />         — 2s interval
 */

import { useState, useEffect, useRef } from 'react';

const DEFAULT_WORDS = [
  // legit
  'Accomplishing', 'Actioning', 'Actualizing', 'Analyzing',
  'Baking', 'Bloviating', 'Brewing', 'Brainstorming',
  'Clauding', 'Cogitating', 'Combobulating', 'Concocting', 'Contemplating',
  'Creating', 'Cultivating',
  'Designing', 'Developing', 'Drafting',
  'Elaborating', 'Envisioning', 'Executing',
  'Figuring', 'Generating', 'Honking',
  'Imagining', 'Implementing', 'Innovating', 'Integrating', 'Iterating',
  'Marinating', 'Optimizing',
  'Planning', 'Polishing', 'Pondering', 'Processing', 'Prototyping',
  'Rendering', 'Ruminating',
  'Simmering', 'Sketching', 'Strategizing', 'Synthesizing',
  'Thinking', 'Translating', 'Tweaking',
  'Visualizing', 'Whatchamacalliting', 'Wrangling', 'Compositing',
  // michael
  'Glazing Michael', 'Buzzing Michael', 'Michael-fying', 'Michael-mixing',
  'Michaeling', 'Michaeling this sh*t', 'Visualizing like Michael',
  'Slacking a bit like Michael',
  // real ones
  'Pretending to work', 'RTX 5080 flex-rendering', 'Staring at the screen',
  'Contemplating life', 'Overdosing on caffeine', 'Drinking coffee',
  'Taking a Zyn', 'Lowkey not doing shi', 'Making AI garbage',
  'Smoking a cigar', 'Vaping',
  // corporate
  'Updating timestamps to look busy', 'Joining calls with the camera off',
  'Replying to emails 6 minutes late', 'Forwarding PRs I didn\'t read',
  'Outsourcing to an Indian dev for $12/hour', 'Blaming scope creep',
  'Opening 40 tabs as "research"', 'Saying "bandwidth" like it means something',
  'Clicking "appear available" at 2pm', 'Delegating my delegation',
  'Setting status to "in a meeting"', 'Nodding in standups',
  'Saying "great question" to buy time', 'Updating JIRA tickets nobody reads',
  'Pretending the feedback matters', 'Going through the motions',
  // existential
  'Wondering where it all went wrong', 'Another meeting that could\'ve been an email',
  'Another year that could\'ve been something', 'Not sleeping',
  'Sleeping 12 hours on weekends', 'Forgot why I wanted this job',
  'Can\'t remember what I actually do', 'Same desk, different decade',
  'Coffee tastes like regret', 'The code compiles but so what',
  'Younger guys are hungrier', 'Just want out', 'Can\'t afford to leave',
  'Mortgage owns me', 'Laughing at nothing', 'Staring at my hands',
  'They used to build things', 'Now they type emails', 'Emails about emails',
  'The matrix sustains itself', 'Open another browser tab', 'Close another dream',
  'Turn off camera again', 'Nobody needs to see this',
  'Just execute', 'Just pretend', 'Just survive',
  'Waiting for Friday that never comes', 'Waiting for something to matter',
  'Still waiting',
];

interface RandomWordCyclerProps {
  /** Custom word list (uses fun defaults if omitted) */
  words?: string[];
  /** Interval in ms between word changes (default: 3000) */
  interval?: number;
  /** Additional class names */
  className?: string;
  /** Text color (default: zinc-500) */
  color?: string;
}

export function RandomWordCycler({
  words = DEFAULT_WORDS,
  interval = 3000,
  className = '',
  color,
}: RandomWordCyclerProps) {
  const [currentWord, setCurrentWord] = useState(() =>
    words[Math.floor(Math.random() * words.length)]
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const lastWordRef = useRef(currentWord);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsTransitioning(true);

      setTimeout(() => {
        let next: string;
        do {
          next = words[Math.floor(Math.random() * words.length)];
        } while (next === lastWordRef.current && words.length > 1);
        lastWordRef.current = next;
        setCurrentWord(next);
        setIsTransitioning(false);
      }, 300); // fade out duration
    }, interval);

    return () => clearInterval(timer);
  }, [words, interval]);

  // Inject the keyframes once
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'nomad-rwc-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes nomad-rwc-in {
        0% { opacity: 0; transform: translateY(8px); filter: blur(4px); }
        100% { opacity: 1; transform: translateY(0); filter: blur(0); }
      }
      @keyframes nomad-rwc-out {
        0% { opacity: 1; transform: translateY(0); filter: blur(0); }
        100% { opacity: 0; transform: translateY(-8px); filter: blur(4px); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <span
      className={`inline-block font-medium ${className}`}
      style={{
        color: color || undefined,
        animation: isTransitioning
          ? 'nomad-rwc-out 0.3s ease-in forwards'
          : 'nomad-rwc-in 0.3s ease-out forwards',
        minWidth: '10ch',
      }}
    >
      {currentWord}
    </span>
  );
}
