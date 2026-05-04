import { NextRequest, NextResponse } from "next/server";
import { limitScoreSubmission } from "@/lib/ratelimit";

const REALM = 'Basic realm="pitch-pit-admin"';

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function rateLimitScore(req: NextRequest): Promise<NextResponse | null> {
  const ip = clientIp(req);
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
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse(
      "ADMIN_PASSWORD is not configured. Set it in your environment.",
      { status: 503 },
    );
  }
  const expected = "Basic " + btoa(`admin:${password}`);
  const authHeader = req.headers.get("authorization");
  if (authHeader === expected) return null;
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // /api/score: rate-limit POSTs by IP. GETs / OPTIONS pass through.
  if (path === "/api/score") {
    if (req.method === "POST") {
      const limited = await rateLimitScore(req);
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
  matcher: ["/admin", "/admin/:path*", "/api/score"],
};
