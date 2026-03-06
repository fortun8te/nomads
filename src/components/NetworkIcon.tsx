/**
 * Animated Network Icon - SVG molecular structure with pulse animation
 * Used for loading states, processing indicators, or connection visualization
 */

interface NetworkIconProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

export function NetworkIcon({ size = 64, animated = true, className = '' }: NetworkIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <style>{`
          @keyframes pulse {
            0%, 100% {
              r: 4;
              opacity: 1;
            }
            50% {
              r: 6;
              opacity: 0.8;
            }
          }

          @keyframes rotate {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          @keyframes lineGrow {
            0% {
              stroke-dasharray: 0, 100;
            }
            100% {
              stroke-dasharray: 100, 100;
            }
          }

          .network-node {
            ${animated ? 'animation: pulse 2s ease-in-out infinite;' : ''}
          }

          .network-node:nth-child(2) {
            ${animated ? 'animation-delay: 0.2s;' : ''}
          }

          .network-node:nth-child(4) {
            ${animated ? 'animation-delay: 0.4s;' : ''}
          }

          .network-node:nth-child(6) {
            ${animated ? 'animation-delay: 0.6s;' : ''}
          }

          .network-line {
            ${animated ? 'animation: lineGrow 2s ease-in-out infinite;' : ''}
          }

          .network-line:nth-child(3) {
            ${animated ? 'animation-delay: 0.1s;' : ''}
          }

          .network-line:nth-child(5) {
            ${animated ? 'animation-delay: 0.2s;' : ''}
          }

          .network-line:nth-child(7) {
            ${animated ? 'animation-delay: 0.3s;' : ''}
          }

          .network-container {
            transform-origin: 50px 50px;
            ${animated ? 'animation: rotate 20s linear infinite;' : ''}
          }
        `}</style>
      </defs>

      <g className="network-container">
        {/* Connection Lines */}
        <line x1="50" y1="20" x2="70" y2="40" stroke="currentColor" strokeWidth="2" className="network-line" />
        <line x1="50" y1="20" x2="30" y2="40" stroke="currentColor" strokeWidth="2" className="network-line" />
        <line x1="70" y1="40" x2="50" y2="60" stroke="currentColor" strokeWidth="2" className="network-line" />
        <line x1="30" y1="40" x2="50" y2="60" stroke="currentColor" strokeWidth="2" className="network-line" />
        <line x1="70" y1="40" x2="30" y2="40" stroke="currentColor" strokeWidth="2" className="network-line" />

        {/* Nodes */}
        <circle cx="50" cy="20" r="4" fill="currentColor" className="network-node" />
        <circle cx="70" cy="40" r="4" fill="currentColor" className="network-node" />
        <circle cx="30" cy="40" r="4" fill="currentColor" className="network-node" />
        <circle cx="50" cy="60" r="4" fill="currentColor" className="network-node" />
        <circle cx="80" cy="30" r="3" fill="currentColor" className="network-node" />
      </g>
    </svg>
  );
}
