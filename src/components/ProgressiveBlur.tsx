import { useState, useEffect, useCallback } from 'react';

/**
 * ProgressiveBlur — dark-theme edge blur overlay for scrollable containers.
 *
 * Renders stacked pseudo-layers of increasing backdrop-filter blur at the
 * top and/or bottom of its parent, creating a smooth fade-out instead of a
 * hard clip. Only shows blurred edges when the content is actually scrollable
 * in that direction.
 *
 * Usage:
 *   <div style={{ position: 'relative', overflow: 'hidden' }}>
 *     <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: 160 }}>
 *       ...content...
 *     </div>
 *     <ProgressiveBlur scrollRef={scrollRef} />
 *   </div>
 */

interface ProgressiveBlurProps {
  /** Ref to the scrollable element this blur overlays */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Height of each blur edge in px (default 28) */
  height?: number;
  /** Number of stacked blur layers (default 4) */
  layers?: number;
  /** Max blur radius in px (default 4) */
  maxBlur?: number;
  /** Background tint — should match container bg (default dark theme) */
  tint?: string;
  /** Class for the wrapper */
  className?: string;
}

export function ProgressiveBlur({
  scrollRef,
  height = 28,
  layers = 4,
  maxBlur = 4,
  tint = 'rgba(10, 10, 14, 0.97)',
  className = '',
}: ProgressiveBlurProps) {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const check = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const scrollable = scrollHeight > clientHeight + 2; // 2px tolerance
    setShowTop(scrollable && scrollTop > 4);
    setShowBottom(scrollable && scrollTop + clientHeight < scrollHeight - 4);
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    check();
    el.addEventListener('scroll', check, { passive: true });
    // Also observe size changes
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // Re-check periodically for streaming content
    const interval = setInterval(check, 300);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
      clearInterval(interval);
    };
  }, [scrollRef, check]);

  if (!showTop && !showBottom) return null;

  const layerStyle = (edge: 'top' | 'bottom', index: number): React.CSSProperties => {
    const fraction = (index + 1) / layers;
    const blur = maxBlur * fraction;
    const layerH = height * fraction;
    const opacity = 0.15 + 0.55 * fraction; // ramp from subtle to solid
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      ...(edge === 'top' ? { top: 0 } : { bottom: 0 }),
      height: layerH,
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      background: tint.replace(/[\d.]+\)$/, `${opacity})`),
      pointerEvents: 'none',
      zIndex: 10 + index,
    };
  };

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} style={{ zIndex: 20 }}>
      {showTop && Array.from({ length: layers }, (_, i) => (
        <div key={`top-${i}`} style={layerStyle('top', i)} />
      ))}
      {showBottom && Array.from({ length: layers }, (_, i) => (
        <div key={`bot-${i}`} style={layerStyle('bottom', i)} />
      ))}
    </div>
  );
}
