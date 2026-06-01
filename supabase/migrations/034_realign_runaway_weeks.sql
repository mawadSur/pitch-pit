-- pitch-pit · 034 · one-time realignment of the runaway week cycle
--
-- Migration 033 stops `close_current_week()` from galloping forward, but
-- it can't undo the damage already done: by the time 033 lands, the cycle
-- had advanced ~2 weeks past the calendar. On 2026-05-31 the table looked
-- like:
--
--   #7 open    2026-06-13 -> 2026-06-20   ← open week starts 2 weeks ahead
--   #6 closed  2026-06-06 -> 2026-06-13   ← "closed" but window is future
--   #5 closed  2026-05-30 -> 2026-06-06   ← should be the OPEN week today
--   #4 closed  2026-05-23 -> 2026-05-30   ← legitimately ended
--   ...
--
-- This migration self-corrects regardless of the exact numbers:
--
--   1. Find the week whose [start_at, end_at) window contains now() — the
--      one that SHOULD be open.
--   2. Delete every LATER week, but ONLY if it has zero ideas attached.
--      A week holding submissions is never touched (guard against data
--      loss). Their (empty) week_results snapshots cascade-delete.
--   3. Reopen the now-containing week and drop any premature snapshot so
--      it re-freezes correctly when it actually closes.
--
-- Idempotent & environment-safe: on a healthy DB the now-containing week
-- is already open with no future weeks, so every step is a no-op. During
-- the Sat-end -> Tue-close "lame duck" gap no week contains now(), so it
-- leaves everything untouched.

do $$
declare
  correct_open public.weeks;
  later_week   public.weeks;
begin
  select * into correct_open
  from public.weeks
  where now() >= start_at and now() < end_at
  order by week_number desc
  limit 1;

  if correct_open.id is null then
    raise notice 'realign: no week window contains now(); leaving weeks untouched';
    return;
  end if;

  -- Delete only EMPTY future weeks. Never destroy a week with submissions.
  for later_week in
    select * from public.weeks
    where week_number > correct_open.week_number
    order by week_number desc
  loop
    if exists (select 1 from public.ideas where week_id = later_week.id) then
      raise notice 'realign: week % holds ideas — NOT deleting', later_week.week_number;
    else
      delete from public.week_results where week_id = later_week.id;
      delete from public.weeks where id = later_week.id;
      raise notice 'realign: deleted empty future week %', later_week.week_number;
    end if;
  end loop;

  -- Reopen the week that should be live, clearing its premature snapshot
  -- and any winner picked by the early close.
  delete from public.week_results where week_id = correct_open.id;
  update public.weeks
  set status = 'open', winner_idea_id = null
  where id = correct_open.id;

  raise notice 'realign: reopened week % (% .. %)',
    correct_open.week_number, correct_open.start_at, correct_open.end_at;
end $$;
