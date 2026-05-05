import localFont from "next/font/local";

export const jetbrains = localFont({
  src: [
    { path: "../../public/fonts/jetbrains-mono/latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/jetbrains-mono/latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../../public/fonts/jetbrains-mono/latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/jetbrains-mono/latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-scene-mono",
  display: "swap",
});
