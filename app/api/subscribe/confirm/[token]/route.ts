import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

// Minimal HTML response for the 404 / error path. Email clients can't
// follow the redirect into our app shell when the token is invalid —
// they just land on this page in a webview. Inline-styled to match the
// minimalist aesthetic.
function notFoundHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Link expired — pitch-pit</title>
</head>
<body style="background:#000;color:#fff;font-family:Inter,Helvetica,Arial,sans-serif;margin:0;padding:0;">
  <div style="max-width:560px;margin:0 auto;padding:96px 24px;text-align:center;">
    <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,184,0,0.78);margin:0 0 24px 0;">pitch-pit</p>
    <h1 style="font-family:'Fraunces',Georgia,serif;font-weight:500;font-size:36px;line-height:1.1;margin:0 0 16px 0;">Link expired or invalid.</h1>
    <p style="color:rgba(255,255,255,0.65);font-size:16px;line-height:1.6;margin:0 0 32px 0;">This confirmation link is no longer valid. If you still want to subscribe, head back to the homepage and try again.</p>
    <a href="${SITE_URL}" style="background:#FFB800;color:#1a0f00;font-weight:600;padding:14px 32px;border-radius:9999px;text-decoration:none;display:inline-block;letter-spacing:0.04em;">Back to pitch-pit →</a>
  </div>
</body>
</html>`;
}

// GET /api/subscribe/confirm/[token]
// Flips a pending subscriber row to active. Returns a 302 redirect to
// the homepage on success (with ?subscribed=1 so the UI can flash a
// toast); 404 HTML on token mismatch.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 32) {
    return new NextResponse(notFoundHtml(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("subscribers")
    .select("id, status")
    .eq("opt_in_token", token)
    .maybeSingle<{ id: string; status: string }>();

  if (!row) {
    return new NextResponse(notFoundHtml(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // If already active, just redirect — don't re-flip timestamps and
  // don't surface a different message. Re-clicking a confirmation
  // email shouldn't look like an error.
  if (row.status === "active") {
    return NextResponse.redirect(`${SITE_URL}/?subscribed=1`, 302);
  }

  // Flip pending → active. We don't touch unsubscribed/bounced rows
  // from here — those need a fresh /api/subscribe submission.
  if (row.status === "pending") {
    await supabase
      .from("subscribers")
      .update({
        status: "active",
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  return NextResponse.redirect(`${SITE_URL}/?subscribed=1`, 302);
}
