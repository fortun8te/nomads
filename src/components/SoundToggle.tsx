/**
 * SoundToggle — Minimal speaker icon button to toggle all sounds on/off.
 *
 * Persists preference to localStorage via soundEngine.setEnabled().
 * Reads initial state from localStorage so it survives page reload.
 */

import { useState, useCallback } from 'react';
import { setEnabled, getSoundEnabled } from '../utils/soundEngine';

function SpeakerOnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

interface SoundToggleProps {
  className?: string;
}

export function SoundToggle({ className = '' }: SoundToggleProps) {
  const [enabled, setEnabledState] = useState<boolean>(() => getSoundEnabled());

  const toggle = useCallback(() => {
    setEnabledState(prev => {
      const next = !prev;
      setEnabled(next);
      return next;
    });
  }, []);

  return (
    <button
      onClick={toggle}
      className={`nomad-glass-pill w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:brightness-150 ${className}`}
      style={{ color: enabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)' }}
      title={enabled ? 'Mute sounds' : 'Unmute sounds'}
      aria-label={enabled ? 'Mute sounds' : 'Unmute sounds'}
      aria-pressed={!enabled}
    >
      {enabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
    </button>
  );
}
