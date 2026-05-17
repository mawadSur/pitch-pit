import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFraunces, loadFrauncesItalic } from "@/lib/og-fonts";

// Recap OG card — `/api/og/recap/[weekN]`. Renders a 1200×630 share card
// for /recap/[weekN]. Visual: black void + gold week badge + winner
// title in Fraunces + the final_score numeral pinned to the right.
//
// Mirrors the BUILT card's three-band layout (kicker / title-score /
// verdict-footer) so the three OG variants read as siblings in any feed.
// Uses the shared `lib/og-fonts.ts` loader — the spec is explicit that
// font loading must not be reimplemented here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 630 } as const;

type RecapOg = {
  weekNumber: number;
  status: string;
  title: string | null;
  verdict: string | null;
  finalScore: number | null;
  aiScore: number | null;
};

async function fetchRecapOg(weekNumber: number): Promise<RecapOg | null> {
  try {
    const admin = createAdminClient();
    // Pull the week + the winner_idea in a single embedded select. If
    // status is 'open' we still return — the recap page itself 404s on
    // open weeks, but the OG renderer's job is to render the badge even
    // if the recap page won't (a 404 share card is worse than a generic
    // "Week N" badge).
    const { data: week } = await admin
      .from("weeks")
      .select(
        "week_number, status, winner_idea_id, winner:ideas!weeks_winner_idea_id_fkey(title, verdict, score, final_score)",
      )
      .eq("week_number", weekNumber)
      .maybeSingle();
    if (!week) return null;

    // PostgREST returns embedded as object or array depending on FK
    // cardinality inference. Normalize.
    const winnerRaw = (week as Record<string, unknown>).winner;
    const winner = Array.isArray(winnerRaw)
      ? (winnerRaw[0] as Record<string, unknown> | undefined)
      : (winnerRaw as Record<string, unknown> | null);

    return {
      weekNumber: week.week_number as number,
      status: week.status as string,
      title: (winner?.title as string | null) ?? null,
      verdict: (winner?.verdict as string | null) ?? null,
      finalScore: (winner?.final_score as number | null) ?? null,
      aiScore: (winner?.score as number | null) ?? null,
    };
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
  { params }: { params: Promise<{ weekN: string }> },
) {
  const { weekN } = await params;
  const n = Number.parseInt(weekN, 10);
  if (!Number.isFinite(n) || n < 1) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const [recap, frauncesData, frauncesItalicData] = await Promise.all([
    fetchRecapOg(n),
    loadFraunces(),
    loadFrauncesItalic(),
  ]);

  if (!recap) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const finalScore =
    recap.finalScore ??
    (recap.aiScore != null ? recap.aiScore * 10 : null);
  const title = recap.title ?? "The week in review";
  const verdict = recap.verdict ?? "To the victor go the tokens.";

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
          // Gold-heavy void — recap is the editorial closer of the week,
          // so the kicker palette leans gold while built keeps verdigris.
          background:
            "radial-gradient(circle at 25% 30%, rgba(255,184,0,0.15) 0%, #0a0a0a 60%), radial-gradient(circle at 80% 80%, rgba(91,138,110,0.10) 0%, transparent 55%), #0a0a0a",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Ambient gold upper-left */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: -120,
            width: 600,
            height: 600,
            background:
              "radial-gradient(circle, rgba(255,184,0,0.20) 0%, transparent 65%)",
            filter: "blur(60px)",
          }}
        />
        {/* Ambient verdigris lower-right */}
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

        {/* TOP — kicker row: hourglass + "pitch-pit" + WEEK badge */}
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
            <span>· pitch-pit · recap ·</span>
          </div>
          {/* WEEK badge — gold-bordered pill mirrors the BUILT stamp but
              in the gold palette to signal "editorial" rather than
              "shipped". */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 22px",
              border: "2px solid rgba(255,184,0,0.85)",
              borderRadius: 6,
              fontSize: 22,
              fontFamily: "monospace",
              letterSpacing: 8,
              color: "#FFB800",
              textTransform: "uppercase",
              fontWeight: 700,
              transform: "rotate(-2deg)",
              background: "rgba(255,184,0,0.10)",
            }}
          >
            WEEK {recap.weekNumber}
          </div>
        </div>

        {/* MIDDLE — title (left) + score numeral (right) */}
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
                /100 · final
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
              pitchpit.app/recap/{recap.weekNumber}
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

  // Recap is immutable once the week closes. Per task spec:
  // s-maxage=3600 (1h fresh), stale-while-revalidate=86400 (24h SWR).
  image.headers.set(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400",
  );
  return image;
}
