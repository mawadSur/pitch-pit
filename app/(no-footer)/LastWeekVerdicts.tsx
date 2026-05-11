"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SectionKicker } from "./_section-helpers";
import type { VerdictCard } from "./types";

// Up to 3 cards from scored+ ideas, ordered by final_score desc. Pulls
// the title, verdict (one-line quote), final_score, and a slugged link
// for SEO. Section omits itself entirely when no scored ideas exist
// (the parent HomeScene gates the render — see verdicts.length > 0).
export function LastWeekVerdicts({ verdicts }: { verdicts: VerdictCard[] }) {
  return (
    <section
      aria-labelledby="last-week-heading"
      className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-28 sm:px-10 sm:py-32"
    >
      <div className="mx-auto max-w-5xl">
        <SectionKicker>Last week&rsquo;s verdicts</SectionKicker>
        <h2
          id="last-week-heading"
          className="mt-4 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          What the judges said.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          One-line takes from the highest-scoring pitches so far. Click
          through for the full rubric and reasoning.
        </p>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {verdicts.map((v, i) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-8% 0px" }}
              transition={{ duration: 0.45, delay: 0.06 * i }}
              className="scene-card group transition-colors hover:border-[var(--scene-gold)]/45"
            >
              <Link
                href={v.href}
                className="block px-6 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-base font-medium leading-snug text-white group-hover:text-[var(--scene-gold-bright)] sm:text-lg">
                    {v.title}
                  </h3>
                  <span
                    className="scene-mono flex-shrink-0 text-2xl font-semibold tabular-nums leading-none text-[var(--scene-gold-bright)]"
                    aria-label={`Final score ${v.finalScore} of 100`}
                  >
                    {v.finalScore}
                  </span>
                </div>
                {v.verdict && (
                  <p className="mt-4 text-sm leading-relaxed text-white/72">
                    &ldquo;{v.verdict}&rdquo;
                  </p>
                )}
                <p className="scene-mono mt-5 inline-flex items-center gap-1 text-[0.55rem] uppercase tracking-[0.32em] text-white/55 group-hover:text-[var(--scene-gold)]">
                  Read the full verdict
                  <span aria-hidden>→</span>
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
