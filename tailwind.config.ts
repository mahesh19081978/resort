import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        resort: {
          ivory: '#FAF7F2',
          sand: '#F4ECE1',
          wood: '#8B5A2B',
          darkwood: '#4A2F13',
          forest: '#1E3F20',
          'forest-light': '#2D5A2F',
          gold: '#C5A059',
          'gold-light': '#DFC286',
          charcoal: '#22252A',
          stone: '#706E6B',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
