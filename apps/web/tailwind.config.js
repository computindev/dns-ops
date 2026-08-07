/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          muted: 'var(--color-surface-muted)',
          selected: 'var(--color-surface-selected)',
        },
        ink: 'var(--color-ink)',
        text: 'var(--color-text)',
        muted: 'var(--color-muted)',
        faint: 'var(--color-faint)',
        line: 'var(--color-line)',
        brand: {
          DEFAULT: 'var(--color-brand)',
          strong: 'var(--color-brand-strong)',
          ink: 'var(--color-on-brand)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          surface: 'var(--color-info-surface)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          surface: 'var(--color-success-surface)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          surface: 'var(--color-warning-surface)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          surface: 'var(--color-danger-surface)',
        },
        unknown: {
          DEFAULT: 'var(--color-unknown)',
          surface: 'var(--color-unknown-surface)',
        },
        focus: 'var(--color-focus)',
      },
      borderRadius: {
        tight: 'var(--radius-tight)',
        panel: 'var(--radius-panel)',
        pill: 'var(--radius-pill)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      transitionDuration: {
        micro: 'var(--dur-micro)',
        short: 'var(--dur-short)',
        long: 'var(--dur-long)',
      },
      transitionTimingFunction: {
        enter: 'var(--ease-out)',
        exit: 'var(--ease-in)',
        toggle: 'var(--ease-in-out)',
      },
    },
  },
  plugins: [],
};
