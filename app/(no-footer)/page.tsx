import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { HomeScene, type VerdictCard } from "./HomeScene";
import type { WinnerHero } from "./HeroWinner";
import { createClient } from "@/lib/supabase/server";
import { titleToSlug } from "@/lib/slug";
import type { TickerEntry } from "@/components/scene/LiveTicker";
import "@/app/scene.css";

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
  /** Last week's winner for the above-fold HeroWinner block. Null
   *  when no built/building idea exists (fresh DB or pre-first
   *  cycle) — HeroWinner renders a placeholder in that case. */
  winner: WinnerHero | null;
};

// Max length of the pitch excerpt shown on the HeroWinner card. Long
// enough to communicate the idea, short enough to never wrap past 2
// lines on lg viewports inside the card's text column.
const WINNER_EXCERPT_MAX = 140;

function buildExcerpt(pitch: string | null | undefined): string {
  if (!pitch) return "";
  // First sentence up to the cap, with ellipsis if the sentence runs
  // past the cap. Avoids cutting mid-word.
  const trimmed = pitch.trim();
  const firstStop = trimmed.search(/[.!?\n]/);
  const candidate =
    firstStop > 0 ? trimmed.slice(0, firstStop).trim() : trimmed;
  if (candidate.length <= WINNER_EXCERPT_MAX) return candidate;
  const head = candidate.slice(0, WINNER_EXCERPT_MAX);
  const lastSpace = head.lastIndexOf(" ");
  return (lastSpace > 40 ? head.slice(0, lastSpace) : head).trim() + "…";
}

// Fetch the homepage's social-proof + verdicts data in parallel.
// Failures degrade silently — <LiveCounter /> falls back to neutral
// copy and the verdicts section omits itself when empty.
async function loadHomeStats(): Promise<HomeStats> {
  try {
    const supabase = await createClient();
    const [pitchedRes, builtRes, verdictsRes, latestRes, winnerRes] =
      await Promise.all([
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
        // TICKER_LIMIT then filter out anything older than 7 days
        // client-side here so the ticker doesn't read stale on a slow
        // week.
        supabase
          .from("ideas")
          .select("id,title,handle,created_at")
          .in("status", ["scored", "queued", "building", "built"])
          .order("created_at", { ascending: false })
          .limit(TICKER_LIMIT),
        // HeroWinner — pick the single most recent winner to feature
        // above the fold. Prefer status='built' (the canonical winner
        // surface); fall back to status='building' so the section
        // shows the live build during the build window. We pull both
        // statuses in one query and pick built-first below, rather
        // than relying on Postgres status-string ordering. created_at
        // breaks ties so the newest matching row wins.
        supabase
          .from("ideas")
          .select(
            "id,title,pitch,verdict,final_score,mvp_url,status,created_at",
          )
          .in("status", ["built", "building"])
          .order("created_at", { ascending: false })
          .limit(8),
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

    // Pick the HeroWinner from the candidate set: prefer the most
    // recent built row; fall back to the most recent building row.
    // The query is already ordered by created_at desc, so .find() on
    // each filter yields the newest within its status bucket.
    const winnerCandidates = winnerRes.data ?? [];
    const builtRow = winnerCandidates.find((r) => r.status === "built");
    const buildingRow = winnerCandidates.find((r) => r.status === "building");
    const pickedWinner = builtRow ?? buildingRow ?? null;

    const winner: WinnerHero | null = pickedWinner
      ? {
          id: pickedWinner.id,
          title: pickedWinner.title ?? "Untitled",
          excerpt: buildExcerpt(pickedWinner.pitch),
          verdict: pickedWinner.verdict ?? "",
          finalScore: pickedWinner.final_score ?? null,
          mvpUrl: pickedWinner.mvp_url ?? null,
          // /winner/[ideaId] is the dedicated WIP winner page — owned
          // by another agent; we only link to it, never modify it.
          href: `/winner/${pickedWinner.id}`,
          isBuilt: pickedWinner.status === "built",
        }
      : null;

    return {
      pitchedThisSeason: pitchedRes.count ?? 0,
      built: builtRes.count ?? 0,
      verdicts,
      latestIdeas,
      winner,
    };
  } catch {
    return {
      pitchedThisSeason: 0,
      built: 0,
      verdicts: [],
      latestIdeas: [],
      winner: null,
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
        winner={stats.winner}
      />
    </div>
  );
}
