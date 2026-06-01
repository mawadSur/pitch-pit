-- pitch-pit · 035 · private "secret sauce" details on draft pitches
--
-- T4 of the marketing plan: ease the #1 reservation (idea theft) by
-- letting a founder hand the judges context they DON'T want published —
-- the wedge, the unfair advantage, the bit they'd never post in public.
--
-- DESIGN — why this is safe:
--   • The column lives ONLY on draft_pitches, which is:
--       - deny-by-default RLS, owner-only SELECT (migration 010). Anonymous
--         drafts are unreadable by any browser session; signed-in owners can
--         read only their own row. The service-role admin client (judging)
--         is the sole reader.
--       - garbage-collected after 24h (prune_expired_drafts).
--   • It is fed into the AI judging prompt (lib/judges/*) to influence the
--     score, then DISCARDED. persist-judgment.ts builds the public `ideas`
--     row from an explicit column list that intentionally omits this field,
--     so the secret never reaches a publicly-readable table. There is no
--     code path that copies draft_pitches.private_details into ideas.
--
-- Length capped at 2000 chars (mirrors the zod schema in lib/score-schema.ts).
-- `if not exists` keeps the migration idempotent.

alter table public.draft_pitches
  add column if not exists private_details text
  constraint draft_pitches_private_details_len
  check (private_details is null or char_length(private_details) <= 2000);

comment on column public.draft_pitches.private_details is
  'Founder-supplied private context. Fed to the AI judges to influence the '
  'score, never copied to the public ideas row. Read only via the '
  'service-role admin client. GC''d with the draft after 24h.';
