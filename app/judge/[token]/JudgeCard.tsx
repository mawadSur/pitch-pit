import * as Sentry from "@sentry/nextjs";
import type { ScoreResult } from "@/lib/score-schema";
import type { JudgeMeta } from "@/lib/judges";
import { JudgeCardClient } from "./JudgeCardClient";

// Server-side wrapper: awaits the per-judge promise and hands the resolved
// ScoreResult to the client component for animation. The Suspense parent
// in page.tsx renders DeliberatingCard while this is pending.
export async function JudgeCard({
  judge,
  index,
  promise,
  isSignedIn,
  token,
}: {
  judge: JudgeMeta;
  index: number;
  promise: Promise<ScoreResult>;
  isSignedIn: boolean;
  token: string;
}) {
  let result: ScoreResult | null = null;
  let errored = false;
  try {
    result = await promise;
  } catch (e) {
    console.error(`[judge:${judge.id}] failed`, e);
    // Capture so a partial-panel verdict (Anthropic timeout, schema
    // validation reject, content filter throw) is visible in Sentry —
    // otherwise the only signal is a failed-card UI on the user's screen.
    //
    // The 8-hex prefix gives the on-call enough to correlate multiple
    // events from the same draft without leaking the full token. The
    // full token is what gates /judge/<token> access — anyone reading
    // Sentry would otherwise be able to navigate to the route and read
    // the user's draft pitch verbatim. 32 bits is plenty of correlation
    // entropy; the remaining 96 bits stay private.
    Sentry.captureException(e, {
      tags: { route: "judge", judge: judge.id, phase: "render-promise" },
      extra: { tokenPrefix: token.slice(0, 8) },
    });
    errored = true;
  }

  return (
    <JudgeCardClient
      judge={judge}
      index={index}
      result={result}
      errored={errored}
      isSignedIn={isSignedIn}
      token={token}
    />
  );
}
