"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { Lock, AlertTriangle } from "lucide-react";
import type { JudgeMeta } from "@/lib/judges";
import type { ScoreResult } from "@/lib/score-schema";

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
      style={{
        boxShadow: result
          ? "0 0 0 0 rgba(255, 184, 0, 0)"
          : undefined,
      }}
    >
      {/* gold flash on reveal — subtle box-shadow keyframe */}
      {result && <GoldFlash />}

      <header className="flex items-start justify-between">
        <div className="relative h-24 w-24 overflow-hidden rounded-full ring-1 ring-white/15">
          <Image
            src={judge.portrait}
            alt=""
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>
        {result && (
          <ScoreNumber score={result.score} />
        )}
      </header>

      <div className="mt-5">
        <h3 className="text-lg font-semibold text-white">{judge.name}</h3>
        <p className="scene-mono mt-1 text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
          {judge.role}
        </p>
      </div>

      {errored && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[13px] text-white/70">
          <AlertTriangle className="h-4 w-4 text-[var(--scene-gold)]" aria-hidden />
          <span>Could not reach this judge. Refresh to try again.</span>
        </div>
      )}

      {result && (
        <>
          <p className="mt-6 text-[15px] italic leading-snug text-white/85 line-clamp-3">
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
              <p className="mt-5 text-[13px] leading-relaxed text-white/70">
                {result.reasoning}
              </p>
            </div>

            {!isSignedIn && (
              <>
                {/* fade mask */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#0a0a0a]" />
                {/* gentle inline lock badge — anchors the eye */}
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
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--scene-gold)]/40 bg-[var(--scene-gold)]/[0.08] px-4 py-2 text-[13px] font-medium text-[var(--scene-gold)] transition hover:bg-[var(--scene-gold)]/[0.16]"
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

function ScoreNumber({ score }: { score: number }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => Math.round(v));
  const [, force] = useState(0);

  useEffect(() => {
    const controls = animate(mv, score, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = display.on("change", () => force((x) => x + 1));
    return () => {
      controls.stop();
      unsub();
    };
  }, [mv, display, score]);

  return (
    <div className="flex items-baseline">
      <span
        className="scene-mono text-[3.25rem] font-semibold leading-none tabular-nums text-[var(--scene-gold)]"
        style={{ textShadow: "0 0 18px rgba(255, 184, 0, 0.25)" }}
      >
        {String(display.get()).padStart(2, "0")}
      </span>
      <span className="ml-1 text-2xl text-white/40">/10</span>
    </div>
  );
}

function GoldFlash() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-2xl"
      initial={{ boxShadow: "0 0 0 1px rgba(255, 184, 0, 0.6) inset, 0 0 24px rgba(255, 184, 0, 0.3)" }}
      animate={{ boxShadow: "0 0 0 1px rgba(255, 184, 0, 0) inset, 0 0 0 rgba(255, 184, 0, 0)" }}
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
      <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-white/85">
        {items.map((item, i) => (
          <li key={i} className="pl-3 -indent-3">
            <span className={accent ? "text-[var(--scene-gold)]/70" : "text-white/35"}>
              ·{" "}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
