"use client";

// A large soft gold spotlight that drifts slowly across Panel 1 — at
// most ~6% peak opacity. Z-index sits behind the cinematic content
// (z-5) but above the static bg (which is z-0/auto). transform-only
// (x/y); width/height/blur are static.
//
// Two independent periods (60s on x, 45s on y) trace a slow figure-8
// without re-aligning. framer-motion's keyframes loop seamlessly.
//
// Reduced-motion: render as a static centered glow (no motion). The
// `useReducedMotion` hook respects the user's system preference at
// mount; framer-motion's MotionConfig at the page root sets
// reducedMotion="user" so the hook returns true when the user has
// requested it.

import { motion, useReducedMotion } from "framer-motion";

export function WanderingSpotlight() {
  const reduced = useReducedMotion();

  if (reduced) {
    // Static centered glow.
    return (
      <div
        aria-hidden
        className="scene-spotlight"
        style={{
          // Center it manually since transform isn't animating.
          left: "50%",
          top: "40%",
          transform: "translate3d(-50%, -50%, 0)",
          zIndex: 5,
        }}
      />
    );
  }

  return (
    <motion.div
      aria-hidden
      className="scene-spotlight"
      style={{ zIndex: 5 }}
      initial={{ x: "10vw", y: "20vh" }}
      animate={{
        x: ["-10vw", "60vw", "100vw", "30vw", "-10vw"],
        y: ["20vh", "-5vh", "40vh", "65vh", "20vh"],
      }}
      transition={{
        x: { duration: 60, repeat: Infinity, ease: "easeInOut" },
        y: { duration: 45, repeat: Infinity, ease: "easeInOut" },
      }}
    />
  );
}
