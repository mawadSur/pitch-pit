import { describe, it, expect } from "vitest";
import { nextMondayMidnightET } from "./week-cycle";

// All cases use UTC days. EDT (UTC-4) means the close target is Tuesday
// 04:00 UTC (= Monday midnight EDT). Reads:
//   "Wed noon UTC" → next Tue 04:00 UTC
//   "Tue 03:59 UTC" → today (this Tue 04:00 UTC), since the close hasn't passed
//   "Tue 04:00 UTC exactly" → next Tue (a week away), since it has just passed
//   "Sun morning UTC" → next Tue (2 days away)

function mondayMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, 4, 0, 0);
}

describe("nextMondayMidnightET", () => {
  it("from Wednesday returns the upcoming Tuesday 04:00 UTC", () => {
    // 2026-05-06 is a Wednesday
    const wed = new Date(Date.UTC(2026, 4, 6, 12, 0, 0));
    expect(nextMondayMidnightET(wed)).toBe(mondayMidnight(2026, 4, 12));
  });

  it("from Tuesday before 04:00 returns today's 04:00 UTC", () => {
    // 2026-05-12 is Tuesday — at 03:59 UTC, the close hasn't happened yet.
    const tuePre = new Date(Date.UTC(2026, 4, 12, 3, 59, 0));
    expect(nextMondayMidnightET(tuePre)).toBe(mondayMidnight(2026, 4, 12));
  });

  it("from Tuesday at exactly 04:00 returns next Tuesday", () => {
    // The current week has just closed.
    const tueAt = new Date(Date.UTC(2026, 4, 12, 4, 0, 0));
    expect(nextMondayMidnightET(tueAt)).toBe(mondayMidnight(2026, 4, 19));
  });

  it("from Tuesday afternoon returns next Tuesday", () => {
    const tueAfter = new Date(Date.UTC(2026, 4, 12, 18, 0, 0));
    expect(nextMondayMidnightET(tueAfter)).toBe(mondayMidnight(2026, 4, 19));
  });

  it("from Sunday morning returns the following Tuesday (2 days)", () => {
    const sun = new Date(Date.UTC(2026, 4, 10, 9, 0, 0));
    expect(nextMondayMidnightET(sun)).toBe(mondayMidnight(2026, 4, 12));
  });

  it("handles month boundaries", () => {
    // 2026-05-31 is a Sunday → next Tuesday is 2026-06-02
    const lastDayOfMay = new Date(Date.UTC(2026, 4, 31, 12, 0, 0));
    expect(nextMondayMidnightET(lastDayOfMay)).toBe(mondayMidnight(2026, 5, 2));
  });
});
