import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PageTransition } from "@/components/PageTransition";
import { JsonLd } from "@/components/seo/JsonLd";
import "./globals.css";

// Per-route font loading: each route's page.tsx loads only the fonts it
// needs. Minimalist routes load Inter + JetBrains Mono. Capitol routes
// (/feed) load Cinzel + Cormorant Garamond + JetBrains Mono. The root
// layout stays font-agnostic so we don't ship 30KB of unused glyphs to
// every page (the homepage in particular shipped Cinzel + Cormorant
// before this change even though it never used them).

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "pitch-pit · weekly startup idea contest",
    template: "%s · pitch-pit",
  },
  description:
    "Submit a startup idea. Claude rates it YC-style. The community votes. Each week's winner gets built — for free.",
  openGraph: {
    type: "website",
    siteName: "pitch-pit",
    title: "pitch-pit · weekly startup idea contest",
    description:
      "Submit a startup idea. Claude rates it YC-style. Each week's winner gets built — for free.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "pitch-pit · weekly startup idea contest",
    description:
      "Submit a startup idea. Claude rates it YC-style. Each week's winner gets built — for free.",
  },
};

// Site-wide Organization schema. Picked up by Google's knowledge panel
// and other structured-data consumers; logo points at the auto-generated
// homepage OG card (Next renders it from app/opengraph-image.tsx) so we
// don't need to ship a separate logo asset. sameAs is intentionally empty
// — we'll add socials once they exist instead of seeding broken links.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "pitch-pit",
  url: SITE_URL,
  logo: `${SITE_URL}/opengraph-image`,
  sameAs: [],
} as const;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <JsonLd data={organizationJsonLd} />
        {/* Skip-to-content for keyboard / screen-reader users.
            Hidden until focused, then jumps the scroll past every header/nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[#FFB800] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-black focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
        >
          Skip to content
        </a>
        <PageTransition>{children}</PageTransition>
        {/* The manifesto footer is rendered by app/(with-footer)/layout.tsx
            rather than here, so the cinematic homepage and the idea
            reveal — both in (no-footer)/ — can render without it.
            Adding a new route opts in/out by directory placement. */}
        {/* Vercel Analytics — only ships data when deployed to Vercel.
            Tracks page views + Web Vitals. Configure in your Vercel dashboard. */}
        <Analytics />
        {/* Vercel Speed Insights — Real Experience Score (LCP, FID, CLS,
            FCP, TTFB) on real visitor sessions. Same Vercel-only behavior
            as Analytics; complements it with per-route perf attribution. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
