"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { MinimalistHeader } from "@/components/scene/MinimalistHeader";
import { Particles } from "@/components/scene/Particles";
import { ShareMenu } from "@/components/idea/ShareMenu";
import { type LeaderboardIdea } from "@/lib/idea-types";
import { type WeekSummary } from "./types";
import { JUDGES } from "@/lib/judges";
import { createClient } from "@/lib/supabase/client";
import { formatVoteCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { titleToSlug } from "@/lib/slug";

// Build a slug-friendly path for an idea page. Title-derived slug is
// purely informational; the UUID remains the source of truth and the
// page canonicalizes mismatched slugs server-side.
function ideaPath(id: string, title: string): string {
  const slug = titleToSlug(title);
  return slug ? `/idea/${id}/${slug}` : `/idea/${id}`;
}

// Tab is either the synthetic "alltime" or a specific week number.
// Encoded in the URL as `?week=N` (alltime = no param).
type Tab = "alltime" | { kind: "week"; weekNumber: number };

function tabKey(tab: Tab): string {
  return tab === "alltime" ? "alltime" : `week-${tab.weekNumber}`;
}

/* ════════════════════════ Status palette ════════════════════════════
 * Semantic score color: oxblood for fallen, verdigris for built, gold
 * everywhere else. The thresholds match the design spec:
 *   - status === "built"      → verdigris-bright + BUILT pill
 *   - score ≤ 3 (AI verdict)  → oxblood-bright (fallen)
 *   - default                  → gold-bright (the sharp ones)
 *
 * Threshold is on the AI score (0..10) — that's the "AI verdict" axis.
 * `final_score` is no longer a useful threshold under the new formula
 * because a high-AI-low-vote idea legitimately sits in the 30-50 band.
 * ────────────────────────────────────────────────────────────────────── */
function scoreTone(idea: Pick<LeaderboardIdea, "final_score" | "score" | "status">):
  | "gold"
  | "oxblood"
  | "verdigris" {
  if (idea.status === "built") return "verdigris";
  if (idea.score <= 3) return "oxblood";
  return "gold";
}

function toneVar(tone: "gold" | "oxblood" | "verdigris"): string {
  if (tone === "oxblood") return "var(--scene-oxblood-bright)";
  if (tone === "verdigris") return "var(--scene-verdigris-bright)";
  return "var(--scene-gold-bright)";
}

/* Split the final_score into its AI half (0..50) and community half
 * (0..50) for display. AI half is deterministic from the AI score:
 * `score * 5`. Community half is whatever remains, clamped — handles
 * legacy rows whose final_score predates the new formula without
 * showing negative numbers. */
function splitScore(idea: Pick<LeaderboardIdea, "final_score" | "score">): {
  ai: number;
  community: number;
} {
  const ai = Math.max(0, Math.min(50, Math.round(idea.score * 5)));
  const final = idea.final_score ?? ai;
  const community = Math.max(0, Math.min(50, final - ai));
  return { ai, community };
}

export function LeaderboardScene({
  alltime,
  weekIdeas,
  weeks,
  selectedWeek,
  isFrozen,
  query = "",
}: {
  alltime: LeaderboardIdea[];
  weekIdeas: LeaderboardIdea[];
  weeks: WeekSummary[];
  selectedWeek: WeekSummary | null;
  isFrozen: boolean;
  query?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab derives from URL: `?week=N` selects a specific week (open or
  // closed); no param falls back to all-time. The week-number → tab map
  // is the source of truth so back-button navigation restores correctly.
  const weekParam = searchParams.get("week");
  const parsedWeek = weekParam ? Number.parseInt(weekParam, 10) : NaN;
  const tab: Tab = Number.isFinite(parsedWeek)
    ? { kind: "week", weekNumber: parsedWeek }
    : "alltime";
  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "alltime") params.delete("week");
    else params.set("week", String(next.weekNumber));
    const qs = params.toString();
    router.push(qs ? `/leaderboard?${qs}` : "/leaderboard");
  };

  const ideas = tab === "alltime" ? alltime : weekIdeas;
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

          {/* TABS — All-Time + every known week. Past weeks render
              from week_results (frozen rank/score). */}
          <Tabs
            active={tab}
            onChange={setTab}
            weeks={weeks}
            alltimeCount={alltime.length}
            currentCount={weekIdeas.length}
            selectedWeek={selectedWeek}
          />

          {/* Frozen banner — shown when viewing a closed week. Tells the
              viewer they're looking at history, not the live board. */}
          {tab !== "alltime" && isFrozen && selectedWeek && (
            <FrozenWeekBanner week={selectedWeek} />
          )}

          {ideas.length === 0 ? (
            <Empty tab={tab} isFrozen={isFrozen} />
          ) : (
            <>
              {/* PODIUM — top 3 hero row.
                  Visual order on desktop is rank 2 (left), rank 1 (center,
                  raised), rank 3 (right). On mobile we collapse to a
                  single column with rank 1 first so the giant numeral
                  treatment is always the first thing visible. Empty slots
                  render placeholder cards so the 3-column grid never
                  collapses or shifts column widths.

                  Layout note: cards stack content vertically (numeral
                  above metadata) so each ~300px column has full width
                  for the title — sm:flex-row crushed long titles like
                  "Kennedy AI" into a ~90px gutter next to the numeral.
                  Center card rises with `lg:-mt-6` instead of `scale-110`;
                  scale doesn't reserve layout space and was bleeding card 1
                  into cards 2 & 3's columns. */}
              <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-6 lg:gap-8 sm:items-end">
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

/* ════════════════════════ Tabs ══════════════════════════════════════
 * All-Time + a tab per known week. The current open week renders with
 * a "live" pulse; closed weeks get a tiny "✓" winner mark when one
 * was picked. The strip horizontal-scrolls on overflow so a year of
 * weeks doesn't blow up the layout.
 * ────────────────────────────────────────────────────────────────────── */
function Tabs({
  active,
  onChange,
  weeks,
  alltimeCount,
  currentCount,
  selectedWeek,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  weeks: WeekSummary[];
  alltimeCount: number;
  currentCount: number;
  selectedWeek: WeekSummary | null;
}) {
  // Surface up to 6 most-recent weeks inline; older weeks remain
  // accessible via direct URL (`?week=1`). Keeps the strip scannable.
  const visibleWeeks = weeks.slice(0, 6);

  const isAlltime = active === "alltime";
  const activeWeekNumber =
    typeof active === "object" ? active.weekNumber : null;

  return (
    <div
      role="tablist"
      aria-label="Leaderboard window"
      className="mt-12 flex justify-start gap-2 overflow-x-auto px-1 pb-1 sm:justify-center sm:overflow-visible"
    >
      {/* All-Time pill */}
      <button
        type="button"
        role="tab"
        aria-selected={isAlltime}
        onClick={() => onChange("alltime")}
        className={cn(
          "inline-flex shrink-0 items-center gap-2.5 rounded-full border px-5 py-2 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black",
          isAlltime
            ? "scene-display border-[var(--scene-gold)] bg-[var(--scene-gold)]/10 text-[1rem] tracking-tight text-[var(--scene-gold-bright)]"
            : "scene-mono border-white/15 text-[0.65rem] uppercase tracking-[0.3em] text-white/55 hover:border-white/35 hover:text-white",
        )}
      >
        <span>All-Time</span>
        <span
          className={cn(
            "tabular-nums opacity-80",
            isAlltime ? "scene-mono text-[0.65rem] tracking-[0.3em]" : "",
          )}
        >
          {alltimeCount}
        </span>
      </button>

      {visibleWeeks.map((w) => {
        const isActive = activeWeekNumber === w.weekNumber;
        const isCurrent = w.status === "open";
        const count =
          isActive && isCurrent ? currentCount : isActive ? currentCount : null;
        return (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange({ kind: "week", weekNumber: w.weekNumber })}
            className={cn(
              "inline-flex shrink-0 items-center gap-2.5 rounded-full border px-5 py-2 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black",
              isActive
                ? "scene-display border-[var(--scene-gold)] bg-[var(--scene-gold)]/10 text-[1rem] tracking-tight text-[var(--scene-gold-bright)]"
                : "scene-mono border-white/15 text-[0.65rem] uppercase tracking-[0.3em] text-white/55 hover:border-white/35 hover:text-white",
            )}
          >
            {isCurrent && (
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isActive
                    ? "bg-[var(--scene-gold-bright)] motion-safe:animate-pulse"
                    : "bg-[var(--scene-gold)]/70 motion-safe:animate-pulse",
                )}
              />
            )}
            <span>Week {w.weekNumber}</span>
            {count != null && (
              <span
                className={cn(
                  "tabular-nums opacity-80",
                  isActive ? "scene-mono text-[0.65rem] tracking-[0.3em]" : "",
                )}
              >
                {count}
              </span>
            )}
            {!isCurrent && w.winnerIdeaId && (
              <span
                aria-label="winner picked"
                className={cn(
                  "scene-mono text-[0.65rem]",
                  isActive
                    ? "text-[var(--scene-gold-bright)]"
                    : "text-[var(--scene-gold)]/70",
                )}
              >
                ✦
              </span>
            )}
          </button>
        );
      })}
      {selectedWeek &&
        activeWeekNumber === selectedWeek.weekNumber &&
        weeks.length > visibleWeeks.length && (
          <span className="scene-mono shrink-0 self-center text-[0.55rem] uppercase tracking-[0.3em] text-white/35">
            +{weeks.length - visibleWeeks.length} more
          </span>
        )}
    </div>
  );
}

/* ════════════════════════ FrozenWeekBanner ══════════════════════════
 * Header strip that appears above the podium when viewing a closed
 * week. Reinforces "this is history, not live" so a viewer isn't
 * confused by the lack of a LIVE indicator on rank changes.
 * ────────────────────────────────────────────────────────────────────── */
function FrozenWeekBanner({ week }: { week: WeekSummary }) {
  const closedAt = new Date(week.endAt);
  const dateLabel = closedAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="mt-8 flex justify-center">
      <div className="scene-mono inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.02] px-3.5 py-1.5 text-[0.6rem] uppercase tracking-[0.3em] text-white/55">
        <span aria-hidden className="text-[var(--scene-gold)]/70">
          ◆
        </span>
        <span>Frozen · Closed {dateLabel}</span>
      </div>
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
  // Rank-differentiated numeral sizes: 1 largest, 2/3 progressively smaller.
  // Sized to fit comfortably inside a ~290px wide column on lg (max-w-5xl /
  // 3 cols - gaps). Larger values like 180px were colliding with neighboring
  // columns and crushing the title gutter.
  const numeralSize = isFirst
    ? "text-[80px] sm:text-[112px] lg:text-[132px]"
    : "text-[60px] sm:text-[88px] lg:text-[104px]";

  // Empty placeholder — keeps grid columns from collapsing.
  if (!idea) {
    return (
      <div
        className={cn(
          "relative flex flex-col items-center gap-3 px-6 py-8 text-center",
          order,
          isFirst ? "lg:-mt-6" : "",
        )}
      >
        <div
          className={cn("scene-numeral leading-none", numeralSize, "text-white/15")}
          aria-hidden
        >
          {String(rank).padStart(2, "0")}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="scene-display text-xl text-white/35 sm:text-2xl">—</div>
          <p className="scene-mono text-[0.55rem] uppercase tracking-[0.35em] text-white/35">
            Awaiting
          </p>
        </div>
      </div>
    );
  }

  const tone = scoreTone(idea);
  const scoreColor = toneVar(tone);
  const isBuilt = idea.status === "built";

  return (
    <Link
      href={ideaPath(idea.id, idea.title)}
      aria-label={`Rank ${rank}: ${idea.title}`}
      className={cn(
        "group relative flex flex-col items-center gap-4 rounded-2xl px-6 py-8 text-center",
        "border border-white/[0.06] bg-white/[0.015]",
        "transition-all duration-300",
        "hover:border-[var(--scene-gold)]/40 hover:bg-white/[0.025]",
        "active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black",
        order,
        // Raise the center card. `lg:-mt-6` preserves layout space (margin
        // doesn't bleed into neighbors) — `lg:scale-110` did not, and was
        // visibly clipping cards 2 and 3.
        isFirst ? "lg:-mt-6" : "",
      )}
    >
      {/* Rank numeral — top, full card width */}
      <div
        className={cn(
          "scene-numeral leading-none",
          // Only rank 1 gets the foil sweep — keeps the moment
          // singular instead of three numerals fighting for the eye.
          isFirst && "scene-foil",
          numeralSize,
          numeralColor,
        )}
        style={numeralGlow}
        aria-hidden
      >
        {String(rank).padStart(2, "0")}
      </div>

      {/* Metadata column — title, score, votes, share */}
      <div className="flex w-full min-w-0 flex-col items-center justify-center gap-3">
        <h3 className="scene-display line-clamp-2 break-words text-xl font-medium text-white sm:text-2xl">
          {idea.title}
        </h3>

        {isBuilt && (
          <span className="scene-mono inline-flex w-fit items-center rounded-full border border-[var(--scene-verdigris-bright)]/40 bg-[var(--scene-verdigris)]/10 px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.3em] text-[var(--scene-verdigris-bright)]">
            Built
          </span>
        )}

        <div className="flex items-baseline gap-1">
          <span
            className="scene-numeral text-3xl tabular-nums"
            style={{ color: scoreColor }}
          >
            {idea.final_score ?? 0}
          </span>
          <span className="text-base tabular-nums text-white/45">/100</span>
        </div>

        {/* Score split bar — two segments, each maxes at 50%.
            AI (left) is gold, Community (right) is gold-bright.
            Makes it visually obvious that AI alone caps at 50. */}
        <ScoreSplitBar idea={idea} />

        <p className="scene-mono text-[0.65rem] uppercase tracking-[0.16em] text-white/55">
          {idea.vote_count === 0 ? (
            <span className="text-white/55">AI {idea.score}/10 · awaiting votes</span>
          ) : (
            <>{formatVoteCount(idea.vote_count)} {idea.vote_count === 1 ? "vote" : "votes"}</>
          )}
        </p>

        <div
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
      </div>
    </Link>
  );
}

/* ════════════════════════ ScoreSplitBar ═════════════════════════════
 * Two-segment horizontal bar visualizing the AI half (capped 0..50)
 * and the community half (also 0..50). Makes the scoring formula
 * legible at a glance: AI alone never exceeds the midline, community
 * fills the right half by vote share.
 *
 * Renders inline between the score and the meta line on PodiumSlot.
 * ────────────────────────────────────────────────────────────────────── */
function ScoreSplitBar({
  idea,
}: {
  idea: Pick<LeaderboardIdea, "final_score" | "score">;
}) {
  const { ai, community } = splitScore(idea);
  const aiPct = (ai / 50) * 100;
  const commPct = (community / 50) * 100;
  return (
    <div
      className="flex w-full max-w-[200px] flex-col gap-1"
      aria-label={`Score breakdown: AI ${ai} of 50, community ${community} of 50`}
    >
      <div className="flex h-1 w-full gap-[2px] rounded-full">
        <div className="relative h-full flex-1 overflow-hidden rounded-l-full bg-white/[0.05]">
          <div
            className="h-full bg-[var(--scene-gold)]/75 transition-[width] duration-500"
            style={{ width: `${aiPct}%` }}
          />
        </div>
        <div className="relative h-full flex-1 overflow-hidden rounded-r-full bg-white/[0.05]">
          <div
            className="h-full bg-[var(--scene-gold-bright)] transition-[width] duration-500"
            style={{ width: `${commPct}%` }}
          />
        </div>
      </div>
      <div className="scene-mono flex items-center justify-between text-[0.5rem] uppercase tracking-[0.2em] text-white/45">
        <span className="tabular-nums">AI {ai}</span>
        <span className="tabular-nums">Crowd {community}</span>
      </div>
    </div>
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
        href={ideaPath(idea.id, idea.title)}
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
              {idea.vote_count === 0
                ? "AI-only"
                : `${formatVoteCount(idea.vote_count)} votes`}
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

        {/* Vote count — desktop only, in the gutter. Shows "AI-only" when
            no votes yet so the score is read as provisional, not blended. */}
        <span className="scene-mono hidden self-center text-[0.65rem] uppercase tracking-[0.16em] tabular-nums text-white/55 sm:inline">
          {idea.vote_count === 0
            ? "AI-only"
            : `${formatVoteCount(idea.vote_count)} votes`}
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

/* ════════════════════════ Empty ═════════════════════════════════════
 * Branded empty state for both tabs. The headline is serif italic
 * (Fraunces) so it reads as a moment, not a status. The mono eyebrow
 * + supporting body keep the brand's three-axis typography rhythm.
 * Both variants land the user on `/` (the homepage pitch pill) — the
 * natural next action when there's nothing yet to read.
 * ────────────────────────────────────────────────────────────────────── */
function Empty({ tab, isFrozen }: { tab: Tab; isFrozen: boolean }) {
  const isAllTime = tab === "alltime";
  const eyebrow = isAllTime
    ? "· no victors yet ·"
    : isFrozen
      ? "· no entries this week ·"
      : "· this week's pit is open ·";
  const headline = isAllTime
    ? "The pit is hungry."
    : isFrozen
      ? "This week passed quietly."
      : "Nothing scored this week.";
  const body = isAllTime
    ? "Names appear here once the gamemaster has weighed them. Yours could be first."
    : isFrozen
      ? "No idea cleared scoring before the hourglass drained. The pit moved on."
      : "The hourglass hasn't drained. First tribute through gets the top of the page.";

  return (
    <div className="mt-20 flex flex-col items-center gap-6 px-4 text-center sm:mt-24">
      <p className="scene-mono text-[0.55rem] uppercase tracking-[0.42em] text-[var(--scene-gold)] sm:text-[0.65rem]">
        {eyebrow}
      </p>
      <h2 className="scene-display-italic max-w-2xl text-balance text-3xl leading-[1.05] text-white sm:text-5xl lg:text-6xl">
        {headline}
      </h2>
      <p className="scene-display max-w-md text-balance text-base leading-snug text-white/72 sm:text-lg">
        {body}
      </p>
      {!isFrozen && (
        <Link href="/" className="cta-btn-primary mt-3 text-sm">
          Pitch your idea <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}
