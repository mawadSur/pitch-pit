"use client";

// Compact "Latest tributes" row below FinalCTA — the most recent
// scored submissions with relative timestamps. NOT a marquee (a11y +
// fragile on resize). 3-column grid on desktop, stacked on mobile.
//
// The parent (HomeScene) hides this section entirely when the list is
// empty — see app/page.tsx for the freshness threshold (entries older
// than 7 days are pre-filtered out so a slow week doesn't read stale).

import Link from "next/link";
import { motion } from "framer-motion";
import { timeAgo } from "@/lib/format";

export type TickerEntry = {
  id: string;
  title: string;
  href: string;
  handle: string | null;
  /** ISO timestamp */
  createdAt: string;
};

export function LiveTicker({ entries }: { entries: TickerEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby="live-ticker-heading"
      className="relative border-t border-white/6 bg-[#0a0a0a] px-6 py-16 sm:px-10 sm:py-20"
    >
      <div className="mx-auto max-w-5xl">
        <p
          id="live-ticker-heading"
          className="scene-mono text-[0.65rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.7rem]"
        >
          ↘ Latest pitches
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {entries.map((e, i) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ duration: 0.35, delay: 0.04 * i }}
            >
              <Link
                href={e.href}
                className="group block rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 transition-colors hover:border-[var(--scene-gold)]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <p className="line-clamp-1 text-sm font-medium text-white/90 group-hover:text-[var(--scene-gold-bright)]">
                  {e.title}
                </p>
                <p className="scene-mono mt-1.5 flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.3em] text-white/45">
                  <span>{e.handle ? `@${e.handle}` : "Anonymous"}</span>
                  <span aria-hidden className="text-white/30">
                    ·
                  </span>
                  <span>{timeAgo(e.createdAt)}</span>
                </p>
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
