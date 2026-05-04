import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "pitch-pit · weekly idea contest";
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
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 35%, #1a1408 0%, #0a0a0a 65%)",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* gold glow */}
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 200,
            background:
              "radial-gradient(circle, rgba(255,184,0,0.30) 0%, transparent 60%)",
            filter: "blur(40px)",
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 18,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#FFB800",
            fontFamily: "monospace",
            marginBottom: 24,
          }}
        >
          · pitch-pit ·
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 600,
            lineHeight: 1.05,
            textAlign: "center",
            letterSpacing: -2,
            maxWidth: 980,
          }}
        >
          To the victor go the tokens.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "rgba(255,255,255,0.65)",
            marginTop: 36,
            textAlign: "center",
            maxWidth: 880,
            lineHeight: 1.35,
          }}
        >
          Weekly startup idea contest. AI rates it, the community votes,
          the winner gets built.
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 48,
            display: "flex",
            fontSize: 16,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)",
            fontFamily: "monospace",
          }}
        >
          enter the arena · pitch-pit.app
        </div>
      </div>
    ),
    size,
  );
}
