"use client";

// Tiny gold-particle trail that follows the cursor over Panel 1.
//
// Architecture:
//   - One overlay div (pointer-events: none, aria-hidden) covers the
//     hero. We listen for `pointermove` on the overlay's parent (the
//     panel), so events fire on textareas / buttons too (which we
//     filter out).
//   - Throttle to ~30fps (skip events arriving < 33ms after the last).
//   - Pool 12 absolutely-positioned spans in the overlay; recycle the
//     oldest as new particles spawn.
//   - Each particle: gold dot, animates `translateY(-20px)` + opacity
//     1→0 over 600ms via CSS keyframe.
//   - Disable on touch devices (first event with `pointerType: touch`
//     bails permanently) and on prefers-reduced-motion.
//   - Skip emit when the event target is a textarea, button, or any
//     descendant of a `[data-pitch-coach]` element — those have their
//     own gold treatment that this would clash with.

import { useEffect, useRef } from "react";

const POOL_SIZE = 12;
const THROTTLE_MS = 33;

type Props = {
  /** ref to the panel container — we listen for pointermove here */
  panelRef: React.RefObject<HTMLElement | null>;
};

export function CursorTrail({ panelRef }: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Pre-create pool. Each node is reused; we re-trigger the keyframe
    // by removing+re-adding the class.
    const pool: HTMLSpanElement[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const dot = document.createElement("span");
      dot.className = "scene-cursor-trail-dot";
      dot.style.opacity = "0";
      dot.style.left = "0px";
      dot.style.top = "0px";
      overlay.appendChild(dot);
      pool.push(dot);
    }

    let poolIdx = 0;
    let lastEmit = 0;
    let isTouch = false;

    function shouldSkip(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false;
      // Skip if target is or descends from textarea, input, button,
      // or anything that opted out via data-no-cursor-trail.
      if (
        target.closest(
          "textarea, input, button, [data-no-cursor-trail], [data-pitch-coach]",
        )
      ) {
        return true;
      }
      return false;
    }

    function onMove(e: PointerEvent) {
      if (isTouch) return;
      if (e.pointerType === "touch") {
        isTouch = true;
        return;
      }
      if (shouldSkip(e.target)) return;

      const now = e.timeStamp;
      if (now - lastEmit < THROTTLE_MS) return;
      lastEmit = now;

      // Position relative to the overlay.
      const rect = overlay!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Skip if outside the overlay (defensive — e.g., scrolled past).
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      const dot = pool[poolIdx];
      poolIdx = (poolIdx + 1) % POOL_SIZE;

      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      // Restart animation: remove + force reflow + re-add class.
      dot.classList.remove("scene-cursor-trail-dot");
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void dot.offsetWidth;
      dot.classList.add("scene-cursor-trail-dot");
    }

    panel.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      panel.removeEventListener("pointermove", onMove);
      for (const n of pool) {
        if (n.parentNode === overlay) overlay.removeChild(n);
      }
    };
  }, [panelRef]);

  return (
    <div
      ref={overlayRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 8 }}
    />
  );
}
