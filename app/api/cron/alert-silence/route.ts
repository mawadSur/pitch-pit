import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import {
  CRON_JOB_NAMES,
  EXPECTED_INTERVALS_S,
  type CronJobName,
} from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One-hour grace tacked onto the 2x-interval window so a borderline-late
// run (e.g. GitHub Actions queue lag) doesn't false-alarm. A daily cron
// is "silent" only after ~49h; a weekly cron after ~14d+1h.
const GRACE_PERIOD_S = 60 * 60;

type HeartbeatRow = {
  job_name: string;
  last_run_at: string;
  last_status: "ok" | "error" | string;
  last_error: string | null;
  run_count: number;
  error_count: number;
};

type SilentJob = {
  job_name: CronJobName;
  last_run_at: string | null;
  expected_interval_s: number;
  silence_threshold_s: number;
  silent_for_s: number | null; // null when no heartbeat row exists yet
  last_status: string | null;
  last_error: string | null;
};

// GET /api/cron/alert-silence
// Reads every row in cron_heartbeats, compares last_run_at against the
// expected cadence for each known job, and fires a Sentry warning per
// silent job. Returns JSON listing checked + silent jobs so an operator
// can eyeball the alerting from the curl response.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from("cron_heartbeats")
    .select("job_name, last_run_at, last_status, last_error, run_count, error_count");

  if (error) {
    Sentry.captureException(error, {
      tags: { feature: "cron-alert-silence" },
    });
    return NextResponse.json(
      { error: "heartbeat-fetch-failed", message: error.message },
      { status: 500 },
    );
  }

  const byJob = new Map<string, HeartbeatRow>();
  for (const row of (rows ?? []) as HeartbeatRow[]) {
    byJob.set(row.job_name, row);
  }

  const now = Date.now();
  const silent: SilentJob[] = [];

  for (const jobName of CRON_JOB_NAMES) {
    const expected = EXPECTED_INTERVALS_S[jobName];
    const threshold = 2 * expected + GRACE_PERIOD_S;
    const hb = byJob.get(jobName);

    if (!hb) {
      // No row yet — either the job has never successfully heartbeat'd or
      // the table was reset. Either way, this is an alertable condition
      // once the job has been deployed long enough for one cycle.
      silent.push({
        job_name: jobName,
        last_run_at: null,
        expected_interval_s: expected,
        silence_threshold_s: threshold,
        silent_for_s: null,
        last_status: null,
        last_error: null,
      });
      continue;
    }

    const lastRunMs = new Date(hb.last_run_at).getTime();
    const silentForS = Math.floor((now - lastRunMs) / 1000);
    if (silentForS > threshold) {
      silent.push({
        job_name: jobName,
        last_run_at: hb.last_run_at,
        expected_interval_s: expected,
        silence_threshold_s: threshold,
        silent_for_s: silentForS,
        last_status: hb.last_status,
        last_error: hb.last_error,
      });
    }
  }

  for (const job of silent) {
    Sentry.captureMessage("cron-silent", {
      level: "warning",
      tags: { feature: "cron-alert-silence", job: job.job_name },
      extra: {
        job_name: job.job_name,
        last_run_at: job.last_run_at,
        expected_interval_s: job.expected_interval_s,
        silence_threshold_s: job.silence_threshold_s,
        silent_for_s: job.silent_for_s,
        last_status: job.last_status,
        last_error: job.last_error,
      },
    });
  }

  return NextResponse.json({
    checked: CRON_JOB_NAMES.length,
    silent,
  });
}
