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
async function AggregateBand({
  draft,
  promises,
  currentUserId,
}: {
  draft: Draft;
  promises: Record<JudgeId, Promise<ScoreResult>>;
  currentUserId: string | null;
}) {
  // Wait for all three. If any fail we still try to render with what we
  // have — the JudgeCard for the failed judge already showed its error.
  const settled = await Promise.allSettled([
    promises.gstack,
    promises.vee,
    promises.robbins,
  ]);

  const [gstackR, veeR, robbinsR] = settled;
  const allOk =
    gstackR.status === "fulfilled" &&
    veeR.status === "fulfilled" &&
    robbinsR.status === "fulfilled";

  if (!allOk) {
    return <AggregateBandClient avg={null} panel={null} />;
  }

  const panel: JudgePanel = {
    gstack: gstackR.value,
    vee: veeR.value,
    robbins: robbinsR.value,
  };

  // Persist the ideas row idempotently (re-renders share the resolved id).
  let ideaId: string | null = null;
  try {
    const persisted = await persistJudgment(draft, panel);
    ideaId = persisted.ideaId;
  } catch (e) {
    console.error("[aggregate] persist failed", e);
  }

  const avg = Math.round(
    (panel.gstack.score + panel.vee.score + panel.robbins.score) / 3,
  );

  // Claim eligibility: signed-in viewer + draft was anonymous (so the
  // resolved ideas row inherited user_id=null and is "orphaned").
  const canClaim = !!currentUserId && draft.user_id === null && !!ideaId;

  return (
    <AggregateBandClient
      avg={avg}
      panel={panel}
      ideaId={ideaId}
      canClaim={canClaim}
      judgesMeta={JUDGES.map((j) => ({ id: j.id, name: j.name }))}
    />
  );
}

AggregateBand.Pending = AggregateBandPending;

export { AggregateBand };
