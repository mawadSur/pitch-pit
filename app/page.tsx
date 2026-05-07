import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { HomeScene, type VerdictCard } from "./HomeScene";
import { createClient } from "@/lib/supabase/server";
import { titleToSlug } from "@/lib/slug";
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

type HomeStats = {
  pitchedThisSeason: number;
  built: number;
  verdicts: VerdictCard[];
};

// Fetch the homepage's social-proof + verdicts data in parallel.
// Failures degrade silently — <LiveCounter /> falls back to neutral
// copy and the verdicts section omits itself when empty.
async function loadHomeStats(): Promise<HomeStats> {
  try {
    const supabase = await createClient();
    const [pitchedRes, builtRes, verdictsRes] = await Promise.all([
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

    return {
      pitchedThisSeason: pitchedRes.count ?? 0,
      built: builtRes.count ?? 0,
      verdicts,
    };
  } catch {
    return { pitchedThisSeason: 0, built: 0, verdicts: [] };
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
      />
    </div>
  );
}
