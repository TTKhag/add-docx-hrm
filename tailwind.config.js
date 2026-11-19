/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '821px', lg: '1100px', xl: '1400px' },
    borderRadius: { none: '0', DEFAULT: '0' },
    extend: {
      colors: {
        ink: '#000', paper: '#fff', mut: '#6b6b6b', line: '#dcdcdc', soft: '#f3f3f3',
        hov: '#f7f7f7', sgray: '#8a8a8a', ghost: '#d4d4d4',
        ok: '#1b7f3a', warn: '#c77700', bad: '#c00',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { hard: '4px 4px 0 #000', hard5: '5px 5px 0 #000', dlg: '8px 8px 0 #000' },
    },
  },
  plugins: [],
};
