-- pitch-pit · initial schema

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- updated_at helper
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- users (profile mirror of auth.users)
-- ─────────────────────────────────────────────────────────────
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Public can read profiles"
  on public.users for select
  using (true);

create policy "Users can insert their own profile"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.users for update
  to authenticated
  using (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────
-- ideas — tributes offered to the arena
-- ─────────────────────────────────────────────────────────────
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  pitch text not null check (char_length(pitch) between 100 and 1500),
  handle text,
  score smallint check (score between 1 and 10),
  verdict text,
  strengths text[] not null default '{}',
  concerns text[] not null default '{}',
  reasoning text,
  build_recommended boolean not null default false,
  status text not null default 'submitted'
    check (status in ('submitted', 'scored', 'queued', 'building', 'built', 'rejected', 'failed')),
  mvp_url text,
  screenshot_url text,
  linkedin_comment_url text,
  linkedin_post_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ideas_score_idx on public.ideas (score desc nulls last);
create index ideas_status_idx on public.ideas (status);
create index ideas_created_at_idx on public.ideas (created_at desc);
create index ideas_build_recommended_idx on public.ideas (build_recommended) where build_recommended = true;

create trigger ideas_set_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();

alter table public.ideas enable row level security;

-- Anyone can read scored (and downstream) ideas — the arena is public
create policy "Scored ideas are public"
  on public.ideas for select
  using (status in ('scored', 'queued', 'building', 'built'));

-- Owners can read their own submissions regardless of status
create policy "Owners can read their own ideas"
  on public.ideas for select
  to authenticated
  using (auth.uid() = user_id);

-- Authenticated users can insert (server route uses service-role and bypasses RLS for anonymous submissions)
create policy "Authenticated users can insert ideas"
  on public.ideas for insert
  to authenticated
  with check (auth.uid() = user_id or user_id is null);

-- ─────────────────────────────────────────────────────────────
-- build_queue — MVPs awaiting / in-progress / shipped
-- ─────────────────────────────────────────────────────────────
create table public.build_queue (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null unique references public.ideas(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'in_progress', 'complete', 'failed')),
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  mvp_url text,
  repo_url text,
  notes text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index build_queue_status_idx on public.build_queue (status);
create index build_queue_idea_idx on public.build_queue (idea_id);

create trigger build_queue_set_updated_at
  before update on public.build_queue
  for each row execute function public.set_updated_at();

alter table public.build_queue enable row level security;

-- Public can view the queue — the arena is transparent
create policy "Build queue is public"
  on public.build_queue for select
  using (true);

-- Inserts/updates only via service-role (no client policies)

-- ─────────────────────────────────────────────────────────────
-- Realtime — broadcast inserts/updates on ideas to subscribers
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.ideas;
alter publication supabase_realtime add table public.build_queue;
