/**
 * OrbitalLoader — Manus-style orbital loading animation.
 *
 * Shows orbiting dots around the Nomad logo during long generation waits.
 * Multiple rings at different speeds create a sense of "working on it".
 */

import { NomadIcon } from './NomadIcon';

interface OrbitalLoaderProps {
  /** Overall size in px (default 120) */
  size?: number;
  /** Dark background mode */
  dark?: boolean;
  /** Optional status text below */
  status?: string;
  /** Optional sub-status (token count, elapsed, etc.) */
  detail?: string;
  className?: string;
}

// Inject keyframes once
let injected = false;
function injectStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes orbital-spin-1 {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes orbital-spin-2 {
      from { transform: rotate(60deg); }
      to   { transform: rotate(420deg); }
    }
    @keyframes orbital-spin-3 {
      from { transform: rotate(180deg); }
      to   { transform: rotate(540deg); }
    }
    @keyframes orbital-pulse {
      0%, 100% { opacity: 0.4; transform: scale(0.8); }
      50%      { opacity: 1;   transform: scale(1.2); }
    }
    @keyframes orbital-fade-in {
      from { opacity: 0; transform: scale(0.9); }
      to   { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

export function OrbitalLoader({
  size = 120,
  dark = false,
  status,
  detail,
  className = '',
}: OrbitalLoaderProps) {
  injectStyles();

  const ringColor = dark ? 'rgba(161,161,170,0.15)' : 'rgba(113,113,122,0.1)';
  const dotColor1 = dark ? '#a1a1aa' : '#71717a';
  const dotColor2 = dark ? '#6366f1' : '#818cf8';
  const dotColor3 = dark ? '#f59e0b' : '#d97706';

  const r1 = size * 0.38; // inner ring radius
  const r2 = size * 0.48; // outer ring radius
  const center = size / 2;
  const logoSize = size * 0.28;

  return (
    <div
      className={`flex flex-col items-center gap-3 ${className}`}
      style={{ animation: 'orbital-fade-in 0.4s ease-out' }}
    >
      <div style={{ width: size, height: size, position: 'relative' }}>
        {/* Ring tracks (faint circles) */}
        <svg
          width={size}
          height={size}
          style={{ position: 'absolute', inset: 0 }}
        >
          <circle cx={center} cy={center} r={r1} fill="none" stroke={ringColor} strokeWidth="1" />
          <circle cx={center} cy={center} r={r2} fill="none" stroke={ringColor} strokeWidth="0.5" strokeDasharray="3 6" />
        </svg>

        {/* Ring 1 — 3 dots, slow */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            animation: 'orbital-spin-1 8s linear infinite',
          }}
        >
          {[0, 120, 240].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const x = center + r1 * Math.cos(rad);
            const y = center + r1 * Math.sin(rad);
            const dotSize = 4 + i;
            return (
              <div
                key={`r1-${i}`}
                style={{
                  position: 'absolute',
                  left: x - dotSize / 2,
                  top: y - dotSize / 2,
                  width: dotSize,
                  height: dotSize,
                  borderRadius: '50%',
                  background: dotColor1,
                  animation: `orbital-pulse ${2 + i * 0.3}s ease-in-out infinite ${i * 0.4}s`,
                }}
              />
            );
          })}
        </div>

        {/* Ring 2 — 2 dots, faster, opposite direction */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            animation: 'orbital-spin-2 5s linear infinite reverse',
          }}
        >
          {[0, 180].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const x = center + r2 * Math.cos(rad);
            const y = center + r2 * Math.sin(rad);
            return (
              <div
                key={`r2-${i}`}
                style={{
                  position: 'absolute',
                  left: x - 3,
                  top: y - 3,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor2,
                  opacity: 0.7,
                  animation: `orbital-pulse ${1.8 + i * 0.5}s ease-in-out infinite ${i * 0.6}s`,
                }}
              />
            );
          })}
        </div>

        {/* Ring 3 — single accent dot, fastest */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            animation: 'orbital-spin-3 3.5s linear infinite',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: center + r1 * 0.7 - 3.5,
              top: center - 3.5,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: dotColor3,
              boxShadow: `0 0 8px ${dotColor3}`,
              animation: 'orbital-pulse 1.5s ease-in-out infinite',
            }}
          />
        </div>

        {/* Center: Nomad logo */}
        <div
          style={{
            position: 'absolute',
            left: center - logoSize / 2,
            top: center - logoSize / 2,
            width: logoSize,
            height: logoSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <NomadIcon
            size={logoSize * 0.75}
            animated
            className={dark ? 'text-zinc-400' : 'text-zinc-500'}
          />
        </div>
      </div>

      {/* Status text */}
      {status && (
        <span className={`text-xs font-medium ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          {status}
        </span>
      )}
      {detail && (
        <span className={`text-[10px] font-mono tabular-nums ${dark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          {detail}
        </span>
      )}
    </div>
  );
}
