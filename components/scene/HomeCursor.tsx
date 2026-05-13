"use client";

// Custom cursor for the homepage ONLY. A tiny gold circle with a faint
// glow follows the pointer; when the pointer enters the input pill
// (`.scene-input-shell` and its submit sibling `.scene-submit`), the
// circle snaps to a crosshair to signal the typing affordance.
//
// Constraints we honor:
//   - prefers-reduced-motion: bail entirely (no cursor, no listener).
//   - touch / coarse pointer: bail entirely — a custom cursor on touch
//     reads as a stuck UI artifact.
//   - small viewports (<sm): the custom cursor competes with the OS
//     finger affordance; bail unless we're on a fine pointer device.
//
// Rendering:
//   - One fixed-position circle, transform-only, requestAnimationFrame-
//     batched so movement compositor-only.
//   - We use `transform: translate3d(x, y, 0)` for GPU offload; the
//     center is computed from a 14px footprint (so the trailing glow
//     reads as the "cursor center").
//   - We do NOT hide the OS cursor globally — only when the pointer is
//     ABOVE the home <main>. The header, footer, and any nav element
//     get their native pointer back.
//
// Lifetime: this is a client-only effect; the parent renders the
// container as a portal child of <main> so it ships nothing to SSR.

import { useEffect, useRef, useState } from "react";

// Targets that flip the cursor into "crosshair" mode. Keeping the list
// narrow on purpose — the input pill is the one "type here" moment on
// the page that earns a state shift.
const CROSSHAIR_SELECTOR = ".scene-input-shell, .scene-submit";

// Selector that hides the OS cursor while the custom one is active.
// Scoped to the homepage <main> so non-homepage chrome is unaffected.
const HOME_MAIN_SELECTOR = "main#main";

export function HomeCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPos = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Touch / coarse pointer → bail. A floating dot tracking a finger
    // tap reads as a stuck animation, not an affordance.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    // Reduced motion → bail. The dot itself is barely motion, but the
    // smoothed RAF + glow trail counts as ambient animation we should
    // skip per the spec.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Only run when there's a viable cursor target on the page. Defensive
    // against this component being mounted on a non-home route by mistake.
    const main = document.querySelector<HTMLElement>(HOME_MAIN_SELECTOR);
    if (!main) return;

    setActive(true);

    function onMove(e: PointerEvent) {
      if (e.pointerType === "touch" || e.pointerType === "pen") return;
      pendingPos.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(flush);
    }

    function flush() {
      rafRef.current = null;
      const pos = pendingPos.current;
      const node = dotRef.current;
      if (!pos || !node) return;
      // -50% / -50% center via the wrapper's own transform; here we just
      // park the wrapper at the pointer position. translate3d for GPU.
      node.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
    }

    function onOver(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const isCrosshair = !!target.closest(CROSSHAIR_SELECTOR);
      const node = dotRef.current;
      if (!node) return;
      node.dataset.crosshair = isCrosshair ? "1" : "0";
    }

    function onLeave() {
      const node = dotRef.current;
      if (!node) return;
      node.dataset.visible = "0";
    }

    function onEnter() {
      const node = dotRef.current;
      if (!node) return;
      node.dataset.visible = "1";
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.documentElement.addEventListener("pointerenter", onEnter);

    // Hide the OS cursor while inside the homepage main. Scoped via a
    // styling attribute on <html>, which we set + clean up here so we
    // don't leak the cursor: none rule into other routes when the home
    // unmounts during client navigation.
    document.documentElement.dataset.homeCursor = "1";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeEventListener("pointerenter", onEnter);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      delete document.documentElement.dataset.homeCursor;
    };
  }, []);

  if (!active) return null;

  return (
    <div
      ref={dotRef}
      aria-hidden
      data-visible="1"
      data-crosshair="0"
      // The actual visual lives inside this wrapper; the wrapper itself
      // is the absolutely-positioned shell that tracks the cursor.
      // Pointer-events: none so the dot never intercepts clicks.
      className="home-cursor pointer-events-none fixed left-0 top-0 z-[200] will-change-transform"
      style={{ transform: "translate3d(-100px, -100px, 0) translate(-50%, -50%)" }}
    >
      {/* Default mode: tiny gold filled circle with a soft halo.
          Crosshair mode (data-crosshair="1" set above): the dot fades
          and a crosshair pair fades in. State-swap is CSS-only so the
          transition smooth-jumps between forms. */}
      <span className="home-cursor-dot" />
      <span aria-hidden className="home-cursor-cross home-cursor-cross-h" />
      <span aria-hidden className="home-cursor-cross home-cursor-cross-v" />
    </div>
  );
}
