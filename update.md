# pitch-pit · Update plan

Generated from project review on 2026-05-04. Track status as items ship.

## Items

- [x] **1. Retire `/submit`** — swept 9 stale link references to `/submissions`, deleted `app/submit/` route + `SubmitScene` component, cleaned the path-suppression list in `components/Header.tsx`
- [x] **2. Per-route fonts** — removed Cinzel + Cormorant Garamond + JetBrains Mono from `app/layout.tsx` root; updated `globals.css` body to use system fonts as the fallback. Each route now loads only the fonts it actually uses
- [x] **3. Domain stays `pitchpit.app`** — `NEXT_PUBLIC_SITE_URL` is correct; DNS pointing is your dashboard work
- [x] **4. Delete `components/scene/FrameSequence.tsx`** — gone; zero imports anywhere
- [x] **5. API integration tests (3)** — `app/api/score/route.test.ts` (5 cases incl. happy path, Anthropic failure, moderation flag, DB insert failure, content-filter short-circuit), `app/api/vote/route.test.ts` (6 cases incl. toggle on/off, self-vote 403, missing idea 404), `app/api/claim-idea/route.test.ts` (7 cases incl. race condition, already-claimed). +18 tests, 56 total passing.
- [x] **6. GitHub Action CI** — `.github/workflows/test.yml` runs `npm test` + `npm run test:e2e` on every PR + push to main, with Playwright report uploaded on failure
- [x] **7. SEO + new features** — five sub-asks:
  - [x] 7a. `/leaderboard` was already SSR'd via server component; idea links land in initial HTML once there's data. No code change needed.
  - [x] 7b. **Search** — `?q=` URL param on `/leaderboard`, debounced input client component, server-side `ilike` filter on `title` OR `pitch` with `%`/`_` escaped. Shareable URLs, server-rendered results.
  - [x] 7c. Idea detail page already shows AI rating, verdict, strengths/concerns, reasoning, final_score, vote count — verified, no change.
  - [x] 7d. Live vote count on the idea page (already wired via the realtime subscription in `VoteButton`); leaderboard now also live via the LiveIndicator + `router.refresh()` pattern shipped earlier.
  - [x] 7e. **Comments (new feature)** — `migrations/009_comments.sql` (table + RLS + realtime), `app/api/comments/route.ts` (POST with content-filter), `components/idea/Comments.tsx` (form + list + realtime subscription with dedupe). Wired into `app/idea/[id]/page.tsx` (server-fetches initial 200 with display_name + avatar_url joined from `public.users`).

## Status notes

- Items 1, 2, 4 are mechanical and safe — bundle in a single commit.
- Item 3 needs only DNS pointing (Vercel project → Domains → add pitchpit.app + apex CNAME). No code change.
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

---

# UI/UX Pro Max review — 2026-05-04

Comprehensive audit applying the priority 1-10 rule categories to every public surface (`/`, `/idea/[id]`, `/leaderboard`, `/feed`, `/submissions`, `/built`, `/login`, `/about`, `/rules`, `/privacy`, `/terms`). Findings tagged by severity. File:line references where useful.

## 🔴 Priority 1 · Accessibility (CRITICAL)

- [x] **A11y-1. Comment edit/delete buttons are hover-only** — `components/idea/Comments.tsx:294-309`. The `opacity-0 group-hover:opacity-100` + `group-focus-within:opacity-100` pattern works on desktop but **on mobile/touch devices there's no hover state** — users with touch can't see the controls until they tab through. Fix: drop the hover-only treatment, render the buttons always (with subtle styling), or use `:has(:hover, :focus-within)` on the parent.
- [ ] **A11y-2. Avatar `<img>` has no descriptive alt** — `components/idea/Comments.tsx:251` + `MinimalistHeader.tsx:185`. Both pass `alt=""` (decorative). For Comments, since the visual is acting as the user identifier, the avatar should have `alt={display_name}` or be marked `aria-hidden` and the name alone identifies. Currently semi-decorative + ESLint `no-img-element` warning still firing.
- [x] **A11y-3. CountdownClock not announced** — `components/scene/CountdownClock.tsx`. The countdown updates every second but has no `aria-live` region. Screen readers don't announce "the pit closes in X" — visually critical, audibly invisible. Wrap a screen-reader-only summary with `aria-live="polite"` that updates every minute (not second — that'd be noisy).
- [ ] **A11y-4. Form errors don't auto-focus the invalid field** — every form (submit textarea, login email, comments). Per WCAG `focus-management`, after submit error the first invalid field should receive focus. Currently the user has to scan visually to find what failed.
- [ ] **A11y-5. Touch targets under 44×44** — Several spots:
  - Avatar trigger in `MinimalistHeader.tsx:181` is now 44×44 ✓
  - But `LeaderboardScene.tsx` ListRow share icon (`h-9 w-9` = 36×36) — under iOS 44pt minimum
  - `IdeaCard` in feed — share icon also 36×36
  - Footer links in `SiteFooter.tsx` are tiny (`text-[0.6rem]`) and on a single line — touch target may be under 44pt vertical
