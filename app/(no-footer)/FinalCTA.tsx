"use client";

import Link from "next/link";
import { motion } from "framer-motion";

// After they've absorbed the offer, one last "pitch your idea" moment.
// No image, no animation theatrics — just the offer, big and quiet.
// The `#capture` anchor points back at Panel 1's HeroPanel id, so the
// jump scrolls to the form rather than to the top of the page.
export function FinalCTA() {
  return (
    <section className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-28 text-center sm:px-10 sm:py-36">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12% 0px" }}
        transition={{ duration: 0.7 }}
        className="mx-auto max-w-2xl"
      >
        <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
          ↘ Your move
        </p>
        <h2 className="mt-5 text-balance text-3xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
          The pit is open.{" "}
          <span className="italic text-[var(--scene-gold-bright)]">
            Pitch your idea.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
          60 characters minimum. Two submissions per week. No equity, no fees.
          Monday at midnight, one winner walks out with a build.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a href="#capture" className="cta-btn-primary text-base">
            Pitch your idea <span aria-hidden>↑</span>
          </a>
          <Link href="/leaderboard" className="cta-btn-ghost text-base">
            See this week&rsquo;s leaderboard
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
