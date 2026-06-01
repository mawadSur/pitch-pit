-- pitch-pit · 033 · end_at guard for close_current_week()
--
-- THE BUG THIS FIXES
-- ──────────────────
-- `close_current_week()` (migrations 025/030) closes whatever week is
-- `status='open'` whenever it is called, with no check that the week's
-- window has actually ended. Two schedulers call it one minute apart
-- every Tuesday:
--
--   • pg_cron  `close-week-monday-midnight-et`  at Tue 05:04 UTC (mig 026)
--   • GitHub Actions `cron-close-week-and-build.yml` at Tue 05:05 UTC
--
-- The `for update` lock only serializes them — it does NOT make the
-- second call a no-op. The 05:04 call closes week N and opens N+1; the
-- 05:05 call then sees the freshly-opened N+1, passes the day-gate
-- (still Tue >=05:00), and closes IT too, opening N+2. Result: TWO weeks
-- close every Tuesday and the cycle gallops ahead of the calendar. By
-- 2026-05-31 the open week was #7 (dated 2026-06-13 → 06-20), ~2 weeks
-- into the future, with an empty "this week" leaderboard.
--
-- THE FIX
-- ───────
-- Refuse to close a week before its `end_at` has passed. This single
-- guard makes the function genuinely idempotent across the dual-fire
-- (the just-opened next week ends a week later, so the second call
-- returns immediately) AND prevents any early close from a misfire,
-- manual call, or scheduler drift.
--
-- The function is otherwise byte-identical to migration 030: same
-- day-gate, same snapshot, same winner pick, same next-week creation,
-- same `for update` lock. Only the leading `end_at` guard is new.

create or replace function public.close_current_week()
returns void
language plpgsql
security definer
as $$
declare
  open_week public.weeks;
  winner_id uuid;
begin
  -- Day-gate (migration 030): only fire on/after Mon midnight EST
  -- (= Tue 05:00 UTC). Belt-and-suspenders vs the scheduler.
  if not (extract(dow from (now() at time zone 'UTC'))::int = 2
          and extract(hour from (now() at time zone 'UTC'))::int >= 5) then
    raise notice 'close_current_week: refusing to fire outside Tue >=05:00 UTC';
    return;
  end if;

  select * into open_week
  from public.weeks
  where status = 'open'
  order by week_number desc
  limit 1
  for update;

  if open_week.id is null then return; end if;

  -- NEW (033): never close a week before its window actually ends. This
  -- neutralizes the Tue 05:04 + 05:05 double-fire — the second call sees
  -- the week the first just opened, whose end_at is a week away, and
  -- returns here instead of closing it. Also blocks any other early
  -- close (stray manual call, misconfigured cron, /admin button).
  if now() < open_week.end_at then
    raise notice 'close_current_week: week % not yet ended (now % < end_at %)',
      open_week.week_number, now(), open_week.end_at;
    return;
  end if;

  -- Refresh final_score values for this week one last time so the
  -- snapshot reflects the latest vote totals.
  perform public.compute_week_final_scores(open_week.id);

  -- Snapshot every visible idea in this week. Idempotent via on-conflict
  -- so re-running the cron doesn't error.
  insert into public.week_results (week_id, idea_id, rank, final_score, ai_score, vote_count)
  select
    open_week.id,
    id,
    row_number() over (
      order by final_score desc nulls last,
               score desc,
               vote_count desc,
               created_at asc
    ),
    coalesce(final_score, 0),
    coalesce(score, 0),
    coalesce(vote_count, 0)
  from public.ideas
  where week_id = open_week.id
    and final_score is not null
    and status in ('scored', 'queued', 'building', 'built')
  on conflict (week_id, idea_id) do update
  set rank = excluded.rank,
      final_score = excluded.final_score,
      ai_score = excluded.ai_score,
      vote_count = excluded.vote_count,
      snapshotted_at = now();

  -- Winner = rank 1 in the snapshot. Deterministic, no extra ORDER BY.
  select idea_id into winner_id
  from public.week_results
  where week_id = open_week.id
  order by rank asc
  limit 1;

  update public.weeks
  set status = 'closed',
      winner_idea_id = winner_id
  where id = open_week.id;

  insert into public.weeks (week_number, start_at, end_at)
  values (
    open_week.week_number + 1,
    open_week.end_at,
    open_week.end_at + interval '7 days'
  )
  on conflict (week_number) do nothing;
end;
$$;
