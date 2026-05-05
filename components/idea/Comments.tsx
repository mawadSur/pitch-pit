"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// How long the inline "Confirm delete" affordance stays open before
// reverting back to the safe "Delete" button. Short enough that an
// accidental click can't linger and become a tap-trap.
const CONFIRM_DELETE_TIMEOUT_MS = 5000;

export type Comment = {
  id: string;
  user_id: string;
  idea_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  // True if the body was edited at least once. Server-side trigger sets
  // this on UPDATE only when the body actually changes, so the badge
  // is unambiguous (no false positives from updated_at being touched
  // by future schema work).
  is_edited?: boolean;
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
  // A11y-4: focus the textarea on any validation/submit error so the
  // user lands on the field they need to fix without hunting for it.
  const addCommentRef = useRef<HTMLTextAreaElement | null>(null);
  // Form-2: optimistic placeholder body shown while a POST is in flight,
  // so the user sees their comment land at the top of the list immediately
  // and not after the round-trip. Cleared on response (success: replaced
  // by the real row; error: handled by the existing `error` channel).
  const [postingDraft, setPostingDraft] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set(initial.map((c) => c.id)));
  // Form-2: brief skeleton flash on mount when there's nothing to show yet,
  // gives perceived loading feedback even when the list is genuinely empty.
  const [showSkeleton, setShowSkeleton] = useState(initial.length === 0);
  useEffect(() => {
    if (initial.length !== 0) return;
    const t = setTimeout(() => setShowSkeleton(false), 200);
    return () => clearTimeout(t);
  }, [initial.length]);

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
  // Perf-4: pause the subscription while the tab is hidden so we don't burn
  // bandwidth on backgrounded tabs; re-subscribe on visibility return.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    function subscribe() {
      if (channel) return;
      channel = supabase
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
    };
  }, [ideaId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      addCommentRef.current?.focus();
      return;
    }
    if (!user) {
      setError("Sign in to leave a comment.");
      addCommentRef.current?.focus();
      return;
    }
    setError(null);
    setPostingDraft(trimmed);
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
        addCommentRef.current?.focus();
      } finally {
        setPostingDraft(null);
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
          <span className="scene-mono ml-3 text-[0.7rem] uppercase tracking-[0.3em] tabular-nums text-white/45">
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
                ref={addCommentRef}
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
                autoComplete="off"
                className="block w-full resize-y rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-base leading-relaxed text-white placeholder:text-white/30 transition-colors focus:border-[var(--scene-gold)]/55 focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/40"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="scene-mono text-[0.65rem] uppercase tracking-[0.3em] text-white/55">
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
        {/* Form-2: optimistic placeholder while a POST is in flight. Sits
            at the top of the list, dimmed, with a "posting…" hint. Once the
            POST resolves, the real row replaces it. */}
        {postingDraft && (
          <li
            aria-hidden
            className="scene-card flex gap-4 px-5 py-4 opacity-60 sm:px-6"
          >
            <Avatar
              name={
                (user?.user_metadata?.full_name as string | undefined) ??
                user?.email ??
                "you"
              }
              url={user?.user_metadata?.avatar_url as string | undefined}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3">
                <p className="text-sm font-medium text-white">
                  {(user?.user_metadata?.full_name as string | undefined) ??
                    user?.email ??
                    "you"}
                </p>
                <p className="scene-mono text-[0.55rem] uppercase tracking-[0.3em] text-[var(--scene-gold)]/85">
                  Posting…
                </p>
              </div>
              <p className="mt-1.5 max-w-prose whitespace-pre-wrap text-base leading-snug text-white/85">
                {postingDraft}
              </p>
            </div>
          </li>
        )}
        <AnimatePresence initial={false}>
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              isOwn={!!user && c.user_id === user.id}
              onUpdated={(updated) =>
                setComments((prev) =>
                  prev.map((x) => (x.id === updated.id ? updated : x)),
                )
              }
              onDeleted={(id) => {
                seenIds.current.delete(id);
                setComments((prev) => prev.filter((x) => x.id !== id));
              }}
            />
          ))}
        </AnimatePresence>
        {comments.length === 0 &&
          (showSkeleton ? (
            <>
              {[0, 1, 2].map((i) => (
                <li
                  key={`skeleton-${i}`}
                  aria-hidden
                  className="scene-card flex animate-pulse gap-4 px-5 py-4 sm:px-6"
                >
                  <span className="h-9 w-9 flex-shrink-0 rounded-full bg-white/[0.06]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex gap-3">
                      <span className="h-3 w-24 rounded bg-white/[0.08]" />
                      <span className="h-3 w-16 rounded bg-white/[0.05]" />
                    </div>
                    <span className="block h-3 w-11/12 rounded bg-white/[0.06]" />
                    <span className="block h-3 w-3/4 rounded bg-white/[0.05]" />
                  </div>
                </li>
              ))}
            </>
          ) : (
            <li className="scene-card px-6 py-10 text-center">
              <p className="scene-mono text-[0.65rem] uppercase tracking-[0.35em] text-white/45">
                No comments yet — be the first.
              </p>
            </li>
          ))}
      </ol>
    </section>
  );
}

