import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// DEPRECATED: ADMIN_PASSWORD env var is no longer used.
//
// /admin used to gate via HTTP Basic Auth (middleware + this helper read
// process.env.ADMIN_PASSWORD). As of migration 032 / this file, admin
// access is gated by:
//
//   1. A Supabase session cookie (middleware ensures the user is signed in,
//      else redirects to /login?next=/admin), AND
//   2. public.users.is_admin = true on the signed-in user (checked here
//      via requireAdmin() with the cookie-aware Supabase client).
//
// The ADMIN_PASSWORD env var can be removed from Vercel after this lands;
// nothing in the code reads it any more. Leaving the env var in place is
// harmless — it is simply ignored.
//
// IMPORTANT: This file is imported by Server Components and Server Actions
// (Node runtime). It must NOT be imported by middleware.ts — middleware
// runs on the Edge runtime where the Next cookies() helper used by
// lib/supabase/server.ts is not available in the same shape. Middleware
// does its own lightweight session-cookie check; the DB-backed is_admin
// check happens here, in the page/action layer.

/**
 * Look up whether a given user id has the admin bit set.
 *
 * Uses the cookie-aware server Supabase client (RLS-bound) — public.users
 * is publicly readable per migration 001, so this select works for any
 * signed-in caller. Returns false on any error (missing row, RLS denial,
 * Supabase outage) — fail closed.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return false;
    return data.is_admin === true;
  } catch {
    return false;
  }
}

/**
 * Gate for server-side admin code paths (admin page, admin server actions).
 *
 * Reads the current session via the cookie-aware Supabase client, confirms
 * the user is signed in, then checks public.users.is_admin. Returns the
 * Supabase auth User on success, or null on any failure — the caller decides
 * how to respond (redirect to /login, render 403, return {error}, etc.).
 *
 * Why two-step (auth then DB): getUser() validates the session JWT against
 * Supabase. is_admin then confirms the privilege bit. Either step failing
 * means "not an admin", and we don't want to leak which one failed.
 */
export async function requireAdmin(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    const admin = await isAdmin(user.id);
    if (!admin) return null;
    return user;
  } catch {
    return null;
  }
}
