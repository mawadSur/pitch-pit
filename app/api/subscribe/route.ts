import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates/render";
import { SubscribeConfirm } from "@/lib/email-templates/subscribe-confirm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // RFC 5321 caps the local part at 64 chars + 255 total. zod's email
  // validator is permissive enough; we lowercase below for the unique key.
  email: z.string().trim().email().max(254),
  // Where the signup happened — purely for analytics on what's converting.
  source: z.string().trim().max(40).optional(),
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

// Hex tokens (32 bytes = 64 hex chars). Long enough that a brute-force
// guess across the whole subscribers table is computationally infeasible
// at any realistic scale.
function mintToken(): string {
  return randomBytes(32).toString("hex");
}

// POST /api/subscribe — body { email, source? }
// Always returns 200 + `{ ok: true }` on a valid body so a caller can't
// probe whether an address is already subscribed (enumeration). 400 is
// reserved for bad input (missing/invalid email).
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const source = parsed.data.source ?? null;

  const supabase = createAdminClient();

  // Try to find an existing row first. We don't blindly upsert because
  // we want to preserve the existing opt_in_token / unsub_token if the
  // user re-submits — the link in their original confirmation email
  // should keep working. If the row exists and is already active, we
  // silently no-op (don't send a new confirmation).
  const { data: existing } = await supabase
    .from("subscribers")
    .select("id, status, opt_in_token")
    .eq("email", email)
    .maybeSingle<{ id: string; status: string; opt_in_token: string }>();

  let optInToken: string;

  if (existing) {
    if (existing.status === "active") {
      // Already confirmed — return success without re-sending so we
      // don't pile inbox noise on someone who already opted in.
      return NextResponse.json({ ok: true });
    }
    if (existing.status === "unsubscribed") {
      // Re-subscribing after a previous unsubscribe. Mint a new
      // opt_in_token + flip status back to pending so the new
      // confirmation link is fresh.
      optInToken = mintToken();
      const { error } = await supabase
        .from("subscribers")
        .update({
          status: "pending",
          opt_in_token: optInToken,
          unsubscribed_at: null,
          source: source ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) {
        console.error("[subscribe] re-subscribe update failed", error);
        // Don't leak — return ok anyway.
        return NextResponse.json({ ok: true });
      }
    } else {
      // status === 'pending' or 'bounced' — re-send confirmation using
      // existing token (don't rotate; their first email still works).
      optInToken = existing.opt_in_token;
    }
  } else {
    optInToken = mintToken();
    const unsubToken = mintToken();
    const { error } = await supabase.from("subscribers").insert({
      email,
      status: "pending",
      opt_in_token: optInToken,
      unsub_token: unsubToken,
      source,
    });
    if (error) {
      // Unique constraint race (someone inserted between our SELECT and
      // INSERT) — silently treat as success. Any other error gets
      // logged but never leaked to the caller.
      console.error("[subscribe] insert failed", error);
      return NextResponse.json({ ok: true });
    }
  }

  // Confirmation magic link. Token is single-use in the sense that
  // /api/subscribe/confirm/[token] requires status='pending'; once
  // flipped to 'active' the route just redirects without re-flipping.
  const confirmUrl = `${SITE_URL}/api/subscribe/confirm/${optInToken}`;

  const { html, text } = await renderEmail(
    SubscribeConfirm({ confirmUrl, siteUrl: SITE_URL }),
  );

  // Best-effort — if Resend isn't configured locally we want the
  // upsert to still happen so the dev can hand-confirm via the URL
  // printed in the log. sendResendEmail returns false instead of
  // throwing in that case.
  await sendResendEmail({
    to: email,
    subject: "Confirm your pitch-pit subscription",
    html,
    text,
  });

  return NextResponse.json({ ok: true });
}
