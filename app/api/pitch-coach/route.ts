import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { renderFollowups, renderEnhanced } from "@/lib/coach/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Followups budget is short (~3-5s); enhance can stretch to 15s.
// 25s gives headroom.
export const maxDuration = 25;

const bodySchema = z.object({
  // Same length envelope as the homepage textarea so we don't burn an
  // Anthropic call on something the user can't actually submit.
  pitch: z.string().trim().min(40).max(1500),
  action: z.enum(["followups", "enhance"]),
});

export async function POST(req: NextRequest) {
  // ─── auth ────────────────────────────────────────────────
  // Coach calls cost Anthropic tokens. Auth gate is the simplest
  // way to stop drive-by abuse. Same redirect-to convention as
  // /api/draft so the client can shuttle anonymous users through
  // /login transparently.
  let userId: string | null = null;
  try {
    const cookieClient = createCookieClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* fall through to 401 */
  }
  if (!userId) {
    return NextResponse.json(
      {
        error: "Sign in to use the pitch coach.",
        category: "auth",
        redirect_to: `/login?next=${encodeURIComponent("/?resume=1")}`,
      },
      { status: 401 },
    );
  }

  // ─── body ────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Could not parse request body." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Coach request is malformed.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { pitch, action } = parsed.data;

  // ─── dispatch ────────────────────────────────────────────
  try {
    if (action === "followups") {
      const questions = await renderFollowups(pitch);
      return NextResponse.json({ questions });
    }
    const enhanced = await renderEnhanced(pitch);
    return NextResponse.json({ enhanced });
  } catch (e) {
    console.error(`[pitch-coach:${action}] failure`, e);
    Sentry.captureException(e, {
      tags: { route: "pitch-coach", action },
      extra: { userId },
    });
    return NextResponse.json(
      { error: "Coach is unavailable. Try again in a moment." },
      { status: 502 },
    );
  }
}
