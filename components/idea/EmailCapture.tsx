"use client";

import { useRef, useState, useTransition } from "react";

// Visually-subordinate email capture. Compact single-line input + submit
// that POSTs { email, source } to /api/subscribe (double opt-in — the route
// always 200s and mails a confirm link). Inline success / error, no toast.
//
// Deliberately quiet styling so it never competes with a primary CTA (the
// vote button on the idea page, the auth card on /login). Props let each
// surface set its own copy + spacing without forking the component.
export function EmailCapture({
  source,
  className = "",
  headline = "get the weekly winner by email",
}: {
  // Where the signup happened — forwarded to /api/subscribe for conversion
  // analytics. Keep these stable; they're matched against the source column.
  source: string;
  className?: string;
  headline?: string;
}) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Boundary validation — mirror the server's email check so we don't fire
    // a doomed request on an obviously bad address.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email.");
      inputRef.current?.focus();
      return;
    }
    start(async () => {
      try {
        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), source }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Could not subscribe.");
        }
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not subscribe.");
        inputRef.current?.focus();
      }
    });
  }

  if (done) {
    return (
      <div className={className}>
        <p className="scene-mono text-[0.6rem] uppercase tracking-[0.32em] text-[var(--scene-gold)]">
          ✓ Check your inbox to confirm
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={className}>
      <p className="scene-mono mb-2.5 text-[0.6rem] uppercase tracking-[0.3em] text-white/45">
        {headline}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="you@example.com"
          aria-label="Email address"
          aria-invalid={Boolean(error)}
          className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--scene-gold)]/55 focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/35"
        />
        <button
          type="submit"
          disabled={pending}
          className="scene-mono shrink-0 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-2.5 text-[0.6rem] uppercase tracking-[0.3em] text-white/75 transition-colors hover:border-[var(--scene-gold)]/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-60"
        >
          {pending ? "Sending…" : "Notify me"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="scene-mono mt-2 text-[0.6rem] uppercase tracking-[0.3em] text-red-300/85"
        >
          {error}
        </p>
      )}
    </form>
  );
}
