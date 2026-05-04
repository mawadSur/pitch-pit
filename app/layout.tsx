import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { Header } from "@/components/Header";
import { PageTransition } from "@/components/PageTransition";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitch-pit.app";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${cormorant.variable} ${jetbrains.variable}`}>
      <body className="font-body text-parchment antialiased">
        {/* Skip-to-content for keyboard / screen-reader users.
            Hidden until focused, then jumps the scroll past every header/nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[#FFB800] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-black focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
        >
          Skip to content
        </a>
        <Header />
        <PageTransition>{children}</PageTransition>
        <SiteFooter />
        {/* Vercel Analytics — only ships data when deployed to Vercel.
            Tracks page views + Web Vitals. Configure in your Vercel dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}
