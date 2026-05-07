"use client";

// Atmospheric flair: input-shell milestone pulse + spark.
//
// Watches the textarea's character length and fires a one-shot pulse on
// the parent `.scene-input-shell` (via `data-pulse="1"` attribute) plus a
// gold spark from the bottom-right corner whenever the user crosses one
// of the pitch milestones from below:
//   60   — pitch becomes submittable (the floor)
//   300  — substantive
//   1500 — over the legacy ceiling (bonus)
//
// Each crossing fires once per session per direction; backing off below a
// threshold and re-crossing it from below re-arms it (so re-fires).
//
// The spark element listens to `prefers-reduced-motion` via CSS — see
// the `.scene-spark` rule in app/scene.css. The pulse keyframe also
// runs on reduced-motion (it's a single box-shadow tween — no motion).
//
// The parent shell ref is passed in so this component doesn't have to
// own the shell DOM (the shell is a structural wrapper around the
// textarea — moving it would reflow everything).

import { useEffect, useRef, useState } from "react";

const MILESTONES = [60, 300, 1500] as const;

type Spark = { id: number };

type Props = {
  /** ref to the .scene-input-shell DOM node */
  shellRef: React.RefObject<HTMLElement | null>;
  /** current trimmed text length */
  length: number;
};

export function InputMilestoneFX({ shellRef, length }: Props) {
  const prevLengthRef = useRef(0);
  const sparkIdRef = useRef(0);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sparks, setSparks] = useState<Spark[]>([]);

  useEffect(() => {
    const prev = prevLengthRef.current;
    prevLengthRef.current = length;

    // Find the highest milestone we just crossed from below.
    let crossed: number | null = null;
    for (const m of MILESTONES) {
      if (prev < m && length >= m) {
        crossed = m;
      }
    }
    if (crossed === null) return;

    // Fire the pulse on the shell. data-pulse cycles: set → wait → clear,
    // so a subsequent crossing can re-fire (an attribute change, not just
    // a flag, is what re-runs the keyframe).
    const shell = shellRef.current;
    if (shell) {
      shell.setAttribute("data-pulse", "1");
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = setTimeout(() => {
        shell.removeAttribute("data-pulse");
        pulseTimeoutRef.current = null;
      }, 620);
    }

    // Emit one spark. CSS `animation` runs once + `forwards`; we just
    // need to mount + unmount the node so the keyframe replays. We
    // remove the spark after 700ms (a hair longer than the 600ms
    // animation) to avoid stacking.
    const id = ++sparkIdRef.current;
    setSparks((prev) => [...prev, { id }]);
    setTimeout(() => {
      setSparks((prev) => prev.filter((s) => s.id !== id));
    }, 700);
  }, [length, shellRef]);

  // Cleanup pending timeouts on unmount.
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, []);

  return (
    <span aria-hidden className="pointer-events-none">
      {sparks.map((s) => (
        <span key={s.id} className="scene-spark" />
      ))}
    </span>
  );
}
