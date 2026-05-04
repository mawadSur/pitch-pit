-- pitch-pit · voting

-- ─────────────────────────────────────────────────────────────
-- vote_count cached on ideas (denormalized for fast leaderboard)
-- ─────────────────────────────────────────────────────────────
alter table public.ideas
  add column if not exists vote_count integer not null default 0;

create index if not exists ideas_vote_count_idx
  on public.ideas (vote_count desc);

-- ─────────────────────────────────────────────────────────────
-- votes table — one row per (user, idea)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- one vote per user per idea
  unique (user_id, idea_id)
);

create index if not exists votes_idea_idx on public.votes (idea_id);
create index if not exists votes_user_idx on public.votes (user_id);

-- ─────────────────────────────────────────────────────────────
-- RLS — anyone can read votes; only authenticated can insert;
-- nobody can vote for their own idea.
-- ─────────────────────────────────────────────────────────────
alter table public.votes enable row level security;

create policy "Votes are public"
  on public.votes for select
  using (true);

create policy "Authenticated users can vote (not self)"
  on public.votes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.ideas
      where ideas.id = votes.idea_id
        and ideas.user_id = auth.uid()
    )
  );

create policy "Users can retract their own vote"
  on public.votes for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- vote_count auto-updated by triggers on votes
-- ─────────────────────────────────────────────────────────────
create or replace function public.bump_vote_count()
returns trigger
language plpgsql
security definer
as $$
begin
  if (tg_op = 'INSERT') then
    update public.ideas
      set vote_count = vote_count + 1,
          updated_at = now()
      where id = new.idea_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.ideas
      set vote_count = greatest(vote_count - 1, 0),
          updated_at = now()
      where id = old.idea_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger votes_bump_count_after_insert
  after insert on public.votes
  for each row execute function public.bump_vote_count();

create trigger votes_bump_count_after_delete
  after delete on public.votes
  for each row execute function public.bump_vote_count();

-- ─────────────────────────────────────────────────────────────
-- realtime — broadcast vote changes
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.votes;
