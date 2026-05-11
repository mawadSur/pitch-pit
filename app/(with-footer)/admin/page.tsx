import { createAdminClient } from "@/lib/supabase/admin";
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

export default async function AdminPage() {
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
