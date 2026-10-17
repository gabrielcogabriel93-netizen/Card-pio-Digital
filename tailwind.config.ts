import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Fontes carregadas por next/font em app/layout.tsx.
        sans: ['var(--font-body)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'Consolas', 'monospace'],
        hand: ['var(--font-hand)', 'cursive'],
      },
      colors: {
        // Cores fixas da marca da plataforma (lib/brand.ts) -- nunca
        // usadas no cardápio da loja, que segue a cor dela (primary-*).
        ink: '#14172B',
        comanda: '#FFD43B',
        caneta: '#2340E0',
        // Lê de CSS custom properties (definidas em globals.css com o
        // verde padrão) em vez de hex fixo. Isso permite que o cardápio
        // público de cada loja sobrescreva essas variáveis com a cor de
        // marca escolhida em Configurações, sem duplicar classes — ver
        // lib/theme.ts.
        primary: {
          50: 'rgb(var(--color-primary-50) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
export default config
