import { describe, it, expect } from "vitest";
import { nextFridayMidnightET } from "./week-cycle";

// All cases use UTC days. EDT (UTC-4) means the close target is Saturday
// 04:00 UTC. Reads:
//   "Mon noon UTC" → next Sat 04:00 UTC
//   "Sat 03:59 UTC" → today (this Sat 04:00 UTC), since the close hasn't passed
//   "Sat 04:00 UTC exactly" → next Sat (a week away), since it has just passed
//   "Sat 12:00 UTC" → next Sat (a week away)
//   "Sun morning UTC" → next Sat (6 days away)

function fridayMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, 4, 0, 0);
}

describe("nextFridayMidnightET", () => {
  it("from Monday returns the upcoming Saturday 04:00 UTC", () => {
    // 2026-05-04 is a Monday
    const monday = new Date(Date.UTC(2026, 4, 4, 12, 0, 0));
    expect(nextFridayMidnightET(monday)).toBe(fridayMidnight(2026, 4, 9));
  });

  it("from Saturday before 04:00 returns today's 04:00 UTC", () => {
    // 2026-05-09 is Saturday — at 03:59 UTC, the close hasn't happened yet.
    const saturdayPre = new Date(Date.UTC(2026, 4, 9, 3, 59, 0));
    expect(nextFridayMidnightET(saturdayPre)).toBe(fridayMidnight(2026, 4, 9));
  });

  it("from Saturday at exactly 04:00 returns next Saturday", () => {
    // The current week has just closed.
    const saturdayAt = new Date(Date.UTC(2026, 4, 9, 4, 0, 0));
    expect(nextFridayMidnightET(saturdayAt)).toBe(fridayMidnight(2026, 4, 16));
  });

  it("from Saturday afternoon returns next Saturday", () => {
    const saturdayAfter = new Date(Date.UTC(2026, 4, 9, 18, 0, 0));
    expect(nextFridayMidnightET(saturdayAfter)).toBe(
      fridayMidnight(2026, 4, 16),
    );
  });

  it("from Sunday morning returns the following Saturday (6 days)", () => {
    const sunday = new Date(Date.UTC(2026, 4, 10, 9, 0, 0));
    expect(nextFridayMidnightET(sunday)).toBe(fridayMidnight(2026, 4, 16));
  });

  it("handles month boundaries", () => {
    // 2026-05-31 is a Sunday → next Saturday is 2026-06-06
    const lastDayOfMay = new Date(Date.UTC(2026, 4, 31, 12, 0, 0));
    expect(nextFridayMidnightET(lastDayOfMay)).toBe(fridayMidnight(2026, 5, 6));
  });
});
