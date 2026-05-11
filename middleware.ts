import { NextRequest, NextResponse } from "next/server";
import { limitScoreSubmission } from "@/lib/ratelimit";
import { verifyAdminAuthHeader } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/client-ip";

const REALM = 'Basic realm="pitch-pit-admin"';

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

function adminBasicAuth(req: NextRequest): NextResponse | null {
  const result = verifyAdminAuthHeader(req.headers.get("authorization"));
  if (result.ok) return null;
  if (result.reason === "not-configured") {
    return new NextResponse(
      "ADMIN_PASSWORD is not configured. Set it in your environment.",
      { status: 503 },
    );
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
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

  // /admin: HTTP Basic auth gate.
  if (path === "/admin" || path.startsWith("/admin/")) {
    const denied = adminBasicAuth(req);
    if (denied) return denied;
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/draft"],
};
