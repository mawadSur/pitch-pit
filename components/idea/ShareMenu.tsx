"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Subset of fields needed to produce share copy. Pages render this menu
// with whatever's loaded — leaderboard rows have less detail than the
// idea reveal, so optional fields default sensibly.
export type ShareableIdea = {
  id: string;
  title: string;
  verdict: string;
  finalScore: number;
  aiScore?: number;
  voteCount?: number;
  strengths?: string[];
  concerns?: string[];
};

type ShareTarget =
  | "copy"
  | "twitter"
  | "linkedin"
  | "facebook"
  | "reddit"
  | "email"
  | "email-copy"
  | "native";

const X_INTENT = "https://x.com/intent/post";
const LINKEDIN_FEED = "https://www.linkedin.com/feed/";
const FACEBOOK_SHARE = "https://www.facebook.com/sharer/sharer.php";
const REDDIT_SUBMIT = "https://reddit.com/submit";

function buildAbsoluteUrl(ideaId: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/idea/${ideaId}`;
  }
  return `/idea/${ideaId}`;
}

function buildTwitterText(d: ShareableIdea): string {
  // Aim for ~210 chars of body — X auto-wraps URLs to ~23 chars via t.co.
  return `My pitch "${truncate(d.title, 60)}" scored ${d.finalScore}/100 on pitch-pit. Verdict: "${truncate(d.verdict, 100)}"`;
}

function buildLinkedInPost(d: ShareableIdea, url: string): string {
  const lines: string[] = [];
  lines.push("💡 I just got my startup idea rated by AI on pitch-pit.");
  lines.push("");
  lines.push(`Idea: ${d.title}`);
  lines.push("");
  lines.push(`"${d.verdict}"`);
  lines.push("");

  const stats: string[] = [];
  if (d.aiScore !== undefined) stats.push(`AI ${d.aiScore}/10`);
  stats.push(`Final ${d.finalScore}/100`);
  if (d.voteCount !== undefined) stats.push(`${d.voteCount} votes`);
  lines.push(stats.join(" · "));

  if (d.strengths && d.strengths.length > 0) {
    lines.push("");
    lines.push("What's strong:");
    for (const s of d.strengths.slice(0, 3)) lines.push(`→ ${s}`);
  }
  if (d.concerns && d.concerns.length > 0) {
    lines.push("");
    lines.push("What needs work:");
    for (const c of d.concerns.slice(0, 3)) lines.push(`→ ${c}`);
  }

  lines.push("");
  lines.push(
    "pitch-pit is a weekly idea contest — the top idea each week gets built as a free MVP. Vote on mine:",
  );
  lines.push("");
  lines.push(url);
  lines.push("");
  lines.push("#startups #buildinpublic #ideation");
  return lines.join("\n");
}

function buildEmailSubject(d: ShareableIdea): string {
  return `Vote on my pitch-pit submission: ${d.title}`;
}

function buildEmailBody(d: ShareableIdea, url: string): string {
  return [
    "Hey,",
    "",
    `I just submitted "${d.title}" to pitch-pit, a weekly idea contest where the winning idea each week gets built as a free MVP.`,
    "",
    `AI scored it ${d.finalScore}/100. Verdict: "${d.verdict}"`,
    "",
    "Mind taking a look and voting if you think it deserves it?",
    url,
    "",
  ].join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

export function ShareMenu({
  idea,
  variant = "primary",
  ariaLabel,
}: {
  idea: ShareableIdea;
  /** "primary" = full pill button. "icon" = compact icon-only for cards. */
  variant?: "primary" | "icon";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<ShareTarget | null>(null);
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Detect Web Share API on mount only — calling it on hydration would
  // mismatch SSR. Browsers without the API simply hide the option.
  useEffect(() => {
    setHasNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const url = buildAbsoluteUrl(idea.id);

  async function handle(target: ShareTarget) {
    setCopied(null);
    if (target === "copy") {
      await navigator.clipboard.writeText(url);
      setCopied("copy");
      window.setTimeout(() => setCopied(null), 1800);
      return;
    }

    if (target === "native") {
      try {
        await navigator.share({
          title: `pitch-pit · ${idea.title}`,
          text: `${truncate(idea.verdict, 140)} (${idea.finalScore}/100)`,
          url,
        });
        setOpen(false);
      } catch {
        // User dismissed the native sheet; do nothing.
      }
      return;
    }

    if (target === "twitter") {
      const tweetUrl = `${X_INTENT}?text=${encodeURIComponent(buildTwitterText(idea))}&url=${encodeURIComponent(url)}`;
      window.open(tweetUrl, "_blank", "noopener,noreferrer");
      setOpen(false);
      return;
    }

    if (target === "linkedin") {
      // LinkedIn doesn't accept pre-filled post text via URL params, so we
      // copy a formatted post to the clipboard, then open the LinkedIn feed
      // (compose). The user pastes and posts.
      const postText = buildLinkedInPost(idea, url);
      try {
        await navigator.clipboard.writeText(postText);
        setCopied("linkedin");
        window.setTimeout(() => setCopied(null), 2400);
      } catch {
        /* clipboard API unavailable — fall through and open LinkedIn anyway */
      }
      // Slight delay so the user notices the toast before the new tab steals focus
      window.setTimeout(() => {
        window.open(LINKEDIN_FEED, "_blank", "noopener,noreferrer");
      }, 600);
      // Also offer a fallback share-offsite URL with just the link, in case
      // the user prefers the lightweight share dialog over composing a post.
      // (Rendered as a separate menu item below.)
      return;
    }

    if (target === "facebook") {
      const fbUrl = `${FACEBOOK_SHARE}?u=${encodeURIComponent(url)}`;
      window.open(fbUrl, "_blank", "noopener,noreferrer");
      setOpen(false);
      return;
    }

    if (target === "reddit") {
      const redditUrl = `${REDDIT_SUBMIT}?url=${encodeURIComponent(url)}&title=${encodeURIComponent(`${idea.title} — scored ${idea.finalScore}/100 on pitch-pit`)}`;
      window.open(redditUrl, "_blank", "noopener,noreferrer");
      setOpen(false);
      return;
    }

    if (target === "email") {
      const mailto = `mailto:?subject=${encodeURIComponent(buildEmailSubject(idea))}&body=${encodeURIComponent(buildEmailBody(idea, url))}`;
      window.location.href = mailto;
      setOpen(false);
      return;
    }

    if (target === "email-copy") {
      // P-3: mobile-friendly alternative to mailto. Mailto: hijacks the
      // user into the system mail composer which on phones is jarring;
      // copying the subject + body lets the user paste into whatever
      // surface they actually want (Slack, Notes, Gmail web, etc.).
      const text = `${buildEmailSubject(idea)}\n\n${buildEmailBody(idea, url)}`;
      try {
        await navigator.clipboard.writeText(text);
        setCopied("email-copy");
        window.setTimeout(() => setCopied(null), 1800);
      } catch {
        /* clipboard unavailable — fall back to mailto */
        const mailto = `mailto:?subject=${encodeURIComponent(buildEmailSubject(idea))}&body=${encodeURIComponent(buildEmailBody(idea, url))}`;
        window.location.href = mailto;
        setOpen(false);
      }
      return;
    }
  }

  // ─── shared menu items (rendered inside both desktop dropdown + mobile sheet) ──
  const menuItems = (
    <>
      {hasNativeShare && (
        <MenuItem
          onClick={() => handle("native")}
          icon={<NativeShareIcon />}
          label="Share…"
          hint="System share sheet"
        />
      )}
      <MenuItem
        onClick={() => handle("copy")}
        icon={<LinkIcon />}
        label={copied === "copy" ? "Copied!" : "Copy link"}
        hint={copied === "copy" ? undefined : "URL to this idea"}
        accent={copied === "copy"}
      />
      <Divider />
      <MenuItem
        onClick={() => handle("twitter")}
        icon={<XIcon />}
        label="Share on X"
        hint="Pre-filled tweet"
        brand
      />
      <MenuItem
        onClick={() => handle("linkedin")}
        icon={<LinkedInIcon />}
        label={copied === "linkedin" ? "Post copied — open LinkedIn" : "Share on LinkedIn"}
        hint={
          copied === "linkedin"
            ? "Paste in LinkedIn compose"
            : "Copies a formatted post"
        }
        accent={copied === "linkedin"}
        brand
      />
      <MenuItem
        onClick={() => handle("facebook")}
        icon={<FacebookIcon />}
        label="Share on Facebook"
        brand
      />
      <MenuItem
        onClick={() => handle("reddit")}
        icon={<RedditIcon />}
        label="Share on Reddit"
        brand
      />
      <Divider />
      <MenuItem
        onClick={() => handle("email")}
        icon={<EmailIcon />}
        label="Open in mail app"
        hint="Pre-filled mailto"
      />
      <MenuItem
        onClick={() => handle("email-copy")}
        icon={<LinkIcon />}
        label={copied === "email-copy" ? "Copied!" : "Copy email content"}
        hint={
          copied === "email-copy"
            ? undefined
            : "Subject + body to clipboard"
        }
        accent={copied === "email-copy"}
      />
    </>
  );

  // ─── trigger ──────────────────────────────────────────────────
  const triggerClass =
    variant === "primary"
      ? "scene-mono inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-white/70 transition-colors hover:border-[var(--scene-gold)]/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--scene-bg)]"
      : "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] text-white/70 transition-colors hover:border-[var(--scene-gold)]/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--scene-bg)]";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel ?? "Share this idea"}
        className={triggerClass}
      >
        <ShareIcon />
        {variant === "primary" && (
          <>
            Share
            <span aria-hidden>↗</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Desktop dropdown: anchored to trigger, unchanged */}
            <motion.div
              role="menu"
              aria-label="Share options"
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute right-0 z-30 mt-3 hidden w-72 overflow-hidden rounded-xl border border-white/12 bg-[#0e0e10]/95 shadow-[0_24px_72px_-24px_rgba(0,0,0,0.85)] backdrop-blur-md sm:block"
            >
              {menuItems}
            </motion.div>

            {/* Mobile bottom sheet: full-width, slides up from bottom */}
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={() => setOpen(false)}
              aria-hidden
              className="fixed inset-0 z-40 bg-black/60 sm:hidden"
            />
            <motion.div
              key="sheet"
              role="menu"
              aria-label="Share options"
              aria-modal="true"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
              className="fixed inset-x-0 bottom-0 z-50 overflow-hidden rounded-t-2xl border-t border-white/12 bg-[#0e0e10]/95 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_72px_-24px_rgba(0,0,0,0.85)] backdrop-blur-md sm:hidden"
            >
              <div
                aria-hidden
                className="mx-auto mt-3 mb-2 h-1 w-12 rounded-full bg-white/20"
              />
              {menuItems}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
  hint,
  accent = false,
  brand = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  accent?: boolean;
  /**
   * Style-4: brand glyphs (X/LinkedIn/Facebook/Reddit) keep their filled
   * trademark form, but get a subtle solid badge so the visual mix between
   * filled brand marks and outlined utility icons reads as intentional.
   * Utility icons (Native, Email, Link) keep the bordered transparent badge.
   */
  brand?: boolean;
}) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.05] focus-visible:outline-none ${accent ? "bg-[var(--scene-gold)]/10" : ""}`}
    >
      <span
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border ${
          accent
            ? "border-[var(--scene-gold)]/55 text-[var(--scene-gold-bright)]"
            : brand
              ? "border-white/[0.04] bg-white/[0.04] text-white/85"
              : "border-white/12 text-white/70"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-medium ${accent ? "text-[var(--scene-gold-bright)]" : "text-white"}`}
        >
          {label}
        </span>
        {hint && (
          <span className="scene-mono mt-0.5 block truncate text-[0.55rem] uppercase tracking-[0.3em] text-white/45">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

function Divider() {
  return <div aria-hidden className="my-1 h-px bg-white/6" />;
}

/* ─── icons (inline SVG, no external deps) ───────────────────────────── */

function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M8 1.5v8.5M8 1.5 5 4.5M8 1.5l3 3M3 8v5.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NativeShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="3" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="13" cy="12.5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="m4.7 6.9 6.6-3.2M4.7 9.1l6.6 3.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9 5h2.5a2.5 2.5 0 0 1 0 5H9M7 11H4.5a2.5 2.5 0 0 1 0-5H7M5.5 8h5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.65l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.064A2.062 2.062 0 1 1 5.337 7.433zM7.119 20.452H3.553V9h3.566v11.452z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.47h-2.796v8.385C19.612 22.954 24 17.99 24 12z" />
    </svg>
  );
}

function RedditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="m2.5 4.5 5.5 4 5.5-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
