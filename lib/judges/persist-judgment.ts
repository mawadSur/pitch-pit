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
  // Up to 3 image URLs from the pitch-images bucket. Empty array when
  // no images. Carried across to the ideas row so /idea/[id] can render.
  image_urls?: string[];
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
      // Carry images over only when present + the column exists. Same
      // spread-guard pattern /api/draft uses to stay compatible with
      // pre-migration-015 environments.
      ...(draft.image_urls && draft.image_urls.length > 0
        ? { image_urls: draft.image_urls }
        : {}),
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

  // Atomic-claim: only one concurrent caller can transition the draft from
  // null → our new idea id. The `is("resolved_idea_id", null)` predicate
  // makes this a compare-and-swap; whichever transaction commits first wins.
  // The loser sees 0 rows updated, deletes its orphan idea, and reuses the
  // winner's id. Safe to delete the orphan because no votes/comments can
  // possibly reference an idea created microseconds ago.
  const { data: claimed, error: claimErr } = await supabase
    .from("draft_pitches")
    .update({ resolved_idea_id: row.id })
    .eq("id", draft.id)
    .is("resolved_idea_id", null)
    .select("id")
    .maybeSingle();

  if (claimErr) {
    // Real DB error on the claim — surface it. Don't try to clean up the
    // idea we just inserted; we don't know whether the claim won or lost.
    console.error("[judgment] draft→idea claim failed", claimErr);
    Sentry.captureException(claimErr, {
      tags: { route: "judgment", phase: "supabase-claim" },
    });
    throw new Error("Failed to persist judgment.");
  }

  if (claimed) {
    // We won the race.
    return { ideaId: row.id };
  }

  // We lost the race: another concurrent render already populated
  // resolved_idea_id. Drop our orphan idea and return the winning id.
  const { error: deleteErr } = await supabase
    .from("ideas")
    .delete()
    .eq("id", row.id);
  if (deleteErr) {
    console.warn("[judgment] orphan idea cleanup failed", deleteErr);
    Sentry.captureException(deleteErr, {
      tags: { route: "judgment", phase: "supabase-orphan-cleanup" },
    });
  }

  const { data: winner, error: winnerErr } = await supabase
    .from("draft_pitches")
    .select("resolved_idea_id")
    .eq("id", draft.id)
    .maybeSingle();
  if (winnerErr || !winner?.resolved_idea_id) {
    console.error("[judgment] lost claim race but no winning idea found", winnerErr);
    Sentry.captureException(
      winnerErr ?? new Error("Lost claim race but draft has no resolved_idea_id"),
      { tags: { route: "judgment", phase: "supabase-claim-reread" } },
    );
    throw new Error("Failed to persist judgment.");
  }

  return { ideaId: winner.resolved_idea_id };
}

export type DraftLookup =
  | { status: "missing" }
  | { status: "expired"; resolvedIdeaId: string | null }
  | { status: "ok"; draft: Draft };

// Columns present on draft_pitches in every environment (migrations 001..014).
const DRAFT_BASE_COLUMNS =
  "id, user_id, access_token, title, pitch, handle, resolved_idea_id, expires_at";

// Postgres error code for "undefined_column" — surfaces when migration 015
// hasn't been applied to a target environment but the code references
// `image_urls` in the SELECT. We retry without the column instead of
// returning a misleading 404.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNDEFINED_COLUMN = "42703";

// Returns a structured verdict so the page can:
//   - 404 on truly-missing tokens
//   - redirect to /idea/[id] when the draft expired but had resolved
//   - render the dashboard when the draft is fresh
export async function loadDraftByToken(token: string): Promise<DraftLookup> {
  const supabase = createAdminClient();

  // Try the rich SELECT first (with image_urls). If the column doesn't
  // exist, retry without it so a pre-migration-015 prod still serves the
  // judge dashboard. ANY other PostgREST error is captured to Sentry —
  // returning {missing} on a real DB failure used to make this look like
  // a token-not-found bug, which is what just bit us in prod.
  // Two-step SELECT to stay tolerant of pre-migration-015 environments
  // where the `image_urls` column doesn't exist yet. The richer SELECT's
  // typed return shape is the union; the narrower fallback is widened to
  // it on assignment.
  type DraftRow = {
    id: string;
    user_id: string | null;
    access_token: string;
    title: string;
    pitch: string;
    handle: string | null;
    resolved_idea_id: string | null;
    expires_at: string;
    image_urls?: string[] | null;
  };

  let data: DraftRow | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any = null;

  const rich = await supabase
    .from("draft_pitches")
    .select(`${DRAFT_BASE_COLUMNS}, image_urls`)
    .eq("access_token", token)
    .maybeSingle();
  data = rich.data as DraftRow | null;
  error = rich.error;

  if (error && error.code === UNDEFINED_COLUMN) {
    // Migration 015 hasn't been applied yet. Tell ops loudly via Sentry
    // (one event, not per-request — this is a deploy/migration drift) and
    // fall back to the schema we know works.
    Sentry.captureException(error, {
      tags: { route: "loadDraftByToken", phase: "select-image-urls-missing" },
    });
    const fallback = await supabase
      .from("draft_pitches")
      .select(DRAFT_BASE_COLUMNS)
      .eq("access_token", token)
      .maybeSingle();
    data = fallback.data as DraftRow | null;
    error = fallback.error;
  }

  if (error) {
    // Real DB error (network, timeout, RLS misconfig). Capture so we don't
    // mistake it for a missing-token 404 on the user's screen.
    Sentry.captureException(error, {
      tags: { route: "loadDraftByToken", phase: "supabase-select" },
    });
    return { status: "missing" };
  }
  if (!data) return { status: "missing" };

  const isExpired = new Date(data.expires_at).getTime() < Date.now();
  if (isExpired) {
    return { status: "expired", resolvedIdeaId: data.resolved_idea_id };
  }

  const { expires_at: _expires_at, ...rest } = data;
  void _expires_at;
  // image_urls may be undefined on pre-migration-015 environments —
  // normalize to an empty array so the persist-judgment insert spread
  // guard works without a TS or PostgREST surprise.
  const draft: Draft = {
    ...(rest as Omit<Draft, "image_urls">),
    image_urls: (rest as { image_urls?: string[] | null }).image_urls ?? [],
  };
  return { status: "ok", draft };
}
