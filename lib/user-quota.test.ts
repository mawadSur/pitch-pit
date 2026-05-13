// Unit tests for lib/user-quota.ts.
//
// checkUserQuota() runs a single Supabase SELECT for the user's
// submissions in the trailing 7 days, returns a structured verdict,
// and explicitly fails CLOSED on DB error (category: "lookup-failed").
// We mock the admin client at the module boundary so we can vary the
// rows + error path per test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = { created_at: string };
type State = {
  rows?: Row[];
  error?: { message: string };
};

let state: State = {};
// Capture the chain args so we can assert the route is using the right
// user_id + window predicate.
let lastQuery: {
  table?: string;
  eqArgs: Array<[string, unknown]>;
  gteArgs: Array<[string, unknown]>;
  orderArgs: Array<[string, unknown]>;
  limitArg?: number;
  selectArg?: string;
} = {
  eqArgs: [],
  gteArgs: [],
  orderArgs: [],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      lastQuery.table = table;
      const builder: Record<string, unknown> = {};
      builder.select = (cols: string) => {
        lastQuery.selectArg = cols;
        return builder;
      };
      builder.eq = (col: string, val: unknown) => {
        lastQuery.eqArgs.push([col, val]);
        return builder;
      };
      builder.gte = (col: string, val: unknown) => {
        lastQuery.gteArgs.push([col, val]);
        return builder;
      };
      builder.order = (col: string, opts: unknown) => {
        lastQuery.orderArgs.push([col, opts]);
        return builder;
      };
      builder.limit = async (n: number) => {
        lastQuery.limitArg = n;
        return {
          data: state.rows ?? [],
          error: state.error ?? null,
        };
      };
      return builder;
    },
  }),
}));

import { checkUserQuota, WEEKLY_LIMIT } from "./user-quota";

beforeEach(() => {
  state = {};
  lastQuery = {
    eqArgs: [],
    gteArgs: [],
    orderArgs: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkUserQuota", () => {
  it("returns ok=true with used=0 when the user has no recent submissions", async () => {
    state.rows = [];
    const verdict = await checkUserQuota("user-a");
    expect(verdict.ok).toBe(true);
    expect(verdict.used).toBe(0);
    expect(verdict.limit).toBe(WEEKLY_LIMIT);
    expect(verdict.resetAt).toBeNull();
    expect(verdict.category).toBeUndefined();
  });

  it("queries the ideas table, scoped to user_id, with a 7-day-ago lower bound", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-13T12:00:00.000Z");
    vi.setSystemTime(now);
    state.rows = [];
    await checkUserQuota("user-a");

    expect(lastQuery.table).toBe("ideas");
    expect(lastQuery.eqArgs).toEqual([["user_id", "user-a"]]);
    // 7 days = 7 * 24 * 60 * 60 * 1000 ms
    const expectedSince = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(lastQuery.gteArgs).toEqual([["created_at", expectedSince]]);
    // Asc order so the oldest is at index 0 (used to compute resetAt).
    expect(lastQuery.orderArgs[0][0]).toBe("created_at");
    // limit = WEEKLY_LIMIT + 1 (route only needs to know ≥ limit).
    expect(lastQuery.limitArg).toBe(WEEKLY_LIMIT + 1);
  });

  it("returns ok=true when used < WEEKLY_LIMIT, with resetAt 7 days after the oldest row", async () => {
    const oldest = "2026-05-10T00:00:00.000Z";
    state.rows = [{ created_at: oldest }];
    const verdict = await checkUserQuota("user-a");
    expect(verdict.ok).toBe(true);
    expect(verdict.used).toBe(1);
    expect(verdict.resetAt).toEqual(
      new Date(new Date(oldest).getTime() + 7 * 24 * 60 * 60 * 1000),
    );
  });

  it("returns ok=false category='limit-reached' when used >= WEEKLY_LIMIT", async () => {
    // WEEKLY_LIMIT is 2; supply 2 rows.
    const oldest = "2026-05-08T00:00:00.000Z";
    const newer = "2026-05-12T00:00:00.000Z";
    state.rows = [{ created_at: oldest }, { created_at: newer }];
    const verdict = await checkUserQuota("user-a");
    expect(verdict.ok).toBe(false);
    expect(verdict.category).toBe("limit-reached");
    expect(verdict.used).toBe(2);
    expect(verdict.resetAt).toEqual(
      new Date(new Date(oldest).getTime() + 7 * 24 * 60 * 60 * 1000),
    );
    expect(verdict.reason).toMatch(/limit reached/i);
    // The reason should mention the reset time so the UI can echo it.
    expect(verdict.reason).toContain(
      verdict.resetAt!.toUTCString(),
    );
  });

  it("fails CLOSED on DB error with category='lookup-failed' (not 'limit-reached')", async () => {
    state.error = { message: "boom" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const verdict = await checkUserQuota("user-a");
    expect(verdict.ok).toBe(false);
    expect(verdict.category).toBe("lookup-failed");
    expect(verdict.used).toBe(0);
    expect(verdict.resetAt).toBeNull();
    expect(verdict.reason).toMatch(/could not verify/i);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
