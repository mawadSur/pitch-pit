"use client";

import { useEffect, useState } from "react";
import { nextMondayMidnightET } from "@/lib/week-cycle";

// Slim live ticker rendered inline in the header. Reminds visitors on
// every page that the contest is running — even if they're 4 routes
// deep on /submissions. Resolution is per-minute (no second-by-second
// pulse — that belongs to the cinematic CountdownClock on the homepage,
// which has its own ambient role).

export function HeaderCountdown() {
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setTarget(nextMondayMidnightET());
    setNow(Date.now());
    // Tick every 30s so the minute display stays accurate across a long
    // visit without re-rendering every second. The minute boundary itself
    // is captured by the next 30s sample at worst.
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
  const pad = (n: number) => String(n).padStart(2, "0");

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
          <span className="text-white/85 tabular-nums">
            {days}d {pad(hours)}h {pad(minutes)}m
          </span>
        </>
      )}
    </div>
  );
}
