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

// In-memory fallback — single-worker only. Same algorithm shape as the Upstash
// limiter so the call site doesn't care which path it took.
const memBuckets = new Map<string, { count: number; reset: number }>();
const MEM_LIMIT = 5;
const MEM_WINDOW_MS = 10 * 60 * 1000;

async function memLimit(key: string): Promise<RateLimitVerdict> {
  const now = Date.now();
  const entry = memBuckets.get(key);
  if (!entry || now > entry.reset) {
    memBuckets.set(key, { count: 1, reset: now + MEM_WINDOW_MS });
    return {
      success: true,
      remaining: MEM_LIMIT - 1,
      reset: now + MEM_WINDOW_MS,
      limit: MEM_LIMIT,
    };
  }
  if (entry.count >= MEM_LIMIT) {
    return {
      success: false,
      remaining: 0,
      reset: entry.reset,
      limit: MEM_LIMIT,
    };
  }
  entry.count++;
  return {
    success: true,
    remaining: MEM_LIMIT - entry.count,
    reset: entry.reset,
    limit: MEM_LIMIT,
  };
}

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
  return memLimit(ip);
}

// Surfaced for diagnostics — useful when probing whether prod is using the
// distributed limiter or silently falling back.
export const rateLimitBackend = hasUpstash ? "upstash" : "memory";
