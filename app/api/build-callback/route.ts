// POST /api/build-callback
//
// Receives progress + terminal updates from the GitHub Actions builder
// (see scripts/builder-workflow.yml). Authenticated by the per-build
// callback_token minted in close-week-and-build and stored on the
// matching build_queue row.
//
// State machine:
//   build_phase: queued → generating → deploying → complete | failed
//
//   complete    → mark idea built (with mvp_url, screenshot_url),
//                 mark build_queue complete, null the callback_token.
//   failed (1st)→ bump retry_count to 1, mint a fresh callback_token,
//                 re-dispatch the build, keep build_queue in_progress.
//   failed (2nd)→ mark build_queue failed, null the callback_token,
//                 send a fallback email so a human can take it from here.
//
// Auth model: the builder POSTs the same token it received in its
// repository_dispatch client_payload. We look up the queue row by
// token; a wrong/expired token returns 404 without leaking which
// idea the token was for.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dispatchBuild,
  isDispatchConfigured,
  mintCallbackToken,
  type DispatchIdea,
} from "@/lib/build-dispatch";
import { sendBuildNotification } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Phase = "generating" | "deploying" | "complete" | "failed";

interface CallbackBody {
  callback_token?: unknown;
  idea_id?: unknown;
  phase?: unknown;
  mvp_url?: unknown;
  repo_url?: unknown;
  screenshot_url?: unknown;
  error?: unknown;
  log?: unknown;
}

function isPhase(value: unknown): value is Phase {
  return (
    value === "generating" ||
    value === "deploying" ||
    value === "complete" ||
    value === "failed"
  );
}

