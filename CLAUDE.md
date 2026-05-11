# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # next dev — http://localhost:3000
npm run build        # next build — runs lint + TypeScript checks
npm run lint         # next lint
npm test             # vitest run (unit tests under lib/ and app/api/)
npm run test:e2e     # playwright (specs in e2e/)
supabase db push     # apply migrations in supabase/migrations/ to remote
```

Test coverage is partial: vitest covers a handful of lib helpers (`content-filter`, `slug`, `extract-json`, `score-schema`, `week-cycle`) and three API routes (`vote`, `claim-idea`, `pitch-coach`). Playwright has smoke + judge-flow specs only — no signed-in vote test, no `/api/score` happy path, no admin gate test. The build is still a real verification gate — `npm run build` catches type errors and lint failures.

## Product

pitch-pit is a weekly idea contest. Users submit a startup pitch, an AI scoring agent rates it (0–10 rubric), the community votes, and the top combined score wins a free MVP build.

Tagline: "to the victor go the tokens." The pit closes Monday at midnight EST.

## Two visual themes coexist

The codebase has two aesthetics layered on the same backend. Don't conflate them.

**Minimalist cinematic** (the user-facing surface): `/`, `/submit`, `/idea/[id]`, `/leaderboard`, `/built`, `/rules`, `/login`. Black void + warm gold (#FFB800) accents + glass cards + scroll-driven frame sequences. Three-axis typography: **Fraunces** variable serif (display + verdict + score numerals via `--font-display` and the `.scene-display` / `.scene-display-italic` / `.scene-numeral` utility classes), **Inter** for body, **Geist Mono** for caption / label / status pills. Status colors beyond gold: `--scene-oxblood` (fallen, ≤3), `--scene-verdigris` (built — final state), `--scene-slate` (passable, 4–6). Tokens scoped under `.scene` in `app/scene.css`.

**Capitol theatrical** (legacy operator surface): `/feed`, `/admin`. Cinzel + Cormorant Garamond fonts, gold-on-charcoal palette, ornamental dividers. The remaining tokens live as CSS variables in `app/globals.css` (`--ink-*`, `--gold`, `--blood`, `--parchment`, etc.) and feed global chrome — scrollbar, body background, default h1-h4 font, selection. `design-system/MASTER.md` documents this aesthetic but is **stale** — it describes the old Capitol homepage that has since been replaced.

> **Capitol palette is legacy.** The Tailwind utilities (`text-parchment`, `font-display`, `tracking-decree`, `shadow-forge`, `animate-torchlight`, etc.) were removed from `tailwind.config.ts` because grep confirmed they were unused — `/admin` and `/feed` rely on inline styles + the surviving CSS variables instead. Don't reach for the legacy tokens in new code; use the minimalist `.scene` tokens. The Capitol header (`components/Header.tsx`) was deleted in cleanup. Minimalist routes render `<MinimalistHeader />` from `components/scene/`; the legacy operator routes render bare. Footer rendering is driven by route groups now (see "Route groups" below) — no pathname checks.

## Homepage scroll architecture (the unique part)

`app/(no-footer)/HomeScene.tsx` is three sticky `<HeroPanel>` sections. Each `HeroPanel` (in `components/scene/HeroPanel.tsx`) renders:

1. A static "at-rest" `<NextImage>` (visible at section's `scrollProgress < 0.005`)
2. A `<canvas>` that scrubs through a pre-extracted JPEG frame sequence as the user scrolls
3. UI overlay positioned with absolute % offsets so it aligns with hourglass + input zones in the bg image

The crossfade between image and canvas is pure CSS opacity — no DOM mutation, no flicker. Frames are preloaded with `Image.decode()` upfront so canvas blits are synchronous GPU draws. `requestAnimationFrame`-batched.

**heightVh prop**: panels with frames use `heightVh={200}` (h-[200vh] section). Sticky pin lasts the first 100vh; `pinFraction = (heightVh - 100) / heightVh = 0.5` remaps `scrollYProgress` so the frame scrub completes within the pinned portion. After pin ends, the canvas parks on the last frame while the section scrolls away.

Image bgs are intentionally set to **the first frame of the next video sequence** (`/scene/frames-1/001.avif`, `/scene/frames-2/001.avif`) so the panel→canvas handoff is byte-identical at the boundary.

## Frame sequences

Three sequences feed the homepage: `public/scene/frames-1/{001..091}.avif` (panel 1 — capture), `public/scene/frames-2/{001..090}.avif` (panel 2 — judge), and `public/scene/frames-3/{001..090}.avif` (panel 3 — winner). All three are extracted from source mp4s via ffmpeg, then converted to AVIF for ~50% smaller file size:

```bash
# 1. Extract JPEGs from the source video
ffmpeg -i public/scene/transition-1.mp4 -vf "fps=18,scale=1024:-2" -q:v 4 public/scene/frames-1/%03d.jpg -y

# 2. Convert to AVIF (sharp-based, idempotent)
node scripts/convert-frames-to-avif.mjs

