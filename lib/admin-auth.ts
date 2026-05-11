import { headers } from "next/headers";

// Constant-time string compare. We avoid Node's crypto.timingSafeEqual
// because middleware runs on the Edge runtime where the Node crypto
// module is unavailable; this loop works in both runtimes. A length
// mismatch returns false immediately — fine here because the expected
// header is fixed-length and attacker-known once they look at the
// Basic-Auth scheme; the secret is the password inside, not the length.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type AdminAuthResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "unauthorized" };

// Single source of truth for "is this request authorized as admin".
// Used by middleware (gate /admin paths) and by Server Actions (gate
// every action in app/admin/actions.ts). Don't inline this logic
// anywhere else — keeping the credential format + compare semantics
// here means the two surfaces can't drift.
export function verifyAdminAuthHeader(
  authHeader: string | null | undefined,
): AdminAuthResult {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return { ok: false, reason: "not-configured" };
  const expected = "Basic " + btoa(`admin:${password}`);
  if (!authHeader) return { ok: false, reason: "unauthorized" };
  return constantTimeEqual(authHeader, expected)
    ? { ok: true }
    : { ok: false, reason: "unauthorized" };
}

// Call this at the top of every privileged Server Action.
//
// WHY: Next.js Server Actions are POSTed to the current page route with
// a `Next-Action: <hash>` header. The middleware matcher is path-bound
// (`/admin`, `/admin/:path*`, `/api/draft`) — so an action imported by
// the admin UI can be invoked by POSTing to ANY OTHER page route with
// the same Next-Action hash, bypassing the Basic-Auth gate entirely.
// The mutation then runs with the service-role client and the attacker
// gets full RLS bypass. Calling this guard inside the action itself
// closes that path.
export async function requireAdminFromServerAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const h = await headers();
  const result = verifyAdminAuthHeader(h.get("authorization"));
  if (result.ok) return { ok: true };
  if (result.reason === "not-configured") {
    return { ok: false, error: "Admin auth is not configured." };
  }
  return { ok: false, error: "Unauthorized." };
}
