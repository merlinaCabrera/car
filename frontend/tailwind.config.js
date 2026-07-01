/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        scan: {
          '0%, 100%': { top: '20%', opacity: '1' },
          '50%':      { top: '80%', opacity: '0.6' },
        }
      },
      animation: {
        scan: 'scan 2s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}