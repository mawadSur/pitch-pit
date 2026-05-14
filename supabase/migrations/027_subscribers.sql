-- pitch-pit · email subscribers
--
-- Audience for the Sunday-evening countdown digest and the Monday-morning
-- winner announcement (steps 5+ of the 2026-05-13 roadmap). Anyone can
-- opt in from the homepage / leaderboard / built pages; we double-opt-in
-- via `opt_in_token` and provide an `unsub_token` for the unsubscribe
-- link in every email.
--
-- This table is admin-only — no RLS policies are added, so anon and
-- authenticated clients have zero access. The Next.js API routes use
-- the service-role client (createAdminClient) which bypasses RLS.

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'unsubscribed', 'bounced')),
  opt_in_token text not null unique,
  unsub_token text not null unique,
  source text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscribers_status_idx on public.subscribers(status);
create index if not exists subscribers_email_idx on public.subscribers(lower(email));

alter table public.subscribers enable row level security;
-- No policies on purpose: anon + authenticated have no read/write
-- access. Service role (server-side) bypasses RLS for admin reads.
