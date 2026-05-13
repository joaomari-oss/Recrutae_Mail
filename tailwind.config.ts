import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1440px' },
    },
    extend: {
      fontFamily: {
        sans:    ['DM Sans', 'sans-serif'],
        display: ['Fraunces', 'serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          coral:    'rgb(var(--brand-coral) / <alpha-value>)',
          orange:   'rgb(var(--brand-orange) / <alpha-value>)',
          dark:     'rgb(var(--brand-dark) / <alpha-value>)',
          charcoal: 'rgb(var(--brand-charcoal) / <alpha-value>)',
          surface:  'rgb(var(--brand-surface) / <alpha-value>)',
          white:    'rgb(var(--brand-white) / <alpha-value>)',
          muted:    'rgb(var(--brand-muted) / <alpha-value>)',
          success:  'rgb(var(--brand-success) / <alpha-value>)',
          warning:  'rgb(var(--brand-warning) / <alpha-value>)',
          error:    'rgb(var(--brand-error) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '0.8' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-up':        'fade-up 0.45s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-in':        'fade-in 0.3s ease-out forwards',
        'shimmer':        'shimmer 1.8s ease-in-out infinite',
        'float':          'float 4s ease-in-out infinite',
        'glow-pulse':     'glow-pulse 3s ease-in-out infinite',
      },
      boxShadow: {
        gold:         '0 4px 24px rgba(242,201,76,0.2)',
        'gold-lg':    '0 8px 48px rgba(242,201,76,0.3)',
        'card-hover': '0 12px 32px rgba(0,0,0,0.5)',
        'inner-top':  'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [],
}

export default config
