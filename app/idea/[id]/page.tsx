import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Reveal, type Idea } from "@/components/idea/Reveal";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitch-pit.app";

const SELECT =
  "id,user_id,title,pitch,handle,score,final_score,vote_count,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,screenshot_url,created_at";

async function fetchIdea(id: string): Promise<Idea | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("ideas")
    .select(SELECT)
    .eq("id", id)
    .in("status", ["scored", "queued", "building", "built"])
    .maybeSingle<Idea>();
  return data;
}

// Per-page metadata so each idea has its own title, description, and OG card.
// Falls back to the static layout metadata if the row is missing.
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const idea = await fetchIdea(params.id);
  if (!idea) return { title: "Idea not found" };

  const title = `${idea.title} — scored ${idea.final_score ?? idea.score * 10}/100`;
  const description = `"${idea.verdict}" — pitch-pit`;
  const url = `${SITE_URL}/idea/${idea.id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: { canonical: url },
  };
}

export default async function IdeaPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const [idea, { data: { user } }] = await Promise.all([
    fetchIdea(params.id),
    supabase.auth.getUser(),
  ]);

  if (!idea) notFound();

  // JSON-LD structured data — search engines render this as a rich result.
  // Schema.org "CreativeWork" is the closest fit for a public-facing pitch
  // submission; aggregateRating exposes both the AI score and community vote.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: idea.title,
    description: idea.verdict,
    text: idea.pitch,
    url: `${SITE_URL}/idea/${idea.id}`,
    datePublished: idea.created_at,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: idea.score,
      bestRating: 10,
      worstRating: 1,
      ratingCount: Math.max(1, idea.vote_count ?? 0),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Reveal idea={idea} currentUserId={user?.id ?? null} />
    </>
  );
}
