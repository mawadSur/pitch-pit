import localFont from "next/font/local";

// Geist Mono — variable monospace from Vercel. Replaces JetBrains Mono
// across the site: the tracking + character shapes are subtler, less
// "developer side-project" coded. Variable file covers 100–900 weights
// in a single woff2 download (~30KB). Reused under the same
// --font-scene-mono CSS variable name as the previous mono so all the
// `.scene-mono` class consumers pick it up without route-by-route edits.
const _geistMono = localFont({
  src: [
    {
      path: "../../public/fonts/geist-mono/latin-variable-wghtonly-normal.woff2",
      style: "normal",
      weight: "100 900",
    },
  ],
  variable: "--font-scene-mono",
  display: "swap",
});

export const geistMono = _geistMono;
// Legacy alias kept so the per-route page.tsx files (which still import
// the value as `jetbrains`) don't all need to be edited at once.
// The CSS variable name is unchanged (`--font-scene-mono`), so every
// consumer of `.scene-mono` picks up the new face transparently.
export const jetbrains = _geistMono;
