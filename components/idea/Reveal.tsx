"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { Particles } from "@/components/scene/Particles";
import { CornerSparkle } from "@/components/scene/CornerSparkle";
import { Hourglass } from "@/components/scene/Hourglass";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Timeline } from "@/components/idea/Timeline";
import { Comments, type Comment } from "@/components/idea/Comments";
import { OtherTakes } from "@/components/idea/OtherTakes";
import { AttachmentGallery } from "@/components/idea/AttachmentGallery";
import { RallyCard, VoteShareZone } from "@/components/idea/RallyZone";
import type { ScoreResult } from "@/lib/score-schema";
import type { JudgeId } from "@/lib/judges";
import { useRouter } from "next/navigation";
import { formatVoteCount } from "@/lib/format";
import { titleToSlug } from "@/lib/slug";
import type { User } from "@supabase/supabase-js";

export type Idea = {
  id: string;
  user_id: string | null;
  title: string;
  pitch: string;
  handle: string | null;
  score: number;
  final_score: number | null;
  vote_count: number;
  verdict: string;
  strengths: string[];
  concerns: string[];
  reasoning: string;
  build_recommended: boolean;
  status: string;
  mvp_url: string | null;
  screenshot_url: string | null;
  created_at: string;
  // Per-judge breakdown for ideas submitted under the three-judge flow.
  // Null for legacy single-judge ideas. Top-level score / verdict /
  // strengths / concerns / reasoning are populated from the canonical
  // judge (gstack > vee > robbins) so the existing UI keeps working
  // when judge_scores is absent.
  judge_scores?: Partial<Record<JudgeId, ScoreResult>> | null;
  // Up to 3 public Supabase Storage URLs of images attached to the
  // pitch. Empty array when the user didn't attach any (or the
  // pre-migration-015 fallback path was taken).
  image_urls?: string[];
};

