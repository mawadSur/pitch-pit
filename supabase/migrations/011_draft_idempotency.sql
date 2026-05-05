-- pitch-pit · 011 · draft_pitches idempotency key
--
-- Adds a client-supplied request_id to draft_pitches so the POST
-- /api/draft route can dedupe accidental double-submits (network
-- blips + client retries, React useTransition re-fires, etc.) into
-- a single row. Without this, one user click could yield two drafts
-- → two /judge/[token] URLs → two judgments → two ideas rows.
--
-- Design notes:
--   - Nullable. Existing/older clients that don't send request_id
--     skip the dedupe path on the server entirely. Pure additive.
--   - No UNIQUE constraint. Concurrent retries that race past the
--     SELECT-then-INSERT lookup window must NOT hard-fail; the goal
--     is a soft "return existing" on the common path. The 5-minute
--     server-side window keeps the dedupe practical even for slow
--     retries while bounding the lookup.
--   - Partial index over rows where request_id is not null keeps
--     the index small (most legacy rows, post-deploy, will have
--     null request_id and won't bloat the index).
--   - Composite (request_id, created_at DESC) supports the typical
--     server query: "find the most recent draft with this request_id
--     in the last 5 minutes".

alter table public.draft_pitches
  add column if not exists request_id text;

create index if not exists idx_draft_pitches_request_id
  on public.draft_pitches (request_id, created_at desc)
  where request_id is not null;

comment on column public.draft_pitches.request_id is
  'Client-supplied UUID v4 idempotency key. Same request_id within a 5-minute window returns the existing draft instead of minting a new one. Optional — pre-idempotency clients leave this null.';
