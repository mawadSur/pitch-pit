"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { SectionKicker } from "./_section-helpers";

// Compact stats row reinforcing Panel 3's rules summary with more concrete
// numbers. Dense, scannable, pure data. The live counter strip at the
// top is fed from server-rendered Supabase counts so visitors see real
// activity (or honest "just opened" copy when the pit is brand-new).
//
// LiveCounter is co-located here rather than its own file because it's
// only ever rendered as a child of WeeklyStakes — splitting it further
// would add a chunk for ~30 lines of presentational code.
export function WeeklyStakes({
  pitchedThisSeason,
  built,
}: {
  pitchedThisSeason: number;
  built: number;
}) {
  const stakes = [
    { label: "Submissions / week", value: "2", note: "per signed-in user" },
    { label: "Voting window", value: "7d", note: "Sat 00:00 → Fri 23:59 EDT" },
    { label: "AI weight", value: "50%", note: "Sonnet 4.6, six dimensions" },
    { label: "Community weight", value: "50%", note: "1 vote / user / pitch" },
    { label: "Winners / week", value: "1", note: "highest final score" },
    { label: "Prize", value: "Free build", note: "MVP shipped under your name" },
  ];

  return (
    <section
      aria-labelledby="stakes-heading"
      className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-28 sm:px-10 sm:py-32"
    >
      <div className="mx-auto max-w-5xl">
        <SectionKicker>This week&rsquo;s stakes</SectionKicker>
        <h2
          id="stakes-heading"
          className="mt-4 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          The numbers behind the pit.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          Plain rules, no fine print. Read them once and pitch.
        </p>

        <LiveCounter pitchedThisSeason={pitchedThisSeason} built={built} />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {stakes.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-8% 0px" }}
              transition={{ duration: 0.45, delay: 0.05 * i }}
              className="scene-card flex flex-col px-6 py-6"
            >
              <p className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-[var(--scene-gold)]">
                {s.label}
              </p>
              <p className="scene-mono mt-3 text-3xl font-semibold tabular-nums text-white sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-2 text-sm leading-snug text-white/55">
                {s.note}
              </p>
            </motion.div>
          ))}
        </div>

        <p className="scene-mono mt-10 text-xs uppercase tracking-[0.3em] text-white/55">
          Full rubric and edge cases on the{" "}
          <Link href="/rules" className="text-white/70 underline-offset-4 hover:text-white hover:underline">
            rules page →
          </Link>
        </p>
      </div>
    </section>
  );
}

function LiveCounter({
  pitchedThisSeason,
  built,
}: {
  pitchedThisSeason: number;
  built: number;
}) {
  // Honest fallback. The mission says: "If counts are zero, use copy
  // that doesn't lie ('Just opened' / 'Waiting for the first builds')
  // rather than emit '0 ideas pitched.'"
  const pitchedLabel =
    pitchedThisSeason > 0
      ? `${pitchedThisSeason.toLocaleString("en-US")} ${pitchedThisSeason === 1 ? "idea" : "ideas"} pitched this season`
      : "Just opened";
  const builtLabel =
    built > 0
      ? `${built.toLocaleString("en-US")} ${built === 1 ? "build" : "builds"} shipped`
      : "Waiting for the first builds";

  return (
    // No aria-live here: the counter values are SSR-fed and never mutate
    // on the client, so a polite live region only causes some screen
    // readers to re-announce the same string on focus or page load with
    // no actual change happening.
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.5 }}
      className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--scene-gold)] shadow-[0_0_10px_rgba(255,184,0,0.85)]"
      />
      <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-white/72">
        {pitchedLabel}
        <span aria-hidden className="mx-2 text-white/35">
          ·
        </span>
        {builtLabel}
      </p>
    </motion.div>
  );
}
