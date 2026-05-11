-- pitch-pit · 021 · unify draft_pitches.request_id to uuid (Critical-5)
--
-- Bug: `draft_pitches.request_id` has inconsistent type across envs.
--
-- Trace:
--   - 011_draft_idempotency.sql:25 declared `request_id text`.
--   - 012_draft_request_id.sql:19 added the same column with
--     `add column if not exists ... uuid`.
--
-- On a fresh DB both run in order: 011 creates the column as TEXT, then
-- 012's `if not exists` no-ops (column already exists), leaving the
-- type as TEXT. On the remote prod DB, per 012's own header, the
-- `011` slot in `supabase_migrations.schema_migrations` was already
-- taken by a prior unrelated push, so 011 here was skipped; 012 ran
-- alone and created the column as UUID.
--
-- Net: dev DBs have `request_id text`, prod has `request_id uuid`.
-- Drift hazard for any subsequent migration that joins on or casts
-- request_id, and for /api/draft which binds a uuid v4 from the
-- client.
--
-- Fix: idempotently coerce the column to `uuid`. Read the live type
-- from information_schema and ALTER ... USING request_id::uuid only
-- when current type is TEXT. If it is already UUID, no-op. Wrapped
-- in a DO $$ block so re-runs are safe.
--
-- Safety of the cast:
--   - `text::uuid` is a strict cast — any non-uuid value would raise
--     `invalid input syntax for type uuid`. Values in this column
--     come from /api/draft, which validates with z.string().uuid()
--     before insert (see app/api/draft/route.ts), so prod data is
--     well-formed.
--   - The column is nullable; NULLs cast trivially.
--   - The index `idx_draft_pitches_request_id` (011) is on the same
--     column; ALTER TYPE rewrites dependent indexes automatically.
--
-- Backfill: none. final_score is unaffected, no semantic change.

do $$
declare
  current_type text;
begin
  select data_type
    into current_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'draft_pitches'
    and column_name = 'request_id';

  if current_type = 'text' then
    alter table public.draft_pitches
      alter column request_id type uuid
      using request_id::uuid;
  end if;
  -- else: already uuid (or column missing on an unrelated env) — no-op
end
$$;

comment on column public.draft_pitches.request_id is
  'Client-supplied UUID v4 idempotency key. Same uuid + same owner within 5 minutes returns the existing draft instead of minting a new one. Unified to uuid type across envs in migration 021.';
