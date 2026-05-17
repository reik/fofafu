/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          warm: '#FFFBF5',
          card: '#FFFFFF',
        },
        ink: {
          lead: '#1F1B18',
          muted: '#5E534B',
        },
        brand: {
          primary: '#4D9463',
          warm: '#F0B24F',
        },
        feedback: {
          success: '#3F8A52',
          warning: '#D27A2A',
          error: '#B83B3B',
        },
      },
      boxShadow: {
        lift: '0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Nunito', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '4px',
        lg: '16px',
      },
    },
  },
  plugins: [],
};
