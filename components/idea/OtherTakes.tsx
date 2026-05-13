"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { JUDGES, type JudgeId } from "@/lib/judges";
import type { ScoreResult } from "@/lib/score-schema";

// Per-judge accent palette — matches the wax-seal treatment on the
// /judge/[token] cards (Gstack=cool gold, Vee=oxblood, Robbins=verdigris).
// The "other takes" cards on /idea/[id] adopt the same letterhead language
// so a viewer arriving from a shared link sees the same three voices.
const JUDGE_ACCENTS: Record<JudgeId, {
  rule: string;
  hairline: string;
  wax: string;
  text: string;
  shadow: string;
  stampBorder: string;
  stampHex: string;
}> = {
  gstack: {
    rule: "rgba(255, 209, 122, 0.7)",
    hairline: "rgba(255, 184, 0, 0.3)",
    wax: "linear-gradient(180deg, rgba(255, 209, 122, 0.04) 0%, rgba(255, 184, 0, 0.015) 100%)",
    text: "text-[var(--scene-gold-bright)]",
    shadow: "0 0 12px rgba(255, 184, 0, 0.3)",
    stampBorder: "border-[var(--scene-gold)]",
    stampHex: "rgba(255, 184, 0, 0.18)",
  },
  vee: {
    rule: "rgba(181, 58, 77, 0.7)",
    hairline: "rgba(181, 58, 77, 0.3)",
    wax: "linear-gradient(180deg, rgba(181, 58, 77, 0.045) 0%, rgba(123, 31, 43, 0.015) 100%)",
    text: "text-[var(--scene-oxblood-bright)]",
    shadow: "0 0 12px rgba(181, 58, 77, 0.4)",
    stampBorder: "border-[var(--scene-oxblood-bright)]",
    stampHex: "rgba(181, 58, 77, 0.18)",
  },
  robbins: {
    rule: "rgba(136, 184, 156, 0.7)",
    hairline: "rgba(136, 184, 156, 0.3)",
    wax: "linear-gradient(180deg, rgba(136, 184, 156, 0.045) 0%, rgba(91, 138, 110, 0.015) 100%)",
    text: "text-[var(--scene-verdigris-bright)]",
    shadow: "0 0 12px rgba(136, 184, 156, 0.4)",
    stampBorder: "border-[var(--scene-verdigris-bright)]",
    stampHex: "rgba(136, 184, 156, 0.18)",
  },
};

