-- pitch-pit · weekly competition cycle
--
-- Adds a `weeks` table that defines the official competition windows,
-- a `week_id` FK on `ideas` so every submission belongs to a specific week,
-- a `close_current_week()` function that picks the winner + opens the next
-- week, and a pg_cron job that runs that function every Friday at midnight ET
-- (= Saturday 04:00 UTC during EDT).
--
-- Pre-req: pg_cron must be enabled. In Supabase:
--   Dashboard → Database → Extensions → pg_cron → Enable
-- If you see "permission denied to create extension" below, enable it from the
-- dashboard first then re-run this migration.

create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────────────────
-- weeks
-- ─────────────────────────────────────────────────────────────
create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  week_number integer unique not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'closed', 'built')),
  winner_idea_id uuid references public.ideas(id) on delete set null,
  created_at timestamptz not null default now()
);

create index weeks_status_idx on public.weeks(status);
create index weeks_week_number_idx on public.weeks(week_number desc);

alter table public.weeks enable row level security;

create policy "Weeks are public"
  on public.weeks for select
  using (true);

-- ─────────────────────────────────────────────────────────────
-- week_id FK on ideas
-- ─────────────────────────────────────────────────────────────
alter table public.ideas
  add column if not exists week_id uuid references public.weeks(id);

create index if not exists ideas_week_id_idx on public.ideas(week_id);

-- ─────────────────────────────────────────────────────────────
-- Seed week 1: this Monday 00:00 UTC → next Saturday 04:00 UTC
-- (Saturday 04:00 UTC = Friday end-of-day in EDT — matches the countdown)
-- ─────────────────────────────────────────────────────────────
do $$
declare
  this_monday timestamptz;
  this_saturday_4am timestamptz;
begin
  this_monday := date_trunc('week', now());
  this_saturday_4am := this_monday + interval '5 days 4 hours';

  insert into public.weeks (week_number, start_at, end_at)
  values (1, this_monday, this_saturday_4am)
  on conflict (week_number) do nothing;
end $$;

-- Backfill: assign existing ideas to week 1
update public.ideas
set week_id = (select id from public.weeks where week_number = 1)
where week_id is null;

-- ─────────────────────────────────────────────────────────────
-- Auto-assign new ideas to the current open week
-- ─────────────────────────────────────────────────────────────
create or replace function public.assign_idea_to_current_week()
returns trigger
language plpgsql
as $$
declare
  open_week_id uuid;
begin
  if new.week_id is null then
    select id into open_week_id
    from public.weeks
    where status = 'open'
    order by week_number desc
    limit 1;
    new.week_id := open_week_id;
  end if;
  return new;
end;
$$;

drop trigger if exists ideas_assign_week on public.ideas;
create trigger ideas_assign_week
  before insert on public.ideas
  for each row execute function public.assign_idea_to_current_week();

-- ─────────────────────────────────────────────────────────────
-- close_current_week: marks open week closed, picks the winner,
-- opens the next week. Idempotent — safe to call multiple times.
-- ─────────────────────────────────────────────────────────────
create or replace function public.close_current_week()
returns void
language plpgsql
security definer
as $$
declare
  open_week public.weeks;
  winner_id uuid;
begin
  select * into open_week
  from public.weeks
  where status = 'open'
  order by week_number desc
  limit 1;

  if open_week.id is null then
    return;
  end if;

  -- Winner: highest final_score, ties broken by votes then earliest submission
  select id into winner_id
  from public.ideas
  where week_id = open_week.id
    and final_score is not null
    and status in ('scored', 'queued', 'building', 'built')
  order by final_score desc nulls last,
           vote_count desc,
           created_at asc
  limit 1;

  update public.weeks
  set status = 'closed',
      winner_idea_id = winner_id
  where id = open_week.id;

  -- Next week starts where this one ended, runs 7 days
  insert into public.weeks (week_number, start_at, end_at)
  values (
    open_week.week_number + 1,
    open_week.end_at,
    open_week.end_at + interval '7 days'
  )
  on conflict (week_number) do nothing;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Cron schedule: every Saturday 04:00 UTC = Friday 24:00 EDT
-- (= Friday "midnight ET" in colloquial usage, currently EDT in May)
--
-- Uses pg_cron. If pg_cron isn't enabled in this project, the do-block
-- prints a notice and the migration still succeeds — schedule the job
-- manually after enabling the extension in the Supabase dashboard.
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1 from cron.job where jobname = 'close-week-friday-midnight-et'
    ) then
      perform cron.schedule(
        'close-week-friday-midnight-et',
        '0 4 * * 6',
        $job$select public.close_current_week();$job$
      );
      raise notice 'Scheduled close_current_week() for every Saturday 04:00 UTC';
    else
      raise notice 'close-week-friday-midnight-et job already scheduled';
    end if;
  else
    raise notice 'pg_cron not enabled — enable it in the Supabase dashboard then run: select cron.schedule(''close-week-friday-midnight-et'', ''0 4 * * 6'', ''select public.close_current_week();'');';
  end if;
end $$;
