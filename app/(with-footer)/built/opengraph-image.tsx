import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

// Open Graph card for /built. Renders a simple count of shipped MVPs
// alongside the gallery tagline so a share unfurl says something
// concrete ("3 MVPs built so far") instead of a generic title. Falls
// back to the headline-only treatment when the count can't be fetched
// (private mode, transient DB error). Never throws.

export const runtime = "nodejs";
// Force dynamic so the count reflects current state on each render,
// not a build-time snapshot (when env vars may be unavailable). Mirrors
// the `dynamic = "force-dynamic"` set on app/built/page.tsx itself.
export const dynamic = "force-dynamic";
export const alt = "Built MVPs · pitch-pit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function fetchBuiltCount(): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .eq("status", "built")
      .not("mvp_url", "is", null);
    return count ?? null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const builtCount = await fetchBuiltCount();

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
            "radial-gradient(circle at 70% 30%, #1a1408 0%, #0a0a0a 65%)",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* ambient gold glow upper-right */}
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -80,
            width: 520,
            height: 520,
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
          · pitch-pit · built
        </div>

        {/* MIDDLE — headline + count */}
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
              fontSize: 84,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: -2,
              maxWidth: 1040,
            }}
          >
            The graveyard of winners.
          </div>
          {builtCount != null && builtCount > 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 16,
                marginTop: 36,
              }}
            >
              <span
                style={{
                  display: "flex",
                  fontSize: 96,
                  fontWeight: 700,
                  color: "#FFB800",
                  lineHeight: 1,
                  letterSpacing: -3,
                }}
              >
                {builtCount}
              </span>
              <span
                style={{
                  display: "flex",
                  fontSize: 32,
                  color: "rgba(255,255,255,0.65)",
                }}
              >
                {builtCount === 1 ? "MVP shipped" : "MVPs shipped"}
              </span>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                color: "rgba(255,255,255,0.65)",
                marginTop: 28,
                maxWidth: 880,
                lineHeight: 1.35,
              }}
            >
              Every weekly champion built into a live MVP — claimed by the
              founder, no equity, no fees.
            </div>
          )}
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
            pitchpit.app/built
          </div>
        </div>
      </div>
    ),
    size,
  );
}
