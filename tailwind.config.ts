import type { Config } from "tailwindcss";

// The minimalist scene tokens are scoped under `.scene` in app/scene.css.
// Legacy Capitol tokens (parchment / gold / blood / ash, font-display,
// font-body, tracking-decree/proclaim, forge/torch/carved shadows,
// torchlight / ember-* / pedestal-shimmer animations) lived here but were
// fully unused — confirmed by greps across app/ and components/. The CSS
// variables themselves remain in app/globals.css because the scrollbar,
// h1-h4 default font, body background, and selection styles still
// reference them.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  plugins: [],
};
export default config;
