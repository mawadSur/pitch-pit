"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import type { JudgeMeta } from "@/lib/judges";

const STATUSES = [
  "Reading…",
  "Considering…",
  "Deliberating…",
  "Rendering judgment…",
];

// Suspense fallback shown while a judge's Anthropic call is in flight (5–15s).
// No generic spinner — three layered cinematic effects:
//   1. portrait shimmer sweep (gold gradient)
//   2. pulsing dot row under the role label
//   3. status-text cycler that advances every 1.5s
export function DeliberatingCard({
  judge,
  index,
}: {
  judge: JudgeMeta;
  index: number;
}) {
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUSES.length);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        ease: [0.16, 1, 0.3, 1],
        delay: index * 0.06,
      }}
      className="relative min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md"
    >
      {/* deliberating dot — pulsing gold */}
      <div className="absolute right-5 top-5 flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--scene-gold)]" />
        <span className="scene-mono text-[0.55rem] uppercase tracking-[0.32em] text-white/55">
          live
        </span>
      </div>

      {/* portrait + shimmer */}
      <div className="relative h-24 w-24 overflow-hidden rounded-full ring-1 ring-white/15">
        <Image
          src={judge.portrait}
          alt=""
          fill
          sizes="96px"
          className="object-cover opacity-60"
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[var(--scene-gold)]/20 to-transparent"
          animate={{ x: ["-110%", "110%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="mt-5">
        <h3 className="text-lg font-semibold text-white">{judge.name}</h3>
        <p className="scene-mono mt-1 text-[0.65rem] uppercase tracking-[0.32em] text-white/55">
          {judge.role}
        </p>
      </div>

      {/* pulse dots */}
      <div className="mt-5 flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-white/40"
            animate={{ scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
        <span className="ml-3 scene-mono text-[0.65rem] uppercase tracking-[0.16em] text-white/55">
          <AnimatePresence mode="wait">
            <motion.span
              key={statusIdx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="inline-block"
              aria-live="polite"
            >
              {STATUSES[statusIdx]}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      {/* score placeholder */}
      <div className="mt-8">
        <div className="h-[2px] w-12 animate-pulse bg-[var(--scene-gold)]/30" />
      </div>

      {/* verdict placeholder */}
      <div className="mt-6 space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.06]" />
      </div>
    </motion.article>
  );
}