export function Reveal({
  idea,
  currentUserId,
  currentUser = null,
  initialComments = [],
  hasClaimCookie = false,
  autoPromptClaim = false,
  weekStatus = "open",
}: {
  idea: Idea;
  currentUserId: string | null;
  currentUser?: User | null;
  initialComments?: Comment[];
  // Status of the week this idea belongs to. Drives the VoteButton's
  // closed-week lock — open = live vote button, closed/built = disabled.
  weekStatus?: "open" | "closed" | "built";
  // Server-resolved: did the requester arrive with a pp_claim_* cookie
  // whose value matches this idea's claim_token? Drives which claim CTA
  // we surface:
  //   - signed-in viewer + cookie match  → ClaimAnonymous (legacy CTA)
  //   - anonymous viewer + cookie match  → ClaimYours (new CTA: sign in
  //     to claim → auto-runs the claim on return)
  //   - signed-in viewer + no cookie     → ClaimAnonymous (legacy)
  //   - anonymous viewer + no cookie     → no CTA
  hasClaimCookie?: boolean;
  // The visitor arrived at /idea/<id>?claim=1 — they came back from /login
  // after clicking "Sign in to claim". The page guards this server-side
  // (must be signed in, idea still anon, cookie still matches). We pop a
  // confirmation flow so they don't need to click again.
  autoPromptClaim?: boolean;
}) {
  const isAnonymousAndUserSignedIn =
    idea.user_id === null && currentUserId !== null;
  // Anonymous viewer who has the pp_claim_<draft.id> cookie — i.e., the
  // same browser that submitted this idea. They get the "sign in to claim"
  // CTA which routes through /login and lands back here with ?claim=1.
  const isAnonymousViewerWithCookie =
    idea.user_id === null && currentUserId === null && hasClaimCookie;
  const dateLabel = new Date(idea.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Shared payload for every share surface on this page (the primary CTA,
  // the post-vote nudge, and the owner rally card) so they all emit the
  // same rich copy. Structurally a ShareableIdea — the consuming props
  // enforce the type at each call site.
  const shareIdea = {
    id: idea.id,
    title: idea.title,
    verdict: idea.verdict,
    finalScore: idea.final_score ?? 0,
    aiScore: idea.score,
    voteCount: idea.vote_count,
    strengths: idea.strengths,
    concerns: idea.concerns,
  };

  const [back, setBack] = useState<{ href: string; label: string }>({
    href: "/leaderboard",
    label: "Back to leaderboard",
  });
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ref = document.referrer;
    if (!ref) return;
    try {
      const url = new URL(ref);
      if (url.origin !== window.location.origin) return;
      const path = url.pathname;
      const sections: { match: string; href: string; label: string }[] = [
        { match: "/leaderboard", href: "/leaderboard", label: "Back to leaderboard" },
        { match: "/feed", href: "/feed", label: "Back to feed" },
        { match: "/built", href: "/built", label: "Back to built" },
        { match: "/submissions", href: "/submissions", label: "Back to submissions" },
      ];
      const hit = sections.find((s) => path.startsWith(s.match));
      if (hit) setBack({ href: hit.href, label: hit.label });
    } catch {
      // ignore malformed referrer
    }
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <MinimalistHeader />
      <main id="main" tabIndex={-1} className="scene relative isolate min-h-dvh overflow-hidden">
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div aria-hidden className="scene-beam" />
        <Particles />
        <div aria-hidden className="scene-grain" />

        {/* Container widens at lg: from a single 4xl column to a 7xl
            two-column shell. Below lg the layout is unchanged — single
            column, centered — so mobile + tablet keep the original
            reading rhythm. */}
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-20 sm:py-28 lg:max-w-7xl lg:px-10">
          {/* meta row — spans full width above both columns */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between gap-4"
          >
            <Link
              href={back.href}
              className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-white/55 transition-colors hover:text-white/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              ← {back.label}
            </Link>
            <span className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-white/55">
              Submitted · {dateLabel}
            </span>
          </motion.div>

          {/* 2-column shell. Below lg this collapses to a single block —
              the children render in source order, identical to the old
              vertical stack. On lg+ the left rail becomes sticky (verdict
              context stays in view while the analysis on the right
              scrolls). Grid columns: left ~5fr, right ~6fr — the right
              gets slightly more room because it holds the longer-form
              content (reasoning + comments). Gap is generous (gap-x-14)
              so the two columns don't feel like a single squished page.
              `items-start` so the sticky left rail isn't stretched to the
              right's height. */}
          <div className="mt-2 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-x-14 xl:gap-x-20">
            {/* LEFT RAIL — score + title + verdict pull-quote. Sticky on
                lg+. On a short viewport (1024×768-ish) the verdict can
                exceed the available sticky height — we cap it to
                viewport-minus-header and let it scroll internally so the
                right column scroll behavior stays intact. Position from
                top: 96px clears MinimalistHeader (py-5 + Logo size=30 ≈
                70px chrome + ~24px breathing room above the underglow).
                NOT wrapped in a motion component — framer-motion's
                transform creates a containing block which would
                neutralize `position: sticky`. The child motion blocks
                still animate. */}
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-2 lg:pb-4">
              {/* score reveal */}
              <ScoreReveal
                finalScore={idea.final_score ?? 0}
                aiScore={idea.score}
                voteCount={idea.vote_count ?? 0}
              />

              {/* title + handle */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.0 }}
                className="mt-6 text-center lg:text-left"
              >
                <h1 className="scene-display text-balance text-4xl font-semibold leading-tight tracking-tight text-white sm:text-6xl lg:text-5xl xl:text-6xl">
                  {idea.title}
                </h1>
                {idea.handle && (
                  <p className="scene-mono mt-2 text-[0.65rem] uppercase tracking-[0.35em] text-white/45">
                    {idea.handle}
                  </p>
                )}
              </motion.div>

              {/* verdict */}
              <motion.div
                id="verdict"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 1.2 }}
                className="mt-10 text-center lg:text-left"
              >
                <p className="scene-mono mb-5 text-[0.65rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
                  · The Verdict ·
                </p>
                {/* Pull-quote treatment. Fraunces italic, ≥40px on mobile (the
                    review spec calls for 56px+ but at 375px width that wraps
                    aggressively; we clamp up to 56px starting at sm: and 72px
                    at lg: so the line breaks read intentional, not cramped).
                    On lg+ the quote sits in the left rail (~5fr of a 7xl
                    grid ≈ 480-540px wide), so we soften the upper bound to
                    56-64px to keep the spec's ≥56px floor while letting the
                    lines breathe inside the narrower column. */}
                <p className="scene-display-italic mx-auto max-w-3xl text-balance text-[40px] leading-[1.05] text-white/92 sm:text-[56px] lg:mx-0 lg:max-w-none lg:text-[56px] xl:text-[64px]">
                  &ldquo;{idea.verdict}&rdquo;
                </p>
                {/* Lead-reviewer attribution. Only shown for ideas scored under
                    the three-judge flow — legacy single-judge ideas don't have
                    judge_scores populated, so we leave the verdict unattributed
                    rather than misleadingly tagging them. Weighted: Fraunces
                    roman (not italic) so the name reads like a signature
                    anchoring the quote above, with the role/credential set in
                    mono uppercase microcopy underneath. */}
                {idea.judge_scores?.gstack && (
                  <div className="mt-6 flex flex-col items-center gap-1.5 lg:items-start">
                    <p className="scene-display text-lg font-medium tracking-tight text-white/85 sm:text-xl">
                      — Garry Tan
                    </p>
                    <p className="scene-mono text-[0.6rem] uppercase tracking-[0.35em] text-white/45">
                      Lead reviewer
                    </p>
                  </div>
                )}
              </motion.div>
            </div>

            {/* RIGHT COLUMN — analysis, scrolls normally. Below lg this
                just renders as the next block in the document (centered
                like before). Above lg, it's the second grid cell and the
                left rail sticks while this scrolls. min-w-0 so long
                strings inside scene-cards can wrap instead of forcing
                a horizontal scroll on the grid. */}
            <div className="lg:min-w-0">
              {/* community vote + share — primary CTA above the analysis
                  so a reader can act on the verdict without scrolling to
                  the bottom of the right column. On lg+ left-aligned to
                  match the column rhythm. The VoteShareZone wraps both so
                  a post-vote share nudge + the subordinate email capture
                  can hang off the same block. */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.4 }}
                className="mt-10 lg:mt-0"
              >
                <VoteShareZone
                  ideaId={idea.id}
                  weekStatus={weekStatus}
                  shareIdea={shareIdea}
                />
              </motion.div>

              {/* rally-your-voters card — only for the owner while the week
                  is open. Best-effort: hides cleanly if the snapshot fetch
                  fails (see RallyCard). */}
              {idea.user_id !== null &&
                idea.user_id === currentUserId &&
                weekStatus === "open" && (
                  <RallyCard
                    ideaId={idea.id}
                    ideaTitle={idea.title}
                    shareIdea={shareIdea}
                  />
                )}

              {/* claim-anonymous CTA — signed-in viewer on an unclaimed
                  idea. autoPromptClaim fires when they came back from
                  /login via ?claim=1, so we run the claim automatically
                  without an extra tap. */}
              {isAnonymousAndUserSignedIn && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 1.55 }}
                  className="mt-8 flex justify-center lg:justify-start"
                >
                  <ClaimAnonymous
                    ideaId={idea.id}
                    ideaTitle={idea.title}
                    autoStart={autoPromptClaim}
                  />
                </motion.div>
              )}

              {/* "Claim yours" CTA — anonymous viewer who actually
                  submitted this idea (proven by the pp_claim_<draft.id>
                  cookie matching ideas.claim_token). They need to sign in
                  to keep the idea on their account; the CTA bounces them
                  through /login with a return URL of
                  /idea/<id>/<slug>?claim=1, and the page above auto-runs
                  the claim once they're back. */}
              {isAnonymousViewerWithCookie && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 1.55 }}
                  className="mt-8 flex justify-center lg:justify-start"
                >
                  <ClaimYours ideaId={idea.id} ideaTitle={idea.title} />
                </motion.div>
              )}

              {/* strengths / concerns — at lg+ we keep the 2-up grid
                  inside the right column because each list is short and
                  the two side-by-side reads as one block. The strengths/
                  concerns grid is independent of the page-level 2-col
                  shell. */}
              <div id="strengths" className="mt-14 grid gap-5 sm:grid-cols-2">
                <Column
                  title="Strengths"
                  tone="gold"
                  items={idea.strengths}
                  delay={1.5}
                />
                <Column
                  title="Concerns"
                  tone="neutral"
                  items={idea.concerns}
                  delay={1.65}
                />
              </div>

              {/* reasoning — drop max-w-3xl on lg+ so it fills the right
                  column rather than centering inside a narrower box. */}
              <motion.section
                id="reasoning"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.85 }}
                className="scene-card mx-auto mt-10 max-w-3xl px-7 py-7 sm:px-9 sm:py-8 lg:mx-0 lg:max-w-none"
              >
                <p className="scene-mono mb-4 text-[0.65rem] uppercase tracking-[0.35em] text-white/55">
                  Reasoning
                </p>
                <p className="text-base leading-relaxed text-white/80 sm:text-lg">
                  {idea.reasoning}
                </p>
              </motion.section>

              {/* Other judges (Vee + Robbins) — only renders when the
                  idea was scored under the three-judge flow. The lead
                  reviewer (gstack) is already covered by the verdict /
                  strengths / concerns / reasoning sections above. */}
              <OtherTakes judgeScores={idea.judge_scores} reasoningDelay={1.95} />

              {/* original pitch */}
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 2.0 }}
                className="mx-auto mt-10 max-w-3xl lg:mx-0 lg:max-w-none"
              >
                <p className="scene-mono mb-4 text-[0.65rem] uppercase tracking-[0.35em] text-white/55">
                  Original pitch
                </p>
                <blockquote className="border-l border-[var(--scene-gold)]/45 pl-5 text-base leading-relaxed text-white/75 sm:text-lg">
                  <span className="whitespace-pre-wrap">{idea.pitch}</span>
                </blockquote>
              </motion.section>

              {/* attachments — only when the founder uploaded images. The
                  judges saw these too (multimodal Claude content blocks),
                  so showing them publicly anchors the verdict in what they
                  actually reviewed. Click any thumbnail for a lightbox. */}
              {idea.image_urls && idea.image_urls.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 2.05 }}
                  className="mx-auto mt-8 max-w-3xl lg:mx-0 lg:max-w-none"
                >
                  <p className="scene-mono mb-4 text-[0.65rem] uppercase tracking-[0.35em] text-white/55">
                    Attachments
                  </p>
                  <AttachmentGallery urls={idea.image_urls} />
                </motion.section>
              )}

              {/* timeline */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 2.15 }}
                className="mt-14"
              >
                <Timeline
                  status={idea.status}
                  buildRecommended={idea.build_recommended}
                />
              </motion.div>

              {/* live MVP CTA — built status reads in verdigris (final
                  state), not gold. Gold is reserved for the build-queue
                  / scored-sharp moments; verdigris is the "this one made
                  it" tint. */}
              {idea.status === "built" && idea.mvp_url && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 2.3 }}
                  className="mt-12 flex justify-center lg:justify-start"
                >
                  <a
                    href={idea.mvp_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-3 rounded-[18px] border px-8 py-4 text-base font-medium text-white backdrop-blur-md transition-transform hover:-translate-y-0.5"
                    style={{
                      background: "rgba(91, 138, 110, 0.08)",
                      borderColor: "rgba(91, 138, 110, 0.45)",
                      boxShadow:
                        "inset 0 1px 0 rgba(136, 184, 156, 0.12), 0 24px 72px -24px rgba(91, 138, 110, 0.4), 0 0 48px rgba(91, 138, 110, 0.16)",
                    }}
                  >
                    Open the build
                    <span aria-hidden>↗</span>
                  </a>
                </motion.div>
              )}

              {/* marked for build flag */}
              {idea.build_recommended && idea.status !== "built" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 2.4 }}
                  className="mt-12 flex justify-center lg:justify-start"
                >
                  <span className="scene-card-gold inline-flex items-center gap-3 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.3em] text-[var(--scene-gold-bright)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--scene-gold)] motion-safe:animate-pulse" />
                    Marked for build
                  </span>
                </motion.div>
              )}

              {/* comments — sits at the end of the right column on lg+.
                  Comments' inner container is mx-auto max-w-3xl; on lg+
                  the right column (~6/11 of the 7xl shell ≈ 580-640px)
                  is narrower than max-w-3xl (768px), so the cap never
                  bites and Comments fills the column naturally. Under
                  lg it centers as before. */}
              <div id="comments">
                <Comments
                  ideaId={idea.id}
                  initial={initialComments}
                  initialUser={currentUser}
                />
              </div>
            </div>
          </div>

          {/* footer link — spans full width below both columns */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 2.6 }}
            className="mt-20 flex items-center justify-center gap-6"
          >
            <Link
              href="/"
              className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-white/55 hover:text-white/85"
            >
              Pitch another
            </Link>
            <span aria-hidden className="text-white/20">·</span>
            <Link
              href="/leaderboard"
              className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-white/55 hover:text-white/85"
            >
              Leaderboard
            </Link>
          </motion.div>
        </div>

        {/* corner sparkle — honor iOS safe-area-inset-bottom so the
            sparkle clears the home indicator + Safari bottom bar
            gesture region on iPhones. */}
        <div className="pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 sm:bottom-[max(2rem,env(safe-area-inset-bottom))] sm:right-8">
          <CornerSparkle size={26} />
        </div>

        {/* Hourglass watermark — top-right, fixed. Subtle reminder
            that the timer is running. The Hourglass SVG already
            respects prefers-reduced-motion via .scene-halo-breathe /
            .sand-dot rules in scene.css. */}
        <div
          aria-hidden
          className="pointer-events-none fixed right-4 top-20 z-30 opacity-25 sm:right-6 sm:top-24"
        >
          <Hourglass size={24} />
        </div>
      </main>
    </MotionConfig>
  );
}

