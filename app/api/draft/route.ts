import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { submitSchema } from "@/lib/score-schema";
import { checkContent } from "@/lib/content-filter";
import { checkUserQuota, WEEKLY_LIMIT } from "@/lib/user-quota";
import { verifyTurnstile, turnstileEnabled } from "@/lib/turnstile";
import { limitAnonDrafts } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Draft creation is fast (no Anthropic call). 10s is plenty.
export const maxDuration = 10;

// Anonymous-first: the auth gate that used to live here was moved to
// /api/claim-idea. Logged-out visitors can stage a draft, watch the
// three judges deliberate, and reach a public idea page — they only
// hit the auth wall when they want to claim the resulting idea on
// their account. Bot protection (Turnstile + content filter + IP
// throttle on the anon path) and per-user weekly quota for signed-in
// users still apply.
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
    const fieldErrors = parsed.error.flatten().fieldErrors;
    // Tag the host-allowlist rejection so the client (and ops) can
    // distinguish it from a generic shape mismatch. The UI never
    // produces these URLs, so any hit here means a direct API call
    // from outside the upload flow.
    const imageHostRejected = fieldErrors.image_urls?.some((m) =>
      m.includes("pitch-images bucket"),
    );
    return NextResponse.json(
      {
        error: imageHostRejected
          ? "Image URLs must come from the pitch-images bucket."
          : "Submission is malformed.",
        category: imageHostRejected ? "image-host-rejected" : undefined,
        details: fieldErrors,
      },
      { status: 400 },
    );
  }

  const { title, pitch, handle, turnstile_token, request_id, image_urls } =
    parsed.data;

  // Capture the requester IP up front — we use it for both Turnstile
  // and (when no session) the anonymous IP throttle. Strip x-forwarded-for
  // to its first entry; behind Vercel that's the real client IP.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    undefined;

  // ─── captcha ──────────────────────────────────────────────
  if (turnstileEnabled) {
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

  // ─── session detection (no longer a gate) ────────────────
  // We resolve the user up front so the downstream code can treat
  // signed-in vs anonymous as data, not control flow. Failure to
  // read the session is treated as anonymous — the actual claim
  // step is gated server-side anyway.
  let userId: string | null = null;
  try {
    const cookieClient = await createCookieClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* anonymous */
  }

  // ─── per-IP throttle for anonymous submissions ────────────
  // Signed-in users skip this — they get the per-user weekly quota
  // below instead. Anonymous users are bounded to 3 drafts / 24h /
  // IP. When we can't determine the IP (rare; misconfigured proxy)
  // we let the request through rather than block legitimate traffic.
  if (!userId && ip) {
    const verdict = await limitAnonDrafts(ip);
    if (!verdict.success) {
      return NextResponse.json(
        {
          error:
            "Too many anonymous submissions from this network. Sign in to keep going.",
          category: "anon-throttle",
          resetAt: new Date(verdict.reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(verdict.limit),
            "X-RateLimit-Remaining": String(verdict.remaining),
            "X-RateLimit-Reset": String(Math.floor(verdict.reset / 1000)),
          },
        },
      );
    }
  }

  // ─── per-user weekly quota (signed-in only) ──────────────
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
      // mint a new draft. Worst case we lose dedupe on this request,
      // but the user gets a fresh token and the duplicate orphan can be
      // GC'd by the prune RPC. Capture so we see if this becomes a
      // pattern (would point at index drift or RLS regression).
      console.warn("[draft] idempotency lookup failed", lookupErr);
      Sentry.captureException(lookupErr, {
        tags: { route: "draft", phase: "idempotency-lookup" },
      });
    } else if (existing) {
      return NextResponse.json({ token: existing.access_token });
    }
  }

  // 32 hex chars = 16 random bytes. Opaque, unguessable, single-use-ish
  // (the same token can be re-loaded by anyone who has the link, which
  // is fine — they're loading their own pitch on the way to evaluation).
  const accessToken = randomBytes(16).toString("hex");

  // Anonymous drafts get a separate claim_token: a second 32-hex secret
  // that travels in an HttpOnly cookie keyed by draft.id. The /idea/[id]
  // page checks that cookie to decide whether to show the "claim" CTA;
  // /api/claim-idea verifies it before flipping ideas.user_id. Signed-in
  // submissions don't need it — auth itself proves ownership.
  const claimToken = userId ? null : randomBytes(16).toString("hex");

  // Spread request_id only when present so the insert stays compatible
  // with environments that haven't yet applied migration 012 (the column
  // was added after 010). PostgREST rejects unknown keys even when null.
  const insertPayload = {
    user_id: userId,
    access_token: accessToken,
    title,
    pitch,
    handle: handle && handle.length > 0 ? handle : null,
    ...(request_id ? { request_id } : {}),
    // Only include image_urls when the column has actually been added
    // (migration 015). Spread guard mirrors the request_id pattern so
    // a deploy without the migration still accepts text-only pitches.
    ...(image_urls.length > 0 ? { image_urls } : {}),
    // Carry the anon claim secret only when minted. Spread-guarded for
    // pre-migration-018 environments — see the retry path on
    // undefined_column below.
    ...(claimToken ? { claim_token: claimToken } : {}),
  };

  let row: { id: string; access_token: string } | null = null;
  let dbErr: { code?: string; message?: string } | null = null;

  {
    const insert = await supabase
      .from("draft_pitches")
      .insert(insertPayload)
      .select("id, access_token")
      .single();
    row = insert.data ?? null;
    dbErr = insert.error ?? null;
  }

  // Migration 018 hasn't been applied yet — claim_token column missing.
  // Retry once without it so the route degrades gracefully (no claim
  // CTA on the resulting idea, but submission still completes).
  if ((dbErr?.code === "42703" || (dbErr && !row)) && claimToken) {
    const { claim_token: _drop, ...payloadWithoutClaim } = insertPayload as {
      claim_token?: string;
      [k: string]: unknown;
    };
    void _drop;
    const retry = await supabase
      .from("draft_pitches")
      .insert(payloadWithoutClaim)
      .select("id, access_token")
      .single();
    if (!retry.error && retry.data) {
      row = retry.data;
      dbErr = null;
      Sentry.captureMessage("[draft] claim_token column missing", {
        level: "warning",
        tags: { route: "draft", phase: "schema-drift-018" },
      });
    }
  }

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

  // Funnel telemetry — one info-level event per draft create with the
  // auth tag. Cheap enough to do unconditionally; gives ops anonymous
  // vs signed-in submission rates in Sentry without instrumenting the
  // homepage client.
  Sentry.captureMessage("[draft] created", {
    level: "info",
    tags: {
      route: "draft",
      auth: userId ? "signed-in" : "anon",
    },
  });

  const response = NextResponse.json({ token: row.access_token });

  // Mint the HttpOnly claim cookie only for anonymous drafts. The cookie
  // name embeds the draft.id so a user who submits multiple anonymous
  // drafts in the same browser doesn't lose earlier secrets to
  // overwrites — each draft gets its own slot. Path=/ so the cookie is
  // sent on /idea/[id] and /api/claim-idea regardless of route. SameSite
  // Lax so a top-level navigation back from /login still includes it.
  if (claimToken) {
    response.cookies.set({
      name: `pp_claim_${row.id}`,
      value: claimToken,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24, // 24h — matches the draft TTL
    });
  }

  return response;
}
