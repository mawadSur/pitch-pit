import type { Page, Route } from "@playwright/test";

// Helper: mocks the Supabase browser-originated network surface for e2e
// specs. This is the contract `lib/supabase/client.ts` uses when the
// React tree boots in the browser — auth probes, REST reads, realtime.
//
// What this helper does NOT cover:
//   - Server-side Supabase calls from inside Next.js route handlers or
//     async server components. Those go through Node fetch in the
//     Next.js process and are invisible to page.route. See the header
//     comment in submit-score-reveal.spec.ts for the architectural
//     reality. Pages that SSR-fetch from Supabase will still 404 in CI
//     where NEXT_PUBLIC_SUPABASE_URL is the stub https://example.supabase.co.
//   - The /api/vote handler itself (different concern — mock that
//     separately at **/api/vote in the spec).

export type FakeUser = {
  /** UUID string. Must match the user_id the votes table would store. */
  id: string;
  email?: string;
};

/**
 * Stub every browser-originated Supabase call. Auth GETs return a
 * fake user session (signedIn === true). REST GETs return 404 (empty),
 * REST writes return 200. Realtime websockets fail open. Apply BEFORE
 * page.goto() so the React tree's first auth probe sees the stub.
 *
 * When `user` is null, auth probes return 401 (no session), which is
 * how the React tree learns "anonymous user" without ever touching the
 * real Supabase project.
 */
export async function mockSupabaseBrowser(
  page: Page,
  user: FakeUser | null,
): Promise<void> {
  // ── auth/v1/user — getUser() probe ───────────────────────────────
  // The Supabase JS client hits GET /auth/v1/user on every getUser()
  // call. Return either a fake user payload (signed in) or 401 (anon).
  await page.route("**/auth/v1/user**", async (route: Route) => {
    if (!user) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid JWT" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: user.id,
        aud: "authenticated",
        role: "authenticated",
        email: user.email ?? `${user.id}@example.test`,
        app_metadata: { provider: "email" },
        user_metadata: {},
        created_at: new Date().toISOString(),
      }),
    });
  });

  // ── auth/v1/token — refresh / getSession ─────────────────────────
  await page.route("**/auth/v1/token**", async (route: Route) => {
    if (!user) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_grant" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "fake-access-token",
        refresh_token: "fake-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: user.id, email: user.email },
      }),
    });
  });

  // ── REST surface — wildcard fallback ─────────────────────────────
  // Catches any /rest/v1/* GET (e.g. votes lookup, ideas read) and
  // returns empty. Tests that need specific REST fixtures should
  // register a more-specific page.route BEFORE calling this helper
  // (Playwright matches in registration order, most-recent first).
  await page.route("**/rest/v1/**", async (route: Route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }
    // Writes (POST/PATCH/DELETE) succeed with an empty body.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // ── Realtime websocket — fail closed so the client gives up fast ─
  // The realtime endpoint is wss:// — page.route can intercept the
  // upgrade handshake at the http(s) URL. We just reject; the client
  // logs an error and continues without realtime. The test doesn't
  // depend on realtime updates.
  await page.route("**/realtime/v1/**", async (route: Route) => {
    await route.fulfill({ status: 404, body: "" });
  });
}

/**
 * Set the Supabase auth cookies directly so the cookie-aware server
 * client (lib/supabase/server.ts) thinks there's a session — relevant
 * if a route handler reads `supabase.auth.getUser()` from cookies.
 *
 * NOTE: With the stub NEXT_PUBLIC_SUPABASE_URL in CI, the server
 * client's own auth probe will still fail at the network layer
 * (Supabase JS makes an HTTP call to validate the token). Setting
 * cookies alone is not enough to fake a server-side session — it's
 * cosmetic here and exists as a placeholder for the day this repo
 * grows a `SUPABASE_E2E_BYPASS=1` env-gated short-circuit.
 */
export async function setFakeAuthCookies(
  page: Page,
  user: FakeUser,
): Promise<void> {
  const url = new URL(page.url() === "about:blank" ? "http://localhost:3100" : page.url());
  await page.context().addCookies([
    {
      name: "sb-access-token",
      value: `fake-access-token-${user.id}`,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "sb-refresh-token",
      value: `fake-refresh-token-${user.id}`,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
