"use client";

import { motion } from "framer-motion";
import { SectionKicker } from "./_section-helpers";

// Four-step explanation of the contest cycle. Numbered, staggered reveal,
// 2-column grid on tablet+, stacked on mobile. Loaded as a separate
// client chunk via next/dynamic from HomeScene; the bundle defers below
// the cinematic panels so the first paint doesn't ship this verbose copy.
export function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Submit your pitch",
      body: "60 to 3500 characters. Anyone can pitch — anonymous or signed in. Two submissions per week if you sign in; one IP-rate-limited slot if you don't.",
    },
    {
      n: 2,
      title: "Claude rates it",
      body: "Opus 4.7 evaluates your pitch against the YC office-hours rubric — demand, wedge, founder edge, feasibility, defensibility, distribution. Score 1–10 with strengths, concerns, and reasoning.",
    },
    {
      n: 3,
      title: "The community votes",
      body: "Every signed-in user gets one vote per pitch. Your final score is 50% AI + 50% community, normalized 0–100. Live realtime updates while voting is open.",
    },
    {
      n: 4,
      title: "Win the week",
      body: "The pit closes Monday at midnight EDT. The week's top final score gets built — for free, no equity, no strings — and we ship the live MVP under your name.",
    },
  ];

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="relative bg-[#0a0a0a] px-6 py-28 sm:px-10 sm:py-36"
    >
      <div className="mx-auto max-w-5xl">
        <SectionKicker>The process</SectionKicker>
        <h2
          id="how-it-works-heading"
          className="mt-4 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          How a pitch becomes a build.
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          Four steps. One week. No interviews, no decks, no warm intros.
        </p>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 sm:gap-6">
          {steps.map((s, i) => (
            <motion.article
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.5, delay: 0.08 * i }}
              className="scene-card flex gap-5 px-6 py-6 sm:px-7 sm:py-7"
            >
              <span
                aria-hidden
                className="scene-mono mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--scene-gold)]/45 bg-[var(--scene-gold)]/10 text-sm font-semibold tabular-nums text-[var(--scene-gold-bright)]"
              >
                {s.n}
              </span>
              <div>
                <h3 className="text-lg font-medium text-white sm:text-xl">
                  {s.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-white/72">
                  {s.body}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
