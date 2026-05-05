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

  test("/api/draft rejects empty body with 400", async ({ request }) => {
    const res = await request.post("/api/draft", { data: {} });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  test("/api/draft rejects too-short pitch with 400", async ({ request }) => {
    const res = await request.post("/api/draft", {
      data: { title: "T", pitch: "way too short" },
    });
    expect(res.status()).toBe(400);
  });

  test("/api/draft rejects malformed JSON with 400", async ({ request }) => {
    const res = await request.post("/api/draft", {
      data: "not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("homepage submit POSTs /api/draft and redirects to /judge/[token]", async ({
    page,
  }) => {
    await stubTurnstile(page);

    // Mock /api/draft so the test doesn't need Supabase/Anthropic wired.
    let postedBody: { pitch?: string; title?: string } | null = null;
    await page.route("**/api/draft", async (route) => {
      postedBody = route.request().postDataJSON() as {
        pitch?: string;
        title?: string;
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-token-abc" }),
      });
    });

    await page.goto("/");
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    await textarea.fill(
      "A long-enough sample pitch describing a legitimate startup idea so the schema's 60-character minimum passes cleanly without any noise.",
    );

    const submitBtn = page
      .getByRole("button", { name: /submit|judging/i })
      .first();
    await submitBtn.click();

    await page.waitForURL(/\/judge\/mock-token-abc/, { timeout: 10_000 });
    expect(page.url()).toContain("/judge/mock-token-abc");
    expect(postedBody).not.toBeNull();
    expect(postedBody!.pitch?.length ?? 0).toBeGreaterThanOrEqual(60);
    expect(postedBody!.title).toBeTruthy();
  });
});
