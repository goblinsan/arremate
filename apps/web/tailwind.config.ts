import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef7ee',
          500: '#f97316',
          900: '#7c2d12',
        },
      },
    },
  },
  plugins: [],
};

export default config;
