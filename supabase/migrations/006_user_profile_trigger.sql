-- pitch-pit · auto-create public.users row on auth.users insert
--
-- Without this, an authenticated user who tries to submit an idea fails the
-- ideas.user_id → public.users(id) FK because no profile row exists. Standard
-- Supabase pattern — runs on every signup (Google OAuth, magic-link, etc).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, handle, display_name, avatar_url)
  values (
    new.id,
    -- Prefer Google's preferred_username, then local-part of email
    coalesce(
      new.raw_user_meta_data->>'preferred_username',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create profile rows for any auth.users that don't yet have one
insert into public.users (id, handle, display_name, avatar_url)
select
  u.id,
  coalesce(
    u.raw_user_meta_data->>'preferred_username',
    split_part(u.email, '@', 1)
  ),
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do nothing;
