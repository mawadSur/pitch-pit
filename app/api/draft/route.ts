import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { submitSchema } from "@/lib/score-schema";
import { checkContent } from "@/lib/content-filter";
import { checkUserQuota, WEEKLY_LIMIT } from "@/lib/user-quota";
import { verifyTurnstile, turnstileEnabled } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Draft creation is fast (no Anthropic call). 10s is plenty.
export const maxDuration = 10;

// All the pre-flight gates that used to live in /api/score: Turnstile,
// content-filter, weekly quota, capture session. The actual Anthropic
// fan-out happens later inside /judge/[token] as Suspense-streamed
// async server components — this route just persists the pitch and
// hands back a token the client can redirect to.
export async function POST(req: NextRequest) {
  // ─── body validation ──────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Could not parse request body." },
      { status: 400 },
    );
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Submission is malformed.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { title, pitch, handle, turnstile_token, request_id } = parsed.data;

  // ─── captcha ──────────────────────────────────────────────
  if (turnstileEnabled) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      undefined;
    const captcha = await verifyTurnstile(turnstile_token, ip);
    if (!captcha.ok) {
      return NextResponse.json(
        { error: captcha.reason ?? "Captcha verification failed." },
        { status: 403 },
      );
    }
  }

  // ─── content pre-filter ──────────────────────────────────
  const filterVerdict = checkContent(`${title}\n${pitch}`);
  if (filterVerdict.flagged) {
    return NextResponse.json(
      {
        error: filterVerdict.reason ?? "Submission was rejected.",
        category: filterVerdict.category,
      },
      { status: 400 },
    );
  }

  // ─── auth gate ────────────────────────────────────────────
  // Submissions require a signed-in user. The client-side wall in
  // HomeScene also checks this (getSession), but we re-verify here
  // because that local check is cookie-state only — network failures,
  // expired tokens, or someone hitting the API directly all need a
  // real server-side check. Returns 401 with redirect_to so the
  // client knows to bounce to /login.
  let userId: string | null = null;
  try {
    const cookieClient = createCookieClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* fall through to 401 below */
  }
  if (!userId) {
    return NextResponse.json(
      {
        error: "Sign in to submit a pitch.",
        category: "auth",
        redirect_to: `/login?next=${encodeURIComponent("/?resume=1")}`,
      },
      { status: 401 },
    );
  }

  // ─── per-user weekly quota ────────────────────────────────
  // userId is guaranteed non-null here (auth gate above).
  const quota = await checkUserQuota(userId);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: quota.reason,
        category: "quota",
        used: quota.used,
        limit: quota.limit,
        resetAt: quota.resetAt?.toISOString() ?? null,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(WEEKLY_LIMIT),
          "X-RateLimit-Remaining": "0",
          ...(quota.resetAt
            ? {
                "X-RateLimit-Reset": String(
                  Math.floor(quota.resetAt.getTime() / 1000),
                ),
              }
            : {}),
        },
      },
    );
  }

  // ─── persist draft ────────────────────────────────────────
  const supabase = createAdminClient();

  // Opportunistic GC: prune drafts older than 24h. Cheap; DB-side.
  void supabase.rpc("prune_expired_drafts").then((res) => {
    if (res.error) console.warn("[draft] prune failed", res.error);
  });

  // ─── idempotency lookup ───────────────────────────────────
  // If the client sent a request_id, see if a draft with the same
  // (owner-scoped) request_id already exists from a recent attempt.
  // We intentionally don't add a UNIQUE constraint at the DB level —
  // that would hard-fail concurrent retries; we want a soft return.
  // Window: 5 minutes (long enough for the slowest network blip +
  // retry, short enough that a buggy client recycling a uuid won't
  // collide forever). UUID v4 collision odds are practically zero.
  if (request_id) {
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let q = supabase
      .from("draft_pitches")
      .select("id, access_token")
      .eq("request_id", request_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    // Scope by ownership: signed-in users dedupe on user_id; anonymous
    // submissions dedupe on null user_id (uuid uniqueness alone makes
    // cross-user collision practically impossible, but matching the
    // owner keeps the lookup tight under the partial index).
    q = userId ? q.eq("user_id", userId) : q.is("user_id", null);
    const { data: existing, error: lookupErr } = await q.maybeSingle();
    if (lookupErr) {
      // Don't fail the request on a lookup glitch — fall through and
      // mint a new draft. Worst case we lose dedupe on this request.
      console.warn("[draft] idempotency lookup failed", lookupErr);
    } else if (existing) {
      return NextResponse.json({ token: existing.access_token });
    }
  }

  // 32 hex chars = 16 random bytes. Opaque, unguessable, single-use-ish
  // (the same token can be re-loaded by anyone who has the link, which
  // is fine — they're loading their own pitch on the way to evaluation).
  const accessToken = randomBytes(16).toString("hex");

  // Spread request_id only when present so the insert stays compatible
  // with environments that haven't yet applied migration 012 (the column
  // was added after 010). PostgREST rejects unknown keys even when null.
  const { data: row, error: dbErr } = await supabase
    .from("draft_pitches")
    .insert({
      user_id: userId,
      access_token: accessToken,
      title,
      pitch,
      handle: handle && handle.length > 0 ? handle : null,
      ...(request_id ? { request_id } : {}),
    })
    .select("id, access_token")
    .single();

  if (dbErr || !row) {
    console.error("[draft] insert failure", dbErr);
    Sentry.captureException(dbErr ?? new Error("Insert returned no row"), {
      tags: { route: "draft", phase: "supabase-insert" },
    });
    return NextResponse.json(
      { error: "Could not stage your pitch. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ token: row.access_token });
}