# 3. Remove the source JPEGs after confirming the canvas works
rm public/scene/frames-1/*.jpg
```

If you regenerate, keep the same naming (`%03d.avif` zero-padded) and update `FRAMES_*_COUNT` constants in `HomeScene.tsx`.

## Database (Supabase)

Tables: `users` (mirrors `auth.users`), `ideas`, `votes`, `build_queue`. Migrations live in `supabase/migrations/` and run sequentially via `supabase db push`. Realtime is enabled on `ideas`, `build_queue`, `votes`.

**`final_score` is computed by trigger** (`003_final_score_5050.sql`):
- `final_score = round(0.5 × ai_score×10 + 0.5 × vote_count/max_votes × 100)` — 0-100 scale
- Recomputed for **all** ideas on any vote insert/delete (denominator shifts globally) and on any `score`/`status` change
- Trigger only fires on `OF score, status, vote_count` — never on `final_score` itself, so no recursion when the recompute writes
- The leaderboard sorts by `final_score desc` with `score` as tiebreaker

**RLS policy summary**:
- Anyone reads scored+ ideas; only authenticated can insert; can't vote your own idea (DB-enforced)
- Admin writes go through `lib/supabase/admin.ts` (service-role client, no session, bypasses RLS) — used only by `app/api/score/route.ts` and `app/(with-footer)/admin/actions.ts`
- Regular reads use `lib/supabase/server.ts` (cookie-aware ssr client)
- Browser writes/realtime use `lib/supabase/client.ts`

## AI scoring

`POST /api/score` — body validated by `submitSchema` (`lib/score-schema.ts`, min 60 / max 3500 chars). Calls Claude Sonnet 4.6 (`claude-sonnet-4-6`) with the gstack-style prompt from `lib/score-prompt.ts`. The prompt enforces structured JSON output (validated by `scoreSchema`); the response is inserted via service-role and the new id returned. The client redirects to `/idea/[id]` to show the reveal.

The prompt has `cache_control: { type: "ephemeral" }` set on the system block — when it grows past the cache threshold this becomes free.

## Auth

Supabase Auth with two providers:
- **Google OAuth** — primary path. Set up via Supabase dashboard (Auth → Providers → Google). Authorized redirect URI in Google Cloud: `https://<project-ref>.supabase.co/auth/v1/callback`. Site URL in Supabase: `http://localhost:3000` for dev.
- **Email magic link** — fallback. Uses Supabase's built-in OTP.

Both redirect to `/auth/callback` (`app/auth/callback/route.ts`) which calls `exchangeCodeForSession()` and forwards to the destination.

`/admin` is gated separately by HTTP Basic Auth in `middleware.ts` using `ADMIN_PASSWORD` env var.

## Voting

`<VoteButton />` (`components/idea/VoteButton.tsx`) on `/idea/[id]`. Optimistic UI; if not signed in, routes to `/login?next=/idea/[id]`. `POST /api/vote` toggles (insert if absent, delete if present). DB triggers update `vote_count` cache and recompute `final_score` for everyone.

## Environment variables

`.env.local.example` is the manifest:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public, used by browser + server clients
- `SUPABASE_SERVICE_ROLE_KEY` — server only, used by admin client
- `ANTHROPIC_API_KEY` — server only, used by `/api/score`
- `ADMIN_PASSWORD` — gates `/admin` via middleware basic auth

## Conventions worth knowing

- **Per-route fonts**: each per-route `page.tsx` loads three fonts and applies them as CSS variables on its root: Inter (`--font-scene`, body, via `next/font/google`), Geist Mono (`--font-scene-mono`, captions, self-hosted via `next/font/local` from `lib/fonts/geist-mono.ts`), and Fraunces (`--font-display`, display/verdict/score numerals, self-hosted from `lib/fonts/fraunces.ts`). Don't move font loading to root layout — it'd pull all three on every route. Self-hosting both Geist and Fraunces avoids the Google Fonts download flakiness we hit early. Use `.scene-display` / `.scene-display-italic` / `.scene-numeral` utility classes for serif moments; raw `var(--font-display)` is also available.
- **`<Image>` shadowing**: when using `next/image` in a file that also constructs `new Image()` (e.g., for canvas frame preloading), import as `NextImage` to avoid shadowing the global `Image` constructor. See `components/scene/HeroPanel.tsx`.
- **Scoped CSS**: minimalist styles live in `app/scene.css` under `.scene-*` class prefixes. Don't pollute `app/globals.css` (which holds the legacy Capitol palette).
- **Route groups for footer suppression**: routes live in one of two App Router route groups — `app/(no-footer)/` for full-bleed surfaces (`/` and `/idea/[id]`) and `app/(with-footer)/` for everything else. The closing manifesto footer is rendered by `app/(with-footer)/layout.tsx` only. Add a new route by placing it under whichever group matches its chrome — no pathname checks. `components/SiteFooter.tsx` is now a Server Component (no `usePathname`).
- **Co-located client components for the homepage** live alongside its page.tsx inside the group: `app/(no-footer)/HomeScene.tsx`, `PitchAttachments.tsx`, `PitchCoach.tsx`, `SubmittingOverlay.tsx`. Import `scene.css` with the absolute path `@/app/scene.css` so the import survives future group reshuffles.
- **Static-image panels** that match a video's first frame: bg should reference `/scene/frames-N/001.avif`, **not** the source `firstimage.png` etc., so the boundary into the canvas section is invisible.
