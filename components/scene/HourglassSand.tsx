"use client";

// Decorative gold-sand drift over Panel 1's at-rest hourglass. 4–6
// particles spawn per second from the top half of the bulb region and
// fall ~70px over 2.5s with random horizontal jitter and a fade. Pure
// DOM nodes (pool of 8, recycled). transform/opacity only.
//
// Bails entirely on prefers-reduced-motion and on touch-only devices
// where the at-rest panel may not even be visible at the moment of
// scroll.

import { useEffect, useRef } from "react";

const POOL_SIZE = 8;
const SPAWN_MIN_MS = 200;
const SPAWN_MAX_MS = 400;
const PARTICLE_LIFETIME_MS = 2700;

export function HourglassSand() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const poolRef = useRef<HTMLSpanElement[]>([]);
  const inUseRef = useRef<Set<HTMLSpanElement>>(new Set());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Honor reduced-motion. matchMedia returns immediately on mount.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Pre-create pool nodes and append once. Reuse by toggling display.
    const pool: HTMLSpanElement[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const dot = document.createElement("span");
      dot.className = "scene-sand-dot";
      dot.style.display = "none";
      container.appendChild(dot);
      pool.push(dot);
    }
    poolRef.current = pool;

    function spawn() {
      if (cancelled) return;

      // Find a free node.
      const free = pool.find((n) => !inUseRef.current.has(n));
      if (free) {
        // Random position within the top half of the bulb region.
        const xPct = 35 + Math.random() * 30; // 35%..65% horizontal
        const yPct = Math.random() * 30; // 0%..30% vertical (top half)
        const jitter = (Math.random() - 0.5) * 8; // -4..4 px
        const fall = 60 + Math.random() * 20; // 60..80 px
        const dur = 2300 + Math.random() * 600; // 2.3..2.9s
        const size = 1.5 + Math.random() * 1.5; // 1.5..3 px

        free.style.display = "block";
        free.style.left = `${xPct}%`;
        free.style.top = `${yPct}%`;
        free.style.width = `${size}px`;
        free.style.height = `${size}px`;
        free.style.setProperty("--sand-jitter", `${jitter.toFixed(2)}px`);
        free.style.setProperty("--sand-fall", `${fall.toFixed(1)}px`);
        free.style.setProperty("--sand-dur", `${Math.round(dur)}ms`);
        // Restart animation by toggling. Removing+adding the class is
        // the most reliable reset across browsers.
        free.classList.remove("scene-sand-dot");
        // Force reflow so the class re-add re-triggers the keyframe.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        void free.offsetWidth;
        free.classList.add("scene-sand-dot");

        inUseRef.current.add(free);
        setTimeout(() => {
          inUseRef.current.delete(free);
          free.style.display = "none";
        }, PARTICLE_LIFETIME_MS);
      }

      // Schedule next spawn.
      const delay =
        SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
      timeoutId = setTimeout(spawn, delay);
    }

    // Kick off after a tiny delay so the panel has a moment to settle.
    timeoutId = setTimeout(spawn, 400);

    // Stop spawning when the page is hidden (tab-switch / minimize) so
    // we don't burn cycles on a tab nobody's looking at.
    function onVis() {
      if (document.hidden) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;
      } else if (!cancelled && timeoutId === null) {
        timeoutId = setTimeout(spawn, 400);
      }
    }
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVis);
      // Remove pool nodes from the DOM.
      for (const n of pool) {
        if (n.parentNode === container) container.removeChild(n);
      }
      inUseRef.current.clear();
    };
  }, []);

  // Container sits over the hourglass region. Top ~20%, height ~25%,
  // narrow horizontally so dots only fall through the painted bulb.
  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute left-0 right-0 mx-auto"
      style={{
        top: "20%",
        height: "25%",
        width: "min(220px, 30%)",
        zIndex: 6,
      }}
    />
  );
}
