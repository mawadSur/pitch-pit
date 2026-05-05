import { ImageResponse } from "next/og";

// Next.js App Router icon route. Generates a 192×192 PNG at request time
// (cached aggressively by Vercel/CDN). Used by browsers + PWA install
// prompts when /favicon.ico isn't appropriate (high-DPI, manifest icons).
//
// Aesthetic: gold "p" mark on the black void background (#0a0a0a) — same
// system the rest of the minimalist surface uses.

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
          color: "#FFB800",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 700,
          fontSize: 130,
          lineHeight: 1,
          letterSpacing: -6,
        }}
      >
        p
      </div>
    ),
    size,
  );
}
