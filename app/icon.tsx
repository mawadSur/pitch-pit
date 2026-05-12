import { ImageResponse } from "next/og";

// Next.js App Router icon route. Generates a 192×192 PNG at request time
// (cached aggressively by Vercel/CDN). Used by browsers + PWA install
// prompts when /favicon.ico isn't appropriate (high-DPI, manifest icons).
//
// Aesthetic: hourglass glyph on void background (#0a0a0a).
// Geometry derived from Hourglass.tsx (120×180 viewBox), simplified to
// inline SVG compatible with the Edge ImageResponse renderer.
// Can't import the full Hourglass client component here — it uses CSS
// animations and gradient defs that aren't supported in the OG runtime.

export const runtime = "edge";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 42%, #1a1408 0%, #0a0a0a 70%)",
        }}
      >
        {/* Hourglass glyph — two filled triangles joined at the neck.
            viewBox 0 0 120 180 → rendered at ~86×128 px inside the 192 icon. */}
        <svg
          width="86"
          height="128"
          viewBox="0 0 120 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* top cap */}
          <rect x="14" y="2" width="92" height="9" rx="1.5" fill="#FFB800" />
          {/* top cone fill */}
          <path d="M 18 11 L 102 11 L 64 88 L 56 88 Z" fill="#FFB800" opacity="0.25" />
          {/* top cone edges */}
          <path d="M 18 11 L 56 88 M 102 11 L 64 88" stroke="#FFB800" strokeWidth="4" strokeLinecap="round" />
          {/* neck */}
          <rect x="55" y="88" width="10" height="6" rx="1" fill="#FFB800" />
          {/* bottom cone fill */}
          <path d="M 56 94 L 64 94 L 102 169 L 18 169 Z" fill="#FFB800" opacity="0.55" />
          {/* bottom cone edges */}
          <path d="M 56 94 L 18 169 M 64 94 L 102 169" stroke="#FFB800" strokeWidth="4" strokeLinecap="round" />
          {/* bottom cap */}
          <rect x="14" y="169" width="92" height="9" rx="1.5" fill="#FFB800" />
        </svg>
      </div>
    ),
    size,
  );
}
