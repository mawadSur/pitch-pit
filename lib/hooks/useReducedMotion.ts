"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Reads the OS-level `prefers-reduced-motion: reduce` preference and keeps
 * the value in sync with live changes (system settings panel, OS-wide
 * accessibility shortcut, etc.).
 *
 * SSR-safe: returns `false` on the server and during the first client paint.
 * The first effect run upgrades the value to whatever the OS actually
 * reports — components should design their motion as the default and treat
 * `true` as the "no animation" branch, so the brief one-frame mismatch is
 * imperceptible (motion just hadn't started yet).
 *
 * Why a custom hook instead of framer-motion's `useReducedMotion`:
 *   - Lets non-framer-motion code (manual canvas scrubs, plain CSS toggles,
 *     `setTimeout`-driven UI) read the same preference without pulling in
 *     framer-motion as a transitive dep.
 *   - Local to this app, easy to mock in tests, no external surface area.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const update = () => setReduced(mq.matches);
    update();
    // `addEventListener` on MediaQueryList is the modern API; older Safari
    // (≤13) only had `addListener`. We're on evergreen browsers, so the
    // modern path is fine — no fallback needed.
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}
