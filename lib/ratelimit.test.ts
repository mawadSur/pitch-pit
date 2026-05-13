// Unit tests for lib/ratelimit.ts.
//
// Two execution paths to cover:
//   1. Upstash backend — when both UPSTASH_REDIS_REST_URL and
//      UPSTASH_REDIS_REST_TOKEN are set we instantiate three Ratelimit
//      objects (score / coach / anon-draft) and dispatch each public
//      function to its limiter. We mock @upstash/ratelimit at the
//      module boundary so no Redis call happens.
//   2. In-memory fallback — when either env var is missing each public
//      function uses a per-prefix Map. This bucket is per-process and
//      shared across calls; the test exercises increment-until-blocked
//      and per-prefix isolation.
//
// Because hasUpstash is evaluated at module-load time, every suite
// resets env + modules in its beforeEach.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NODE_ENV",
  "NEXT_PHASE",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
  }
  // Default: no upstash, NODE_ENV=test (already), no production assert.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    // process.env.NODE_ENV is typed readonly by @types/node, but vitest
    // tests routinely mutate it — cast around it locally so the file
    // type-checks without leaking the cast.
    const env = process.env as Record<string, string | undefined>;
    if (savedEnv[k] === undefined) {
      delete env[k];
    } else {
      env[k] = savedEnv[k];
    }
  }
  vi.resetModules();
});

// ─── Upstash-backed path ────────────────────────────────────────────
describe("ratelimit — Upstash backend", () => {
  // Hold one shared mock so we can inspect call args across the three
  // limiter instances.
  const limitMock = vi.fn();
  // Track which prefix each Ratelimit instance was constructed with.
  const constructedPrefixes: string[] = [];

  beforeEach(() => {
    constructedPrefixes.length = 0;
    limitMock.mockReset();

    vi.doMock("@upstash/ratelimit", () => {
      class FakeRatelimit {
        constructor(cfg: { prefix?: string }) {
          constructedPrefixes.push(cfg.prefix ?? "no-prefix");
        }
        limit(key: string) {
          return limitMock(key);
        }
        static slidingWindow(n: number, w: string) {
          return { kind: "sliding", n, w };
        }
      }
      return { Ratelimit: FakeRatelimit };
    });
    vi.doMock("@upstash/redis", () => ({
      Redis: { fromEnv: () => ({ tag: "fake-redis" }) },
    }));

    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
  });

  afterEach(() => {
    vi.doUnmock("@upstash/ratelimit");
    vi.doUnmock("@upstash/redis");
  });

  it("reports rateLimitBackend === 'upstash' and constructs three limiters with distinct prefixes", async () => {
    const mod = await import("./ratelimit");
    expect(mod.rateLimitBackend).toBe("upstash");
    expect(constructedPrefixes.sort()).toEqual(
      ["rl:anon-draft", "rl:coach", "rl:score"].sort(),
    );
  });

  it("limitScoreSubmission forwards (ip) to the upstash limiter and normalizes the verdict", async () => {
    limitMock.mockResolvedValueOnce({
      success: true,
      remaining: 4,
      reset: 1700000000,
      limit: 5,
    });
    const mod = await import("./ratelimit");
    const verdict = await mod.limitScoreSubmission("1.1.1.1");
    expect(limitMock).toHaveBeenCalledWith("1.1.1.1");
    expect(verdict).toEqual({
      success: true,
      remaining: 4,
      reset: 1700000000,
      limit: 5,
    });
  });

  it("limitCoachCalls forwards (userId) to upstash", async () => {
    limitMock.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: 1700000999,
      limit: 20,
    });
    const mod = await import("./ratelimit");
    const verdict = await mod.limitCoachCalls("user-a");
    expect(limitMock).toHaveBeenCalledWith("user-a");
    expect(verdict.success).toBe(false);
    expect(verdict.remaining).toBe(0);
    expect(verdict.limit).toBe(20);
  });

  it("limitAnonDrafts forwards (ip) to upstash", async () => {
    limitMock.mockResolvedValueOnce({
      success: true,
      remaining: 2,
      reset: 1700001234,
      limit: 3,
    });
    const mod = await import("./ratelimit");
    const verdict = await mod.limitAnonDrafts("2.2.2.2");
    expect(limitMock).toHaveBeenCalledWith("2.2.2.2");
    expect(verdict.limit).toBe(3);
  });
});

