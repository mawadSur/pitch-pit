-- pitch-pit · 016 · raise pitch length ceiling 1500 → 3500
--
-- Founders kept hitting the 1500-char wall on pitches that legitimately
-- needed more room (multi-paragraph traction stories, longer market
-- breakdowns). Schema validates min 60 / max 3500 in lib/score-schema.ts;
-- this brings the DB CHECK constraints in line so inserts above 1500
-- don't get bounced by the database after passing the API gate.
--
-- Idempotent: drops the old CHECK by name and re-adds with the wider
-- range. CHECK constraints in the previous migrations were named
-- automatically by Postgres; we drop by exact name as set in 010 and
-- 013, falling back to a no-op when the constraint name has drifted.

-- draft_pitches.pitch CHECK was set in 010_three_judges.sql at
-- "between 60 and 1500" — Postgres named it draft_pitches_pitch_check.
alter table public.draft_pitches
  drop constraint if exists draft_pitches_pitch_check;
alter table public.draft_pitches
  add constraint draft_pitches_pitch_check
  check (char_length(pitch) between 60 and 3500);

-- ideas.pitch CHECK was last set by 013_relax_ideas_pitch_min.sql at
-- "between 60 and 1500" — same auto-name pattern.
alter table public.ideas
  drop constraint if exists ideas_pitch_check;
alter table public.ideas
  add constraint ideas_pitch_check
  check (char_length(pitch) between 60 and 3500);

comment on constraint draft_pitches_pitch_check on public.draft_pitches is
  '60–3500 character bound mirrors lib/score-schema.ts SUBMIT_LIMITS.pitchMax';
comment on constraint ideas_pitch_check on public.ideas is
  '60–3500 character bound mirrors lib/score-schema.ts SUBMIT_LIMITS.pitchMax';
