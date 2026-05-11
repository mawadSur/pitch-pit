import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { LoginScene } from "./LoginScene";
import "@/app/scene.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

const LOGIN_DESCRIPTION =
  "Sign in to pitch an idea, vote on the pit, or claim a build. Google or email magic link — no account, no entry. The hourglass is running.";

export const metadata: Metadata = {
  title: "Sign in — pitch-pit",
  description: LOGIN_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/login` },
  openGraph: {
    title: "Sign in — pitch-pit",
    description: LOGIN_DESCRIPTION,
    url: `${SITE_URL}/login`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign in — pitch-pit",
    description: LOGIN_DESCRIPTION,
  },
};

export default function LoginRoute() {
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <LoginScene />
    </div>
  );
}
