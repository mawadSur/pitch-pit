// Pit closes Friday at midnight ET. In UTC that's Saturday 04:00 (EDT,
// UTC-4). DST flip is something to watch in November when we move back to
// EST (UTC-5) — at that point Saturday 05:00 UTC is the right target.
//
// Argument is injectable for testability (default = real `now`).
export function nextFridayMidnightET(now: Date = new Date()): number {
  const dayUTC = now.getUTCDay();
  let daysUntilSat: number;
  if (dayUTC === 6) {
    const todayTarget = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      4,
      0,
      0,
    );
    daysUntilSat = now.getTime() >= todayTarget ? 7 : 0;
  } else {
    daysUntilSat = 6 - dayUTC;
  }
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilSat,
    4,
    0,
    0,
  );
}
