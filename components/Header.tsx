"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Seal } from "@/components/ui/Seal";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Arena", href: "/" },
  { label: "Tributes", href: "/feed" },
  { label: "Victors", href: "/leaderboard" },
  { label: "Hall of Marvels", href: "/built" },
] as const;

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Minimalist scene routes ship their own header (MinimalistHeader) — keep the Capitol header out.
  if (
    pathname === "/" ||
    pathname.startsWith("/idea/") ||
    pathname.startsWith("/submit") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/built") ||
    pathname.startsWith("/rules") ||
    pathname.startsWith("/feed") ||
    pathname.startsWith("/submissions") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/about")
  ) {
    return null;
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-[background-color,backdrop-filter,border-color] duration-300",
        scrolled
          ? "border-b border-gold/35 bg-ink-charcoal/85 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md"
          : "border-b border-transparent bg-ink-charcoal/0",
      )}
    >
      {/* gold underline gradient */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent transition-opacity duration-300"
        style={{ opacity: scrolled ? 1 : 0.35 }}
      />

      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 sm:px-10 sm:py-4">
        <BrandMark scrolled={scrolled} />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link, i) => {
            const isActive = isActivePath(pathname, link.href);
            return (
              <span
                key={link.href}
                className="flex items-center"
              >
                <Link
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative px-3 py-2 font-display text-xs font-bold uppercase tracking-decree transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-4 focus-visible:ring-offset-ink-charcoal",
                    isActive
                      ? "text-gold-bright"
                      : "text-parchment/75 hover:text-parchment",
                  )}
                >
                  {link.label}
                  {isActive && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-gold to-transparent"
                    />
                  )}
                </Link>
                {i < NAV_LINKS.length - 1 && <Flourish />}
              </span>
            );
          })}
        </nav>

        {/* Desktop CTA */}
        <Link
          href="/submit"
          className={cn(
            "group relative hidden items-center border-2 border-gold bg-ink-rust/40 px-5 py-2 font-display text-xs font-bold uppercase tracking-decree text-parchment shadow-forge transition-colors duration-200 lg:inline-flex",
            "hover:border-gold-bright hover:bg-blood-deep/30 hover:text-gold-bright motion-safe:hover:animate-torchlight",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-4 focus-visible:ring-offset-ink-charcoal",
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 h-1.5 w-1.5 border-l-2 border-t-2 border-gold-bright opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 h-1.5 w-1.5 border-b-2 border-r-2 border-gold-bright opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          Offer Tribute
        </Link>

        <MobileMenuButton
          open={mobileOpen}
          onToggle={() => setMobileOpen((v) => !v)}
        />
      </div>

      {/* Mobile dropdown */}
      <MobileMenuPanel
        open={mobileOpen}
        pathname={pathname}
        onClose={() => setMobileOpen(false)}
      />
    </header>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function BrandMark({ scrolled }: { scrolled: boolean }) {
  return (
    <Link
      href="/"
      aria-label="pitch-pit · home"
      className={cn(
        "group flex items-center gap-3 transition-transform duration-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-4 focus-visible:ring-offset-ink-charcoal",
      )}
      style={{ transform: scrolled ? "translateY(-1px) scale(0.92)" : "none" }}
    >
      <Seal size={scrolled ? 38 : 46} />
      <span className="font-display text-base font-bold uppercase tracking-decree text-parchment transition-colors group-hover:text-gold-bright sm:text-lg">
        pitch-pit
      </span>
    </Link>
  );
}

function Flourish() {
  return (
    <svg
      aria-hidden
      className="text-gold/45"
      width="6"
      height="6"
      viewBox="0 0 6 6"
    >
      <path d="M3 0 L6 3 L3 6 L0 3 Z" fill="currentColor" />
    </svg>
  );
}

function MobileMenuButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="mobile-menu"
      aria-label={open ? "Close menu" : "Open menu"}
      className="inline-flex h-11 w-11 items-center justify-center border border-gold/40 text-parchment transition-colors hover:border-gold hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-4 focus-visible:ring-offset-ink-charcoal lg:hidden"
    >
      {open ? (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path
            d="M3 3 L15 15 M15 3 L3 15"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path
            d="M2 5h14M2 9h14M2 13h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

function MobileMenuPanel({
  open,
  pathname,
  onClose,
}: {
  open: boolean;
  pathname: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      id="mobile-menu"
      className="border-b border-gold/35 bg-ink-charcoal/95 backdrop-blur-md lg:hidden"
    >
      <nav className="flex flex-col py-3" aria-label="Primary">
        {NAV_LINKS.map((link) => {
          const isActive = isActivePath(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "border-l-2 px-6 py-3 font-display text-sm font-bold uppercase tracking-decree transition-colors",
                isActive
                  ? "border-gold bg-ink-rust/40 text-gold-bright"
                  : "border-transparent text-parchment/85 hover:bg-ink-rust/25 hover:text-parchment",
              )}
            >
              {link.label}
            </Link>
          );
        })}
        <Link
          href="/submit"
          onClick={onClose}
          className="mx-6 mb-4 mt-3 inline-flex items-center justify-center border-2 border-gold bg-blood-deep/20 px-5 py-3 font-display text-sm font-bold uppercase tracking-decree text-parchment shadow-forge hover:bg-blood-deep/40 hover:border-gold-bright hover:text-gold-bright"
        >
          Offer Tribute
        </Link>
      </nav>
    </div>
  );
}
