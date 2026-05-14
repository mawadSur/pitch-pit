import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBuildNotification } from "@/lib/email";
import {
  dispatchBuild,
  isDispatchConfigured,
  mintCallbackToken,
} from "@/lib/build-dispatch";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 1. Idempotently close the current open week. This Postgres function picks
  //    the highest-final_score idea as winner_idea_id and opens a fresh week.
  //    Safe to call repeatedly — no-op if no open week.
  const { error: rpcErr } = await supabase.rpc("close_current_week");
  if (rpcErr) {
    return NextResponse.json(
      { error: "close_current_week-failed", message: rpcErr.message },
      { status: 500 },
    );
  }

  // 2. Find the most-recent closed week that has a winner picked.
  const { data: closedWeek } = await supabase
    .from("weeks")
    .select("id, week_number, winner_idea_id")
    .eq("status", "closed")
    .not("winner_idea_id", "is", null)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!closedWeek || !closedWeek.winner_idea_id) {
    return NextResponse.json({ skipped: "no-closed-week-with-winner" });
  }

  // 3. Fetch the winner idea in full.
  const { data: idea, error: ideaFetchErr } = await supabase
    .from("ideas")
    .select(
      "id, title, pitch, score, final_score, verdict, strengths, concerns, reasoning, status",
    )
    .eq("id", closedWeek.winner_idea_id)
    .single();

  if (ideaFetchErr || !idea) {
    return NextResponse.json(
      { error: "winner-fetch-failed", message: ideaFetchErr?.message },
      { status: 500 },
    );
  }

  // 4. Idempotency: if the winner is already in build/built state, don't
  //    re-transition and don't re-email.
  if (idea.status === "building" || idea.status === "built") {
    return NextResponse.json({
      closed: closedWeek.week_number,
      winner: { id: idea.id, title: idea.title, status: idea.status },
      email_sent: false,
      note: "already-building-or-built",
    });
  }

  // 5. Advance winner status to 'building'.
  const { error: ideaErr } = await supabase
    .from("ideas")
    .update({ status: "building" })
    .eq("id", idea.id);
  if (ideaErr) {
    return NextResponse.json(
      { error: "update-idea-failed", message: ideaErr.message },
      { status: 500 },
    );
  }

  // 6. Upsert into build_queue with in_progress + timestamps + a fresh
  //    callback_token for the auto-builder to authenticate with. Reset
  //    retry_count and build_logs so re-running a week starts clean.
  const callbackToken = mintCallbackToken();
  const { error: queueErr } = await supabase.from("build_queue").upsert(
    {
      idea_id: idea.id,
      status: "in_progress",
      approved_at: now,
      started_at: now,
      callback_token: callbackToken,
      retry_count: 0,
      build_phase: "queued",
      build_logs: [],
    },
    { onConflict: "idea_id" },
  );
  if (queueErr) {
    return NextResponse.json(
      { error: "queue-failed", message: queueErr.message },
      { status: 500 },
    );
  }

  // 7. Send the build-notification email. Best-effort — log on failure.
  //    Serves as a heads-up; the actual build is driven by the dispatch
  //    in step 8.
  let emailSent = false;
  try {
    await sendBuildNotification(idea);
    emailSent = true;
  } catch (err) {
    console.error("[close-week-and-build] Email send failed:", err);
  }

  // 8. Fire repository_dispatch to the GitHub builder. Best-effort — if
  //    GitHub is down or the env vars are missing, the email already gave
  //    a manual fallback. The /winner page will still render the queued
  //    state and the user can re-trigger via /admin if needed.
  let dispatchSent = false;
  let dispatchError: string | null = null;
  if (isDispatchConfigured()) {
    try {
      await dispatchBuild({
        idea,
        callbackToken,
        attempt: 1,
      });
      dispatchSent = true;
    } catch (err) {
      dispatchError = err instanceof Error ? err.message : String(err);
      console.error("[close-week-and-build] Dispatch failed:", err);
    }
  } else {
    dispatchError = "dispatch-not-configured";
  }

  return NextResponse.json({
    closed: closedWeek.week_number,
    winner: {
      id: idea.id,
      title: idea.title,
      final_score: idea.final_score,
    },
    email_sent: emailSent,
    dispatch_sent: dispatchSent,
    dispatch_error: dispatchError,
  });
}
