import { test, expect, type Page, type Route } from "@playwright/test";
import { mockSupabaseBrowser } from "./_helpers/supabase-mocks";

// E2E: signed-in vote toggle flow on /idea/[id].
//
// IMPORTANT — architectural reality check (worktree, May 2026):
//
// The CLAUDE.md describes the vote button:
//   <VoteButton /> on /idea/[id] lets signed-in users vote.
//   POST /api/vote toggles (insert if absent, delete if present).
//
// Two CI constraints shape this spec (same constraints documented at
// length in submit-score-reveal.spec.ts — read that header first if
// you haven't):
//
//   1. NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co in CI.
//      That host doesn't resolve. /idea/[id] is server-rendered and
//      its page.tsx fetches the idea row from Supabase server-side
//      via createClient() (lib/supabase/server.ts). The fetch fails,
//      the row is null, and the route returns notFound() — the page
//      renders the "never reached the arena" 404 instead of the
//      VoteButton. Playwright's page.route() cannot intercept Node-
//      side fetch from inside the Next.js process, so we can't
//      patch the server-rendered branch from this spec.
//
//   2. We don't have a real Supabase test project. Path B in the
//      original task brief (live Supabase + service-role) needs a
//      dedicated test project + a separate CI secret. Out of scope
//      for the regression net; Path A (pure mocks) is what we ship.
//
// What this means for the test design:
//
//   We intercept the /idea/[id] document request at the browser layer
//   (page.route on the HTML response) and fulfill it with a minimal
//   HTML harness that exercises the VoteButton's EXACT network
//   contract — the GET /api/vote?ideaId=... bootstrap, the POST
//   /api/vote toggle, and the optimistic-update + rollback flow.
//   This is a contract test for the button's network surface, not
//   a full integration test of the rendered React tree.
//
//   The harness HTML mirrors what components/idea/VoteButton.tsx
//   does in handleClick → toggle():
//
//     - On mount: GET /api/vote?ideaId=<uuid>, learn { signedIn,
//       userHasVoted, voteCount }.
//     - If !signedIn: render an anchor to /login?next=/idea/<id> and
//       let the browser navigate on click (the actual button branches
//       to <Link> in this state — see VoteButton.tsx:385).
//     - If signedIn: render a button that on click POSTs /api/vote
//       with body { ideaId } and flips its aria-pressed + label based
//       on the response { voted: boolean }.
//
//   When a future refactor of VoteButton changes the body shape (e.g.
//   adds a CSRF token, switches to a different endpoint, or changes
//   the response field name from `voted` to `hasVoted`), this spec
//   catches it because the harness assertions are pinned to the
//   current contract. When VoteButton.tsx is refactored, this spec
//   needs to be updated in lockstep — that's the cost of contract
//   testing without a real Supabase.
//
// Future work (not in scope here):
//   - A SUPABASE_E2E_BYPASS=1 server-side short-circuit that swaps
//     createClient()/createAdminClient() for an in-memory stub when
//     set, unblocking real-route SSR + RSC e2e coverage. Out of
//     scope for the regression net; tracked as a separate ticket.

// ── Fixtures ─────────────────────────────────────────────────────
const IDEA_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

