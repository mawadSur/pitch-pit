-- pitch-pit · 025 · per-week scoring + frozen week_results snapshots
--
-- This rewrites the scoring model and adds an immutable per-week
-- leaderboard snapshot. Three problems it solves:
--
--   1. Cross-week drift. The old formula (003 + 019) normalized the
--      community half by `max(vote_count)` across ALL visible ideas,
--      so a viral week-3 idea would silently re-deflate weeks 1 & 2.
--      New formula uses the idea's OWN week's total votes.
--
--   2. Single-vote inflation. Old formula gave 100% community share to
--      a 1-vote idea (its votes == max votes). New formula is a true
--      vote-share: 1 vote of 1 total = 100% of the community half;
--      1 vote of 5 total = 20%. Self-corrects without Bayesian smoothing.
--
--   3. Past-week leaderboards drifted forever. We now snapshot to a
--      `week_results` table at close, and freeze the per-idea score by
--      only recomputing ideas whose week is still 'open'. Voting on
--      closed-week ideas is blocked at the RLS layer.
--
-- New formula:
--   ai_part        = (score / 10) * 50              -- 0..50
--   community_part = (votes / week_total_votes) * 50  -- 0..50 (0 if no votes)
--   final_score    = round(ai_part + community_part)  -- 0..100
--
-- Examples (ai_score=10):
--   no votes anywhere this week:          50
--   1 vote, only voted idea this week:    100  (50 + 50)
--   1 vote, 2 votes total this week:       75  (50 + 25)
--   1 vote, 10 votes total this week:      55  (50 + 5)
--
-- Examples (ai_score=8):
--   no votes:                              40
--   3 votes of 5 total this week:          70  (40 + 30)
--   3 votes of 30 total this week:         45  (40 + 5)
--
-- Idempotency: `create or replace` for functions; `if not exists` for
-- table; `do $$` block backfills snapshots for any already-closed weeks
-- and recomputes the open week under the new formula.

-- ─────────────────────────────────────────────────────────────
-- week_results: immutable snapshot of a week's leaderboard at close
-- ─────────────────────────────────────────────────────────────
create table if not exists public.week_results (
  week_id uuid not null references public.weeks(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  rank integer not null,
  final_score smallint not null,
  ai_score smallint not null,
  vote_count integer not null,
  snapshotted_at timestamptz not null default now(),
  primary key (week_id, idea_id)
);

create index if not exists week_results_week_rank_idx
  on public.week_results (week_id, rank);

alter table public.week_results enable row level security;

drop policy if exists "Week results are public" on public.week_results;
create policy "Week results are public"
  on public.week_results for select
  using (true);

-- ─────────────────────────────────────────────────────────────
-- compute_week_final_scores(week_id) — applies the new per-week
-- formula to every visible idea in the given week.
-- ─────────────────────────────────────────────────────────────
create or replace function public.compute_week_final_scores(target_week_id uuid)
returns void
language plpgsql
as $$
declare
  total_week_votes integer;
begin
  if target_week_id is null then return; end if;

  select coalesce(sum(vote_count), 0)::integer
    into total_week_votes
  from public.ideas
  where week_id = target_week_id
    and status in ('scored', 'queued', 'building', 'built');

  update public.ideas
  set final_score = case
    when score is null then null
    when total_week_votes = 0 then
      -- AI-only: community half is 0, score capped at 50.
      round(score::numeric / 10 * 50)::smallint
    else
      round(
        (score::numeric / 10) * 50
        + (coalesce(vote_count, 0)::numeric / total_week_votes::numeric) * 50
      )::smallint
  end
  where week_id = target_week_id
    and status in ('scored', 'queued', 'building', 'built');
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- recompute_all_final_scores: live recompute for the open week only.
-- Closed-week ideas are frozen — never touched after snapshot.
-- This is what the existing votes/ideas triggers call.
-- ─────────────────────────────────────────────────────────────
create or replace function public.recompute_all_final_scores()
returns void
language plpgsql
as $$
declare
  open_week_id uuid;
begin
  select id into open_week_id
  from public.weeks
  where status = 'open'
  order by week_number desc
  limit 1;

  if open_week_id is null then return; end if;

  perform public.compute_week_final_scores(open_week_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- close_current_week: snapshot → mark closed → open next week.
-- The `for update` lock serializes concurrent close attempts.
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

-- ─────────────────────────────────────────────────────────────
-- Block voting on closed-week ideas. Past leaderboards stay frozen.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can vote (not self)" on public.votes;
drop policy if exists "Authenticated users can vote (not self, open week only)" on public.votes;

create policy "Authenticated users can vote (not self, open week only)"
  on public.votes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.ideas
      where ideas.id = votes.idea_id
        and ideas.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.ideas
      join public.weeks on weeks.id = ideas.week_id
      where ideas.id = votes.idea_id
        and weeks.status = 'open'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Backfill: recompute every week under the new formula, then snapshot
-- already-closed weeks so /leaderboard?week=N renders immediately.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  w public.weeks;
begin
  for w in select * from public.weeks loop
    perform public.compute_week_final_scores(w.id);
  end loop;

  for w in select * from public.weeks where status = 'closed' loop
    insert into public.week_results (week_id, idea_id, rank, final_score, ai_score, vote_count)
    select
      w.id,
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
    where week_id = w.id
      and final_score is not null
      and status in ('scored', 'queued', 'building', 'built')
    on conflict (week_id, idea_id) do nothing;
  end loop;
end $$;
