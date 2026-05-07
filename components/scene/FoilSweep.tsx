"use client";

// One-shot gold-foil sweep across a child element when it first enters
// the viewport. Reused once per session — once the IntersectionObserver
// fires it disconnects, so even if the element re-enters/leaves we
// don't replay.
//
// The class `.scene-foil-sweep` is a no-op until the `data-foil-sweep`
// attribute flips to "1" — see app/scene.css.

import { useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  /** IntersectionObserver threshold. Default 0.6. */
  threshold?: number;
  /** Tag the wrapper element. Default span (inline). */
  as?: "span" | "div";
  className?: string;
};

export function FoilSweep({
  children,
  threshold = 0.6,
  as = "span",
  className = "",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold, rootMargin: "0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, active]);

  // Render as either span (default — inline-safe inside an h1) or div.
  // Type-narrow the ref accordingly; the wrapper element is intent-
  // ionally minimal so screen readers still pick up the inner text.
  if (as === "div") {
    return (
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={`scene-foil-sweep ${className}`}
        data-foil-sweep={active ? "1" : undefined}
      >
        {children}
      </div>
    );
  }
  return (
    <span
      ref={ref as React.RefObject<HTMLSpanElement>}
      className={`scene-foil-sweep ${className}`}
      data-foil-sweep={active ? "1" : undefined}
    >
      {children}
    </span>
  );
}
