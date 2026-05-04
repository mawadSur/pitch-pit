"use client";

import { useEffect, useState } from "react";
import { nextFridayMidnightET } from "@/lib/week-cycle";

export function CountdownClock() {
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setTarget(nextFridayMidnightET());
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = target && now ? Math.max(0, target - now) : 0;
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining / 3_600_000) % 24);
  const minutes = Math.floor((remaining / 60_000) % 60);
  const seconds = Math.floor((remaining / 1_000) % 60);

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label="Time remaining until Friday at midnight Eastern Time"
      className="grid grid-cols-4 gap-3 sm:gap-4"
    >
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
  return (
    <div className="countdown-unit">
      <span
        className="scene-mono leading-none tabular-nums text-[2.6rem] font-semibold sm:text-[3.5rem]"
        style={{
          color: pulse ? "var(--scene-gold-bright)" : "white",
          textShadow: pulse
            ? "0 0 18px rgba(255, 209, 122, 0.6), 0 0 36px rgba(255, 184, 0, 0.35)"
            : "0 0 14px rgba(255, 184, 0, 0.18)",
        }}
      >
        {String(value).padStart(2, "0")}
      </span>
      <span className="scene-mono mt-2 text-[0.55rem] uppercase tracking-[0.4em] text-white/45 sm:text-[0.6rem]">
        {label}
      </span>
    </div>
  );
}
