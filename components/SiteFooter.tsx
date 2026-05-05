"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();

  // Hide on the homepage (full-bleed scrollable scene) and on the idea reveal
  // (its own bottom-anchored cluster). Everywhere else the footer can sit
  // quietly at page-end.
  if (pathname === "/" || pathname.startsWith("/idea/")) return null;

  const year = new Date().getFullYear();
  return (
    <footer
      role="contentinfo"
      className="relative z-10 border-t border-white/6 bg-[#0a0a0a]/80 px-6 py-6 sm:px-10"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <p className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-white/30">
          © {year} pitch-pit
        </p>
        <nav
          aria-label="Footer"
          // <sm: stack vertically so 320px viewports don't get awkward
          // line-breaks across "About / Rules / Privacy / Terms". sm:+
          // returns to a single row. py-2 on each link ensures ≥44pt
          // vertical touch height on mobile.
          className="flex flex-col items-center gap-y-1 scene-mono text-[0.65rem] uppercase tracking-[0.3em] sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2 sm:justify-end"
        >
          <Link
            href="/about"
            className="inline-flex items-center py-2 text-white/55 transition-colors hover:text-white/85"
          >
            About
          </Link>
          <Link
            href="/rules"
            className="inline-flex items-center py-2 text-white/55 transition-colors hover:text-white/85"
          >
            Rules
          </Link>
          <Link
            href="/privacy"
            className="inline-flex items-center py-2 text-white/55 transition-colors hover:text-white/85"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="inline-flex items-center py-2 text-white/55 transition-colors hover:text-white/85"
          >
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
