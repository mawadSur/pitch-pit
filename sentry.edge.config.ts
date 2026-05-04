// Sentry init for edge-runtime code (middleware, edge routes, OG image).
// Note: this config is unrelated to Vercel Edge Runtime — Sentry's "edge"
// covers any Next.js edge feature, including local dev.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://5bd18a616f2f904a6471e12663463dcb@o4511272590835712.ingest.us.sentry.io/4511272600076288",

  tracesSampleRate: 0.1,

  enabled: process.env.NODE_ENV === "production",
});
