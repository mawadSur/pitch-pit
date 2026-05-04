// Sentry init for the browser bundle. Replaces the legacy sentry.client.config.ts
// — Next 14+ / Turbopack-ready convention.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://5bd18a616f2f904a6471e12663463dcb@o4511272590835712.ingest.us.sentry.io/4511272600076288",

  // 10% of transactions sampled — raise during incident investigation,
  // lower if you blow through the free-tier quota.
  tracesSampleRate: 0.1,

  // Session Replay — masked + media-blocked so we don't capture PII from the
  // pitch textarea. Only fires on errors, not on every session.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Skip Sentry locally — keeps the dev console clean and avoids burning quota.
  enabled: process.env.NODE_ENV === "production",
});

// Required by Sentry for Next 14 client-side router transition tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
