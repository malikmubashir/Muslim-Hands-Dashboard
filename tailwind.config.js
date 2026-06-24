/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./*.{ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: (() => {
        // Muslim Hands France brand turquoise scale (#28B8D8).
        const brand = {
          50: '#EAFAFD',
          100: '#C8F1F8',
          200: '#9FE7F1',
          300: '#6FD9E9',
          400: '#45C9DF',
          500: '#28B8D8',
          600: '#1F9DBA',
          700: '#1C8099',
          800: '#1B6878',
          900: '#1A5563',
        };
        // Remap the legacy green/emerald keys to brand turquoise so every
        // existing `emerald-*` / `green-*` utility renders in brand color.
        return { brand, emerald: brand, green: brand };
      })(),
    },
  },
  plugins: [],
};
