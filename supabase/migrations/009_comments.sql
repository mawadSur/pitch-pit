-- pitch-pit · 009 · comments on ideas
--
-- Public-readable comments. Anyone signed in can post; users own their
-- own edits and deletions. Realtime publication enabled so /idea/[id]
-- sees new comments live.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Composite index: lists are always (idea_id, ordered by created_at desc).
create index if not exists comments_idea_id_created_idx
  on public.comments (idea_id, created_at desc);
create index if not exists comments_user_id_idx
  on public.comments (user_id);

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.comments enable row level security;

create policy "Comments are public"
  on public.comments for select
  using (true);

create policy "Authenticated users can comment"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can edit their own comments"
  on public.comments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own comments"
  on public.comments for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─── updated_at maintenance ──────────────────────────────────────────
create or replace function public.touch_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists comments_touch_updated_at on public.comments;
create trigger comments_touch_updated_at
  before update on public.comments
  for each row execute function public.touch_comments_updated_at();

-- ─── realtime ────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.comments;
