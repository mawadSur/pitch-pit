import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Reveal, type Idea } from "@/components/idea/Reveal";
import type { Comment } from "@/components/idea/Comments";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitch-pit.app";

const SELECT =
  "id,user_id,title,pitch,handle,score,final_score,vote_count,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,screenshot_url,created_at";

// Joined comment shape — `users` table mirror provides display_name + avatar.
// Older comments from users without metadata may have nulls; the client
// component falls back to "guest" + initial avatar.
async function fetchComments(ideaId: string): Promise<Comment[]> {
  // Service-role client so we can read auth.users metadata via the public
  // users mirror (set up by migration 006).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("comments")
    .select(
      "id, user_id, idea_id, body, created_at, updated_at, users:user_id ( display_name, avatar_url )",
    )
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];
  // Flatten the joined users row into top-level display_name/avatar_url
  // so the client component doesn't need to know the join shape.
  return data.map((row) => {
    const u = (row as unknown as { users: { display_name?: string | null; avatar_url?: string | null } | null }).users;
    return {
      id: row.id,
      user_id: row.user_id,
      idea_id: row.idea_id,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      display_name: u?.display_name ?? null,
      avatar_url: u?.avatar_url ?? null,
    };
  });
}

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

  const comments = await fetchComments(idea.id);

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
      <Reveal
        idea={idea}
        currentUserId={user?.id ?? null}
        currentUser={user}
        initialComments={comments}
      />
    </>
  );
}
