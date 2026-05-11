-- pitch-pit · 022 · drafts request_id uniqueness (per owner)
--
-- Closes a race in POST /api/draft: the route did a SELECT-then-INSERT
-- idempotency check on (user_id, request_id) with no DB-side guard, so
-- two concurrent POSTs with the same request_id could both lookup-miss
-- and both INSERT — minting two drafts and two access_tokens for what
-- the client expected to be a single idempotent submission.
--
-- This adds a partial UNIQUE index on (user_id, request_id) where
-- request_id is not null. The route now catches the 23505 unique_violation
-- on the loser side and re-SELECTs the winning row so both callers see
-- the same draft.token.
--
-- Why partial:
--   - request_id is nullable (migrations 011/012). Pre-idempotency
--     clients and the legacy anonymous-draft path leave it NULL and
--     must continue to be allowed to insert freely.
--   - Keeping the predicate `request_id is not null` lets older rows
--     and any non-idempotent insert path coexist without violating
--     uniqueness on NULL.
--
-- Why (user_id, request_id) and not just request_id:
--   - request_id is a client-supplied UUID v4. Across distinct users it
--     is astronomically unlikely to collide, but the dedupe semantic in
--     the route is owner-scoped (signed-in dedupes by user_id; anon
--     dedupes by null user_id), so the constraint must match.
--   - Anonymous drafts have user_id IS NULL — under PostgreSQL's default
--     NULLS DISTINCT semantics, two anon rows with the same request_id
--     would NOT conflict. That's intentional here: two different
--     anonymous browsers should not collide on a recycled uuid; the
--     odds are negligible and we'd rather not couple unrelated anon
--     sessions. The signed-in path is what the race-report flagged
--     and is fully covered.
--
-- Idempotent: `create unique index if not exists` is safe to re-run.
-- Safe on a populated table: any pre-existing duplicate (user_id,
-- request_id) pairs would cause this to fail. We accept that — the
-- table is GC'd on a 24h TTL via prune_expired_drafts() so the window
-- for legacy dupes is small, and a hard fail here is the correct
-- signal that one needs to be cleaned up manually before re-applying.

create unique index if not exists drafts_request_id_uniq
  on public.draft_pitches (user_id, request_id)
  where request_id is not null;

comment on index public.drafts_request_id_uniq is
  'Partial unique index closing the SELECT-then-INSERT race in POST /api/draft. Owner-scoped; NULL request_ids (legacy/non-idempotent path) are unconstrained.';
