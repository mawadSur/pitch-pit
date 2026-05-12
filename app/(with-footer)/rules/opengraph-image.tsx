import { ImageResponse } from "next/og";

// Static OG card for /rules. Foregrounds the 50/50 scoring formula
// (the headline takeaway from the rules page) so a share unfurl
// answers "how does this work?" before the click. Same dark+gold
// treatment as the rest of the OG family.

export const runtime = "edge";
export const alt = "Rules of the pit · pitch-pit";
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
            "radial-gradient(circle at 50% 35%, #1a1408 0%, #0a0a0a 65%)",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* ambient gold glow center-top */}
        <div
          style={{
            position: "absolute",
            top: -40,
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 400,
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
          · pitch-pit · rules
        </div>

        {/* MIDDLE — headline + formula */}
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
              fontSize: 76,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 1040,
            }}
          >
            Read the room. Then climb it.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 20,
              fontSize: 38,
              color: "rgba(255,255,255,0.85)",
              marginTop: 36,
            }}
          >
            <span style={{ display: "flex", color: "#FFB800", fontWeight: 700 }}>
              50%
            </span>
            <span style={{ display: "flex" }}>AI score</span>
            <span style={{ display: "flex", color: "rgba(255,255,255,0.4)" }}>+</span>
            <span style={{ display: "flex", color: "#FFB800", fontWeight: 700 }}>
              50%
            </span>
            <span style={{ display: "flex" }}>community vote</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontFamily: "monospace",
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.45)",
              marginTop: 18,
            }}
          >
            two shots forever · one winner every week
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
            pitchpit.app/rules
          </div>
        </div>
      </div>
    ),
    size,
  );
}
