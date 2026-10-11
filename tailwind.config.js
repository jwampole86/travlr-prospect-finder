// Theme colors are CSS variables, which Tailwind cannot apply opacity modifiers to
// (e.g. text-danger/80, bg-primary/10 would silently generate no CSS).
// Resolve alpha with color-mix so every token supports the /NN syntax.
const withAlpha = (variable) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `var(${variable})`
    : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        background: withAlpha('--background'),
        foreground: withAlpha('--foreground'),
        primary: {
          DEFAULT: withAlpha('--primary'),
          foreground: withAlpha('--primary-foreground'),
        },
        secondary: {
          DEFAULT: withAlpha('--secondary'),
          foreground: withAlpha('--secondary-foreground'),
        },
        accent: {
          DEFAULT: withAlpha('--accent'),
          foreground: withAlpha('--accent-foreground'),
        },
        muted: {
          DEFAULT: withAlpha('--muted'),
          foreground: withAlpha('--muted-foreground'),
        },
        card: {
          DEFAULT: withAlpha('--card'),
          foreground: withAlpha('--card-foreground'),
        },
        border: withAlpha('--border'),
        input: withAlpha('--input'),
        ring: withAlpha('--ring'),
        success: {
          DEFAULT: withAlpha('--success'),
          foreground: withAlpha('--primary-foreground'),
          bg: withAlpha('--success-bg'),
          border: withAlpha('--success-border'),
        },
        warning: {
          DEFAULT: withAlpha('--warning'),
          bg: withAlpha('--warning-bg'),
          border: withAlpha('--warning-border'),
        },
        danger: {
          DEFAULT: withAlpha('--danger'),
          bg: withAlpha('--danger-bg'),
          border: withAlpha('--danger-border'),
        },
        destructive: {
          DEFAULT: withAlpha('--danger'),
          foreground: withAlpha('--primary-foreground'),
        },
        info: {
          DEFAULT: withAlpha('--info'),
          bg: withAlpha('--info-bg'),
          border: withAlpha('--info-border'),
        },
        neutral: {
          DEFAULT: withAlpha('--neutral'),
          bg: withAlpha('--neutral-bg'),
          border: withAlpha('--neutral-border'),
        },
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'calc(var(--radius) - 2px)',
        md: 'var(--radius)',
        lg: 'calc(var(--radius) + 2px)',
        xl: 'calc(var(--radius) + 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};