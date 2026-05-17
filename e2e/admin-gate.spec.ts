import { test, expect } from "@playwright/test";

// E2E for the /admin Basic Auth gate (middleware.ts → lib/admin-auth.ts).
// HTTP-level only — no browser needed. The middleware expects:
//
//   Authorization: Basic base64("admin:<ADMIN_PASSWORD>")
//
// (username is the literal string "admin"; the password is from env).
// On miss it returns 401 with `WWW-Authenticate: Basic realm="pitch-pit-admin"`.
//
// CI sets ADMIN_PASSWORD=ci-stub-admin-password for the Playwright job, so
// the "correct password" case below uses that value. When running locally,
// export the same value before `npx playwright test` to keep this spec
// deterministic. If ADMIN_PASSWORD is unset entirely, middleware returns
// 503 ("not-configured") rather than 401 — that's a separate failure mode
// and out of scope for this gate-behavior spec.

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ci-stub-admin-password";

function basicAuthHeader(user: string, pass: string): string {
  // btoa exists in modern Node (>=16) and matches the middleware's encoder.
  return "Basic " + btoa(`${user}:${pass}`);
}

test.describe("/admin basic auth gate", () => {
  test("rejects request with no Authorization header (401 + WWW-Authenticate)", async ({
    request,
  }) => {
    const res = await request.get("/admin");
    expect(res.status()).toBe(401);
    // The WWW-Authenticate header is what makes browsers prompt for
    // credentials — it's load-bearing UX, not just a status code.
    const challenge = res.headers()["www-authenticate"];
    expect(challenge).toBeTruthy();
    expect(challenge).toMatch(/^Basic\s+realm=/i);
  });

  test("rejects request with wrong password (401)", async ({ request }) => {
    const res = await request.get("/admin", {
      headers: {
        Authorization: basicAuthHeader("admin", "definitely-not-the-password"),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("accepts request with correct admin:password (not 401)", async ({
    request,
  }) => {
    const res = await request.get("/admin", {
      headers: {
        Authorization: basicAuthHeader("admin", ADMIN_PASSWORD),
      },
    });
    // Anything that ISN'T 401 means the gate let us through. The page
    // itself may 200, redirect, or even 500 if Supabase env vars aren't
    // wired in this environment — none of that is the gate's job.
    expect(res.status()).not.toBe(401);
  });
});
