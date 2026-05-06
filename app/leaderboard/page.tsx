import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
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
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Leaderboard — pitch-pit",
};

// Escape PostgREST `ilike` special chars (`%` and `_`). Anything else can
// pass through — Supabase parameterizes the query so SQL injection isn't
// possible, but unescaped wildcards would let users craft slow queries.
function escapeLike(input: string): string {
  return input.replace(/[%_]/g, (c) => `\\${c}`);
}

async function fetchBoards(query: string | null): Promise<{
  alltime: LeaderboardIdea[];
  week: LeaderboardIdea[];
  weekNumber: number | null;
}> {
  try {
    const supabase = await createClient();

    // Find the current open week (or fall back to the most recent week)
    const { data: openWeek } = await supabase
      .from("weeks")
      .select("id, week_number")
      .eq("status", "open")
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const trimmedQuery = query?.trim() ?? "";
    const searchPattern =
      trimmedQuery.length > 0 ? `%${escapeLike(trimmedQuery)}%` : null;

    let allTimeQuery = supabase
      .from("ideas")
      .select(LEADERBOARD_SELECT)
      .in("status", VISIBLE_STATUSES as unknown as string[])
      .not("score", "is", null);

    if (searchPattern) {
      // Match against title OR pitch text, case-insensitive.
      allTimeQuery = allTimeQuery.or(
        `title.ilike.${searchPattern},pitch.ilike.${searchPattern}`,
      );
    }

    allTimeQuery = allTimeQuery
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

    if (searchPattern) {
      weekQuery = weekQuery.or(
        `title.ilike.${searchPattern},pitch.ilike.${searchPattern}`,
      );
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

export default async function LeaderboardRoute({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q ?? null;
  const { alltime, week, weekNumber } = await fetchBoards(query);
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <LeaderboardScene
        alltime={alltime}
        week={week}
        weekNumber={weekNumber}
        query={query ?? ""}
      />
    </div>
  );
}
