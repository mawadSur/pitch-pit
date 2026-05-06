"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { ShareMenu } from "@/components/idea/ShareMenu";
import { type LeaderboardIdea } from "@/lib/idea-types";
import { JUDGES } from "@/lib/judges";
import { createClient } from "@/lib/supabase/client";
import { formatVoteCount } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "alltime" | "week";

/* ════════════════════════ Status palette ════════════════════════════
 * Semantic score color: oxblood for fallen, verdigris for built, gold
 * everywhere else. The thresholds match the design spec:
 *   - status === "built"      → verdigris-bright + BUILT pill
 *   - final_score ≤ 30 OR     → oxblood-bright (fallen)
 *     score ≤ 3
 *   - default                  → gold-bright (the sharp ones)
 * Returns a CSS var name so consumers can compose with Tailwind arbitrary
 * value classes (e.g. `text-[var(--scene-gold-bright)]`).
 * ────────────────────────────────────────────────────────────────────── */
function scoreTone(idea: Pick<LeaderboardIdea, "final_score" | "score" | "status">):
  | "gold"
  | "oxblood"
  | "verdigris" {
  if (idea.status === "built") return "verdigris";
  const final = idea.final_score ?? 0;
  if (final <= 30 || idea.score <= 3) return "oxblood";
  return "gold";
}

