"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { ShareMenu } from "@/components/idea/ShareMenu";
import { type LeaderboardIdea } from "@/lib/idea-types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Tab = "alltime" | "week";

export function LeaderboardScene({
  alltime,
  week,
  weekNumber,
  query = "",
}: {
  alltime: LeaderboardIdea[];
  week: LeaderboardIdea[];
  weekNumber: number | null;
  query?: string;
}) {
  const [tab, setTab] = useState<Tab>("alltime");
  const ideas = tab === "alltime" ? alltime : week;
  const [first, second, third, ...rest] = ideas;
  const router = useRouter();

  // Track when a realtime event last touched the board so we can flash the
  // LIVE indicator briefly. Refs avoid re-renders for stale-data tracking.
  const [pulseAt, setPulseAt] = useState<number>(0);
  const lastRefreshRef = useRef<number>(0);

  // ─── Realtime subscription ────────────────────────────────────
  // Listen on both `ideas` (final_score / vote_count / status changes)
  // and `votes` (raw vote inserts/deletes). Coalesce bursts to one
  // refresh per ~600ms so a flurry of votes doesn't overwhelm the
  // server-component refetch.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      const now = Date.now();
      // Coalesce: ignore further events within the cooldown window.
      if (now - lastRefreshRef.current < 600) return;
      if (timer) return;
      timer = setTimeout(() => {
        lastRefreshRef.current = Date.now();
        setPulseAt(Date.now());
        router.refresh();
        timer = null;
      }, 250);
    };

    const channel = supabase
      .channel("leaderboard-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ideas" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <MotionConfig reducedMotion="user">
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
            <p className="scene-mono text-[0.78rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.92rem]">
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
            <div className="mt-6 flex justify-center">
              <LiveIndicator pulseAt={pulseAt} />
            </div>
          </motion.header>

          {/* SEARCH */}
          <SearchBox initial={query} />

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
            <Link href="/submissions" className="cta-btn-primary text-sm">
              Pitch your idea <span aria-hidden>→</span>
            </Link>
            <Link href="/built" className="cta-btn-ghost text-sm">
              See past builds
            </Link>
          </div>
        </div>

      </main>
      </>
    </MotionConfig>
  );
}

/* ════════════════════════ SearchBox ═════════════════════════════════
 * Server-driven search via URL ?q= param. We push the new URL on submit
 * (or after a short debounce) — page.tsx re-fetches with the filter,
 * server-rendering the matching ideas.
 *
 * Debounced typing avoids a server roundtrip on every keystroke. Submit
 * (Enter) bypasses debounce for instant results.
 * ────────────────────────────────────────────────────────────────────── */
function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync if the URL changes from elsewhere (back button).
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  function pushQuery(q: string) {
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      router.push("/leaderboard");
    } else {
      router.push(`/leaderboard?q=${encodeURIComponent(trimmed)}`);
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushQuery(next), 350);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pushQuery(value);
  }

  function onClear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setValue("");
    pushQuery("");
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="Search ideas"
      className="mt-12 flex justify-center"
    >
      <div className="relative w-full max-w-xl">
        <span
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/55"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m12 12 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <input
          type="search"
          value={value}
          onChange={onChange}
          placeholder="Search ideas by title or pitch text…"
          aria-label="Search ideas"
          className="w-full rounded-full border border-white/12 bg-white/[0.03] py-3 pl-11 pr-12 text-base text-white placeholder:text-white/55 transition-colors focus:border-[var(--scene-gold)]/55 focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/40"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="scene-mono absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[0.6rem] uppercase tracking-[0.3em] text-white/55 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            clear
          </button>
        )}
      </div>
    </form>
  );
}

/* ════════════════════════ LiveIndicator ═════════════════════════════
 * Always-on pulse that flashes brighter for 1.6s after a realtime event
 * lands. Single source of truth: `pulseAt` timestamp from the parent.
 * ────────────────────────────────────────────────────────────────────── */
function LiveIndicator({ pulseAt }: { pulseAt: number }) {
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    if (!pulseAt) return;
    setRecent(true);
    const id = setTimeout(() => setRecent(false), 1600);
    return () => clearTimeout(id);
  }, [pulseAt]);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "scene-mono inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-[0.6rem] uppercase tracking-[0.35em] transition-colors",
        recent
          ? "border-[var(--scene-gold)]/55 bg-[var(--scene-gold)]/10 text-[var(--scene-gold-bright)]"
          : "border-white/12 bg-white/[0.03] text-white/55",
      )}
    >
      <span className="relative flex h-2 w-2">
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full motion-safe:animate-ping",
            recent ? "bg-[var(--scene-gold-bright)]" : "bg-[var(--scene-gold)]/55",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "relative h-2 w-2 rounded-full",
            recent ? "bg-[var(--scene-gold-bright)]" : "bg-[var(--scene-gold)]/85",
          )}
        />
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={recent ? "updating" : "live"}
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 2 }}
          transition={{ duration: 0.18 }}
        >
          {recent ? "Updating" : "Live"}
        </motion.span>
      </AnimatePresence>
    </span>
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
          <span className="scene-mono ml-1 text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
            / 100
          </span>
        </span>
        <span className="scene-mono text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
          AI {idea.score} · {idea.vote_count} votes
        </span>
        <Link
          href={`/idea/${idea.id}`}
          className="scene-mono text-[0.6rem] uppercase tracking-[0.3em] text-white/55 transition-colors hover:text-white"
        >
          View →
        </Link>
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
    </motion.article>
  );
}

function ListRow({ idea, rank }: { idea: LeaderboardIdea; rank: number }) {
  return (
    <li>
      <div className="group grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.04] sm:gap-6 sm:px-7">
        <span className="scene-mono w-8 text-right text-sm tabular-nums text-white/55">
          {String(rank).padStart(2, "0")}
        </span>
        <Link
          href={`/idea/${idea.id}`}
          className="min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--scene-gold)]/55"
        >
          <span className="block truncate text-base text-white sm:text-lg">
            {idea.title}
          </span>
          <span className="scene-mono mt-0.5 block text-[0.55rem] uppercase tracking-[0.3em] text-white/45">
            {idea.handle ?? "anonymous"}
          </span>
        </Link>
        <span className="scene-mono hidden tabular-nums text-[0.6rem] uppercase tracking-[0.3em] text-white/55 sm:inline">
          {idea.vote_count} votes
        </span>
        <span className="scene-mono w-14 text-right tabular-nums text-base font-semibold text-[var(--scene-gold-bright)] sm:w-16 sm:text-lg">
          {idea.final_score ?? 0}
          <span className="ml-0.5 text-[0.55rem] text-white/55">/100</span>
        </span>
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
        <Link href="/submissions" className="cta-btn-primary mt-7 text-sm">
          Pitch your idea <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
