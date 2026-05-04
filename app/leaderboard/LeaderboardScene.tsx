"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { type LeaderboardIdea } from "@/lib/idea-types";
import { cn } from "@/lib/utils";

type Tab = "alltime" | "week";

export function LeaderboardScene({
  alltime,
  week,
  weekNumber,
}: {
  alltime: LeaderboardIdea[];
  week: LeaderboardIdea[];
  weekNumber: number | null;
}) {
  const [tab, setTab] = useState<Tab>("alltime");
  const ideas = tab === "alltime" ? alltime : week;
  const [first, second, third, ...rest] = ideas;

  return (
    <>
      <MinimalistHeader />
      <main id="main" className="scene relative isolate min-h-dvh overflow-hidden bg-black">
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
            <p className="scene-mono text-[0.62rem] uppercase tracking-[0.45em] text-[var(--scene-gold)] sm:text-[0.7rem]">
              ↘ Roll of honor
            </p>
            <h1 className="mt-5 text-balance text-[2.25rem] font-medium leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              The{" "}
              <span className="italic text-[var(--scene-gold-bright)]">
                victors
              </span>
              .
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-white/72 sm:text-lg">
              They who stood before the gamemaster and were judged worthy.
            </p>
          </motion.header>

          {/* TABS */}
          <Tabs
            active={tab}
            onChange={setTab}
            counts={{ alltime: alltime.length, week: week.length }}
            weekNumber={weekNumber}
          />

          {ideas.length === 0 ? (
            <Empty tab={tab} />
          ) : (
            <>
              {/* PODIUM */}
              <div className="mt-16 grid gap-5 md:grid-cols-3 md:gap-4">
                {second && <PodiumCard idea={second} rank={2} />}
                {first && <PodiumCard idea={first} rank={1} />}
                {third && <PodiumCard idea={third} rank={3} />}
              </div>

              {/* REST */}
              {rest.length > 0 && (
                <ol className="scene-card mt-12 divide-y divide-white/[0.05]">
                  {rest.map((idea, i) => (
                    <ListRow key={idea.id} idea={idea} rank={i + 4} />
                  ))}
                </ol>
              )}
            </>
          )}

          {/* footer link */}
          <div className="mt-20 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/submit" className="cta-btn-primary text-sm">
              Pitch your idea <span aria-hidden>→</span>
            </Link>
            <Link href="/built" className="cta-btn-ghost text-sm">
              See past builds
            </Link>
          </div>
        </div>

      </main>
    </>
  );
}

function Tabs({
  active,
  onChange,
  counts,
  weekNumber,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  counts: Record<Tab, number>;
  weekNumber: number | null;
}) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "alltime", label: "All-Time" },
    { id: "week", label: weekNumber ? `Week ${weekNumber}` : "This Week" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Leaderboard window"
      className="mt-12 flex justify-center gap-2"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={cn(
              "scene-mono inline-flex items-center gap-2.5 rounded-full border px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black",
              isActive
                ? "border-[var(--scene-gold)] bg-[var(--scene-gold)]/10 text-[var(--scene-gold-bright)]"
                : "border-white/15 text-white/55 hover:border-white/35 hover:text-white",
            )}
          >
            <span>{t.label}</span>
            <span className="tabular-nums opacity-80">{counts[t.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

function PodiumCard({
  idea,
  rank,
}: {
  idea: LeaderboardIdea;
  rank: 1 | 2 | 3;
}) {
  const isFirst = rank === 1;
  const palette =
    rank === 1
      ? { accent: "var(--scene-gold-bright)", label: "Token King" }
      : rank === 2
        ? { accent: "#dcdfe6", label: "Almost Ascended" }
        : { accent: "#d59554", label: "Still Climbing" };

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: rank * 0.1 }}
      className={cn(
        "relative flex flex-col px-7 py-7 text-center sm:px-8 sm:py-8",
        isFirst ? "scene-card-gold md:order-2 md:-mt-4 md:py-12" : "scene-card",
      )}
    >
      <p
        className="scene-mono text-[0.55rem] uppercase tracking-[0.35em]"
        style={{ color: palette.accent }}
      >
        {palette.label}
      </p>
      <p
        className="scene-mono mt-3 text-5xl font-semibold leading-none tabular-nums sm:text-6xl"
        style={{
          color: palette.accent,
          textShadow: isFirst
            ? "0 0 16px rgba(255, 184, 0, 0.55), 0 0 36px rgba(255, 184, 0, 0.3)"
            : undefined,
        }}
      >
        {String(rank).padStart(2, "0")}
      </p>

      <h3 className="mt-6 text-lg font-medium leading-tight text-white sm:text-xl">
        {idea.title}
      </h3>
      {idea.handle && (
        <p className="scene-mono mt-2 text-[0.6rem] uppercase tracking-[0.3em] text-white/50">
          {idea.handle}
        </p>
      )}

      <p className="mt-4 line-clamp-3 text-sm italic leading-snug text-white/72">
        &ldquo;{idea.verdict}&rdquo;
      </p>

      <div className="mt-6 flex items-center justify-center gap-5">
        <span>
          <span
            className="scene-mono text-2xl font-semibold tabular-nums"
            style={{ color: palette.accent }}
          >
            {idea.final_score ?? 0}
          </span>
          <span className="scene-mono ml-1 text-[0.55rem] uppercase tracking-[0.3em] text-white/40">
            / 100
          </span>
        </span>
        <span className="scene-mono text-[0.55rem] uppercase tracking-[0.3em] text-white/40">
          AI {idea.score} · {idea.vote_count} votes
        </span>
        <Link
          href={`/idea/${idea.id}`}
          className="scene-mono text-[0.6rem] uppercase tracking-[0.3em] text-white/55 transition-colors hover:text-white"
        >
          View →
        </Link>
      </div>
    </motion.article>
  );
}

function ListRow({ idea, rank }: { idea: LeaderboardIdea; rank: number }) {
  return (
    <li>
      <Link
        href={`/idea/${idea.id}`}
        className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04] focus-visible:outline-none sm:gap-6 sm:px-7"
      >
        <span className="scene-mono w-8 text-right text-sm tabular-nums text-white/40">
          {String(rank).padStart(2, "0")}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base text-white sm:text-lg">
            {idea.title}
          </span>
          <span className="scene-mono mt-0.5 block text-[0.55rem] uppercase tracking-[0.3em] text-white/45">
            {idea.handle ?? "anonymous"}
          </span>
        </span>
        <span className="scene-mono hidden tabular-nums text-[0.6rem] uppercase tracking-[0.3em] text-white/40 sm:inline">
          {idea.vote_count} votes
        </span>
        <span className="scene-mono w-14 text-right tabular-nums text-base font-semibold text-[var(--scene-gold-bright)] sm:w-16 sm:text-lg">
          {idea.final_score ?? 0}
          <span className="ml-0.5 text-[0.55rem] text-white/35">/100</span>
        </span>
      </Link>
    </li>
  );
}

function Empty({ tab }: { tab: Tab }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-6 text-center">
      <div className="scene-card max-w-md px-10 py-12">
        <p className="text-lg italic text-white/72">
          {tab === "alltime"
            ? "The arena awaits its first champion."
            : "No tribute has triumphed this week."}
        </p>
        <p className="mt-3 text-sm text-white/45">
          Render an offering. Stand atop the games.
        </p>
        <Link href="/submit" className="cta-btn-primary mt-7 text-sm">
          Pitch your idea <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
