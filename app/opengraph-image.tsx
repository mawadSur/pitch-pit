import { ImageResponse } from "next/og";
import { loadFraunces } from "@/lib/og-fonts";

// Node runtime so the Google Fonts fetch can use the standard fetch +
// arrayBuffer path. The edge runtime works too but loses the longer
// runtime cache lifetime we'd get from cold-warm-cold node lambdas.
export const runtime = "nodejs";

export const alt = "pitch-pit · weekly idea contest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const frauncesData = await loadFraunces();
  const hasFraunces = frauncesData !== null;
  const fonts: { name: string; data: ArrayBuffer; weight?: 400 | 600; style?: "normal" | "italic" }[] =
    frauncesData
      ? [{ name: "Fraunces", data: frauncesData, weight: 600, style: "normal" }]
      : [];

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
        {/* hourglass kicker glyph + wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <svg
            width="20"
            height="30"
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
          <div
            style={{
              display: "flex",
              fontSize: 18,
              letterSpacing: 8,
              textTransform: "uppercase",
              color: "#FFB800",
              fontFamily: "monospace",
            }}
          >
            · pitch-pit ·
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 108,
            fontWeight: 600,
            lineHeight: 1.02,
            textAlign: "center",
            letterSpacing: -3,
            maxWidth: 1040,
            // Fraunces 600 — characterful display serif. Falls back to
            // Georgia if the Google Fonts fetch failed, so a flaky network
            // never produces a broken share preview.
            fontFamily: hasFraunces
              ? "Fraunces, Georgia, serif"
              : "Georgia, 'Times New Roman', serif",
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
          enter the arena · pitchpit.app
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );
}
