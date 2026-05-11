// Trustworthy client-IP extraction for rate-limit keying.
//
// `x-forwarded-for` is attacker-controlled on the first hop — anyone
// can send `X-Forwarded-For: 1.2.3.4` and bypass any IP-based throttle
// that blindly trusts the first comma-separated entry. On Vercel the
// edge injects `x-vercel-forwarded-for` AFTER any client-supplied
// header, so its last entry is the real client IP.
//
// Preference order:
//   1. `x-vercel-forwarded-for` — Vercel-injected, last entry is the
//      real client IP (anything before is the chain Vercel observed,
//      which is informational only).
//   2. `x-real-ip` — set by some reverse proxies (nginx, Cloudflare)
//      to the single real client IP. Trusted only because we don't
//      run behind a generic proxy that would forge it.
//   3. `x-forwarded-for` — fallback for non-Vercel envs (local dev
//      behind a tunnel, self-hosted reverse proxies). Take the LAST
//      entry rather than the first to avoid the trivial spoof where a
//      client prepends their own values; the rightmost entry is what
//      our nearest trusted proxy actually saw.
//   4. `"unknown"` — sentinel string. Callers must never branch on
//      truthiness; "unknown" is treated as a single shared bucket so
//      the limiter still fires (better to throttle the union of all
//      unknown-IP traffic than to fail open).
//
// Returning a non-empty string always means the rate-limit call site
// can pass it through unconditionally — no `if (ip)` checks needed.

type IpHeaderSource = {
  headers: { get(name: string): string | null };
};

function lastEntry(value: string | null): string | null {
  if (!value) return null;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  return parts[parts.length - 1];
}

export function getClientIp(req: IpHeaderSource): string {
  const vercel = lastEntry(req.headers.get("x-vercel-forwarded-for"));
  if (vercel) return vercel;

  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const fwd = lastEntry(req.headers.get("x-forwarded-for"));
  if (fwd) return fwd;

  return "unknown";
}
