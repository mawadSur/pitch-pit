"use client";

import { motion } from "framer-motion";
import { SectionKicker, CheckMark } from "./_section-helpers";

// Trust-building. Names what we screen for so founders know their pitch
// isn't competing with low-effort spam. Calmer rhythm, single column.
export function AntiAbusePromise() {
  const guards = [
    {
      title: "You own your idea. Always.",
      body: "Posting here is validation, not surrender. We never claim equity, rights, or ownership — and if you win, the MVP we build ships under your name and belongs to you. Want to keep the secret sauce close? Pitch the problem and your angle; you don't have to hand over the blueprint to compete.",
    },
    {
      title: "Prompt-injection screening",
      body: "Submissions that try to manipulate the reviewer (\"ignore previous instructions\", system tokens, jailbreak attempts) are rejected before they reach Claude. Your honest pitch isn't competing against tricks.",
    },
    {
      title: "Per-user weekly cap",
      body: "Two submissions per week per signed-in user. Anonymous submissions are IP rate-limited. No flooding the feed from one account.",
    },
    {
      title: "Quality floor",
      body: "Pitches under 60 characters, all-caps shouting, repeated-character spam, and copy-paste filler are rejected. The reviewer only sees real ideas — so do the voters.",
    },
    {
      title: "Hate speech filter",
      body: "Slurs and targeted harassment are blocked at submit. Beyond the regex layer, Claude flags policy violations (doxxing, CSAM, instructions for serious harm, explicit fraud) and refuses to score them.",
    },
  ];

  return (
    <section
      aria-labelledby="antiabuse-heading"
      className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-28 sm:px-10 sm:py-32"
    >
      <div className="mx-auto max-w-3xl">
        <SectionKicker>The promise</SectionKicker>
        <h2
          id="antiabuse-heading"
          className="mt-4 text-balance text-3xl font-medium leading-tight text-white sm:text-4xl lg:text-5xl"
        >
          Your pitch competes against ideas — not noise.
        </h2>
        <p className="mt-5 text-base leading-relaxed text-white/65 sm:text-lg">
          What&rsquo;s yours stays yours — and we screen out the noise before
          any submission reaches the leaderboard. Real founders deserve a real
          signal.
        </p>

        <ul className="mt-14 space-y-5">
          {guards.map((g, i) => (
            <motion.li
              key={g.title}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.5, delay: 0.07 * i }}
              className="scene-card flex gap-5 px-6 py-6 sm:px-7 sm:py-7"
            >
              <CheckMark />
              <div>
                <h3 className="text-base font-medium text-white sm:text-lg">
                  {g.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/72 sm:text-base">
                  {g.body}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
