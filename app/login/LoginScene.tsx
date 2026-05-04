"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Particles } from "@/components/scene/Particles";
import { CornerSparkle } from "@/components/scene/CornerSparkle";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Logo } from "@/components/scene/Logo";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_S = 30;

export function LoginScene() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [oauthPending, setOauthPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Tick the resend cooldown every second
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  async function signInWithGoogle() {
    setError(null);
    setOauthPending(true);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (oauthError) throw oauthError;
      // Supabase redirects to Google — execution stops here.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
      setOauthPending(false);
    }
  }

  async function sendMagicLink(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    start(async () => {
      try {
        const supabase = createClient();
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (otpError) throw otpError;
        setSent(true);
        setCooldown(RESEND_COOLDOWN_S);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Magic link failed.");
      }
    });
  }

  async function resend() {
    if (cooldown > 0 || pending) return;
    await sendMagicLink();
  }

  return (
    <>
      <MinimalistHeader />
      <main id="main" className="scene relative isolate min-h-dvh overflow-hidden bg-black">
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div aria-hidden className="scene-beam" />
        <Particles />
        <div aria-hidden className="scene-grain" />

        <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-24">
          <div className="text-center">
            <Logo variant="mark" size={36} />
            <h1 className="mt-6 text-3xl font-medium leading-tight text-white sm:text-4xl">
              Sign in to <span className="italic text-[var(--scene-gold-bright)]">pitch-pit</span>
            </h1>
            <p className="mt-3 text-sm text-white/55 sm:text-base">
              Continue with Google or get a magic link by email.
            </p>
          </div>

          <div className="scene-card mt-10 w-full px-7 py-7 sm:px-8">
            {sent ? (
              <div className="text-center">
                <p className="scene-mono mb-3 text-[0.6rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
                  ✓ Check your inbox
                </p>
                <p className="text-base text-white/85">
                  A sign-in link was sent to{" "}
                  <span className="text-white">{email}</span>.
                </p>
                <p className="mt-3 text-xs text-white/45">
                  Didn&rsquo;t arrive? Check spam, or resend below.
                </p>

                <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={resend}
                    disabled={cooldown > 0 || pending}
                    aria-disabled={cooldown > 0 || pending}
                    className="cta-btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pending
                      ? "Sending…"
                      : cooldown > 0
                        ? `Resend in ${cooldown}s`
                        : "Resend link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSent(false);
                      setEmail("");
                      setCooldown(0);
                    }}
                    className="cta-btn-ghost text-sm"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Google OAuth */}
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  disabled={oauthPending || pending}
                  className="flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-base font-medium text-white transition-colors hover:border-white/35 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black disabled:opacity-60"
                >
                  <GoogleIcon />
                  {oauthPending ? "Redirecting…" : "Continue with Google"}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="scene-mono text-[0.6rem] uppercase tracking-[0.35em] text-white/35">
                    or
                  </span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                {/* Magic-link form */}
                <form onSubmit={sendMagicLink} className="space-y-4">
                  <label className="block">
                    <span className="scene-mono mb-2 block text-[0.6rem] uppercase tracking-[0.35em] text-white/55">
                      Email
                    </span>
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-base text-white placeholder:text-white/30 focus:border-[var(--scene-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/40"
                      aria-invalid={Boolean(error)}
                    />
                  </label>

                  {error && (
                    <p
                      role="alert"
                      className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-red-300/85"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={pending || oauthPending}
                    className="cta-btn-primary w-full justify-center"
                  >
                    {pending ? "Sending…" : "Send magic link"}
                    <span aria-hidden>→</span>
                  </button>
                </form>

                <p className="scene-mono text-center text-[0.6rem] uppercase tracking-[0.3em] text-white/35">
                  Powered by Supabase Auth
                </p>
              </div>
            )}
          </div>

          <Link
            href="/"
            className="scene-mono mt-8 text-[0.65rem] uppercase tracking-[0.35em] text-white/45 transition-colors hover:text-white"
          >
            ← Back to home
          </Link>
        </div>

        <div className="pointer-events-none absolute bottom-6 right-6 sm:bottom-8 sm:right-8">
          <CornerSparkle size={26} />
        </div>
      </main>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}
