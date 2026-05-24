/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'tlw-navy-deep': '#111226',
        'tlw-navy-rich': '#0C1940',
        'tlw-cream': '#F2F2F0',
        'tlw-warm-gray': '#8B8680',
        'tlw-espresso': '#403832',
        'tlw-near-black': '#0D0D0D',
        'tlw-signal-orange': '#E8650A',
        'tlw-surface': '#FFFFFF',
        'tlw-canvas': '#F2F2F0',
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'system-ui', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      borderRadius: {
        'tlw-sm': '4px',
        'tlw-md': '6px',
        'tlw-lg': '8px',
        'tlw-xl': '10px',
        'tlw-2xl': '12px',
      },
      transitionTimingFunction: {
        tlw: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        'tlw-fast': '150ms',
        'tlw-base': '200ms',
        'tlw-slow': '300ms',
      },
    },
  },
  plugins: [],
}
