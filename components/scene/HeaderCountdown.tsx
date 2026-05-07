"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { nextMondayMidnightET } from "@/lib/week-cycle";
import { FlipDigit } from "@/components/scene/FlipDigit";

// Scroll threshold (px) past which the header countdown becomes visible
// on the homepage. The hero's own kicker reads "THE PIT CLOSES MONDAY AT
// MIDNIGHT EST" near top-[7%] — at rest those two redundantly chant the
// same thing. Once the user begins to scroll, the kicker fades with the
// panel and this ticker takes over chrome duty. Threshold is small (24px)
// so even a one-tap scroll on mobile triggers the cross-fade.
const HOME_SCROLL_REVEAL_THRESHOLD = 24;

// Slim live ticker rendered inline in the header. Reminds visitors on
// every page that the contest is running — even if they're 4 routes
// deep on /submissions. Resolution is per-minute (no second-by-second
// pulse — that belongs to the cinematic CountdownClock on the homepage,
// which has its own ambient role).
//
// Uses the same FlipDigit primitive as the homepage countdown but at a
// much smaller scale and inheriting the header's Geist Mono. Because
// minutes only tick at most once a minute (the ticker samples every 30s),
// the flap reads as a quiet, occasional click rather than a constant
// movement — which fits the chrome-level role of the header.

export function HeaderCountdown() {
  const pathname = usePathname();
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  // Suppress on the homepage at-rest so we don't double up the kicker
  // ("THE PIT CLOSES MONDAY AT MIDNIGHT EST") that lives in Panel 1.
  // Flips once the user scrolls past HOME_SCROLL_REVEAL_THRESHOLD; on
  // any other route, suppressed stays false from first paint.
  const [suppressed, setSuppressed] = useState(pathname === "/");

  useEffect(() => {
    setTarget(nextMondayMidnightET());
    setNow(Date.now());
    // Tick every 30s so the minute display stays accurate across a long
    // visit without re-rendering every second. The minute boundary itself
    // is captured by the next 30s sample at worst.
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Track scroll only on the homepage; on other routes the ticker is
  // unconditionally visible and we don't want the listener overhead.
  useEffect(() => {
    if (pathname !== "/") {
      setSuppressed(false);
      return;
    }
    const onScroll = () => {
      setSuppressed(window.scrollY < HOME_SCROLL_REVEAL_THRESHOLD);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  if (suppressed) {
    // Reserve the same horizontal footprint as the resolved ticker so
    // the header doesn't shift when the user scrolls past the threshold.
    return (
      <span
        aria-hidden
        className="hidden h-7 w-44 rounded-full lg:inline-block"
      />
    );
  }

  if (target === null || now === null) {
    // Reserve the same horizontal footprint as the resolved ticker so
    // the header doesn't shift on hydration.
    return (
      <span
        aria-hidden
        className="hidden h-7 w-44 rounded-full lg:inline-block"
      />
    );
  }

  const remaining = Math.max(0, target - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining / 3_600_000) % 24);
  const minutes = Math.floor((remaining / 60_000) % 60);

  const closed = remaining <= 0;
  const padHoursTens = Math.floor(hours / 10);
  const padHoursOnes = hours % 10;
  const padMinutesTens = Math.floor(minutes / 10);
  const padMinutesOnes = minutes % 10;
  const padDays = String(days);

  return (
    <div
      role="timer"
      aria-label={
        closed
          ? "The pit is closed."
          : `Pit closes in ${days} days, ${hours} hours, ${minutes} minutes.`
      }
      className="scene-mono hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[0.55rem] uppercase tracking-[0.32em] text-white/55 lg:inline-flex"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--scene-gold)]"
      />
      {closed ? (
        <span>pit closed</span>
      ) : (
        <>
          <span>pit closes</span>
          <span
            aria-hidden
            className="text-white/85 tabular-nums inline-flex items-baseline"
          >
            {padDays}d{" "}
            <FlipDigit value={padHoursTens} className="header-flip" />
            <FlipDigit value={padHoursOnes} className="header-flip" />h{" "}
            <FlipDigit value={padMinutesTens} className="header-flip" />
            <FlipDigit value={padMinutesOnes} className="header-flip" />m
          </span>
          {/* Mirror the resolved time for AT in plain text — the FlipDigits
              themselves are aria-hidden because their absolute-positioned
              flap layers can confuse assistive tech mid-animation. */}
          <span className="sr-only">
            {days}d {hours}h {minutes}m
          </span>
        </>
      )}
    </div>
  );
}
