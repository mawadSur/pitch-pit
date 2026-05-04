// Per-user submission quota. Authenticated users get 2 submissions per
// rolling 7-day window. Anonymous submissions fall back to the IP-based
// rate limit in middleware.ts.

import { createAdminClient } from "@/lib/supabase/admin";

export const WEEKLY_LIMIT = 2;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type QuotaVerdict = {
  ok: boolean;
  used: number;
  limit: number;
  resetAt: Date | null; // when their oldest in-window submission ages out
  reason?: string;
};

/**
 * Returns whether the user can submit again right now. Counts submissions in
 * the trailing 7 days (rolling window — not anchored to the contest week).
 *
 * Database side: relies on `ideas_user_id_idx` (migration 007) for the
 * lookup to stay sub-millisecond.
 */
export async function checkUserQuota(userId: string): Promise<QuotaVerdict> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  // We want the count + the oldest in-window timestamp (so we can tell the
  // user when their earliest submission ages out). Single query, ordered.
  const { data, error } = await supabase
    .from("ideas")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(WEEKLY_LIMIT + 1); // we only need to know "≥ limit"

  if (error) {
    // Fail-open on infra error — don't block legit users because of a flaky
    // DB. The IP-based middleware rate limit is still in front of this.
    console.warn("[user-quota] lookup failed; failing open", error);
    return { ok: true, used: 0, limit: WEEKLY_LIMIT, resetAt: null };
  }

  const used = data?.length ?? 0;
  const oldest = data?.[0]?.created_at;
  const resetAt = oldest
    ? new Date(new Date(oldest).getTime() + WINDOW_MS)
    : null;

  if (used >= WEEKLY_LIMIT) {
    return {
      ok: false,
      used,
      limit: WEEKLY_LIMIT,
      resetAt,
      reason: resetAt
        ? `Weekly limit reached (${WEEKLY_LIMIT} submissions). Next slot opens ${resetAt.toUTCString()}.`
        : `Weekly limit reached (${WEEKLY_LIMIT} submissions).`,
    };
  }

  return { ok: true, used, limit: WEEKLY_LIMIT, resetAt };
}
