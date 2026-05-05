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
