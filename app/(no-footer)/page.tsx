import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { HomeScene, type VerdictCard } from "./HomeScene";
import { createClient } from "@/lib/supabase/server";
import { titleToSlug } from "@/lib/slug";
import type { TickerEntry } from "@/components/scene/LiveTicker";
import "./scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const metadata = {
  title: "pitch-pit — pitch your idea",
  description: "Submit your idea. The hourglass is running.",
};

// Re-render at most every 60s. The homepage counter strip and
// "last week's verdicts" cards shift slowly; a 60s ISR window is
// fresh enough for social proof without re-querying Supabase on
// every visitor.
export const revalidate = 60;

// Hide ticker submissions older than this. A slow week with stale
// "3d ago" entries reads worse than no row at all — when every entry
// is too old, the ticker section omits itself entirely.
const TICKER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TICKER_LIMIT = 5;

type HomeStats = {
  pitchedThisSeason: number;
  built: number;
  verdicts: VerdictCard[];
  latestIdeas: TickerEntry[];
};

// Fetch the homepage's social-proof + verdicts data in parallel.
// Failures degrade silently — <LiveCounter /> falls back to neutral
// copy and the verdicts section omits itself when empty.
async function loadHomeStats(): Promise<HomeStats> {
  try {
    const supabase = await createClient();
    const [pitchedRes, builtRes, verdictsRes, latestRes] = await Promise.all([
      supabase
        .from("ideas")
        .select("*", { count: "exact", head: true })
        .in("status", ["scored", "queued", "building", "built"]),
      supabase
        .from("ideas")
        .select("*", { count: "exact", head: true })
        .eq("status", "built"),
      supabase
        .from("ideas")
        .select("id,title,verdict,final_score")
        .in("status", ["scored", "queued", "building", "built"])
        .not("final_score", "is", null)
        .order("final_score", { ascending: false })
        .limit(3),
      // Latest tributes ticker — most recent scored+ ideas. We pull
      // TICKER_LIMIT then filter out anything older than 7 days client-
      // side here so the ticker doesn't read stale on a slow week.
      supabase
        .from("ideas")
        .select("id,title,handle,created_at")
        .in("status", ["scored", "queued", "building", "built"])
        .order("created_at", { ascending: false })
        .limit(TICKER_LIMIT),
    ]);

    const verdicts: VerdictCard[] = (verdictsRes.data ?? []).map((row) => {
      const slug = titleToSlug(row.title ?? "");
      return {
        id: row.id,
        title: row.title ?? "Untitled",
        verdict: row.verdict ?? "",
        finalScore: row.final_score ?? 0,
        href: slug ? `/idea/${row.id}/${slug}` : `/idea/${row.id}`,
      };
    });

    const now = Date.now();
    const latestIdeas: TickerEntry[] = (latestRes.data ?? [])
      .filter((row) => {
        if (!row.created_at) return false;
        const created = new Date(row.created_at).getTime();
        if (Number.isNaN(created)) return false;
        return now - created <= TICKER_MAX_AGE_MS;
      })
      .map((row) => {
        const slug = titleToSlug(row.title ?? "");
        return {
          id: row.id,
          title: row.title ?? "Untitled",
          handle:
            typeof row.handle === "string" && row.handle.length > 0
              ? row.handle
              : null,
          createdAt: row.created_at as string,
          href: slug ? `/idea/${row.id}/${slug}` : `/idea/${row.id}`,
        };
      });

    return {
      pitchedThisSeason: pitchedRes.count ?? 0,
      built: builtRes.count ?? 0,
      verdicts,
      latestIdeas,
    };
  } catch {
    return {
      pitchedThisSeason: 0,
      built: 0,
      verdicts: [],
      latestIdeas: [],
    };
  }
}

export default async function Home() {
  const stats = await loadHomeStats();
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <HomeScene
        pitchedThisSeason={stats.pitchedThisSeason}
        built={stats.built}
        verdicts={stats.verdicts}
        latestIdeas={stats.latestIdeas}
      />
    </div>
  );
}
