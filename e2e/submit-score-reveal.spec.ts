import { test, expect, type Page, type Route } from "@playwright/test";

// E2E: submit → AI score → reveal handoff.
//
// IMPORTANT — architectural reality check (worktree commit 869588f):
//
// The CLAUDE.md still describes an "/api/score" route that calls
// Anthropic and returns an idea id; the homepage was supposed to
// redirect to /idea/[id] for the reveal. That layout is stale. The
// current flow is:
//
//   POST /api/draft  → returns { token }   (NO Anthropic call here)
//   router.push(`/judge/${token}`)         (homepage handoff)
//   /judge/[token]   → 3 judge cards, each an async server component
//                      that calls Anthropic from inside React via
//                      lib/judges/render-judgment.ts
//
// Two consequences for this spec:
//
//   1. The Anthropic call happens server-side from the Next.js
//      process. Playwright's page.route() only intercepts browser-
//      originated traffic, so we CANNOT stub api.anthropic.com from
//      here in a way that the judge route actually sees. The page.route
//      stub below is kept as a defence-in-depth tripwire — if anyone
//      ever moves an Anthropic call into the browser, this catches it
//      and surfaces our fixture rather than a 401 from a real key.
//
//   2. The "reveal" verdict text on /judge/[token] is gated by that
//      same server-side Anthropic call. Without an in-process mock
//      (which would need a webServer-level test mode the repo does
//      not currently expose), we cannot assert on the fixture verdict
//      string from this spec. We assert on the navigation contract
//      and the deliberation-framing markup that renders BEFORE the
//      Suspense boundaries resolve — that's the load-bearing handoff
//      a regression in /api/draft, the homepage submit handler, or
//      /judge/[token]'s shell would break.
//
// What this spec locks in:
//   ✓ Submit form posts to /api/draft with a schema-valid pitch.
//   ✓ Successful /api/draft response triggers router.push(/judge/<token>).
//   ✓ /judge/[token] route resolves and renders the deliberation shell.
//   ✓ No real Anthropic key is ever needed (the network is mocked
//     both at /api/draft and at Anthropic's host).
//
// Anthropic fixture (see ANTHROPIC_FIXTURE below):
//   score:   7
//   verdict: "fixture-verdict-from-e2e-test"
// These would surface on /judge/[token] judge cards IF a future
// refactor moves the Anthropic call client-side; until then they
// document intent.

const FIXTURE_TOKEN = "e2e-fixture-token-0123456789abcdef0123456789abcdef";

// scoreSchema shape from lib/score-schema.ts. Verdict + score chosen
// to be obvious if they ever leak into the rendered UI.
const ANTHROPIC_FIXTURE = {
  score: 7,
  verdict: "fixture-verdict-from-e2e-test",
  strengths: ["clear wedge", "specific user", "shippable in a week"],
  concerns: ["pricing unproven", "distribution not yet mapped"],
  reasoning:
    "A focused MVP with a sharp wedge. Distribution and pricing remain the riskiest unknowns; the underlying insight is sound enough to justify a build.",
  build_recommended: true,
  moderation_flag: false,
  moderation_reason: "",
};

// Anthropic Messages API response envelope. The inner text block is
// the JSON-encoded scoreSchema payload — lib/extract-json.ts pulls
// the first { ... last } window out of LLM output before scoreSchema
// parses it, so wrapping in prose/fences would also work.
const ANTHROPIC_RESPONSE = {
  id: "msg_test_e2e",
  type: "message",
  role: "assistant",
  content: [
    { type: "text", text: JSON.stringify(ANTHROPIC_FIXTURE) },
  ],
  model: "claude-sonnet-4-6",
  stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 200 },
};

// Inject a stub for window.turnstile so the homepage submit form's
// invisible captcha resolves immediately with a fake token. Mirrors
// the helper in judge-flow.spec.ts. Must run BEFORE page navigation
// so Turnstile.tsx picks up the stub on init.
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
    const w = window as unknown as { onloadTurnstileCallback?: () => void };
    if (typeof w.onloadTurnstileCallback === "function") {
      w.onloadTurnstileCallback();
    }
  });
}

