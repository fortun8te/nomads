/**
 * ShineText — Animated shimmer/shine effect on text.
 * Inspired by uiverse.io/neerajbaniwal/hungry-mule-59
 *
 * Use for all status messages: "Thinking...", "Researching...", "Generating..."
 * Adapts to light and dark backgrounds via the `variant` prop.
 */

import { type CSSProperties, type ReactNode } from 'react';

interface ShineTextProps {
  children: ReactNode;
  /** 'light' = dark text on light bg, 'dark' = light text on dark bg */
  variant?: 'light' | 'dark';
  /** Additional CSS classes */
  className?: string;
  /** Animation speed in seconds (default 3) */
  speed?: number;
  /** Set false to disable animation (shows static text) */
  animate?: boolean;
}

// Inject keyframes once
let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes nomad-shine {
      0% { background-position: 0; }
      60% { background-position: 180px; }
      100% { background-position: 180px; }
    }
  `;
  document.head.appendChild(style);
}

export function ShineText({
  children,
  variant = 'light',
  className = '',
  speed = 3,
  animate = true,
}: ShineTextProps) {
  injectKeyframes();

  const gradient =
    variant === 'light'
      ? 'linear-gradient(to right, #a1a1aa 0, #18181b 10%, #a1a1aa 20%)'
      : 'linear-gradient(to right, #71717a 0, #ffffff 10%, #71717a 20%)';

  const style: CSSProperties = animate
    ? {
        background: gradient,
        backgroundPosition: 0,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        animation: `nomad-shine ${speed}s infinite linear`,
        animationFillMode: 'forwards',
      }
    : {};

  return (
    <span className={`whitespace-nowrap ${className}`} style={style}>
      {children}
    </span>
  );
}
