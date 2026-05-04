-- pitch-pit · idempotency keys for /api/score
--
-- Lets the client send `Idempotency-Key: <uuid>` so retries (network failure,
-- double-click, etc.) don't double-charge Anthropic and don't double-insert
-- ideas. The server caches (key → idea_id); a duplicate POST with the same
-- key returns the cached idea instead of re-scoring.

create table if not exists public.idempotency_keys (
  key text primary key,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idempotency_keys_created_at_idx
  on public.idempotency_keys (created_at);

-- Service-role only — browser never reads/writes this table.
alter table public.idempotency_keys enable row level security;
-- (intentionally no policies — RLS-locked, only the admin client has access)