function trimStr(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: CallbackBody;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const token = trimStr(body.callback_token, 128);
  const ideaId = trimStr(body.idea_id, 64);
  const phase = body.phase;

  if (!token || !ideaId || !isPhase(phase)) {
    return NextResponse.json({ error: "invalid-body" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Look up the queue row by token. Single point of auth — a missing
  // or rotated token returns 404 without leaking the idea state.
  const { data: queueRow, error: queueErr } = await supabase
    .from("build_queue")
    .select(
      "id, idea_id, status, retry_count, callback_token, build_phase",
    )
    .eq("callback_token", token)
    .maybeSingle();

  if (queueErr) {
    return NextResponse.json(
      { error: "queue-lookup-failed", message: queueErr.message },
      { status: 500 },
    );
  }
  if (!queueRow || queueRow.idea_id !== ideaId) {
    return NextResponse.json({ error: "unknown-build" }, { status: 404 });
  }

  // Terminal states — refuse further updates.
  if (queueRow.status === "complete" || queueRow.status === "failed") {
    return NextResponse.json(
      { error: "build-already-terminal", status: queueRow.status },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const logLine = trimStr(body.log, 1000);

  // Append a log line atomically by reading-modifying-writing the JSONB
  // column. Builds are sequential per-idea so a read-then-write race is
  // not a real concern here, but we keep the read fresh each call.
  let nextLogs: { ts: string; phase: Phase; msg: string }[] | undefined;
  if (logLine) {
    const { data: row } = await supabase
      .from("build_queue")
      .select("build_logs")
      .eq("id", queueRow.id)
      .maybeSingle();
    const current = Array.isArray(row?.build_logs) ? row!.build_logs : [];
    // Cap the log at 200 entries so the JSONB column doesn't bloat over
    // a runaway build.
    const trimmed = current.slice(-199) as Array<{
      ts: string;
      phase: Phase;
      msg: string;
    }>;
    nextLogs = [...trimmed, { ts: now, phase, msg: logLine }];
  }

  // ─── COMPLETE ────────────────────────────────────────────────────
  if (phase === "complete") {
    const mvpUrl = isHttpsUrl(body.mvp_url) ? (body.mvp_url as string) : null;
    const repoUrl = isHttpsUrl(body.repo_url) ? (body.repo_url as string) : null;
    const screenshotUrl = isHttpsUrl(body.screenshot_url)
      ? (body.screenshot_url as string)
      : null;

    if (!mvpUrl) {
      return NextResponse.json(
        { error: "complete-requires-mvp-url" },
        { status: 400 },
      );
    }

    const { error: ideaErr } = await supabase
      .from("ideas")
      .update({
        status: "built",
        mvp_url: mvpUrl,
        screenshot_url: screenshotUrl,
      })
      .eq("id", ideaId);
    if (ideaErr) {
      return NextResponse.json(
        { error: "idea-update-failed", message: ideaErr.message },
        { status: 500 },
      );
    }

    const { error: q2Err } = await supabase
      .from("build_queue")
      .update({
        status: "complete",
        build_phase: "complete",
        completed_at: now,
        mvp_url: mvpUrl,
        repo_url: repoUrl,
        callback_token: null,
        ...(nextLogs !== undefined ? { build_logs: nextLogs } : {}),
      })
      .eq("id", queueRow.id);
    if (q2Err) {
      return NextResponse.json(
        { error: "queue-update-failed", message: q2Err.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, phase: "complete" });
  }

  // ─── FAILED ──────────────────────────────────────────────────────
  if (phase === "failed") {
    const errorMsg = trimStr(body.error, 2000) ?? "unknown-error";
    const retryCount = queueRow.retry_count ?? 0;

    // First failure → retry once.
    if (retryCount === 0) {
      const freshToken = mintCallbackToken();

      // Update the queue row: bump retry_count, mint a new callback
      // token, re-queue. Keep status='in_progress'.
      const { error: q3Err } = await supabase
        .from("build_queue")
        .update({
          retry_count: 1,
          callback_token: freshToken,
          build_phase: "queued",
          error: errorMsg,
          ...(nextLogs !== undefined ? { build_logs: nextLogs } : {}),
        })
        .eq("id", queueRow.id);
      if (q3Err) {
        return NextResponse.json(
          { error: "queue-update-failed", message: q3Err.message },
          { status: 500 },
        );
      }

      // Re-fetch the idea so the dispatch payload is full.
      const { data: ideaRow } = await supabase
        .from("ideas")
        .select(
          "id, title, pitch, score, final_score, verdict, strengths, concerns, reasoning",
        )
        .eq("id", ideaId)
        .single();

      let retryDispatched = false;
      let retryError: string | null = null;
      if (ideaRow && isDispatchConfigured()) {
        try {
          await dispatchBuild({
            idea: ideaRow as DispatchIdea,
            callbackToken: freshToken,
            attempt: 2,
          });
          retryDispatched = true;
        } catch (err) {
          retryError = err instanceof Error ? err.message : String(err);
          console.error("[build-callback] Retry dispatch failed:", err);
        }
      } else {
        retryError = "dispatch-not-configured";
      }

      return NextResponse.json({
        ok: true,
        phase: "failed",
        action: "retried",
        retry_dispatched: retryDispatched,
        retry_error: retryError,
      });
    }

    // Second failure → terminal. Mark failed, null the token, send the
    // fallback prompt email so a human can take over.
    const { error: q4Err } = await supabase
      .from("build_queue")
      .update({
        status: "failed",
        build_phase: "failed",
        completed_at: now,
        error: errorMsg,
        callback_token: null,
        ...(nextLogs !== undefined ? { build_logs: nextLogs } : {}),
      })
      .eq("id", queueRow.id);
    if (q4Err) {
      return NextResponse.json(
        { error: "queue-update-failed", message: q4Err.message },
        { status: 500 },
      );
    }

    // Best-effort fallback email — re-uses the existing manual prompt.
    const { data: ideaRow } = await supabase
      .from("ideas")
      .select(
        "id, title, pitch, score, final_score, verdict, strengths, concerns, reasoning",
      )
      .eq("id", ideaId)
      .single();
    if (ideaRow) {
      try {
        await sendBuildNotification(ideaRow as DispatchIdea);
      } catch (err) {
        console.error(
          "[build-callback] Fallback email after two failures also failed:",
          err,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      phase: "failed",
      action: "terminal",
      retry_count: 1,
    });
  }

  // ─── PROGRESS (generating | deploying) ───────────────────────────
  const { error: q5Err } = await supabase
    .from("build_queue")
    .update({
      build_phase: phase,
      ...(nextLogs !== undefined ? { build_logs: nextLogs } : {}),
    })
    .eq("id", queueRow.id);
  if (q5Err) {
    return NextResponse.json(
      { error: "queue-update-failed", message: q5Err.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, phase });
}
