import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendBatch, type ResendMessage } from "@/lib/email";
import { renderEmail } from "@/lib/email-templates/render";
import { DigestCountdown } from "@/lib/email-templates/digest-countdown";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

// GET /api/cron/email-countdown
// Sunday-evening fan-out to all active subscribers. Vercel cron header
// (Authorization: Bearer $CRON_SECRET) is required.
//
// Each subscriber gets the same template body but a personalized
// unsubscribe URL (their unique unsub_token). We render the template
// once per recipient so the unsubscribe link is correct — the
// generation cost is tiny compared to the network round-trip.
//
// Hard-failure rows (Resend reports a bounce on send) are logged but
// don't fail the cron — the email is best-effort. The cron returns 200
// with a count of attempted/succeeded so an alert pipeline can spot
// regressions.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Pull all active subscribers. The table is admin-only (RLS denies
  // everyone else), so this is a service-role select.
  const { data: rows, error } = await supabase
    .from("subscribers")
    .select("email, unsub_token")
    .eq("status", "active");

  if (error) {
    return NextResponse.json(
      { error: "subscriber-fetch-failed", message: error.message },
      { status: 500 },
    );
  }

  const subscribers = (rows ?? []) as Array<{
    email: string;
    unsub_token: string;
  }>;

  if (subscribers.length === 0) {
    return NextResponse.json({ skipped: "no-subscribers", attempted: 0 });
  }

  // Render the personalized payloads concurrently — each render is a
  // CPU-only string format, no I/O. Promise.all is fine at hundreds of
  // recipients; we'll revisit if the list crosses 5K.
  const messages: ResendMessage[] = await Promise.all(
    subscribers.map(async (sub) => {
      const unsubscribeUrl = `${SITE_URL}/api/subscribe/unsubscribe/${sub.unsub_token}`;
      const { html, text } = await renderEmail(
        DigestCountdown({ siteUrl: SITE_URL, unsubscribeUrl }),
      );
      return {
        to: sub.email,
        subject: "6 hours left to pitch this week — pitch-pit",
        html,
        text,
      };
    }),
  );

  const result = await sendResendBatch(messages);

  return NextResponse.json({
    attempted: result.attempted,
    succeeded: result.succeeded,
    errors: result.errors,
  });
}
