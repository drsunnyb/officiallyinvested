/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Open Sans', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
        handwriting: ['Caveat', 'cursive'],
      },
      container: {
        center: true,
        padding: '2rem',
      },
    },
  },
  plugins: [],
};