import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

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
    <p style="color:rgba(255,255,255,0.65);font-size:16px;line-height:1.6;margin:0;">This unsubscribe link is no longer valid. If you&rsquo;re still on the list and want off, reply to any pitch-pit email.</p>
  </div>
</body>
</html>`;
}

function confirmedHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribed — pitch-pit</title>
</head>
<body style="background:#000;color:#fff;font-family:Inter,Helvetica,Arial,sans-serif;margin:0;padding:0;">
  <div style="max-width:560px;margin:0 auto;padding:96px 24px;text-align:center;">
    <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,184,0,0.78);margin:0 0 24px 0;">pitch-pit</p>
    <h1 style="font-family:'Fraunces',Georgia,serif;font-weight:500;font-size:40px;line-height:1.1;margin:0 0 16px 0;">You&rsquo;re <em style="color:#FFB800;">out</em>.</h1>
    <p style="color:rgba(255,255,255,0.65);font-size:16px;line-height:1.6;margin:0 0 32px 0;">No more emails. The pit still opens every Monday at midnight EST if you ever change your mind.</p>
    <a href="${SITE_URL}" style="background:transparent;color:#FFB800;font-weight:600;padding:12px 28px;border-radius:9999px;text-decoration:none;display:inline-block;letter-spacing:0.04em;border:1px solid #FFB800;">Back to pitch-pit →</a>
  </div>
</body>
</html>`;
}

// GET /api/subscribe/unsubscribe/[token]
// Flips an active subscriber to unsubscribed. Returns an HTML page
// (not a redirect) so the user gets a clear "you're out" confirmation —
// a silent redirect to / would look like the link didn't do anything.
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
    .eq("unsub_token", token)
    .maybeSingle<{ id: string; status: string }>();

  if (!row) {
    return new NextResponse(notFoundHtml(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // Already unsubscribed — show the same success page rather than a
  // 404 or 400. Re-clicking the link from a forwarded email is fine.
  if (row.status !== "unsubscribed") {
    await supabase
      .from("subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  return new NextResponse(confirmedHtml(), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
