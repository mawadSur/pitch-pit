"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/scene/Logo";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const NAV = [
  { label: "My pitches", href: "/submissions" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Gallery", href: "/built" },
  { label: "Rules", href: "/rules" },
] as const;

// Match the current pathname against a nav href. True for exact match
// or any nested route (e.g. /idea/abc when href is /idea).
function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function MinimalistHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  // Until auth.getUser() resolves on first mount, we don't know if the user
  // is signed in or not. Show a neutral placeholder (matched-width box) so
  // the right-side cluster doesn't visibly swap from "Sign in" → avatar.
  const [authResolved, setAuthResolved] = useState(false);
  // Mobile menu (hamburger) — visible only <lg.
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

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

  // Auto-close mobile menu when route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close mobile menu on outside click + Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="scene-header" data-scrolled={scrolled} ref={mobileRef}>
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
          {NAV.map((l) => {
            const active = isActivePath(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "relative text-base font-semibold text-[var(--scene-gold-bright)] transition-colors after:absolute after:-bottom-1.5 after:left-0 after:right-0 after:h-px after:bg-[var(--scene-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]"
                    : "text-base font-medium text-white/85 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]"
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* right cluster — auth-aware (placeholder while resolving) */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Nav-3: global search reach. Sends the user to /leaderboard with
              ?focus=search; the leaderboard autofocuses its SearchBox when
              that query param is present. */}
          <Link
            href="/leaderboard?focus=search"
            aria-label="Search ideas"
            className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/85 transition-colors hover:border-[var(--scene-gold)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)] sm:flex"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="8" cy="8" r="5.5" />
              <path d="m12 12 3 3" />
            </svg>
          </Link>
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

          {/* hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-panel"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/85 transition-colors hover:border-[var(--scene-gold)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)] lg:hidden"
          >
            {menuOpen ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="4" y1="4" x2="14" y2="14" />
                <line x1="14" y1="4" x2="4" y2="14" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="3" y1="5" x2="15" y2="5" />
                <line x1="3" y1="9" x2="15" y2="9" />
                <line x1="3" y1="13" x2="15" y2="13" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* mobile dropdown panel — full-width strip beneath the header */}
      <div
        id="mobile-nav-panel"
        className={
          menuOpen
            ? "grid grid-rows-[1fr] overflow-hidden border-t border-white/8 bg-[#0e0e10]/95 backdrop-blur-md transition-[grid-template-rows] duration-200 ease-out lg:hidden"
            : "grid grid-rows-[0fr] overflow-hidden border-t border-transparent bg-[#0e0e10]/95 backdrop-blur-md transition-[grid-template-rows] duration-200 ease-out lg:hidden"
        }
        aria-hidden={!menuOpen}
      >
        <div className="min-h-0">
          <nav aria-label="Mobile primary" className="flex flex-col">
            {NAV.map((l) => {
              const active = isActivePath(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={
                    active
                      ? "border-b border-white/8 px-6 py-4 text-base font-semibold text-[var(--scene-gold-bright)] sm:px-10"
                      : "border-b border-white/8 px-6 py-4 text-base font-medium text-white/85 transition-colors hover:bg-white/[0.04] hover:text-white sm:px-10"
                  }
                >
                  {l.label}
                </Link>
              );
            })}
            {authResolved && !user && (
              <>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="border-b border-white/8 px-6 py-4 text-base font-medium text-white/85 transition-colors hover:bg-white/[0.04] hover:text-white sm:px-10"
                >
                  Sign in
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="px-6 py-4 text-base font-medium text-[var(--scene-gold-bright)] transition-colors hover:bg-white/[0.04] sm:px-10"
                >
                  Get started →
                </Link>
              </>
            )}
            {authResolved && user && (
              <MobileSignedInActions
                onClose={() => setMenuOpen(false)}
              />
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

function MobileSignedInActions({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    onClose();
    router.refresh();
  }
  return (
    <>
      <Link
        href="/submissions"
        onClick={onClose}
        className="border-b border-white/8 px-6 py-4 text-base font-medium text-[var(--scene-gold-bright)] transition-colors hover:bg-white/[0.04] sm:px-10"
      >
        Pitch idea →
      </Link>
      <button
        type="button"
        onClick={signOut}
        className="px-6 py-4 text-left text-base font-medium text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white sm:px-10"
      >
        Sign out
      </button>
    </>
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
            <Image
              src={avatarUrl}
              alt=""
              width={36}
              height={36}
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
