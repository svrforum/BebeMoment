import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: {
          0: 'var(--color-base-0)',
          50: 'var(--color-base-50)',
          100: 'var(--color-base-100)',
          200: 'var(--color-base-200)',
          300: 'var(--color-base-300)',
          400: 'var(--color-base-400)',
          500: 'var(--color-base-500)',
          600: 'var(--color-base-600)',
          700: 'var(--color-base-700)',
          800: 'var(--color-base-800)',
          900: 'var(--color-base-900)',
          950: 'var(--color-base-950)',
        },
        point: {
          50: 'var(--color-point-50)',
          500: 'var(--color-point-500)',
          600: 'var(--color-point-600)',
        },
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        number: ['Pretendard Variable', 'SF Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
      },
      boxShadow: {
        // Two-layer light depth: a crisp 1px contact edge plus a soft
        // ambient spread. Reads as layered without heavy elevation.
        card: '0 0 0 1px rgba(0,0,0,.03), 0 1px 2px rgba(0,0,0,.04), 0 4px 12px -6px rgba(0,0,0,.08)',
        elevated:
          '0 0 0 1px rgba(0,0,0,.04), 0 2px 6px -2px rgba(0,0,0,.06), 0 12px 32px -12px rgba(0,0,0,.16)',
      },
      transitionTimingFunction: {
        ios: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
