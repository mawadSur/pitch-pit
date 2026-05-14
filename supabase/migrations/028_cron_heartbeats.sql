-- pitch-pit · cron heartbeats
--
-- Observability table for cron jobs. Every successful run writes
-- (jobname, ts, ok); errors write (jobname, ts, error, msg). One
-- missed heartbeat past the expected interval is the trigger for
-- the alerting layer (lands when steps 4-8 of the roadmap do —
-- see [[ceo-review-may-2026-roadmap]] in auto-memory).
--
-- The table is keyed on job_name so the row count stays bounded
-- regardless of run history. For a longer audit trail, a separate
-- `cron_heartbeat_log` partitioned table can be added later.

create table if not exists public.cron_heartbeats (
  job_name text primary key,
  last_run_at timestamptz not null,
  last_status text not null check (last_status in ('ok', 'error')),
  last_error text,
  run_count bigint not null default 1,
  error_count bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cron_heartbeats enable row level security;
-- No policies — server-only access via service role.

-- Helper to upsert a heartbeat atomically (run_count / error_count
-- increment in a single statement, no read-modify-write race).
create or replace function public.record_cron_heartbeat(
  p_job_name text,
  p_status text,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cron_heartbeats (
    job_name, last_run_at, last_status, last_error, run_count, error_count
  ) values (
    p_job_name,
    now(),
    p_status,
    case when p_status = 'error' then p_error else null end,
    1,
    case when p_status = 'error' then 1 else 0 end
  )
  on conflict (job_name) do update set
    last_run_at  = excluded.last_run_at,
    last_status  = excluded.last_status,
    last_error   = excluded.last_error,
    run_count    = public.cron_heartbeats.run_count + 1,
    error_count  = public.cron_heartbeats.error_count
                  + case when excluded.last_status = 'error' then 1 else 0 end;
end;
$$;

revoke all on function public.record_cron_heartbeat(text, text, text) from public;
grant execute on function public.record_cron_heartbeat(text, text, text) to service_role;
