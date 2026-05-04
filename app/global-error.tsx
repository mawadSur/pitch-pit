"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// global-error.tsx is the only error boundary that catches errors thrown in
// the root layout itself — without this, a layout-level crash shows the bare
// browser default. Pair with app/error.tsx (which catches everything below
// the layout).
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 11,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: "#FFB800",
            }}
          >
            Catastrophic failure
          </p>
          <h1 style={{ fontSize: 36, fontWeight: 500, marginTop: 12 }}>
            The whole arena fell.
          </h1>
          <p style={{ marginTop: 16, color: "rgba(255,255,255,0.65)" }}>
            We&rsquo;ve been notified. Try reloading.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)",
                marginTop: 12,
              }}
            >
              ref · {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
