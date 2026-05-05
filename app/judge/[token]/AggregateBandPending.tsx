"use client";

import { motion } from "framer-motion";

// Suspense fallback for the aggregate band — shown until all three judges
// resolve. Subtle: a thin gold horizontal line + "awaiting consensus" tag.
export function AggregateBandPending() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
    >
      <motion.div
        className="absolute inset-x-12 top-1/2 h-[1px] -translate-y-1/2 bg-gradient-to-r from-transparent via-[var(--scene-gold)]/40 to-transparent"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <p className="scene-mono relative text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
        awaiting consensus
      </p>
    </motion.div>
  );
}
