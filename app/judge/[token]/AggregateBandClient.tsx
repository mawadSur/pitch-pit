"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState, useTransition } from "react";
import { Trophy, Check } from "lucide-react";
import type { JudgeId } from "@/lib/judges";
import type { JudgePanel } from "@/lib/judges/persist-judgment";

// Final aggregate verdict band — appears after all three judges resolve.
// Big avg score on the left, per-judge breakdown + status pill on the right.
export function AggregateBandClient({
  avg,
  panel,
  ideaId,
  canClaim = false,
  judgesMeta = [],
}: {
  avg: number | null;
  panel: JudgePanel | null;
  ideaId?: string | null;
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
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-[var(--scene-gold)]/30 bg-gradient-to-r from-[var(--scene-gold)]/[0.08] via-transparent to-[var(--scene-gold)]/[0.08] p-6 backdrop-blur-md sm:p-8"
    >
      {/* ambient gold blob */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-[var(--scene-gold)]/[0.08] blur-3xl"
        animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.15, 1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative grid items-center gap-6 sm:grid-cols-[auto_1fr]">
        <ScoreCounter avg={avg} />

        <div className="flex flex-col gap-3 sm:items-start">
          <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
            consensus · final score
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {buildRecommended && (
              <span className="scene-mono inline-flex items-center rounded-full bg-[var(--scene-gold)]/15 px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.32em] text-[var(--scene-gold)]">
                build queue
              </span>
            )}
            {ideaId && (
              <Link
                href={`/idea/${ideaId}`}
                className="scene-mono inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.32em] text-white/85 transition hover:border-white/30 hover:text-white"
              >
                open idea page →
              </Link>
            )}
            {canClaim && ideaId && <ClaimButton ideaId={ideaId} />}
          </div>

          <ul className="scene-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] uppercase tracking-[0.16em] text-white/55">
            {judgesMeta.map((j, i) => (
              <li key={j.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-white/20">·</span>}
                <span>{j.name}</span>
                <span className="text-white/85 tabular-nums">
                  {panel[j.id]?.score ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
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
        setError(e instanceof Error ? e.message : "Claim failed");
      }
    });
  }

  if (done) {
    return (
      <span className="scene-mono inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.32em] text-emerald-300">
        <Check className="h-3 w-3" aria-hidden /> claimed
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={claim}
        disabled={pending}
        className="scene-mono inline-flex items-center gap-1.5 rounded-full bg-[var(--scene-gold)] px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.32em] text-black transition hover:bg-[var(--scene-gold)]/90 disabled:opacity-60"
      >
        <Trophy className="h-3 w-3" aria-hidden />
        {pending ? "claiming…" : "claim this pitch"}
      </button>
      {error && <span className="text-[0.65rem] text-red-300">{error}</span>}
    </div>
  );
}

function ScoreCounter({ avg }: { avg: number }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => Math.round(v));
  const [, force] = useState(0);

  useEffect(() => {
    const controls = animate(mv, avg, {
      duration: 1.0,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = display.on("change", () => force((x) => x + 1));
    return () => {
      controls.stop();
      unsub();
    };
  }, [mv, display, avg]);

  return (
    <div className="flex items-baseline">
      <span
        className="scene-mono text-[5rem] font-semibold leading-none tabular-nums text-[var(--scene-gold)] sm:text-[6rem]"
        style={{ textShadow: "0 0 32px rgba(255, 184, 0, 0.35)" }}
      >
        {String(display.get()).padStart(2, "0")}
      </span>
      <span className="ml-2 text-3xl text-white/40">/10</span>
    </div>
  );
}
