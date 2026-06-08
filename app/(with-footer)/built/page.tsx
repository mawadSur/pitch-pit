import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createClient } from "@/lib/supabase/server";
import { JsonLd, type JsonLdData } from "@/components/seo/JsonLd";
import { titleToSlug } from "@/lib/slug";
import { GalleryScene, type BuiltIdea } from "./GalleryScene";
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

const BUILT_DESCRIPTION =
  "Hall of Fame. Every weekly champion built into a live MVP — claimed by the founder, no equity, no fees. To the victor go the tokens.";

export const metadata: Metadata = {
  title: "Hall of Fame — pitch-pit",
  description: BUILT_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/built` },
  openGraph: {
    title: "Hall of Fame — pitch-pit",
    description: BUILT_DESCRIPTION,
    url: `${SITE_URL}/built`,
    type: "website",
    // OG card endpoint is being built by another agent — the URL is
    // wired up here so it lights up automatically once that route lands.
    // A 404 in the interim is harmless (consumers fall back to no image).
    images: [
      {
        url: `${SITE_URL}/api/og/winners`,
        width: 1200,
        height: 630,
        alt: "pitch-pit Hall of Fame",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hall of Fame — pitch-pit",
    description: BUILT_DESCRIPTION,
    images: [`${SITE_URL}/api/og/winners`],
  },
};

// Pull display fields + the week join so the gallery can lead each
// entry with its week number. Embedded `weeks` resource is a single
// round-trip via PostgREST (no extra query). `mvp_url` not null guards
// against built rows where the build_callback hasn't written the URL
// yet — a built entry without an mvp_url has nothing for the user to
// click through to and would render as an empty card.
// NOTE: the `week:weeks!ideas_week_id_fkey` embed MUST name the FK explicitly.
// There are two FKs between `ideas` and `weeks` (`ideas.week_id → weeks.id`
// from migration 005, and `weeks.winner_idea_id → ideas.id`), so a bare
// `weeks(...)` embed is ambiguous and PostgREST rejects it with "more than one
// relationship was found". That error was caught by fetchBuilt()'s try/catch
// and silently returned [], leaving the Hall of Fame permanently empty.
const SELECT =
  "id,title,pitch,handle,score,final_score,verdict,mvp_url,screenshot_url,updated_at,week:weeks!ideas_week_id_fkey(week_number)";

async function fetchBuilt(): Promise<BuiltIdea[]> {
  try {
    const supabase = await createClient();
    // Chronological by week, newest first. Falling back to updated_at
    // covers legacy rows where week_id is null (pre-005 migration data)
    // — they sort to the bottom because their `weeks` embed comes back
    // null and PostgREST nulls-last for nested sort isn't reliable.
    // updated_at desc is the deterministic tiebreaker.
    const { data, error } = await supabase
      .from("ideas")
      .select(SELECT)
      .eq("status", "built")
      .not("mvp_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (error || !data) return [];
    // PostgREST returns embedded `weeks` as object or array depending on
    // FK cardinality inference. Normalize to a flat `week_number` on the
    // row so the client component doesn't need to know about embeds.
    type Row = Omit<BuiltIdea, "week_number"> & {
      week:
        | { week_number: number }
        | { week_number: number }[]
        | null;
    };
    const rows = data as unknown as Row[];
    const normalized: BuiltIdea[] = rows.map((r) => {
      const week = Array.isArray(r.week) ? r.week[0] : r.week;
      return {
        id: r.id,
        title: r.title,
        pitch: r.pitch,
        handle: r.handle,
        score: r.score,
        final_score: r.final_score,
        verdict: r.verdict,
        mvp_url: r.mvp_url,
        screenshot_url: r.screenshot_url,
        updated_at: r.updated_at,
        week_number: week?.week_number ?? null,
      };
    });
    // Final ordering: week_number desc (nulls last), then updated_at desc.
    // Doing this in JS — Postgres can't sort on an embedded column
    // without a more elaborate view, and the dataset is tiny (<= 60).
    normalized.sort((a, b) => {
      const aw = a.week_number ?? -Infinity;
      const bw = b.week_number ?? -Infinity;
      if (aw !== bw) return bw - aw;
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    });
    return normalized;
  } catch {
    return [];
  }
}

export default async function BuiltRoute() {
  const ideas = await fetchBuilt();

  // ItemList structured data — gives search a clean enumeration of the
  // built MVPs (each with an off-site target via mvp_url when available,
  // falling back to the in-app idea page so the entry still resolves).
  const jsonLd: JsonLdData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "pitch-pit · Hall of Fame",
    url: `${SITE_URL}/built`,
    numberOfItems: ideas.length,
    itemListElement: ideas.map((idea, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: idea.title,
      url:
        idea.mvp_url ??
        (() => {
          // Fallback to the canonical idea page when no MVP URL exists.
          // Slugged form keeps the JSON-LD URL consistent with the rest
          // of the site and avoids shipping bare-UUID links into search
          // engines' rich-result indexing.
          const slug = titleToSlug(idea.title);
          return slug
            ? `${SITE_URL}/idea/${idea.id}/${slug}`
            : `${SITE_URL}/idea/${idea.id}`;
        })(),
    })),
  };

  return (
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <JsonLd data={jsonLd} />
      <GalleryScene ideas={ideas} />
    </div>
  );
}
