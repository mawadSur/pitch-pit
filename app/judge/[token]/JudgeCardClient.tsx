"use client";

import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "framer-motion";
import { useEffect } from "react";
import { Lock, AlertTriangle } from "lucide-react";
import type { JudgeId, JudgeMeta } from "@/lib/judges";
import type { ScoreResult } from "@/lib/score-schema";

// Per-judge accent palette — each judge owns a distinct color so the
// three cards read as separate voices, not three gold copies. Gold is
// reserved for the gating UI (lock badges, the universal CTA fallback)
// so it keeps semantic weight as the "this matters" color.
//
// Accents resolve to scene-css tokens; fallback hex values match the
// bright-on-dark variants documented in the design review (oxblood-bright
// passes WCAG AA at ~6.5:1, verdigris-bright at ~9:1).
const JUDGE_ACCENTS: Record<JudgeId, {
  text: string;
  ring: string;
  shadow: string;
  flashShadow: string;
  ctaBg: string;
  ctaBgHover: string;
  ctaBorder: string;
}> = {
  gstack: {
    text: "text-[var(--scene-gold)]",
    ring: "ring-[var(--scene-gold)]/40",
    shadow: "0 0 18px rgba(255, 184, 0, 0.25)",
    flashShadow: "rgba(255, 184, 0, 0.6)",
    ctaBg: "bg-[var(--scene-gold)]/[0.08]",
    ctaBgHover: "hover:bg-[var(--scene-gold)]/[0.16]",
    ctaBorder: "border-[var(--scene-gold)]/40",
  },
  vee: {
    text: "text-[var(--scene-oxblood-bright)]",
    ring: "ring-[var(--scene-oxblood-bright)]/40",
    shadow: "0 0 18px rgba(181, 58, 77, 0.35)",
    flashShadow: "rgba(181, 58, 77, 0.6)",
    ctaBg: "bg-[var(--scene-oxblood-bright)]/[0.08]",
    ctaBgHover: "hover:bg-[var(--scene-oxblood-bright)]/[0.16]",
    ctaBorder: "border-[var(--scene-oxblood-bright)]/40",
  },
  robbins: {
    text: "text-[var(--scene-verdigris-bright)]",
    ring: "ring-[var(--scene-verdigris-bright)]/40",
    shadow: "0 0 18px rgba(136, 184, 156, 0.35)",
    flashShadow: "rgba(136, 184, 156, 0.6)",
    ctaBg: "bg-[var(--scene-verdigris-bright)]/[0.08]",
    ctaBgHover: "hover:bg-[var(--scene-verdigris-bright)]/[0.16]",
    ctaBorder: "border-[var(--scene-verdigris-bright)]/40",
  },
};

