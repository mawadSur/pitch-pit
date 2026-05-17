import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createClient } from "@/lib/supabase/server";
import { JsonLd, type JsonLdData } from "@/components/seo/JsonLd";
import { titleToSlug } from "@/lib/slug";
import { RecapScene, type RecapContender, type RecapBuild } from "./RecapScene";
import "@/app/scene.css";

// /recap/[weekN] — auto-generated cinematic narrative per closed week.
// Pure data + template; no manual editing. Server component fetches the
// week, the winner, the top contenders, and the build status, then hands
// it all to the client RecapScene for the cinematic reveal animation.
//
// 404 conditions:
//   - week_number not a positive integer
//   - no `weeks` row for that number
//   - week.status === 'open' (open weeks have no recap yet — there's no
//     verdict to retell. The /leaderboard renders the open week instead)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RecapPageProps {
  params: Promise<{ weekN: string }>;
}

// Display fields the scene needs for contenders + the winner. judge_scores
// is omitted — recap is a narrative artifact, not a deep-detail view.
const IDEA_SELECT =
  "id,title,pitch,handle,score,vote_count,verdict,strengths,concerns,mvp_url,screenshot_url,status";

type IdeaRow = {
  id: string;
  title: string;
  pitch: string;
  handle: string | null;
  score: number | null;
  vote_count: number | null;
  verdict: string | null;
  strengths: string[] | null;
  concerns: string[] | null;
  mvp_url: string | null;
  screenshot_url: string | null;
  status: string;
};

type WeekRow = {
  id: string;
  week_number: number;
  status: "open" | "closed" | "built";
  start_at: string;
  end_at: string;
  winner_idea_id: string | null;
};