- [x] **A11y-6. Color contrast on muted text** — `text-white/40` (≈40% opacity) over `#0a0a0a` ≈ 3.1:1 contrast. This is below WCAG AA (4.5:1) for normal-size text. Many places use this for timestamps, hints. Tighten to at least `text-white/55` for any text that conveys meaningful info.
- [ ] **A11y-7. `<button>`s missing visible-focus styling on some pages** — `app/admin/AdminClient.tsx` rows may have only the default browser ring depending on tailwind reset. Audit pass needed.
- [ ] **A11y-8. Skip link only jumps to `#main`** — works, but the `<main>` itself isn't always focusable (`tabindex="-1"`). Adding `tabindex="-1"` lets the skip target receive programmatic focus.

## 🔴 Priority 2 · Touch & Interaction (CRITICAL)

- [x] **TI-1. ShareMenu popover doesn't have a mobile-optimized layout** — `components/idea/ShareMenu.tsx`. On phones, a 288px-wide popover anchored to the right edge can clip off-screen. Convert to a bottom sheet on `<sm:` breakpoints (slide up from bottom, full-width).
- [x] **TI-2. Comment delete uses `window.confirm()`** — `components/idea/Comments.tsx`. Native confirm is jarring next to the cinematic aesthetic and unstyled. Replace with an inline confirm step ("Delete? [Confirm] [Cancel]") or a styled modal.
- [ ] **TI-3. Native dialogs/scrim — comment delete + admin actions** lack a backdrop scrim. Once the inline-confirm replaces `window.confirm`, ensure the rest of the page is dimmed for focus.
- [ ] **TI-4. Search input has no loading indicator** — `LeaderboardScene.tsx` SearchBox. After typing + 350ms debounce, the page server-refetches but the user sees no spinner. Add a subtle loading dot on the input border or a "searching…" caption while `useTransition` is pending.
- [ ] **TI-5. Cinematic scroll-pin can fight iOS swipe-back** — `HeroPanel.tsx`. Sticky-pinned 200vh sections can feel sticky to swipe-back gestures at the edge. Add `overscroll-behavior-x: none` only on the main element to prevent.
- [ ] **TI-6. Idea cards on feed don't show pressed state** — clicking a card via the "View judgment" link has no scale-feedback. Per `scale-feedback` rule, subtle 0.97 scale on press would feel native.

## 🟠 Priority 3 · Performance (HIGH)

- [x] **Perf-1. First Load JS still 204 KB** — Sentry browser SDK + Replay integration is the bulk. Sentry Replay only captures sessions where errors occur, but the SDK itself ships on every route. Two options:
  - **(easy)** Drop `replayIntegration` from `instrumentation-client.ts` — lose replay for normal sessions, keep error capture. Saves ~80 KB.
  - **(better)** Lazy-load Sentry init via `Sentry.lazyLoad()` after page interactive. Saves ~80 KB on first paint.
- [ ] **Perf-2. Frame sequences total 6.1 MB** — `public/scene/frames-1` (2 MB) + `frames-2` (4.1 MB). 91 + 90 frames at 1024px. Consider:
  - Drop fps from 18 → 12 (33% fewer frames).
  - Convert JPEGs → AVIF (typically 30-50% smaller at same quality).
  - Generate `srcset` so phones get half-res frames — they don't render the canvas anyway, so this only matters for the static fallback.
- [ ] **Perf-3. Image dimensions not declared on some `<img>` tags** — comment avatars (`Comments.tsx:251`) and Twitter widgets. CLS risk. Use `next/image` with explicit `width`/`height` or `aspect-ratio: 1`.
- [ ] **Perf-4. Realtime subscription on every leaderboard view** — even when nothing's voting. Consider gating subscribe-on-mount on tab visibility (`document.visibilityState === "visible"`) to avoid burning Supabase bandwidth in background tabs.
- [ ] **Perf-5. `sharp` is installed but not configured for `next/image`** — verify Vercel build is using sharp for image optimization (it should pick it up automatically; just confirm).

## 🟠 Priority 4 · Style Selection (HIGH)

