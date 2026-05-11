-- pitch-pit · 018 · 0-vote ideas use AI-only score, not 50/50 blend with 0
--
-- Symptom: leaderboard #1 read "AI 7/10 · 0 votes · final 35/100" — a
-- mathematically correct but socially catastrophic output of the prior
-- formula. With vote_count=0 the community half collapses to 0, halving
-- the AI score (7×10 = 70 → 0.5×70 + 0.5×0 = 35).
--
-- New rule:
--   - vote_count = 0    → final_score = round(score * 10)        -- AI-only, 0..100
--   - vote_count >= 1   → final_score = round(0.5*ai + 0.5*comm) -- existing blend
--
-- Why this is honest: a 0-vote idea has no community signal, so we don't
-- pretend it had a 0% vote share. The first vote tips the row into the
-- blended formula — at that point the community half carries real weight.
--
-- Future refinement (NOT implemented here): Bayesian smoothing where the
-- community weight scales with vote_count, e.g.
--   final = (ai*10*W_ai + vote_pct*100*W_comm(n)) / (W_ai + W_comm(n))
-- This is more accurate at low vote counts but adds a tunable curve and
-- a new edge to QA. Ship the simple cliff first; revisit if the 0/1
-- vote step proves jumpy in practice.
--
-- Recursion safety: same as 003/008 — the AFTER STATEMENT trigger on
-- ideas only fires on `score, status, vote_count` updates, never on
-- final_score itself. The bulk UPDATE inside this function only writes
-- final_score, so it cannot re-arm the trigger.
--
-- Idempotency: `create or replace function` swaps the body in place; the
-- existing trigger references the function by name and needs no
-- recreation. The trailing one-shot UPDATE backfills every visible idea
-- so existing 0-vote rows with stale final_score values get repaired
-- on deploy without waiting for a new vote.

create or replace function public.recompute_all_final_scores()
returns void
language plpgsql
as $$
declare
  max_votes integer;
begin
  -- Top vote count among visible ideas (greatest 1 to avoid div-by-zero).
  -- Note: 0-vote rows now skip the denominator entirely, but max_votes is
  -- still needed for the >=1-vote branch.
  select greatest(coalesce(max(vote_count), 0), 1)
    into max_votes
  from public.ideas
  where status in ('scored', 'queued', 'building', 'built');

  update public.ideas
  set final_score = case
    when score is null then null
    when coalesce(vote_count, 0) = 0 then
      -- AI-only: scale 0..10 → 0..100
      round(score::numeric * 10)::smallint
    else
      -- Blended 50/50: AI half + community half (normalized to top vote count)
      round(
        0.5 * (score::numeric * 10)
        + 0.5 * (coalesce(vote_count, 0)::numeric / max_votes::numeric * 100)
      )::smallint
  end
  where status in ('scored', 'queued', 'building', 'built');
end;
$$;

-- One-shot backfill so existing rows reflect the new formula immediately.
-- (The function above is what the triggers call; running it once here
-- repairs anything stale from the prior 003/008 era.)
select public.recompute_all_final_scores();
