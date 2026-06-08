-- pitch-pit · 036 · re-anchor the weekly cadence to the Tue 05:00 UTC boundary
--
-- THE BUG THIS FIXES
-- ──────────────────
-- The week windows and the close schedule disagree about when a week ends:
--
--   • Week windows end SATURDAY 04:00 UTC. This is inherited from the
--     original seed in migration 005 (`this_monday + interval '5 days 4
--     hours'` = Sat 04:00), and every subsequent week is `prev.end_at +
--     7 days`, so the Saturday boundary propagated forever.
--   • The close cron fires TUESDAY 05:05 UTC (GH Actions) / 05:04 (pg_cron,
--     migration 026), and the day-gate (030) + end_at guard (033) only let
--     a close happen on Tue >= 05:00 UTC after the window has ended.
--   • Product copy says the pit closes "Monday at midnight EST" = Tue 05:00
--     UTC.
--
-- Net effect: a week's window ends Saturday, but it isn't actually closed
-- until the following Tuesday. For ~3.2 days every week the "current" week
-- is already over yet still shows as `open` — a perpetual lame-duck gap. On
-- 2026-06-08 (a Monday) week #5's window had ended Sat 2026-06-06 but it was
-- still the open week, so /leaderboard's live board was stale and the next
-- close wouldn't fire until Tue 06-09.
--
-- THE FIX
-- ───────
-- Re-anchor the OPEN week to the canonical Tue 05:00 UTC → Tue 05:00 UTC
-- window that contains now(). Going forward the cadence self-perpetuates
-- correctly: close_current_week() opens each next week as `end_at + 7 days`,
-- so once the boundary lands on a Tuesday it stays on Tuesdays, and the
-- end_at guard (033) + day-gate (030) line up exactly with the schedule.
--
-- Past CLOSED weeks are left untouched — their windows are frozen history
-- and their week_results snapshots must not move. This leaves a one-time
-- cosmetic gap between the last closed week's end_at and the realigned open
-- week's start_at; that's harmless (ideas are assigned to the open week by
-- status, never by date — see assign_idea_to_current_week in migration 005).
--
-- Idempotent & safe: if the open week already sits on the correct Tuesday
-- window, every UPDATE is a no-op. Empty future weeks are deleted (data-loss
-- guard: a future week holding ideas is never touched). If no week is open
-- (the brief post-close instant), the migration leaves everything alone.

do $$
declare
  open_week    public.weeks;
  later_week   public.weeks;
  this_tue_5z  timestamptz;   -- this ISO-week's Tuesday 05:00 UTC
  cur_start    timestamptz;   -- canonical start of the window containing now()
  cur_end      timestamptz;
begin
  -- date_trunc('week') returns Monday 00:00 UTC; + 1d5h = Tuesday 05:00 UTC.
  this_tue_5z := date_trunc('week', (now() at time zone 'UTC')) at time zone 'UTC'
                 + interval '1 day 5 hours';

  -- If now() is before this week's Tuesday anchor, the live window started
  -- on the PREVIOUS Tuesday; otherwise it started on this Tuesday.
  if now() < this_tue_5z then
    cur_start := this_tue_5z - interval '7 days';
  else
    cur_start := this_tue_5z;
  end if;
  cur_end := cur_start + interval '7 days';

  select * into open_week
  from public.weeks
  where status = 'open'
  order by week_number desc
  limit 1
  for update;

  if open_week.id is null then
    raise notice 'realign-036: no open week; leaving weeks untouched';
    return;
  end if;

  -- Delete only EMPTY future weeks (any premature ones the runaway era may
  -- have left, or a stray manual insert). Never destroy a week with ideas.
  for later_week in
    select * from public.weeks
    where week_number > open_week.week_number
    order by week_number desc
  loop
    if exists (select 1 from public.ideas where week_id = later_week.id) then
      raise notice 'realign-036: week % holds ideas — NOT deleting', later_week.week_number;
    else
      delete from public.week_results where week_id = later_week.id;
      delete from public.weeks where id = later_week.id;
      raise notice 'realign-036: deleted empty future week %', later_week.week_number;
    end if;
  end loop;

  -- Re-anchor the open week onto the canonical Tuesday→Tuesday window.
  update public.weeks
  set start_at = cur_start,
      end_at   = cur_end
  where id = open_week.id;

  raise notice 'realign-036: open week % re-anchored to % .. %',
    open_week.week_number, cur_start, cur_end;
end $$;