// Resolve params.weekN → positive integer, or null if it's garbage.
function parseWeekN(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

async function fetchRecap(weekNumber: number) {
  const supabase = await createClient();

  // 1. The week row itself. Anonymous + authenticated can both read
  //    weeks (RLS: `Weeks are public`). status='open' → 404 — no recap.
  const { data: weekRow } = await supabase
    .from("weeks")
    .select("id, week_number, status, start_at, end_at, winner_idea_id")
    .eq("week_number", weekNumber)
    .maybeSingle<WeekRow>();

  if (!weekRow || weekRow.status === "open") return null;

  // 2. Top 10 contenders from the frozen week_results snapshot. Use the
  //    snapshot rank so the recap never drifts after voting closes.
  //    Embedded `idea` resource pulls display fields in a single round trip.
  const { data: snapshotRows } = await supabase
    .from("week_results")
    .select(
      `rank,
       final_score,
       ai_score,
       vote_count,
       idea:ideas!inner(${IDEA_SELECT})`,
    )
    .eq("week_id", weekRow.id)
    .order("rank", { ascending: true })
    .limit(10);

  type SnapRow = {
    rank: number;
    final_score: number;
    ai_score: number;
    vote_count: number;
    idea: IdeaRow | IdeaRow[] | null;
  };
  const rows = (snapshotRows ?? []) as SnapRow[];
  const contenders: RecapContender[] = [];
  for (const r of rows) {
    // PostgREST returns the embed as either object or array depending on
    // FK cardinality inference. Normalize to a single idea.
    const idea = Array.isArray(r.idea) ? r.idea[0] : r.idea;
    if (!idea) continue;
    contenders.push({
      id: idea.id,
      title: idea.title,
      pitch: idea.pitch,
      handle: idea.handle,
      rank: r.rank,
      finalScore: r.final_score,
      aiScore: r.ai_score,
      voteCount: r.vote_count,
      verdict: idea.verdict,
      status: idea.status,
    });
  }

  // 3. The winner — typically contenders[0] but the winner_idea_id stored
  //    on `weeks` is the canonical pointer (it's what /winner uses too).
  //    Pull the full idea record so we have strengths/concerns for the
  //    "Verdict" section that the snapshot doesn't carry.
  let winnerIdea: IdeaRow | null = null;
  if (weekRow.winner_idea_id) {
    const { data } = await supabase
      .from("ideas")
      .select(IDEA_SELECT)
      .eq("id", weekRow.winner_idea_id)
      .maybeSingle<IdeaRow>();
    winnerIdea = data ?? null;
  }
  // Fallback: pick rank-1 from the snapshot if winner_idea_id isn't set
  // (legacy closed weeks where 005's close_current_week ran but the
  // 025 snapshot path predated winner persistence).
  if (!winnerIdea && contenders.length > 0) {
    const top = contenders[0];
    const { data } = await supabase
      .from("ideas")
      .select(IDEA_SELECT)
      .eq("id", top.id)
      .maybeSingle<IdeaRow>();
    winnerIdea = data ?? null;
  }

  // 4. Build queue row for the winner — only relevant if the idea moved
  //    past the queue. RLS lets anon read all non-token columns (see 024).
  //    No winner → no build. Idea not built → optional 'in progress' note.
  let build: RecapBuild | null = null;
  if (winnerIdea) {
    const { data: queue } = await supabase
      .from("build_queue")
      .select(
        "status, build_phase, mvp_url, repo_url, started_at, completed_at",
      )
      .eq("idea_id", winnerIdea.id)
      .maybeSingle();
    if (queue) {
      build = {
        status: (queue.status as string) ?? "pending",
        buildPhase: (queue.build_phase as string | null) ?? null,
        mvpUrl: (queue.mvp_url as string | null) ?? winnerIdea.mvp_url,
        repoUrl: (queue.repo_url as string | null) ?? null,
        screenshotUrl: winnerIdea.screenshot_url,
        startedAt: (queue.started_at as string | null) ?? null,
        completedAt: (queue.completed_at as string | null) ?? null,
      };
    } else if (winnerIdea.mvp_url || winnerIdea.status === "built") {
      // Legacy built rows can predate the build_queue auto-fill — but
      // mvp_url on the idea is still the canonical link.
      build = {
        status: winnerIdea.status === "built" ? "complete" : "pending",
        buildPhase: winnerIdea.status === "built" ? "complete" : null,
        mvpUrl: winnerIdea.mvp_url,
        repoUrl: null,
        screenshotUrl: winnerIdea.screenshot_url,
        startedAt: null,
        completedAt: null,
      };
    }
  }

  return { weekRow, winnerIdea, contenders, build };
}

export async function generateMetadata(
  props: RecapPageProps,
): Promise<Metadata> {
  const { weekN } = await props.params;
  const n = parseWeekN(weekN);
  const baseTitle = `Week ${n ?? weekN} recap — pitch-pit`;
  const baseDescription =
    "The week, the verdict, the build. The official pitch-pit recap.";

  // OG image for /recap/[weekN] — falls back gracefully (404) if the
  // week isn't recapped yet; share-card unfurlers will then default to
  // the root /opengraph-image.tsx, so this never breaks share previews.
  const ogUrl = n != null ? `${SITE_URL}/api/og/recap/${n}` : null;

  return {
    title: baseTitle,
    description: baseDescription,
    alternates: {
      canonical: n != null ? `${SITE_URL}/recap/${n}` : `${SITE_URL}/recap`,
    },
    openGraph: {
      title: baseTitle,
      description: baseDescription,
      type: "article",
      ...(ogUrl
        ? {
            images: [
              {
                url: ogUrl,
                width: 1200,
                height: 630,
                alt: baseTitle,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: baseTitle,
      description: baseDescription,
      ...(ogUrl ? { images: [ogUrl] } : {}),
    },
  };
}

export default async function RecapRoute(props: RecapPageProps) {
  const { weekN } = await props.params;
  const n = parseWeekN(weekN);
  if (n == null) notFound();

  const data = await fetchRecap(n);
  if (!data) notFound();

  const { weekRow, winnerIdea, contenders, build } = data;

  // schema.org Article structured data — a recap is editorial in nature
  // (selected, captioned, finalized). headline + datePublished + author
  // are the minimum fields most rich-result indexers want.
  const jsonLd: JsonLdData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `Week ${weekRow.week_number} recap`,
    datePublished: weekRow.end_at,
    url: `${SITE_URL}/recap/${weekRow.week_number}`,
    author: {
      "@type": "Organization",
      name: "pitch-pit",
      url: SITE_URL,
    },
    ...(winnerIdea
      ? {
          about: {
            "@type": "CreativeWork",
            name: winnerIdea.title,
            url: (() => {
              const slug = titleToSlug(winnerIdea.title);
              return slug
                ? `${SITE_URL}/idea/${winnerIdea.id}/${slug}`
                : `${SITE_URL}/idea/${winnerIdea.id}`;
            })(),
          },
        }
      : {}),
  };

  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <JsonLd data={jsonLd} />
      <RecapScene
        week={{
          weekNumber: weekRow.week_number,
          startAt: weekRow.start_at,
          endAt: weekRow.end_at,
          status: weekRow.status,
        }}
        winner={
          winnerIdea
            ? {
                id: winnerIdea.id,
                title: winnerIdea.title,
                pitch: winnerIdea.pitch,
                handle: winnerIdea.handle,
                aiScore: winnerIdea.score,
                voteCount: winnerIdea.vote_count,
                verdict: winnerIdea.verdict,
                strengths: winnerIdea.strengths ?? [],
                concerns: winnerIdea.concerns ?? [],
                status: winnerIdea.status,
                mvpUrl: winnerIdea.mvp_url,
                screenshotUrl: winnerIdea.screenshot_url,
                // The contender row carries the snapshot final_score; if
                // we found the winner there, hand it through so the page
                // shows the frozen value rather than the live one.
                finalScore:
                  contenders.find((c) => c.id === winnerIdea.id)?.finalScore ??
                  null,
              }
            : null
        }
        contenders={contenders}
        build={build}
      />
    </div>
  );
}
