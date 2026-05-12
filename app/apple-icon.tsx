import { ImageResponse } from "next/og";

// Apple touch icon — used by iOS Safari "Add to Home Screen" + macOS Safari
// pinned tabs. 180×180 is the canonical size Apple recommends; iOS will
// downscale for smaller homescreen tiles.
//
// Hourglass glyph on void — same treatment as app/icon.tsx.
// Local inline SVG required: can't import the full client Hourglass component
// in the Edge ImageResponse renderer (CSS animations not supported there).

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        {/* Hourglass glyph — matches icon.tsx at slightly smaller render size. */}
        <svg
          width="80"
          height="120"
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
