import { Suspense } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { notFound, redirect } from "next/navigation";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { JUDGES, type JudgeId } from "@/lib/judges";
import { loadDraftByToken } from "@/lib/judges/persist-judgment";
import { renderJudgmentCached } from "@/lib/judges/cached-render";
import { JudgeCard } from "./JudgeCard";
import { DeliberatingCard } from "./DeliberatingCard";
import { AggregateBand } from "./AggregateBand";
import { PitchSpecs } from "./PitchSpecs";
import { SoftGateCTA } from "./SoftGateCTA";
import { MotionWrapper } from "./MotionWrapper";
import "@/app/scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Three judges in parallel; each Anthropic call runs 5–15s. Bounded by
// the slowest judge ≈ 20s with headroom. Pro plan default page timeout
// is 60s; setting explicitly so a future Hobby downgrade fails loudly.
export const maxDuration = 60;

export const metadata = {
  title: "The judges deliberate — pitch-pit",
  // Transient deliberation surface — pre-commit pitch content is visible
  // here before the user claims it. Keep search engines out.
  robots: { index: false, follow: false },
};

export default async function JudgeRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await loadDraftByToken(token);
  if (lookup.status === "missing") notFound();
  if (lookup.status === "expired") {
    // Draft TTL elapsed (24h). If it had already resolved into an ideas
    // row, the user can still see their judgment at /idea/[id]. Otherwise
    // the deliberation never completed and the link is dead — 404.
    // Note: we don't append the SEO slug here because the title isn't in
    // scope for an expired draft. The idea page will 301 to the slugged
    // canonical on the next request.
    if (lookup.resolvedIdeaId) redirect(`/idea/${lookup.resolvedIdeaId}`);
    notFound();
  }
  const { draft } = lookup;

  // Detect signed-in state up front so the soft-gate can render server-side.
  let userId: string | null = null;
  try {
    const cookieClient = await createCookieClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    /* anon */
  }
  const isSignedIn = !!userId;

  // Kick off all three judge promises in parallel. Each Suspense boundary
  // below awaits its own promise — React streams them as they resolve.
  // The aggregate band awaits Promise.all of all three to compute the
  // average and persist the ideas row.
  //
  // image_urls is normalized to [] by loadDraftByToken when the column
  // is missing (pre-migration-015 fallback path), so passing it through
  // here is safe even on a stale schema.
  const images = draft.image_urls ?? [];
  // Private "secret sauce" (migration 035) flows into every judge's prompt
  // to influence the score. It is never rendered in PitchSpecs and never
  // persisted to the ideas row — judging is the only thing that sees it.
  const priv = draft.private_details ?? null;
  const promises: Record<JudgeId, Promise<import("@/lib/score-schema").ScoreResult>> =
    {
      gstack: renderJudgmentCached(draft.id, "gstack", draft.title, draft.pitch, images, priv),
      vee: renderJudgmentCached(draft.id, "vee", draft.title, draft.pitch, images, priv),
      robbins: renderJudgmentCached(draft.id, "robbins", draft.title, draft.pitch, images, priv),
    };

  return (
    <div
      className={`scene min-h-screen ${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ background: "var(--scene-bg)" }}
    >
      {/* Film grain overlay — matches the cinematic treatment on /idea/[id]
          so entering the judge route doesn't feel like leaving the brand. */}
      <div aria-hidden className="scene-grain" />
      <MinimalistHeader />

      <MotionWrapper>
        <main
          id="main"
          tabIndex={-1}
          className="relative mx-auto max-w-6xl px-4 pt-28 pb-24 sm:px-6 lg:px-8 focus:outline-none"
        >
          <header className="mb-8">
            <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
              ↘ Deliberation in progress
            </p>
            <h1 className="scene-display mt-3 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl">
              Three judges. One pitch.
            </h1>
            <Link
              href="/"
              className="scene-mono mt-4 inline-flex items-center py-2 text-[0.65rem] uppercase tracking-[0.32em] text-white/55 transition-colors hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
            >
              ← New pitch
            </Link>
          </header>

          {/* aggregate verdict band — top-of-fold */}
          <Suspense fallback={<AggregateBand.Pending />}>
            <AggregateBand
              draft={draft}
              promises={promises}
              currentUserId={userId}
            />
          </Suspense>

          <div className="mt-10 grid gap-6 lg:grid-cols-[20rem_1fr] lg:gap-10">
            {/* sticky pitch specs sidebar */}
            <PitchSpecs
              title={draft.title}
              pitch={draft.pitch}
              handle={draft.handle}
            />

            {/* three judge cards — each in its own Suspense boundary */}
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {JUDGES.map((j, idx) => (
                <Suspense
                  key={j.id}
                  fallback={<DeliberatingCard judge={j} index={idx} />}
                >
                  <JudgeCard
                    judge={j}
                    index={idx}
                    promise={promises[j.id]}
                    isSignedIn={isSignedIn}
                    token={token}
                  />
                </Suspense>
              ))}
            </div>
          </div>

          {!isSignedIn && (
            <div className="mt-10">
              <SoftGateCTA token={token} />
            </div>
          )}
        </main>
      </MotionWrapper>
    </div>
  );
}
