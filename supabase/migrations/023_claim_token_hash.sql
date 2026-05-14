-- pitch-pit · 023 · hash anonymous claim tokens at rest
--
-- Migration 018 stored ideas.claim_token as the same plaintext random
-- 32-hex string that gets minted into the pp_claim_<draft.id> cookie.
-- A DB log leak, read-replica snapshot, or compromised backup would
-- let an attacker replay any unclaimed token as a cookie and steal
-- the matching anonymous idea.
--
-- This migration:
--   1. Adds ideas.claim_token_sha256 (bytea — pgcrypto digest output).
--      Indexed so the /api/claim-idea lookup stays sub-millisecond.
--   2. Backfills hashes for every existing unclaimed idea with a
--      plaintext claim_token so in-flight cookies (24h TTL) still
--      resolve after deploy.
--   3. Leaves the legacy plaintext claim_token column in place for
--      one deploy cycle. A follow-up migration will drop it once we
--      can confirm no cookie minted before 023 is still in flight.
--
-- Idempotent: every DDL uses `if not exists`, the backfill UPDATE is
-- gated on the hash column being NULL so re-runs are no-ops, and
-- pgcrypto's `create extension if not exists` was already a no-op
-- from migration 001.
--
-- Threat model after this migration:
--   - DB snapshot or log leak: attacker sees only sha256(token) for
--     newly-minted ideas. Reversing requires a brute-force preimage
--     attack on a 128-bit secret — computationally infeasible.
--   - Legacy ideas inserted before 023 retain BOTH columns (plaintext
--     + hash) for one deploy cycle. The plaintext column will be
--     dropped in a follow-up migration once cookie TTLs (24h) have
--     elapsed for all in-flight anonymous drafts.
--   - The claim path in /api/claim-idea no longer reads or trusts the
--     plaintext column: it always hashes the cookie value and compares
--     against claim_token_sha256. The DB-side `eq` comparison is the
--     constant-time-equivalent check (the column never leaves the DB).

create extension if not exists pgcrypto;

alter table public.ideas
  add column if not exists claim_token_sha256 bytea;

alter table public.draft_pitches
  add column if not exists claim_token_sha256 bytea;

create index if not exists ideas_claim_token_sha256_idx
  on public.ideas (claim_token_sha256)
  where claim_token_sha256 is not null;

-- Backfill: hash every existing plaintext claim_token so in-flight
-- cookies still resolve against the new column. Only touch rows where
-- claim_token_sha256 IS NULL so re-runs are safe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ideas'
      and column_name = 'claim_token'
  ) then
    update public.ideas
       set claim_token_sha256 = extensions.digest(claim_token, 'sha256')
     where claim_token is not null
       and claim_token_sha256 is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'draft_pitches'
      and column_name = 'claim_token'
  ) then
    update public.draft_pitches
       set claim_token_sha256 = extensions.digest(claim_token, 'sha256')
     where claim_token is not null
       and claim_token_sha256 is null;
  end if;
end
$$;

comment on column public.ideas.claim_token_sha256 is
  'SHA-256 of the original claim_token (16 random bytes, hex-encoded). Used by /api/claim-idea to verify the pp_claim_<draft.id> cookie without storing the secret at rest. Set on insert (migration 023+) or backfilled from claim_token. Nulled on successful claim alongside the legacy plaintext column.';

comment on column public.draft_pitches.claim_token_sha256 is
  'SHA-256 of the original claim_token. Set on insert in POST /api/draft and copied across to ideas.claim_token_sha256 at judgment-persist time. Mirrors the plaintext claim_token column for one deploy cycle.';

-- NOTE: public.ideas.claim_token (plaintext, migration 018) is
-- intentionally NOT dropped here. Cookies minted before 023's deploy
-- still reference the plaintext column via the cookie-store comparison
-- in app/idea/[id]/[[...slug]]/page.tsx. After one deploy cycle (24h
-- cookie TTL elapsed for all in-flight anonymous drafts), a follow-up
-- migration should:
--   1. drop ideas.claim_token
--   2. drop draft_pitches.claim_token
--   3. update the idea page to use claim_token_sha256 + cookie hashing
