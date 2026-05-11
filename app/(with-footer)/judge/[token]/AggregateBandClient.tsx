"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useState, useTransition } from "react";
import { Trophy, Check } from "lucide-react";
import type { JudgeId } from "@/lib/judges";
import type { JudgePanel } from "@/lib/judges/persist-judgment";
import { titleToSlug } from "@/lib/slug";

// Final aggregate verdict band — appears after all three judges resolve.
// Cinema-wide treatment: full-bleed letterboxing (black bars top/bottom)
// flanking a center band with a Fraunces tabular numeral that fills the
// frame. The synthesis row sits beside the score with the per-judge
// breakdown chips and status pills.
export function AggregateBandClient({
  avg,
  panel,
  ideaId,
  ideaTitle,
  canClaim = false,
  judgesMeta = [],
}: {
  avg: number | null;
  panel: JudgePanel | null;
  ideaId?: string | null;
  // Title is needed to build the slugged /idea/<uuid>/<slug> link.
  // Optional so the "consensus unavailable" branch can render without
  // any idea metadata at all.
  ideaTitle?: string;
  canClaim?: boolean;
  judgesMeta?: { id: JudgeId; name: string }[];
}) {
  if (avg === null || panel === null) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
          consensus unavailable
        </p>
      </div>
    );
  }

  const buildRecommended = avg >= 7;

  return (
    <motion.section
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      // Escape the parent's max-w-6xl with negative margins so the band
      // reads as a true wide-shot. Sized via 100vw with viewport-unit
      // math so the bars hit the actual edges of the screen.
      className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen"
    >
      {/* top letterbox bar */}
      <div aria-hidden className="h-3 bg-black" />

      <div className="relative overflow-hidden border-y border-[var(--scene-gold)]/20 bg-gradient-to-r from-[var(--scene-gold)]/[0.06] via-transparent to-[var(--scene-gold)]/[0.06]">
        {/* ambient gold blob */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[var(--scene-gold)]/[0.08] blur-3xl"
          animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.15, 1] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:flex-row lg:items-center lg:gap-12 lg:px-8 lg:py-14">
          <ScoreCounter avg={avg} />

          <div className="flex flex-col gap-3 sm:items-start">
            <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
              consensus · final score
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {buildRecommended && (
                <span className="scene-display inline-flex h-11 items-center rounded-full bg-[var(--scene-gold)]/15 px-4 text-sm font-medium uppercase tracking-[0.18em] text-[var(--scene-gold)]">
                  build queue
                </span>
              )}
              {ideaId && (() => {
                // Derive the slug client-side from the title we were
                // handed by the server component. Empty slug → bare
                // /idea/<uuid> (page won't redirect-loop in that case).
                const slug = ideaTitle ? titleToSlug(ideaTitle) : "";
                const href = slug
                  ? `/idea/${ideaId}/${slug}`
                  : `/idea/${ideaId}`;
                return (
                  <Link
                    href={href}
                    className="scene-display inline-flex h-11 items-center rounded-full border border-white/15 px-4 text-sm font-medium tracking-[0.02em] text-white/85 transition-all hover:border-[var(--scene-gold)]/55 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
                  >
                    Open idea page →
                  </Link>
                );
              })()}
              {canClaim && ideaId && <ClaimButton ideaId={ideaId} />}
            </div>

            <ul className="scene-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] uppercase tracking-[0.16em] text-white/55">
              {judgesMeta.map((j, i) => (
                <li key={j.id} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span aria-hidden className="text-white/30">
                      ·
                    </span>
                  )}
                  <span>{j.name}</span>
                  <span className="text-white/85 tabular-nums">
                    {panel[j.id]?.score ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* bottom letterbox bar */}
      <div aria-hidden className="h-3 bg-black" />
    </motion.section>
  );
}

function ClaimButton({ ideaId }: { ideaId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function claim() {
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/claim-idea", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Claim failed");
        }
        setDone(true);
        // Refresh server data so canClaim flips to false on next render.
        router.refresh();
      } catch (e) {
        Sentry.captureException(e, {
          tags: { surface: "claim-button", phase: "client-fetch" },
          extra: { ideaId },
        });
        setError(e instanceof Error ? e.message : "Claim failed");
      }
    });
  }

  // Parent <motion.section role="status" aria-live="polite"> covers
  // announcement; no inner aria-live to avoid double-announce.
  if (done) {
    return (
      <span className="scene-mono inline-flex h-11 items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 text-[0.65rem] font-medium uppercase tracking-[0.32em] text-emerald-300">
        <Check className="h-3 w-3" aria-hidden /> pitch claimed
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={claim}
        disabled={pending}
        className="scene-mono inline-flex h-11 items-center gap-1.5 rounded-full bg-[var(--scene-gold)] px-4 text-[0.65rem] font-medium uppercase tracking-[0.32em] text-black transition-all hover:bg-[var(--scene-gold)]/90 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]"
      >
        <Trophy className="h-3 w-3" aria-hidden />
        {pending ? "claiming…" : "claim this pitch"}
      </button>
      {error && (
        <span
          role="alert"
          className="scene-mono text-[0.65rem] uppercase tracking-[0.16em] text-red-300"
        >
          {error}
        </span>
      )}
    </div>
  );
}

function ScoreCounter({ avg }: { avg: number }) {
  const reduce = useReducedMotion();
  // Snap straight to the final value when reduced-motion is requested.
  // `useMotionValue` + `animate()` bypasses the page-level `MotionConfig`,
  // so we gate the count-up explicitly here.
  const mv = useMotionValue(reduce ? avg : 0);
  const display = useTransform(mv, (v) =>
    String(Math.round(v)).padStart(2, "0"),
  );

  useEffect(() => {
    if (reduce) {
      mv.set(avg);
      return;
    }
    const controls = animate(mv, avg, {
      duration: 1.0,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [mv, avg, reduce]);

  return (
    <div className="flex items-baseline">
      <motion.span
        // Fraunces tabular numeral — drop dramatically on small screens so
        // 220px doesn't blow past the viewport. Tabular-nums in
        // `.scene-numeral` keeps width steady through the 0→avg
        // transition so the surrounding layout doesn't reflow per tick.
        className="scene-numeral scene-foil text-[120px] text-[var(--scene-gold)] sm:text-[180px] lg:text-[220px]"
        style={{ textShadow: "0 0 48px rgba(255, 184, 0, 0.35)" }}
      >
        {display}
      </motion.span>
      <span className="ml-3 text-3xl tabular-nums text-white/45 sm:text-5xl">
        /10
      </span>
    </div>
  );
}
