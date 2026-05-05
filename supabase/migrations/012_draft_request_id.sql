-- pitch-pit · 012 · request_id idempotency on draft_pitches (HOTFIX)
--
-- /api/draft inserts a `request_id` column the schema didn't have, so
-- prod submissions were failing with PostgREST "column not found." This
-- adds the column + an index matching the dedupe lookup shape in the
-- route (request_id + user_id + created_at desc, last 5 minutes).
--
-- Originally numbered 011 but version 011 was already taken in the
-- remote `schema_migrations` table from a prior unrelated push, so
-- this file was renumbered. Statements are fully idempotent
-- (add column if not exists / create index if not exists), so a
-- partial earlier run on the same column is fine.
--
-- Safe to run on a populated table — column is nullable, no backfill
-- needed; pre-existing rows simply have NULL request_id and skip the
-- dedupe lookup.

alter table public.draft_pitches
  add column if not exists request_id uuid;

-- Partial composite index keyed to the lookup in app/api/draft/route.ts:
--   .eq("request_id", request_id)
--   .eq("user_id", userId) OR .is("user_id", null)
--   .gte("created_at", since)
--   .order("created_at", { ascending: false })
-- WHERE clause skips the (vast majority of) rows that never set
-- request_id, keeping the index small.
create index if not exists draft_pitches_request_id_idx
  on public.draft_pitches (request_id, user_id, created_at desc)
  where request_id is not null;

comment on column public.draft_pitches.request_id is
  'Client-supplied UUID v4 for idempotent retries. Same uuid + same owner within 5 minutes returns the existing draft.';
