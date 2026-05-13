"use client";

import { useEffect, useRef } from "react";

// Micro-hourglass watermark for /idea/[id] (top-right corner of the
// viewport, below the header chrome). Brand-presence asset — the same
// glyph the homepage uses, miniaturised to ~22px and animated with two
// grains falling through the neck.
//
// Pauses when the tab is hidden (visibilitychange) or the window loses
// focus (blur). The grains snap to their start positions when paused so
// the visual "freezes" instead of leaving a grain stuck mid-fall.
//
// Bails on `prefers-reduced-motion: reduce` by rendering the static glyph
// (no falling grains at all).

export function HourglassWatermark({
  className = "",
}: {
  className?: string;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Reduced-motion: leave the static glyph as-is, never start.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      root.dataset.paused = "true";
      return;
    }

    function update() {
      const paused = document.hidden || !document.hasFocus();
      if (root) root.dataset.paused = paused ? "true" : "false";
    }

    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("blur", update);
    window.addEventListener("focus", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("blur", update);
      window.removeEventListener("focus", update);
    };
  }, []);

  return (
    <span
      ref={rootRef}
      aria-hidden
      data-paused="false"
      className={`scene-hourglass-watermark pointer-events-none ${className}`}
    >
      <svg
        width="16"
        height="24"
        viewBox="0 0 120 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Caps + cones — match the brand HourglassMark, dimmer fills
            because this is chrome, not a logo lockup. */}
        <rect x="14" y="2" width="92" height="8" rx="1.5" fill="#FFB800" />
        <path
          d="M 18 10 L 102 10 L 64 88 L 56 88 Z"
          fill="#FFB800"
          opacity="0.1"
        />
        <path
          d="M 18 10 L 56 88 M 102 10 L 64 88"
          stroke="#FFB800"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        <rect x="56" y="88" width="8" height="6" fill="#FFB800" opacity="0.5" />
        <path
          d="M 56 94 L 64 94 L 102 170 L 18 170 Z"
          fill="#FFB800"
          opacity="0.1"
        />
        <path
          d="M 56 94 L 18 170 M 64 94 L 102 170"
          stroke="#FFB800"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        <rect x="14" y="170" width="92" height="8" rx="1.5" fill="#FFB800" />

        {/* Pile of fallen sand at the bottom — static. */}
        <circle cx="60" cy="148" r="2.5" fill="#FFB800" opacity="0.7" />
        <circle cx="52" cy="162" r="2" fill="#FFB800" opacity="0.5" />
        <circle cx="68" cy="162" r="2" fill="#FFB800" opacity="0.5" />

        {/* Two falling grains, offset by half the cycle. Animation runs
            forever; the [data-paused="true"] selector in scene.css freezes
            it so the grain visually snaps back to its start position. */}
        <circle
          className="scene-hourglass-watermark__grain"
          cx="60"
          cy="94"
          r="1.6"
          fill="#FFB800"
          opacity="0.9"
        />
        <circle
          className="scene-hourglass-watermark__grain scene-hourglass-watermark__grain--late"
          cx="60"
          cy="94"
          r="1.4"
          fill="#FFB800"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}