- [ ] **Style-1. Font-size sprawl** — 8 different rem values in the 0.5–0.92rem range across the codebase: `text-[0.5rem] text-[0.55rem] text-[0.6rem] text-[0.62rem] text-[0.65rem] text-[0.7rem] text-[0.78rem] text-[0.92rem]`. Per `font-scale` rule, consolidate to a 4–5 step scale (e.g., 12, 14, 16, 18, 24, 32). The 0.5–0.7 range is 4 different sizes for what should be 1–2 typographic roles.
- [ ] **Style-2. Two themes still coexist in code** — Capitol palette tokens (`text-parchment`, `font-display`, `tracking-decree`) still in `tailwind.config.ts` + `globals.css` but no route renders them after the /admin reskin. Either:
  - Keep them (legacy) and note in CLAUDE.md why
  - Or remove them entirely so contributors don't accidentally reach for the wrong tokens
- [x] **Style-3. Capitol Header is dead code** — `components/Header.tsx` returns `null` on every minimalist route, and `/admin` and `/feed` are the only Capitol-themed routes that don't actually use it (they import `MinimalistHeader`). The Capitol header is shipped to the bundle but never rendered. Delete it.
- [ ] **Style-4. Icon styles are mixed** — `ShareMenu.tsx` has filled brand glyphs (X/LinkedIn/Facebook are filled) next to outlined utility icons (Native, Email, Link). Per `filled-vs-outline-discipline`, pick one for the menu and apply consistently. Brand glyphs typically must stay filled for trademark reasons — so use filled for *all* menu item icons OR put the brand glyphs in a separate visual treatment.

## 🟠 Priority 5 · Layout & Responsive (HIGH)

- [ ] **Layout-1. Absolute % positioning on Hero panels can break on short viewports** — `HomeScene.tsx` Panel1 places kicker at `top-[7%]`, countdown at `top-[42%]`, input at `top-[58%]`. On a 568px-tall iPhone SE screen, these compress and can overlap. Test on small viewports and add `min-h-[640px]` or break into a stacked layout below 600px height.
- [ ] **Layout-2. Containers use mixed max-widths** — `max-w-3xl` on /privacy + /terms, `max-w-5xl` on /leaderboard, `max-w-4xl` on /idea/[id], `max-w-7xl` in headers. Per `container-width`, pick a primary content max-width (e.g., 1024px / max-w-5xl) and use it consistently.
- [ ] **Layout-3. Footer links wrap awkwardly on 320px viewports** — `SiteFooter.tsx` has 4 links + © year on one row that flexes. Below ~360px it line-breaks oddly. Stack on `<sm:` cleanly.
- [ ] **Layout-4. Comment list has no max-width discipline** — `Comments.tsx` is `max-w-3xl mt-12`. On wide screens this is fine, but the body text inside cards spans the full card width without internal max-width, violating `line-length-control` (mobile 35-60 chars, desktop 60-75). On 1280px viewport, body text can hit 90+ chars per line.

## 🟡 Priority 6 · Typography & Color (MEDIUM)

- [ ] **Type-1. Tabular numerals not applied consistently** — vote counts, scores, timestamps. Some use `tabular-nums`, some don't. Layout shifts when numbers change widths.
- [ ] **Type-2. Body text on idea reveal is 17px** — `text-base` then `sm:text-lg` (16/18). Per `readable-font-size`, mobile body should be ≥16px to avoid iOS auto-zoom on focus. Currently OK, but verify the input element sizes too (focus-on-tiny-input zooms iOS).
- [ ] **Type-3. Verdict italic is not always italic** — minimalist fonts (Inter) vary by weight; with `font-medium italic` we get a fake italic on weights without true italic. Audit: ensure Inter's italic family is loaded.

## 🟡 Priority 7 · Animation (MEDIUM)

