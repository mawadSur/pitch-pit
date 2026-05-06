"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function VoteButton({ ideaId }: { ideaId: string }) {
  const router = useRouter();
  const [voteCount, setVoteCount] = useState<number | null>(null);
  const [userHasVoted, setUserHasVoted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Brief gold flash when an *external* vote arrives (someone else voted).
  const [flash, setFlash] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);

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

  // Realtime subscription: refresh state whenever votes change for this idea.
  // Skips refresh if a vote-toggle is in flight (we trust the optimistic state).
  // Perf-4: pause the channel while the tab is hidden so we don't burn
  // Supabase bandwidth on backgrounded tabs; re-subscribe on visibility return.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    function refresh() {
      fetch(`/api/vote?ideaId=${encodeURIComponent(ideaId)}`)
        .then((r) => r.json())
        .then((data) => {
          setVoteCount(data.voteCount ?? 0);
          setUserHasVoted(!!data.userHasVoted);
          setFlash(true);
          if (flashTimeoutRef.current)
            window.clearTimeout(flashTimeoutRef.current);
          flashTimeoutRef.current = window.setTimeout(
            () => setFlash(false),
            650,
          );
        })
        .catch(() => {});
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
          refresh,
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
        // Coming back from hidden — refetch in case votes changed
        // while we weren't listening, then resubscribe.
        refresh();
        subscribe();
      }
    }

    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      subscribe();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
      if (flashTimeoutRef.current)
        window.clearTimeout(flashTimeoutRef.current);
    };
  }, [ideaId]);

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
          throw new Error(err.error ?? "Vote failed.");
        }
        const data = await res.json();
        setUserHasVoted(!!data.voted);
        // Don't revert count — server now matches our optimistic state.
      } catch (e) {
        // rollback
        setUserHasVoted(prevVoted);
        setVoteCount(prevCount);
        setError(e instanceof Error ? e.message : "Vote failed.");
      }
    });
  }

  const display = voteCount === null ? "—" : voteCount.toLocaleString("en-US");

  return (
    <div className="flex flex-col items-center gap-2">
      {signedIn ? (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={userHasVoted}
          className={`group inline-flex items-center gap-3 rounded-full border px-6 py-3 text-base font-medium transition-colors duration-200 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-black ${
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
            aria-label={`${display} votes`}
          >
            {display}
          </span>
        </button>
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
            aria-label={`${display} votes`}
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