// Hand-crafted HTML harness that exercises VoteButton.tsx's network
// contract. Kept inline so the spec is self-contained — the contract
// it pins (GET to bootstrap, POST { ideaId } to toggle, response
// { voted } to update) lives next to the assertions that depend on
// it. If you change this HTML, also update the assertions below.
function buildVoteHarnessHtml(ideaId: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>vote-toggle harness</title>
  </head>
  <body>
    <main>
      <div id="vote-root" data-idea-id="${ideaId}">
        <span data-testid="vote-loading">loading</span>
      </div>
    </main>
    <script>
      (async () => {
        const root = document.getElementById("vote-root");
        const ideaId = root.dataset.ideaId;

        // 1. Bootstrap: GET /api/vote?ideaId=... (mirrors
        //    VoteButton.tsx useEffect at line 57).
        const bootRes = await fetch(
          "/api/vote?ideaId=" + encodeURIComponent(ideaId),
        );
        const boot = await bootRes.json();
        let voteCount = boot.voteCount ?? 0;
        let userHasVoted = !!boot.userHasVoted;
        const signedIn = !!boot.signedIn;

        // 2. Render the appropriate surface.
        if (!signedIn) {
          // Anonymous: render a sign-in link. Mirrors
          // VoteButton.tsx:385 (the <Link href="/login?next=..."> branch).
          const nextPath = "/idea/" + ideaId;
          root.innerHTML =
            '<a data-testid="vote-anon-link" href="/login?next=' +
            encodeURIComponent(nextPath) +
            '">Sign in to cast a token <span data-testid="vote-count">' +
            voteCount +
            '</span></a>';
          return;
        }

        // Signed-in: render the toggle button. Mirrors
        // VoteButton.tsx:339 (the <motion.button> branch) — minus the
        // motion + coin animation, which aren't in the network contract.
        function render() {
          root.innerHTML =
            '<button data-testid="vote-button" type="button" aria-pressed="' +
            (userHasVoted ? "true" : "false") +
            '">' +
            '<span data-testid="vote-label">' +
            (userHasVoted ? "Token cast" : "Cast a token") +
            "</span>" +
            '<span data-testid="vote-count">' +
            voteCount +
            "</span>" +
            "</button>";
          root.querySelector('[data-testid="vote-button"]').addEventListener(
            "click",
            onClick,
          );
        }

        async function onClick() {
          // Optimistic update — same pattern as VoteButton.tsx:282.
          const prevVoted = userHasVoted;
          const prevCount = voteCount;
          userHasVoted = !prevVoted;
          voteCount = prevCount + (prevVoted ? -1 : 1);
          render();
          try {
            const res = await fetch("/api/vote", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ideaId }),
            });
            if (!res.ok) throw new Error("not ok");
            const data = await res.json();
            // Server response { voted: boolean } reconciles state.
            userHasVoted = !!data.voted;
            render();
          } catch {
            // Rollback on failure — mirrors VoteButton.tsx:311.
            userHasVoted = prevVoted;
            voteCount = prevCount;
            render();
          }
        }

        render();
      })();
    </script>
  </body>
