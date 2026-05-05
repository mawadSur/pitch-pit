# pitch-pit

> Weekly startup idea contest. AI rates pitches YC-style, the community votes, the winner gets built — for free.
>
> Tagline: **"to the victor go the tokens."**

[![CI](https://github.com/mawadSur/pitch-pit/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/mawadSur/pitch-pit/actions/workflows/test.yml)

## What it is

Founders submit a 60–1500 character pitch. Claude Sonnet 4.6 rates it 1–10 across six dimensions (demand, wedge, founder edge, feasibility, defensibility, distribution) and produces a structured verdict. The community votes for a week. Final score = 50% AI + 50% community, normalized 0–100. The pit closes Monday at midnight EDT, and the top idea each week gets built and shipped under the founder's name.

Live at **[pitchpit.app](https://pitchpit.app)** ([Vercel preview](https://pitch-pit.vercel.app)).

## Stack

- **Next.js 14** App Router, TypeScript
- **Supabase** — Postgres, Auth (Google + magic link), Realtime, pg_cron, Edge Functions
- **Anthropic Claude Sonnet 4.6** — scoring with `cache_control: ephemeral` prompt caching
- **Tailwind CSS** — minimalist black void + warm gold (`#FFB800`) aesthetic, scoped under `.scene`
- **Framer Motion** — page transitions + scroll-driven canvas frame scrubbing
- **Cloudflare Turnstile** — invisible captcha (env-gated)
- **Upstash Redis** — distributed rate-limit (in-memory fallback for dev)
- **Sentry** — error reporting (Replay disabled, error capture only)
- **Vitest** + **Playwright** — 56 unit tests + 6 E2E smoke tests

## Quick start

```bash
git clone https://github.com/mawadSur/pitch-pit.git
cd pitch-pit
npm install
cp .env.local.example .env.local
# fill in Supabase + Anthropic + admin password (see env reference below)
supabase db push
npm run dev
# → http://localhost:3000
```

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # production build (runs lint + TypeScript checks)
npm run lint         # ESLint
npm test             # Vitest unit suite (lib/ + app/api/)
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Playwright E2E (boots npm start on port 3100)
supabase db push     # apply pending migrations to remote Supabase
```

## Architecture

### Homepage scroll cinema

`app/HomeScene.tsx` is three sticky `<HeroPanel>` sections (`components/scene/HeroPanel.tsx`). Each panel renders:

1. A static "at-rest" `<NextImage>` (visible at section's `scrollProgress < 0.005`)
2. A `<canvas>` that scrubs through a pre-extracted JPEG frame sequence as the user scrolls
3. UI overlay positioned with absolute % offsets

The crossfade between image and canvas is pure CSS opacity — no DOM mutation, no flicker. Frames are preloaded with `Image.decode()` upfront so canvas blits are synchronous GPU draws. Mobile disables the canvas entirely (`matchMedia('(min-width: 768px)')`) and shows the static image across the whole panel.

After the three sticky panels: HowItWorks → WeeklyStakes → AntiAbusePromise → FinalCTA info sections (calmer reveal animations, no pinning).

### Frame sequences

Each panel scrubs a sequence extracted via `ffmpeg` at 18 fps, scaled to 1024px wide:

```bash
ffmpeg -i public/scene/transition-1.mp4 -vf "fps=18,scale=1024:-2" -q:v 4 public/scene/frames-1/%03d.jpg -y
ffmpeg -i public/scene/transition-2.mp4 -vf "fps=18,scale=1024:-2" -q:v 4 public/scene/frames-2/%03d.jpg -y
ffmpeg -i public/scene/last.mp4         -vf "fps=18,scale=1024:-2" -q:v 4 public/scene/frames-3/%03d.jpg -y
```

`FRAMES_*_COUNT` constants in `HomeScene.tsx` must match the file count. The panel-to-canvas handoff is byte-identical when the at-rest image equals `frames-N/001.jpg`.

### Database

Tables: `users` (mirrors `auth.users`), `ideas`, `votes`, `comments`, `weeks`, `build_queue`, `idempotency_keys`. Migrations live in `supabase/migrations/` and run sequentially via `supabase db push`. Realtime is enabled on `ideas`, `votes`, `comments`, `build_queue`.

`final_score` is computed by trigger (`003_final_score_5050.sql` + `008_recompute_where_clause.sql`):

```
final_score = round(0.5 × ai_score×10 + 0.5 × vote_count/max_votes × 100)   -- 0–100 scale
```

Recomputed for all visible ideas on any vote insert/delete (denominator shifts globally) and on any score/status change. The trigger function is scoped to `WHERE status IN ('scored','queued','building','built')` so it works under Supabase's "UPDATE requires a where clause" project safeguard.

### AI scoring

`POST /api/score`:

1. Body validated by `submitSchema` (`lib/score-schema.ts`, min 60 / max 1500 chars)
2. Cloudflare Turnstile token verified (no-op when env vars unset)
3. Synchronous content filter (`lib/content-filter.ts`) — prompt-injection patterns, slur list, all-caps spam, repeated chars, low-effort filler. Rejects junk before burning Anthropic tokens
4. Per-user weekly quota check (`lib/user-quota.ts`) — 2 submissions / 7-day rolling window for signed-in users
5. Anthropic call with `cache_control: ephemeral` on the system prompt — system prompt is cached after the cache-write threshold
6. `moderation_flag` from the AI response gates persistence — flagged content is rejected without writing to the DB
7. Insert via service-role client with idempotency key persistence

### Auth

Supabase Auth with two providers:
- **Google OAuth** — primary path. Site URL + Redirect URLs configured in Supabase dashboard.
- **Email magic link** — fallback via Supabase OTP.

Both redirect to `/auth/callback` (`app/auth/callback/route.ts`) which calls `exchangeCodeForSession()` and forwards to the destination (same-origin path validation prevents open-redirect).

`/admin` is gated separately by HTTP Basic Auth in `middleware.ts` using the `ADMIN_PASSWORD` env var.

### Voting + Comments

`<VoteButton />` (`components/idea/VoteButton.tsx`) on `/idea/[id]`. Optimistic UI; if not signed in, routes to `/login?next=/idea/[id]`. `POST /api/vote` toggles (insert if absent, delete if present). DB triggers update `vote_count` cache and recompute `final_score` for everyone.

Comments live under each idea reveal (`components/idea/Comments.tsx`). Public read, authenticated insert, owner edit/delete (RLS-enforced). Realtime postgres_changes subscription with visibility-gating to pause when the tab is hidden. Inline two-stage delete confirm (no native `confirm()`).

### Sharing

`components/idea/ShareMenu.tsx` is reachable from every surface that displays an idea (`/idea/[id]`, `/leaderboard`, `/feed`, `/built`, `/submissions`). Two variants (`primary` pill / compact `icon`) and one popover layout: native share sheet (when `navigator.share` exists), copy link, X / LinkedIn / Facebook / Reddit / Email. LinkedIn-specific: copies a formatted post text to the clipboard then opens `linkedin.com/feed/` so the user pastes into compose (LinkedIn URL params don't accept post text). Mobile renders the popover as a full-width bottom sheet with scrim.

### Anti-abuse

| Layer | Where | What it blocks |
|---|---|---|
| Captcha | Cloudflare Turnstile (env-gated) | Scripted bots |
| IP rate limit | Upstash sliding window in `middleware.ts` | 5 POSTs / 10 min per IP on `/api/score` |
| Per-user quota | `lib/user-quota.ts` | 2 submissions / 7 days for signed-in users |
| Content filter | `lib/content-filter.ts` | Prompt-injection, slurs, all-caps spam, char-runs, low-effort filler |
| LLM moderation | Inline in the scoring prompt | Hate speech, doxxing, CSAM, serious-harm instructions, explicit fraud |
| Idempotency | DB-backed keys in `idempotency_keys` | Lost-judgment on retry / duplicate scoring |

## Environment variables

`.env.local.example` is the canonical manifest. Required:

| Var | Where it's used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only — `lib/supabase/admin.ts` |
| `ANTHROPIC_API_KEY` | `app/api/score/route.ts` |
| `ADMIN_PASSWORD` | `middleware.ts` Basic Auth gate |
| `NEXT_PUBLIC_SITE_URL` | Sitemap, robots, OG metadata |

Optional (production hardening — gracefully no-op when unset):

| Var | Effect |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | Captcha on `/api/score` and `/api/comments`. For local dev, either add `localhost`/`127.0.0.1` to the site's allowed hostnames in the Turnstile dashboard, or use Cloudflare's always-pass dummy keys (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`) — [docs](https://developers.cloudflare.com/turnstile/troubleshooting/testing/). |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Distributed rate-limit (in-memory fallback otherwise) |
| `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` | Sentry error capture |
| `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` | Sentry source-map upload (CI / Vercel only) |

Google OAuth credentials are configured in the Supabase dashboard, not via env vars.

## Project conventions

- **Per-route font loading.** Each route loads only the fonts it uses (Inter + JetBrains Mono on the minimalist surfaces). Don't move font imports into `app/layout.tsx`.
- **Scoped CSS.** Minimalist styles live in `app/scene.css` under `.scene-*` class prefixes. `app/globals.css` holds the body-level base + reduced-motion media query.
- **`<Image>` shadowing.** When using `next/image` in a file that also constructs `new Image()` (canvas frame preloading), import as `NextImage` to avoid shadowing the global `Image` constructor.
- **Static-image panels** that match a video's first frame: bg should reference `/scene/frames-N/001.jpg`, not the source PNG, so the boundary into the canvas section is invisible.
- **`MotionConfig reducedMotion="user"`** wraps every top-level scene so users with `prefers-reduced-motion: reduce` actually get reduced motion.
- **Tests.** Unit (Vitest) under `lib/` and `app/api/`. E2E (Playwright) under `e2e/`. CI runs both on every PR + push to main.

## Deployment

Auto-deploys to Vercel on push to `main`. To deploy elsewhere:

1. `npm run build` — produces a `.next` directory + standalone server
2. Set the env vars above in your hosting platform
3. Run `npm start` to serve

Migrations: `supabase db push` against your remote Supabase project. Migrations are sequential and idempotent; running `db push` again is safe.

## License

Source available under the terms in [LICENSE](LICENSE) (if present). All submitted pitches remain the property of their authors — the platform takes a non-exclusive license to display them publicly. See [/terms](https://pitchpit.app/terms).
