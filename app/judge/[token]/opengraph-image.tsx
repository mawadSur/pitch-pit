import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-token Open Graph card for /judge/[token] — rendered when a judge
// link is shared on social before the user has claimed the pitch.
//
// The token resolves to a `draft_pitches` row. Two cases:
//   1. `resolved_idea_id` is set → the three-judge panel finished and
//      a permanent ideas row exists. We render the SAME treatment as
//      the per-idea OG (title + verdict + final score + vote count).
//   2. `resolved_idea_id` is null → deliberation is still in flight.
//      Render a placeholder with the pitch title + a "Three judges are
//      deliberating…" pull-quote + an AWAITING SCORE pill where the
//      score number would live.
//
// If the token doesn't match anything (expired and purged, or bogus),
// fall back to a fully generic on-brand card. We never 404 the OG
// route — a broken share preview is worse than a generic one.

export const runtime = "nodejs";
export const alt = "A pitch on pitch-pit — three judges deliberating";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type DraftForOg = {
  title: string;
  resolved_idea_id: string | null;
};

type IdeaForOg = {
  title: string;
  verdict: string | null;
  score: number | null;
  final_score: number | null;
  vote_count: number | null;
  build_recommended: boolean | null;
};

async function fetchDraft(token: string): Promise<DraftForOg | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("draft_pitches")
      .select("title, resolved_idea_id")
      .eq("access_token", token)
      .maybeSingle<DraftForOg>();
    return data;
  } catch {
    return null;
  }
}

async function fetchIdea(id: string): Promise<IdeaForOg | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ideas")
      .select(
        "title, verdict, score, final_score, vote_count, build_recommended",
      )
      .eq("id", id)
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
  params: { token: string };
}) {
  const draft = await fetchDraft(params.token);

  // Resolve the visual state up front so the JSX below stays flat.
  // Three states: resolved (idea row exists), deliberating (draft but
  // no idea yet), and unknown (token miss → generic fallback).
  type ResolvedState = {
    kind: "resolved";
    title: string;
    verdict: string;
    finalScore: number | null;
    voteCount: number;
    showBuildQueue: boolean;
  };
  type DeliberatingState = {
    kind: "deliberating";
    title: string;
  };
  type UnknownState = {
    kind: "unknown";
  };
  type State = ResolvedState | DeliberatingState | UnknownState;

  let state: State;
  if (!draft) {
    state = { kind: "unknown" };
  } else if (draft.resolved_idea_id) {
    const idea = await fetchIdea(draft.resolved_idea_id);
    const finalScore =
      idea?.final_score ?? (idea?.score != null ? idea.score * 10 : null);
    state = {
      kind: "resolved",
      title: idea?.title ?? draft.title,
      verdict: idea?.verdict ?? "AI-rated. Community-voted.",
      finalScore,
      voteCount: idea?.vote_count ?? 0,
      showBuildQueue:
        idea?.build_recommended ?? (finalScore != null && finalScore >= 70),
    };
  } else {
    state = { kind: "deliberating", title: draft.title };
  }

  const title =
    state.kind === "unknown" ? "An idea on pitch-pit" : state.title;
  const showBuildQueue =
    state.kind === "resolved" ? state.showBuildQueue : false;

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
          <span>· pitch-pit ·</span>
          {state.kind === "deliberating" && (
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
              deliberating
            </span>
          )}
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
            {state.kind === "resolved"
              ? `“${truncate(state.verdict, 180)}”`
              : state.kind === "deliberating"
                ? "Three judges are deliberating…"
                : "Three judges. One pitch."}
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
            {state.kind === "resolved" && state.finalScore != null ? (
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
                  {state.finalScore}
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
                  {state.voteCount} {state.voteCount === 1 ? "vote" : "votes"}
                </span>
              </>
            ) : state.kind === "deliberating" ? (
              <span
                style={{
                  display: "flex",
                  padding: "10px 20px",
                  background: "rgba(255,184,0,0.16)",
                  color: "#FFD17A",
                  borderRadius: 999,
                  fontSize: 18,
                  fontFamily: "monospace",
                  letterSpacing: 4,
                  textTransform: "uppercase",
                }}
              >
                Awaiting score
              </span>
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
