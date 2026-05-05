import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScoreResult } from "@/lib/score-schema";
import type { JudgeId } from "./shared";

// Allows partial panels — when one judge errors we still want to persist
// with the 2/3 we got rather than throwing the whole submission away.
export type JudgePanel = Partial<Record<JudgeId, ScoreResult>>;

// Priority order for picking the canonical "summary" judge to populate
// the top-level ideas columns when the panel is partial. Gstack is
// preferred since the existing UI copy ("AI scoring") matches its lens.
const SUMMARY_PRIORITY: readonly JudgeId[] = ["gstack", "vee", "robbins"];

type Draft = {
  id: string;
  user_id: string | null;
  access_token: string;
  title: string;
  pitch: string;
  handle: string | null;
  resolved_idea_id: string | null;
};

// Idempotently persist the ideas row for this draft. If the draft already
// resolved (page refresh, double-render), return the existing idea id.
// Requires at least two judges in the panel — anything less and we
// don't have a meaningful consensus to show.
export async function persistJudgment(
  draft: Draft,
  panel: JudgePanel,
): Promise<{ ideaId: string }> {
  const supabase = createAdminClient();

  if (draft.resolved_idea_id) {
    return { ideaId: draft.resolved_idea_id };
  }

  const presentResults = SUMMARY_PRIORITY.map((id) => panel[id]).filter(
    (r): r is ScoreResult => !!r,
  );
  if (presentResults.length < 2) {
    throw new Error("Need at least two judges to persist a verdict.");
  }

  const avg = Math.round(
    presentResults.reduce((sum, r) => sum + r.score, 0) / presentResults.length,
  );
  const buildRecommended = avg >= 7;

  // Pick the first available judge by priority for the top-level summary.
  const summary = presentResults[0];

  const { data: row, error: dbErr } = await supabase
    .from("ideas")
    .insert({
      title: draft.title,
      pitch: draft.pitch,
      handle: draft.handle,
      user_id: draft.user_id,
      score: avg,
      verdict: summary.verdict,
      strengths: summary.strengths,
      concerns: summary.concerns,
      reasoning: summary.reasoning,
      build_recommended: buildRecommended,
      judge_scores: panel,
      status: "scored",
    })
    .select("id")
    .single();

  if (dbErr || !row) {
    console.error("[judgment] insert failure", dbErr);
    Sentry.captureException(dbErr ?? new Error("Insert returned no row"), {
      tags: { route: "judgment", phase: "supabase-insert" },
    });
    throw new Error("Failed to persist judgment.");
  }

  // Best-effort: link the draft → idea so refreshes are idempotent.
  const { error: linkErr } = await supabase
    .from("draft_pitches")
    .update({ resolved_idea_id: row.id })
    .eq("id", draft.id);
  if (linkErr) {
    console.warn("[judgment] draft→idea link failed", linkErr);
  }

  return { ideaId: row.id };
}

export type DraftLookup =
  | { status: "missing" }
  | { status: "expired"; resolvedIdeaId: string | null }
  | { status: "ok"; draft: Draft };

// Returns a structured verdict so the page can:
//   - 404 on truly-missing tokens
//   - redirect to /idea/[id] when the draft expired but had resolved
//   - render the dashboard when the draft is fresh
export async function loadDraftByToken(token: string): Promise<DraftLookup> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("draft_pitches")
    .select(
      "id, user_id, access_token, title, pitch, handle, resolved_idea_id, expires_at",
    )
    .eq("access_token", token)
    .maybeSingle();

  if (error || !data) return { status: "missing" };

  const isExpired = new Date(data.expires_at).getTime() < Date.now();
  if (isExpired) {
    return { status: "expired", resolvedIdeaId: data.resolved_idea_id };
  }

  const { expires_at: _expires_at, ...rest } = data;
  void _expires_at;
  return { status: "ok", draft: rest as Draft };
}
