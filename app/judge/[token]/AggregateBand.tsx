import type { ScoreResult } from "@/lib/score-schema";
import { JUDGES, type JudgeId } from "@/lib/judges";
import { persistJudgment, type JudgePanel } from "@/lib/judges/persist-judgment";
import { AggregateBandClient } from "./AggregateBandClient";
import { AggregateBandPending } from "./AggregateBandPending";

type Draft = {
  id: string;
  user_id: string | null;
  access_token: string;
  title: string;
  pitch: string;
  handle: string | null;
  resolved_idea_id: string | null;
};

// Awaits all three judge promises in parallel, persists the ideas row,
// renders the final aggregate verdict band. While pending, the page's
// Suspense fallback shows AggregateBand.Pending below.
//
// Resilience: if 2/3 judges resolve, we still persist with the partial
// panel (avg over the available scores). Only if 0 or 1 succeed do we
// surface "consensus unavailable" — a refresh re-tries only the failed
// judge thanks to the per-draft cache in cached-render.ts.
async function AggregateBand({
  draft,
  promises,
  currentUserId,
}: {
  draft: Draft;
  promises: Record<JudgeId, Promise<ScoreResult>>;
  currentUserId: string | null;
}) {
  const settled = await Promise.allSettled([
    promises.gstack,
    promises.vee,
    promises.robbins,
  ]);

  const panel: JudgePanel = {};
  const ids: JudgeId[] = ["gstack", "vee", "robbins"];
  ids.forEach((id, i) => {
    const r = settled[i];
    if (r.status === "fulfilled") panel[id] = r.value;
  });

  const presentCount = Object.keys(panel).length;
  if (presentCount < 2) {
    return <AggregateBandClient avg={null} panel={null} />;
  }

  // Persist with whatever resolved. persistJudgment is idempotent on
  // draft.resolved_idea_id so a successful 2/3 run won't be overwritten
  // by a later 3/3 retry.
  let ideaId: string | null = null;
  try {
    const persisted = await persistJudgment(draft, panel);
    ideaId = persisted.ideaId;
  } catch (e) {
    console.error("[aggregate] persist failed", e);
  }

  const scores = Object.values(panel).map((r) => r.score);
  const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);

  const canClaim = !!currentUserId && draft.user_id === null && !!ideaId;

  return (
    <AggregateBandClient
      avg={avg}
      panel={panel}
      ideaId={ideaId}
      ideaTitle={draft.title}
      canClaim={canClaim}
      judgesMeta={JUDGES.map((j) => ({ id: j.id, name: j.name }))}
    />
  );
}

AggregateBand.Pending = AggregateBandPending;

export { AggregateBand };
