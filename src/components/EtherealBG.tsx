/**
 * EtherealBG — Deepest background layer with organic warping blobs
 *
 * Uses CSS radial gradients for blob shapes + SVG feTurbulence/feDisplacementMap
 * for organic animation. GPU-accelerated.
 */

import { useId } from 'react';

interface EtherealBGProps {
  color?: string;
  scale?: number;
  speed?: number;
  className?: string;
}

export function EtherealBG({
  color = 'rgba(43, 121, 255, 0.04)',
  scale = 30,
  speed: _speed = 20,
  className = '',
}: EtherealBGProps) {
  const filterId = useId().replace(/:/g, '_');

  return (
    <div
      className={`absolute inset-0 ${className}`}
      style={{ zIndex: -20 }}
    >
      {/* SVG filter definition for organic warping */}
      <svg
        width="0"
        height="0"
        style={{ position: 'absolute' }}
        aria-hidden="true"
      >
        <defs>
          <filter id={`ethereal-warp-${filterId}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006 0.004"
              numOctaves={1}
              seed={3}
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Blob layer — CSS radial gradients warped by SVG filter */}
      <div
        style={{
          position: 'absolute',
          inset: '-20%',
          filter: `url(#ethereal-warp-${filterId})`,
          willChange: 'filter',
          transform: 'translateZ(0)',
          background: `
            radial-gradient(ellipse 40% 50% at 25% 30%, ${color}, transparent 70%),
            radial-gradient(ellipse 35% 45% at 70% 60%, ${color}, transparent 70%),
            radial-gradient(ellipse 50% 35% at 50% 80%, ${color}, transparent 70%)
          `,
        }}
      />
    </div>
  );
}
