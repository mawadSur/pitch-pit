-- pitch-pit · 008 · fix recompute trigger UPDATE without WHERE
--
-- Symptom: every POST /api/score insert errored with
--   "Update requires a where clause"
-- Sentry caught it on the route; root cause was the AFTER INSERT trigger
-- on `ideas` calling `recompute_all_final_scores()`, which did:
--
--     update public.ideas set final_score = case ... end;
--
-- Supabase's project safeguard rejects unrestricted UPDATEs from any
-- caller — including triggers running in a PostgREST-initiated
-- transaction. The whole insert rolled back.
--
-- Fix: scope the recompute to ideas that are publicly visible (the same
-- set we count vote denominators over). Drafts and rejected ideas don't
-- have final_score anyway — the CASE returned null for unscored rows,
-- so this is semantically equivalent for those rows AND faster.

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
  end
  where status in ('scored', 'queued', 'building', 'built');
end;
$$;

-- Run once after the deploy lands so any rows that diverged during the
-- broken period get their final_score reconciled.
select public.recompute_all_final_scores();