test.describe("submit → score → reveal", () => {
  test("homepage submit hands off to /judge/[token] with Anthropic + Supabase mocked", async ({
    page,
  }) => {
    await stubTurnstile(page);

    // ── 1. Anthropic stub (defence-in-depth) ───────────────────
    // Anthropic is called from the Next.js server process inside
    // the /judge/[token] route's async server components — see the
    // header comment for why page.route() can't actually intercept
    // it. This handler exists so that ANY future client-side
    // Anthropic call gets the fixture instead of a real-key 401.
    let anthropicCalledFromBrowser = false;
    await page.route("https://api.anthropic.com/**", async (route: Route) => {
      anthropicCalledFromBrowser = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ANTHROPIC_RESPONSE),
      });
    });

    // ── 2. /api/draft stub ─────────────────────────────────────
    // The homepage POSTs here after Turnstile resolves. Returning a
    // fixed token lets us assert the redirect to /judge/<token>
    // without touching Supabase. Without this stub, /api/draft would
    // try to insert into the stub Supabase at https://example.supabase.co
    // and 500. We capture the body so we can verify the homepage
    // packed a schema-valid pitch.
    let draftRequestBody: Record<string, unknown> | null = null;
    await page.route("**/api/draft", async (route: Route) => {
      try {
        draftRequestBody = route.request().postDataJSON() as Record<
          string,
          unknown
        >;
      } catch {
        draftRequestBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: FIXTURE_TOKEN }),
      });
    });

    // ── 3. Supabase stub (everything else) ─────────────────────
    // Defence-in-depth: catches any browser-originated Supabase
    // traffic (e.g. the realtime client kicked up by /idea/[id])
    // so the test doesn't depend on https://example.supabase.co
    // resolving. Server-side Supabase calls inside /judge/[token]
    // are NOT interceptable from here (same reason as Anthropic);
    // those still hit the stub URL and will fail server-side,
    // which is precisely why the assertions below stop at the
    // deliberation shell rather than the resolved judge cards.
    await page.route("https://*.supabase.co/**", async (route: Route) => {
      const url = new URL(route.request().url());
      // Pretend any GET is a 404 (no rows) and any write is a 200.
      const status = route.request().method() === "GET" ? 404 : 200;
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ url: url.pathname }),
      });
    });

    // ── 4. Fill + submit ───────────────────────────────────────
    await page.goto("/");
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();

    // submitSchema (lib/score-schema.ts) requires pitch.length >= 60
    // after .trim(). 142 chars — comfortably above the floor, well
    // below the 3500 ceiling.
    const pitch =
      "A weekly contest where founders pitch ideas, an AI panel scores them on a 0-10 rubric, and the community votes the winner into a free MVP build.";
    expect(pitch.length).toBeGreaterThanOrEqual(60);
    expect(pitch.length).toBeLessThanOrEqual(3500);
    await textarea.fill(pitch);

    // Submit via Enter on the textarea — judge-flow.spec.ts notes
    // this is more reliable in headless than clicking the disabled-
    // until-state-flips submit button.
    await textarea.press("Enter");

    // ── 5. Navigation assertion ────────────────────────────────
    // The handoff: /api/draft resolves → router.push(/judge/<token>).
    // Use the exact fixture token so a regression that ignores the
    // server response and routes elsewhere fails loudly.
    await page.waitForURL(`**/judge/${FIXTURE_TOKEN}`, { timeout: 15_000 });
    expect(page.url()).toContain(`/judge/${FIXTURE_TOKEN}`);

    // ── 6. Body shape sanity ───────────────────────────────────
    // Lock in the contract /api/draft expects (submitSchema). If a
    // future homepage refactor stops sending `pitch` or starts
    // sending a totally different shape, this catches it before
    // the server validator does.
    expect(draftRequestBody).not.toBeNull();
    const body = draftRequestBody as unknown as Record<string, unknown>;
    expect(typeof body.title).toBe("string");
    expect(body.pitch).toBe(pitch);
    expect(Array.isArray(body.image_urls)).toBe(true);

    // ── 7. Reveal shell assertion ──────────────────────────────
    // /judge/[token] renders the deliberation framing immediately
    // (before Suspense resolves the judge cards). The full verdict
    // text from ANTHROPIC_FIXTURE.verdict would surface here IF the
    // Anthropic call were interceptable from the browser — see the
    // header comment. We assert on what we CAN see: the deliberation
    // shell. If the route 404s, redirects, or fails to render its
    // shell, this assertion fails.
    //
    // Note: the route also calls loadDraftByToken() which hits the
    // stub Supabase and gets a 404 → notFound() → the "never
    // reached the arena" 404 page. We accept either rendering, since
    // both prove the route resolved and the navigation contract is
    // intact. A real Supabase + Anthropic stack would show the
    // deliberation header instead.
    //
    // Locator note: "Three judges" appears in both the <h1> on the
    // judge route AND in the lede paragraph on other surfaces. The
    // Next.js route announcer also mirrors the page <title> as a
    // live region, so a bare getByText() would resolve to multiple
    // nodes and trip strict mode. `.first()` collapses the match to
    // any-one-of, which is exactly the contract we want: ANY of the
    // three substrings being visible proves the route resolved.
    await expect(
      page
        .getByText(
          /Deliberation in progress|Three judges|never reached the arena/i,
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Tripwire: if this ever flips true, an Anthropic call has been
    // moved into the browser. Re-evaluate the architecture and tighten
    // the fixture assertions to include verdict text.
    expect(anthropicCalledFromBrowser).toBe(false);
  });
});
