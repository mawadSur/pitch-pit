"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { type FeedIdea } from "@/lib/idea-types";
import { timeAgo, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ShareMenu } from "@/components/idea/ShareMenu";

// Final-score tiers for the minimalist accent treatment.
// (Score on /idea/[id] is the canonical 0-100; here we tint by tier.)
function tierFor(finalScore: number | null | undefined, aiScore: number) {
  // Use AI score as the "fallen" gate (legacy filter compatibility),
  // and final_score for the tint.
  if (aiScore <= 3) return "fallen" as const;
  const f = finalScore ?? Math.round(aiScore * 10);
  if (f >= 80) return "gold" as const;
  if (f >= 60) return "silver" as const;
  return "neutral" as const;
}

export function IdeaCard({
  idea,
  isNew = false,
  index = 0,
}: {
  idea: FeedIdea;
  isNew?: boolean;
  index?: number;
}) {
  const tier = tierFor(idea.final_score, idea.score);
  const finalDisplay = idea.final_score ?? 0;

  return (
    <motion.article
      layout
      initial={
        isNew
          ? { opacity: 0, y: -16 }
          : { opacity: 0, y: 6 }
      }
      animate={
        isNew
          ? {
              opacity: [0, 0.4, 0.1, 0.85, 0.55, 1],
              y: [-16, -10, -6, -3, -1, 0],
            }
          : { opacity: 1, y: 0 }
      }
      transition={
        isNew
          ? { duration: 0.95, ease: "easeOut" }
          : { duration: 0.4, delay: Math.min(index * 0.04, 0.4) }
      }
      className={cn(
        "scene-card relative overflow-hidden",
        tier === "gold" &&
          "ring-1 ring-[var(--scene-gold)]/45 shadow-[0_0_36px_-12px_rgba(255,184,0,0.45)]",
      )}
    >
      <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-7">
        {/* main column */}
        <div className="min-w-0">
          <header className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h3
              className={cn(
                "text-xl font-medium leading-snug text-white sm:text-2xl",
                tier === "fallen" &&
                  "text-white/55 line-through decoration-white/35 decoration-1",
              )}
            >
              {idea.title}
            </h3>
          </header>

          <p
            className={cn(
              "scene-mono mb-4 text-[0.62rem] uppercase tracking-[0.3em]",
              tier === "fallen" ? "text-white/30" : "text-white/45",
            )}
          >
            {idea.handle ? (
              <>
                <span className="text-[var(--scene-gold)]/85">
                  {idea.handle}
                </span>
                <span className="mx-2 text-white/25">·</span>
              </>
            ) : (
              <>
                <span className="text-white/45">Anonymous</span>
                <span className="mx-2 text-white/25">·</span>
              </>
            )}
            <span className="tabular-nums">{timeAgo(idea.created_at)}</span>
            {idea.build_recommended && (
              <>
                <span className="mx-2 text-white/25">·</span>
                <span className="text-[var(--scene-gold-bright)]">
                  Marked for build
                </span>
              </>
            )}
          </p>

          <p
            className={cn(
              "mb-4 text-base leading-relaxed",
              tier === "fallen" ? "text-white/45" : "text-white/80",
            )}
          >
            {truncate(idea.pitch, 220)}
          </p>

          <p
            className={cn(
              "border-l pl-4 text-base italic leading-snug",
              tier === "gold"
                ? "border-[var(--scene-gold-bright)]/55 text-white"
                : tier === "silver"
                  ? "border-white/30 text-white"
                  : tier === "fallen"
                    ? "border-white/15 text-white/50"
                    : "border-[var(--scene-gold)]/35 text-white/85",
            )}
          >
            &ldquo;{idea.verdict}&rdquo;
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/idea/${idea.id}`}
              className={cn(
                "scene-mono inline-flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black",
                tier === "fallen"
                  ? "text-white/55 hover:text-white/75"
                  : "text-white/60 hover:text-[var(--scene-gold-bright)]",
              )}
            >
              View judgment
              <span aria-hidden>→</span>
            </Link>
            <span aria-hidden className="text-white/15">·</span>
            <ShareMenu
              idea={{
                id: idea.id,
                title: idea.title,
                verdict: idea.verdict,
                finalScore: idea.final_score ?? Math.round(idea.score * 10),
                aiScore: idea.score,
                voteCount: idea.vote_count,
              }}
              variant="icon"
              ariaLabel={`Share "${idea.title}"`}
            />
          </div>
        </div>

        {/* score panel */}
        <aside
          className={cn(
            "flex shrink-0 flex-col items-center justify-center rounded-xl border px-5 py-4 sm:min-w-[120px]",
            tier === "gold"
              ? "border-[var(--scene-gold-bright)]/55 bg-[var(--scene-gold)]/8"
              : tier === "silver"
                ? "border-white/22 bg-white/[0.03]"
                : tier === "fallen"
                  ? "border-white/10 bg-white/[0.015]"
                  : "border-white/14 bg-white/[0.025]",
          )}
        >
          <span className="scene-mono text-[0.55rem] uppercase tracking-[0.35em] text-white/45">
            Final
          </span>
          <span
            className={cn(
              "scene-mono mt-1 text-3xl font-semibold leading-none tabular-nums sm:text-4xl",
              tier === "gold"
                ? "text-[var(--scene-gold-bright)]"
                : tier === "silver"
                  ? "text-white"
                  : tier === "fallen"
                    ? "text-white/55"
                    : "text-white",
            )}
          >
            {finalDisplay}
          </span>
          <span className="scene-mono mt-1 text-[0.5rem] uppercase tracking-[0.3em] text-white/55">
            of 100
          </span>
          <span className="scene-mono mt-3 flex items-center gap-1.5 text-[0.55rem] uppercase tracking-[0.25em] text-white/45">
            <span className="text-white/65 tabular-nums">{idea.score}</span>
            /10 AI
          </span>
        </aside>
      </div>
    </motion.article>
  );
}
