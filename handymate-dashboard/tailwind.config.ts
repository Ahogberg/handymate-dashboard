import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Kopplade till next/font-variablerna i app/layout.tsx (2026-08-17) —
      // self-hostade, inte Google-CDN. font-mono är för stora belopp/räknare
      // i hero-ytor (mockupens JetBrains Mono-mönster), inte löptext.
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      // Radie-tokens ur mockupens system (Business Twin-mockups 2026-08-17):
      // card för standardkort, input för fält, hero för stora mörka ytor.
      // rounded-2xl (16px) förblir giltig — card är samma värde med namn.
      borderRadius: {
        card: '16px',
        input: '10px',
        hero: '20px',
      },
      // Gradienter (används sparsamt): grad-dark-hero är mockupens mörka
      // teal-hero (Command Center/Value Ledger), grad-brand CTA-knapparna,
      // grad-tint det svaga teal-tonade kortet (Value Ledger-teasern).
      backgroundImage: {
        'grad-dark-hero': 'linear-gradient(135deg, #0f2e2a, #134e4a)',
        'grad-brand': 'linear-gradient(135deg, #0f766e, #14b8a6)',
        'grad-tint': 'linear-gradient(135deg, rgba(13,148,136,0.10), rgba(20,184,166,0.04))',
      },
      colors: {
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        secondary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        sidebar: {
          DEFAULT: '#1a3a4a',
          dark: '#0f2a35',
          light: '#2a4a5a',
        },
      },
      // Skuggtokens (saknades helt — ad hoc-skuggor spreds ut i varje
      // komponent istället). `brand` matchar de nya knapp-CTA:erna i
      // Projektytor-redesignen (2026-08-14).
      boxShadow: {
        xs: '0 1px 2px rgba(15,23,42,.04)',
        sm: '0 2px 8px rgba(15,23,42,.05)',
        md: '0 8px 24px rgba(15,23,42,.06)',
        lg: '0 20px 40px rgba(15,23,42,.08)',
        brand: '0 10px 25px -5px rgba(13,148,136,.25)',
      },
      // Rörelse-tokens som Tailwind-klasser (2026-08-06) — samma värden som
      // CSS-variablerna i app/globals.css, så transitions och animationer
      // delar tempo oavsett vilken av de två vägarna man använder.
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '250ms',
        slow: '400ms',
      },
    },
  },
  plugins: [],
}
export default config
