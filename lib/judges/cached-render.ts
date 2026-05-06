import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreSchema, type ScoreResult } from "@/lib/score-schema";
import { renderJudgment } from "./render-judgment";
import type { JudgeId } from "./shared";

// Renders a single judge with a draft-scoped cache.
// On first call: hits Anthropic, validates, writes back into
// draft_pitches.judge_results JSONB.
// On subsequent calls (e.g. page refresh): reads the cached entry and
// returns immediately.
//
// imageUrls: optional. When the user attached images, these are sent
// to Claude as multimodal content blocks. The cache is draft-scoped, so
// the same draft id always passes the same images — no need to factor
// imageUrls into the cache key.
export async function renderJudgmentCached(
  draftId: string,
  judgeId: JudgeId,
  title: string,
  pitch: string,
  imageUrls: string[] = [],
): Promise<ScoreResult> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("draft_pitches")
    .select("judge_results")
    .eq("id", draftId)
    .maybeSingle();

  const cached =
    existing?.judge_results &&
    typeof existing.judge_results === "object" &&
    judgeId in existing.judge_results
      ? (existing.judge_results as Record<string, unknown>)[judgeId]
      : null;

  if (cached) {
    const parsed = scoreSchema.safeParse(cached);
    if (parsed.success) return parsed.data;
    // If the cached blob fails validation (schema drift, partial write),
    // fall through and re-render.
  }

  const result = await renderJudgment(judgeId, title, pitch, imageUrls);

  // Merge — read-modify-write. Postgres jsonb_set would be safer for
  // concurrent writes, but the three judges land at slightly different
  // times so naïve merge is fine in practice. Worst case one judge's
  // cache entry is lost and gets re-rendered on next refresh.
  const merged = {
    ...((existing?.judge_results as Record<string, unknown>) ?? {}),
    [judgeId]: result,
  };

  const { error } = await supabase
    .from("draft_pitches")
    .update({ judge_results: merged })
    .eq("id", draftId);

  if (error) {
    console.warn(`[judge:${judgeId}] cache write failed`, error);
  }

  return result;
}
