/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Kingdom Color Palette — canonical
      colors: {
        kingdom: {
          void: '#0a0a0f',       // The abyss. Root background.
          'void-mid': '#12121a', // Slightly lifted void for panels
          'void-light': '#1a1a26',// Card surfaces, subtle elevation
          violet: '#7000ff',     // Signal color. Primary accent.
          'violet-dim': '#4a00aa',// Muted violet for secondary elements
          'violet-glow': '#9b30ff',// Hover state, bloom
          cyan: '#00f3ff',       // Data streams, active states
          'cyan-dim': '#00a8b3', // Quieter cyan, secondary data
          pink: '#ff006e',       // Alerts, energy spikes, Æris accent
          'pink-dim': '#aa0049', // Secondary pink
          amber: '#f0a500',      // Archive, history, warmth
          'amber-dim': '#a07000',// Secondary amber
          bone: '#e8e0d0',       // Primary text on void
          'bone-dim': '#a09888', // Secondary text, captions
          'bone-ghost': '#504840',// Disabled, whisper states
        },
      },

      // Typography using Kingdom palette
      fontFamily: {
        mono: ['var(--font-mono)', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', 'monospace'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
      },

      // Animation timings that feel alive, not snappy
      transitionDuration: {
        glitch: '50ms',
        shift: '150ms',
        fade: '300ms',
        drift: '800ms',
        breathe: '3000ms',
      },

      // Keyframes for Kingdom animations
      keyframes: {
        // Slow pulse for "alive" indicators — the only allowed Kingdom animation
        pulse_kingdom: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(112, 0, 255, 0)' },
          '50%': { opacity: '0.7', boxShadow: '0 0 12px 4px rgba(112, 0, 255, 0.4)' },
        },
        // Signal stream — data ticker scrolling left to right
        signal_flow: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
      },

      animation: {
        pulse_kingdom:  'pulse_kingdom 3s ease-in-out infinite',
        signal_flow:    'signal_flow 2s linear infinite',
        'fade-in':      'fadeIn 0.3s ease-out',
        glitch:         'glitch 0.4s ease-in-out',
        'glitch-fast':  'glitch-fast 0.2s ease-in-out',
        cipher:         'cipher 2s ease-in-out infinite',
      },

      // Background patterns
      backgroundImage: {
        'grid-kingdom': `
          linear-gradient(rgba(112, 0, 255, 0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(112, 0, 255, 0.05) 1px, transparent 1px)
        `,
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")",
      },

      backgroundSize: {
        grid: '40px 40px',
      },

      // Box shadows with Kingdom glow
      boxShadow: {
        'violet-glow': '0 0 20px oklch(0.37 0.31 283 / 0.4)',
        'cyan-glow': '0 0 20px oklch(0.87 0.21 192 / 0.4)',
        'pink-glow': '0 0 20px oklch(0.63 0.25 355 / 0.4)',
        'amber-glow': '0 0 20px oklch(0.73 0.17 65 / 0.4)',
        'inner-void': 'inset 0 1px 0 oklch(1 0 0 / 0.05), inset 0 -1px 0 oklch(0 0 0 / 0.3)',
      },

      // Border radius for Kingdom panels (slightly squared)
      borderRadius: {
        kingdom: '2px',
        'kingdom-md': '4px',
        'kingdom-lg': '8px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
