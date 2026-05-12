import { ImageResponse } from "next/og";

// Static OG card for /about. Same gold-on-black cinematic treatment as
// the homepage card (app/opengraph-image.tsx), retitled so social
// unfurls of /about don't reuse the homepage tagline. Edge runtime —
// no DB, no async work, identical output every render.

export const runtime = "edge";
export const alt = "About pitch-pit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          background:
            "radial-gradient(circle at 30% 30%, #1a1408 0%, #0a0a0a 65%)",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* ambient gold glow upper-left */}
        <div
          style={{
            position: "absolute",
            top: -60,
            left: -100,
            width: 560,
            height: 560,
            background:
              "radial-gradient(circle, rgba(255,184,0,0.22) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
        />

        {/* TOP — kicker */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 18,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "rgba(255,184,0,0.9)",
            fontFamily: "monospace",
          }}
        >
          <svg
            width="16"
            height="24"
            viewBox="0 0 120 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="14" y="2" width="92" height="9" rx="1.5" fill="#FFB800" />
            <path d="M 18 11 L 102 11 L 64 88 L 56 88 Z" fill="#FFB800" opacity="0.3" />
            <path d="M 18 11 L 56 88 M 102 11 L 64 88" stroke="#FFB800" strokeWidth="5" strokeLinecap="round" />
            <rect x="55" y="88" width="10" height="6" rx="1" fill="#FFB800" />
            <path d="M 56 94 L 64 94 L 102 169 L 18 169 Z" fill="#FFB800" opacity="0.6" />
            <path d="M 56 94 L 18 169 M 64 94 L 102 169" stroke="#FFB800" strokeWidth="5" strokeLinecap="round" />
            <rect x="14" y="169" width="92" height="9" rx="1.5" fill="#FFB800" />
          </svg>
          · pitch-pit · about
        </div>

        {/* MIDDLE — headline + subhead */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            marginTop: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 80,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 1040,
            }}
          >
            A weekly contest for ideas that deserve to exist.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.35,
              marginTop: 28,
              maxWidth: 980,
            }}
          >
            AI-rated. Community-voted. The week&rsquo;s top score gets
            built — for free.
          </div>
        </div>

        {/* BOTTOM — url */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontFamily: "monospace",
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            pitchpit.app/about
          </div>
        </div>
      </div>
    ),
    size,
  );
}
