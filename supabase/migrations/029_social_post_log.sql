-- pitch-pit · social_post_log
--
-- Forensics + idempotency ledger for the social automation crons
-- (post-countdown, post-leader, post-winner). One row per attempted
-- post — succeeded or failed — so we always know what went out the
-- door and can short-circuit retries on already-posted weeks.
--
-- Why a second table?  `social_posts` (migration 016) is a thin
-- (channel, event_key) idempotency record used by the existing post-leader
-- cron, which keys per-date and would silently double-post across a week
-- if used alone here. `social_post_log` is the structured ledger:
--   - template:    which cron wrote it ('countdown' | 'leader' | 'winner')
--   - week_id:     which open week it's for — the natural idempotency key
--                  for post-winner and post-countdown (one tweet per week)
--   - idea_id:     denormalised so leader/winner rows are auditable
--                  without a join back to the (mutable) weeks table
--   - external_id: the tweet id returned by X (null on failure)
--   - body:        the actual text we posted, for forensics + replay
--   - status:      'posted' | 'failed' — failed rows are intentional so an
--                  operator can see X outages without grepping logs
--
-- channel uses a check constraint instead of an enum so adding bluesky /
-- mastodon later is a pure migration (no enum type rewrite).

create table if not exists public.social_post_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('x')),
  template text not null check (template in ('countdown', 'leader', 'winner')),
  week_id uuid references public.weeks(id) on delete set null,
  idea_id uuid references public.ideas(id) on delete set null,
  external_id text,
  body text not null,
  status text not null check (status in ('posted', 'failed')),
  error text,
  posted_at timestamptz not null default now()
);

create index if not exists social_post_log_lookup_idx
  on public.social_post_log (channel, template, week_id);

create index if not exists social_post_log_posted_at_idx
  on public.social_post_log (posted_at desc);

alter table public.social_post_log enable row level security;
-- No policies — service-role only (server-side cron).
