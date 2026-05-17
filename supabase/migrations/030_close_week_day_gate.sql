-- pitch-pit · 030 · day-gate guard for close_current_week()
--
-- The Postgres function `public.close_current_week()` (defined in
-- migration 025) is unconditional: if any week is `status='open'`, it
-- closes it. The protection that it only fires on Tue >=05:00 UTC
-- (= Mon midnight EST) lives entirely at the scheduler layer:
--
--   - pg_cron job `close-week-monday-midnight-et` at `4 5 * * 2`
--     (migration 026)
--   - GitHub Actions workflow `cron-close-week-and-build.yml` at
--     Tue 05:05 UTC, which calls the route that runs this RPC
--
-- A misconfigured cron entry, a stray manual `select close_current_week()`
-- in a psql shell, or someone hitting the route from `/admin` mid-week
-- would silently close the open week and snapshot a half-finished
-- contest. This migration adds a belt-and-suspenders day/time gate
-- inside the function itself so the schedule and the function agree.
--
-- The function is otherwise byte-identical to migration 025: same
-- snapshot, same winner pick, same next-week creation, same
-- `for update` lock semantics. Only the leading guard is new.
--
-- DST caveat: matches the scheduler's hardcoded EST (UTC-5) — see
-- migration 026's note about pg_cron 1.5+ per-job timezone support.
-- During EDT this guard fires one hour late by local time but still
-- correctly blocks every other day of the week.

create or replace function public.close_current_week()
returns void
language plpgsql
security definer
as $$
declare
  open_week public.weeks;
  winner_id uuid;
begin
  -- Belt-and-suspenders: refuse to close a week unless it's after Mon
  -- midnight EST (= Tue 05:00 UTC). The cron schedules already enforce
  -- this; the guard exists so a stray manual call or misconfigured
  -- scheduler can never close a week mid-cycle.
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
