import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

// Open Graph card for the leaderboard. Renders the current week's top 3
// pitches (title + final score) so the unfurl is meaningful — instead
// of a generic "leaderboard" tagline. Same cinematic dark+gold treatment
// as the per-idea OG.
//
// Falls back to a generic on-brand card when there are no scored pitches
// yet (or any DB issue). Never 404s.

export const runtime = "nodejs";
export const alt = "pitch-pit · current leaderboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Row = {
  title: string;
  final_score: number | null;
  score: number | null;
  vote_count: number | null;
};

async function fetchTop3(): Promise<Row[]> {
  try {
    const admin = createAdminClient();
    // Mirror the leaderboard's primary sort: final_score desc, score
    // tiebreak. Using the open week if migration 005 is in effect,
    // otherwise the last-7-days fallback.
    const { data: openWeek } = await admin
      .from("weeks")
      .select("id")
      .eq("status", "open")
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    let q = admin
      .from("ideas")
      .select("title, final_score, score, vote_count")
      .in("status", ["scored", "queued", "building", "built"])
      .not("score", "is", null);

    if (openWeek?.id) {
      q = q.eq("week_id", openWeek.id);
    } else {
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      q = q.gte("created_at", since);
    }

    const { data } = await q
      .order("final_score", { ascending: false, nullsFirst: false })
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3);

    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

export default async function OpengraphImage() {
  const top = await fetchTop3();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 80px",
          background:
            "radial-gradient(circle at 30% 20%, #1a1408 0%, #0a0a0a 65%)",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* ambient gold glow upper-left to balance the per-idea OG which
            puts it upper-right — at-a-glance visual difference between
            "leaderboard" and "single idea" share unfurls. */}
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

        {/* TOP — kicker + headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            · pitch-pit · this week
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 1040,
            }}
          >
            The leaderboard.
          </div>
        </div>

        {/* MIDDLE — top 3 rows or empty state */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            marginTop: 24,
            gap: 18,
          }}
        >
          {top.length === 0 ? (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                color: "rgba(255,255,255,0.65)",
                fontStyle: "italic",
              }}
            >
              First pitches landing soon. Be the first.
            </div>
          ) : (
            top.map((row, i) => {
              const rank = i + 1;
              const finalScore =
                row.final_score ??
                (row.score != null ? row.score * 10 : null);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 24,
                    paddingBottom: 14,
                    borderBottom:
                      i === top.length - 1
                        ? "none"
                        : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      width: 64,
                      fontSize: 44,
                      fontWeight: 700,
                      color: rank === 1 ? "#FFB800" : "rgba(255,255,255,0.45)",
                      fontFamily: "monospace",
                      letterSpacing: -1,
                    }}
                  >
                    {rank}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      flex: 1,
                      fontSize: 30,
                      fontWeight: 500,
                      color:
                        rank === 1
                          ? "#fff"
                          : "rgba(255,255,255,0.85)",
                      lineHeight: 1.2,
                    }}
                  >
                    {truncate(row.title, 60)}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 4,
                      fontFamily: "monospace",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        fontSize: 38,
                        fontWeight: 700,
                        color: "#FFB800",
                        letterSpacing: -1,
                      }}
                    >
                      {finalScore ?? "—"}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        fontSize: 18,
                        color: "rgba(255,255,255,0.45)",
                      }}
                    >
                      /100
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* BOTTOM — url */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 16,
              fontFamily: "monospace",
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            top builders this week
          </div>
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
            pitchpit.app/leaderboard
          </div>
        </div>
      </div>
    ),
    size,
  );
}
