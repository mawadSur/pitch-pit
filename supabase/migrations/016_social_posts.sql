-- pitch-pit · social_posts ledger
--
-- Idempotency table for marketing automation. Every auto-posted message
-- (winner tweets, new-submission posts, milestone tweets, etc.) writes a
-- row keyed by (channel, event_key) so we can never double-post for the
-- same event — even if a cron retries or a webhook fires twice.
--
-- channel:    'x', 'discord', 'bluesky', 'threads', etc.
-- event_key:  e.g. 'winner-week-7', 'new-idea-<uuid>', 'votes-25-<uuid>'
-- external_id: the platform's post id (tweet id, etc.) — useful for replies
-- payload:     what we actually posted, for audit + replay

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  event_key text not null,
  external_id text,
  payload jsonb,
  posted_at timestamptz not null default now(),
  unique (channel, event_key)
);

create index social_posts_channel_idx on public.social_posts(channel);
create index social_posts_posted_at_idx on public.social_posts(posted_at desc);

alter table public.social_posts enable row level security;
-- No public policies — service-role only (server-side cron + webhooks).
