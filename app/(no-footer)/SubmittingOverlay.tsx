"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const STATUSES = [
  "Sealing your pitch…",
  "Calling the judges…",
  "Almost there…",
];

// Full-screen overlay shown between "click submit" and the judge dashboard
// streaming in. Bridges the ~600ms window for Turnstile + /api/draft +
// router.push so the user sees forward motion instead of a hung button.
// Once Next.js navigates to /judge/[token], its loading.tsx takes over
// and this overlay unmounts cleanly.
export function SubmittingOverlay({ visible }: { visible: boolean }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!visible) {
      setIdx(0);
      return;
    }
    const id = setInterval(() => {
      setIdx((i) => Math.min(i + 1, STATUSES.length - 1));
    }, 1100);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="submitting-overlay"
          role="status"
          aria-live="polite"
          aria-label="Submitting your pitch"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="scene fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0a0a]/95 backdrop-blur-md"
        >
          {/* ambient gold blob */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--scene-gold)]/[0.10] blur-3xl"
            animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.08, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative flex flex-col items-center gap-8 px-6 text-center">
            {/* triple-pulse — three judges deliberating */}
            <div className="flex items-center gap-3">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block h-2 w-2 rounded-full bg-[var(--scene-gold)]"
                  animate={{
                    scale: [0.6, 1.1, 0.6],
                    opacity: [0.4, 1, 0.4],
                  }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    delay: i * 0.18,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>

            {/* cycling status text */}
            <div className="h-8 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.p
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold-bright)] sm:text-[0.92rem]"
                >
                  {STATUSES[idx]}
                </motion.p>
              </AnimatePresence>
            </div>

            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.1,
              }}
              className="text-balance text-3xl font-medium leading-tight text-white sm:text-4xl"
            >
              Three judges. <span className="italic text-[var(--scene-gold-bright)]">One pitch.</span>
            </motion.h2>

            {/* hairline shimmer bar */}
            <motion.div
              aria-hidden
              className="relative h-[1px] w-48 overflow-hidden bg-white/[0.06]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.div
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[var(--scene-gold)]/80 to-transparent"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
