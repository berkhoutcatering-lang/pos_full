// Tailwind v4 runs as a PostCSS plugin. Without this config Next imports
// only Tailwind's static preflight/theme and never generates utility
// classes, leaving every page unstyled.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
