import { Inter, JetBrains_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import {
  LEADERBOARD_SELECT,
  type LeaderboardIdea,
  VISIBLE_STATUSES,
} from "@/lib/idea-types";
import { LeaderboardScene } from "./LeaderboardScene";
import "../scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-scene",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-scene-mono",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Leaderboard — pitch-pit",
};

async function fetchBoards(): Promise<{
  alltime: LeaderboardIdea[];
  week: LeaderboardIdea[];
  weekNumber: number | null;
}> {
  try {
    const supabase = createClient();

    // Find the current open week (or fall back to the most recent week)
    const { data: openWeek } = await supabase
      .from("weeks")
      .select("id, week_number")
      .eq("status", "open")
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const allTimeQuery = supabase
      .from("ideas")
      .select(LEADERBOARD_SELECT)
      .in("status", VISIBLE_STATUSES as unknown as string[])
      .not("score", "is", null)
      // Sort by final_score (50% AI + 50% community), tiebreaker on AI score
      .order("final_score", { ascending: false, nullsFirst: false })
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    let weekQuery = supabase
      .from("ideas")
      .select(LEADERBOARD_SELECT)
      .in("status", VISIBLE_STATUSES as unknown as string[])
      .not("score", "is", null);

    if (openWeek?.id) {
      // Filter to the current open week
      weekQuery = weekQuery.eq("week_id", openWeek.id);
    } else {
      // Fallback: last 7 days (for projects that haven't run migration 005 yet)
      const weekStart = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      weekQuery = weekQuery.gte("created_at", weekStart);
    }

    const [allTimeRes, weekRes] = await Promise.all([
      allTimeQuery,
      weekQuery
        .order("final_score", { ascending: false, nullsFirst: false })
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return {
      alltime: (allTimeRes.data ?? []) as LeaderboardIdea[],
      week: (weekRes.data ?? []) as LeaderboardIdea[],
      weekNumber: openWeek?.week_number ?? null,
    };
  } catch {
    return { alltime: [], week: [], weekNumber: null };
  }
}

export default async function LeaderboardRoute() {
  const { alltime, week, weekNumber } = await fetchBoards();
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable}`}
      style={{ display: "contents" }}
    >
      <LeaderboardScene
        alltime={alltime}
        week={week}
        weekNumber={weekNumber}
      />
    </div>
  );
}
