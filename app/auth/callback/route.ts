import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// OAuth callback for Supabase Auth (Google, magic-link, etc).
// Supabase redirects here after the provider handshake; we exchange the code
// for a session, then redirect to the post-login destination.
//
// Security: `next` query param is validated as a same-origin PATH only —
// never a full URL — so we can't be coerced into redirecting to a phishing
// site that mimics pitch-pit.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Same-origin path validation: must start with single "/" and not "//"
  // (which would be interpreted as a protocol-relative URL).
  const rawNext = searchParams.get("next") ?? "/";
  const safeNext =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
