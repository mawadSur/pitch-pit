import Link from "next/link";

// Closing manifesto for every route in app/(with-footer)/. The two
// surfaces that opt out — `/` (cinematic homepage) and `/idea/[id]`
// (verdict reveal) — live in app/(no-footer)/ and never call this
// component, so the previous pathname-check is gone. Component is now
// a Server Component (no more usePathname / "use client" overhead).
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      role="contentinfo"
      className="relative z-10 mt-24 border-t border-white/[0.06] bg-[#0a0a0a]/80 px-6 pb-10 pt-16 sm:px-10 sm:pt-20"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <p className="scene-mono text-[0.55rem] uppercase tracking-[0.42em] text-[var(--scene-gold)]">
          · the manifesto ·
        </p>
        {/* Tagline lands here in the display serif. Two-line hierarchy:
            the brand line in italic Fraunces, the explanation row in
            normal Fraunces below. Display class pulls in optical-sizing
            so the 4xl/6xl renders with proper display proportions. */}
        <h2 className="scene-display-italic mt-5 text-balance text-3xl font-medium leading-[1.05] text-white sm:text-5xl lg:text-6xl">
          To the victor go the tokens.
        </h2>
        <p className="scene-display mt-6 max-w-xl text-balance text-base leading-snug text-white/65 sm:text-xl">
          A weekly pit. Three judges. One winner. The pit closes Monday at
          midnight EST.
        </p>

        {/* Legal nav — the quiet row. Set deliberately small + spread
            so the manifesto block above is the visual center of gravity. */}
        <nav
          aria-label="Footer"
          className="scene-mono mt-12 flex flex-col items-center gap-y-1 text-[0.55rem] uppercase tracking-[0.32em] sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-2"
        >
          <Link
            href="/about"
            className="inline-flex items-center py-2 text-white/45 transition-colors hover:text-white/85"
          >
            About
          </Link>
          <Link
            href="/rules"
            className="inline-flex items-center py-2 text-white/45 transition-colors hover:text-white/85"
          >
            Rules
          </Link>
          <Link
            href="/privacy"
            className="inline-flex items-center py-2 text-white/45 transition-colors hover:text-white/85"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="inline-flex items-center py-2 text-white/45 transition-colors hover:text-white/85"
          >
            Terms
          </Link>
          <span aria-hidden className="hidden text-white/15 sm:inline">
            ·
          </span>
          <span className="py-2 text-white/30 sm:py-0">© {year} pitch-pit</span>
        </nav>
      </div>
    </footer>
  );
}
