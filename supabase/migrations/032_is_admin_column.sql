-- pitch-pit · move /admin from HTTP Basic Auth to Supabase magic-link auth.
--
-- Adds an `is_admin` flag on public.users. Server code (middleware +
-- requireAdmin() helper) reads this via the cookie-aware Supabase client
-- and gates the /admin route + every admin server action on it.
--
-- Bootstrap is intentionally manual (see commented-out template at the
-- bottom of this file) so the column ships at default `false` and the
-- operator explicitly grants their own admin bit via the SQL editor.
-- This prevents the migration from silently elevating any user.

-- ─────────────────────────────────────────────────────────────
-- Column
-- ─────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists is_admin boolean not null default false;

-- Sparse partial index — admin lookups are rare and the table is
-- small, but a `where is_admin = true` filter index keeps "list admins"
-- O(matches) even as the users table grows, and costs ~nothing because
-- the index only stores rows where the predicate is true.
create index if not exists users_is_admin_idx
  on public.users (is_admin)
  where is_admin = true;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
-- The existing "Public can read profiles" policy from 001_init.sql
-- selects every column on public.users including the new is_admin flag.
-- This is acceptable: knowing *who* is an admin is not a secret, and
-- the privileged action surface is gated server-side anyway. Leaking
-- the flag client-side would matter only if it conferred capability,
-- which it does not — every admin write goes through requireAdmin()
-- on the server, which re-queries the DB with the user's session.
--
-- We intentionally do NOT add a separate column-level grant or hide
-- is_admin from anon — the simplest invariant ("public.users is fully
-- public, capability lives server-side") is easier to reason about
-- and audit than a per-column visibility split.
--
-- We DO want to ensure no client can ever set the flag. The existing
-- insert/update policies are scoped `with check (auth.uid() = id)` and
-- to the `authenticated` role, but neither restricts which columns the
-- update statement may touch. Tighten that here: keep self-update of
-- handle/display_name/avatar_url, but block any change to is_admin
-- from the client. Admin promotion only happens via the service role
-- (or a SQL editor session, which runs as `postgres`).

drop policy if exists "Users can update their own profile" on public.users;

create policy "Users can update their own profile"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Block client-side toggles of the admin bit. `is_admin` must equal
    -- its prior value on every authenticated update. Postgres exposes
    -- the prior row inside `with check` via no syntax — but since we
    -- can't reference OLD here, we forbid `true` outright. A client
    -- update that sets is_admin=false is allowed (no-op for non-admins,
    -- and a legitimate admin demotion path if a real admin ever wanted
    -- to drop their own bit), but a client update that sets is_admin=true
    -- is rejected. Promotion paths are service-role only.
    and is_admin = false
  );

-- ─────────────────────────────────────────────────────────────
-- Bootstrap template
-- ─────────────────────────────────────────────────────────────
-- After this migration is applied, mark yourself admin via the
-- Supabase SQL editor. Public.users has no email column — emails live
-- on auth.users — so we join through auth.users to find the right id.
-- Uncomment and adjust the email, then run once:
--
-- update public.users
--    set is_admin = true
--  where id = (select id from auth.users where email = 'mawad10101@gmail.com');
--
-- Verify with:
--
-- select u.id, au.email, u.is_admin
--   from public.users u
--   join auth.users au on au.id = u.id
--  where u.is_admin = true;