function ClaimAnonymous({
  ideaId,
  ideaTitle: _ideaTitle,
  autoStart = false,
}: {
  ideaId: string;
  ideaTitle?: string;
  // When true, fire the claim automatically on mount. Used for the
  // post-login return path (?claim=1) where the user already opted in
  // before the redirect — re-prompting them feels redundant.
  autoStart?: boolean;
}) {
  void _ideaTitle;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/claim-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Could not claim this idea.");
      }
      setClaimed(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim this idea.");
    } finally {
      setPending(false);
    }
  }

  // Auto-fire from the post-login return path. Empty deps so it runs
  // exactly once on mount; React's strict-mode double-invoke is safe
  // because the server-side claim is idempotent (alreadyClaimed branch).
  useEffect(() => {
    if (autoStart && !claimed && !pending) {
      void claim();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (claimed) {
    return (
      <div className="scene-card-gold flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="text-base text-white">✓ Claimed.</span>
        <Link
          href="/submissions"
          className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-[var(--scene-gold-bright)] hover:text-white"
        >
          See in My pitches →
        </Link>
      </div>
    );
  }

  return (
    <div className="scene-card flex max-w-xl flex-col items-center gap-3 px-7 py-5 text-center sm:flex-row sm:text-left">
      <p className="text-sm text-white/72">
        This pitch was submitted anonymously. Claim it to track it on your{" "}
        <span className="text-white">My pitches</span> page.
      </p>
      <button
        type="button"
        onClick={claim}
        disabled={pending}
        className="cta-btn-primary shrink-0 text-sm disabled:opacity-60"
      >
        {pending ? "Claiming…" : "Claim this idea"}
      </button>
      {error && (
        <p
          role="alert"
          className="scene-mono w-full text-[0.65rem] uppercase tracking-[0.3em] text-red-300/85"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// Anonymous viewer who submitted this idea (proven server-side via the
// pp_claim_<draft.id> cookie matching ideas.claim_token). They aren't
// signed in yet, so the only thing this CTA does is route them through
// /login with a return URL of /idea/<id>/<slug>?claim=1. The page
// component reads ?claim=1 + the cookie + the auth state and either
// auto-runs the claim (in <ClaimAnonymous autoStart />) or silently
// drops the param if any condition fails.
function ClaimYours({
  ideaId,
  ideaTitle,
}: {
  ideaId: string;
  ideaTitle: string;
}) {
  const slug = titleToSlug(ideaTitle);
  const ideaPath = slug ? `/idea/${ideaId}/${slug}` : `/idea/${ideaId}`;
  const next = encodeURIComponent(`${ideaPath}?claim=1`);
  const loginHref = `/login?next=${next}`;

  return (
    <div className="scene-card-gold flex max-w-xl flex-col items-center gap-4 px-7 py-6 text-center sm:flex-row sm:text-left">
      <div className="flex-1 space-y-1.5">
        <p className="scene-mono text-[0.65rem] uppercase tracking-[0.32em] text-[var(--scene-gold-bright)]">
          This is your pitch
        </p>
        <p className="text-sm text-white/85">
          Sign in to claim this idea — keep it on your profile, get notified
          when it&rsquo;s voted on, and stay eligible for the build queue.
        </p>
      </div>
      <Link
        href={loginHref}
        className="cta-btn-primary shrink-0 text-sm"
      >
        Sign in to claim
      </Link>
    </div>
  );
}

function ScoreReveal({
  finalScore,
  aiScore,
  voteCount,
}: {
  finalScore: number;
  aiScore: number;
  voteCount: number;
}) {
  return (
    <div className="relative mt-10 flex justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{
          opacity: [0, 0.4, 0.15, 1, 0.6, 1, 0.85, 1],
          scale: [0.85, 1.04, 0.97, 1.02, 1, 1, 1, 1],
        }}
        transition={{ duration: 1.4, delay: 0.4, ease: "easeOut" }}
        className="relative flex flex-col items-center"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-16 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,184,0,0.32) 0%, transparent 60%)",
            filter: "blur(20px)",
          }}
        />
        <p className="scene-mono mb-4 text-[0.65rem] uppercase tracking-[0.4em] text-white/55">
          Final score
        </p>
        {/* Bloomberg-terminal numeral: Fraunces tabular figures, ~120px
            gold, with `/100` at ~1/3 the size. tabular-nums + scene-numeral
            keep width stable through any future count-up. The baseline
            alignment puts /100 hanging from the cap-height of the big
            numeral, like a financial readout. */}
        <p className="scene-foil relative flex items-baseline gap-2 leading-none text-[var(--scene-gold)]">
          <span
            className="scene-numeral text-[96px] sm:text-[120px] lg:text-[144px]"
            style={{
              textShadow:
                "0 0 18px rgba(255, 184, 0, 0.55), 0 0 48px rgba(255, 184, 0, 0.32), 0 0 96px rgba(255, 184, 0, 0.18)",
            }}
          >
            {finalScore}
          </span>
          <span
            className="scene-numeral text-[34px] sm:text-[42px] lg:text-[50px] text-white/45"
            aria-hidden
          >
            /100
          </span>
          <span className="sr-only">out of 100</span>
        </p>
        <p className="scene-mono relative mt-4 text-[0.65rem] uppercase tracking-[0.3em] text-white/55">
          AI{" "}
          <span className="text-white/85 tabular-nums">{aiScore}</span>
          <span className="text-white/55">/10</span>
          <span className="mx-2 text-white/25">·</span>
          <span className="text-white/85 tabular-nums">{formatVoteCount(voteCount)}</span>{" "}
          {voteCount === 1 ? "vote" : "votes"}
        </p>
      </motion.div>
    </div>
  );
}

function Column({
  title,
  tone,
  items,
  delay,
}: {
  title: string;
  tone: "gold" | "neutral";
  items: string[];
  delay: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className="scene-card px-7 py-7 sm:px-8"
    >
      <p
        className={`scene-mono mb-5 text-[0.65rem] uppercase tracking-[0.35em] ${
          tone === "gold" ? "text-[var(--scene-gold)]" : "text-white/55"
        }`}
      >
        {title}
      </p>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: delay + 0.08 * (i + 1) }}
            className="flex items-start gap-3 text-base leading-snug text-white/85"
          >
            <span
              aria-hidden
              className={`mt-2 inline-block h-1 w-1 flex-shrink-0 rounded-full ${
                tone === "gold" ? "bg-[var(--scene-gold)]" : "bg-white/45"
              }`}
            />
            <span>{item}</span>
          </motion.li>
        ))}
      </ul>
    </motion.section>
  );
}
