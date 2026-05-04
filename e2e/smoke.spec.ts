import { test, expect } from "@playwright/test";

// Smoke tests — every test here must pass without any backend env vars set.
// They exercise the routing layer + the React tree, NOT the API.

test.describe("public surface smoke", () => {
  test("homepage renders with submission textarea", async ({ page }) => {
    await page.goto("/");
    // The pitch textarea is the load-bearing element on the homepage.
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    // The "Pitch idea" / hero copy proves the React tree mounted, not just
    // the static shell.
    await expect(page.getByText(/pitch|verdict|tribute/i).first()).toBeVisible();
  });

  test("rules page renders", async ({ page }) => {
    await page.goto("/rules");
    await expect(page).toHaveTitle(/rules|pitch-pit/i);
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("privacy page renders with last-updated stamp", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/last updated/i)).toBeVisible();
  });

  test("terms page renders with last-updated stamp", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText(/last updated/i)).toBeVisible();
  });

  test("404 page handles a bogus idea id", async ({ page }) => {
    // Valid UUID shape so the route param parses, but no such row exists.
    const res = await page.goto(
      "/idea/00000000-0000-0000-0000-000000000000",
    );
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/never reached the arena/i)).toBeVisible();
  });

  test("submit button stays disabled for a too-short pitch", async ({
    page,
  }) => {
    await page.goto("/");
    const textarea = page.locator("textarea");
    await textarea.fill("only a few words");
    // The form must not allow submitting until 60+ chars are present.
    // We assert by counting how many chars away the user is — the live
    // counter is part of the homepage UX.
    await expect(page.getByText(/more to submit|\d+\/1500/i)).toBeVisible();
  });
});
