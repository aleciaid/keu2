/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light mode colors
        background: {
          light: '#ffffff',
          dark: '#020617'
        },
        text: {
          light: '#1f2937',
          dark: '#f8fafc'
        },
        primary: {
          light: '#3b82f6',
          dark: '#60a5fa'
        },
        // Add more theme-specific colors as needed
      }
    },
  },
  plugins: [],
}