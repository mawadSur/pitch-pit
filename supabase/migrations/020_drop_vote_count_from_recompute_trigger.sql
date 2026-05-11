-- pitch-pit · 020 · drop vote_count from ideas_recompute_finals trigger (Critical-3)
--
-- Bug: every vote ran the full-table recompute TWICE.
--
-- Trace:
--   1. POST /api/vote inserts a row into public.votes.
--   2. The row-level trigger `votes_bump_count_after_insert` (002_votes.sql)
--      fires `bump_vote_count()`, which does
--        UPDATE public.ideas SET vote_count = vote_count + 1 WHERE id = ...
--   3. That UPDATE matches the column list of the statement-level trigger
--      `ideas_recompute_finals` (003_final_score_5050.sql, currently
--      `after insert or update of score, status, vote_count on public.ideas`),
--      so `trigger_recompute_finals()` fires and walks every visible row
--      via `recompute_all_final_scores()` — an O(n) UPDATE.
--   4. SEPARATELY, the statement-level trigger
--      `votes_recompute_finals_insert` on the votes table itself
--      (same migration) ALSO fires `trigger_recompute_finals()` — another
--      O(n) UPDATE on ideas.
--
-- Result: at n = 10k ideas, two ~500ms full-table UPDATEs per vote.
-- Vote latency 1-2s, WAL churn starves Realtime subscribers.
--
-- Fix: drop `vote_count` from the OF list of `ideas_recompute_finals`.
-- The recompute on vote changes is still triggered from the votes table
-- by the dedicated `votes_recompute_finals_insert` /
-- `votes_recompute_finals_delete` triggers — that path is intentional
-- and stays. What we are killing is the cascade-fired duplicate.
--
-- After this migration, the ideas-side trigger only fires on real
-- `score` / `status` transitions (admin re-scores, judge submits,
-- status promotion). `vote_count` changes still recompute — exactly
-- once — via the votes-side triggers.
--
-- Why not a materialized view or pg_cron debounce? Those are the
-- longer-term path. Ship the one-line ALTER first; revisit once the
-- recompute itself becomes the bottleneck.
--
-- Idempotency: `drop trigger if exists` + `create trigger` is safe to
-- re-run. The trigger function `trigger_recompute_finals()` is left
-- untouched (it is still referenced by the votes-side triggers).
-- A trailing one-shot `select recompute_all_final_scores()` is NOT
-- needed: the cached final_score values are identical whether the
-- recompute ran once or twice per vote, so there is no backfill.

drop trigger if exists ideas_recompute_finals on public.ideas;

create trigger ideas_recompute_finals
  after insert or update of score, status on public.ideas
  for each statement execute function public.trigger_recompute_finals();
