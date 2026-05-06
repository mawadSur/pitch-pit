import localFont from "next/font/local";

// Fraunces — variable serif by Phaedra Charles + Undercase. The site's
// display face: used for h1 page titles, the verdict pull-quote on
// /idea/[id], the big score numerals, OG card titles. Has an `opsz`
// axis (made for display sizes) and an italic that reads as a real
// pen-stroke rather than mechanical slant. Variable woff2 covers the
// 100–900 weight range in a single file.
export const fraunces = localFont({
  src: [
    {
      path: "../../public/fonts/fraunces/latin-variable-wghtonly-normal.woff2",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../../public/fonts/fraunces/latin-variable-wghtonly-italic.woff2",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-display",
  display: "swap",
});
