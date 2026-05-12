import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-idea Open Graph card — rendered when /idea/[id] is shared on
// social. Matches the cinematic dark+gold treatment of the static
// project OG (app/opengraph-image.tsx) but personalized: title, the
// verdict pull-quote, the final score, and the vote count.
//
// Falls back to a generic "scored idea" card if the row can't be
// fetched (private mode, expired idea, transient DB error). Worst
// case the share preview is on-brand but generic — never broken.

export const runtime = "nodejs";
export const alt = "Scored idea on pitch-pit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type IdeaForOg = {
  title: string;
  verdict: string | null;
  score: number | null;
  final_score: number | null;
  vote_count: number | null;
  build_recommended: boolean | null;
};

async function fetchIdea(id: string): Promise<IdeaForOg | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ideas")
      .select(
        "title, verdict, score, final_score, vote_count, build_recommended",
      )
      .eq("id", id)
      .in("status", ["scored", "queued", "building", "built"])
      .maybeSingle<IdeaForOg>();
    return data;
  } catch {
    return null;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idea = await fetchIdea(id);

  // Final score is 0–100 (50% AI + 50% community). Fallback chain
  // lets us still render something useful for ideas where the
  // community-vote half hasn't been computed yet.
  const finalScore =
    idea?.final_score ?? (idea?.score != null ? idea.score * 10 : null);
  const showBuildQueue =
    idea?.build_recommended ?? (finalScore != null && finalScore >= 70);
  const title = idea?.title ?? "An idea on pitch-pit";
  const verdict = idea?.verdict ?? "AI-rated. Community-voted.";
  const voteCount = idea?.vote_count ?? 0;

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
            gap: 16,
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
            <path d="M 18 11 L 102 11 L 64 88 L 56 88 Z" fill="#FFB800" opacity="0.3" />
            <path d="M 18 11 L 56 88 M 102 11 L 64 88" stroke="#FFB800" strokeWidth="5" strokeLinecap="round" />
            <rect x="55" y="88" width="10" height="6" rx="1" fill="#FFB800" />
            <path d="M 56 94 L 64 94 L 102 169 L 18 169 Z" fill="#FFB800" opacity="0.6" />
            <path d="M 56 94 L 18 169 M 64 94 L 102 169" stroke="#FFB800" strokeWidth="5" strokeLinecap="round" />
            <rect x="14" y="169" width="92" height="9" rx="1.5" fill="#FFB800" />
          </svg>
          <span>· pitch-pit ·</span>
          {showBuildQueue && (
            <span
              style={{
                display: "flex",
                padding: "8px 16px",
                background: "rgba(255,184,0,0.16)",
                color: "#FFD17A",
                borderRadius: 999,
                fontSize: 14,
                letterSpacing: 4,
              }}
            >
              build queue
            </span>
          )}
        </div>

        {/* MIDDLE — title + verdict, takes available height */}
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
              fontSize: 64,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              maxWidth: 1040,
            }}
          >
            {truncate(title, 110)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "rgba(255,255,255,0.78)",
              fontStyle: "italic",
              lineHeight: 1.35,
              marginTop: 24,
              maxWidth: 1040,
            }}
          >
            &ldquo;{truncate(verdict, 180)}&rdquo;
          </div>
        </div>

        {/* BOTTOM — score panel + url */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            {finalScore != null ? (
              <>
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
                  {finalScore}
                </span>
                <span
                  style={{
                    display: "flex",
                    fontSize: 32,
                    color: "rgba(255,255,255,0.45)",
                    letterSpacing: -1,
                  }}
                >
                  /100
                </span>
                <span
                  style={{
                    display: "flex",
                    fontSize: 18,
                    fontFamily: "monospace",
                    letterSpacing: 4,
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.45)",
                    marginLeft: 24,
                    paddingBottom: 12,
                  }}
                >
                  {voteCount} {voteCount === 1 ? "vote" : "votes"}
                </span>
              </>
            ) : (
              <span
                style={{
                  display: "flex",
                  fontSize: 32,
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                Awaiting score
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontFamily: "monospace",
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
              paddingBottom: 12,
            }}
          >
            pitchpit.app
          </div>
        </div>
      </div>
    ),
    size,
  );
}
