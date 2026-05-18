"use client";

import { useEffect, useState } from "react";

const QUERY = "(max-width: 768px)";

/**
 * Reads the viewport against a `max-width: 768px` media query and keeps the
 * value in sync with live changes (orientation flip, devtools resize, etc.).
 *
 * SSR-safe: returns `false` on the server and during the first client paint,
 * then upgrades on the first effect run. Mirrors the shape of
 * `useReducedMotion()` so callers can compose them the same way.
 *
 * Why the 768px breakpoint:
 *   - Matches Tailwind's `md:` boundary, which is the same threshold the
 *     rest of the homepage's responsive copy/grid sizing keys off.
 *   - The previous `min-width: 768px` check inside HeroPanel used the same
 *     line — this hook is its inverse, exposed so callers can branch on
 *     "mobile" rather than "large enough" semantics.
 *
 * Note on stability: this hook DOES update on resize/orientation changes.
 * Callers that want a one-shot lock (e.g., the canvas frame-path picker
 * inside HeroPanel, which can't safely swap image arrays mid-scrub) should
 * snapshot the value once on mount and ignore subsequent updates.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    // `addEventListener` on MediaQueryList is the modern API; older Safari
    // (≤13) only had `addListener`. We're on evergreen browsers, so the
    // modern path is fine — no fallback needed.
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}