// "Other takes" panel for /idea/[id]. The page already shows the
// canonical (gstack) judge's verdict / strengths / concerns / reasoning
// at the top. This panel surfaces the OTHER two judges (Vee + Robbins)
// so a visitor arriving from a shared link sees the full three-judge
// deliberation rather than only the lead reviewer's take.
//
// Renders nothing if judge_scores is null or has fewer than 2 entries
// (legacy single-judge ideas, or partial-render edge cases).
export function OtherTakes({
  judgeScores,
  reasoningDelay = 0,
}: {
  judgeScores: Partial<Record<JudgeId, ScoreResult>> | null | undefined;
  /** Match the entrance staggering of the parent Reveal sections. */
  reasoningDelay?: number;
}) {
  if (!judgeScores) return null;

  // Show every judge EXCEPT gstack (gstack's full review already lives
  // at the top of the page as the canonical summary). If neither vee
  // nor robbins resolved, render nothing.
  const others = JUDGES.filter((j) => j.id !== "gstack" && judgeScores[j.id]);
  if (others.length === 0) return null;

  return (
    <motion.section
      id="other-takes"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: reasoningDelay }}
      className="mx-auto mt-10 max-w-3xl"
      aria-labelledby="other-takes-heading"
    >
      <p
        id="other-takes-heading"
        className="scene-mono mb-4 text-[0.65rem] uppercase tracking-[0.35em] text-white/55"
      >
        Other judges
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {others.map((judge, idx) => {
          const result = judgeScores[judge.id]!;
          const accent = JUDGE_ACCENTS[judge.id];
          return (
            <motion.article
              key={judge.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                delay: reasoningDelay + 0.1 + idx * 0.08,
              }}
              // Letterhead/wax-seal treatment matching /judge/[token].
              // No glass — replaced with a subtle wax-tint background and
              // accent-color double rules at top + bottom.
              className="relative overflow-hidden rounded-md p-5 pt-6 pb-7"
              style={{
                background: accent.wax,
                boxShadow:
                  "inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 16px 48px -28px rgba(0, 0, 0, 0.6)",
              }}
            >
              {/* top double-rule (heavy + hairline) */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[6px]"
                style={{
                  borderTop: `2px solid ${accent.rule}`,
                  borderBottom: `1px solid ${accent.hairline}`,
                }}
              />
              {/* bottom double-rule (hairline + heavy) */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[6px]"
                style={{
                  borderTop: `1px solid ${accent.hairline}`,
                  borderBottom: `2px solid ${accent.rule}`,
                }}
              />
              <header className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
                    <Image
                      src={judge.portrait}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    {/* Judge name in Fraunces — matches the /judge/[token]
                        letterhead voice. */}
                    <h3 className="scene-display text-lg font-semibold leading-none tracking-tight text-white">
                      {judge.name}
                    </h3>
                    <p className="scene-mono mt-1.5 truncate text-[0.55rem] uppercase tracking-[0.32em] text-white/55">
                      {judge.role}
                    </p>
                  </div>
                </div>
                {/* Notary-stamp score badge — mirrors the larger version
                    on /judge/[token] but at compact scale for the
                    "other takes" row. */}
                <div
                  className={`relative inline-flex h-14 w-14 -rotate-3 flex-col items-center justify-center rounded-full border-2 ${accent.stampBorder} flex-shrink-0`}
                  style={{
                    background: "rgba(0, 0, 0, 0.35)",
                    boxShadow: `inset 0 0 0 1px rgba(0, 0, 0, 0.4), inset 0 0 0 2px ${accent.stampHex}`,
                  }}
                >
                  <span
                    className={`scene-numeral text-[1.25rem] leading-none ${accent.text}`}
                    style={{ textShadow: accent.shadow }}
                  >
                    {String(result.score).padStart(2, "0")}
                  </span>
                  <span className="mt-0.5 font-mono text-[0.5rem] tabular-nums text-white/55">/10</span>
                </div>
              </header>

              <p className="scene-display-italic mt-4 text-base leading-snug text-white/85">
                &ldquo;{result.verdict}&rdquo;
              </p>

              {result.strengths.length > 0 && (
                <Section
                  label="Strengths"
                  items={result.strengths}
                  accent
                />
              )}
              {result.concerns.length > 0 && (
                <Section label="Concerns" items={result.concerns} />
              )}

              {result.reasoning && (
                <details className="mt-4 group">
                  <summary className="scene-mono inline-flex cursor-pointer list-none items-center py-1 text-[0.55rem] uppercase tracking-[0.32em] text-white/55 transition-colors hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]">
                    <span className="group-open:hidden">▸ Read reasoning</span>
                    <span className="hidden group-open:inline">▾ Hide reasoning</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-white/75">
                    {result.reasoning}
                  </p>
                </details>
              )}
            </motion.article>
          );
        })}
      </div>
    </motion.section>
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
    <div className="mt-4">
      <p
        className={`scene-mono text-[0.55rem] uppercase tracking-[0.32em] ${
          accent ? "text-[var(--scene-gold)]/80" : "text-white/55"
        }`}
      >
        {label}
      </p>
      <ul className="mt-1.5 space-y-1 text-sm leading-snug text-white/85">
        {items.map((item, i) => (
          <li key={i} className="pl-3 -indent-3">
            <span
              aria-hidden
              className={accent ? "text-[var(--scene-gold)]/70" : "text-white/45"}
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