// ─── In-memory fallback path ────────────────────────────────────────
describe("ratelimit — in-memory fallback", () => {
  it("reports rateLimitBackend === 'memory' when Upstash env is unset", async () => {
    const mod = await import("./ratelimit");
    expect(mod.rateLimitBackend).toBe("memory");
  });

  it("limitScoreSubmission allows the first 5 hits then blocks the 6th (per-ip bucket)", async () => {
    const mod = await import("./ratelimit");
    const ip = "10.0.0.1";
    for (let i = 0; i < 5; i++) {
      const v = await mod.limitScoreSubmission(ip);
      expect(v.success).toBe(true);
      expect(v.limit).toBe(5);
      expect(v.remaining).toBe(5 - (i + 1));
    }
    const sixth = await mod.limitScoreSubmission(ip);
    expect(sixth.success).toBe(false);
    expect(sixth.remaining).toBe(0);
  });

  it("limitAnonDrafts allows the first 3 hits then blocks the 4th", async () => {
    const mod = await import("./ratelimit");
    const ip = "10.0.0.2";
    for (let i = 0; i < 3; i++) {
      const v = await mod.limitAnonDrafts(ip);
      expect(v.success).toBe(true);
      expect(v.limit).toBe(3);
    }
    const blocked = await mod.limitAnonDrafts(ip);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("limitCoachCalls allows the first 20 hits then blocks the 21st (per-user bucket)", async () => {
    const mod = await import("./ratelimit");
    const userId = "user-coach-1";
    for (let i = 0; i < 20; i++) {
      const v = await mod.limitCoachCalls(userId);
      expect(v.success).toBe(true);
    }
    const blocked = await mod.limitCoachCalls(userId);
    expect(blocked.success).toBe(false);
  });

  it("buckets are isolated per-prefix — exhausting score doesn't exhaust anon-draft", async () => {
    const mod = await import("./ratelimit");
    const ip = "10.0.0.3";
    // Exhaust score: 5 hits then a block.
    for (let i = 0; i < 5; i++) await mod.limitScoreSubmission(ip);
    const blockedScore = await mod.limitScoreSubmission(ip);
    expect(blockedScore.success).toBe(false);
    // anon-draft for the same ip still has full capacity.
    const anon = await mod.limitAnonDrafts(ip);
    expect(anon.success).toBe(true);
    expect(anon.remaining).toBe(2);
  });

  it("buckets are isolated per-key within the same prefix — different ips don't share a bucket", async () => {
    const mod = await import("./ratelimit");
    for (let i = 0; i < 5; i++) await mod.limitScoreSubmission("1.1.1.1");
    const otherIp = await mod.limitScoreSubmission("9.9.9.9");
    expect(otherIp.success).toBe(true);
    expect(otherIp.remaining).toBe(4);
  });
});

// ─── Production fail-fast ───────────────────────────────────────────
describe("ratelimit — production guard", () => {
  it("throws at import time when production + no Upstash + not build phase", async () => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    delete env.NEXT_PHASE;
    delete env.UPSTASH_REDIS_REST_URL;
    delete env.UPSTASH_REDIS_REST_TOKEN;
    await expect(import("./ratelimit")).rejects.toThrow(
      /UPSTASH_REDIS_REST_URL/,
    );
  });

  it("does NOT throw when NEXT_PHASE=phase-production-build (build collection)", async () => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    env.NEXT_PHASE = "phase-production-build";
    delete env.UPSTASH_REDIS_REST_URL;
    delete env.UPSTASH_REDIS_REST_TOKEN;
    const mod = await import("./ratelimit");
    expect(mod.rateLimitBackend).toBe("memory");
  });
});
