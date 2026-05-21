/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme Peregrine - inspire du faucon pelerin :
        // plumage gris ardoise, "casque" sombre, anneau oculaire ambre.
        peregrine: {
          950: '#0b0f17',
          900: '#111722',
          800: '#1a2230',
          700: '#26303f',
          600: '#3a4657',
          400: '#7e8aa0',
          200: '#c3cad6',
        },
        falcon: {
          // accent ambre chaud (anneau oculaire et serres du faucon)
          DEFAULT: '#f0a23a',
          bright: '#ffb74d',
          dark: '#c97f1e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
