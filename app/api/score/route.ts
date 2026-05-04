import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import {
  submitSchema,
  scoreSchema,
  type ScoreResult,
} from "@/lib/score-schema";
import { GAMEMAKER_SYSTEM_PROMPT, userPrompt } from "@/lib/score-prompt";
import { extractJson } from "@/lib/extract-json";
import { checkContent } from "@/lib/content-filter";
import { checkUserQuota, WEEKLY_LIMIT } from "@/lib/user-quota";
import { verifyTurnstile, turnstileEnabled } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sonnet 4.6 scoring calls take 5-15s; default Vercel timeout is 10s on Hobby
// and 15s on Pro. 30 gives us headroom on Pro and surfaces config errors loud
// on Hobby (deploy will reject the value rather than silently cap at 10).
export const maxDuration = 30;

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export async function POST(req: NextRequest) {
  // ─── idempotency check ────────────────────────────────────
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    return NextResponse.json(
      { error: "Idempotency-Key must be 8–128 chars of [A-Za-z0-9_-]." },
      { status: 400 },
    );
  }

  if (idempotencyKey) {
    const cached = await fetchCachedResult(idempotencyKey);
    if (cached) return NextResponse.json(cached);
  }

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

  // ─── captcha verify (Cloudflare Turnstile) ────────────────────
  // No-op when TURNSTILE_SECRET_KEY is unset — first line in
  // verifyTurnstile() short-circuits. In prod with the key set, every
  // submission must include a valid token.
  if (turnstileEnabled) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      undefined;
    const captcha = await verifyTurnstile(turnstile_token, ip);
    if (!captcha.ok) {
      console.warn("[score] turnstile reject", captcha.errorCodes);
      return NextResponse.json(
        { error: captcha.reason ?? "Captcha verification failed." },
        { status: 403 },
      );
    }
  }

  // ─── content pre-filter (synchronous, free) ──────────────────
  // Catches prompt-injection, slurs, all-caps spam, repeated-char runs,
  // and obvious low-effort submissions BEFORE we burn an Anthropic call.
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
  // Authenticated submissions get user_id set so they show up on /submissions.
  // Anonymous submissions still work (user_id stays null).
  let userId: string | null = null;
  try {
    const cookieClient = createCookieClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* not signed in or cookies unavailable — proceed anonymous */
  }

  // ─── per-user weekly quota (signed-in users only) ────────────
  // Anonymous submissions fall back to the IP rate limit in middleware.ts.
  // Authenticated users get a more generous IP rate but a stricter weekly
  // count — caps spam from a single account, even across IPs.
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

  // ─── score (Anthropic) ────────────────────────────────────
  let scored: ScoreResult;
  try {
    scored = await scoreTribute(title, pitch);
  } catch (e) {
    console.error("[score] gamemaker failure", e);
    Sentry.captureException(e, { tags: { route: "score", phase: "anthropic" } });
    return NextResponse.json(
      { error: "The reviewer is silent. Try again shortly." },
      { status: 502 },
    );
  }

  // ─── moderation gate ──────────────────────────────────────
  // The reviewer flags clear policy violations (hate speech, doxxing, CSAM,
  // serious-harm instructions, explicit fraud). Edgy-but-legal ideas pass
  // through and get scored normally.
  if (scored.moderation_flag) {
    console.warn(
      "[score] moderation refused submission",
      scored.moderation_reason,
    );
    return NextResponse.json(
      {
        error:
          "This submission was refused by content moderation. Edit and retry, or contact us if you believe this was an error.",
        reason: scored.moderation_reason,
      },
      { status: 403 },
    );
  }

  // ─── persist (Supabase) ───────────────────────────────────
  const supabase = createAdminClient();
  const { data: row, error: dbErr } = await supabase
    .from("ideas")
    .insert({
      title,
      pitch,
      handle: handle && handle.length > 0 ? handle : null,
      user_id: userId,
      score: scored.score,
      verdict: scored.verdict,
      strengths: scored.strengths,
      concerns: scored.concerns,
      reasoning: scored.reasoning,
      build_recommended: scored.build_recommended,
      status: "scored",
    })
    .select("id")
    .single();

  if (dbErr || !row) {
    console.error("[score] supabase insert failure", dbErr);
    Sentry.captureException(dbErr ?? new Error("Insert returned no row"), {
      tags: { route: "score", phase: "supabase-insert" },
    });
    return NextResponse.json(
      { error: "The records could not be sealed. The judgment was rendered but lost." },
      { status: 500 },
    );
  }

  // ─── persist idempotency mapping (best-effort) ────────────
  if (idempotencyKey) {
    const { error: keyErr } = await supabase
      .from("idempotency_keys")
      .insert({ key: idempotencyKey, idea_id: row.id });
    if (keyErr) console.warn("[score] idempotency persist failed", keyErr);
  }

  return NextResponse.json({ id: row.id, ...scored });
}

// Look up a previously-scored idea by idempotency key.
async function fetchCachedResult(
  key: string,
): Promise<({ id: string } & ScoreResult) | null> {
  const supabase = createAdminClient();
  const { data: keyRow } = await supabase
    .from("idempotency_keys")
    .select("idea_id")
    .eq("key", key)
    .maybeSingle();

  if (!keyRow?.idea_id) return null;

  const { data: idea } = await supabase
    .from("ideas")
    .select(
      "id,score,verdict,strengths,concerns,reasoning,build_recommended",
    )
    .eq("id", keyRow.idea_id)
    .maybeSingle();

  if (!idea) return null;

  return {
    id: idea.id,
    score: idea.score,
    verdict: idea.verdict,
    strengths: idea.strengths,
    concerns: idea.concerns,
    reasoning: idea.reasoning,
    build_recommended: idea.build_recommended,
    // Cached entries are persisted ideas — they passed moderation by definition.
    moderation_flag: false,
    moderation_reason: "",
  };
}

async function scoreTribute(
  title: string,
  pitch: string,
): Promise<ScoreResult> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: GAMEMAKER_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt(title, pitch) }],
  });

  logScoringCost(response.usage);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = extractJson(text);
  return scoreSchema.parse(parsed);
}

// Sonnet 4.6 pricing per million tokens (USD).
// Update if Anthropic changes prices — single source of truth.
const PRICE_PER_MTOK = {
  input: 3.0,
  output: 15.0,
  cache_write: 3.75,
  cache_read: 0.3,
} as const;

function logScoringCost(usage: Anthropic.Usage) {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  const cost =
    (input * PRICE_PER_MTOK.input) / 1_000_000 +
    (output * PRICE_PER_MTOK.output) / 1_000_000 +
    (cacheWrite * PRICE_PER_MTOK.cache_write) / 1_000_000 +
    (cacheRead * PRICE_PER_MTOK.cache_read) / 1_000_000;

  console.log(
    `[score] usage in=${input} out=${output} cacheW=${cacheWrite} cacheR=${cacheRead} cost=$${cost.toFixed(5)}`,
  );
}