function CommentRow({
  comment,
  isOwn,
  onUpdated,
  onDeleted,
}: {
  comment: Comment;
  isOwn: boolean;
  onUpdated: (updated: Comment) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // A11y-4: focus the edit textarea on save error so the user lands
  // on the field they need to fix.
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Authoritative flag from the comments_mark_edited trigger (migration 014).
  // Replaces the old timestamp-diff heuristic which false-positived whenever
  // updated_at was touched without a body change.
  const wasEdited = !!comment.is_edited;

  function clearConfirmTimer() {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }

  // Cleanup on unmount so a stale timer can't fire setState into nothing.
  useEffect(() => clearConfirmTimer, []);

  // Auto-revert + click-outside-to-cancel only while the inline confirm is open.
  useEffect(() => {
    if (!confirmingDelete) return;

    confirmTimerRef.current = setTimeout(() => {
      setConfirmingDelete(false);
    }, CONFIRM_DELETE_TIMEOUT_MS);

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setConfirmingDelete(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      clearConfirmTimer();
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [confirmingDelete]);

  function startEdit() {
    setDraft(comment.body);
    setError(null);
    setConfirmingDelete(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
    setDraft(comment.body);
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      editRef.current?.focus();
      return;
    }
    if (trimmed === comment.body.trim()) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/comments/${comment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(err.error ?? "Couldn't save edit.");
        }
        const { comment: updated } = (await res.json()) as { comment: Comment };
        onUpdated({
          ...updated,
          display_name: comment.display_name,
          avatar_url: comment.avatar_url,
        });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        editRef.current?.focus();
      }
    });
  }

  function requestDelete() {
    // First click — arm the inline confirm. The auto-revert + click-outside
    // listeners are wired up by the effect that watches `confirmingDelete`.
    setError(null);
    setConfirmingDelete(true);
  }

  function cancelDelete() {
    clearConfirmTimer();
    setConfirmingDelete(false);
  }

  function confirmDelete() {
    // Stop the auto-revert from firing mid-request.
    clearConfirmTimer();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/comments/${comment.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(err.error ?? "Couldn't delete.");
        }
        // Optimistic delete; the realtime DELETE echo is a no-op (already filtered).
        onDeleted(comment.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <motion.li
      ref={rowRef}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.25 }}
      className={`scene-card relative flex gap-4 px-5 py-4 transition-opacity sm:px-6 ${
        confirmingDelete ? "z-50 ring-2 ring-red-400/40" : ""
      } ${pending && editing ? "opacity-60" : ""}`}
    >
      {/* TI-3: scrim behind the active inline confirm so the rest of the page
          dims and the row in question stands out. */}
      <AnimatePresence>
        {confirmingDelete && (
          <motion.div
            key="delete-scrim"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/40"
            style={{ pointerEvents: "none" }}
          />
        )}
      </AnimatePresence>
      <Avatar name={comment.display_name} url={comment.avatar_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <p className="text-sm font-medium text-white">
              {comment.display_name ?? "guest"}
            </p>
            <p className="scene-mono text-[0.55rem] uppercase tracking-[0.3em] text-white/55">
              {formatRelativeTime(comment.created_at)}
              {wasEdited && (
                <>
                  <span className="mx-1.5 text-white/25">·</span>
                  <span className="text-white/45">edited</span>
                </>
              )}
            </p>
          </div>
          {isOwn && !editing && (
            <div className="scene-mono flex items-center gap-3 text-[0.55rem] uppercase tracking-[0.3em]">
              {confirmingDelete ? (
                <>
                  <button
                    type="button"
                    onClick={cancelDelete}
                    disabled={pending}
                    className="text-white/55 transition-colors hover:text-white focus:text-white focus:outline-none disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={pending}
                    autoFocus
                    aria-label="Confirm delete comment"
                    className="rounded-full bg-red-500/85 px-2.5 py-1 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-colors hover:bg-red-500 focus:bg-red-500 focus:outline-none focus:ring-1 focus:ring-red-300/70 disabled:opacity-60"
                  >
                    {pending ? "Deleting…" : "Confirm delete"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={startEdit}
                    disabled={pending}
                    className="text-white/55 transition-colors hover:text-white focus:text-white focus:outline-none disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={requestDelete}
                    disabled={pending}
                    className="text-red-300/55 transition-colors hover:text-red-200 focus:text-red-200 focus:outline-none disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              ref={editRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              disabled={pending}
              autoComplete="off"
              rows={3}
              maxLength={1000}
              aria-label="Edit your comment"
              className="block w-full resize-y rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-base leading-snug text-white placeholder:text-white/30 transition-colors focus:border-[var(--scene-gold)]/55 focus:outline-none focus:ring-1 focus:ring-[var(--scene-gold)]/40"
            />
            <div className="flex flex-wrap items-center justify-end gap-2 scene-mono text-[0.65rem] uppercase tracking-[0.3em]">
              {error && (
                <span className="mr-auto text-red-300/85">{error}</span>
              )}
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="rounded-full px-3 py-1.5 text-white/55 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending || draft.trim().length === 0}
                className="rounded-full bg-[var(--scene-gold)] px-3.5 py-1.5 text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p
              className={`mt-1.5 max-w-prose whitespace-pre-wrap text-base leading-snug text-white/85 transition-opacity ${
                pending ? "opacity-60" : ""
              }`}
            >
              {comment.body}
            </p>
            {error && (
              <p className="scene-mono mt-2 text-[0.65rem] uppercase tracking-[0.3em] text-red-300/85">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </motion.li>
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
    return (
      <Image
        src={url}
        alt={name ?? "guest"}
        width={36}
        height={36}
        unoptimized
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
