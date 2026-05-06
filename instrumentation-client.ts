// Sentry init for the browser bundle. Replaces the legacy sentry.client.config.ts
// — Next 14+ / Turbopack-ready convention.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

// Browser-extension noise that has nothing to do with our app but gets
// hoisted into our console (and into Sentry) by Chrome's global error
// hooks. Drop in beforeSend so we don't burn quota on extension drama,
// and suppress at the unhandledrejection level so it stops polluting
// DevTools too.
//
// • "listener indicated an asynchronous response... message channel closed":
//     extension's chrome.runtime.onMessage handler returned true to
//     promise an async reply, then the page navigated before sendResponse
//     fired. Originates in extension land (Grammarly, password managers,
//     MetaMask, etc.).
// • "ResizeObserver loop limit exceeded" / "ResizeObserver loop completed
//     with undelivered notifications": benign browser timing artifact;
//     never indicates a real bug.
const EXTENSION_NOISE_PATTERNS: RegExp[] = [
  /listener indicated an asynchronous response/i,
  /message channel closed before a response was received/i,
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i,
];

function isExtensionNoise(message: string): boolean {
  return EXTENSION_NOISE_PATTERNS.some((re) => re.test(message));
}

// Browser-side: stop the noise from reaching the DevTools console. We
// preventDefault only on matched patterns so genuine app rejections still
// surface as errors — silencing all unhandledrejections would hide real
// bugs. Window check guards SSR/edge bundles where window is undefined.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "";
    if (isExtensionNoise(message)) event.preventDefault();
  });
  window.addEventListener("error", (event) => {
    if (isExtensionNoise(event.message ?? "")) event.preventDefault();
  });
}

Sentry.init({
  dsn: "https://5bd18a616f2f904a6471e12663463dcb@o4511272590835712.ingest.us.sentry.io/4511272600076288",

  // 10% of transactions sampled — raise during incident investigation,
  // lower if you blow through the free-tier quota.
  tracesSampleRate: 0.1,

  // Replay integration dropped: error capture stays, session replay is gone, ~80 KB recovered from First Load JS.

  // Skip Sentry locally — keeps the dev console clean and avoids burning quota.
  enabled: process.env.NODE_ENV === "production",

  beforeSend(event) {
    const message =
      event.exception?.values?.[0]?.value ??
      (typeof event.message === "string" ? event.message : "") ??
      "";
    if (isExtensionNoise(message)) {
      return null; // drop — never reaches Sentry
    }
    return event;
  },
});

// Required by Sentry for Next 14 client-side router transition tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
