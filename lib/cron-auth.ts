import type { NextRequest } from "next/server";

// Vercel cron + any external scheduler authenticates by `Bearer
// $CRON_SECRET`. Returns false when the env var is unset so an empty
// CRON_SECRET can't accidentally authorize an `Authorization: Bearer `
// header that also has nothing after it.
export function verifyCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
