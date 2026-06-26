import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm editorial palette (cream paper + near-black ink)
        paper: '#F4F1EC', // page background
        ink: '#1A1815', // primary text / foreground
        card: '#FFFFFF', // raised surfaces
        secondary: '#EDE9E1', // tinted panels / vendor headers
        muted: {
          DEFAULT: '#E5E0D8', // muted surfaces
          foreground: '#857F76', // muted / secondary text
        },
        // Brass accent
        accent: '#B87333', // primary brass
        brass: '#C4904A', // lighter accent (hero highlight)
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
