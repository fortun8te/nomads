/**
 * NomadIcon — Animated metaball-style logo
 *
 * Based on the Nomad brand SVG (Frame f1). Features a smooth looping
 * metaball animation inspired by Blender's metaball simulations.
 *
 * Usage:
 *   <NomadIcon />                    — Static logo (nav bar)
 *   <NomadIcon animated />           — Looping metaball animation (loading)
 *   <NomadIcon animated size={48} /> — Custom size loader
 */

import { useMemo } from 'react';

interface NomadIconProps {
  size?: number;
  animated?: boolean;
  className?: string;
  color?: string;
  glow?: boolean; // subtle ambient glow behind logo
}

export function NomadIcon({
  size = 24,
  animated = false,
  className = '',
  color = 'currentColor',
  glow = false,
}: NomadIconProps) {
  const id = useMemo(() => `nomad-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <svg
      width={size}
      height={size * (189 / 167)}
      viewBox="-8 -4 183 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        filter: animated
          ? `drop-shadow(0px ${Math.max(2, size * 0.06)}px ${Math.max(4, size * 0.12)}px rgba(0,0,0,0.18)) drop-shadow(0px ${Math.max(1, size * 0.02)}px ${Math.max(2, size * 0.04)}px rgba(0,0,0,0.12))`
          : `drop-shadow(0px ${Math.max(1, size * 0.04)}px ${Math.max(2, size * 0.06)}px rgba(0,0,0,0.12)) drop-shadow(0px 0.5px 1px rgba(0,0,0,0.08))`,
      }}
    >
      <defs>
        {animated && (
          <>
            {/* Metaball gooey filter — the key to the organic blob effect */}
            <filter id={`${id}-goo`}>
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
                result="goo"
              />
              <feComposite in="SourceGraphic" in2="goo" operator="atop" />
            </filter>
          </>
        )}

        {/* Ambient glow behind logo */}
        {glow && (
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="glow-blur" />
            <feColorMatrix in="glow-blur" mode="matrix" values="0 0 0 0 0.2  0 0 0 0 0.2  0 0 0 0 0.2  0 0 0 0.15 0" result="glow-color" />
            <feMerge>
              <feMergeNode in="glow-color" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}

        <style>{`
          ${animated ? `
            @keyframes nomad-breathe {
              0%, 100% {
                transform: scale(1) translateY(0);
              }
              50% {
                transform: scale(1.012) translateY(-1.5px);
              }
            }

            @keyframes nomad-morph {
              0%, 100% {
                transform: scale(1, 1);
              }
              50% {
                transform: scale(1.006, 0.994);
              }
            }

            @keyframes nomad-dot-float {
              0%, 100% {
                transform: translate(0, 0) scale(1);
                opacity: 1;
              }
              33% {
                transform: translate(-5px, 3px) scale(1.08);
                opacity: 0.92;
              }
              66% {
                transform: translate(2px, -2px) scale(0.95);
                opacity: 0.96;
              }
            }

            .nomad-body-${id} {
              transform-origin: 83px 94px;
              animation: nomad-morph 6s cubic-bezier(0.37, 0, 0.63, 1) infinite;
            }

            .nomad-dot-${id} {
              transform-origin: 149px 56px;
              animation: nomad-dot-float 5s cubic-bezier(0.37, 0, 0.63, 1) infinite;
            }

            .nomad-group-${id} {
              transform-origin: 83px 94px;
              animation: nomad-breathe 7s cubic-bezier(0.37, 0, 0.63, 1) infinite;
            }
          ` : `
            .nomad-body-${id} {}
            .nomad-dot-${id} {}
            .nomad-group-${id} {}
          `}
        `}</style>
      </defs>

      <g
        className={`nomad-group-${id}`}
        filter={animated ? `url(#${id}-goo)` : glow ? `url(#${id}-glow)` : undefined}
      >
        {/* Main molecule body */}
        <path
          className={`nomad-body-${id}`}
          d="M82.3205 1.52294C85.2661 1.69372 87.9435 2.12952 90.3586 3.24364C92.6508 4.30109 94.6208 5.92837 96.3625 8.34716L96.7082 8.84227C98.5015 11.4904 99.4422 14.6222 99.4094 17.8188C99.3975 23.4127 97.0689 26.778 94.0334 29.4888C92.5682 30.7972 90.8981 31.9885 89.3274 33.1684C87.7267 34.3709 86.1684 35.6019 84.7561 37.0806L84.757 37.0815C81.4872 40.5091 79.0495 44.8642 78.1555 49.4497L78.0735 49.894C76.642 58.1798 77.5965 65.0103 82.2512 71.8716L82.5705 72.3257C89.364 81.7862 101.33 86.0602 112.604 82.9975L112.61 82.9966C113.915 82.6483 115.191 82.1174 116.529 81.5093C117.83 80.9175 119.252 80.2214 120.678 79.647C123.602 78.4694 126.883 77.6534 130.815 78.645C134.06 79.4633 136.482 80.7703 138.285 82.4751C140.088 84.1796 141.19 86.2035 141.913 88.3247C142.63 90.4257 142.988 92.6635 143.281 94.8061C143.581 96.9931 143.811 99.0515 144.254 101.011C144.996 104.26 146.328 107.344 148.183 110.112L148.424 110.458C149.66 112.178 151.331 113.739 153.219 115.321C155.17 116.955 157.452 118.687 159.397 120.487C161.375 122.317 163.198 124.38 164.327 126.876C165.474 129.411 165.866 132.304 165.123 135.704C164.208 139.894 161.464 143.648 157.91 146.058C154.348 148.473 149.847 149.617 145.405 148.359V148.358C142.312 147.482 139.981 146.243 138.225 144.658C136.462 143.067 135.356 141.197 134.611 139.182C133.875 137.191 133.485 135.037 133.162 132.875C132.833 130.67 132.575 128.483 132.112 126.205V126.204C131.492 123.245 130.378 120.411 128.821 117.821V117.82C125.018 111.613 118.928 107.147 111.867 105.383V105.382C104.613 103.624 96.9619 104.85 90.6184 108.784L90.6174 108.783C84.3128 112.709 79.8555 119.01 78.2502 126.261L78.2473 126.273C75.9315 136.333 78.8013 147.041 86.8098 153.465C87.6708 154.156 88.5318 154.818 89.3889 155.479C90.2412 156.136 91.0906 156.793 91.9055 157.458C93.5315 158.783 95.0773 160.181 96.3322 161.783C98.9222 165.088 100.156 169.113 98.886 174.833L98.885 174.833C97.8006 179.697 94.2979 183.112 90.3645 185.465L90.2727 185.52L90.174 185.561C89.1322 185.998 88.0592 186.358 86.9631 186.638C80.9454 188.22 75.0828 186.327 71.2365 181.468C68.8715 178.482 67.961 175.303 67.4201 172.188C67.1543 170.657 66.9669 169.067 66.757 167.575C66.5431 166.053 66.2979 164.569 65.9074 163.1V163.099C61.8531 147.833 45.5367 139.247 30.6067 144.291H30.6057C29.134 144.788 27.721 145.446 26.1985 146.137C24.7087 146.813 23.1237 147.515 21.4348 148.011C13.1008 150.546 4.488 145.567 2.14084 137.33L2.03342 136.935C-1.09298 124.789 9.9355 113.152 22.3479 117.248H22.3469C24.157 117.801 25.9545 118.714 27.5891 119.516C29.2929 120.352 30.8433 121.08 32.3508 121.443C53.2081 126.467 71.487 108.143 66.1584 87.2339C64.2692 79.9191 59.5485 73.6563 53.0373 69.8266V69.8257C46.4955 66.0538 37.6748 65.143 30.5422 67.686C29.1205 68.193 27.6128 68.9281 25.9631 69.6938C24.3614 70.4373 22.6367 71.2034 20.9494 71.645L20.9406 71.6479C16.9338 72.6707 12.6834 72.0314 9.15353 69.8765V69.8755C2.66413 65.9263 0.59917 58.5458 2.0051 52.2095C3.41549 45.8531 8.39775 40.238 16.2219 40.0171L16.8684 40.0054C20.0783 40.0107 22.905 40.9631 25.5344 42.019C28.4099 43.1738 30.9449 44.3962 33.8205 45.0395L33.8391 45.0434L33.8576 45.0483C40.5473 46.7249 47.9517 45.1371 54.0647 41.3364C60.1768 37.5362 64.8396 31.6227 66.1936 24.8481L66.3987 23.772C66.8483 21.296 67.1093 19.0621 67.4192 16.9419C67.7662 14.5668 68.1766 12.3201 69.0266 10.314C69.8964 8.26094 71.2153 6.48144 73.3215 5.00243C75.3957 3.54597 78.1711 2.425 81.8947 1.55907L82.1047 1.51024L82.3205 1.52294Z"
          fill={color}
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* Detached dot — orbits in metaball animation */}
        <path
          className={`nomad-dot-${id}`}
          d="M146.232 40.1166C154.987 38.4713 163.424 44.2273 165.088 52.9819C166.752 61.7363 161.016 70.186 152.265 71.8696C143.49 73.5583 135.009 67.7997 133.341 59.018C131.673 50.2372 137.445 41.7671 146.232 40.1166Z"
          fill={color}
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