export function JudgeCardClient({
  judge,
  index,
  result,
  errored,
  isSignedIn,
  token,
}: {
  judge: JudgeMeta;
  index: number;
  result: ScoreResult | null;
  errored: boolean;
  isSignedIn: boolean;
  token: string;
}) {
  const loginHref = `/login?next=${encodeURIComponent(`/judge/${token}`)}`;
  const accent = JUDGE_ACCENTS[judge.id];
  return (
    <motion.article
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.45,
        ease: [0.16, 1, 0.3, 1],
        delay: index * 0.06,
      }}
      className="relative min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 backdrop-blur-md"
    >
      {/* accent flash on reveal — subtle box-shadow keyframe in this
          judge's accent color rather than universal gold. */}
      {result && <AccentFlash color={accent.flashShadow} />}

      <header className="flex items-start justify-between gap-4">
        {/* flex-shrink-0 keeps the portrait at 96×96 even when the
            adjacent ScoreNumber's render width pushes the row past
            its grid track — without it, flex's default min-width:auto
            squashes the circle into a slim sliver on narrow viewports. */}
        <div
          className={`relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-full ring-1 ${accent.ring}`}
        >
          <Image
            src={judge.portrait}
            alt=""
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>
        {result && (
          <ScoreNumber
            score={result.score}
            textClass={accent.text}
            shadow={accent.shadow}
          />
        )}
      </header>

      <div className="mt-5">
        <h3 className="text-lg font-semibold text-white">{judge.name}</h3>
        <p className="scene-mono mt-1 text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
          {judge.role}
        </p>
      </div>

      {errored && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-white/70">
          <AlertTriangle className="h-4 w-4 text-[var(--scene-gold)]" aria-hidden />
          <span>Could not reach this judge. Refresh to try again.</span>
        </div>
      )}

      {result && (
        <>
          <p className="scene-display-italic mt-6 text-xl leading-snug text-white/85 line-clamp-3 sm:text-2xl">
            “{result.verdict}”
          </p>

          {/* gated detail: strengths / concerns / reasoning */}
          <div className="relative mt-6">
            <div
              className={
                isSignedIn
                  ? ""
                  : "pointer-events-none select-none [filter:blur(6px)]"
              }
            >
              <Section label="Strengths" items={result.strengths} accent />
              <Section label="Concerns" items={result.concerns} />
              <p className="mt-5 text-sm leading-relaxed text-white/70">
                {result.reasoning}
              </p>
            </div>

            {!isSignedIn && (
              <>
                {/* fade mask */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#0a0a0a]" />
                {/* gentle inline lock badge — anchors the eye. Kept gold
                    deliberately: the lock is a gating affordance, not
                    judge identity. */}
                <div className="absolute right-0 top-0 flex items-center gap-1.5 rounded-full bg-[var(--scene-gold)]/10 px-2.5 py-1 text-[var(--scene-gold)] backdrop-blur-sm">
                  <Lock className="h-3 w-3" aria-hidden />
                  <span className="scene-mono text-[0.55rem] uppercase tracking-[0.16em]">
                    locked
                  </span>
                </div>
              </>
            )}
          </div>

          {!isSignedIn && (
            <Link
              href={loginHref}
              className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border ${accent.ctaBorder} ${accent.ctaBg} px-4 text-sm font-medium ${accent.text} transition-all ${accent.ctaBgHover} active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]`}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Sign in to read the full take
            </Link>
          )}
        </>
      )}
    </motion.article>
  );
}

function ScoreNumber({
  score,
  textClass,
  shadow,
}: {
  score: number;
  textClass: string;
  shadow: string;
}) {
  const reduce = useReducedMotion();
  // Snap to final value when reduced-motion is requested. `useMotionValue`
  // + `animate()` bypasses the page-level `MotionConfig` so we gate it
  // explicitly here.
  const mv = useMotionValue(reduce ? score : 0);
  const display = useTransform(mv, (v) =>
    String(Math.round(v)).padStart(2, "0"),
  );

  useEffect(() => {
    if (reduce) {
      mv.set(score);
      return;
    }
    const controls = animate(mv, score, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [mv, score, reduce]);

  return (
    <div className="flex items-baseline">
      <motion.span
        className={`scene-numeral scene-foil text-[88px] sm:text-[112px] ${textClass}`}
        style={{ textShadow: shadow }}
      >
        {display}
      </motion.span>
      <span className="ml-1 text-2xl tabular-nums text-white/55">/10</span>
    </div>
  );
}

function AccentFlash({ color }: { color: string }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-2xl"
      initial={{
        boxShadow: `0 0 0 1px ${color} inset, 0 0 24px ${color}`,
      }}
      animate={{
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0) inset, 0 0 0 rgba(0, 0, 0, 0)",
      }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    />
  );
}

function Section({
  label,
  items,
  accent = false,
}: {
  label: string;
  items: string[];
  accent?: boolean;
}) {
  return (
    <div className="mt-5">
      <p
        className={`scene-mono text-[0.65rem] uppercase tracking-[0.32em] ${
          accent ? "text-[var(--scene-gold)]/80" : "text-white/55"
        }`}
      >
        {label}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm leading-snug text-white/85">
        {items.map((item, i) => (
          <li key={i} className="pl-3 -indent-3">
            <span
              aria-hidden
              className={accent ? "text-[var(--scene-gold)]/70" : "text-white/55"}
            >
              ·{" "}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