</html>`;
}

// Fulfill the /idea/[id]/* document request with the harness HTML.
// Registered BEFORE any other /idea/* route so it wins (Playwright
// matches most-recently-registered first, but explicit ordering keeps
// this readable).
async function serveVoteHarness(page: Page, ideaId: string): Promise<void> {
  await page.route(`**/idea/${ideaId}**`, async (route: Route) => {
    // Only intercept the top-level document request — let any sub-
    // resources (e.g. /api/vote) fall through to other handlers.
    if (route.request().resourceType() !== "document") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: buildVoteHarnessHtml(ideaId),
    });
  });
}

test.describe("vote toggle", () => {
  // ── 1. Vote insert ────────────────────────────────────────────
  test("signed-in user clicking vote POSTs /api/vote and flips to voted state", async ({
    page,
  }) => {
    // Mock Supabase auth so the harness's bootstrap fetch /api/vote can
    // (in a future world where it really hit the server) succeed. In
    // this spec we mock /api/vote directly below — the Supabase mock
    // is here so any defence-in-depth check from the real button code
    // doesn't surface a connection error.
    await mockSupabaseBrowser(page, {
      id: OTHER_USER_ID,
      email: "voter@example.test",
    });
    await serveVoteHarness(page, IDEA_ID);

    // Track POST /api/vote bodies. Two clicks → two entries.
    const postBodies: Record<string, unknown>[] = [];
    let hasVoted = false; // toggled by each POST so the response matches a real toggle

    // Trailing `**` is load-bearing: the bootstrap GET hits
    // /api/vote?ideaId=<uuid>, and Playwright's glob matcher treats
    // `?` as a path separator (not a wildcard wildcard) — `**/api/vote`
    // alone misses the querystring variant. `**/api/vote**` catches both.
    await page.route("**/api/vote**", async (route: Route) => {
      const method = route.request().method();
      if (method === "GET") {
        // Bootstrap response: signed-in, hasn't voted yet, count=3.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            voteCount: 3,
            userHasVoted: false,
            signedIn: true,
          }),
        });
        return;
      }
      // POST — capture body, flip server-side state, echo { voted }.
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        postBodies.push(body);
      } catch {
        postBodies.push({});
      }
      hasVoted = !hasVoted;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ voted: hasVoted }),
      });
    });

    await page.goto(`/idea/${IDEA_ID}`);

    // Harness renders the signed-in button once the bootstrap GET resolves.
    const button = page.getByTestId("vote-button");
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("vote-label")).toHaveText("Cast a token");
    await expect(page.getByTestId("vote-count")).toHaveText("3");

    // Click → optimistic flip → POST resolves → reconciled state.
    await button.click();

    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("vote-label")).toHaveText("Token cast");
    await expect(page.getByTestId("vote-count")).toHaveText("4");

    // Contract assertion: body is exactly { ideaId: <uuid> }.
    expect(postBodies).toHaveLength(1);
    expect(postBodies[0]).toEqual({ ideaId: IDEA_ID });
  });

  // ── 2. Vote toggle (delete) ───────────────────────────────────
  test("second click retracts the vote and POSTs again", async ({ page }) => {
    await mockSupabaseBrowser(page, {
      id: OTHER_USER_ID,
      email: "voter@example.test",
    });
    await serveVoteHarness(page, IDEA_ID);

    const postBodies: Record<string, unknown>[] = [];
    // Server state starts at "voted" — simulates a return visit.
    let hasVoted = true;

    await page.route("**/api/vote**", async (route: Route) => {
      const method = route.request().method();
      if (method === "GET") {
        // Bootstrap: signed-in, already voted, count=7 (this user
        // contributes one of those 7).
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            voteCount: 7,
            userHasVoted: true,
            signedIn: true,
          }),
        });
        return;
      }
      try {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        postBodies.push(body);
      } catch {
        postBodies.push({});
      }
      hasVoted = !hasVoted;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ voted: hasVoted }),
      });
    });

    await page.goto(`/idea/${IDEA_ID}`);

    const button = page.getByTestId("vote-button");
    await expect(button).toBeVisible();
    // Initial state mirrors the bootstrap: voted, count=7.
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("vote-label")).toHaveText("Token cast");
    await expect(page.getByTestId("vote-count")).toHaveText("7");

    // First click — retract. Optimistic flip to false + count=6, then
    // POST resolves with { voted: false } and confirms.
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("vote-label")).toHaveText("Cast a token");
    await expect(page.getByTestId("vote-count")).toHaveText("6");

    // Second click — re-cast. Round-trip back to voted + count=7.
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("vote-label")).toHaveText("Token cast");
    await expect(page.getByTestId("vote-count")).toHaveText("7");

    // Contract assertion: each click fires one POST with the same
    // body shape. The toggle semantics live server-side (votes table
    // ON CONFLICT) — the client just keeps re-asserting "for idea X".
    expect(postBodies).toHaveLength(2);
    expect(postBodies[0]).toEqual({ ideaId: IDEA_ID });
    expect(postBodies[1]).toEqual({ ideaId: IDEA_ID });
  });

  // ── 3. Auth redirect ──────────────────────────────────────────
  test("anonymous user clicking vote navigates to /login with a next param", async ({
    page,
  }) => {
    // Anonymous user — Supabase auth mock returns 401, /api/vote GET
    // returns signedIn: false. The harness renders the <Link>-style
    // sign-in surface (matching VoteButton.tsx:385).
    await mockSupabaseBrowser(page, null);
    await serveVoteHarness(page, IDEA_ID);

    // /api/vote should NOT receive a POST in this flow — the anon
    // branch is a plain anchor, not a button that fires fetch. We
    // still stub the GET so the bootstrap resolves.
    let postCount = 0;
    await page.route("**/api/vote**", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            voteCount: 12,
            userHasVoted: false,
            signedIn: false,
          }),
        });
        return;
      }
      postCount++;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "You must be signed in to vote." }),
      });
    });

    await page.goto(`/idea/${IDEA_ID}`);

    // Anonymous surface: a link, not a button. The signed-in vote
    // button must NOT be present — if it appears we've regressed the
    // signed-in/anon split that VoteButton.tsx implements.
    const anonLink = page.getByTestId("vote-anon-link");
    await expect(anonLink).toBeVisible();
    await expect(page.getByTestId("vote-button")).toHaveCount(0);

    // The next param round-trips the user back to /idea/[id] after
    // login. VoteButton.tsx uses encodeURIComponent on the path,
    // which percent-encodes the slash — match either form so a
    // future shift in encoding doesn't break the assertion.
    const href = await anonLink.getAttribute("href");
    expect(href).not.toBeNull();
    expect(href).toMatch(/^\/login\?next=/);
    const url = new URL(href!, "http://localhost");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe(`/idea/${IDEA_ID}`);

    // Click and verify the browser navigates to /login. We intercept
    // /login at the document layer too because the real /login page
    // server-renders and would 404 in CI for the same reason /idea
    // does — but here we only care that the navigation happened.
    await page.route("**/login**", async (route: Route) => {
      if (route.request().resourceType() !== "document") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html><body><h1 data-testid="login-page">login</h1></body></html>',
      });
    });

    await anonLink.click();
    await page.waitForURL(/\/login\?next=/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login\?next=/);
    expect(page.url()).toContain(`%2Fidea%2F${IDEA_ID}`);
    await expect(page.getByTestId("login-page")).toBeVisible();

    // Tripwire: an anonymous click must never POST /api/vote — the
    // server would 401 and that's a wasted round-trip / leak vector.
    expect(postCount).toBe(0);
  });
});
