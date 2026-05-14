-- pitch-pit · cron schedule fix: align with "Mon midnight EST" tagline
--
-- The original migration 005 scheduled close_current_week() at
-- Saturday 04:00 UTC, which is Friday 24:00 EDT — "Friday midnight"
-- in colloquial usage. Product copy (homepage, /rules, tagline) says
-- the pit closes "Monday at midnight EST", and vercel.json already
-- schedules the HTTP cron at Tue 05:05 UTC. This migration moves the
-- pg_cron job to match.
--
-- DST caveat: this is hardcoded to EST (UTC-5). During EDT (mid-March
-- through early November) the job fires at 01:00 ET — one hour after
-- "Mon midnight" by local time. When Supabase ships pg_cron 1.5+ with
-- per-job timezone support, replace this with a timezone-aware
-- schedule (`cron.timezone = 'America/New_York'`).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Tear down the old Fri-midnight schedule from migration 005.
    if exists (
      select 1 from cron.job where jobname = 'close-week-friday-midnight-et'
    ) then
      perform cron.unschedule('close-week-friday-midnight-et');
      raise notice 'Unscheduled close-week-friday-midnight-et';
    end if;

    -- Schedule the corrected Mon-midnight ET schedule. We fire one
    -- minute before vercel.json's `5 5 * * 2` so the DB-side close
    -- has finished by the time the Vercel HTTP cron arrives and looks
    -- for the closed week — the RPC is idempotent so this overlap is
    -- safe, but ordering avoids a redundant no-op call from Vercel.
    if not exists (
      select 1 from cron.job where jobname = 'close-week-monday-midnight-et'
    ) then
      perform cron.schedule(
        'close-week-monday-midnight-et',
        '4 5 * * 2',
        $job$select public.close_current_week();$job$
      );
      raise notice 'Scheduled close_current_week() for every Tuesday 05:04 UTC (Mon midnight EST)';
    else
      raise notice 'close-week-monday-midnight-et job already scheduled';
    end if;
  else
    raise notice 'pg_cron not enabled — schedule manually: cron.schedule(''close-week-monday-midnight-et'', ''4 5 * * 2'', ''select public.close_current_week();'')';
  end if;
end $$;
