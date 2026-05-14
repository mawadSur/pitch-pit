import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFraunces, loadFrauncesItalic } from "@/lib/og-fonts";

// Built-MVP OG card — `/api/og/[ideaId]`. Distinct from the per-page
// `opengraph-image.tsx` colocated in `app/(no-footer)/idea/[id]/` (the
// generic "scored idea" card). This route exists so the tweetable built
// artifact has a stable, cacheable URL that anything (winner page, winners
// gallery, recap, future tweet bots) can point at, with a BUILT-stamped
// visual treatment.
//
// Visual: black void + a large gold "BUILT" stamp, idea title in Fraunces
// serif, score numeral big and right-aligned, one-line verdict at the
// bottom. Mirrors the minimalist `.scene` token palette from app/scene.css
// (--scene-bg #0a0a0a, --scene-gold #FFB800, --scene-verdigris #5b8a6e —
// verdigris is the "final state / built" semantic per the design system).
//
// Requires status='built'. Anything else 404s as a JSON response, not an
// image — share-card unfurlers will then fall back to the per-page
// `opengraph-image.tsx` card which handles scored/queued/building ideas.
//
// nodejs runtime (not edge) so we share the existing `lib/og-fonts.ts`
// loader, which fetches a TTF binary from Google Fonts at cold start.
// `next/og` doesn't accept the WOFF2 files under /public/fonts/fraunces/,
// and we'd rather reuse the proven loader than ship a parallel font path.

export const runtime = "nodejs";
// Allow long stale-while-revalidate; the image is immutable per idea
// once built — content can't change without admin intervention.
export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 630 } as const;

type BuiltIdea = {
  title: string;
  verdict: string | null;
  score: number | null;
  final_score: number | null;
  status: string;
};

async function fetchBuiltIdea(id: string): Promise<BuiltIdea | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ideas")
      .select("title, verdict, score, final_score, status")
      .eq("id", id)
      .eq("status", "built")
      .maybeSingle<BuiltIdea>();
    return data;
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  const { ideaId } = await params;

  const [idea, frauncesData, frauncesItalicData] = await Promise.all([
    fetchBuiltIdea(ideaId),
    loadFraunces(),
    loadFrauncesItalic(),
  ]);

  if (!idea) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // 0–100 scale. Fallback chain (final_score → score×10) covers the
  // edge case where a built idea pre-dates the final_score trigger.
  const finalScore =
    idea.final_score ?? (idea.score != null ? idea.score * 10 : null);
  const title = idea.title;
  const verdict = idea.verdict ?? "Built into a live MVP.";

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
  if (frauncesItalicData) {
    fonts.push({
      name: "Fraunces",
      data: frauncesItalicData,
      weight: 600,
      style: "italic",
    });
  }
  const hasFraunces = frauncesData !== null;
  const hasFrauncesItalic = frauncesItalicData !== null;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          // Verdigris-tinged void — built ideas earn the "final state"
          // accent. Scene tokens: --scene-bg over --scene-verdigris glow.
          background:
            "radial-gradient(circle at 25% 30%, rgba(91,138,110,0.18) 0%, #0a0a0a 60%), radial-gradient(circle at 80% 80%, rgba(255,184,0,0.10) 0%, transparent 55%), #0a0a0a",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Ambient verdigris glow upper-left — signals "built" status */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: -120,
            width: 600,
            height: 600,
            background:
              "radial-gradient(circle, rgba(136,184,156,0.22) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
        />
        {/* Gold ambient lower-right */}
        <div
          style={{
            position: "absolute",
            bottom: -80,
            right: -100,
            width: 520,
            height: 520,
            background:
              "radial-gradient(circle, rgba(255,184,0,0.20) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
        />

        {/* TOP — kicker row: hourglass + "pitch-pit" + BUILT stamp */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
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
          {/* BUILT stamp — verdigris-bordered pill in monospace.
              Reads as a hand-applied rubber-stamp on the card. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 22px",
              border: "2px solid rgba(136,184,156,0.85)",
              borderRadius: 6,
              fontSize: 22,
              fontFamily: "monospace",
              letterSpacing: 8,
              color: "#88B89C",
              textTransform: "uppercase",
              fontWeight: 700,
              transform: "rotate(-2deg)",
              background: "rgba(91,138,110,0.10)",
            }}
          >
            BUILT
          </div>
        </div>

        {/* MIDDLE — title (left) + score numeral (right). Both share a
            flexible row so the score's tabular numeral pins to the right
            and the title fills available space. */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flex: 1,
            marginTop: 28,
            gap: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: -2,
              maxWidth: 740,
              color: "#fff",
              fontFamily: hasFraunces
                ? "Fraunces, Georgia, serif"
                : "Georgia, 'Times New Roman', serif",
            }}
          >
            {truncate(title, 110)}
          </div>
          {finalScore != null && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  display: "flex",
                  fontSize: 200,
                  fontWeight: 600,
                  color: "#FFB800",
                  lineHeight: 0.92,
                  letterSpacing: -8,
                  fontFamily: hasFraunces
                    ? "Fraunces, Georgia, serif"
                    : "Georgia, 'Times New Roman', serif",
                  textShadow:
                    "0 0 32px rgba(255,184,0,0.45), 0 0 64px rgba(255,184,0,0.25)",
                }}
              >
                {finalScore}
              </span>
              <span
                style={{
                  display: "flex",
                  fontSize: 18,
                  fontFamily: "monospace",
                  letterSpacing: 4,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.45)",
                  marginTop: 4,
                }}
              >
                /100 · final score
              </span>
            </div>
          )}
        </div>

        {/* BOTTOM — verdict pull-quote + url */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            marginTop: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "rgba(255,255,255,0.78)",
              fontStyle: "italic",
              fontWeight: 600,
              lineHeight: 1.3,
              maxWidth: 1040,
              letterSpacing: -0.3,
              fontFamily: hasFrauncesItalic
                ? "Fraunces, Georgia, serif"
                : "Georgia, 'Times New Roman', serif",
            }}
          >
            &ldquo;{truncate(verdict, 140)}&rdquo;
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 16,
                fontFamily: "monospace",
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "rgba(136,184,156,0.85)",
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
              pitchpit.app
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );

  // Built ideas are immutable. Cache hard at the CDN: 1d fresh,
  // 7d stale-while-revalidate. Per the task spec.
  image.headers.set(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800",
  );
  return image;
}