- [x] **Anim-1. MotionConfig not applied uniformly** — only `Reveal.tsx` wraps in `<MotionConfig reducedMotion="user">`. The home scene, leaderboard, feed, etc. don't, meaning users with `prefers-reduced-motion: reduce` still see full animations on those pages.
- [ ] **Anim-2. Some animations use `width`/`height`** — should be `transform` only. Spot-check needed in `Hourglass.tsx`, frame-sequence canvas resizes (acceptable, that's a one-off resize).
- [ ] **Anim-3. Scroll-pinned hero on mobile still has the canvas DOM** — even though canvas is disabled (`canvasActive=false` on mobile), the canvas element renders briefly before the matchMedia useEffect fires. Could cause a subtle flash. Initial state should be `largeEnough = false` then upgrade after media query confirms.

## 🟡 Priority 8 · Forms & Feedback (MEDIUM)

- [ ] **Form-1. Missing `autoComplete` attributes** — only `app/login/LoginScene.tsx:174` has it. The pitch textarea, comment textarea, and admin URL fields all lack autocomplete hints. Even setting `autoComplete="off"` is better than nothing for explicitly non-autofill inputs (prevents the browser from suggesting irrelevant data).
- [ ] **Form-2. No skeleton states for comments while loading** — `Comments.tsx` shows nothing while initial render is happening (server-rendered), but the realtime subscription has a brief lag if the user posts while offline-then-online. Show a "posting…" placeholder row.
- [ ] **Form-3. Magic-link form has no helper text about expected delivery time** — `LoginScene.tsx`. Users wonder whether to wait or refresh. Add "usually arrives in under 30 seconds — check spam if not".
- [x] **Form-4. Submit form doesn't preserve text on auth-redirect** — if a user types a pitch, gets booted to /login (when the IP rate limit triggers somehow), and comes back, their typed text is gone. Persist to localStorage on each keystroke, restore on mount.
- [ ] **Form-5. No "edited" state for comment edits in flight** — when user clicks Save, there's a `pending` state on the button but no visible feedback elsewhere. Add an opacity dip on the comment row while the PATCH is in flight.

## 🟠 Priority 9 · Navigation Patterns (HIGH)

- [x] **Nav-1. No active-state highlight on header nav** — `MinimalistHeader.tsx` nav items don't visually indicate "you are here". Per `nav-state-active`, the current page should have a different color/weight/underline.
- [x] **Nav-2. No mobile menu on MinimalistHeader** — center nav (My pitches, Leaderboard, Gallery, Rules) is `hidden lg:flex`. On phones, those are completely hidden. Either add a hamburger on `<lg:` or surface them in the right-cluster overflow.
- [ ] **Nav-3. Search isn't reachable from anywhere except `/leaderboard`** — per `search-accessible`, search should be globally reachable (header search icon). Even "Cmd+K" style would be a nice progressive enhancement.
- [ ] **Nav-4. Back button doesn't preserve scroll on /leaderboard** — clicking into an idea, then back, should restore scroll + tab + search query. Currently scroll is preserved but tab state resets.
- [ ] **Nav-5. No breadcrumb on `/idea/[id]`** — user lands deep with no indication of where they came from. Show "← Back to leaderboard" or "← Back to feed" based on `document.referrer` (or always link to `/leaderboard`).

## ⚪ Polish / smaller items

- [ ] **P-1. No favicon variants** — only `/favicon.ico`. Add `apple-touch-icon-180x180.png` and `icon-192/512.png` for PWA install prompts.
- [ ] **P-2. The "edited" indicator threshold (>1s diff)** — `Comments.tsx:208`. Hacky. Better: store an `is_edited` boolean column on the comment, or compare `created_at !== updated_at` (PostgreSQL trigger sets them equal at insert).
- [ ] **P-3. Email mailto links assume desktop email client** — fine, but on mobile they pop the system mail composer unexpectedly. Consider a "Copy email content" alternative.
- [ ] **P-4. `/idea/[id]` has scroll-mt-24 on sections** but there's no anchor links from anywhere. Either remove the offset or add jump-to-section anchors (verdict, strengths, comments).
- [ ] **P-5. No empty state for `/feed` when there are zero submissions** — likely renders an empty list. Check + add "Be the first" CTA.
- [ ] **P-6. Vote counts not formatted** — `1234` should render as `1,234` past 4 digits. Use `Intl.NumberFormat` once vote counts can plausibly hit hundreds.

---

## Recommended fix order (top 12)

1. **Anim-1** — wrap top-level layouts in `MotionConfig reducedMotion="user"` so reduced-motion users actually get reduced motion across the site (1 LOC change × 5 routes).
2. **A11y-1** — drop hover-only on comment edit/delete; render always with subtle styling.
3. **A11y-6** — bump muted text from `text-white/40` → `text-white/55` so color contrast hits AA.
4. **TI-1** — bottom sheet for ShareMenu on phones.
5. **TI-2** — replace `window.confirm()` for delete with inline confirm.
6. **Nav-1** — active-state in header nav.
7. **Nav-2** — mobile menu (hamburger) for MinimalistHeader.
8. **Style-1** — consolidate the 8 micro font sizes into a 5-step scale; codify in `scene.css` as `--type-mono-*`.
9. **Style-3** — delete the dead Capitol Header component.
10. **Perf-1** — drop Sentry Replay integration to recover ~80 KB.
11. **Form-4** — localStorage draft for the homepage pitch input.
12. **A11y-3** — `aria-live` summary for the countdown.

Smaller batches after the top-12: form autocomplete sweep, footer mobile stack, loading spinner on search, nav active states, breadcrumb on idea pages.
