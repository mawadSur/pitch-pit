import { notFound, permanentRedirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/geist-mono";
import { fraunces } from "@/lib/fonts/fraunces";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Reveal, type Idea } from "@/components/idea/Reveal";
import type { Comment } from "@/components/idea/Comments";
import { HourglassWatermark } from "@/components/scene/HourglassWatermark";
import { titleToSlug } from "@/lib/slug";
import { JsonLd, type JsonLdData } from "@/components/seo/JsonLd";
import "@/app/scene.css";

// Per-route font loading: Inter (body/UI), Geist Mono (captions/labels),
// Fraunces (display serif for h1, verdict pull-quote, big score numerals).
// Mirrors the pattern in every other minimalist route — don't push these
// to the root layout, they'd ship on every route.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pitchpit.app";

// Note: claim_token is selected via the admin client below (see fetchClaimToken)
// rather than the cookie-aware client here. RLS on `ideas` doesn't expose
// claim_token to anonymous readers, and we don't want to broaden the public
// SELECT to include it. The `Idea` type the page renders therefore stays free
// of claim_token; the cookie-match signal is computed server-side and passed
// to Reveal as a prop.
const SELECT =
  "id,user_id,title,pitch,handle,score,final_score,vote_count,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,screenshot_url,created_at,judge_scores,image_urls";

// Postgres "undefined column" — emitted when migration 015 hasn't been
// applied to the target Supabase yet. We retry without image_urls so
// /idea/[id] still renders for legacy ideas instead of throwing 404.
const UNDEFINED_COLUMN = "42703";

const SELECT_FALLBACK =
  "id,user_id,title,pitch,handle,score,final_score,vote_count,verdict,strengths,concerns,reasoning,build_recommended,status,mvp_url,screenshot_url,created_at,judge_scores";

/* Resolve the status of the week this idea belongs to ("open" |
 * "closed" | "built"). Drives the VoteButton lock — voting RLS
 * (migration 025) only accepts inserts on open-week ideas, so the
 * UI hides the button rather than letting the request 403.
 *
 * Defaults to "open" on any failure (missing week_id, migration 005
 * not applied, query error) so a partial schema doesn't lock voting
 * for a freshly-deployed clone. */
async function fetchWeekStatusForIdea(
  ideaId: string,
): Promise<"open" | "closed" | "built"> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ideas")
    .select("week:weeks!inner(status)")
    .eq("id", ideaId)
    .maybeSingle<{ week: { status: string } | { status: string }[] | null }>();
  if (!data?.week) return "open";
  const week = Array.isArray(data.week) ? data.week[0] : data.week;
  const status = week?.status;
  if (status === "closed" || status === "built") return status;
  return "open";
}

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

// Read the idea's claim_token via the admin client. Returns null when:
//   - the idea is signed-in / already claimed (claim_token never set)
//   - migration 018 hasn't been applied (column doesn't exist)
//   - the idea row is missing (we fail-soft; the main fetchIdea handles 404)
//
// Never throws; the worst case is "no claim CTA renders." We don't want
// a flaky claim_token lookup to take the whole idea page offline.
async function fetchClaimToken(id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ideas")
    .select("claim_token")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code === UNDEFINED_COLUMN) return null;
    return null;
  }
  return (data as { claim_token?: string | null } | null)?.claim_token ?? null;
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

  // Built ideas get the polished BUILT-stamped OG card from
  // `/api/og/[ideaId]`. Other statuses fall through to the
  // colocated `opengraph-image.tsx` (generic scored-idea card) —
  // explicitly returning no `images` here lets Next.js pick that up.
  const builtOgImage =
    idea.status === "built"
      ? [
          {
            url: `${SITE_URL}/api/og/${idea.id}`,
            width: 1200,
            height: 630,
            alt: `${idea.title} — built on pitch-pit`,
          },
        ]
      : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "article",
      ...(builtOgImage ? { images: builtOgImage } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(builtOgImage ? { images: builtOgImage.map((i) => i.url) } : {}),
    },
    alternates: { canonical: url },
  };
}

export default async function IdeaPage({
  params,
  searchParams,
}: {
  // [[...slug]] makes slug an optional catch-all — undefined when the
  // visitor hits the bare /idea/<uuid>, otherwise the path segments.
  params: Promise<{ id: string; slug?: string[] }>;
  // ?claim=1 is the post-login signal — the user clicked "Sign in to
  // claim" on /idea/[id], authenticated, and was redirected back here.
  // We pass `autoPromptClaim` to <Reveal /> so the client can pop a
  // confirmation modal without an extra click.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [idea, { data: { user } }, claimTokenForIdea, cookieStore, weekStatus] =
    await Promise.all([
      fetchIdea(id),
      supabase.auth.getUser(),
      fetchClaimToken(id),
      cookies(),
      fetchWeekStatusForIdea(id),
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

  // Cookie integrity check: if the idea is anonymous AND has a
  // claim_token from migration 018, see if any pp_claim_* cookie on the
  // request matches. We compare values directly because the cookie name
  // embeds the originating draft.id, which we don't track on ideas.
  // hasClaimCookie === true means "this browser submitted this idea";
  // we surface that to the client so it can render the right CTA.
  let hasClaimCookie = false;
  if (idea.user_id === null && claimTokenForIdea) {
    hasClaimCookie = cookieStore
      .getAll()
      .some(
        (c) => c.name.startsWith("pp_claim_") && c.value === claimTokenForIdea,
      );
  }

  // ?claim=1 was set by the "Sign in to claim" CTA before redirecting
  // through /login. We only honor it when:
  //   1. the idea is still anonymous (user_id IS NULL)
  //   2. the requester is signed in (you can't claim while anon)
  //   3. the cookie still matches the row's claim_token
  // Anything else and we silently ignore the param so a hostile share
  // link can't trick a logged-in user into claiming someone else's idea.
  const autoPromptClaim =
    sp.claim === "1" &&
    idea.user_id === null &&
    !!user &&
    hasClaimCookie;

  const comments = await fetchComments(idea.id);

  // JSON-LD structured data — search engines render this as a rich result.
  // Schema.org "CreativeWork" is the closest fit for a public-facing pitch
  // submission; aggregateRating exposes both the AI score and community vote.
  const jsonLd: JsonLdData = {
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
    <div
      className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
      style={{ display: "contents" }}
    >
      <JsonLd data={jsonLd} />
      {/* Brand-presence chrome — fixed top-right hourglass with two
          falling grains. Pauses on blur / tab-hidden / reduced-motion.
          Tucked below the sticky header (z<header z-index) and out of
          the way of the right-side share/menu cluster. */}
      <HourglassWatermark className="fixed right-4 top-[72px] z-[5] sm:right-6 sm:top-[80px]" />
      <Reveal
        idea={idea}
        currentUserId={user?.id ?? null}
        currentUser={user}
        initialComments={comments}
        hasClaimCookie={hasClaimCookie}
        autoPromptClaim={autoPromptClaim}
        weekStatus={weekStatus}
      />
    </div>
  );
}
