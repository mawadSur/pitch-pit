// Distributed rate-limit backed by Upstash Redis. Falls back to a per-worker
// in-memory bucket when env vars aren't set — that fallback is fine for local
// dev but DOES NOT protect production at scale (each Vercel worker has its
// own Map). Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in prod.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitVerdict = {
  success: boolean;
  remaining: number;
  reset: number; // epoch ms
  limit: number;
};

const hasUpstash =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

// Lazily create the Upstash limiter — module-level so the connection is reused
// across requests inside the same worker.
const upstashLimiter = hasUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      // 5 scoring requests per 10 minutes per IP.
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      analytics: true,
      prefix: "rl:score",
    })
  : null;

// Pitch coach calls (followups + enhance) — per-user, NOT per-IP. Each
// call is a Sonnet round-trip, so we cap at 20/10min/user. Higher than
// submission because users iterate on a draft (multiple followups +
// polish attempts) within a single session.
const upstashCoachLimiter = hasUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, "10 m"),
      analytics: true,
      prefix: "rl:coach",
    })
  : null;

// In-memory fallback — single-worker only. Same algorithm shape as the Upstash
// limiter so the call site doesn't care which path it took.
type Bucket = { count: number; reset: number };
const memBucketsByPrefix = new Map<string, Map<string, Bucket>>();

function memLimitWith(
  prefix: string,
  key: string,
  windowMs: number,
  limit: number,
): RateLimitVerdict {
  let buckets = memBucketsByPrefix.get(prefix);
  if (!buckets) {
    buckets = new Map();
    memBucketsByPrefix.set(prefix, buckets);
  }
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { success: true, remaining: limit - 1, reset: now + windowMs, limit };
  }
  if (entry.count >= limit) {
    return { success: false, remaining: 0, reset: entry.reset, limit };
  }
  entry.count++;
  return {
    success: true,
    remaining: limit - entry.count,
    reset: entry.reset,
    limit,
  };
}

const SCORE_LIMIT = 5;
const COACH_LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;

export async function limitScoreSubmission(
  ip: string,
): Promise<RateLimitVerdict> {
  if (upstashLimiter) {
    const r = await upstashLimiter.limit(ip);
    return {
      success: r.success,
      remaining: r.remaining,
      reset: r.reset,
      limit: r.limit,
    };
  }
  return memLimitWith("score", ip, WINDOW_MS, SCORE_LIMIT);
}

// Per-user rate limit for /api/pitch-coach. The route is auth-gated, so
// `userId` is always present at the call site. Falls back to the same
// in-memory bucket when Upstash isn't configured.
export async function limitCoachCalls(
  userId: string,
): Promise<RateLimitVerdict> {
  if (upstashCoachLimiter) {
    const r = await upstashCoachLimiter.limit(userId);
    return {
      success: r.success,
      remaining: r.remaining,
      reset: r.reset,
      limit: r.limit,
    };
  }
  return memLimitWith("coach", userId, WINDOW_MS, COACH_LIMIT);
}

// Surfaced for diagnostics — useful when probing whether prod is using the
// distributed limiter or silently falling back.
export const rateLimitBackend = hasUpstash ? "upstash" : "memory";
