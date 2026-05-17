-- pitch-pit · retention policy for log tables
--
-- Both `social_post_log` (migration 029) and `cron_heartbeats`
-- (migration 028) accumulate rows over time. `cron_heartbeats` is
-- keyed on `job_name` and stays bounded by job count (currently a
-- handful), so it is not a real growth risk — but `last_run_at` is
-- the natural retention column and a stale row for a removed job is
-- still noise. `social_post_log` grows ~3 rows/week per channel
-- (countdown, leader, winner) plus retries, which is small but
-- unbounded.
--
-- 90 days of retention is the chosen window:
--   - It comfortably covers a full quarterly review cycle, so the
--     "did the Tuesday post fire 6 weeks ago?" question is always
--     answerable without going to backups.
--   - It bounds growth at ~hundreds of rows for `social_post_log`
--     and ~dozens for `cron_heartbeats` — both trivially small.
--   - It is short enough that a deleted job's last heartbeat clears
--     out quickly, so the table reflects current ops state.
--
-- The function returns one row per cleaned table so the operator
-- (or a future observability dashboard) can see what was purged
-- without parsing logs. It is `security definer` so the pg_cron
-- runner — which executes as the cron extension's role — can
-- delete rows in `public.*` regardless of grant chain.
--
-- Note on `cron_heartbeats`: this table is upsert-on-job_name, so
-- a row's `last_run_at` advances on every run. A 90-day-old row
-- means the job hasn't fired in 90 days — almost certainly a
-- removed/renamed job. Purging it is the right call.

create or replace function public.purge_old_logs()
returns table(table_name text, deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_social_deleted bigint;
  v_heartbeat_deleted bigint;
begin
  delete from public.social_post_log
  where posted_at < now() - interval '90 days';
  get diagnostics v_social_deleted = row_count;

  delete from public.cron_heartbeats
  where last_run_at < now() - interval '90 days';
  get diagnostics v_heartbeat_deleted = row_count;

  return query
    select 'social_post_log'::text, v_social_deleted
    union all
    select 'cron_heartbeats'::text, v_heartbeat_deleted;
end;
$$;

revoke all on function public.purge_old_logs() from public;
grant execute on function public.purge_old_logs() to service_role;

-- Schedule weekly: Sunday 03:00 UTC. Quiet hour, far from the Tue
-- 05:04 UTC `close-week-monday-midnight-et` job (migration 026) and
-- the Vercel HTTP crons that fire around the week-close cycle.
-- Wrapped in a guarded do-block so this migration succeeds in
-- environments without pg_cron (local supabase start, CI), mirroring
-- the pattern from migration 026.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1 from cron.job where jobname = 'purge-old-logs-weekly'
    ) then
      perform cron.schedule(
        'purge-old-logs-weekly',
        '0 3 * * 0',
        $job$select public.purge_old_logs();$job$
      );
      raise notice 'Scheduled purge_old_logs() for every Sunday 03:00 UTC';
    else
      raise notice 'purge-old-logs-weekly job already scheduled';
    end if;
  else
    raise notice 'pg_cron not enabled — schedule manually: cron.schedule(''purge-old-logs-weekly'', ''0 3 * * 0'', ''select public.purge_old_logs();'')';
  end if;
exception
  when undefined_function then
    raise notice 'cron.schedule() not available — pg_cron not installed';
end $$;
