/**
 * Design Tokens — Single source of truth for all theme values
 *
 * Color system:
 *   - Backgrounds: #09090b (primary), #0f0f0f (secondary/panels), #0c0c0c (tertiary)
 *   - Text: rgba(255,255,255,0.85) (primary), rgba(255,255,255,0.55) (secondary),
 *           rgba(255,255,255,0.30) (muted/dim), rgba(255,255,255,0.15) (ghost)
 *   - Borders: rgba(255,255,255,0.08) everywhere
 *   - Accent: #2B79FF (blue), #22c55e (green), #ef4444 (red), #f59e0b (amber)
 *
 * Font sizes:
 *   - Headers: 13-14px semibold
 *   - Body: 12px regular/medium
 *   - Labels/small: 10-11px medium
 *   - Tiny: 9px (uppercase tracking labels)
 *   - Mono/code: JetBrains Mono / ui-monospace
 */

export const tokens = {
  colors: {
    bg: {
      primary:   { dark: '#09090b', light: '#fafafa' },
      secondary: { dark: '#0f0f0f', light: '#f4f4f5' },
      tertiary:  { dark: '#0c0c0c', light: '#f9f9f9' },
      card:      { dark: 'rgba(24, 24, 27, 0.8)', light: 'rgba(255, 255, 255, 0.9)' },
      sidebar:   { dark: '#09090b', light: '#ffffff' },
      hover:     { dark: 'rgba(255,255,255,0.04)', light: 'rgba(0,0,0,0.03)' },
      selected:  { dark: 'rgba(255,255,255,0.08)', light: 'rgba(0,0,0,0.06)' },
    },
    accent: {
      primary: '#2B79FF',
      secondary: '#1D6AE5',
      tertiary: '#3B8AFF',
    },
    semantic: {
      green: '#22c55e',
      red: '#ef4444',
      amber: '#f59e0b',
      blue: '#3b82f6',
      emerald: '#10b981',
    },
    gradient: {
      primary: 'from-blue-600 via-blue-500 to-blue-600',
      subtle: 'from-blue-500/10 via-blue-500/5 to-blue-500/10',
      text: 'from-blue-400 to-blue-300',
      mesh: {
        spot1: 'rgba(43, 121, 255, 0.08)',
        spot2: 'rgba(43, 121, 255, 0.06)',
        spot3: 'rgba(43, 121, 255, 0.04)',
      },
    },
    text: {
      primary:   { dark: 'rgba(255,255,255,0.85)', light: '#18181b' },
      secondary: { dark: 'rgba(255,255,255,0.55)', light: '#71717a' },
      muted:     { dark: 'rgba(255,255,255,0.30)', light: '#a1a1aa' },
      ghost:     { dark: 'rgba(255,255,255,0.15)', light: '#d4d4d8' },
    },
    border: {
      subtle:  { dark: 'rgba(255,255,255,0.08)', light: 'rgba(0,0,0,0.06)' },
      medium:  { dark: 'rgba(255,255,255,0.12)', light: 'rgba(0,0,0,0.10)' },
      active:  { dark: 'rgba(43, 121, 255, 0.3)', light: 'rgba(43, 121, 255, 0.2)' },
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
    glow: '0 0 20px rgba(43, 121, 255, 0.1)',
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

/** Standard border class — always use this for dividers/borders */
export function borderColor(dark: boolean): string {
  return dark ? 'border-white/[0.08]' : 'border-black/[0.06]';
}

/** Primary text color */
export function textPrimary(dark: boolean): string {
  return dark ? 'text-white/[0.85]' : 'text-zinc-900';
}

/** Secondary text color */
export function textSecondary(dark: boolean): string {
  return dark ? 'text-white/[0.55]' : 'text-zinc-500';
}

/** Muted text color */
export function textMuted(dark: boolean): string {
  return dark ? 'text-white/[0.30]' : 'text-zinc-400';
}

/** Ghost text color — barely visible */
export function textGhost(dark: boolean): string {
  return dark ? 'text-white/[0.15]' : 'text-zinc-300';
}

export function glassCard(dark: boolean): string {
  return dark
    ? 'bg-zinc-900/80 border border-white/[0.08] rounded-2xl backdrop-blur-xl shadow-lg shadow-black/20'
    : 'bg-white/90 border border-black/[0.06] rounded-2xl backdrop-blur-xl shadow-lg shadow-zinc-200/50';
}

export function gradientText(): string {
  return 'bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent';
}

export function gradientBg(): string {
  return 'bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600';
}

export function gradientBorder(dark: boolean): string {
  return dark
    ? 'border border-blue-500/20'
    : 'border border-blue-400/30';
}

export function meshBg(): string {
  return `
    radial-gradient(ellipse at 20% 50%, rgba(43, 121, 255, 0.08), transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(43, 121, 255, 0.06), transparent 50%),
    radial-gradient(ellipse at 50% 80%, rgba(43, 121, 255, 0.04), transparent 50%)
  `.trim();
}

export function statusColor(status: 'healthy' | 'degraded' | 'down' | 'unknown'): string {
  return tokens.colors.status[status];
}
