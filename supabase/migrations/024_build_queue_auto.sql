-- pitch-pit · 024 · auto-build orchestration columns on build_queue
--
-- Migration 001 created build_queue as a human-driven hand-off: when the
-- close-week cron flips the winning idea to 'building', a human reads
-- the email prompt and runs Claude Code by hand. This migration adds
-- the state needed to drive the build automatically via GitHub Actions:
--
--   1. retry_count — how many times the builder has retried. The
--      callback receiver bumps this on 'failed' status. After one
--      retry, a failure falls back to manual email.
--   2. callback_token — single-use opaque secret minted by the cron
--      route and passed to GitHub Actions in the dispatch payload.
--      The builder includes it in its callback POST so we can verify
--      the update came from a build we actually started.
--   3. build_logs — append-only log lines from the builder so the
--      /winner/[id] page can stream progress over Supabase Realtime.
--   4. build_phase — discrete state for the UI: 'queued' | 'generating'
--      | 'deploying' | 'complete' | 'failed'. status (existing) tracks
--      the canonical lifecycle; build_phase is a finer-grained label
--      for the live progress display.
--
-- Idempotent: every DDL uses `if not exists`.

alter table public.build_queue
  add column if not exists retry_count int not null default 0;

alter table public.build_queue
  add column if not exists callback_token text;

alter table public.build_queue
  add column if not exists build_logs jsonb not null default '[]'::jsonb;

alter table public.build_queue
  add column if not exists build_phase text;

create unique index if not exists build_queue_callback_token_idx
  on public.build_queue (callback_token)
  where callback_token is not null;

comment on column public.build_queue.retry_count is
  'Number of times the GitHub Actions builder has retried this build. Bumped by /api/build-callback on phase=failed. After retry_count=1 a second failure falls back to manual email instead of re-dispatching.';

comment on column public.build_queue.callback_token is
  'Single-use opaque secret (32 hex chars) minted by close-week-and-build and passed to the builder in the repository_dispatch payload. /api/build-callback requires this token to match before applying updates. Nulled out when status becomes complete or failed (terminal).';

comment on column public.build_queue.build_logs is
  'Append-only JSONB array of {ts, level, msg} entries posted by the builder. Used by /winner/[id] over Supabase Realtime to render a live build feed.';

comment on column public.build_queue.build_phase is
  'Finer-grained UI label for the live build feed: queued | generating | deploying | complete | failed. Independent of status (which tracks the canonical queue lifecycle).';

-- ─────────────────────────────────────────────────────────────────────
-- Column-level grants — hide callback_token from anon / authenticated.
-- ─────────────────────────────────────────────────────────────────────
-- Migration 001 created build_queue with `using (true)` RLS — every row
-- is publicly SELECT-able. That's fine for status + log columns (the
-- arena is meant to be transparent), but callback_token is the only
-- bearer secret that authenticates /api/build-callback. If anon can
-- read it via PostgREST or Realtime, an attacker can POST phase=complete
-- with a phishing mvp_url and we'd publish it.
--
-- The fix: revoke blanket SELECT, then re-grant SELECT only on the
-- non-secret columns. Supabase Realtime applies the same column grants
-- to its change-data-capture payloads, so the realtime broadcast on
-- /winner/[id] no longer carries the token either.
--
-- The service-role client (used by the cron and callback routes)
-- bypasses these grants, so server-side reads of callback_token still
-- work.

revoke select on public.build_queue from anon, authenticated;

grant select (
  id,
  idea_id,
  status,
  approved_by,
  approved_at,
  started_at,
  completed_at,
  mvp_url,
  repo_url,
  notes,
  error,
  created_at,
  updated_at,
  retry_count,
  build_phase,
  build_logs
) on public.build_queue to anon, authenticated;
