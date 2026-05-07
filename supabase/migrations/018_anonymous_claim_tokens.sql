-- pitch-pit · 018 · anonymous claim tokens
--
-- Anonymous-first submission flow: a logged-out visitor can create a
-- draft, see all three judges deliberate, and reach the persisted ideas
-- row — but only the original submitter (proven by an HttpOnly cookie
-- minted at draft time) gets the "claim this idea" CTA on /idea/[id].
--
-- Schema:
--   - draft_pitches.claim_token: 32-hex random secret minted on
--     anonymous draft creation. Echoed to the client in an HttpOnly
--     cookie keyed by draft id. Carried over to the resulting ideas
--     row so /idea/[id] can verify the cookie without re-reading the
--     draft (which has a 24h TTL and may already be GC'd by claim
--     time).
--   - ideas.claim_token: same value, copied across in
--     persistJudgment(). Cleared once the idea is claimed (we set
--     user_id and null out claim_token in the same UPDATE) so the
--     cookie can't be reused after a successful claim.
--
-- Both columns are nullable with no constraints: signed-in submissions
-- skip the cookie path entirely (their auth gate is enough), and legacy
-- rows that predate this migration just stay null forever — they're
-- already attached to a user (or weren't claimable anyway).

alter table public.draft_pitches
  add column if not exists claim_token text;

alter table public.ideas
  add column if not exists claim_token text;

comment on column public.draft_pitches.claim_token is
  'Random 32-hex secret minted on anonymous draft creation. Mirrored to an HttpOnly cookie pp_claim_<draft.id>. Used by /api/claim-idea to verify that the claimer is the original anonymous submitter.';

comment on column public.ideas.claim_token is
  'Carried across from draft_pitches.claim_token at judgment-persist time. Nulled out on successful claim. NULL on legacy rows and on submissions that were authenticated to begin with.';
