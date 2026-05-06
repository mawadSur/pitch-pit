"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import { Particles } from "@/components/scene/Particles";
import { CornerSparkle } from "@/components/scene/CornerSparkle";
import { Hourglass } from "@/components/scene/Hourglass";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Timeline } from "@/components/idea/Timeline";
import { VoteButton } from "@/components/idea/VoteButton";
import { Comments, type Comment } from "@/components/idea/Comments";
import { OtherTakes } from "@/components/idea/OtherTakes";
import { AttachmentGallery } from "@/components/idea/AttachmentGallery";
import type { ScoreResult } from "@/lib/score-schema";
import type { JudgeId } from "@/lib/judges";
import { ShareMenu } from "@/components/idea/ShareMenu";
import { useRouter } from "next/navigation";
import { formatVoteCount } from "@/lib/format";
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
}: {
  idea: Idea;
  currentUserId: string | null;
  currentUser?: User | null;
  initialComments?: Comment[];
}) {
  const isAnonymousAndUserSignedIn =
    idea.user_id === null && currentUserId !== null;
  const dateLabel = new Date(idea.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

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

        <div className="relative z-10 mx-auto max-w-4xl px-6 py-20 sm:py-28">
          {/* meta row */}
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
            className="mt-6 text-center"
          >
            <h1 className="text-balance text-2xl font-medium leading-tight text-white sm:text-3xl">
              {idea.title}
            </h1>
            {idea.handle && (
              <p className="scene-mono mt-2 text-[0.65rem] uppercase tracking-[0.35em] text-white/45">
                {idea.handle}
              </p>
            )}
          </motion.div>

          {/* big score moment — Fraunces numeral above the verdict.
              Pairs typographically with the verdict pull-quote so the two
              read as one editorial unit. Final score with /100 baseline-
              aligned to its right; falls back to ai_score × 10 for
              legacy rows where final_score hasn't been computed yet. */}
          <BigScoreMoment
            finalScore={idea.final_score ?? idea.score * 10}
          />

          {/* verdict */}
          <motion.div
            id="verdict"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.2 }}
            className="mt-10 text-center"
          >
            <p className="scene-mono mb-5 text-[0.65rem] uppercase tracking-[0.4em] text-[var(--scene-gold)]">
              · The Verdict ·
            </p>
            <p className="scene-display-italic mx-auto max-w-3xl text-balance text-3xl leading-tight text-white/92 sm:text-5xl">
              &ldquo;{idea.verdict}&rdquo;
            </p>
            {/* Lead-reviewer attribution. Only shown for ideas scored under
                the three-judge flow — legacy single-judge ideas don't have
                judge_scores populated, so we leave the verdict unattributed
                rather than misleadingly tagging them. Set in Fraunces (not
                mono) so it reads like a real attribution line. */}
            {idea.judge_scores?.gstack && (
              <p className="scene-display-italic mt-5 text-base text-white/55">
                — Gstack · lead reviewer
              </p>
            )}
          </motion.div>

          {/* community vote + share */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.4 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <VoteButton ideaId={idea.id} />
            <ShareMenu
              idea={{
                id: idea.id,
                title: idea.title,
                verdict: idea.verdict,
                finalScore: idea.final_score ?? 0,
                aiScore: idea.score,
                voteCount: idea.vote_count,
                strengths: idea.strengths,
                concerns: idea.concerns,
              }}
              variant="primary"
            />
          </motion.div>

          {/* claim-anonymous CTA — only when signed in viewing an unclaimed idea */}
          {isAnonymousAndUserSignedIn && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.55 }}
              className="mt-8 flex justify-center"
            >
              <ClaimAnonymous ideaId={idea.id} />
            </motion.div>
          )}

          {/* strengths / concerns */}
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

          {/* reasoning */}
          <motion.section
            id="reasoning"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.85 }}
            className="scene-card mx-auto mt-10 max-w-3xl px-7 py-7 sm:px-9 sm:py-8"
          >
            <p className="scene-mono mb-4 text-[0.65rem] uppercase tracking-[0.35em] text-white/55">
              Reasoning
            </p>
            <p className="text-base leading-relaxed text-white/80 sm:text-lg">
              {idea.reasoning}
            </p>
          </motion.section>

          {/* Other judges (Vee + Robbins) — only renders when the idea
              was scored under the three-judge flow. The lead reviewer
              (gstack) is already covered by the verdict / strengths /
              concerns / reasoning sections above. */}
          <OtherTakes judgeScores={idea.judge_scores} reasoningDelay={1.95} />

          {/* original pitch */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 2.0 }}
            className="mx-auto mt-10 max-w-3xl"
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
              className="mx-auto mt-8 max-w-3xl"
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

          {/* live MVP CTA — built status reads in verdigris (final state),
              not gold. Gold is reserved for the build-queue / scored-sharp
              moments; verdigris is the "this one made it" tint. */}
          {idea.status === "built" && idea.mvp_url && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 2.3 }}
              className="mt-12 flex justify-center"
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
              className="mt-12 flex justify-center"
            >
              <span className="scene-card-gold inline-flex items-center gap-3 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.3em] text-[var(--scene-gold-bright)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--scene-gold)] motion-safe:animate-pulse" />
                Marked for build
              </span>
            </motion.div>
          )}

          {/* comments */}
          <div id="comments">
            <Comments
              ideaId={idea.id}
              initial={initialComments}
              initialUser={currentUser}
            />
          </div>

          {/* footer link */}
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

        {/* corner sparkle */}
        <div className="pointer-events-none absolute bottom-6 right-6 sm:bottom-8 sm:right-8">
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

function ClaimAnonymous({ ideaId }: { ideaId: string }) {
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

// Editorial score moment — large Fraunces numeral that anchors the
// verdict pull-quote typographically. Pairs with the verdict so the
// two read as one editorial unit (think Bloomberg headline + price
// callout). Tabular figures + line-height 0.92 from .scene-numeral
// so a 7→8 transition doesn't shift width. The /100 is baseline-
// aligned to the right at ~1/3 the size. Respects reduced-motion via
// useReducedMotion — when reduced, the entrance is a static fade
// rather than the spring scale.
function BigScoreMoment({ finalScore }: { finalScore: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 1.1 }}
      className="mt-12 flex items-baseline justify-center gap-2"
    >
      <span
        className="scene-numeral scene-foil text-[96px] text-[var(--scene-gold)] sm:text-[160px] lg:text-[220px]"
        style={{ textShadow: "0 0 36px rgba(255, 184, 0, 0.25)" }}
      >
        {finalScore}
      </span>
      <span className="scene-numeral text-2xl tabular-nums text-white/45 sm:text-3xl">
        /100
      </span>
    </motion.div>
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
        <p className="scene-score-glow scene-mono relative text-[7rem] font-bold leading-none tabular-nums sm:text-[9rem]">
          {finalScore}
        </p>
        <p className="scene-mono relative mt-3 text-[0.65rem] uppercase tracking-[0.4em] text-white/55">
          of one hundred
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
