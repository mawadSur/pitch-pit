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

  const { title, pitch, handle, turnstile_token } = parsed.data;

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

  // ─── capture session (best-effort) ────────────────────────
  let userId: string | null = null;
  try {
    const cookieClient = createCookieClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* anonymous flow */
  }

  // ─── per-user weekly quota ────────────────────────────────
  if (userId) {
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
  }

  // ─── persist draft ────────────────────────────────────────
  // 32 hex chars = 16 random bytes. Opaque, unguessable, single-use-ish
  // (the same token can be re-loaded by anyone who has the link, which
  // is fine — they're loading their own pitch on the way to evaluation).
  const accessToken = randomBytes(16).toString("hex");

  const supabase = createAdminClient();

  // Opportunistic GC: prune drafts older than 24h. Cheap; DB-side.
  void supabase.rpc("prune_expired_drafts").then((res) => {
    if (res.error) console.warn("[draft] prune failed", res.error);
  });

  const { data: row, error: dbErr } = await supabase
    .from("draft_pitches")
    .insert({
      user_id: userId,
      access_token: accessToken,
      title,
      pitch,
      handle: handle && handle.length > 0 ? handle : null,
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
