import { ImageResponse } from "next/og";
import { loadFraunces } from "@/lib/og-fonts";

// Generic "Hall of Fame" card for the upcoming /winners gallery page.
// No per-row personalization — the gallery is the listing itself; this
// card just needs to read as "the place where weekly winners live."
// Uses the same minimalist `.scene` palette as `/api/og/[ideaId]` and
// the per-page idea card, so all three look like siblings when they
// surface in a feed.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 630 } as const;

export async function GET() {
  const frauncesData = await loadFraunces();
  const fonts: {
    name: string;
    data: ArrayBuffer;
    weight?: 400 | 600;
    style?: "normal" | "italic";
  }[] = [];
  if (frauncesData) {
    fonts.push({
      name: "Fraunces",
      data: frauncesData,
      weight: 600,
      style: "normal",
    });
  }
  const hasFraunces = frauncesData !== null;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "80px 88px",
          background:
            "radial-gradient(circle at 50% 30%, rgba(255,184,0,0.18) 0%, #0a0a0a 60%), #0a0a0a",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Twin ambient glows — gold above, verdigris below, mirroring
            the cinematic homepage panels. */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: "50%",
            width: 720,
            height: 460,
            transform: "translateX(-50%)",
            background:
              "radial-gradient(ellipse, rgba(255,209,122,0.22) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            right: -100,
            width: 520,
            height: 520,
            background:
              "radial-gradient(circle, rgba(136,184,156,0.18) 0%, transparent 65%)",
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
            width="18"
            height="27"
            viewBox="0 0 120 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="14" y="2" width="92" height="9" rx="1.5" fill="#FFB800" />
            <path
              d="M 18 11 L 102 11 L 64 88 L 56 88 Z"
              fill="#FFB800"
              opacity="0.3"
            />
            <path
              d="M 18 11 L 56 88 M 102 11 L 64 88"
              stroke="#FFB800"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <rect x="55" y="88" width="10" height="6" rx="1" fill="#FFB800" />
            <path
              d="M 56 94 L 64 94 L 102 169 L 18 169 Z"
              fill="#FFB800"
              opacity="0.6"
            />
            <path
              d="M 56 94 L 18 169 M 64 94 L 102 169"
              stroke="#FFB800"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <rect x="14" y="169" width="92" height="9" rx="1.5" fill="#FFB800" />
          </svg>
          <span>· pitch-pit ·</span>
        </div>

        {/* MIDDLE — hall of fame headline, centered */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            flex: 1,
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 132,
              fontWeight: 600,
              lineHeight: 0.96,
              letterSpacing: -5,
              color: "#FFB800",
              fontFamily: hasFraunces
                ? "Fraunces, Georgia, serif"
                : "Georgia, 'Times New Roman', serif",
              textShadow:
                "0 0 32px rgba(255,184,0,0.5), 0 0 96px rgba(255,184,0,0.25)",
            }}
          >
            Hall of Fame
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              color: "rgba(255,255,255,0.78)",
              fontStyle: "italic",
              fontWeight: 600,
              lineHeight: 1.3,
              marginTop: 32,
              maxWidth: 880,
              letterSpacing: -0.3,
              fontFamily: hasFraunces
                ? "Fraunces, Georgia, serif"
                : "Georgia, 'Times New Roman', serif",
            }}
          >
            Every weekly winner. Every shipped MVP.
          </div>
        </div>

        {/* BOTTOM — tagline + url */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 16,
              fontFamily: "monospace",
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,184,0,0.85)",
            }}
          >
            to the victor go the tokens
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 16,
              fontFamily: "monospace",
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            pitchpit.app/winners
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );

  image.headers.set(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800",
  );
  return image;
}
