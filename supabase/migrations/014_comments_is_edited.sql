-- pitch-pit · 014 · is_edited column on comments
--
-- Replaces the client-side hack that compared updated_at vs created_at
-- with a >1s tolerance to detect "this comment was edited." That heuristic
-- false-positives whenever a trigger touches updated_at without a body
-- change (e.g., a future re-targeting / soft-delete pass) and produces a
-- visible "edited" tag the user didn't actually trigger.
--
-- Storing the flag as a boolean column makes the badge unambiguous and
-- removes the hack. Trigger sets it true ONLY when the body actually
-- changed during an UPDATE — no body change means no edited mark.
--
-- Idempotent: column add and trigger create both use IF NOT EXISTS /
-- create-or-replace patterns. Backfill is unnecessary — pre-existing
-- rows default to false, which matches reality (we have no way to
-- retroactively know which ones were edited).

alter table public.comments
  add column if not exists is_edited boolean not null default false;

-- Trigger function: flip is_edited only when body actually changes.
-- Touching updated_at via the existing comments_touch_updated_at trigger
-- doesn't count.
create or replace function public.mark_comment_edited()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body then
    new.is_edited := true;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_mark_edited on public.comments;
create trigger comments_mark_edited
  before update on public.comments
  for each row execute function public.mark_comment_edited();

comment on column public.comments.is_edited is
  'True if the body has been edited at least once since insert. Set automatically by the comments_mark_edited trigger when body changes.';
