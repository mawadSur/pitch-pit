"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

// Split-flap / airport-departures flip-board single digit.
//
// Architecture (CSS-driven; no framer-motion for the choreography —
// the flap sequence is tightly timed and keyframes are 60fps GPU-cheap):
//
//   .flip-digit          perspective container, fixed width (1ch)
//     .flip-static-top    static top half of the CURRENT digit
//     .flip-static-bottom static bottom half of the CURRENT digit
//     .flip-flap-top      animates rotateX(0 → -90deg), origin bottom
//                          shows the OUTGOING (previous) digit's top half
//     .flip-flap-bottom   animates rotateX(90deg → 0), origin top, delayed
//                          shows the INCOMING (current) digit's bottom half
//
// We only animate when the digit actually changes. We do this by tracking
// the previous digit in a ref and bumping a render-key for the flap layer
// when a change occurs. Mounting the flap with a fresh key restarts its
// keyframes; once the animation ends we unmount it so subsequent same-digit
// renders don't carry a stale flap.

type FlipDigitProps = {
  /** Single decimal digit 0-9 (we coerce defensively but expect 0-9). */
  value: number;
  /**
   * Tailwind / inline classes for the digit text. The component owns its own
   * width (1ch) and perspective; callers pass type-styling (font, size, color,
   * shadow, etc.).
   */
  className?: string;
  /**
   * Inline styles for the digit text. Use for color / textShadow that varies
   * between slots (e.g., the seconds slot using the bright gold).
   */
  style?: React.CSSProperties;
};

export function FlipDigit({ value, className, style }: FlipDigitProps) {
  const reducedMotion = useReducedMotion();
  const safe = Math.max(0, Math.min(9, Math.floor(value)));

  // Track previous digit; null means "never rendered" → no animation on first paint.
  const prevRef = useRef<number | null>(null);

  // Animation key: bumped on every digit change so the flap remounts and
  // its keyframes restart. Holds the *outgoing* digit while the flip plays.
  const [flapState, setFlapState] = useState<{
    key: number;
    from: number;
    to: number;
  } | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = safe;

    // First mount: no animation. Just bookkeep the digit.
    if (prev === null || prev === safe) return;

    setFlapState({ key: (flapState?.key ?? 0) + 1, from: prev, to: safe });
    // flapState intentionally omitted from deps — we only react to `safe` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe]);

  // Reduced-motion path: skip rotation entirely; React still renders the new
  // digit, and a CSS `transition: opacity` on the static halves softens the
  // change. We never mount flaps in this mode.
  if (reducedMotion) {
    return (
      <span
        className={`flip-digit flip-digit-reduced ${className ?? ""}`}
        style={style}
        aria-hidden
      >
        <span key={safe} className="flip-reduced-face">
          {safe}
        </span>
      </span>
    );
  }

  return (
    <span className={`flip-digit ${className ?? ""}`} style={style} aria-hidden>
      {/* Static halves — show the CURRENT digit. The flap layer animates
          on top during transitions. */}
      <span className="flip-static flip-static-top">{safe}</span>
      <span className="flip-static flip-static-bottom">{safe}</span>

      {flapState && (
        <FlapLayer
          key={flapState.key}
          from={flapState.from}
          to={flapState.to}
          onDone={() => setFlapState(null)}
        />
      )}
    </span>
  );
}

function FlapLayer({
  from,
  to,
  onDone,
}: {
  from: number;
  to: number;
  onDone: () => void;
}) {
  // Two flaps animate in sequence:
  //   top flap:    folds DOWN from rotateX(0) → rotateX(-90), shows OUTGOING
  //   bottom flap: folds UP   from rotateX(90) → rotateX(0),  shows INCOMING
  // The bottom flap is delayed so it picks up where the top flap ends —
  // that's the "split-flap" handoff at the seam.
  //
  // We only need to wait for the bottom flap (the later one) to finish before
  // unmounting; the top flap finishes first and parks at -90deg invisible.
  return (
    <>
      <span className="flip-flap flip-flap-top">{from}</span>
      <span
        className="flip-flap flip-flap-bottom"
        onAnimationEnd={(e) => {
          // Two animations run on the bottom flap (rotation + edge-flash).
          // Only fire onDone once, when the rotation finishes.
          if (e.animationName === "flip-fold-up") onDone();
        }}
      >
        {to}
      </span>
    </>
  );
}
