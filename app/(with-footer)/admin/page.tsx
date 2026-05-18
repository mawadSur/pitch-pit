import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminClient, type AdminIdea } from "@/components/admin/AdminClient";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import "@/app/scene.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SELECT =
  "id,title,pitch,handle,score,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,screenshot_url,created_at,updated_at";

async function fetchSets() {
  try {
    const supabase = createAdminClient();

    const pendingP = supabase
      .from("ideas")
      .select(SELECT)
      .gte("score", 8)
      .eq("status", "scored")
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    const queuedP = supabase
      .from("ideas")
      .select(SELECT)
      .in("status", ["queued", "building"])
      .order("updated_at", { ascending: false })
      .limit(50);

    const completedP = supabase
      .from("ideas")
      .select(SELECT)
      .eq("status", "built")
      .order("updated_at", { ascending: false })
      .limit(50);

    const [pending, queued, completed] = await Promise.all([
      pendingP,
      queuedP,
      completedP,
    ]);

    return {
      pending: (pending.data ?? []) as AdminIdea[],
      queued: (queued.data ?? []) as AdminIdea[],
      completed: (completed.data ?? []) as AdminIdea[],
      configured: true as const,
    };
  } catch (e) {
    return {
      pending: [] as AdminIdea[],
      queued: [] as AdminIdea[],
      completed: [] as AdminIdea[],
      configured: false as const,
      error: e instanceof Error ? e.message : "Supabase unavailable",
    };
  }
}

// Belt-and-suspenders: middleware.ts bounces anons to /login. This page
// then enforces the is_admin bit. If a signed-in non-admin slips past
// middleware (or hits the page via a stale build), they get a 403 here.
// Server actions in ./actions.ts run requireAdmin() independently so they
// can't be invoked out-of-band either.
function ForbiddenPage() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="scene relative isolate flex min-h-dvh items-center justify-center"
    >
      <div className="max-w-md px-6 text-center">
        <p className="scene-mono text-[0.65rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
          403
        </p>
        <h1 className="mt-3 text-2xl font-medium text-white">
          You are signed in, but not an admin.
        </h1>
        <p className="mt-4 text-sm text-white/60">
          If you should have access, ask an existing admin to set
          <code className="mx-1 rounded bg-white/10 px-1 py-0.5 scene-mono text-xs">
            users.is_admin = true
          </code>
          on your account.
        </p>
      </div>
    </main>
  );
}

export default async function AdminPage() {
  // Middleware bounces anon callers to /login. requireAdmin() then
  // enforces the is_admin bit DB-side. Either failure mode lands on
  // the 403 page below — we don't distinguish "signed in but not admin"
  // from "session expired between middleware and page render" because
  // neither should be a common path.
  const user = await requireAdmin();
  if (!user) return <ForbiddenPage />;

  const sets = await fetchSets();

  return (
    <>
      <MinimalistHeader />
      <main
        id="main"
        tabIndex={-1}
        className="scene relative isolate min-h-dvh overflow-hidden"
      >
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-8 lg:py-16">
          <header className="mb-10 flex items-baseline justify-between gap-4 border-b border-white/8 pb-5">
            <div>
              <p className="scene-mono text-[0.65rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
                Operator console
              </p>
              <h1 className="mt-2 text-2xl font-medium text-white sm:text-3xl">
                Admin
              </h1>
            </div>
            <span className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
              pending {sets.pending.length} · queue {sets.queued.length} · built{" "}
              {sets.completed.length}
            </span>
          </header>

          {!sets.configured && (
            <div className="mb-8 rounded-md border border-red-400/40 bg-red-500/10 px-4 py-3 scene-mono text-xs uppercase tracking-[0.25em] text-red-300">
              Supabase offline · {sets.error ?? "credentials missing"}
            </div>
          )}

          <AdminClient
            pending={sets.pending}
            queued={sets.queued}
            completed={sets.completed}
          />
        </div>
      </main>
    </>
  );
}
