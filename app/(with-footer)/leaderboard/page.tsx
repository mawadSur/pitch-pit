import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createClient } from "@/lib/supabase/server";
import {
  LEADERBOARD_SELECT,
  type LeaderboardIdea,
  VISIBLE_STATUSES,
} from "@/lib/idea-types";
import { JsonLd, type JsonLdData } from "@/components/seo/JsonLd";
import { titleToSlug } from "@/lib/slug";
import { LeaderboardScene } from "./LeaderboardScene";
import { type WeekSummary } from "./types";
import "@/app/scene.css";

export type { WeekSummary };

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

const LEADERBOARD_DESCRIPTION =
  "The standings, live. Every scored pitch ranked by final score — half AI, half crowd — recomputed every vote, frozen Monday at midnight EST.";

export const metadata: Metadata = {
  title: "Leaderboard — pitch-pit",
  description: LEADERBOARD_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/leaderboard` },
  openGraph: {
    title: "Leaderboard — pitch-pit",
    description: LEADERBOARD_DESCRIPTION,
    url: `${SITE_URL}/leaderboard`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Leaderboard — pitch-pit",
    description: LEADERBOARD_DESCRIPTION,
  },
};

// Escape PostgREST `ilike` special chars (`%` and `_`). Anything else can
// pass through — Supabase parameterizes the query so SQL injection isn't
// possible, but unescaped wildcards would let users craft slow queries.
function escapeLike(input: string): string {
  return input.replace(/[%_]/g, (c) => `\\${c}`);
}

async function fetchBoards(
  query: string | null,
  selectedWeekNumber: number | null,
): Promise<{
  alltime: LeaderboardIdea[];
  weekIdeas: LeaderboardIdea[];
  weeks: WeekSummary[];
  selectedWeek: WeekSummary | null;
  isFrozen: boolean;
}> {
  try {
    const supabase = await createClient();

    // Pull every week so the selector can render historical tabs.
    // Cheap: tens of rows even after a year of weekly cycles.
    const { data: weeksRows } = await supabase
      .from("weeks")
      .select("id, week_number, status, start_at, end_at, winner_idea_id")
      .order("week_number", { ascending: false });

    const weeks: WeekSummary[] = (weeksRows ?? []).map((w) => ({
      id: w.id as string,
      weekNumber: w.week_number as number,
      status: w.status as WeekSummary["status"],
      startAt: w.start_at as string,
      endAt: w.end_at as string,
      winnerIdeaId: (w.winner_idea_id as string | null) ?? null,
    }));

    // Resolve which week to render. Default to the most-recent open week.
    // If a `?week=N` is supplied, honor it (clamped to known weeks).
    const openWeek = weeks.find((w) => w.status === "open") ?? null;
    const selectedWeek =
      selectedWeekNumber != null
        ? weeks.find((w) => w.weekNumber === selectedWeekNumber) ?? null
        : openWeek;

    const trimmedQuery = query?.trim() ?? "";
    const searchPattern =
      trimmedQuery.length > 0 ? `%${escapeLike(trimmedQuery)}%` : null;

    // ── All-time board (always live) ──────────────────────────────
    let allTimeQuery = supabase
      .from("ideas")
      .select(LEADERBOARD_SELECT)
      .in("status", VISIBLE_STATUSES as unknown as string[])
      .not("score", "is", null);

    if (searchPattern) {
      allTimeQuery = allTimeQuery.or(
        `title.ilike.${searchPattern},pitch.ilike.${searchPattern}`,
      );
    }

    allTimeQuery = allTimeQuery
      .order("final_score", { ascending: false, nullsFirst: false })
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    // ── Per-week board ────────────────────────────────────────────
    // Open week → live ideas table. Closed week → frozen week_results
    // joined back to ideas for display fields.
    const isFrozen = selectedWeek?.status !== "open" && selectedWeek != null;

    let weekIdeas: LeaderboardIdea[] = [];

    if (selectedWeek && !isFrozen) {
      let weekQuery = supabase
        .from("ideas")
        .select(LEADERBOARD_SELECT)
        .in("status", VISIBLE_STATUSES as unknown as string[])
        .not("score", "is", null)
        .eq("week_id", selectedWeek.id);

      if (searchPattern) {
        weekQuery = weekQuery.or(
          `title.ilike.${searchPattern},pitch.ilike.${searchPattern}`,
        );
      }

      const { data } = await weekQuery
        .order("final_score", { ascending: false, nullsFirst: false })
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      weekIdeas = (data ?? []) as LeaderboardIdea[];
    } else if (selectedWeek && isFrozen) {
      // Frozen: read from week_results, then hydrate display fields.
      // PostgREST embedded resource — single round-trip.
      const { data } = await supabase
        .from("week_results")
        .select(
          `rank,
           final_score,
           ai_score,
           vote_count,
           idea:ideas!inner(${LEADERBOARD_SELECT})`,
        )
        .eq("week_id", selectedWeek.id)
        .order("rank", { ascending: true })
        .limit(20);

      const rows = (data ?? []) as Array<{
        rank: number;
        final_score: number;
        ai_score: number;
        vote_count: number;
        idea: LeaderboardIdea | LeaderboardIdea[];
      }>;
      // PostgREST returns embedded as either object or array depending on
      // FK cardinality inference. We always get one idea per row, but the
      // type can still be the array form. Normalize and override live
      // fields with snapshot values so the rendered card is true history.
      const hydrated: LeaderboardIdea[] = [];
      for (const r of rows) {
        const idea = Array.isArray(r.idea) ? r.idea[0] : r.idea;
        if (!idea) continue;
        hydrated.push({
          ...idea,
          final_score: r.final_score,
          score: r.ai_score,
          vote_count: r.vote_count,
        });
      }
      // Apply the search filter client-side for frozen weeks. The dataset
      // is at most 20 rows, so this is trivial.
      weekIdeas = searchPattern
        ? hydrated.filter((row) =>
            row.title.toLowerCase().includes(trimmedQuery.toLowerCase()),
          )
        : hydrated;
    }

    const allTimeRes = await allTimeQuery;

    return {
      alltime: (allTimeRes.data ?? []) as LeaderboardIdea[],
      weekIdeas,
      weeks,
      selectedWeek,
      isFrozen,
    };
  } catch {
    return {
      alltime: [],
      weekIdeas: [],
      weeks: [],
      selectedWeek: null,
      isFrozen: false,
    };
  }
}

export default async function LeaderboardRoute({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; week?: string }>;
}) {
  const { q, week: weekParam } = await searchParams;
  const query = q ?? null;
  const parsedWeek = weekParam ? Number.parseInt(weekParam, 10) : NaN;
  const selectedWeekNumber = Number.isFinite(parsedWeek) ? parsedWeek : null;
  const { alltime, weekIdeas, weeks, selectedWeek, isFrozen } =
    await fetchBoards(query, selectedWeekNumber);

  // ItemList structured data — top 10 by final score. Search engines
  // can render this as a "list of N" rich result. We pull from the
  // alltime board (already sorted final_score desc) so unfiltered
  // requests get the most authoritative ranking.
  const top10 = alltime.slice(0, 10);
  const jsonLd: JsonLdData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "pitch-pit · leaderboard",
    url: `${SITE_URL}/leaderboard`,
    numberOfItems: top10.length,
    itemListElement: top10.map((idea, i) => {
      // Slugged URL keeps the JSON-LD ItemList consistent with the
      // canonical /idea/<uuid>/<slug> form. Empty slug → bare UUID
      // (the page won't redirect-loop on those).
      const slug = titleToSlug(idea.title);
      const ideaUrl = slug
        ? `${SITE_URL}/idea/${idea.id}/${slug}`
        : `${SITE_URL}/idea/${idea.id}`;
      return {
        "@type": "ListItem" as const,
        position: i + 1,
        name: idea.title,
        url: ideaUrl,
      // final_score is 0–100; fall back to score×10 when only AI side
      // has settled (mirrors the rendering logic in the leaderboard UI).
      ...(idea.final_score != null || idea.score != null
        ? {
            additionalProperty: {
              "@type": "PropertyValue",
              name: "final_score",
              value: idea.final_score ?? idea.score * 10,
            },
          }
        : {}),
      };
    }),
  };

  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <JsonLd data={jsonLd} />
      <LeaderboardScene
        alltime={alltime}
        weekIdeas={weekIdeas}
        weeks={weeks}
        selectedWeek={selectedWeek}
        isFrozen={isFrozen}
        query={query ?? ""}
      />
    </div>
  );
}
