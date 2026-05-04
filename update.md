# pitch-pit · Update plan

Generated from project review on 2026-05-04. Track status as items ship.

## Items

- [x] **1. Retire `/submit`** — swept 9 stale link references to `/submissions`, deleted `app/submit/` route + `SubmitScene` component, cleaned the path-suppression list in `components/Header.tsx`
- [x] **2. Per-route fonts** — removed Cinzel + Cormorant Garamond + JetBrains Mono from `app/layout.tsx` root; updated `globals.css` body to use system fonts as the fallback. Each route now loads only the fonts it actually uses
- [x] **3. Domain stays `pitch-pit.app`** — `NEXT_PUBLIC_SITE_URL` is correct; DNS pointing is your dashboard work
- [x] **4. Delete `components/scene/FrameSequence.tsx`** — gone; zero imports anywhere
- [x] **5. API integration tests (3)** — `app/api/score/route.test.ts` (5 cases incl. happy path, Anthropic failure, moderation flag, DB insert failure, content-filter short-circuit), `app/api/vote/route.test.ts` (6 cases incl. toggle on/off, self-vote 403, missing idea 404), `app/api/claim-idea/route.test.ts` (7 cases incl. race condition, already-claimed). +18 tests, 56 total passing.
- [x] **6. GitHub Action CI** — `.github/workflows/test.yml` runs `npm test` + `npm run test:e2e` on every PR + push to main, with Playwright report uploaded on failure
- [ ] **7. SEO + new features** — covers three sub-asks:
  - 7a. Verify `/leaderboard` SSRs idea links (server component already fetches; confirm output)
  - 7b. **Search** — let users search ideas by title/pitch
  - 7c. **Idea detail page** — already shows AI rating + verdict + strengths/concerns + reasoning + final_score + vote count
  - 7d. **Voting status** — show live vote distribution on idea pages (who's voting, current standing)
  - 7e. **Comments (new feature)** — schema migration + API + UI + realtime; comments under each idea

## Status notes

- Items 1, 2, 4 are mechanical and safe — bundle in a single commit.
- Item 3 needs only DNS pointing (Vercel project → Domains → add pitch-pit.app + apex CNAME). No code change.
- Item 6 is one new file `.github/workflows/test.yml`.
- Item 5 needs decisions on how to mock Anthropic — likely vitest with `vi.mock("@anthropic-ai/sdk")`.
- Item 7e is the largest piece — comments require a new table, RLS policies, API route, UI component, realtime subscription. Roughly 2-3 hours of careful work.

## Order of work

1. Items 1 + 2 + 4 → one commit (mechanical sweeps + deletes).
2. Item 6 → GitHub Action workflow file.
3. Item 5 → 3 integration tests.
4. Item 7a + 7b → leaderboard SSR audit + search input.
5. Item 7e → comments feature, end to end.
6. Final pass to mark items complete in this file.
