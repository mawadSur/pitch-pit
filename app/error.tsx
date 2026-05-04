"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="scene relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <div aria-hidden className="scene-bg-gradient absolute inset-0" />
      <div className="relative z-10 max-w-md text-center">
        <p className="scene-mono text-[0.6rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
          Something broke
        </p>
        <h1 className="mt-3 text-3xl font-medium text-white sm:text-4xl">
          The pit caved in.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-white/65">
          An unexpected error stopped this page from rendering. We&rsquo;ve been
          notified.
        </p>
        {error.digest && (
          <p className="scene-mono mt-3 text-[0.6rem] uppercase tracking-[0.3em] text-white/35">
            ref · {error.digest}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="cta-btn-primary text-sm"
          >
            Try again
          </button>
          <Link
            href="/"
            className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/55 transition-colors hover:text-white"
          >
            ← back to the arena
          </Link>
        </div>
      </div>
    </main>
  );
}
