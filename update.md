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
- [x] **A11y-2. Avatar `<img>` has no descriptive alt** — Comments avatar now passes `alt={display_name}` (the avatar identifies the commenter). MinimalistHeader's user avatar stays `alt=""` because the surrounding `<button>` already has `aria-label={\`Account menu — ${fullName}\`}` so the image is decorative. Both surfaces use `next/image` already, so the `no-img-element` lint warning was a stale audit note.
- [x] **A11y-3. CountdownClock not announced** — `components/scene/CountdownClock.tsx`. The countdown updates every second but has no `aria-live` region. Screen readers don't announce "the pit closes in X" — visually critical, audibly invisible. Wrap a screen-reader-only summary with `aria-live="polite"` that updates every minute (not second — that'd be noisy).
- [ ] **A11y-4. Form errors don't auto-focus the invalid field** — every form (submit textarea, login email, comments). Per WCAG `focus-management`, after submit error the first invalid field should receive focus. Currently the user has to scan visually to find what failed.
- [x] **A11y-5. Touch targets under 44×44** — Bumped ShareMenu trigger class h-9 w-9 → h-11 w-11 (covers LeaderboardScene + IdeaCard). Footer links got `inline-flex items-center py-2` for ≥44pt vertical touch height.
- [x] **A11y-6. Color contrast on muted text** — `text-white/40` (≈40% opacity) over `#0a0a0a` ≈ 3.1:1 contrast. This is below WCAG AA (4.5:1) for normal-size text. Many places use this for timestamps, hints. Tighten to at least `text-white/55` for any text that conveys meaningful info.
- [x] **A11y-7. `<button>`s missing visible-focus styling on some pages** — Audited `components/admin/AdminClient.tsx` (the only AdminClient — there's no `app/admin/AdminClient.tsx`). Most buttons already had `focus-visible:ring-2 ring-[var(--scene-gold)]`; added the same treatment to the "Mark as building" QueuedRow button which had only hover.
- [x] **A11y-8. Skip link only jumps to `#main`** — Verified every `<main id="main">` across the app already carries `tabIndex={-1}` (HomeScene, GalleryScene, terms, privacy, about, admin, leaderboard, submissions, rules, login, FeedScene, Reveal). Skip target receives programmatic focus correctly.

## 🔴 Priority 2 · Touch & Interaction (CRITICAL)

- [x] **TI-1. ShareMenu popover doesn't have a mobile-optimized layout** — `components/idea/ShareMenu.tsx`. On phones, a 288px-wide popover anchored to the right edge can clip off-screen. Convert to a bottom sheet on `<sm:` breakpoints (slide up from bottom, full-width).
- [x] **TI-2. Comment delete uses `window.confirm()`** — `components/idea/Comments.tsx`. Native confirm is jarring next to the cinematic aesthetic and unstyled. Replace with an inline confirm step ("Delete? [Confirm] [Cancel]") or a styled modal.
- [x] **TI-3. Native dialogs/scrim — comment delete + admin actions** — Comments inline delete-confirm now renders a `fixed inset-0 z-40 bg-black/40` scrim while the row is in the confirming state (see `Comments.tsx`). AdminClient has no inline confirm dialogs, so no scrim needed there.
- [x] **TI-4. Search input has no loading indicator** — `LeaderboardScene.tsx` SearchBox already had a gold spinner that fires the moment a keystroke lands and persists through `pendingDebounce + isPending` until the server-rendered nav settles. Verified, no change needed.
- [x] **TI-5. Cinematic scroll-pin can fight iOS swipe-back** — Added `overscrollBehaviorX: "none"` to the outermost `<section>` in `HeroPanel.tsx`. Horizontal swipe-back gestures no longer compete with the sticky pin.
- [x] **TI-6. Idea cards on feed don't show pressed state** — `IdeaCard.tsx` already had `transition-transform active:scale-[0.99]` on the card root. Added the same treatment to the leaderboard `ListRow` so list rows feel native on tap.

## 🟠 Priority 3 · Performance (HIGH)

- [x] **Perf-1. First Load JS still 204 KB** — Sentry browser SDK + Replay integration is the bulk. Sentry Replay only captures sessions where errors occur, but the SDK itself ships on every route. Two options:
  - **(easy)** Drop `replayIntegration` from `instrumentation-client.ts` — lose replay for normal sessions, keep error capture. Saves ~80 KB.
  - **(better)** Lazy-load Sentry init via `Sentry.lazyLoad()` after page interactive. Saves ~80 KB on first paint.
- [ ] **Perf-2. Frame sequences total 6.1 MB** — `public/scene/frames-1` (2 MB) + `frames-2` (4.1 MB). 91 + 90 frames at 1024px. Consider:
  - Drop fps from 18 → 12 (33% fewer frames).
  - Convert JPEGs → AVIF (typically 30-50% smaller at same quality).
  - Generate `srcset` so phones get half-res frames — they don't render the canvas anyway, so this only matters for the static fallback.
- [x] **Perf-3. Image dimensions not declared on some `<img>` tags** — All avatar renderings now go through `next/image` with explicit `width={36} height={36}` (Comments avatar already had this; verified). No raw `<img>` tags exist in `app/` or `components/`.
- [x] **Perf-4. Realtime subscription on every leaderboard view** — Both `app/leaderboard/LeaderboardScene.tsx` (live indicator) and `components/idea/Comments.tsx` (comment realtime) now gate subscription on `document.visibilityState === "visible"` and tear down on `visibilitychange → hidden`, re-subscribing on return. No background-tab quota burn.
- [x] **Perf-5. `sharp` is installed but not configured for `next/image`** — Confirmed `sharp ^0.34.5` in `package.json`. Added `images.formats: ["image/avif", "image/webp"]` to `next.config.mjs` so Next emits AVIF first, falls back to WebP, then JPEG.

## 🟠 Priority 4 · Style Selection (HIGH)

- [x] **Style-1. Font-size sprawl** — Consolidated 8 → 5 distinct sizes via codebase-wide sed: 0.5→0.55, 0.6→0.65, 0.62→0.65. Final scale: 0.55, 0.65, 0.7, 0.78, 0.92rem. ~80 occurrences across 24 files updated.
- [x] **Style-2. Two themes still coexist in code** — Decided KEEP. `/admin` and `/feed` still render Capitol-themed UI, so the tokens stay until those routes are reskinned. Added a multi-line comment block above `theme.extend` in `tailwind.config.ts` explaining the legacy status and pointing contributors to the `.scene` tokens for new code. Added a matching note to CLAUDE.md's "Two visual themes coexist" section.
- [x] **Style-3. Capitol Header is dead code** — `components/Header.tsx` returns `null` on every minimalist route, and `/admin` and `/feed` are the only Capitol-themed routes that don't actually use it (they import `MinimalistHeader`). The Capitol header is shipped to the bundle but never rendered. Delete it.
- [x] **Style-4. Icon styles are mixed** — Brand glyphs (X / LinkedIn / Facebook / Reddit) keep their filled form (trademark requirement) but now render in a solid `bg-white/[0.04]` badge so the visual mix between filled marks and outlined utility icons reads as deliberate. Utility icons (Native share, Email, Link, Copy email content) keep the outlined-bordered transparent badge. New `brand` prop on `MenuItem` switches the treatment.

## 🟠 Priority 5 · Layout & Responsive (HIGH)

- [x] **Layout-1. Absolute % positioning on Hero panels can break on short viewports** — Added `min-h-[640px]` to the Panel1 root container in `app/HomeScene.tsx`. The absolute % offsets (top-[7%] / top-[42%] / top-[58%]) now have a 640px floor, so kicker / countdown / input don't compress into each other on iPhone SE-class viewports.
- [x] **Layout-2. Containers use mixed max-widths** — Audited the routes. `/privacy`, `/terms`, `/about`: kept `max-w-3xl` because they're legibility text-blocks (60-75 char lines is correct for prose). `/idea/[id]`: kept `max-w-4xl` because it's mixed prose + cards, and 4xl renders well at desktop. `/leaderboard`: already `max-w-5xl`. **Changed**: `/feed` from `max-w-4xl` → `max-w-5xl` (it's a card list, not a prose block, so it benefits from the wider container).
- [x] **Layout-3. Footer links wrap awkwardly on 320px viewports** — Stack vertically on <sm: (`flex-col sm:flex-row`), revert to wrap on sm:+. No more weird breaks at 320px.
- [x] **Layout-4. Comment list has no max-width discipline** — Comment body in `CommentRow` already wraps in `max-w-prose` (Tailwind's 65ch). Verified, no change.

## 🟡 Priority 6 · Typography & Color (MEDIUM)

- [x] **Type-1. Tabular numerals not applied consistently** — Sweep complete. Vote counts (VoteButton, leaderboard ListRow, podium AI/votes line, Reveal), AI/final scores, comment count badge, countdown clock — all changing-in-place numerals now carry `tabular-nums`.
- [x] **Type-2. Body text on idea reveal is 17px** — Verified all text inputs render at ≥16px on mobile. Comments textareas and edit field: `text-base` (16px). Login email input: `text-base`. Homepage textarea: `.scene-input { font-size: 1rem }`. No iOS auto-zoom on focus.
- [x] **Type-3. Verdict italic is not always italic** — Added `style: ["normal", "italic"]` to the per-route `Inter()` config in every page that loads it (`/`, `/built`, `/leaderboard`, `/feed`, `/submissions`, `/rules`, `/judge/[token]`, `/login`). True italic glyphs now load alongside the upright weights.

## 🟡 Priority 7 · Animation (MEDIUM)

- [x] **Anim-1. MotionConfig not applied uniformly** — only `Reveal.tsx` wraps in `<MotionConfig reducedMotion="user">`. The home scene, leaderboard, feed, etc. don't, meaning users with `prefers-reduced-motion: reduce` still see full animations on those pages.
- [x] **Anim-2. Some animations use `width`/`height`** — Spot-checked `Hourglass.tsx`. Sand-fall keyframes use `transform: translateY()` + `opacity`; halo-breathe uses `opacity` only. No width/height animations. Frame-sequence canvas resize is a one-off (already noted as acceptable). No change needed.
- [x] **Anim-3. Scroll-pinned hero on mobile still has the canvas DOM** — Verified `largeEnough` already defaults to `false` in `HeroPanel.tsx`. Canvas only mounts when `canvasActive = hasFrames && largeEnough` becomes true after the matchMedia check. No flash on mobile.

## 🟡 Priority 8 · Forms & Feedback (MEDIUM)

- [x] **Form-1. Missing `autoComplete` attributes** — `autoComplete="off"` (plus `autoCorrect="off"` + `spellCheck="true"` on the homepage pitch) on the homepage textarea, both comment textareas (new + edit). Admin URL inputs already had `autoComplete="url"`.
- [x] **Form-2. No skeleton states for comments while loading** — `Comments.tsx` now renders an optimistic "posting…" placeholder row at the top of the list (with the user's draft, dimmed to 60% opacity, gold "Posting…" hint) the moment a POST starts, replacing it with the real row when the server responds. Initial-empty skeletons (3 dimmed cards) were already there.
- [x] **Form-3. Magic-link form has no helper text about expected delivery time** — `LoginScene.tsx` already has helper text inside the magic-link form ("Usually arrives within 30 seconds. Check spam if not.") AND in the post-submit success card ("Didn't arrive? Check spam, or resend below."). Both copies satisfy the audit ask. No change needed.
- [x] **Form-4. Submit form doesn't preserve text on auth-redirect** — if a user types a pitch, gets booted to /login (when the IP rate limit triggers somehow), and comes back, their typed text is gone. Persist to localStorage on each keystroke, restore on mount.
- [x] **Form-5. No "edited" state for comment edits in flight** — `CommentRow` root now drops to `opacity-60` (with a transition) while an edit is pending, in addition to the body-only dim that was already there. Once the PATCH resolves, the row springs back.

## 🟠 Priority 9 · Navigation Patterns (HIGH)

- [x] **Nav-1. No active-state highlight on header nav** — `MinimalistHeader.tsx` nav items don't visually indicate "you are here". Per `nav-state-active`, the current page should have a different color/weight/underline.
- [x] **Nav-2. No mobile menu on MinimalistHeader** — center nav (My pitches, Leaderboard, Gallery, Rules) is `hidden lg:flex`. On phones, those are completely hidden. Either add a hamburger on `<lg:` or surface them in the right-cluster overflow.
- [x] **Nav-3. Search isn't reachable from anywhere except `/leaderboard`** — Added a search icon link in `MinimalistHeader`'s right cluster (next to the user avatar / Get started CTA, hidden on mobile to save space — the mobile overflow already lists Leaderboard which has the search). Links to `/leaderboard?focus=search`; the leaderboard SearchBox now reads that param and autofocuses its input on mount, then strips the marker so a refresh doesn't keep stealing focus.
- [x] **Nav-4. Back button doesn't preserve scroll on /leaderboard** — Tab state already lives in the URL (`?tab=week`) and the SearchBox preserves all non-q params on every push. Native back button restores both. Verified, no change.
- [x] **Nav-5. No breadcrumb on `/idea/[id]`** — `Reveal.tsx` already renders a `← Back to {leaderboard|feed|built|submissions}` breadcrumb at the top, computed from `document.referrer` (defaulting to leaderboard when there's no referrer or it's cross-origin). Verified, no change.

## ⚪ Polish / smaller items

- [x] **P-1. No favicon variants** — Added `app/icon.tsx` (192×192, generated via `next/og` ImageResponse — gold "p" mark on the void background) and `app/apple-icon.tsx` (180×180, same treatment). Next.js App Router picks these up automatically and emits the right `<link rel="icon">` + `<link rel="apple-touch-icon">` tags. Existing `/favicon.ico` left in place for legacy clients.
- [ ] **P-2. The "edited" indicator threshold (>1s diff)** — **SKIPPED**: needs a migration to add `is_edited boolean` to the `comments` table (or a trigger that sets `updated_at = created_at` exactly on insert so the cmp is exact). Per the work spec, migrations are out of scope for this batch — flagging here for a future migration PR.
- [x] **P-3. Email mailto links assume desktop email client** — `ShareMenu` now offers two email items: "Open in mail app" (the existing `mailto:` flow, renamed) plus "Copy email content" (writes subject + body to the clipboard for pasting into any surface). Mobile users no longer get a surprise jump into the system composer.
- [x] **P-4. `/idea/[id]` has scroll-mt-24 on sections** — Removed the four `scroll-mt-24` offsets in `Reveal.tsx` (verdict, strengths, reasoning, comments). No anchor links exist anywhere that target those ids, so the offset was dead.
- [x] **P-5. No empty state for `/feed` when there are zero submissions** — `FeedScene` already had a `<ZeroState>` (rendered when `ideas.length === 0`); updated the copy to "Be the first to pitch — submit at /" with the existing CTA link to `/`.
- [x] **P-6. Vote counts not formatted** — Added `formatVoteCount(n)` helper to `lib/format.ts` (uses `Intl.NumberFormat("en-US")`). Applied across `Reveal.tsx` and `app/leaderboard/LeaderboardScene.tsx` (podium card AI/votes line + ListRow vote-count cell). VoteButton already used `.toLocaleString("en-US")`. IdeaCard doesn't render a raw vote count — it forwards to ShareMenu.

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

---

# Frontend design review — 2026-05-05

A second pass with a designer's eye, after the audit batches and feature shipments. The site has a real aesthetic point-of-view ("dark void cinema · gold accents · scroll-driven cinematic"), and the homepage frame scrub is genuinely unforgettable. But several surfaces are still pulling toward AI-default territory — generic typography, identical glass cards everywhere, centered-and-stacked layouts. Below: where it's distinctive, where it isn't, and concrete moves to push it from "well-built dev tool" to "you remember this site."

## 🔴 Typography is the biggest tell

The site uses **Inter + JetBrains Mono** for everything. Both are excellent fonts. Both are also the two most overused fonts in 2026 fintech / dev-tool / AI-product design — the moment a visitor scans the page they pattern-match to "another startup with a dark theme."

**Recommended swap:**
- **Display + headlines (h1, verdict pull-quotes, score numerals)** → a characterful serif like **Fraunces** (variable, opsz axis, was made for editorial), **Tiempos Headline**, or **Domaine Display**. The verdict line on `/idea/[id]` (`"Sharp blade — but no hand to wield it yet"`) is begging to be set in a serif italic at 32px — it'd read like a real judgment, not a tooltip.
- **Body + UI** → keep Inter (it's fine; the issue is when it does EVERYTHING)
- **Mono** → swap JetBrains Mono for **Berkeley Mono**, **Departure Mono**, **IBM Plex Mono**, or **Geist Mono**. JetBrains is the most-licensed mono in indie dev sites; using it makes you look like a side-project portfolio.

One distinctive serif + Inter + a less-played mono = an instantly more confident voice. Set the serif at the moments that matter (verdicts, scores, headline) and let Inter carry the rest.

## 🔴 The "judgment" type moments aren't judgmental enough

Right now, the verdict on `/idea/[id]` reads:

```
· The Verdict ·
"Sharp blade — but no hand to wield it yet."
— Gstack · lead reviewer
```

Set in italic Inter 24px. It's *fine*. It should be **massive**. A YC verdict in this product should feel like a courtroom transcript or a Times pull-quote — set in a high-contrast serif, 56px+, with weighted attribution underneath. The score number `87/100` should be even bigger — think **Bloomberg Terminal numerals**, 120px gold, tabular figures, with the `/100` at 1/3 the size. Right now scores read as data; they should read as verdicts.

## 🟠 Glass cards are too repetitive

Every surface in the app uses the same `bg-white/[0.03] border-white/10 backdrop-blur-md` glass card:
- Pitch coach bubble
- Judge cards on `/judge/[token]`
- "Other judges" cards on `/idea/[id]`
- Comments
- Soft-gate CTA
- Aggregate band
- Leaderboard rows
- Feed cards
- Pitch specs sidebar

Visiting any two surfaces back-to-back, a user can't tell at a glance which one they're on. **Surface variety is character**. A few moves:

- **Judge cards** should feel like LETTERHEAD or WAX SEALS, not glass — gold border on top + bottom, judge name in a serif, the score stamped like a notary mark. Each judge gets a distinct accent color: Gstack=cool gold, Vee=oxblood-red, Robbins=verdigris-bronze.
- **Leaderboard** should feel like a LEDGER — alternating row tints, ruled lines between rank/title/score columns, oversized rank numerals (1, 2, 3 at 96px gold, then decrease). Right now it's a list of glass cards, indistinguishable from the feed.
- **Pitch coach bubble** can stay glass — it's contextual, ambient, fine.
- **Aggregate band** on `/judge/[token]` is the most cinematic surface — lean into it harder. Letterboxing (black bars top + bottom). Score in a serif 200px. "BUILD QUEUE" badge as a foil-stamped circle with a spin-in animation.

## 🟠 Centered-and-stacked everywhere → no spatial ideas

Most pages are: header → centered title → centered content blocks → centered footer cluster. There's no asymmetry, no grid-breaking, no diagonal flow, no overlap. The cinematic homepage frame scrub IS the one composition idea — and it's load-bearing the entire aesthetic alone.

**Concrete moves:**
- **Leaderboard rank**: stop putting rank in a small badge. Put rank `01` at 200px gold, anchored left, with the title flowing to its right. The visual hierarchy IS the leaderboard.
- **Idea page**: instead of vertical stack (title → score → verdict → strengths → concerns → reasoning → other judges → comments), try a 2-column on `lg:` — verdict + score occupy a sticky left rail, the analysis flows right. The judges' takes can be horizontal cards, not stacked.
- **Homepage panels**: kicker/headline are top-centered. What if Panel 2's content was anchored bottom-LEFT instead, making panel-to-panel transitions also re-orient the eye? The cinematic frames already do this work; the overlay UI should follow.

## 🟠 No status color beyond gold

The accent is exclusively warm gold (`#FFB800`). It's strong but mono. Status states all collapse to the same gold (or fade to white/55). A second accent — **deep oxblood `#7B1F2B`** for "rejected / under-7" and **muted verdigris `#5B8A6E`** for "built" — would let the leaderboard's gold tier mean something *because* the alternative tiers don't share its color. Right now, a 9/10 idea and a 4/10 idea both wear gold accents on their cards.

Use color semantically:
- Gold = **scored sharp** (≥7) and **build queue**
- Oxblood = **fallen / rejected** (≤3)
- Verdigris = **built** (final state of the contest)
- Off-white slate = **passable** (4–6)

## 🟡 Header is generic dev-tool

`MinimalistHeader` is logo + nav + sign-in cluster. Fine, but it doesn't telegraph what this site IS. Two moves:
- Add a **persistent "PIT CLOSES IN 4D 2H 14M"** ticker pinned to the header, in monospace, with the gold pulse animation that lives in the homepage Hourglass. Now every page anywhere on the site reminds you the contest is running.
- Replace the wordmark "pitch‒pit" with a **glyph mark** — an hourglass + downward arrow, geometric, single-color. The site is named after a pit; let the logo be a pit.

## 🟡 The footer is a row of links

`SiteFooter.tsx` is just © + four legal links. The footer is a chance to land the manifesto. Replace with a tagline moment:

```
TO THE VICTOR GO THE TOKENS.
A weekly pit. Three judges. One winner.
The pit closes Monday at midnight EST.
```

In a serif display face, large, taking up vertical space. The legal links can be a thin row underneath. Right now the footer wastes the ending — every page just trails off.

## 🟡 Empty states are missing or default

When `/feed` has zero submissions, when `/leaderboard` has no scored ideas yet, when `/built` has no MVPs — the page renders an empty list. These are EXACTLY the moments where you write copy that earns the brand. "First pitches landing soon. Be the first" on the leaderboard OG is a good template — port that voice to the in-page empty states.

## 🟡 The Hourglass should appear elsewhere

The Hourglass SVG with falling sand is the *one* unforgettable visual element on the homepage. It only ever appears once. It should be:
- The **favicon** (currently it's a P monogram)
- A **micro-watermark** in the top-right of `/idea/[id]` — small, animated when the page is in focus, frozen when blurred (subtle reminder of the timer)
- **Embedded in the OG images** as a small kicker glyph next to "pitch-pit"

Repetition of a single distinctive glyph IS branding. Don't waste this asset on one panel.

## 🟡 Cursor / pointer is system default

For a route as cinematic as the homepage, a **custom cursor** (a tiny gold circle with a slight glow trail, snapping to a crosshair when over the input pill) would land. Not on every route — just on `/`, where the cinematic ambition is highest.

## 🟡 No grain on internal routes

The film grain (`scene-grain`) overlay is on the homepage but absent everywhere else. Add it (subtly, opacity 0.03) to `/idea/[id]` and `/judge/[token]` so the cinematic feel persists once you're past the front door. Right now, leaving the homepage feels like leaving the brand.

## ⚪ Smaller polish moments

- **Score-counter sheen** — when the avg score on `/judge/[token]` first lands, run a single horizontal gold sheen across the number (like a foil-stamp catching light). 600ms once, then static. Tiny detail, big "freshly minted" feeling.
- **Page transition** — currently routes hard-cut. A 200ms fade-from-black between routes (Next.js parallel routes / framer-motion AnimatePresence on layout) would maintain the cinematic continuity.
- **Voted button microcopy** — currently "Cast a vote / Voted." Change to "Cast a token / Token cast." Aligns to the "to the victor go the tokens" line.
- **Submit microcopy** — "Press Enter to submit". Change to "Press Enter to enter the pit." Specific. Memorable.
- **Loading copy on /judge/[token]** — currently "Reading… Considering… Deliberating… Rendering judgment…" — already strong, leave alone. This is the one place the voice already lands.

## 🎯 If you only do ONE thing

**Swap the display font from Inter to a characterful serif** (Fraunces variable is free, drops in via `next/font/google`, supports italic + opsz axis for natural display sizing) and use it for: h1 page titles, the verdict pull-quote on `/idea/[id]`, the big score numerals on `/judge/[token]` and `/idea/[id]`, the OG card titles. Keep Inter for everything else.

This single change converts the site's dominant typographic voice from "AI tool" to "judgment / verdict / weight." It compounds into every other surface for free.