function toneVar(tone: "gold" | "oxblood" | "verdigris"): string {
  if (tone === "oxblood") return "var(--scene-oxblood-bright)";
  if (tone === "verdigris") return "var(--scene-verdigris-bright)";
  return "var(--scene-gold-bright)";
}

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
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state lives in the URL (`?tab=week`) so the native back button
  // restores it alongside the search query. Default (no param) is alltime.
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "week" ? "week" : "alltime";
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "alltime") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.push(qs ? `/leaderboard?${qs}` : "/leaderboard");
  };

  const ideas = tab === "alltime" ? alltime : week;
  const [first, second, third, ...rest] = ideas;

  // Track when a realtime event last touched the board so we can flash the
  // LIVE indicator briefly. Refs avoid re-renders for stale-data tracking.
  const [pulseAt, setPulseAt] = useState<number>(0);
  const lastRefreshRef = useRef<number>(0);

  // ─── Realtime subscription ────────────────────────────────────
  // Listen on both `ideas` (final_score / vote_count / status changes)
  // and `votes` (raw vote inserts/deletes). Coalesce bursts to one
  // refresh per ~600ms so a flurry of votes doesn't overwhelm the
  // server-component refetch.
  //
  // Visibility-gated: when the tab is hidden we tear down the channel so
  // we don't burn realtime quota / battery on unseen updates. On
  // visibility return we re-subscribe and refresh once to catch up.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

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

    const subscribe = () => {
      if (channel) return;
      channel = supabase
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
    };

    const unsubscribe = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        unsubscribe();
      } else {
        subscribe();
        // Catch up on anything that happened while we were away.
        router.refresh();
      }
    };

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      subscribe();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [router]);

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
              ↘ Roll of honor
            </p>
            <h1 className="scene-display mt-5 text-balance text-4xl font-medium leading-[1.02] text-white sm:text-5xl lg:text-6xl">
              The{" "}
              <span className="scene-display-italic text-[var(--scene-gold-bright)]">
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
              {/* PODIUM — top 3 hero row.
                  Visual order on desktop is rank 2 (left), rank 1 (center,
                  raised + scaled), rank 3 (right). On mobile we collapse to
                  a single column with rank 1 first so the giant numeral
                  treatment is always the first thing visible. Empty slots
                  render placeholder cards so the 3-column grid never
                  collapses or shifts column widths. */}
              <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-4 sm:items-end">
                <PodiumSlot idea={second ?? null} rank={2} order="sm:order-1" />
                <PodiumSlot idea={first ?? null} rank={1} order="order-first sm:order-2" />
                <PodiumSlot idea={third ?? null} rank={3} order="sm:order-3" />
              </div>

              {/* LEDGER — ranks 4+ rendered as flat ledger rows (no glass) */}
              {rest.length > 0 && (
                <div className="mt-16">
                  <div className="scene-mono mb-3 flex items-baseline justify-between border-b border-white/[0.08] pb-3 text-[0.55rem] uppercase tracking-[0.32em] text-white/40">
                    <span>The remainder</span>
                    <span className="tabular-nums">
                      {rest.length} {rest.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                  <ol className="border-t border-white/[0.05]">
                    {rest.map((idea, i) => (
                      <LedgerRow
                        key={idea.id}
                        idea={idea}
                        rank={i + 4}
                        zebra={i % 2 === 0}
                      />
                    ))}
                  </ol>
                </div>
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
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Nav-3: when arriving from the global header search button
  // (`/leaderboard?focus=search`), focus the input on mount and strip the
  // marker so a refresh doesn't keep stealing focus.
  useEffect(() => {
    if (searchParams.get("focus") !== "search") return;
    inputRef.current?.focus();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    const qs = params.toString();
    router.replace(qs ? `/leaderboard?${qs}` : "/leaderboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // `isPending` is true from `startTransition` until the server-rendered
  // navigation lands, so it covers the "request in flight" window after
  // the 350ms debounce fires. Combined with the local `pendingDebounce`
  // flag below, the spinner shows continuously from keystroke → result.
  const [isPending, startTransition] = useTransition();
  const [pendingDebounce, setPendingDebounce] = useState(false);
  const showSpinner = pendingDebounce || isPending;

  // Keep local input in sync if the URL changes from elsewhere (back button).
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  function pushQuery(q: string) {
    const trimmed = q.trim();
    // Preserve any non-q params (e.g. ?tab=week) on every push.
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed.length === 0) params.delete("q");
    else params.set("q", trimmed);
    const qs = params.toString();
    const url = qs ? `/leaderboard?${qs}` : "/leaderboard";
    setPendingDebounce(false);
    startTransition(() => {
      router.push(url);
    });
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPendingDebounce(true);
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
          ref={inputRef}
          type="search"
          value={value}
          onChange={onChange}
          placeholder="Search ideas by title or pitch text…"
          aria-label="Search ideas"
          className="w-full rounded-full border border-white/12 bg-white/[0.03] py-3 pl-11 pr-20 text-base text-white placeholder:text-white/55 transition-colors focus:border-[var(--scene-gold)]/55 focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/40"
        />
        {/* Right-anchored slot: spinner overlays during debounce + nav,
            clear button shows whenever the field has text. They sit at
            different inset offsets so they coexist without jumping. */}
        {showSpinner && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
          >
            <span
              role="status"
              aria-live="polite"
              aria-label="Searching"
              className="block h-3.5 w-3.5 rounded-full border border-[var(--scene-gold)]/35 border-t-[var(--scene-gold-bright)] motion-safe:animate-spin"
            />
          </span>
        )}
        {value.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className={cn(
              "scene-mono absolute top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/55 transition-colors hover:bg-white/[0.04] hover:text-white",
              showSpinner ? "right-10" : "right-3",
            )}
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
        "scene-mono inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-[0.65rem] uppercase tracking-[0.35em] transition-colors",
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
              "inline-flex items-center gap-2.5 rounded-full border px-5 py-2 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black",
              isActive
                ? "scene-display border-[var(--scene-gold)] bg-[var(--scene-gold)]/10 text-[1rem] tracking-tight text-[var(--scene-gold-bright)]"
                : "scene-mono border-white/15 text-[0.65rem] uppercase tracking-[0.3em] text-white/55 hover:border-white/35 hover:text-white",
            )}
          >
            <span>{t.label}</span>
            <span
              className={cn(
                "tabular-nums opacity-80",
                isActive ? "scene-mono text-[0.65rem] tracking-[0.3em]" : "",
              )}
            >
              {counts[t.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════ PodiumSlot ════════════════════════════════
 * Top-3 hero card. The rank numeral is the visual anchor — rendered at
 * 140-220px in Fraunces (`.scene-numeral`) so it reads as "ledger book"
 * typography, not a UI badge. Rank 1 lives in the center column on
 * desktop (`sm:order-2`), gets a `lg:scale-110 lg:-mt-4` lift, and a
 * gold glow text-shadow on its numeral. Ranks 2 & 3 share a quieter
 * white/55 numeral.
 *
 * Renders an "Awaiting" placeholder when the slot has no idea yet so
 * the 3-column layout never collapses.
 *
 * The whole card is wrapped in <Link> to /idea/[id] (when populated)
 * so the entire surface is the click target. ShareMenu lives inline at
 * the bottom and stops propagation via its own click handler.
 * ────────────────────────────────────────────────────────────────────── */
function PodiumSlot({
  idea,
  rank,
  order,
}: {
  idea: LeaderboardIdea | null;
  rank: 1 | 2 | 3;
  order: string;
}) {
  const isFirst = rank === 1;
  const numeralColor = isFirst ? "text-[var(--scene-gold)]" : "text-white/55";
  const numeralGlow = isFirst
    ? { textShadow: "0 0 36px rgba(255,184,0,0.35)" }
    : undefined;

  // Empty placeholder — keeps grid columns from collapsing.
  if (!idea) {
    return (
      <div
        className={cn(
          "relative flex flex-col items-center px-6 py-8 text-center",
          order,
          isFirst ? "lg:-mt-4 lg:scale-105" : "",
        )}
      >
        <div
          className={cn(
            "scene-numeral text-[140px] sm:text-[180px] lg:text-[220px]",
            "text-white/15",
          )}
          aria-hidden
        >
          {String(rank).padStart(2, "0")}
        </div>
        <div className="scene-display mt-2 text-xl text-white/35 sm:text-2xl">
          —
        </div>
        <p className="scene-mono mt-3 text-[0.55rem] uppercase tracking-[0.35em] text-white/35">
          Awaiting
        </p>
      </div>
    );
  }

  const tone = scoreTone(idea);
  const scoreColor = toneVar(tone);
  const isBuilt = idea.status === "built";

  return (
    <Link
      href={`/idea/${idea.id}`}
      aria-label={`Rank ${rank}: ${idea.title}`}
      className={cn(
        "group relative flex flex-col items-center rounded-2xl px-6 py-8 text-center",
        "border border-white/[0.06] bg-white/[0.015]",
        "transition-all duration-300",
        "hover:border-[var(--scene-gold)]/40 hover:bg-white/[0.025]",
        "active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black",
        order,
        isFirst ? "lg:-mt-4 lg:scale-110" : "",
      )}
    >
      <div
        className={cn(
          "scene-numeral text-[140px] sm:text-[180px] lg:text-[220px]",
          // Only rank 1 gets the foil sweep — keeps the moment
          // singular instead of three numerals fighting for the eye.
          isFirst && "scene-foil",
          numeralColor,
        )}
        style={numeralGlow}
        aria-hidden
      >
        {String(rank).padStart(2, "0")}
      </div>

      <h3 className="scene-display mt-2 line-clamp-2 text-xl font-medium text-white sm:text-2xl">
        {idea.title}
      </h3>

      {isBuilt && (
        <span className="scene-mono mt-3 inline-flex items-center rounded-full border border-[var(--scene-verdigris-bright)]/40 bg-[var(--scene-verdigris)]/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.3em] text-[var(--scene-verdigris-bright)]">
          Built
        </span>
      )}

      <div className="mt-5 flex items-baseline justify-center gap-1">
        <span
          className="scene-numeral text-3xl tabular-nums"
          style={{ color: scoreColor }}
        >
          {idea.final_score ?? 0}
        </span>
        <span className="text-base tabular-nums text-white/45">/100</span>
      </div>

      <p className="scene-mono mt-3 text-[0.65rem] uppercase tracking-[0.16em] text-white/55">
        {formatVoteCount(idea.vote_count)} votes
      </p>

      <div
        className="mt-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
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
    </Link>
  );
}

/* ════════════════════════ LedgerRow ═════════════════════════════════
 * Ranks 4+. Flat table-like row, no glass. Even-indexed rows get a
 * faint `bg-white/[0.015]` zebra tint. Whole row is a clickable Link
 * to /idea/[id]; ShareMenu stops propagation so its own click target
 * works without triggering navigation.
 *
 * Layout: rank | title (+ judge breakdown stacked under on desktop) |
 * score | share. On <sm: viewports the rank/title/score collapse to a
 * two-line vertical stack so the row stays readable on phones.
 * ────────────────────────────────────────────────────────────────────── */
function LedgerRow({
  idea,
  rank,
  zebra,
}: {
  idea: LeaderboardIdea;
  rank: number;
  zebra: boolean;
}) {
  const tone = scoreTone(idea);
  const scoreColor = toneVar(tone);
  const isBuilt = idea.status === "built";

  return (
    <li
      className={cn(
        "border-b border-white/[0.05]",
        zebra ? "bg-white/[0.015]" : "",
      )}
    >
      <Link
        href={`/idea/${idea.id}`}
        aria-label={`Rank ${rank}: ${idea.title}`}
        className={cn(
          "group flex items-stretch gap-4 px-3 py-4 transition-colors sm:gap-6 sm:px-5",
          "hover:bg-white/[0.03] active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:bg-white/[0.03]",
        )}
      >
        {/* Rank — mono, faint */}
        <span className="scene-mono w-10 shrink-0 self-center text-base tabular-nums text-white/45 sm:w-12">
          {String(rank).padStart(2, "0")}
        </span>

        {/* Title + meta — stacks differently on mobile vs desktop */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 sm:gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base text-white transition-colors group-hover:text-[var(--scene-gold-bright)]">
              {idea.title}
            </span>
            {isBuilt && (
              <span className="scene-mono inline-flex shrink-0 items-center rounded-full border border-[var(--scene-verdigris-bright)]/40 bg-[var(--scene-verdigris)]/10 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-[0.25em] text-[var(--scene-verdigris-bright)]">
                Built
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <JudgeBreakdown scores={idea.judge_scores} />
            <span className="scene-mono text-[0.6rem] uppercase tracking-[0.16em] tabular-nums text-white/45 sm:hidden">
              {formatVoteCount(idea.vote_count)} votes
            </span>
            {/* mobile-only inline score so the row is scannable */}
            <span
              className="scene-numeral ml-auto text-xl tabular-nums sm:hidden"
              style={{ color: scoreColor }}
            >
              {idea.final_score ?? 0}
              <span className="ml-0.5 text-[0.6rem] text-white/45">/100</span>
            </span>
          </div>
        </div>

        {/* Vote count — desktop only, in the gutter */}
        <span className="scene-mono hidden self-center text-[0.65rem] uppercase tracking-[0.16em] tabular-nums text-white/55 sm:inline">
          {formatVoteCount(idea.vote_count)} votes
        </span>

        {/* Final score — the marquee number on desktop */}
        <span className="hidden w-20 shrink-0 items-baseline justify-end self-center sm:flex">
          <span
            className="scene-numeral text-2xl tabular-nums"
            style={{ color: scoreColor }}
          >
            {idea.final_score ?? 0}
          </span>
          <span className="ml-0.5 text-[0.6rem] tabular-nums text-white/45">
            /100
          </span>
        </span>

        {/* Share — stops propagation so click on the icon doesn't navigate */}
        <span
          className="flex shrink-0 self-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
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
        </span>
      </Link>
    </li>
  );
}

/* ════════════════════════ JudgeBreakdown ═══════════════════════════
 * Tiny per-judge score row: `G 8 · V 7 · R 9` style. Initials come from
 * the judge id (first char uppercased) so they map deterministically:
 * G/V/R for Gstack/Vee/Robbins. JUDGES order is the canonical sort.
 *
 * Renders only when at least 2 judges have a result — defensive against
 * older ideas (judge_scores: null) and partial errors (one judge missed).
 * ────────────────────────────────────────────────────────────────────── */
function JudgeBreakdown({
  scores,
}: {
  scores: LeaderboardIdea["judge_scores"];
}) {
  if (!scores) return null;
  type Entry = { id: string; initial: string; score: number };
  const entries: Entry[] = [];
  for (const judge of JUDGES) {
    const result = scores[judge.id];
    if (!result) continue;
    entries.push({
      id: judge.id,
      initial: judge.id[0].toUpperCase(),
      score: result.score,
    });
  }
  if (entries.length < 2) return null;
  return (
    <dl className="flex">
      <dt className="sr-only">Per-judge scores</dt>
      <dd className="scene-mono flex items-center gap-1.5 text-[0.55rem] uppercase tracking-[0.16em] tabular-nums text-white/55">
        {entries.map((entry, i) => (
          <span key={entry.id} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-[var(--scene-gold)]/55">
                ·
              </span>
            )}
            <span>
              {entry.initial}{" "}
              <span className="text-[var(--scene-gold)]">{entry.score}</span>
            </span>
          </span>
        ))}
      </dd>
    </dl>
  );
}

function Empty({ tab }: { tab: Tab }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-6 text-center">
      <div className="scene-card max-w-md px-10 py-12">
        <p className="scene-display-italic text-lg text-white/72">
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
