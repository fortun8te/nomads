/**
 * Design Tokens — Centralized theme for Foreplay-style UI
 * Glass-morphism cards, gradient accents, dark-first design
 */

export const tokens = {
  colors: {
    bg: {
      primary: { dark: '#09090b', light: '#fafafa' },       // zinc-950 / zinc-50
      secondary: { dark: '#18181b', light: '#f4f4f5' },     // zinc-900 / zinc-100
      card: { dark: 'rgba(24, 24, 27, 0.8)', light: 'rgba(255, 255, 255, 0.9)' },
      sidebar: { dark: '#09090b', light: '#ffffff' },
    },
    accent: {
      primary: '#8b5cf6',   // violet-500
      secondary: '#6366f1', // indigo-500
      tertiary: '#a855f7',  // purple-500
    },
    gradient: {
      primary: 'from-violet-600 via-indigo-500 to-purple-600',
      subtle: 'from-violet-500/10 via-indigo-500/5 to-purple-500/10',
      text: 'from-violet-400 to-indigo-400',
      mesh: {
        spot1: 'rgba(124, 58, 237, 0.08)',  // violet
        spot2: 'rgba(99, 102, 241, 0.06)',   // indigo
        spot3: 'rgba(139, 92, 246, 0.04)',   // purple
      },
    },
    text: {
      primary: { dark: '#f4f4f5', light: '#18181b' },       // zinc-100 / zinc-900
      secondary: { dark: '#a1a1aa', light: '#71717a' },     // zinc-400 / zinc-500
      muted: { dark: '#71717a', light: '#a1a1aa' },         // zinc-500 / zinc-400
    },
    border: {
      subtle: { dark: 'rgba(63, 63, 70, 0.3)', light: 'rgba(228, 228, 231, 0.6)' },
      active: { dark: 'rgba(139, 92, 246, 0.3)', light: 'rgba(139, 92, 246, 0.2)' },
    },
    status: {
      healthy: '#22c55e',
      degraded: '#eab308',
      down: '#ef4444',
      unknown: '#71717a',
    },
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },
  shadow: {
    card: '0 4px 24px rgba(0, 0, 0, 0.2)',
    glow: '0 0 20px rgba(139, 92, 246, 0.1)',
    elevated: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  sidebar: {
    collapsed: 64,
    expanded: 220,
  },
  animation: {
    spring: { type: 'spring' as const, stiffness: 300, damping: 30 },
    gentle: { type: 'spring' as const, stiffness: 200, damping: 25 },
    stagger: 0.05,
  },
} as const;

// ── Tailwind class helpers ──

export function glassCard(dark: boolean): string {
  return dark
    ? 'bg-zinc-900/80 border border-zinc-700/30 rounded-2xl backdrop-blur-xl shadow-lg shadow-black/20'
    : 'bg-white/90 border border-zinc-200/60 rounded-2xl backdrop-blur-xl shadow-lg shadow-zinc-200/50';
}

export function gradientText(): string {
  return 'bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent';
}

export function gradientBg(): string {
  return 'bg-gradient-to-r from-violet-600 via-indigo-500 to-purple-600';
}

export function gradientBorder(dark: boolean): string {
  return dark
    ? 'border border-violet-500/20'
    : 'border border-violet-400/30';
}

export function meshBg(): string {
  return `
    radial-gradient(ellipse at 20% 50%, rgba(124, 58, 237, 0.08), transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(99, 102, 241, 0.06), transparent 50%),
    radial-gradient(ellipse at 50% 80%, rgba(139, 92, 246, 0.04), transparent 50%)
  `.trim();
}

export function statusColor(status: 'healthy' | 'degraded' | 'down' | 'unknown'): string {
  return tokens.colors.status[status];
}
