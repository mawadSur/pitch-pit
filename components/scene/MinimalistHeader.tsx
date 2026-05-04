"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/scene/Logo";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const NAV = [
  { label: "My pitches", href: "/submissions" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Gallery", href: "/built" },
  { label: "Rules", href: "/rules" },
] as const;

export function MinimalistHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  // Until auth.getUser() resolves on first mount, we don't know if the user
  // is signed in or not. Show a neutral placeholder (matched-width box) so
  // the right-side cluster doesn't visibly swap from "Sign in" → avatar.
  const [authResolved, setAuthResolved] = useState(false);

  // Track scroll position for the backdrop intensification.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Track session — both initial load and live changes.
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user);
      setAuthResolved(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthResolved(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="scene-header" data-scrolled={scrolled}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 sm:px-10 sm:py-5">
        {/* brand */}
        <Link
          href="/"
          aria-label="pitch-pit · home"
          className="group flex items-center transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]"
        >
          <Logo variant="lockup" size={30} />
        </Link>

        {/* center nav (desktop) */}
        <nav
          aria-label="Primary"
          className="hidden items-center gap-8 lg:flex"
        >
          {NAV.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-base font-medium text-white/85 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* right cluster — auth-aware (placeholder while resolving) */}
        <div className="flex items-center gap-3 sm:gap-4">
          {!authResolved ? (
            <AuthClusterSkeleton />
          ) : user ? (
            <UserMenu user={user} />
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-base font-medium text-white/85 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)] sm:inline-block"
              >
                Sign in
              </Link>
              <Link href="/login" className="cta-btn-primary text-base">
                Get started
                <span aria-hidden>→</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// Width-matched placeholder shown until the auth state is known.
// Roughly the same horizontal footprint as the resolved cluster
// ("Sign in" + "Get started" pill OR "Pitch idea" pill + avatar) so the
// header doesn't reflow on hydration.
function AuthClusterSkeleton() {
  return (
    <div
      aria-hidden
      className="flex items-center gap-3"
      // a tiny opacity nudges this below the user's perception threshold
      // while still reserving the right-side space.
      style={{ opacity: 0 }}
    >
      <span className="h-11 w-11 rounded-full bg-white/[0.04]" />
      <span className="h-11 w-36 rounded-full bg-white/[0.04]" />
    </div>
  );
}

function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "you";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const initial = (fullName[0] ?? "?").toUpperCase();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      {/* Pitch-now CTA stays visible alongside the avatar */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Link
          href="/submissions"
          className="cta-btn-primary hidden text-base sm:inline-flex"
        >
          Pitch idea
          <span aria-hidden>→</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Account menu — ${fullName}`}
          className="group flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.04] transition-colors hover:border-[var(--scene-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-base font-medium text-[var(--scene-gold-bright)]">
              {initial}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div
          role="menu"
          aria-label={`${fullName} menu`}
          className="absolute right-0 top-full mt-3 w-60 overflow-hidden rounded-xl border border-white/12 bg-[#0e0e10]/95 shadow-[0_24px_72px_-24px_rgba(0,0,0,0.85)] backdrop-blur-md"
        >
          <div className="border-b border-white/8 px-4 py-3">
            <p className="truncate text-sm font-medium text-white">
              {fullName}
            </p>
            {user.email && fullName !== user.email && (
              <p className="scene-mono mt-0.5 truncate text-[0.65rem] text-white/45">
                {user.email}
              </p>
            )}
          </div>
          <Link
            role="menuitem"
            href="/submissions"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-white/85 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            My pitches
          </Link>
          <Link
            role="menuitem"
            href="/submissions"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-white/85 transition-colors hover:bg-white/[0.04] hover:text-white sm:hidden"
          >
            Pitch a new idea
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={signOut}
            className="block w-full border-t border-white/8 px-4 py-2.5 text-left text-sm text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
