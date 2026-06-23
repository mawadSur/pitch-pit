-- pitch-pit · vote referral attribution (Tactic 1)
--
-- Every shared idea link carries ?ref=<idea_id>. When a referred visitor
-- signs in and votes, the vote is attributed to the referring idea. This
-- is best-effort plumbing: safe to apply before or after the app code
-- ships, and idempotent so re-runs are harmless.

-- ─────────────────────────────────────────────────────────────
-- referrer_idea_id — the idea whose share link drove this vote.
-- ON DELETE SET NULL so deleting the referring idea doesn't cascade
-- away the (legitimate) vote it referred.
-- ─────────────────────────────────────────────────────────────
alter table public.votes
  add column if not exists referrer_idea_id uuid
    references public.ideas(id) on delete set null;

create index if not exists votes_referrer_idea_idx
  on public.votes (referrer_idea_id);

-- ─────────────────────────────────────────────────────────────
-- attribute_vote_referrer — called via supabase.rpc(...) right after a
-- toggle-ON vote. SECURITY DEFINER so it can write referrer_idea_id even
-- though the votes RLS only grants the voter INSERT/DELETE (not UPDATE).
-- Scoped to the caller's own row (user_id = auth.uid()) and write-once
-- (referrer_idea_id is null) so it can't be used to rewrite attribution.
-- ─────────────────────────────────────────────────────────────
create or replace function public.attribute_vote_referrer(
  p_idea_id uuid,
  p_ref uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No-op on a missing ref or a self-referral (sharing your own idea to
  -- yourself shouldn't credit it).
  if p_ref is null or p_ref = p_idea_id then
    return;
  end if;

  update public.votes
    set referrer_idea_id = p_ref
    where user_id = auth.uid()
      and idea_id = p_idea_id
      and referrer_idea_id is null;
end;
$$;

grant execute on function public.attribute_vote_referrer(uuid, uuid) to authenticated;
