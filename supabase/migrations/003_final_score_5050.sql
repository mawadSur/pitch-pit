-- pitch-pit · final_score = 50% AI + 50% community vote (normalized 0-100)
--
-- Formula:
--   ai_normalized   = ai_score * 10            -- (ai_score is 1-10, scale to 0-100)
--   vote_normalized = vote_count / max(vote_count) * 100   -- per-week-or-global top
--   final_score     = round(0.5 * ai_normalized + 0.5 * vote_normalized)
--
-- The cached `final_score` column is recomputed by triggers whenever:
--   • a vote is cast or retracted          (changes vote_normalized for everyone)
--   • an idea is inserted/scored/restatused (changes the contributor's AI score)
--
-- Recomputation is global (one UPDATE that touches all rows) because a vote
-- on the top idea moves the normalization denominator for every row.

-- ─────────────────────────────────────────────────────────────
-- Cached final_score column
-- ─────────────────────────────────────────────────────────────
alter table public.ideas
  add column if not exists final_score smallint;

create index if not exists ideas_final_score_idx
  on public.ideas (final_score desc nulls last);

-- ─────────────────────────────────────────────────────────────
-- Recompute every idea's final_score from current state
-- ─────────────────────────────────────────────────────────────
create or replace function public.recompute_all_final_scores()
returns void
language plpgsql
as $$
declare
  max_votes integer;
begin
  -- Top vote count among visible ideas (greatest 1 to avoid div-by-zero)
  select greatest(coalesce(max(vote_count), 0), 1)
    into max_votes
  from public.ideas
  where status in ('scored', 'queued', 'building', 'built');

  update public.ideas
  set final_score = case
    when score is null then null
    else (
      0.5 * (score * 10)
      + 0.5 * (coalesce(vote_count, 0)::numeric / max_votes::numeric * 100)
    )::smallint
  end;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Trigger function — calls the bulk recompute
--
-- Triggers are configured AFTER on the relevant columns only, so they
-- never recurse on the recompute's own UPDATE (which only writes
-- final_score, not score/status/vote_count).
-- ─────────────────────────────────────────────────────────────
create or replace function public.trigger_recompute_finals()
returns trigger
language plpgsql
as $$
begin
  perform public.recompute_all_final_scores();
  return null;  -- AFTER STATEMENT trigger doesn't need a row return
end;
$$;

-- Vote insert/delete shifts the denominator for everyone
drop trigger if exists votes_recompute_finals_insert on public.votes;
create trigger votes_recompute_finals_insert
  after insert on public.votes
  for each statement execute function public.trigger_recompute_finals();

drop trigger if exists votes_recompute_finals_delete on public.votes;
create trigger votes_recompute_finals_delete
  after delete on public.votes
  for each statement execute function public.trigger_recompute_finals();

-- Idea AI-score changes (admin re-runs scoring, fresh submission, etc.)
drop trigger if exists ideas_recompute_finals on public.ideas;
create trigger ideas_recompute_finals
  after insert or update of score, status, vote_count on public.ideas
  for each statement execute function public.trigger_recompute_finals();

-- ─────────────────────────────────────────────────────────────
-- Initial backfill — compute final_score for everything that exists
-- ─────────────────────────────────────────────────────────────
select public.recompute_all_final_scores();
