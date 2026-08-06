/**
 * DNS Ops Workbench — Tailwind v3 extend snippet (starter)
 * --------------------------------------------------------------------------
 * Paste this object into apps/web/tailwind.config.js under `theme.extend`.
 * It is ADDITIVE: it does not remove any default Tailwind utility, so every
 * existing class keeps working. New semantic utilities become available:
 *
 *   bg-brand / bg-brand-600 / text-success / border-warning / bg-danger-50 ...
 *
 * Colors are backed by the CSS custom properties in design-tokens.css, so
 * changing a value there updates every utility. Opacity modifiers
 * (e.g. bg-brand/50) are supported via the <alpha-value> placeholder.
 *
 * After pasting, ensure tokens.css is @imported at the top of app.css so the
 * CSS variables resolve at runtime.
 */
export const dnsOpsExtend = {
  colors: {
    brand: {
      50: 'var(--color-brand-50)',
      100: 'var(--color-brand-100)',
      200: 'var(--color-brand-200)',
      300: 'var(--color-brand-300)',
      400: 'var(--color-brand-400)',
      500: 'var(--color-brand-500)',
      600: 'var(--color-brand-600)',
      700: 'var(--color-brand-700)',
      800: 'var(--color-brand-800)',
      900: 'var(--color-brand-900)',
      DEFAULT: 'var(--color-brand-600)',
    },
    neutral: {
      50: 'var(--color-neutral-50)', 100: 'var(--color-neutral-100)',
      200: 'var(--color-neutral-200)', 300: 'var(--color-neutral-300)',
      400: 'var(--color-neutral-400)', 500: 'var(--color-neutral-500)',
      600: 'var(--color-neutral-600)', 700: 'var(--color-neutral-700)',
      800: 'var(--color-neutral-800)', 900: 'var(--color-neutral-900)',
    },
    success: {
      50: 'var(--color-success-50)', 100: 'var(--color-success-100)',
      500: 'var(--color-success-500)', 600: 'var(--color-success-600)',
      700: 'var(--color-success-700)', 800: 'var(--color-success-800)',
    },
    danger: {
      50: 'var(--color-danger-50)', 100: 'var(--color-danger-100)',
      200: 'var(--color-danger-200)', 500: 'var(--color-danger-500)',
      600: 'var(--color-danger-600)', 700: 'var(--color-danger-700)',
      800: 'var(--color-danger-800)',
    },
    warning: {
      50: 'var(--color-warning-50)', 100: 'var(--color-warning-100)',
      200: 'var(--color-warning-200)', 500: 'var(--color-warning-500)',
      700: 'var(--color-warning-700)', 900: 'var(--color-warning-900)',
    },
    info: {
      50: 'var(--color-info-50)', 100: 'var(--color-info-100)',
      500: 'var(--color-info-500)', 700: 'var(--color-info-700)',
      800: 'var(--color-info-800)',
    },
    accent: {
      500: 'var(--color-accent-500)', 600: 'var(--color-accent-600)',
      700: 'var(--color-accent-700)', DEFAULT: 'var(--color-accent-600)',
    },
  },
  borderRadius: {
    sm: 'var(--radius-sm)',
    DEFAULT: 'var(--radius)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    pill: 'var(--radius-pill)',
  },
  boxShadow: {
    sm: 'var(--shadow-sm)',
    DEFAULT: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
  },
  fontFamily: {
    sans: ['var(--font-sans)'],
    mono: ['var(--font-mono)'],
    display: ['var(--font-display)'],
  },
  fontSize: {
    xs: ['var(--text-xs)', { lineHeight: 'var(--leading-normal)' }],
    sm: ['var(--text-sm)', { lineHeight: 'var(--leading-normal)' }],
    base: ['var(--text-base)', { lineHeight: 'var(--leading-normal)' }],
    lg: ['var(--text-lg)', { lineHeight: 'var(--leading-normal)' }],
    xl: ['var(--text-xl)', { lineHeight: 'var(--leading-tight)' }],
    '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-tight)' }],
    '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-tight)' }],
    '4xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)' }],
  },
  transitionTimingFunction: { dns: 'var(--ease)' },
  transitionDuration: {
    fast: 'var(--dur-fast)',
    DEFAULT: 'var(--dur)',
    slow: 'var(--dur-slow)',
  },
  maxWidth: {
    container: 'var(--container-max)',
    narrow: 'var(--container-narrow)',
  },
};

/* Usage in tailwind.config.js:
 *   import { dnsOpsExtend } from '../../docs/design/tailwind.extend.js';
 *   export default { content: [...], theme: { extend: { ...dnsOpsExtend } }, plugins: [] };
 */
