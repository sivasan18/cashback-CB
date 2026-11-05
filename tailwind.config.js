/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f8f6ff',
          100: '#E8DEFF', // Pale Sky (Official reference secondary)
          200: '#d7c7fe',
          300: '#be9ffd',
          400: '#9d70fa',
          500: '#7942f7',
          600: '#5B3DF5', // Raspberry (Official reference primary accent)
          700: '#4c2ce0',
          800: '#3e22be',
          900: '#341d9c',
          950: '#1e0e64',
        },
        raspberry: '#5B3DF5',
        palesky: '#E8DEFF',
        dark: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          850: '#172033',
          900: '#0f172a',
          950: '#090d16',
        }
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        'card-hover': '0 6px 16px -2px rgb(0 0 0 / 0.08), 0 2px 6px -2px rgb(0 0 0 / 0.04)',
        'card-dark': '0 4px 20px -2px rgb(0 0 0 / 0.35)',
        'glow-brand': '0 0 24px -2px rgba(91, 61, 245, 0.35)',
      },
    },
  },
  plugins: [],
}
