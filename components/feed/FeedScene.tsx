"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { IdeaCard } from "@/components/feed/IdeaCard";
import { createClient } from "@/lib/supabase/client";
import { type FeedIdea, VISIBLE_STATUSES } from "@/lib/idea-types";
import { cn } from "@/lib/utils";

type Filter = "all" | "survivors" | "victors" | "fallen";

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "every tribute" },
  { id: "survivors", label: "Survivors", hint: "AI 7+" },
  { id: "victors", label: "Victors", hint: "AI 9+" },
  { id: "fallen", label: "Fallen", hint: "AI 1–3" },
];

export function FeedScene({ initial }: { initial: FeedIdea[] }) {
  const [ideas, setIdeas] = useState<FeedIdea[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  // Single short message that a screen-reader-only live region
  // announces when a new tribute arrives. Cleared shortly after so the
  // next insert re-fires the announcement instead of being suppressed
  // by the assistive tech as "no change".
  const [announcement, setAnnouncement] = useState("");
  const seenIds = useRef(new Set(initial.map((i) => i.id)));

  // Realtime — new INSERTs slide in at the top
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("feed-ideas-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ideas" },
        (payload) => {
          const row = payload.new as FeedIdea;
          if (
            !row?.id ||
            seenIds.current.has(row.id) ||
            !VISIBLE_STATUSES.includes(
              row.status as (typeof VISIBLE_STATUSES)[number],
            )
          ) {
            return;
          }
          seenIds.current.add(row.id);
          setIdeas((prev) => [row, ...prev]);
          setNewIds((prev) => {
            const next = new Set(prev);
            next.add(row.id);
            return next;
          });
          setAnnouncement("1 new tribute");
          setTimeout(() => {
            setNewIds((prev) => {
              const next = new Set(prev);
              next.delete(row.id);
              return next;
            });
          }, 1400);
          // Clear the announcement so the next insert's identical
          // string re-fires the polite re-read.
          setTimeout(() => setAnnouncement(""), 1500);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => filterIdeas(ideas, filter), [ideas, filter]);
  const counts = useMemo(() => countsByFilter(ideas), [ideas]);

  return (
    <MotionConfig reducedMotion="user">
      <>
        <MinimalistHeader />
      <main id="main" tabIndex={-1} className="scene relative isolate min-h-dvh overflow-hidden bg-black">
        <div aria-hidden className="scene-bg-gradient absolute inset-0" />
        <div aria-hidden className="scene-beam-narrow" />
        <Particles />
        <div aria-hidden className="scene-grain" />

        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-32 sm:px-10 sm:pt-40">
          {/* HEADER */}
          <motion.header
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
              <span className="mr-2 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-[var(--scene-gold-bright)] motion-safe:animate-pulse" />
              Live · The pit, right now
            </p>
            <h1 className="mt-5 text-balance text-[2.25rem] font-medium leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              The{" "}
              <span className="italic text-[var(--scene-gold-bright)]">
                tributes
              </span>
              .
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-white/72 sm:text-lg">
              Every idea offered to the pit, in the order it was judged.
              New tributes arrive as soon as they&rsquo;re scored.
            </p>
          </motion.header>

          {ideas.length === 0 ? (
            <ZeroState />
          ) : (
            <>
              <FilterBar active={filter} onChange={setFilter} counts={counts} />

              {/* Live region for new-insert announcements lives OUTSIDE
                  the <ul> — putting aria-live on the list itself would
                  cause screen readers to re-announce every visible
                  item on every realtime insert. This sr-only span fires
                  a single short "1 new tribute" message instead. */}
              <span
                className="sr-only"
                aria-live="polite"
                aria-relevant="additions"
              >
                {announcement}
              </span>
              <MotionConfig reducedMotion="user">
                <ul
                  className="space-y-4 sm:space-y-5"
                  aria-label="Tributes"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {filtered.length === 0 ? (
                      <EmptyState filter={filter} />
                    ) : (
                      filtered.map((idea, i) => (
                        <li key={idea.id}>
                          <IdeaCard
                            idea={idea}
                            isNew={newIds.has(idea.id)}
                            index={i}
                          />
                        </li>
                      ))
                    )}
                  </AnimatePresence>
                </ul>
              </MotionConfig>
            </>
          )}

          <div className="mt-16 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/submissions" className="cta-btn-primary text-sm">
              Pitch your idea <span aria-hidden>→</span>
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

function filterIdeas(ideas: FeedIdea[], filter: Filter): FeedIdea[] {
  switch (filter) {
    case "survivors":
      return ideas.filter((i) => (i.score ?? 0) >= 7);
    case "victors":
      return ideas.filter((i) => (i.score ?? 0) >= 9);
    case "fallen":
      return ideas.filter((i) => (i.score ?? 0) >= 1 && (i.score ?? 0) <= 3);
    case "all":
    default:
      return ideas;
  }
}

function countsByFilter(ideas: FeedIdea[]): Record<Filter, number> {
  return {
    all: ideas.length,
    survivors: ideas.filter((i) => (i.score ?? 0) >= 7).length,
    victors: ideas.filter((i) => (i.score ?? 0) >= 9).length,
    fallen: ideas.filter((i) => (i.score ?? 0) >= 1 && (i.score ?? 0) <= 3)
      .length,
  };
}

function FilterBar({
  active,
  onChange,
  counts,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
  counts: Record<Filter, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter tributes"
      className="my-12 flex flex-wrap items-center justify-center gap-2"
    >
      {FILTERS.map((f) => {
        const isActive = f.id === active;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(f.id)}
            className={cn(
              "scene-mono inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black",
              isActive
                ? "border-[var(--scene-gold)] bg-[var(--scene-gold)]/10 text-[var(--scene-gold-bright)]"
                : "border-white/15 text-white/55 hover:border-white/35 hover:text-white",
            )}
          >
            <span>{f.label}</span>
            <span className="tabular-nums opacity-80">{counts[f.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════ ZeroState ═════════════════════════════════
 * Branded empty state for the feed when no tributes exist yet. The
 * page remains mounted so the realtime subscription above is still
 * live — when the first INSERT lands, `ideas.length` flips to 1 and
 * this component unmounts in favor of the live list. The CTA points
 * at `/` because the homepage pitch pill is the natural next action.
 * ────────────────────────────────────────────────────────────────────── */
function ZeroState() {
  return (
    <div className="mt-20 flex flex-col items-center gap-6 px-4 text-center sm:mt-24">
      <p className="scene-mono text-[0.55rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.65rem]">
        · the pit is silent ·
      </p>
      <h2 className="scene-display-italic max-w-2xl text-balance text-3xl leading-[1.05] text-white sm:text-5xl lg:text-6xl">
        Nothing in the feed yet.
      </h2>
      <p className="scene-display max-w-md text-balance text-base leading-snug text-white/72 sm:text-lg">
        Tributes appear here the moment they&rsquo;re scored. The next one could be yours.
      </p>
      <Link href="/" className="cta-btn-primary mt-3 text-sm">
        Pitch yours <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const headline: Record<Filter, string> = {
    all: "Be the first.",
    survivors: "No survivors yet.",
    victors: "No victors yet.",
    fallen: "No tributes fallen.",
  };
  const sub: Record<Filter, string> = {
    all: "The pit is empty. Stake your claim.",
    survivors: "Score sharp. Stand above the rest.",
    victors: "Few are chosen. None yet stand victorious.",
    fallen: "Even the rejected leave a mark on the wall.",
  };
  return (
    <li className="mt-12 flex flex-col items-center gap-4 py-14 text-center">
      <h3 className="scene-display-italic text-balance text-2xl leading-tight text-white sm:text-4xl">
        {headline[filter]}
      </h3>
      <p className="scene-display max-w-sm text-balance text-base text-white/55">
        {sub[filter]}
      </p>
      <Link href="/" className="cta-btn-primary mt-3 text-sm">
        Pitch your idea <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
