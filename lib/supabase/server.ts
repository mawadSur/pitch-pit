import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Async because Next 16's cookies() now returns a Promise. Every call
// site must await createClient(). The supabase ssr client itself is
// constructed synchronously after the cookie store resolves; only
// initialization is async.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component context — setAll is unavailable. Middleware refreshes the session.
          }
        },
      },
    },
  );
}
