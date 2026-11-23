/** @type {import('tailwindcss').Config} */
// CommonJS so Tailwind can hot-reload theme changes (Node require(esm) caching keeps ESM configs stale in a running dev server).
// Design B — "Lake & Sunset" tokens (bold, visually engaging, interactive).
// lake  = deep Lake Simcoe blues (800 is the brand surface; 'navy' keeps the legacy #00008b tie)
// coral = sunset accent (600+ carries white text at AA; 400/500 carry lake-950 text)
// sun   = amber highlight (text on dark surfaces / chips with lake-950 text)
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#00008b',
        lake: {
          50: '#EEF6FB',
          100: '#D6E9F5',
          200: '#A9D0EA',
          300: '#6FAED6',
          400: '#3A88BC',
          500: '#1D6A9E',
          600: '#135583',
          700: '#0E466D',
          800: '#0B3B5C',
          900: '#082B45',
          950: '#051B2E',
        },
        coral: {
          50: '#FFF1EE',
          100: '#FFDDD5',
          200: '#FFB9A8',
          300: '#FF8F78',
          400: '#FF6B52',
          500: '#F04E37',
          600: '#D63A24',
          700: '#B02D1B',
          800: '#8C2416',
        },
        sun: {
          100: '#FFF3D1',
          200: '#FFE29A',
          300: '#FFD166',
          400: '#FFB627',
          500: '#F59E0B',
        },
      },
      fontFamily: {
        display: ['"Cabinet Grotesk"', 'Fraunces', 'system-ui', 'sans-serif'],
        sans: ['Satoshi', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        pop: '0 6px 0 0 rgba(5, 27, 46, 0.9)',
        'pop-sm': '0 4px 0 0 rgba(5, 27, 46, 0.9)',
        lift: '0 18px 40px -18px rgba(8, 43, 69, 0.45)',
      },
    },
  },
  plugins: [],
};
