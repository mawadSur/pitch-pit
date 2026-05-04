"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type Comment = {
  id: string;
  user_id: string;
  idea_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  // Joined display info (display_name, avatar_url) when available.
  // Resolved by joining `users` table at the page level; client falls back
  // gracefully when these are missing.
  display_name?: string | null;
  avatar_url?: string | null;
};

const MAX_LEN = 1000;

export function Comments({
  ideaId,
  initial,
  initialUser,
}: {
  ideaId: string;
  initial: Comment[];
  initialUser: User | null;
}) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [user, setUser] = useState<User | null>(initialUser);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const seenIds = useRef<Set<string>>(new Set(initial.map((c) => c.id)));

  // Track auth state so the form can switch to "Sign in to comment"
  // without a full page reload after the user logs in.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Realtime — subscribe to inserts on this idea's comments.
  // Coalesce duplicates (the optimistic insert will already be in state
  // when the realtime echo lands).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`comments-${ideaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `idea_id=eq.${ideaId}`,
        },
        (payload) => {
          const c = payload.new as Comment;
          if (seenIds.current.has(c.id)) return;
          seenIds.current.add(c.id);
          setComments((prev) => [c, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "comments",
          filter: `idea_id=eq.${ideaId}`,
        },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          seenIds.current.delete(id);
          setComments((prev) => prev.filter((c) => c.id !== id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ideaId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (!user) {
      setError("Sign in to leave a comment.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId, body: trimmed }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(err.error ?? "Couldn't post comment.");
        }
        const { comment } = (await res.json()) as { comment: Comment };
        // Optimistically prepend; the realtime echo will be deduped via seenIds.
        seenIds.current.add(comment.id);
        setComments((prev) => [comment, ...prev]);
        setText("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <section
      aria-labelledby="comments-heading"
      className="mx-auto mt-12 max-w-3xl"
    >
      <header className="flex items-baseline justify-between border-b border-white/8 pb-4">
        <h2
          id="comments-heading"
          className="text-lg font-medium text-white sm:text-xl"
        >
          Comments
          <span className="scene-mono ml-3 text-[0.7rem] uppercase tracking-[0.3em] text-white/45">
            {comments.length}
          </span>
        </h2>
      </header>

      {/* Form (or "sign in" prompt when anonymous) */}
      <div className="mt-6">
        {user ? (
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="sr-only">Add a comment</span>
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                disabled={pending}
                rows={3}
                maxLength={MAX_LEN}
                placeholder="Add to the conversation…"
                aria-label="Add a comment"
                className="block w-full resize-y rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-base leading-relaxed text-white placeholder:text-white/30 transition-colors focus:border-[var(--scene-gold)]/55 focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/40"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="scene-mono text-[0.6rem] uppercase tracking-[0.3em] text-white/35">
                {error ? (
                  <span className="text-red-300/85">{error}</span>
                ) : (
                  `${text.trim().length}/${MAX_LEN}`
                )}
              </p>
              <button
                type="submit"
                disabled={pending || text.trim().length === 0}
                className="cta-btn-primary text-sm disabled:opacity-50"
              >
                {pending ? "Posting…" : "Post comment"}
              </button>
            </div>
          </form>
        ) : (
          <div className="scene-card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-sm text-white/72">
              Sign in to add to the conversation.
            </p>
            <Link
              href={`/login?next=/idea/${ideaId}`}
              className="cta-btn-primary text-sm"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>

      {/* List */}
      <ol className="mt-8 space-y-4" aria-live="polite">
        <AnimatePresence initial={false}>
          {comments.map((c) => (
            <motion.li
              key={c.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25 }}
              className="scene-card flex gap-4 px-5 py-4 sm:px-6"
            >
              <Avatar name={c.display_name} url={c.avatar_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <p className="text-sm font-medium text-white">
                    {c.display_name ?? "guest"}
                  </p>
                  <p className="scene-mono text-[0.55rem] uppercase tracking-[0.3em] text-white/40">
                    {formatRelativeTime(c.created_at)}
                  </p>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-base leading-snug text-white/85">
                  {c.body}
                </p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {comments.length === 0 && (
          <li className="scene-card px-6 py-10 text-center">
            <p className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-white/45">
              No comments yet — be the first.
            </p>
          </li>
        )}
      </ol>
    </section>
  );
}

function Avatar({
  name,
  url,
}: {
  name?: string | null;
  url?: string | null;
}) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="h-9 w-9 flex-shrink-0 rounded-full border border-white/15 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-sm font-medium text-[var(--scene-gold-bright)]"
    >
      {initial}
    </span>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(1, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
