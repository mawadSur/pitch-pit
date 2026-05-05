// Pit closes Monday at midnight ET (i.e., the boundary between Monday and
// Tuesday — Tuesday 04:00 UTC during EDT, UTC-4). DST flip is something to
// watch in November when we move back to EST (UTC-5) — at that point Tuesday
// 05:00 UTC is the right target.
//
// Argument is injectable for testability (default = real `now`).
export function nextMondayMidnightET(now: Date = new Date()): number {
  const dayUTC = now.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, ...
  // Target weekday is Tuesday (2) at 04:00 UTC, which is the moment
  // Monday ends in Eastern Time during EDT.
  let daysUntilTue = (2 - dayUTC + 7) % 7;
  if (daysUntilTue === 0) {
    const todayTarget = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      4,
      0,
      0,
    );
    daysUntilTue = now.getTime() >= todayTarget ? 7 : 0;
  }
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilTue,
    4,
    0,
    0,
  );
}
