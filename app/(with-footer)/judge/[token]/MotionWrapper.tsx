"use client";

import { MotionConfig } from "framer-motion";

// Client wrapper around MotionConfig so the (server) judge page can scope
// reduced-motion behavior across all framer-motion descendants. Children
// are rendered server-side and passed through transparently.
export function MotionWrapper({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
