import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { limitScoreSubmission } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/client-ip";

async function rateLimitSubmission(
  req: NextRequest,
): Promise<NextResponse | null> {
  // getClientIp() prefers Vercel-injected headers; "unknown" is a
  // sentinel so unknown-IP traffic still throttles under a single
  // shared bucket rather than failing open.
  const ip = getClientIp(req);
  const verdict = await limitScoreSubmission(ip);

  if (verdict.success) return null;

  const retryAfter = Math.max(1, Math.ceil((verdict.reset - Date.now()) / 1000));
  return new NextResponse(
    JSON.stringify({
      error: `Too many submissions. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(verdict.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.floor(verdict.reset / 1000)),
      },
    },
  );
}

// Lightweight session check for /admin.
//
// Middleware runs on the Edge runtime, so it cannot use the Node-side
// `cookies()` helper from lib/supabase/server.ts. We build a request-scoped
// Supabase ssr client here that reads (and refreshes, if needed) the auth
// cookies on the NextRequest / NextResponse. This only confirms "is the
// caller signed in at all?" — the privilege check (public.users.is_admin)
// happens in the page itself via requireAdmin(), which DOES hit the DB.
//
// Two-layer rationale: middleware can't easily run a DB query without
// adding latency to every /admin sub-request and pulling extra deps into
// the Edge bundle. So we keep middleware as a cheap auth-only gate
// (redirect anon → /login), and let the page/action layer enforce the
// is_admin bit. A signed-in non-admin who sneaks past middleware still
// hits requireAdmin() → null → 403 in the page.
async function adminSessionGate(
  req: NextRequest,
): Promise<NextResponse | null> {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set({ name, value, ...options });
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // No session — bounce to /login with a return target. The login flow
    // already knows how to honor ?next= and route the user back here.
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }

  // Session present. We deliberately do NOT call requireAdmin()/isAdmin()
  // here — querying public.users from Edge for every admin sub-request
  // would add a round trip on the hot path, and the page-level guard
  // already enforces the is_admin bit. Letting a signed-in non-admin
  // through middleware just means they hit the 403 fallback in
  // app/(with-footer)/admin/page.tsx a few ms later.
  return res;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Submission entry point: rate-limit POSTs by IP. GETs / OPTIONS pass
  // through. 5 submissions / 10 min per IP.
  if (path === "/api/draft") {
    if (req.method === "POST") {
      const limited = await rateLimitSubmission(req);
      if (limited) return limited;
    }
    return NextResponse.next();
  }

  // /admin: Supabase session gate. Anon → /login. Signed-in → through to
  // the page, which then checks public.users.is_admin via requireAdmin().
  if (path === "/admin" || path.startsWith("/admin/")) {
    return await adminSessionGate(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/draft"],
};
