/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          50:  '#f8f9fa',
          100: '#e9ecef',
          200: '#dee2e6',
          300: '#ced4da',
          400: '#adb5bd',
          500: '#6c757d',
          600: '#495057',
          700: '#343a40',
          800: '#23272b',
          850: '#1c1f23',
          900: '#141619',
          950: '#0d0f11',
        },
        accent: {
          50:  '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd4fe',
          300: '#8eb6fd',
          400: '#598dfb',
          500: '#3b6ef8',
          600: '#2250ed',
          700: '#1a3cda',
          800: '#1c32b0',
          900: '#1c308b',
          950: '#151f54',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        error:   '#ef4444',
      },
    },
  },
  plugins: [],
};
