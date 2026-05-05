import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScoreResult } from "@/lib/score-schema";
import type { JudgeId } from "./shared";

export type JudgePanel = Record<JudgeId, ScoreResult>;

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
// Top-level score columns get the gstack judge's values as the canonical
// "summary" so leaderboard sort + idea-page reveal keep working unchanged
// while the new dashboard renders the full per-judge breakdown.
export async function persistJudgment(
  draft: Draft,
  panel: JudgePanel,
): Promise<{ ideaId: string }> {
  const supabase = createAdminClient();

  if (draft.resolved_idea_id) {
    return { ideaId: draft.resolved_idea_id };
  }

  const avg = Math.round((panel.gstack.score + panel.vee.score + panel.robbins.score) / 3);
  const buildRecommended = avg >= 7;

  // Use gstack as the canonical "summary" voice — its lens (YC office hours)
  // is the closest fit for the existing UI copy that says "AI scoring."
  const { gstack } = panel;

  const { data: row, error: dbErr } = await supabase
    .from("ideas")
    .insert({
      title: draft.title,
      pitch: draft.pitch,
      handle: draft.handle,
      user_id: draft.user_id,
      score: avg,
      verdict: gstack.verdict,
      strengths: gstack.strengths,
      concerns: gstack.concerns,
      reasoning: gstack.reasoning,
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

export async function loadDraftByToken(token: string): Promise<Draft | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("draft_pitches")
    .select("id, user_id, access_token, title, pitch, handle, resolved_idea_id, expires_at")
    .eq("access_token", token)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  const { expires_at: _expires_at, ...rest } = data;
  void _expires_at;
  return rest as Draft;
}
