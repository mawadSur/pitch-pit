"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { createClient } from "@/lib/supabase/client";

type CoinSpawn = {
  id: string;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  rotate: number;
};

export function VoteButton({
  ideaId,
  weekStatus = "open",
}: {
  ideaId: string;
  // The status of the week this idea belongs to. When != "open" the
  // DB-level RLS policy (migration 025) will reject inserts on `votes`,
  // so we render a disabled "Voting closed" surface instead. We still
  // render the live vote_count so the historical tally stays visible.
  weekStatus?: "open" | "closed" | "built";
}) {
  const isClosed = weekStatus !== "open";
  const router = useRouter();
  const [voteCount, setVoteCount] = useState<number | null>(null);
  const [userHasVoted, setUserHasVoted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Brief gold flash when an *external* vote arrives (someone else voted).
  const [flash, setFlash] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);

  // Coin-drop animation state. Each click spawns one coin, keyed by uuid so
  // rapid clicks animate independently via AnimatePresence.
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [coins, setCoins] = useState<CoinSpawn[]>([]);
  // Imperative controls for the button's "thunk" pulse on coin settle.
  // Using controls (instead of a key bump) avoids remounting the button —
  // remount would steal focus and clobber the existing color transitions.
  const buttonControls = useAnimationControls();
  const reduceMotion = useReducedMotion();

  // Initial state fetch
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vote?ideaId=${encodeURIComponent(ideaId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setVoteCount(data.voteCount ?? 0);
        setUserHasVoted(!!data.userHasVoted);
        setSignedIn(!!data.signedIn);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ideaId]);

  // Realtime subscription: reflect vote changes for this idea.
  // Perf-M7: apply each event LOCALLY from the payload — bumping vote_count
  // by ±1 based on INSERT/DELETE, and flipping userHasVoted only when the
  // event row belongs to the current user. The old shape refetched
  // /api/vote on EVERY event; a hot idea getting 10 votes/sec produced
  // 10 round-trips per second per open tab. Reconciliation is preserved
  // as a debounced safety net (at most once per 5s) so any drift between
  // local accounting and the DB self-heals.
  //
  // Perf-4: pause the channel while the tab is hidden so we don't burn
  // Supabase bandwidth on backgrounded tabs; re-subscribe on visibility return.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // Current user's id, captured once after mount. Used to detect when an
    // INSERT/DELETE event corresponds to *this* user — i.e. the userHasVoted
    // gate flipping — versus someone else voting. Null until the auth probe
    // resolves; in that brief window we still update vote_count from
    // payload (the count delta doesn't depend on identity).
    let currentUserId: string | null = null;
    // Timestamp of last reconciliation refetch; gates the debounce window.
    let lastReconcileAt = 0;
    let reconcileTimer: number | null = null;
    const RECONCILE_WINDOW_MS = 5000;

    function flashGold() {
      setFlash(true);
      if (flashTimeoutRef.current)
        window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = window.setTimeout(
        () => setFlash(false),
        650,
      );
    }

    // Hits /api/vote and reconciles count + userHasVoted with the DB.
    // Safety net only — every realtime event already updates state from
    // its payload, so this exists to repair drift (missed events, rapid
    // toggles, server-side trigger lag). Throttled by lastReconcileAt.
    function reconcile() {
      lastReconcileAt = Date.now();
      fetch(`/api/vote?ideaId=${encodeURIComponent(ideaId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setVoteCount(data.voteCount ?? 0);
          setUserHasVoted(!!data.userHasVoted);
        })
        .catch(() => {});
    }

    // Apply realtime event to local state and schedule a debounced
    // reconciliation refetch (at most once per RECONCILE_WINDOW_MS).
    function applyRealtime(payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: { user_id?: string; idea_id?: string } | null;
      old: { user_id?: string; idea_id?: string } | null;
    }) {
      const evt = payload.eventType;
      // Count delta from the event type. UPDATEs on the votes table
      // shouldn't move the count (toggles are INSERT/DELETE), so they
      // pass through as a no-op delta.
      const delta = evt === "INSERT" ? 1 : evt === "DELETE" ? -1 : 0;
      if (delta !== 0) {
        setVoteCount((prev) => Math.max(0, (prev ?? 0) + delta));
      }

      // Did THIS event correspond to the current user? If so, mirror
      // userHasVoted locally — otherwise it's someone else voting and we
      // only flash the count.
      const eventUserId =
        evt === "DELETE"
          ? payload.old?.user_id
          : payload.new?.user_id;
      if (currentUserId && eventUserId === currentUserId) {
        if (evt === "INSERT") setUserHasVoted(true);
        else if (evt === "DELETE") setUserHasVoted(false);
      } else if (delta !== 0) {
        // External voter — gold flash on the count display.
        flashGold();
      }

      // Debounced reconciliation. If we're outside the cooldown window,
      // refetch now. Otherwise, schedule a single trailing refetch at
      // the end of the window so a burst of events still resolves
      // exactly once.
      const sinceLast = Date.now() - lastReconcileAt;
      if (sinceLast >= RECONCILE_WINDOW_MS) {
        reconcile();
      } else if (reconcileTimer === null) {
        reconcileTimer = window.setTimeout(() => {
          reconcileTimer = null;
          if (!cancelled) reconcile();
        }, RECONCILE_WINDOW_MS - sinceLast);
      }
    }

    function subscribe() {
      if (channel) return;
      channel = supabase
        .channel(`votes-${ideaId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "votes",
            filter: `idea_id=eq.${ideaId}`,
          },
          (payload) =>
            applyRealtime(
              payload as Parameters<typeof applyRealtime>[0],
            ),
        )
        .subscribe();
    }

    function unsubscribe() {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        unsubscribe();
      } else {
        // Coming back from hidden — full reconcile (we may have missed
        // events while paused), then resubscribe.
        reconcile();
        subscribe();
      }
    }

    // Capture the current user id once so realtime events can decide
    // whether they belong to "me" or "someone else". Best-effort —
    // if the auth probe fails or the user signs out mid-session, we
    // still update vote_count from payload (delta is identity-free).
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) currentUserId = data.user?.id ?? null;
      })
      .catch(() => {});

    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      subscribe();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
      if (reconcileTimer !== null) {
        window.clearTimeout(reconcileTimer);
        reconcileTimer = null;
      }
      if (flashTimeoutRef.current)
        window.clearTimeout(flashTimeoutRef.current);
    };
  }, [ideaId]);

  function spawnCoin(event: React.MouseEvent<HTMLButtonElement>) {
    if (reduceMotion) return;
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Modern browsers dispatch click as a PointerEvent — check pointerType
    // when present. Touch / unknown / keyboard activation (clientX === 0)
    // all fall back to the button's visual center.
    const native = event.nativeEvent as MouseEvent & { pointerType?: string };
    const pointerType = native.pointerType;
    const isKeyboard = event.clientX === 0 && event.clientY === 0;
    const useCenter =
      isKeyboard ||
      !pointerType ||
      pointerType === "touch" ||
      pointerType === "pen";
    const x = useCenter ? rect.width / 2 : event.clientX - rect.left;
    const y = useCenter ? rect.height / 2 : event.clientY - rect.top;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // Random spin direction — feels less robotic on rapid clicks.
    const rotate = (Math.random() < 0.5 ? -1 : 1) * 360;
    setCoins((prev) => [
      ...prev,
      {
        id,
        x,
        y,
        centerX: rect.width / 2,
        centerY: rect.height / 2,
        rotate,
      },
    ]);
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    // Auth-redirect path keeps the no-coin behavior — the button is about to
    // navigate away, no payoff needed.
    if (signedIn) spawnCoin(event);
    toggle();
  }

  function toggle() {
    setError(null);
    if (!signedIn) {
      router.push(
        `/login?next=${encodeURIComponent(`/idea/${ideaId}`)}`,
      );
      return;
    }
    // optimistic update
    const prevVoted = userHasVoted;
    const prevCount = voteCount ?? 0;
    setUserHasVoted(!prevVoted);
    setVoteCount(prevCount + (prevVoted ? -1 : 1));

    startTransition(async () => {
      try {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Token failed to cast.");
        }
        const data = await res.json();
        setUserHasVoted(!!data.voted);
        // Don't revert count — server now matches our optimistic state.
      } catch (e) {
        // rollback
        setUserHasVoted(prevVoted);
        setVoteCount(prevCount);
        setError(e instanceof Error ? e.message : "Token failed to cast.");
      }
    });
  }

  const display = voteCount === null ? "—" : voteCount.toLocaleString("en-US");

  return (
    <div className="flex flex-col items-center gap-2">
      {isClosed ? (
        <div
          aria-disabled="true"
          className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.02] px-6 py-3 text-base font-medium text-white/55"
          title="Voting closed for this week"
        >
          <TokenIcon active={false} />
          <span>Voting closed</span>
          <span
            className="scene-mono ml-1 tabular-nums text-sm font-semibold text-white/45"
            aria-label={`${display} tokens, voting closed`}
          >
            {display}
          </span>
        </div>
      ) : signedIn ? (
        <motion.button
          ref={buttonRef}
          type="button"
          onClick={handleClick}
          disabled={pending}
          aria-pressed={userHasVoted}
          animate={buttonControls}
          className={`group relative inline-flex items-center gap-3 overflow-hidden rounded-full border px-6 py-3 text-base font-medium transition-colors duration-200 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black ${
            userHasVoted
              ? "border-[var(--scene-gold-bright)] bg-[var(--scene-gold-bright)]/15 text-[var(--scene-gold-bright)]"
              : "border-white/20 bg-white/[0.04] text-white hover:border-[var(--scene-gold)] hover:text-[var(--scene-gold-bright)]"
          }`}
        >
          <TokenIcon active={userHasVoted} />
          <span>{userHasVoted ? "Token cast" : "Cast a token"}</span>
          <span
            className={`scene-mono ml-1 tabular-nums text-sm font-semibold transition-colors duration-300 ${
              flash ? "text-[var(--scene-gold-bright)]" : ""
            }`}
            aria-live="polite"
            aria-label={`${display} tokens`}
          >
            {display}
          </span>
          {/* Coin overlay — clipped to the button so it never bleeds into
              surrounding cards. z-50 keeps it above any local glow. */}
          <AnimatePresence>
            {coins.map((coin) => (
              <CoinDrop
                key={coin.id}
                coin={coin}
                onComplete={() => {
                  setCoins((prev) => prev.filter((c) => c.id !== coin.id));
                  // Tiny scale pulse — the "thunk" of the coin landing.
                  if (!reduceMotion) {
                    void buttonControls.start({
                      scale: [1, 1.03, 1],
                      transition: { duration: 0.2, ease: "easeOut" },
                    });
                  }
                }}
              />
            ))}
          </AnimatePresence>
        </motion.button>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(`/idea/${ideaId}`)}`}
          className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/[0.04] px-6 py-3 text-base font-medium text-white transition-colors hover:border-[var(--scene-gold)] hover:text-[var(--scene-gold-bright)]"
        >
          <TokenIcon active={false} />
          <span>Sign in to cast a token</span>
          <span
            className={`scene-mono ml-1 tabular-nums text-sm font-semibold transition-colors duration-300 ${
              flash ? "text-[var(--scene-gold-bright)]" : "text-white/65"
            }`}
            aria-live="polite"
            aria-label={`${display} tokens`}
          >
            {display}
          </span>
        </Link>
      )}
      {error && (
        <p role="alert" className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-red-300/85">
          {error}
        </p>
      )}
    </div>
  );
}

function TokenIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="vote-token" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#FFF2C4" />
          <stop offset="55%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#8B6500" />
        </radialGradient>
      </defs>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill={active ? "url(#vote-token)" : "none"}
        stroke={active ? "#FFE7A3" : "currentColor"}
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * The big animated coin. Spawns at the click point, springs into the button's
 * center, overshoots a hair past the bottom, and fades in the last ~200ms as
 * it "drops in". One per click — AnimatePresence keys these by uuid so rapid
 * clicks animate independently.
 */
function CoinDrop({
  coin,
  onComplete,
}: {
  coin: CoinSpawn;
  onComplete: () => void;
}) {
  // Overshoot target: ~50% past the button's bottom, then settle into center.
  const overshootY = coin.centerY * 1.5;
  const spring: Transition = {
    type: "spring",
    stiffness: 180,
    damping: 22,
    // Mass keeps the settle from feeling too snappy on the spring axis.
    mass: 0.9,
  };
  // Coin is 22px — small enough to read as a token at button scale, big enough
  // to actually see the bevel gradient.
  const SIZE = 22;
  return (
    <motion.span
      aria-hidden
      initial={{
        x: coin.x - SIZE / 2,
        y: coin.y - SIZE / 2,
        scale: 1,
        rotate: 0,
        opacity: 1,
      }}
      animate={{
        x: coin.centerX - SIZE / 2,
        // Overshoot keyframes — peak past the bottom, then spring into center.
        y: [coin.y - SIZE / 2, overshootY - SIZE / 2, coin.centerY - SIZE / 2],
        scale: [1, 1.15, 0.7],
        rotate: coin.rotate,
        // Fade only in the last ~200ms — coin is fully visible during the drop.
        opacity: [1, 1, 1, 0],
      }}
      transition={{
        x: spring,
        y: { duration: 0.6, ease: "easeIn", times: [0, 0.55, 1] },
        scale: { duration: 0.6, ease: "easeOut", times: [0, 0.45, 1] },
        rotate: { duration: 0.7, ease: "easeOut" },
        opacity: { duration: 0.8, times: [0, 0.6, 0.75, 1] },
      }}
      onAnimationComplete={onComplete}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: SIZE,
        height: SIZE,
        pointerEvents: "none",
        zIndex: 50,
        // Spin around the coin's own center, not the top-left corner.
        transformOrigin: "50% 50%",
        willChange: "transform, opacity",
      }}
    >
      <TokenCoin size={SIZE} />
    </motion.span>
  );
}

/**
 * Inline gold-foil coin: radial-gradient bevel (rim highlight → mid → shadow)
 * plus a small "P" glyph in Fraunces serif to echo the brand mark. Each
 * instance gets a unique gradient id so multiple coins on screen don't share
 * defs. Sized via the `size` prop; the SVG itself stays a 24-unit grid.
 */
function TokenCoin({ size = 22 }: { size?: number }) {
  // Stable-ish unique id; React 18 useId would also work but this keeps
  // the coin self-contained without a hook.
  const idRef = useRef<string>(
    `tcoin-${Math.random().toString(36).slice(2, 9)}`,
  );
  const gradId = `${idRef.current}-fill`;
  const rimId = `${idRef.current}-rim`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        {/* Bevel: rim highlight (top-left) → mid gold → deep shadow (bottom-right). */}
        <radialGradient id={gradId} cx="38%" cy="34%" r="68%">
          <stop offset="0%" stopColor="#FFE7A3" />
          <stop offset="55%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#9A7100" />
        </radialGradient>
        {/* Subtle inner-rim ring — adds the "minted" feel. */}
        <radialGradient id={rimId} cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="rgba(0,0,0,0)" />
          <stop offset="92%" stopColor="rgba(255,231,163,0.85)" />
          <stop offset="100%" stopColor="rgba(154,113,0,0.0)" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill={`url(#${gradId})`} />
      <circle cx="12" cy="12" r="10.5" fill={`url(#${rimId})`} />
      {/* Inset rim line — thin dark ring just inside the edge. */}
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="rgba(94, 60, 0, 0.45)"
        strokeWidth="0.6"
      />
      {/* Brand glyph: serif "P" centered. Fraunces if available, else falls
          back to the platform serif stack. */}
      <text
        x="12"
        y="16.2"
        textAnchor="middle"
        fontSize="11"
        fontWeight={600}
        fontStyle="italic"
        fill="#5A3D00"
        style={{
          fontFamily:
            "var(--font-display), 'Fraunces', 'Times New Roman', serif",
          letterSpacing: "0.02em",
        }}
      >
        P
      </text>
    </svg>
  );
}
