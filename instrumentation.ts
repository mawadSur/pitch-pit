// Next.js 14 instrumentation hook — runs once per worker boot per runtime.
// Loads the matching Sentry init based on which runtime is starting.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Sentry's React Server Components error hook — captures errors thrown in
// async server components that React would otherwise swallow. Next.js looks
// for an export literally named `onRequestError`, so we alias Sentry's
// `captureRequestError` to that name.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
