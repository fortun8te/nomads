/**
 * PulseLoader — 3 dots with staggered pulse animation
 * Clean, minimal loading indicator. `size` = overall bounding area.
 */

interface GridLoaderProps {
  size?: number;
  dark?: boolean;
  className?: string;
}

const STYLE_ID = 'orbital-loader-styles-v3';

function injectStyles() {
  if (typeof document === 'undefined') return;
  // Remove old versions
  document.getElementById('orbital-loader-styles-v2')?.remove();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes dotPulse3 {
      0%, 80%, 100% {
        opacity: 0.25;
        transform: scale(0.85);
      }
      40% {
        opacity: 1;
        transform: scale(1.1);
      }
    }
  `;
  document.head.appendChild(style);
}

export function OrbitalLoader({
  size = 24,
  dark = false,
  className = '',
}: GridLoaderProps) {
  injectStyles();

  const color = dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)';
  const dotSize = Math.max(6, Math.round(size * 0.12));
  const gap = Math.round(dotSize * 1);

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      style={{ gap: `${gap}px`, minHeight: `${dotSize + 4}px` }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: `${dotSize}px`,
            height: `${dotSize}px`,
            borderRadius: '50%',
            backgroundColor: color,
            animation: `dotPulse3 1.4s ease-in-out ${i * 0.16}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
