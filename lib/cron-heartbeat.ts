import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

// List of cron jobs we expect to heartbeat. Kept here (not in the route
// files) so the alert-silence route can iterate without importing every
// route module. Keep in sync with .github/workflows/cron-*.yml.
export const CRON_JOB_NAMES = [
  "close-week-and-build",
  "email-countdown",
  "email-winner",
] as const;

export type CronJobName = (typeof CRON_JOB_NAMES)[number];

// Expected interval per job in seconds. Read from the matching
// .github/workflows/cron-<name>.yml schedule. Used by the alert-silence
// route to decide when a job is "silent" (hasn't heartbeat'd in
// 2 * interval + grace).
export const EXPECTED_INTERVALS_S: Record<CronJobName, number> = {
  // Weekly: Tuesday 05:05 UTC
  "close-week-and-build": 7 * 24 * 60 * 60,
  // Weekly: Sunday 23:00 UTC
  "email-countdown": 7 * 24 * 60 * 60,
  // Weekly: Monday-morning fan-out
  "email-winner": 7 * 24 * 60 * 60,
};

// Writes a heartbeat row via the `record_cron_heartbeat` RPC (defined in
// migration 028). The RPC handles the atomic upsert + run_count /
// error_count bookkeeping, so this helper is just a thin wrapper that
// swallows errors — heartbeat writes are observability, never breaking
// the actual cron work.
//
// On failure: logs to console and (when Sentry is wired up at the host)
// reports via Sentry.captureException. Never throws.
export async function writeHeartbeat(
  supabase: SupabaseClient,
  jobName: CronJobName,
  status: "ok" | "error" = "ok",
  errorMessage?: string | null,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("record_cron_heartbeat", {
      p_job_name: jobName,
      p_status: status,
      p_error: errorMessage ?? null,
    });
    if (error) {
      console.error(`[cron-heartbeat] ${jobName} rpc failed`, error);
      Sentry.captureException(error, {
        tags: { feature: "cron-heartbeat", job: jobName },
        extra: { status, errorMessage },
      });
    }
  } catch (err) {
    console.error(`[cron-heartbeat] ${jobName} write threw`, err);
    Sentry.captureException(err, {
      tags: { feature: "cron-heartbeat", job: jobName },
      extra: { status, errorMessage },
    });
  }
}
