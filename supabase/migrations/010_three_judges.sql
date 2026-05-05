-- pitch-pit · 010 · three judges + draft pitches
--
-- Adds the infrastructure for the three-judge deliberation flow:
--   1. draft_pitches: a short-lived, unauth-capable holding table for a
--      user's pitch between submit and the streaming /judge/[draftId] page.
--      Allows the soft-gate flow where anonymous users still get evaluated.
--      Old drafts get garbage-collected by the cleanup function.
--   2. ideas.judge_scores: jsonb holding the per-judge ScoreResult shape
--      keyed by judge id ("gstack" | "vee" | "robbins").
--      The top-level score column becomes the rounded average of the
--      three so the existing final_score trigger keeps working unchanged.

-- ─── draft_pitches ────────────────────────────────────────────────────
create table if not exists public.draft_pitches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  -- The opaque secret carried in the URL. Random 32-char hex generated
  -- server-side. Anyone who has the link can read the draft (it's their
  -- own pitch on the way to evaluation). 24h TTL.
  access_token text not null unique,
  title text not null check (char_length(title) between 1 and 80),
  pitch text not null check (char_length(pitch) between 60 and 1500),
  handle text,
  -- Cache of the per-judge ScoreResult keyed by judge id. Populated as
  -- each judge resolves so a page refresh doesn't re-run the Anthropic
  -- calls. Cleared when the row expires.
  judge_results jsonb not null default '{}'::jsonb,
  -- Once the three judges have rendered, the row points at the persisted
  -- ideas row. Drafts that never resolve (user closed the tab) just expire.
  resolved_idea_id uuid references public.ideas(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists draft_pitches_access_token_idx
  on public.draft_pitches (access_token);
create index if not exists draft_pitches_user_id_idx
  on public.draft_pitches (user_id) where user_id is not null;
create index if not exists draft_pitches_expires_at_idx
  on public.draft_pitches (expires_at);

-- RLS: drafts are read via the service-role admin client only. The
-- /judge/[draftId] page is server-rendered and does the access_token
-- lookup server-side, so we never hand the row to a browser session
-- directly. Lock down to deny-by-default.
alter table public.draft_pitches enable row level security;

create policy "Owners can read their own drafts"
  on public.draft_pitches for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policies — those go through the admin client.

-- Garbage collection: a function that prunes drafts older than 24h.
-- Called from the score route opportunistically; can also be wired to
-- pg_cron if/when we want a scheduled sweep.
create or replace function public.prune_expired_drafts()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.draft_pitches where expires_at < now();
$$;

-- ─── ideas.judge_scores ───────────────────────────────────────────────
-- Holds the structured per-judge breakdown. Shape:
--   {
--     "gstack":  {score, verdict, strengths, concerns, reasoning, build_recommended},
--     "vee":     {...},
--     "robbins": {...}
--   }
-- Keys may be missing during partial states (a judge errored), in which
-- case the API tries to fill the gap on next request.
alter table public.ideas
  add column if not exists judge_scores jsonb;

-- Index for filtering / future analytics. GIN over the jsonb gets us
-- containment queries for free.
create index if not exists ideas_judge_scores_gin_idx
  on public.ideas using gin (judge_scores);

comment on column public.ideas.judge_scores is
  'Per-judge ScoreResult keyed by judge id (gstack|vee|robbins). The top-level score column is the rounded average of the three judges.';

comment on column public.ideas.score is
  'Average of the three judges (1-10), rounded to integer. Drives final_score via trigger.';
