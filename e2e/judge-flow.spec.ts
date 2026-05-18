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

  test("anonymous submit hands off to /judge/[token] (no auth wall)", async ({
    page,
  }) => {
    // Architectural change (commit 47f6fde — anonymous-first): the auth
    // wall that used to bounce unauthenticated users from the homepage
    // to /login was deliberately removed. /api/draft now accepts anon
    // submissions, mints an HttpOnly claim cookie, and the user only
    // hits the auth wall later at /api/claim-idea. See the comment block
    // in HomeScene.tsx around the submit() handler. This spec locks in
    // the new contract: anon submit reaches /judge/[token].
    await stubTurnstile(page);

    // /api/draft is mocked so the route doesn't need a real Supabase
    // (the homepage POSTs here after Turnstile resolves and expects a
    // `{ token }` envelope back to drive router.push).
    const FIXTURE_TOKEN = "anon-fixture-token-deadbeef";
    let draftCalled = false;
    await page.route("**/api/draft", async (route) => {
      draftCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: FIXTURE_TOKEN }),
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

    // No /login redirect — anon path is the happy path now. Navigation
    // lands on /judge/[token] with the fixture token from the mock.
    await page.waitForURL(`**/judge/${FIXTURE_TOKEN}`, { timeout: 15_000 });
    expect(page.url()).toContain(`/judge/${FIXTURE_TOKEN}`);
    expect(draftCalled).toBe(true);

    // On success the homepage clears the saved draft from localStorage
    // (the resume-after-login path no longer needs it). Verify that
    // contract so a regression that leaves drafts piling up surfaces.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem("pitch-pit:home-pitch-draft"),
    );
    expect(stored).toBeNull();
  });
});
