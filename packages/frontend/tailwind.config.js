/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#F7F6F2',
        ink:      '#28251D',
        muted:    '#7A7974',
        border:   '#D4D1CA',
        accent:   '#01696F',
        critical: '#A12C7B',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '40px', letterSpacing: '-0.01em' }],
        section: ['20px', { lineHeight: '28px' }],
        body:    ['15px', { lineHeight: '24px' }],
        caption: ['12px', { lineHeight: '16px' }],
      },
      maxWidth: { page: '1280px' },
    },
  },
  plugins: [],
};
