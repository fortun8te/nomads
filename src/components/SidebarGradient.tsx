/**
 * SidebarGradient — SVG filter-based animated gradient background
 *
 * Uses SVG feGaussianBlur on colored circles for premium blurred glow,
 * plus-lighter white ellipses for spotlight, curved light streaks,
 * and crescent subtract shapes with feTurbulence displacement.
 */
import { useEffect, useRef } from 'react';

export function SidebarGradient() {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current || typeof document === 'undefined') return;
    injected.current = true;
    const s = document.createElement('style');
    s.id = 'nomad-sidebar-anim';
    s.textContent = `
      @keyframes nsg-float1 {
        0% { transform: translate(0, 0) scale(1); }
        20% { transform: translate(8%, -6%) scale(1.08); }
        45% { transform: translate(-5%, 10%) scale(0.93); }
        70% { transform: translate(6%, 4%) scale(1.05); }
        100% { transform: translate(0, 0) scale(1); }
      }
      @keyframes nsg-float2 {
        0% { transform: translate(0, 0) scale(1); }
        30% { transform: translate(-10%, 8%) scale(1.1); }
        60% { transform: translate(7%, -5%) scale(0.92); }
        100% { transform: translate(0, 0) scale(1); }
      }
      @keyframes nsg-float3 {
        0% { transform: translate(0, 0) scale(1) rotate(0deg); }
        25% { transform: translate(12%, 5%) scale(1.06) rotate(1.5deg); }
        50% { transform: translate(-4%, -8%) scale(0.95) rotate(-1deg); }
        75% { transform: translate(-9%, 6%) scale(1.04) rotate(0.5deg); }
        100% { transform: translate(0, 0) scale(1) rotate(0deg); }
      }
      @keyframes nsg-pulse {
        0%, 100% { opacity: 0.35; }
        30% { opacity: 0.75; }
        60% { opacity: 0.5; }
        80% { opacity: 0.85; }
      }
      @keyframes nsg-breathe {
        0%, 100% { opacity: 0.15; transform: scale(1); }
        50% { opacity: 0.35; transform: scale(1.08); }
      }
      @keyframes nsg-sway {
        0%, 100% { transform: rotate(0deg) translateY(0); }
        25% { transform: rotate(3deg) translateY(-2%); }
        75% { transform: rotate(-2deg) translateY(1%); }
      }
      @keyframes nsg-lightray {
        0% { transform: rotate(-35deg) translateX(-120%); opacity: 0; }
        15% { opacity: 0.5; }
        50% { opacity: 0.7; }
        85% { opacity: 0.5; }
        100% { transform: rotate(-35deg) translateX(60%); opacity: 0; }
      }
      @keyframes nsg-drift {
        0% { transform: translate(0, 0); }
        33% { transform: translate(-15px, 20px); }
        66% { transform: translate(10px, -12px); }
        100% { transform: translate(0, 0); }
      }
      @keyframes nomad-btn-shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(200%); }
      }
    `;
    document.head.appendChild(s);
  }, []);

  return (
    <>
      {/* Black base */}
      <div className="absolute inset-0 bg-black" />

      {/* ── Group 1: Main gradient circles ── */}
      <div className="absolute" style={{ left: -589, top: -574 }}>

        {/* Ellipse 1: Blue glow circle, blur 250 */}
        <div className="absolute" style={{ left: -544, top: 182, width: 686, height: 686, animation: 'nsg-float1 18s ease-in-out infinite' }}>
          <div className="absolute" style={{ inset: '-72.89%' }}>
            <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1686 1686">
              <defs>
                <filter id="nsg-e1" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="1686" height="1686">
                  <feFlood floodOpacity="0" result="bg" />
                  <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                  <feGaussianBlur stdDeviation="250" />
                </filter>
              </defs>
              <g filter="url(#nsg-e1)"><circle cx="843" cy="843" r="343" fill="#2B79FF" /></g>
            </svg>
          </div>
        </div>

        {/* Ellipse 4: Black dark orb, blur 600 */}
        <div className="absolute" style={{ left: 118, top: -401, width: 686, height: 686, animation: 'nsg-float3 22s ease-in-out infinite' }}>
          <div className="absolute" style={{ inset: '-174.93%' }}>
            <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 3086 3086">
              <defs>
                <filter id="nsg-e4" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="3086" height="3086">
                  <feFlood floodOpacity="0" result="bg" />
                  <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                  <feGaussianBlur stdDeviation="600" />
                </filter>
              </defs>
              <g filter="url(#nsg-e4)" opacity="0.5"><circle cx="1543" cy="1543" r="343" fill="black" /></g>
            </svg>
          </div>
        </div>

        {/* Ellipse 5: Very diffused blue, blur 1250 */}
        <div className="absolute" style={{ left: -461, top: -574, width: 686, height: 686, animation: 'nsg-float2 20s ease-in-out infinite' }}>
          <div className="absolute" style={{ inset: '-364.43%' }}>
            <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5686 5686">
              <defs>
                <filter id="nsg-e5" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="5686" height="5686">
                  <feFlood floodOpacity="0" result="bg" />
                  <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                  <feGaussianBlur stdDeviation="1250" />
                </filter>
              </defs>
              <g filter="url(#nsg-e5)" opacity="0.5"><circle cx="2843" cy="2843" r="343" fill="#2B79FF" /></g>
            </svg>
          </div>
        </div>

        {/* Ellipse 3a: Blue glow, blur 450, 0.15 opacity */}
        <div className="absolute" style={{ left: -589, top: 0, width: 1050, height: 1050, animation: 'nsg-float3 24s ease-in-out infinite' }}>
          <div className="absolute" style={{ inset: '-85.71%' }}>
            <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2850 2850">
              <defs>
                <filter id="nsg-e3a" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="2850" height="2850">
                  <feFlood floodOpacity="0" result="bg" />
                  <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                  <feGaussianBlur stdDeviation="450" />
                </filter>
              </defs>
              <g filter="url(#nsg-e3a)" opacity="0.15"><circle cx="1425" cy="1425" r="525" fill="#2B79FF" /></g>
            </svg>
          </div>
        </div>

        {/* Ellipse 6: Blue circle, no blur, 0.15 opacity */}
        <div className="absolute" style={{ left: -246, top: -240, width: 1050, height: 1050, animation: 'nsg-breathe 16s ease-in-out infinite' }}>
          <svg className="absolute block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1050 1050">
            <circle cx="525" cy="525" r="525" fill="#2B79FF" opacity="0.15" />
          </svg>
        </div>

        {/* Ellipse 2a: White spotlight, blur 75, plus-lighter blend */}
        <div className="absolute" style={{ left: -420, top: 285, width: 480, height: 544, animation: 'nsg-pulse 12s ease-in-out infinite, nsg-drift 28s ease-in-out infinite', mixBlendMode: 'plus-lighter' as any }}>
          <div className="absolute" style={{ inset: '-27.57% -31.25%' }}>
            <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 780 844">
              <defs>
                <filter id="nsg-e2a" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="780" height="844">
                  <feFlood floodOpacity="0" result="bg" />
                  <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                  <feGaussianBlur stdDeviation="75" />
                </filter>
              </defs>
              <g filter="url(#nsg-e2a)" opacity="0.5" style={{ mixBlendMode: 'plus-lighter' as any }}>
                <ellipse cx="390" cy="422" rx="240" ry="272" fill="white" />
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Light streaks (Group 6) — curved white-to-blue paths ── */}
      <div className="absolute" style={{ left: -317, top: 329, width: 778, height: 838, animation: 'nsg-sway 14s ease-in-out infinite', transformOrigin: 'center' }}>
        <div className="absolute" style={{ inset: '-17.9% -19.28%' }}>
          <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1078 1138">
            <defs>
              <filter id="nsg-s1" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="45" y="0" width="1033" height="1013">
                <feFlood floodOpacity="0" result="bg" />
                <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                <feGaussianBlur stdDeviation="75" />
              </filter>
              <filter id="nsg-s2" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="70" width="1033" height="1013">
                <feFlood floodOpacity="0" result="bg" />
                <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                <feGaussianBlur stdDeviation="75" />
              </filter>
              <filter id="nsg-s3" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="29" y="125" width="1033" height="1013">
                <feFlood floodOpacity="0" result="bg" />
                <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                <feGaussianBlur stdDeviation="75" />
              </filter>
              <linearGradient id="nsg-lg1" gradientUnits="userSpaceOnUse" x1="388.066" y1="268.468" x2="853.97" y2="970.463">
                <stop stopColor="white" /><stop offset="1" stopColor="#2B79FF" />
              </linearGradient>
              <linearGradient id="nsg-lg2" gradientUnits="userSpaceOnUse" x1="343.066" y1="338.468" x2="808.97" y2="1040.46">
                <stop stopColor="white" /><stop offset="1" stopColor="#2B79FF" />
              </linearGradient>
              <linearGradient id="nsg-lg3" gradientUnits="userSpaceOnUse" x1="372.066" y1="393.468" x2="837.97" y2="1095.46">
                <stop stopColor="white" /><stop offset="1" stopColor="#2B79FF" />
              </linearGradient>
            </defs>
            <g filter="url(#nsg-s1)">
              <path d="M339.239 476.318C201.409 365.998 187.412 214.507 197.642 152.552C236.936 144.557 320.267 150.753 339.239 239.489C362.954 350.409 598.718 476.318 844.943 662.684C1091.17 849.049 723.574 894.516 598.718 843.553C473.862 792.59 511.527 614.219 339.239 476.318Z" fill="url(#nsg-lg1)" />
            </g>
            <g filter="url(#nsg-s2)">
              <path d="M294.239 546.318C156.409 435.998 142.412 284.507 152.642 222.552C191.936 214.557 275.267 220.753 294.239 309.489C317.954 420.409 553.718 546.318 799.943 732.684C1046.17 919.049 678.574 964.516 553.718 913.553C428.862 862.59 466.527 684.219 294.239 546.318Z" fill="url(#nsg-lg2)" />
            </g>
            <g filter="url(#nsg-s3)">
              <path d="M323.239 601.318C185.409 490.998 171.412 339.507 181.642 277.552C220.936 269.557 304.267 275.753 323.239 364.489C346.954 475.409 582.718 601.318 828.943 787.684C1075.17 974.049 707.574 1019.52 582.718 968.553C457.862 917.59 495.527 739.219 323.239 601.318Z" fill="url(#nsg-lg3)" />
            </g>
          </svg>
        </div>
      </div>

      {/* ── Ellipse 3b: Blue glow, blur 450, bottom area ── */}
      <div className="absolute" style={{ left: -407, top: 536, width: 1050, height: 1050, animation: 'nsg-float1 21s ease-in-out infinite' }}>
        <div className="absolute" style={{ inset: '-85.71%' }}>
          <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2850 2850">
            <defs>
              <filter id="nsg-e3b" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="2850" height="2850">
                <feFlood floodOpacity="0" result="bg" />
                <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                <feGaussianBlur stdDeviation="450" />
              </filter>
            </defs>
            <g filter="url(#nsg-e3b)" opacity="0.4"><circle cx="1425" cy="1425" r="525" fill="#2B79FF" /></g>
          </svg>
        </div>
      </div>

      {/* ── Ellipse 2b: White glow, blur 75, plus-lighter, top-right ── */}
      <div className="absolute" style={{ left: 250, top: 0, width: 480, height: 799, animation: 'nsg-pulse 10s ease-in-out infinite 3s, nsg-drift 24s ease-in-out infinite reverse', mixBlendMode: 'plus-lighter' as any }}>
        <div className="absolute" style={{ inset: '-18.77% -31.25%' }}>
          <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 780 1099">
            <defs>
              <filter id="nsg-e2b" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="780" height="1099">
                <feFlood floodOpacity="0" result="bg" />
                <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                <feGaussianBlur stdDeviation="75" />
              </filter>
            </defs>
            <g filter="url(#nsg-e2b)" opacity="0.5" style={{ mixBlendMode: 'plus-lighter' as any }}>
              <ellipse cx="390" cy="549.5" rx="240" ry="399.5" fill="white" />
            </g>
          </svg>
        </div>
      </div>

      {/* ── Subtract 1: Dark crescent cutout with textured edge ── */}
      <div className="absolute flex items-center justify-center" style={{ left: -92, top: -129, width: 634, height: 1008 }}>
        <div className="flex-none" style={{ transform: 'scale(1, -1) rotate(180deg)', width: 634, height: 1008 }}>
          <div style={{ position: 'relative', width: 634, height: 1008 }}>
            <div className="absolute" style={{ inset: '-24.8% -39.43%' }}>
              <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1134 1508">
                <defs>
                  <filter id="nsg-sub1" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="1134" height="1508">
                    <feFlood floodOpacity="0" result="bg" />
                    <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                    <feTurbulence baseFrequency="0.02 0.02" numOctaves={3} seed="701" type="fractalNoise" />
                    <feDisplacementMap in="shape" result="displaced" scale="200" width="100%" height="100%" xChannelSelector="R" yChannelSelector="G" />
                    <feMerge result="texture"><feMergeNode in="displaced" /></feMerge>
                    <feGaussianBlur stdDeviation="125" />
                  </filter>
                </defs>
                <g filter="url(#nsg-sub1)">
                  <path d="M754 250C798.951 250 842.527 255.886 884 266.927C668.654 324.255 510 520.599 510 754C510 987.401 668.654 1183.74 884 1241.07C842.526 1252.11 798.951 1258 754 1258C475.648 1258 250 1032.35 250 754C250 475.648 475.648 250 754 250Z" fill="black" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── Subtract 2: Larger dark crescent, more blur ── */}
      <div className="absolute flex items-center justify-center" style={{ left: 193, top: -129, width: 634, height: 1008 }}>
        <div className="flex-none" style={{ transform: 'scale(1, -1) rotate(180deg)', width: 634, height: 1008 }}>
          <div style={{ position: 'relative', width: 634, height: 1008 }}>
            <div className="absolute" style={{ inset: '-54.56% -86.75%' }}>
              <svg className="block w-full h-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1734 2108">
                <defs>
                  <filter id="nsg-sub2" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="1734" height="2108">
                    <feFlood floodOpacity="0" result="bg" />
                    <feBlend in="SourceGraphic" in2="bg" mode="normal" result="shape" />
                    <feTurbulence baseFrequency="0.02 0.02" numOctaves={3} seed="701" type="fractalNoise" />
                    <feDisplacementMap in="shape" result="displaced" scale="200" width="100%" height="100%" xChannelSelector="R" yChannelSelector="G" />
                    <feMerge result="texture"><feMergeNode in="displaced" /></feMerge>
                    <feGaussianBlur stdDeviation="275" />
                  </filter>
                </defs>
                <g filter="url(#nsg-sub2)">
                  <path d="M1054 550C1098.95 550 1142.53 555.886 1184 566.927C968.654 624.255 810 820.599 810 1054C810 1287.4 968.654 1483.74 1184 1541.07C1142.53 1552.11 1098.95 1558 1054 1558C775.648 1558 550 1332.35 550 1054C550 775.648 775.648 550 1054 550Z" fill="black" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lightray: Sweeping white beam with plus-lighter ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ mixBlendMode: 'plus-lighter' as any }}>
        <div className="absolute" style={{
          top: '20%',
          left: '-50%',
          width: '200%',
          height: 200,
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.02) 70%, transparent 100%)',
          filter: 'blur(30px)',
          animation: 'nsg-lightray 14s ease-in-out infinite',
        }} />
      </div>
    </>
  );
}
