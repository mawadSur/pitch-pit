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
import "../scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Live tributes — pitch-pit",
  description: "Every idea offered to the pit, in real time.",
};

export default async function FeedRoute() {
  let ideas: FeedIdea[] = [];
  try {
    const supabase = createClient();
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
