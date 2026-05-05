"use client";

import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { ShareMenu } from "@/components/idea/ShareMenu";
import { timeAgo, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Submission = {
  id: string;
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
  created_at: string;
};

const STATUS_LABELS: Record<string, { label: string; tone: "neutral" | "gold" | "amber" | "red" }> = {
  submitted: { label: "Submitted", tone: "neutral" },
  scored: { label: "Scored", tone: "neutral" },
  queued: { label: "Greenlit", tone: "amber" },
  building: { label: "In build", tone: "amber" },
  built: { label: "Live", tone: "gold" },
  rejected: { label: "Rejected", tone: "red" },
  failed: { label: "Failed", tone: "red" },
};

export function SubmissionsScene({
  submissions,
  userLabel,
}: {
  submissions: Submission[];
  userLabel: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <>
        <MinimalistHeader />
      <main id="main" tabIndex={-1} className="scene relative isolate min-h-dvh overflow-hidden bg-black">
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div aria-hidden className="scene-beam-narrow" />
        <Particles />
        <div aria-hidden className="scene-grain" />

        <div className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-32 sm:px-10 sm:pt-40">
          {/* HEADER */}
          <motion.header
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
              ↘ Signed in as {userLabel}
            </p>
            <h1 className="mt-5 text-balance text-[2.25rem] font-medium leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Your{" "}
              <span className="italic text-[var(--scene-gold-bright)]">
                pitches
              </span>
              .
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-white/72 sm:text-lg">
              Every idea you&rsquo;ve offered to the pit, with the
              gamemaker&rsquo;s judgment and live vote count.
            </p>
          </motion.header>

          {submissions.length === 0 ? (
            <Empty />
          ) : (
            <>
              {/* Aggregate row */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="mt-12 grid grid-cols-3 gap-3 sm:gap-4"
              >
                <Stat label="Submitted" value={submissions.length} />
                <Stat
                  label="Best final"
                  value={Math.max(
                    0,
                    ...submissions.map((s) => s.final_score ?? Math.round(s.score * 10)),
                  )}
                  accent="gold"
                />
                <Stat
                  label="Total votes"
                  value={submissions.reduce((sum, s) => sum + (s.vote_count ?? 0), 0)}
                />
              </motion.div>

              <ol className="mt-10 space-y-4 sm:space-y-5">
                {submissions.map((s, i) => (
                  <li key={s.id}>
                    <SubmissionCard submission={s} index={i} />
                  </li>
                ))}
              </ol>
            </>
          )}

          <div className="mt-16 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/submissions" className="cta-btn-primary text-sm">
              Pitch a new idea <span aria-hidden>→</span>
            </Link>
            <Link href="/leaderboard" className="cta-btn-ghost text-sm">
              View leaderboard
            </Link>
          </div>
        </div>

      </main>
      </>
    </MotionConfig>
  );
}

function Stat({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: number;
  accent?: "neutral" | "gold";
}) {
  return (
    <div className="scene-card px-4 py-4 text-center sm:px-5">
      <p
        className={cn(
          "scene-mono text-3xl font-semibold tabular-nums leading-none sm:text-4xl",
          accent === "gold" ? "text-[var(--scene-gold-bright)]" : "text-white",
        )}
      >
        {value}
      </p>
      <p className="scene-mono mt-2 text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
        {label}
      </p>
    </div>
  );
}

function SubmissionCard({
  submission,
  index,
}: {
  submission: Submission;
  index: number;
}) {
  const status = STATUS_LABELS[submission.status] ?? {
    label: submission.status,
    tone: "neutral" as const,
  };
  const finalDisplay = submission.final_score ?? 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.4) }}
      whileTap={{ scale: 0.985 }}
      className="scene-card overflow-hidden p-6 transition-transform active:scale-[0.99] sm:p-7"
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-xl font-medium leading-snug text-white sm:text-2xl">
              {submission.title}
            </h3>
            <StatusBadge tone={status.tone} label={status.label} />
          </header>

          <p className="scene-mono mb-4 text-[0.65rem] uppercase tracking-[0.3em] text-white/45">
            <span className="tabular-nums">{timeAgo(submission.created_at)}</span>
            {submission.build_recommended && (
              <>
                <span className="mx-2 text-white/25">·</span>
                <span className="text-[var(--scene-gold-bright)]">
                  Marked for build
                </span>
              </>
            )}
          </p>

          <p className="mb-4 text-base leading-relaxed text-white/80">
            {truncate(submission.pitch, 220)}
          </p>

          {/* Verdict */}
          <p className="mb-4 border-l border-[var(--scene-gold)]/45 pl-4 text-base italic leading-snug text-white/85">
            &ldquo;{submission.verdict}&rdquo;
          </p>

          {/* Quick feedback peek — strengths + concerns counts */}
          {(submission.strengths?.length || submission.concerns?.length) > 0 && (
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              {submission.strengths?.length > 0 && (
                <FeedbackList
                  label="Strengths"
                  items={submission.strengths.slice(0, 2)}
                  total={submission.strengths.length}
                  tone="gold"
                />
              )}
              {submission.concerns?.length > 0 && (
                <FeedbackList
                  label="Concerns"
                  items={submission.concerns.slice(0, 2)}
                  total={submission.concerns.length}
                  tone="neutral"
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={`/idea/${submission.id}`}
              className="scene-mono inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-white/65 transition-colors hover:text-[var(--scene-gold-bright)]"
            >
              Full judgment
              <span aria-hidden>→</span>
            </Link>
            {submission.status === "built" && submission.mvp_url && (
              <a
                href={submission.mvp_url}
                target="_blank"
                rel="noreferrer"
                className="scene-mono inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-[var(--scene-gold-bright)] transition-colors hover:text-white"
              >
                Open the build
                <span aria-hidden>↗</span>
              </a>
            )}
            <span className="inline-flex h-11 w-11 items-center justify-center">
              <ShareMenu
                idea={{
                  id: submission.id,
                  title: submission.title,
                  verdict: submission.verdict,
                  finalScore: submission.final_score ?? Math.round(submission.score * 10),
                  aiScore: submission.score,
                  voteCount: submission.vote_count,
                  strengths: submission.strengths,
                  concerns: submission.concerns,
                }}
                variant="icon"
                ariaLabel={`Share "${submission.title}"`}
              />
            </span>
          </div>
        </div>

        {/* Score panel */}
        <aside className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-white/14 bg-white/[0.025] px-5 py-4 sm:min-w-[120px]">
          <span className="scene-mono text-[0.55rem] uppercase tracking-[0.35em] text-white/45">
            Final
          </span>
          <span className="scene-mono mt-1 text-3xl font-semibold leading-none tabular-nums text-white sm:text-4xl">
            {finalDisplay}
          </span>
          <span className="scene-mono mt-1 text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
            of 100
          </span>
          <span className="scene-mono mt-3 flex items-center gap-1.5 text-[0.55rem] uppercase tracking-[0.25em] text-white/45">
            <span className="text-white/65 tabular-nums">{submission.score}</span>
            /10 AI
          </span>
          <span className="scene-mono mt-1 text-[0.55rem] uppercase tracking-[0.25em] text-white/45">
            <span className="text-white/65 tabular-nums">{submission.vote_count}</span>{" "}
            {submission.vote_count === 1 ? "vote" : "votes"}
          </span>
        </aside>
      </div>
    </motion.article>
  );
}

function FeedbackList({
  label,
  items,
  total,
  tone,
}: {
  label: string;
  items: string[];
  total: number;
  tone: "gold" | "neutral";
}) {
  return (
    <div>
      <p
        className={cn(
          "scene-mono mb-2 text-[0.55rem] uppercase tracking-[0.35em]",
          tone === "gold" ? "text-[var(--scene-gold)]" : "text-white/55",
        )}
      >
        {label}
        {total > items.length && (
          <span className="ml-2 text-white/55">+{total - items.length} more</span>
        )}
      </p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm leading-snug text-white/85"
          >
            <span
              className={cn(
                "mt-2 inline-block h-1 w-1 flex-shrink-0 rounded-full",
                tone === "gold" ? "bg-[var(--scene-gold)]" : "bg-white/45",
              )}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "gold" | "amber" | "red";
}) {
  const palette = {
    neutral: "border-white/20 text-white/65",
    gold: "border-[var(--scene-gold-bright)]/55 text-[var(--scene-gold-bright)] bg-[var(--scene-gold)]/8",
    amber: "border-amber-300/45 text-amber-200/85",
    red: "border-red-400/40 text-red-300/85",
  }[tone];
  return (
    <span
      className={cn(
        "scene-mono inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.55rem] uppercase tracking-[0.3em]",
        palette,
      )}
    >
      {label}
    </span>
  );
}

function Empty() {
  return (
    <div className="mt-16 flex justify-center">
      <div className="scene-card max-w-lg px-10 py-12 text-center">
        <p className="text-lg italic text-white/72 sm:text-xl">
          You haven&rsquo;t pitched anything yet.
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/55">
          When you submit, it lands here with the AI&rsquo;s 0–100 score, the
          full feedback breakdown (strengths, concerns, reasoning), the live
          community vote count, and its build status if greenlit.
        </p>
        <Link href="/submissions" className="cta-btn-primary mt-7 text-sm">
          Pitch your idea <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
