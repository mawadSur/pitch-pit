"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { VoteButton } from "@/components/idea/VoteButton";
import { ShareMenu, type ShareableIdea } from "@/components/idea/ShareMenu";
import { EmailCapture } from "@/components/idea/EmailCapture";
import { titleToSlug } from "@/lib/slug";

// Recruiting surface for the idea page. Two pieces live here so Reveal.tsx
// stays focused on the verdict layout:
//
//   <VoteShareZone> — VoteButton + ShareMenu, plus a post-vote share nudge
//     and the subordinate email capture. Always rendered.
//   <RallyCard>     — owner-only, open-week-only. Fetches the private rally
//     snapshot and shows rank / votes-to-podium / referral tally + share CTA.

// Wraps the VoteButton + ShareMenu and hangs two recruiting affordances off
// them: a tasteful "share your verdict" nudge that appears the moment the
// viewer's vote toggles ON, plus the subordinate email capture below.
//
// VoteButton owns its own vote state and exposes no callback, so we detect
// the toggle-on transition by observing its aria-pressed attribute (false →
// true) via a MutationObserver scoped to this block. Non-invasive — no edit
// to VoteButton — and it naturally ignores the closed-week + signed-out
// surfaces, which render without an aria-pressed button at all.
export function VoteShareZone({
  ideaId,
  weekStatus,
  shareIdea,
}: {
  ideaId: string;
  weekStatus: "open" | "closed" | "built";
  shareIdea: ShareableIdea;
}) {
  // Callback-ref via useState so the observer effect re-runs once the DOM
  // node mounts (a plain useRef wouldn't retrigger the effect).
  const [zoneEl, setZoneEl] = useState<HTMLDivElement | null>(null);
  const [justVoted, setJustVoted] = useState(false);

  useEffect(() => {
    if (!zoneEl) return;
    const btn = zoneEl.querySelector<HTMLButtonElement>("button[aria-pressed]");
    if (!btn) return;
    let prev = btn.getAttribute("aria-pressed") === "true";
    const observer = new MutationObserver(() => {
      const now = btn.getAttribute("aria-pressed") === "true";
      // Fire only on the false → true edge (a fresh token cast). Retracting
      // a vote (true → false) shouldn't pop the share prompt.
      if (now && !prev) setJustVoted(true);
      prev = now;
    });
    observer.observe(btn, {
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });
    return () => observer.disconnect();
  }, [zoneEl]);

  return (
    <div ref={setZoneEl}>
      <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
        <VoteButton ideaId={ideaId} weekStatus={weekStatus} />
        <ShareMenu idea={shareIdea} variant="primary" />
      </div>

      {/* post-vote share nudge — surfaces once, right after the token lands.
          Dismissible; opening any share target is up to the ShareMenu above,
          so this just points the eye back to it. */}
      <AnimatePresence>
        {justVoted && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="scene-card-gold mt-4 flex flex-wrap items-center justify-center gap-3 px-5 py-3.5 text-center lg:justify-start lg:text-left"
          >
            <p className="flex-1 text-sm text-white/85">
              Token cast. A pitch lives or dies by its voters &mdash; share the
              verdict to rally a few more.
            </p>
            <div className="flex items-center gap-2">
              <ShareMenu
                idea={shareIdea}
                variant="primary"
                ariaLabel="Share this verdict"
              />
              <button
                type="button"
                onClick={() => setJustVoted(false)}
                aria-label="Dismiss share prompt"
                className="scene-mono text-[0.6rem] uppercase tracking-[0.3em] text-white/45 transition-colors hover:text-white/80"
              >
                Later
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* email capture — visually subordinate to the vote CTA above. Pulls
          drive-by readers into the weekly loop even if they don't vote. */}
      <EmailCapture source="idea-page" className="mt-6 max-w-md" />
    </div>
  );
}

// Owner-only recruiting card. Fetches the private rally snapshot
// (GET /api/idea/[id]/rally) and shows rank, the votes-to-podium gap, the
// referral tally, and a prominent share CTA. Best-effort: any fetch failure
// (403, network, missing route) hides the card entirely rather than
// rendering a broken shell.
export function RallyCard({
  ideaId,
  ideaTitle,
  shareIdea,
}: {
  ideaId: string;
  ideaTitle: string;
  // Full shareable payload so the rally card's ShareMenu produces the same
  // rich copy (verdict + score) as the primary one above — not a bare link.
  shareIdea: ShareableIdea;
}) {
  const [data, setData] = useState<{
    rank: number | null;
    votesToTop3: number;
    recruitedCount: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/idea/${ideaId}/rally`)
      .then((r) => {
        if (!r.ok) throw new Error("rally fetch failed");
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData({
          rank: typeof json.rank === "number" ? json.rank : null,
          votesToTop3:
            typeof json.votesToTop3 === "number" ? json.votesToTop3 : 0,
          recruitedCount:
            typeof json.recruitedCount === "number" ? json.recruitedCount : 0,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ideaId]);

  // Hide cleanly on error, or until data arrives.
  if (failed || !data) return null;

  const slug = titleToSlug(ideaTitle);
  const ideaPath = slug ? `/idea/${ideaId}/${slug}` : `/idea/${ideaId}`;
  const onPodium = data.rank !== null && data.rank <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="scene-card-gold mt-8 px-6 py-6"
    >
      <p className="scene-mono text-[0.6rem] uppercase tracking-[0.32em] text-[var(--scene-gold-bright)]">
        Rally your voters
      </p>

      {/* stat row — rank · votes to podium · recruited */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <RallyStat
          value={data.rank === null ? "—" : `#${data.rank}`}
          label="this week"
        />
        <RallyStat
          value={onPodium ? "Top 3" : `+${data.votesToTop3}`}
          label={onPodium ? "on the podium" : "votes to top 3"}
          accent={onPodium}
        />
        <RallyStat
          value={data.recruitedCount.toLocaleString("en-US")}
          label="you recruited"
        />
      </div>

      <p className="mt-5 text-sm leading-relaxed text-white/78">
        {onPodium
          ? "You're on the podium — keep the lead. Every share is a vote you didn't have to chase yourself."
          : data.votesToTop3 > 0
            ? `Roughly ${data.votesToTop3} more ${data.votesToTop3 === 1 ? "vote" : "votes"} cracks the top 3. Share your link and pull them in.`
            : "Share your link and pull your people in — the top combined score wins a free build."}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ShareMenu
          idea={shareIdea}
          variant="primary"
          ariaLabel="Share your pitch to rally voters"
        />
        <CopyLinkButton path={ideaPath} />
      </div>
    </motion.div>
  );
}

function RallyStat({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="text-center">
      <p
        className={`scene-numeral text-2xl tabular-nums sm:text-3xl ${
          accent ? "text-[var(--scene-gold-bright)]" : "text-white"
        }`}
      >
        {value}
      </p>
      <p className="scene-mono mt-1.5 text-[0.55rem] uppercase tracking-[0.24em] text-white/45">
        {label}
      </p>
    </div>
  );
}

// Standalone copy-link affordance for the rally card — distinct from the
// ShareMenu so the owner has a one-tap "grab my link" without opening the
// full share sheet. Builds the absolute URL client-side from the path.
function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable (insecure context / denied) — no-op; the
      // ShareMenu copy-link path is still available as a fallback.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="scene-mono inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-[0.6rem] uppercase tracking-[0.3em] text-white/70 transition-colors hover:border-[var(--scene-gold)]/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scene-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
