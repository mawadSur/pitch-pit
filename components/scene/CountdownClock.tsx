"use client";

import { useEffect, useMemo, useState } from "react";
import { nextMondayMidnightET } from "@/lib/week-cycle";
import { FlipDigit } from "@/components/scene/FlipDigit";

export function CountdownClock() {
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setTarget(nextMondayMidnightET());
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = target && now ? Math.max(0, target - now) : 0;
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining / 3_600_000) % 24);
  const minutes = Math.floor((remaining / 60_000) % 60);
  const seconds = Math.floor((remaining / 1_000) % 60);

  // Update SR text only when the total remaining minute changes — not every second.
  const totalMinutes = Math.floor(remaining / 60_000);
  const ready = target !== null && now !== null;
  const srText = useMemo(() => {
    if (!ready) return "";
    if (totalMinutes <= 0) return "The pit is closed.";
    const d = Math.floor(totalMinutes / (60 * 24));
    const h = Math.floor((totalMinutes / 60) % 24);
    const m = totalMinutes % 60;
    const parts: string[] = [];
    if (d > 0) parts.push(`${d} ${d === 1 ? "day" : "days"}`);
    if (h > 0) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
    if (d === 0 && m > 0) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
    if (parts.length === 0) parts.push("less than a minute");
    return `The pit closes in ${parts.join(", ")}.`;
  }, [totalMinutes, ready]);

  return (
    <div
      role="timer"
      aria-label="Time remaining until Monday at midnight Eastern Time"
      className="grid grid-cols-4 gap-3 sm:gap-4"
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {srText}
      </span>
      <Unit value={days} label="days" />
      <Unit value={hours} label="hours" />
      <Unit value={minutes} label="min" />
      <Unit value={seconds} label="sec" pulse />
    </div>
  );
}

function Unit({
  value,
  label,
  pulse = false,
}: {
  value: number;
  label: string;
  pulse?: boolean;
}) {
  // Padded two-digit value, split into individual decimal slots so each
  // digit gets its own flap animation. Tens digit flips much less often
  // than ones (e.g., minutes tens flips every 10 minutes).
  const padded = String(value).padStart(2, "0");
  const tens = Number(padded[0]);
  const ones = Number(padded[1]);

  // Big-version typography: Fraunces serif (display var), tabular
  // numerals, with the gold-glow textShadow preserved from the previous
  // plain-text rendering. The `pulse` slot is the seconds — it gets the
  // bright gold and a stronger glow.
  const digitStyle: React.CSSProperties = {
    color: pulse ? "var(--scene-gold-bright)" : "white",
    textShadow: pulse
      ? "0 0 18px rgba(255, 209, 122, 0.6), 0 0 36px rgba(255, 184, 0, 0.35)"
      : "0 0 14px rgba(255, 184, 0, 0.18)",
  };

  return (
    <div className="countdown-unit">
      <span
        className="scene-numeral leading-none text-[2.6rem] font-semibold sm:text-[3.5rem]"
        style={{ display: "inline-flex", gap: 0 }}
      >
        <FlipDigit value={tens} style={digitStyle} />
        <FlipDigit value={ones} style={digitStyle} />
      </span>
      {/* Visually-hidden numeric mirror — keeps the timer readable to
          screen readers / copy-paste even though the FlipDigit spans are
          aria-hidden (their visual reordering during animation could
          confuse assistive tech). */}
      <span className="sr-only">{padded}</span>
      <span className="scene-mono mt-2 text-[0.55rem] uppercase tracking-[0.4em] text-white/45 sm:text-[0.65rem]">
        {label}
      </span>
    </div>
  );
}
