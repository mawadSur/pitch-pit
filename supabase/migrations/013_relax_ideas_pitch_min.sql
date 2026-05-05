-- pitch-pit · 013 · align ideas.pitch min length with the rest of the system
--
-- The original 001_init.sql set ideas.pitch CHECK to between 100 and 1500.
-- Both submitSchema (lib/score-schema.ts) and draft_pitches.pitch (010)
-- accept 60–1500. Pitches 60–99 chars pass client + /api/draft + draft
-- staging, then violate ideas_pitch_check during persistJudgment in the
-- /judge/[token] server component, surfacing as a 500 to the user and a
-- "violates check constraint" Sentry error.
--
-- Relax the lower bound to 60 so the three writes agree.
-- Idempotent: drops the old constraint with `if exists`, recreates
-- under the same canonical name.

alter table public.ideas
  drop constraint if exists ideas_pitch_check;

alter table public.ideas
  add constraint ideas_pitch_check
  check (char_length(pitch) between 60 and 1500);
