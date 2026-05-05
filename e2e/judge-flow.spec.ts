import { test, expect, type Page } from "@playwright/test";

// E2E for the three-judge deliberation flow. Pure structural checks —
// /api/draft validation, /judge/[token] not-found behavior, and the
// homepage submit-to-redirect handoff (with /api/draft and Turnstile
// mocked so we don't need Supabase + Anthropic + Cloudflare wired up
// to run the suite).

// Inject a stub for window.turnstile so the homepage submit form's
// invisible captcha resolves immediately with a fake token. Must run
// BEFORE the page navigates so Turnstile.tsx picks up the stub on init.
async function stubTurnstile(page: Page) {
  await page.addInitScript(() => {
    type Cb = (token: string) => void;
    const callbacks = new Map<string, Cb>();
    let counter = 0;
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: (
        _el: HTMLElement | string,
        opts: { callback?: Cb },
      ): string => {
        const id = `e2e-widget-${++counter}`;
        if (opts.callback) callbacks.set(id, opts.callback);
        return id;
      },
      execute: (id: string): void => {
        const cb = callbacks.get(id);
        if (cb) Promise.resolve().then(() => cb("e2e-fake-token"));
      },
      reset: (): void => {},
      remove: (id: string): void => {
        callbacks.delete(id);
      },
    };
    // Trigger any onload callback the component may have registered.
    const w = window as unknown as {
      onloadTurnstileCallback?: () => void;
    };
    if (typeof w.onloadTurnstileCallback === "function") {
      w.onloadTurnstileCallback();
    }
  });
}

test.describe("judge flow", () => {
  test("/judge/{bogus-token} renders the not-found page", async ({ page }) => {
    // Note: Next.js streaming returns 200 then flips body to the 404
    // page when notFound() fires after any yield. Asserting on body
    // content is the reliable signal here.
    await page.goto("/judge/this-is-not-a-real-token");
    await expect(page.getByText(/never reached the arena/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  // The /api/draft tests below accept any 4xx because the route is
  // rate-limited at the middleware (5/10 min per IP). After repeated
  // local runs the counter is non-zero and a request will hit 429
  // before reaching the body validator. We care that the request is
  // REJECTED, not the specific status — every 4xx is a legitimate
  // rejection in this flow.
  test("/api/draft rejects empty body", async ({ request }) => {
    const res = await request.post("/api/draft", { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  test("/api/draft rejects too-short pitch", async ({ request }) => {
    const res = await request.post("/api/draft", {
      data: { title: "T", pitch: "way too short" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("/api/draft rejects malformed JSON", async ({ request }) => {
    const res = await request.post("/api/draft", {
      data: "not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("anonymous submit redirects to /login (auth wall)", async ({ page }) => {
    // Submissions now require auth — the auth wall in HomeScene checks
    // supabase.auth.getUser() and bounces unauthenticated users to /login
    // with a `next` param pointing back to / with ?resume=1, so the
    // restored draft auto-submits after the user signs in. This test
    // exercises that bounce; the signed-in happy path needs a real
    // Supabase session and lives outside this smoke suite.
    await stubTurnstile(page);

    // Even though the auth wall short-circuits before /api/draft is
    // called, mock it anyway so a regression that bypasses the wall
    // would land in /judge/[token] (visible failure) rather than
    // 500-ing the prod schema. If this route gets hit, the test fails.
    let draftCalled = false;
    await page.route("**/api/draft", async (route) => {
      draftCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "should-not-reach-here" }),
      });
    });

    await page.goto("/");
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    const pitch =
      "A long-enough sample pitch describing a legitimate startup idea so the schema's 60-character minimum passes cleanly without any noise.";
    await textarea.fill(pitch);

    // Submit via Enter on the textarea (the form's documented UX path).
    // Clicking the submit button is racier in headless because the button
    // disable flips on `length === 0` from React state — Enter goes
    // through the keydown handler in HomeScene which calls submit()
    // directly.
    await textarea.press("Enter");

    // Auth wall bounces to /login with the resume-aware next param.
    await page.waitForURL(/\/login\?next=/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login\?next=.*resume%3D1/);
    expect(draftCalled).toBe(false);

    // Draft preserved in localStorage so the post-login resume effect
    // can restore + auto-submit when the user comes back. This is the
    // mechanism that closes the loop — verify it's intact.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("pitch-pit:home-pitch-draft"),
    );
    expect(stored).toBe(pitch);
  });
});
