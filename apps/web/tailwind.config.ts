import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          cyan: '#06b6d4',
          blue: '#3b82f6',
          pink: '#ec4899',
          purple: '#a855f7',
          green: '#10b981',
        },
      },
      boxShadow: {
        neon: '0 0 20px rgba(34,211,238,0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
