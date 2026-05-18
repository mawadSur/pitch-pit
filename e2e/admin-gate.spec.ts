import { test, expect } from "@playwright/test";

// E2E for the /admin auth gate.
//
// As of migration 032, /admin is gated by Supabase magic-link + the
// `users.is_admin` column — NOT by HTTP Basic Auth any more. The
// middleware (middleware.ts) handles the session check at the Edge:
//
//   - No Supabase session cookie → 307 redirect to
//     /login?next=%2Fadmin (login then bounces back)
//   - Session present → middleware lets the request through and the
//     page itself runs requireAdmin() which checks is_admin. A
//     signed-in non-admin renders a 403-style page (still served as
//     HTTP 200 because Next renders a normal React tree, but the body
//     contains the "not an admin" copy).
//
// This spec is HTTP-level only and does not actually sign in — that
// would require either seeding a session cookie or a full magic-link
// dance, both of which are out of scope for a gate-behavior smoke test.
// The deeper "signed-in non-admin gets 403" assertion is intentionally
// left for a future fixture-backed test; here we only verify the
// middleware redirect for anonymous callers, which is the most common
// failure mode and the one that used to be a 401 challenge.

test.describe("/admin auth gate", () => {
  test("anon request redirects to /login with next=/admin", async ({
    request,
  }) => {
    // maxRedirects: 0 keeps Playwright on the first hop so we can
    // inspect the redirect itself (status + Location header) rather
    // than following it through to the rendered login page.
    const res = await request.get("/admin", { maxRedirects: 0 });

    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);

    const location = res.headers()["location"];
    expect(location).toBeTruthy();
    // The middleware emits an absolute-or-relative URL. Either way it
    // must point at /login and carry the next= return target.
    expect(location).toMatch(/\/login\b/);
    expect(decodeURIComponent(location)).toContain("next=/admin");
  });

  test("anon request to a nested admin path also redirects to /login", async ({
    request,
  }) => {
    const res = await request.get("/admin/anything", { maxRedirects: 0 });

    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);

    const location = res.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toMatch(/\/login\b/);
    // The nested path is preserved through the redirect so the user
    // lands back where they were trying to go after sign-in.
    expect(decodeURIComponent(location)).toContain("next=/admin/anything");
  });

  test("Basic Auth header is no longer accepted (no 200 shortcut)", async ({
    request,
  }) => {
    // Pre-migration this exact header would have let the request
    // through. Post-migration it is irrelevant — middleware ignores
    // it entirely and still bounces anons to /login. This test
    // documents the regression we're guarding against: a stale
    // bookmark using Basic Auth must not silently grant access.
    const res = await request.get("/admin", {
      headers: {
        Authorization: "Basic " + btoa("admin:anything"),
      },
      maxRedirects: 0,
    });

    expect(res.status()).not.toBe(200);
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);

    const location = res.headers()["location"];
    expect(location).toMatch(/\/login\b/);
  });
});
