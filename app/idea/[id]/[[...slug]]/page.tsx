import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Reveal, type Idea } from "@/components/idea/Reveal";
import type { Comment } from "@/components/idea/Comments";
import { titleToSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

const SELECT =
  "id,user_id,title,pitch,handle,score,final_score,vote_count,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,screenshot_url,created_at,judge_scores,image_urls";

// Postgres "undefined column" — emitted when migration 015 hasn't been
// applied to the target Supabase yet. We retry without image_urls so
// /idea/[id] still renders for legacy ideas instead of throwing 404.
const UNDEFINED_COLUMN = "42703";

const SELECT_FALLBACK =
  "id,user_id,title,pitch,handle,score,final_score,vote_count,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,screenshot_url,created_at,judge_scores";

// Build the canonical public URL for an idea. When the title yields
// no usable slug (emoji-only, non-Latin script, whitespace), we keep
// the URL slug-less rather than emit a trailing dangling segment.
function ideaPath(id: string, title: string): string {
  const slug = titleToSlug(title);
  return slug ? `/idea/${id}/${slug}` : `/idea/${id}`;
}

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
      "id, user_id, idea_id, body, created_at, updated_at, is_edited, users:user_id ( display_name, avatar_url )",
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
      is_edited: (row as unknown as { is_edited?: boolean }).is_edited ?? false,
      display_name: u?.display_name ?? null,
      avatar_url: u?.avatar_url ?? null,
    };
  });
}

async function fetchIdea(id: string): Promise<Idea | null> {
  const supabase = await createClient();
  const first = await supabase
    .from("ideas")
    .select(SELECT)
    .eq("id", id)
    .in("status", ["scored", "queued", "building", "built"])
    .maybeSingle<Idea>();

  if (first.error?.code === UNDEFINED_COLUMN) {
    // Migration 015 hasn't been applied yet — drop image_urls and retry
    // so a stale schema doesn't take the whole idea page offline.
    const fallback = await supabase
      .from("ideas")
      .select(SELECT_FALLBACK)
      .eq("id", id)
      .in("status", ["scored", "queued", "building", "built"])
      .maybeSingle<Idea>();
    return fallback.data
      ? { ...fallback.data, image_urls: [] }
      : null;
  }

  // Normalize null → [] so client code doesn't have to branch.
  const data = first.data;
  if (!data) return null;
  return { ...data, image_urls: data.image_urls ?? [] };
}

// Per-page metadata so each idea has its own title, description, and OG card.
// Falls back to the static layout metadata if the row is missing.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { id } = await params;
  const idea = await fetchIdea(id);
  if (!idea) return { title: "Idea not found" };

  const title = `${idea.title} — scored ${idea.final_score ?? idea.score * 10}/100`;
  const description = `"${idea.verdict}" — pitch-pit`;
  // Canonical is always the slugged form (or bare UUID when slug
  // would be empty). Search engines consolidate signals here even if
  // a backlinked URL has a stale or wrong slug.
  const url = `${SITE_URL}${ideaPath(idea.id, idea.title)}`;

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
  // [[...slug]] makes slug an optional catch-all — undefined when the
  // visitor hits the bare /idea/<uuid>, otherwise the path segments.
  params: Promise<{ id: string; slug?: string[] }>;
}) {
  const { id, slug } = await params;
  const supabase = await createClient();

  const [idea, { data: { user } }] = await Promise.all([
    fetchIdea(id),
    supabase.auth.getUser(),
  ]);

  if (!idea) notFound();

  // Canonicalize the URL: if the visitor hit /idea/<uuid> with no
  // slug or a wrong slug, 301 to the canonical slugged form. Skip
  // when the derived slug is empty (emoji-only / non-Latin titles)
  // — otherwise we'd 301-loop the bare /idea/<uuid> back to itself.
  const desired = titleToSlug(idea.title);
  const provided = slug && slug.length > 0 ? slug.join("/") : "";
  if (desired && provided !== desired) {
    permanentRedirect(`/idea/${idea.id}/${desired}`);
  }

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
    url: `${SITE_URL}${ideaPath(idea.id, idea.title)}`,
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
