// Sentry init for the server bundle (Node-runtime API routes + RSC).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://5bd18a616f2f904a6471e12663463dcb@o4511272590835712.ingest.us.sentry.io/4511272600076288",

  // 10% of transactions sampled — raise during incident investigation,
  // lower if you blow through the free-tier quota.
  tracesSampleRate: 0.1,

  // Skip Sentry locally — keeps the dev console clean and stops `npm run dev`
  // from hitting your real DSN every request.
  enabled: process.env.NODE_ENV === "production",
});
