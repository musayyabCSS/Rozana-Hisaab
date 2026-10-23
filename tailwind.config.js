import colors from 'tailwindcss/colors';

// Theme-aware shades read their RGB channels from CSS variables defined in
// src/index.css, so the same utility classes render correctly in both the
// dark and light themes (see src/lib/theme.ts).
const themed = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const themedScale = (palette, shades) =>
  Object.fromEntries(shades.map((shade) => [shade, themed(`${palette}-${shade}`)]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: themedScale('slate', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        // Light accent shades are only readable on dark surfaces, so they
        // darken in the light theme. 500+ stay fixed for buttons and badges.
        emerald: { ...colors.emerald, ...themedScale('emerald', [200, 300, 400]) },
        rose: { ...colors.rose, ...themedScale('rose', [300, 400]) },
        red: { ...colors.red, ...themedScale('red', [300, 400]) },
        amber: { ...colors.amber, ...themedScale('amber', [300, 400]) },
        sky: { ...colors.sky, ...themedScale('sky', [400]) },
        // App background behind cards.
        canvas: themed('canvas'),
        // Dark text on bright accent buttons; identical in both themes.
        ink: '#020617',
      },
    },
  },
  plugins: [],
};
