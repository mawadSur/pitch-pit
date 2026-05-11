import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createClient } from "@/lib/supabase/server";
import {
  FEED_SELECT,
  type FeedIdea,
  VISIBLE_STATUSES,
} from "@/lib/idea-types";
import { FeedScene } from "@/components/feed/FeedScene";
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FEED_DESCRIPTION =
  "Every idea offered to the pit, in real time. Watch new pitches land, get scored, and queue for the community vote — refreshed live as they arrive.";

export const metadata: Metadata = {
  title: "Live tributes — pitch-pit",
  description: FEED_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/feed` },
  openGraph: {
    title: "Live tributes — pitch-pit",
    description: FEED_DESCRIPTION,
    url: `${SITE_URL}/feed`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Live tributes — pitch-pit",
    description: FEED_DESCRIPTION,
  },
};

export default async function FeedRoute() {
  let ideas: FeedIdea[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ideas")
      .select(FEED_SELECT)
      .in("status", VISIBLE_STATUSES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(60);
    if (!error && data) ideas = data as FeedIdea[];
  } catch {
    // Supabase unavailable — render empty feed; realtime will populate it.
  }

  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <FeedScene initial={ideas} />
    </div>
  );
}
