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
            fontSize: 18,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "rgba(255,184,0,0.9)",
            fontFamily: "monospace",
          }}
        >
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
