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
          setTimeout(() => {
            setNewIds((prev) => {
              const next = new Set(prev);
              next.delete(row.id);
              return next;
            });
          }, 1400);
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
    <>
      <MinimalistHeader />
      <main id="main" className="scene relative isolate min-h-dvh overflow-hidden bg-black">
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
            <p className="scene-mono text-[0.62rem] uppercase tracking-[0.45em] text-[var(--scene-gold)] sm:text-[0.7rem]">
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

          <FilterBar active={filter} onChange={setFilter} counts={counts} />

          <MotionConfig reducedMotion="user">
            <ul
              className="space-y-4 sm:space-y-5"
              aria-live="polite"
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

          <div className="mt-16 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/submit" className="cta-btn-primary text-sm">
              Pitch your idea <span aria-hidden>→</span>
            </Link>
            <Link href="/leaderboard" className="cta-btn-ghost text-sm">
              View leaderboard
            </Link>
          </div>
        </div>

      </main>
    </>
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

function EmptyState({ filter }: { filter: Filter }) {
  const messages: Record<Filter, string> = {
    all: "No tributes yet. Be the first to face the pit.",
    survivors: "No tribute has yet survived. The pit is hungry.",
    victors: "Few are chosen. None yet stand victorious.",
    fallen: "No tribute has fallen — yet.",
  };
  return (
    <li className="scene-card px-10 py-14 text-center">
      <p className="text-lg italic text-white/72 sm:text-xl">
        {messages[filter]}
      </p>
      <Link href="/submit" className="cta-btn-primary mt-6 text-sm">
        Pitch your idea <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
